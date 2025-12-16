import os
import re
import hashlib
import time
import json
import io
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, render_template, jsonify, request, make_response, send_from_directory, url_for
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config
from PIL import Image, ExifTags

s3_client = None

# --- Cache Configuration ---
CACHE_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
THUMBNAIL_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'thumbnails')
API_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'api')
API_CACHE_FILE = os.path.join(API_CACHE_DIR, 'gallery_cache.json')

# Cache expires every 24 hours because EXIF extraction is network/CPU intensive.
# Manually delete cache/api/gallery_cache.json to force a refresh sooner.
CACHE_EXPIRATION_SECONDS = 86400 

THUMBNAIL_MAX_WIDTH = 400
EXIF_DATETIME_ORIGINAL = 36867

def _calculate_gallery_etag(objects):
    """
    Calculates a collective ETag for a list of S3 objects.
    Uses the sorted date and key to ensure consistency.
    """
    if not objects:
        return None
    
    # Use the calculated sort_date in the hash to detect order changes
    data_string = "".join([f"{obj['Key']}-{obj.get('sort_date', '')}" for obj in objects])
    
    # Add a time-based salt (changes every 30 mins) to refresh presigned URLs
    time_salt = str(int(time.time() // 1800))
    
    combined_hash_input = f"{data_string}-{time_salt}"
    return f'"{hashlib.sha256(combined_hash_input.encode("utf-8")).hexdigest()}"'

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

def _extract_exif_date(bucket_name, key):
    """
    Downloads the image into memory and extracts the DateTimeOriginal EXIF tag.
    Returns None if extraction fails or tag is missing.
    """
    try:
        # Download image to memory (avoid disk I/O)
        response = s3_client.get_object(Bucket=bucket_name, Key=key)
        image_data = response['Body'].read()
        
        with Image.open(io.BytesIO(image_data)) as img:
            exif_data = img._getexif()
            if exif_data:
                date_str = exif_data.get(EXIF_DATETIME_ORIGINAL)
                if date_str:
                    # Standard EXIF format: "YYYY:MM:DD HH:MM:SS"
                    return datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
    except Exception:
        # Silently fail on non-images or corrupt metadata
        pass
    return None

def process_single_object(obj, bucket_name):
    """
    Worker function to determine the sort date for a single S3 object.
    Priority: EXIF > Filename Regex > S3 LastModified.
    """
    key = obj['Key']
    
    # 1. Try EXIF (Most accurate, but requires download)
    # We do this first because filenames like "10.jpg" are unreliable.
    date_obj = _extract_exif_date(bucket_name, key)
    
    # 2. Try Filename (Fast fallback)
    if not date_obj:
        date_obj = _get_date_from_filename(key)
        
    # 3. Fallback to Upload Date (S3 LastModified)
    if not date_obj:
        date_obj = obj['LastModified']

    # Normalize to string for JSON serialization
    return {
        'Key': key,
        'LastModified': obj['LastModified'].isoformat(),
        'sort_date': date_obj.isoformat()
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
            'footer_text': app.config['PORTFOLIO_FOOTER_TEXT'],
            'amazon_tag': app.config['AMAZON_TAG'],
            'disclaimer_text': app.config['PORTFOLIO_DISCLAIMER_TEXT']
        }
        return render_template('index.html', content=content)

    @app.route('/api/photos', methods=['GET', 'HEAD'])
    def get_photos():
        """
        API endpoint to retrieve sorted photo data.
        """
        try:
            cache_is_valid = False
            if os.path.exists(API_CACHE_FILE):
                modification_time = os.path.getmtime(API_CACHE_FILE)
                if (time.time() - modification_time) < CACHE_EXPIRATION_SECONDS:
                    cache_is_valid = True
            
            if cache_is_valid:
                # --- FAST PATH: Read from Cache ---
                with open(API_CACHE_FILE, 'r') as f:
                    cached_data = json.load(f)
                sorted_objects = cached_data['objects']
                current_etag = _calculate_gallery_etag(sorted_objects)
            else:
                # --- SLOW PATH: Build Cache ---
                print("Cache expired or missing. building photo list (this may take time)...")
                bucket_name = app.config['OCI_BUCKET_NAME']
                
                # 1. List all objects
                paginator = s3_client.get_paginator('list_objects_v2')
                pages = paginator.paginate(Bucket=bucket_name)
                
                raw_objects = []
                for page in pages:
                    if "Contents" in page:
                        raw_objects.extend(page['Contents'])
                
                processed_objects = []
                
                # 2. Process objects in parallel
                # We use a thread pool to download multiple images concurrently for EXIF extraction.
                # 20 workers balances speed with memory usage.
                with ThreadPoolExecutor(max_workers=20) as executor:
                    future_to_obj = {
                        executor.submit(process_single_object, obj, bucket_name): obj 
                        for obj in raw_objects
                    }
                    
                    for future in as_completed(future_to_obj):
                        try:
                            result = future.result()
                            processed_objects.append(result)
                        except Exception as e:
                            print(f"Error processing object: {e}")

                # 3. Sort Descending (Newest First) based on derived sort_date
                sorted_objects = sorted(
                    processed_objects, 
                    key=lambda x: x['sort_date'], 
                    reverse=True
                )

                # 4. Save to Cache
                # We write to a temp file then rename for atomic write
                temp_file_path = API_CACHE_FILE + f".tmp-{os.getpid()}"
                with open(temp_file_path, 'w') as f:
                    json.dump({'objects': sorted_objects}, f)
                
                if os.path.exists(API_CACHE_FILE):
                    os.remove(API_CACHE_FILE)
                os.rename(temp_file_path, API_CACHE_FILE)
                
                current_etag = _calculate_gallery_etag(sorted_objects)
                print(f"Cache rebuilt successfully with {len(sorted_objects)} photos.")

            if not current_etag:
                return jsonify([])

            # Client Cache Validation (304 Not Modified)
            if_none_match = request.headers.get('If-None-Match')
            if if_none_match and if_none_match == current_etag:
                return make_response(), 304

            if request.method == 'HEAD':
                response = make_response()
                response.headers['ETag'] = current_etag
                response.headers['Cache-Control'] = f'public, max-age={CACHE_EXPIRATION_SECONDS}'
                return response

            # Generate Presigned URLs
            # These are generated fresh on every request because they expire (default 1h)
            photo_data = []
            for obj in sorted_objects:
                key = obj['Key']
                photo_data.append({
                    'key': key,
                    'full_url': s3_client.generate_presigned_url(
                        'get_object', 
                        Params={'Bucket': app.config['OCI_BUCKET_NAME'], 'Key': key}, 
                        ExpiresIn=3600
                    ),
                    'thumbnail_url': url_for('get_thumbnail', object_key=key, _external=False)
                })
            
            response = make_response(jsonify(photo_data))
            response.headers['ETag'] = current_etag
            response.headers['Cache-Control'] = f'public, max-age={CACHE_EXPIRATION_SECONDS}'
            return response
            
        except ClientError as e:
            print(f"S3 Client Error: {e}")
            return jsonify({"error": "Could not retrieve photos."}), 500
        except Exception as e:
            print(f"Unexpected Error: {e}")
            return jsonify({"error": "Internal server error."}), 500

    @app.route('/api/thumbnail/<path:object_key>')
    def get_thumbnail(object_key):
        """
        Generates and serves a cached thumbnail for a given S3 object key.
        """
        sanitized_key = re.sub(r'[^a-zA-Z0-9_.-]', '_', object_key)
        thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, sanitized_key)

        if os.path.exists(thumbnail_path):
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            
            # Download image to memory
            response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
            image_data = response['Body'].read()
            
            with Image.open(io.BytesIO(image_data)) as img:
                # Fix orientation based on EXIF
                if hasattr(img, '_getexif'):
                    exif = img._getexif()
                    if exif:
                        orientation = exif.get(0x0112)
                        if orientation == 3:
                            img = img.rotate(180, expand=True)
                        elif orientation == 6:
                            img = img.rotate(270, expand=True)
                        elif orientation == 8:
                            img = img.rotate(90, expand=True)

                # Resize
                img.thumbnail((THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_WIDTH * 10))
                
                # Save optimized JPEG
                # Strip metadata (exif) by creating new image
                data = list(img.getdata())
                image_without_exif = Image.new(img.mode, img.size)
                image_without_exif.putdata(data)
                
                image_without_exif.save(thumbnail_path, "JPEG", quality=85, optimize=True)
            
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        except ClientError as e:
            print(f"Error downloading {object_key} for thumbnail: {e}")
            return "Error generating thumbnail", 500
        except Exception as e:
            print(f"Error processing image {object_key}: {e}")
            return "Error processing image", 500

    return app