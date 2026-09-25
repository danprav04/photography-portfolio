import os
import re
import hashlib
import time
import json
import io
import mimetypes
import threading
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
_cache_lock = threading.Lock()

# --- Cache Configuration ---
CACHE_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
THUMBNAIL_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'thumbnails')
API_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'api')
# Version 2 cache file to ensure width/height metadata is rebuilt
API_CACHE_FILE = os.path.join(API_CACHE_DIR, 'gallery_cache_v2.json')
LEGACY_API_CACHE_FILE = os.path.join(API_CACHE_DIR, 'gallery_cache.json')

# Cache expires every 24 hours.
CACHE_EXPIRATION_SECONDS = 86400 

INITIAL_RANGE_BYTES = 524288  # 512KB is sufficient for >99% of photo headers
FALLBACK_RANGE_BYTES = 2097152  # 2MB fallback for unusually large APP markers

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
    Optimized to use Range header with a 512KB initial fetch and 2MB fallback.
    """
    meta = {'date': None, 'width': None, 'height': None}

    def _parse_bytes(raw_bytes):
        with Image.open(io.BytesIO(raw_bytes)) as img:
            w, h = img.size
            d = None
            exif_data = img._getexif() if hasattr(img, '_getexif') else None
            if exif_data:
                date_str = exif_data.get(EXIF_DATETIME_ORIGINAL)
                if date_str:
                    try:
                        d = datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
                    except ValueError:
                        pass
                
                orientation = exif_data.get(EXIF_ORIENTATION)
                if orientation in (6, 8):
                    w, h = h, w
            return {'date': d, 'width': w, 'height': h}

    try:
        # Step 1: Attempt fast 512KB fetch
        try:
            response = s3_client.get_object(
                Bucket=bucket_name, 
                Key=key, 
                Range=f'bytes=0-{INITIAL_RANGE_BYTES - 1}'
            )
            image_data = response['Body'].read()
            parsed = _parse_bytes(image_data)
            if parsed['width'] and parsed['height']:
                return parsed
        except Exception:
            pass

        # Step 2: Fallback to 2MB fetch for large APP headers
        try:
            response = s3_client.get_object(
                Bucket=bucket_name, 
                Key=key, 
                Range=f'bytes=0-{FALLBACK_RANGE_BYTES - 1}'
            )
            image_data = response['Body'].read()
            parsed = _parse_bytes(image_data)
            if parsed['width'] and parsed['height']:
                return parsed
        except Exception:
            pass

    except Exception:
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
    sort_date_str = date_obj.isoformat() if isinstance(date_obj, datetime) else str(date_obj)
    last_mod_str = obj['LastModified'].isoformat() if isinstance(obj['LastModified'], datetime) else str(obj['LastModified'])

    return {
        'Key': key,
        'LastModified': last_mod_str,
        'sort_date': sort_date_str,
        'width': meta['width'],
        'height': meta['height']
    }

def _load_existing_cache_map():
    """
    Loads existing cached metadata mapped by Key.
    Reads v2 cache first, then checks legacy v1 cache if needed.
    """
    cache_map = {}
    for path in (API_CACHE_FILE, LEGACY_API_CACHE_FILE):
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                    for item in data.get('objects', []):
                        if isinstance(item, dict) and 'Key' in item:
                            if item['Key'] not in cache_map or item.get('width'):
                                cache_map[item['Key']] = item
            except Exception as e:
                print(f"Warning reading cache from {path}: {e}")
    return cache_map

def _build_photo_cache(bucket_name):
    """
    Fetches objects from S3 and incrementally updates gallery_cache_v2.json.
    Reuses existing metadata for unchanged objects to minimize I/O and latency.
    """
    print("Updating photo list and metadata...")
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=bucket_name)

    raw_objects = []
    for page in pages:
        if "Contents" in page:
            raw_objects.extend(page['Contents'])

    existing_cache = _load_existing_cache_map()
    processed_objects = []
    objects_to_process = []

    for obj in raw_objects:
        key = obj['Key']
        cached_item = existing_cache.get(key)
        last_modified_str = obj['LastModified'].isoformat() if isinstance(obj['LastModified'], datetime) else str(obj['LastModified'])

        # Reuse if key matches, LastModified matches, and dimensions are cached
        if (cached_item and 
            cached_item.get('LastModified') == last_modified_str and 
            cached_item.get('width') is not None and 
            cached_item.get('height') is not None):
            processed_objects.append(cached_item)
        else:
            objects_to_process.append(obj)

    if objects_to_process:
        print(f"Extracting metadata for {len(objects_to_process)} new/modified photos...")
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_obj = {
                executor.submit(process_single_object, obj, bucket_name): obj 
                for obj in objects_to_process
            }
            for future in as_completed(future_to_obj):
                try:
                    processed_objects.append(future.result())
                except Exception as e:
                    print(f"Error processing object: {e}")
    else:
        print("All photos already cached. 0 downloads needed.")

    sorted_objects = sorted(
        processed_objects, 
        key=lambda x: x.get('sort_date') or '', 
        reverse=True
    )

    # Save metadata to cache atomically
    temp_file_path = API_CACHE_FILE + f".tmp-{os.getpid()}"
    with open(temp_file_path, 'w') as f:
        json.dump({'objects': sorted_objects}, f)

    os.replace(temp_file_path, API_CACHE_FILE)
    print(f"Photo cache successfully updated with {len(sorted_objects)} items.")
    return sorted_objects

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
        config=BotocoreConfig(
            signature_version='s3v4',
            max_pool_connections=20,
            connect_timeout=10,
            read_timeout=30,
            retries={'max_attempts': 3, 'mode': 'standard'}
        ),
        region_name=app.config['OCI_REGION']
    )

    # Pre-warm photo cache in background on application start
    def _warm_cache():
        try:
            bucket = app.config.get('OCI_BUCKET_NAME')
            if not bucket or not app.config.get('OCI_ENDPOINT_URL'):
                return
            needs_warm = True
            if os.path.exists(API_CACHE_FILE):
                mod_time = os.path.getmtime(API_CACHE_FILE)
                if (time.time() - mod_time) < CACHE_EXPIRATION_SECONDS:
                    needs_warm = False
            if needs_warm:
                with _cache_lock:
                    _build_photo_cache(bucket)
        except Exception as e:
            print(f"Cache pre-warming notice: {e}")

    threading.Thread(target=_warm_cache, daemon=True).start()
    
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
            bucket_name = app.config['OCI_BUCKET_NAME']
            cache_is_valid = False
            stale_objects = None

            if os.path.exists(API_CACHE_FILE):
                try:
                    modification_time = os.path.getmtime(API_CACHE_FILE)
                    if (time.time() - modification_time) < CACHE_EXPIRATION_SECONDS:
                        cache_is_valid = True
                    with open(API_CACHE_FILE, 'r') as f:
                        stale_objects = json.load(f).get('objects', [])
                except Exception as e:
                    print(f"Error checking cache file: {e}")

            if cache_is_valid and stale_objects:
                sorted_objects = stale_objects
            else:
                # If another thread is currently building the cache:
                acquired = _cache_lock.acquire(blocking=False)
                if not acquired:
                    # Lock is busy. If we have stale cache, return it immediately (stale-while-revalidate)
                    if stale_objects:
                        sorted_objects = stale_objects
                    else:
                        # Wait for the in-progress build to finish
                        with _cache_lock:
                            if os.path.exists(API_CACHE_FILE):
                                with open(API_CACHE_FILE, 'r') as f:
                                    sorted_objects = json.load(f).get('objects', [])
                            else:
                                sorted_objects = _build_photo_cache(bucket_name)
                else:
                    try:
                        # Double-check if another thread updated the cache right before we acquired the lock
                        if os.path.exists(API_CACHE_FILE):
                            modification_time = os.path.getmtime(API_CACHE_FILE)
                            if (time.time() - modification_time) < CACHE_EXPIRATION_SECONDS:
                                with open(API_CACHE_FILE, 'r') as f:
                                    sorted_objects = json.load(f).get('objects', [])
                                cache_is_valid = True
                        if not cache_is_valid:
                            sorted_objects = _build_photo_cache(bucket_name)
                    finally:
                        _cache_lock.release()

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