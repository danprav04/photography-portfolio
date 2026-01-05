import os
import re
import hashlib
import time
import json
import io
import mimetypes
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, render_template, jsonify, request, make_response, send_from_directory, url_for, Response
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config
from PIL import Image, ExifTags, ImageFile

# Allow Pillow to handle truncated images (essential for Range-based metadata extraction)
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Initialize mimetypes to ensure we can guess correctly
mimetypes.init()

s3_client = None

# --- Cache Configuration ---
CACHE_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
THUMBNAIL_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'thumbnails')
API_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'api')
# Version 2 cache file to ensure width/height metadata is rebuilt
API_CACHE_FILE = os.path.join(API_CACHE_DIR, 'gallery_cache_v2.json')

# Cache expires every 24 hours.
CACHE_EXPIRATION_SECONDS = 86400 

THUMBNAIL_MAX_WIDTH = 400
EXIF_DATETIME_ORIGINAL = 36867
EXIF_ORIENTATION = 274

def _get_date_from_filename(object_key):
    """
    Attempts to parse a date from the filename using common patterns.
    """
    # Pattern 1: YYYYMMDD_HHMMSS (e.g. 20251215_120900)
    match_full = re.search(r'(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})', object_key)
    if match_full:
        try:
            return datetime(*map(int, match_full.groups()))
        except ValueError:
            pass

    # Pattern 2: YYYY-MM-DD (e.g. 2025-12-15)
    match_date = re.search(r'((?:20|19)\d{2})[-_]?(\d{2})[-_]?(\d{2})', object_key)
    if match_date:
        try:
            return datetime(int(match_date.group(1)), int(match_date.group(2)), int(match_date.group(3)))
        except ValueError:
            pass
            
    return None

def _extract_image_metadata(bucket_name, key):
    """
    Downloads the START of the image into memory to extract Dimensions and DateTimeOriginal.
    Optimized to use Range header to avoid downloading full files.
    """
    meta = {'date': None, 'width': None, 'height': None}
    try:
        # OPTIMIZATION: Download only the first 2MB. 
        # This is usually enough for Header + EXIF data.
        # This prevents Memory Exhaustion on the server.
        response = s3_client.get_object(
            Bucket=bucket_name, 
            Key=key, 
            Range='bytes=0-2097152' # 2MB
        )
        image_data = response['Body'].read()
        
        with Image.open(io.BytesIO(image_data)) as img:
            # Get raw dimensions
            width, height = img.size
            meta['width'] = width
            meta['height'] = height

            exif_data = img._getexif()
            if exif_data:
                # Extract Date
                date_str = exif_data.get(EXIF_DATETIME_ORIGINAL)
                if date_str:
                    try:
                        # Standard EXIF format: "YYYY:MM:DD HH:MM:SS"
                        meta['date'] = datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
                    except ValueError:
                        pass
                
                # Extract Orientation and swap dimensions if needed
                orientation = exif_data.get(EXIF_ORIENTATION)
                # 6 = Rotate 90 CW, 8 = Rotate 270 CW
                if orientation in (6, 8):
                    meta['width'], meta['height'] = height, width

    except Exception:
        # Silently fail on non-images or corrupt metadata
        pass
    return meta

def process_single_object(obj, bucket_name):
    """
    Worker function to determine the sort date and dimensions for a single S3 object.
    Priority: EXIF > Filename Regex > S3 LastModified.
    """
    key = obj['Key']
    
    # 1. Try to get metadata (Dimensions + EXIF Date)
    meta = _extract_image_metadata(bucket_name, key)
    
    date_obj = meta['date']
    
    # 2. Try Filename (Fast fallback for date)
    if not date_obj:
        date_obj = _get_date_from_filename(key)
        
    # 3. Fallback to Upload Date (S3 LastModified)
    if not date_obj:
        date_obj = obj['LastModified']

    # Normalize to string for JSON serialization
    return {
        'Key': key,
        'LastModified': obj['LastModified'].isoformat(),
        'sort_date': date_obj.isoformat(),
        'width': meta['width'],
        'height': meta['height']
    }

def get_presigned_url_params(bucket, key):
    """
    Helper to generate the correct parameters for a presigned URL.
    Forces correct Content-Type, Content-Disposition, and Caching headers.
    """
    # Guess mime type based on file extension
    mime_type, _ = mimetypes.guess_type(key)
    if not mime_type:
        # Fallback defaults
        if key.lower().endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif key.lower().endswith('.png'):
            mime_type = 'image/png'
        else:
            mime_type = 'application/octet-stream'
            
    return {
        'Bucket': bucket,
        'Key': key,
        'ResponseContentType': mime_type,
        'ResponseContentDisposition': 'inline',
        # Allow browser caching for 15 minutes (900 seconds)
        'ResponseCacheControl': 'public, max-age=900'
    }

def create_app():
    """Application factory function."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Ensure all required cache directories exist
    os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)
    os.makedirs(API_CACHE_DIR, exist_ok=True)

    global s3_client
    s3_client = boto3.client(
        's3',
        endpoint_url=app.config['OCI_ENDPOINT_URL'],
        aws_access_key_id=app.config['OCI_ACCESS_KEY_ID'],
        aws_secret_access_key=app.config['OCI_SECRET_ACCESS_KEY'],
        config=BotocoreConfig(signature_version='s3v4'),
        region_name=app.config['OCI_REGION']
    )
    
    @app.route('/')
    def index():
        """Render the main portfolio page."""
        content = {
            'title': app.config['PORTFOLIO_TITLE'],
            'meta_description': app.config['PORTFOLIO_META_DESCRIPTION'],
            'about_heading': app.config['PORTFOLIO_ABOUT_HEADING'],
            'about_content': app.config['PORTFOLIO_ABOUT_CONTENT'],
            'contact_heading': app.config['PORTFOLIO_CONTACT_HEADING'],
            'contact_email': app.config['PORTFOLIO_CONTACT_EMAIL'],
            'instagram_url': app.config['PORTFOLIO_INSTAGRAM_URL'],
            'footer_text': app.config['PORTFOLIO_FOOTER_TEXT'],
            'amazon_tag': app.config['AMAZON_TAG'],
            'disclaimer_text': app.config['PORTFOLIO_DISCLAIMER_TEXT'],
            'stock_heading': app.config['STOCK_HEADING'],
            'stock_shutterstock': app.config['STOCK_URL_SHUTTERSTOCK'],
            'stock_dreamstime': app.config['STOCK_URL_DREAMSTIME'],
            'stock_adobe': app.config['STOCK_URL_ADOBE']
        }
        return render_template('index.html', content=content)

    @app.route('/api/proxy/<path:object_key>')
    def proxy_photo(object_key):
        """
        Proxies the image through the server to bypass client-side SSL/Network issues.
        Used as a fallback when direct OCI links fail.
        """
        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            # Stream the object from S3 to avoid loading large files into RAM
            s3_response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
            
            def generate():
                for chunk in s3_response['Body'].iter_chunks(chunk_size=4096):
                    yield chunk

            response = Response(generate(), mimetype=s3_response['ContentType'])
            response.headers['Content-Length'] = s3_response['ContentLength']
            
            # Allow caching for 15 minutes (900 seconds)
            response.headers['Cache-Control'] = 'public, max-age=900'
            
            return response
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == '404':
                return "Photo not found", 404
            print(f"Proxy ClientError: {e}")
            return "Error fetching image", 500
        except Exception as e:
            print(f"Proxy Unexpected Error: {e}")
            return "Internal server error", 500

    @app.route('/api/photo/<path:object_key>')
    def get_single_photo(object_key):
        """API endpoint to retrieve a presigned URL for a single specific photo."""
        try:
            # Check existence first
            s3_client.head_object(Bucket=app.config['OCI_BUCKET_NAME'], Key=object_key)
            
            # Generate new signed URL with explicit content type and cache control
            params = get_presigned_url_params(app.config['OCI_BUCKET_NAME'], object_key)
            
            full_url = s3_client.generate_presigned_url(
                'get_object',
                Params=params,
                ExpiresIn=3600
            )
            
            response = jsonify({
                'key': object_key,
                'full_url': full_url,
                'thumbnail_url': url_for('get_thumbnail', object_key=object_key, _external=False)
            })
            
            # LINKS/JSON should NOT be cached, so we always get a valid link.
            # The actual image (full_url) *will* be cached by the browser based on ResponseCacheControl above.
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            
            return response

        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == '404':
                return jsonify({'error': 'Photo not found'}), 404
            return jsonify({"error": "Could not retrieve photo."}), 500
        except Exception:
            return jsonify({"error": "Internal server error."}), 500

    @app.route('/api/photos', methods=['GET', 'HEAD'])
    def get_photos():
        """API endpoint to retrieve sorted photo data."""
        try:
            # 1. Handle SERVER-SIDE Metadata Caching
            cache_is_valid = False
            if os.path.exists(API_CACHE_FILE):
                modification_time = os.path.getmtime(API_CACHE_FILE)
                if (time.time() - modification_time) < CACHE_EXPIRATION_SECONDS:
                    cache_is_valid = True
            
            if cache_is_valid:
                with open(API_CACHE_FILE, 'r') as f:
                    cached_data = json.load(f)
                sorted_objects = cached_data['objects']
            else:
                print("Cache expired or missing. Building photo list...")
                bucket_name = app.config['OCI_BUCKET_NAME']
                paginator = s3_client.get_paginator('list_objects_v2')
                pages = paginator.paginate(Bucket=bucket_name)
                
                raw_objects = []
                for page in pages:
                    if "Contents" in page:
                        raw_objects.extend(page['Contents'])
                
                processed_objects = []
                
                # OPTIMIZATION: Reduced max_workers from 20 to 4.
                # Since we are running on a single worker process now,
                # too many threads will cause context switching overhead and memory spikes.
                with ThreadPoolExecutor(max_workers=4) as executor:
                    future_to_obj = {
                        executor.submit(process_single_object, obj, bucket_name): obj 
                        for obj in raw_objects
                    }
                    for future in as_completed(future_to_obj):
                        try:
                            processed_objects.append(future.result())
                        except Exception as e:
                            print(f"Error processing object: {e}")

                sorted_objects = sorted(
                    processed_objects, 
                    key=lambda x: x['sort_date'], 
                    reverse=True
                )

                # Save metadata to cache
                temp_file_path = API_CACHE_FILE + f".tmp-{os.getpid()}"
                with open(temp_file_path, 'w') as f:
                    json.dump({'objects': sorted_objects}, f)
                
                if os.path.exists(API_CACHE_FILE):
                    os.remove(API_CACHE_FILE)
                os.rename(temp_file_path, API_CACHE_FILE)

            # 2. Generate Fresh Response for Client
            photo_data = []
            for obj in sorted_objects:
                key = obj['Key']
                params = get_presigned_url_params(app.config['OCI_BUCKET_NAME'], key)
                
                photo_data.append({
                    'key': key,
                    'full_url': s3_client.generate_presigned_url(
                        'get_object', 
                        Params=params, 
                        ExpiresIn=3600
                    ),
                    'thumbnail_url': url_for('get_thumbnail', object_key=key, _external=False),
                    'width': obj.get('width'),
                    'height': obj.get('height')
                })
            
            response = make_response(jsonify(photo_data))
            
            # LINKS/JSON should NOT be cached.
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            
            return response
            
        except Exception as e:
            print(f"Error: {e}")
            return jsonify({"error": "Internal server error."}), 500

    @app.route('/api/thumbnail/<path:object_key>')
    def get_thumbnail(object_key):
        """Generates and serves a cached thumbnail."""
        sanitized_key = re.sub(r'[^a-zA-Z0-9_.-]', '_', object_key)
        thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, sanitized_key)

        if os.path.exists(thumbnail_path):
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
            image_data = response['Body'].read()
            
            with Image.open(io.BytesIO(image_data)) as img:
                if hasattr(img, '_getexif'):
                    exif = img._getexif()
                    if exif:
                        orientation = exif.get(EXIF_ORIENTATION)
                        if orientation == 3: img = img.rotate(180, expand=True)
                        elif orientation == 6: img = img.rotate(270, expand=True)
                        elif orientation == 8: img = img.rotate(90, expand=True)

                img.thumbnail((THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_WIDTH * 10))
                
                data = list(img.getdata())
                image_without_exif = Image.new(img.mode, img.size)
                image_without_exif.putdata(data)
                
                image_without_exif.save(thumbnail_path, "JPEG", quality=85, optimize=True)
            
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        except Exception as e:
            print(f"Error processing image {object_key}: {e}")
            return "Error processing image", 500

    return app