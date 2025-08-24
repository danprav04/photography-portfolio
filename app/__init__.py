import os
import re
import hashlib
import random
import time
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, request, make_response, send_from_directory, url_for
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config
from PIL import Image

s3_client = None

# --- Cache Configuration ---
CACHE_BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
THUMBNAIL_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'thumbnails')
API_CACHE_DIR = os.path.join(CACHE_BASE_DIR, 'api')
API_CACHE_FILE = os.path.join(API_CACHE_DIR, 'gallery_cache.json')
CACHE_EXPIRATION_SECONDS = 60
THUMBNAIL_MAX_WIDTH = 400


def _get_datetime_from_key(object_key):
    """
    Extracts a datetime object from an object key (filename).
    """
    match = re.search(r'(\d{8})_(\d{6})', object_key)
    if match:
        try:
            return datetime.strptime(f"{match.group(1)}{match.group(2)}", '%Y%m%d%H%M%S')
        except ValueError:
            pass
    return datetime.min

def _calculate_gallery_etag(objects):
    """
    Calculates a collective ETag for a list of S3 objects, incorporating a
    time component to ensure presigned URLs are periodically refreshed.
    """
    if not objects:
        return None
    # ETag from S3 already includes quotes, so we use them as is.
    etags = [obj.get('ETag', '') for obj in objects]
    concatenated_etags = "".join(etags)

    # Add a time-based salt to the ETag that changes every 30 minutes (1800s).
    # This forces clients to refetch the API response and get new presigned URLs
    # before the old ones expire (which have a 60-minute lifetime).
    time_salt = str(int(time.time() // 1800))
    
    # Combine content hash with time salt for the final ETag.
    combined_hash_input = f"{concatenated_etags}-{time_salt}"
    
    return f'"{hashlib.sha256(combined_hash_input.encode("utf-8")).hexdigest()}"'

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
            'footer_text': app.config['PORTFOLIO_FOOTER_TEXT']
        }
        return render_template('index.html', content=content)

    @app.route('/api/photos', methods=['GET', 'HEAD'])
    def get_photos():
        """
        API endpoint for the photo list. Uses a file-based cache to avoid
        hitting OCI on every request.
        """
        try:
            cache_is_valid = False
            if os.path.exists(API_CACHE_FILE):
                # Check if the cache file is recent enough
                modification_time = os.path.getmtime(API_CACHE_FILE)
                if (time.time() - modification_time) < CACHE_EXPIRATION_SECONDS:
                    cache_is_valid = True
            
            if cache_is_valid:
                # Load object list and ETag from the file cache
                with open(API_CACHE_FILE, 'r') as f:
                    cached_data = json.load(f)
                sorted_objects = cached_data['objects']
                current_etag = _calculate_gallery_etag(sorted_objects) # ETag is recalculated with time salt
            else:
                # Cache is invalid or missing, fetch fresh from OCI
                bucket_name = app.config['OCI_BUCKET_NAME']
                paginator = s3_client.get_paginator('list_objects_v2')
                pages = paginator.paginate(Bucket=bucket_name)
                
                all_objects = []
                for page in pages:
                    if "Contents" in page:
                        all_objects.extend(page['Contents'])
                
                # Convert datetime objects to strings for JSON serialization
                for obj in all_objects:
                    obj['LastModified'] = obj['LastModified'].isoformat()
                
                sorted_objects = sorted(all_objects, key=lambda obj: _get_datetime_from_key(obj['Key']), reverse=True)
                current_etag = _calculate_gallery_etag(sorted_objects)

                # Write the fresh data to the cache file atomically
                # Note: We don't store the time-salted ETag in the file, only the object list
                cache_payload = {'objects': sorted_objects}
                temp_file_path = API_CACHE_FILE + f".tmp-{os.getpid()}"
                with open(temp_file_path, 'w') as f:
                    json.dump(cache_payload, f)
                os.rename(temp_file_path, API_CACHE_FILE)

            if not current_etag:
                return jsonify([])

            # Standard cache validation with the client
            if_none_match = request.headers.get('If-None-Match')
            if if_none_match and if_none_match == current_etag:
                return make_response(), 304

            if request.method == 'HEAD':
                response = make_response()
                response.headers['ETag'] = current_etag
                response.headers['Cache-Control'] = f'public, max-age={CACHE_EXPIRATION_SECONDS}'
                return response

            # Generate response with fresh presigned URLs
            photo_data = []
            for obj in sorted_objects:
                key = obj['Key']
                photo_data.append({
                    'key': key,
                    'full_url': s3_client.generate_presigned_url('get_object', Params={'Bucket': app.config['OCI_BUCKET_NAME'], 'Key': key}, ExpiresIn=3600),
                    'thumbnail_url': url_for('get_thumbnail', object_key=key, _external=False)
                })
            
            response = make_response(jsonify(photo_data))
            response.headers['ETag'] = current_etag
            response.headers['Cache-Control'] = f'public, max-age={CACHE_EXPIRATION_SECONDS}'
            return response
            
        except ClientError as e:
            print(f"An S3 client error occurred: {e}")
            return jsonify({"error": "Could not retrieve photos from cloud storage."}), 500
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return jsonify({"error": "An internal server error occurred."}), 500

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
            temp_original_path = os.path.join(THUMBNAIL_CACHE_DIR, f"original_{sanitized_key}")
            
            s3_client.download_file(bucket_name, object_key, temp_original_path)
            
            with Image.open(temp_original_path) as img:
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

                img.thumbnail((THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_WIDTH * 10))
                img.save(thumbnail_path, "JPEG", quality=85, optimize=True)
            
            os.remove(temp_original_path)
            
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        except ClientError as e:
            print(f"Error downloading {object_key} for thumbnail generation: {e}")
            return "Error generating thumbnail", 500
        except Exception as e:
            print(f"Error processing image {object_key}: {e}")
            if os.path.exists(temp_original_path):
                os.remove(temp_original_path)
            return "Error processing image", 500

    return app