import os
import re
import hashlib
from datetime import datetime
from flask import Flask, render_template, jsonify, request, make_response, send_from_directory, url_for
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config
from PIL import Image

s3_client = None
THUMBNAIL_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache', 'thumbnails')
THUMBNAIL_MAX_WIDTH = 400

def _get_datetime_from_key(object_key):
    """
    Extracts a datetime object from an object key (filename).
    Assumes a format like 'PXL_YYYYMMDD_HHMMSS...' or similar.
    Returns current time as a fallback if the pattern is not matched.
    """
    match = re.search(r'(\d{8})_(\d{6})', object_key)
    if match:
        try:
            return datetime.strptime(f"{match.group(1)}{match.group(2)}", '%Y%m%d%H%M%S')
        except ValueError:
            pass  # Fallback to a default date if parsing fails
    return datetime.min # Return a very old date for sorting purposes

def _calculate_gallery_etag(objects):
    """
    Calculates a collective ETag for a list of S3 objects.
    This ETag represents the state of the gallery's content.
    """
    if not objects:
        return None
    
    etags = [obj['ETag'] for obj in objects]
    
    # Create a single string from all ETags and hash it
    concatenated_etags = "".join(etags)
    return f'"{hashlib.sha256(concatenated_etags.encode("utf-8")).hexdigest()}"'

def create_app():
    """Application factory function."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Ensure thumbnail cache directory exists
    os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

    # Initialize the S3 client to connect to OCI
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
        API endpoint to get a chronologically sorted list of photo URLs.
        Separates photos into 'featured' and 'gallery' lists.
        Includes ETag generation and validation for caching.
        """
        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            
            paginator = s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_name)
            
            all_objects = []
            for page in pages:
                if "Contents" in page:
                    all_objects.extend(page['Contents'])
            
            # Sort all objects by datetime extracted from the key, newest first
            sorted_objects = sorted(all_objects, key=lambda obj: _get_datetime_from_key(obj['Key']), reverse=True)

            current_etag = _calculate_gallery_etag(sorted_objects)

            if current_etag is None:
                return jsonify({"featured": [], "gallery": []})

            if_none_match = request.headers.get('If-None-Match')
            if if_none_match and if_none_match == current_etag:
                return make_response(), 304  # Not Modified

            if request.method == 'HEAD':
                response = make_response()
                response.headers['ETag'] = current_etag
                response.headers['Cache-Control'] = 'no-cache'
                return response

            photo_data = []
            for obj in sorted_objects:
                key = obj['Key']
                full_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': bucket_name, 'Key': key},
                    ExpiresIn=3600 # 1 hour validity
                )
                photo_data.append({
                    'key': key,
                    'full_url': full_url,
                    'thumbnail_url': url_for('get_thumbnail', object_key=key, _external=False)
                })
            
            # Split photos into featured (first 5) and gallery (the rest)
            featured_photos = photo_data[:5]
            gallery_photos = photo_data

            response_data = {
                "featured": featured_photos,
                "gallery": gallery_photos
            }
            
            response = make_response(jsonify(response_data))
            response.headers['ETag'] = current_etag
            response.headers['Cache-Control'] = 'no-cache'
            return response
            
        except ClientError as e:
            # Error logging remains the same
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
        # Sanitize object_key to create a valid filename
        sanitized_key = re.sub(r'[^a-zA-Z0-9_.-]', '_', object_key)
        thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, sanitized_key)

        if os.path.exists(thumbnail_path):
            return send_from_directory(THUMBNAIL_CACHE_DIR, sanitized_key)

        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            temp_original_path = os.path.join(THUMBNAIL_CACHE_DIR, f"original_{sanitized_key}")
            
            s3_client.download_file(bucket_name, object_key, temp_original_path)
            
            with Image.open(temp_original_path) as img:
                # Preserve orientation
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

                img.thumbnail((THUMBNAIL_MAX_WIDTH, THUMBNAIL_MAX_WIDTH * 10)) # High height to maintain aspect ratio
                img.save(thumbnail_path, "JPEG", quality=85, optimize=True)
            
            os.remove(temp_original_path) # Clean up original download
            
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