import os
import random
import hashlib
from flask import Flask, render_template, jsonify, request, make_response
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config

s3_client = None

def _calculate_gallery_etag(bucket_name):
    """
    Calculates a collective ETag for all objects in the bucket.
    This ETag represents the state of the gallery's content.
    """
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name)
        
        etags = []
        for page in pages:
            if "Contents" in page:
                # Sort objects by key to ensure a consistent ETag order
                sorted_contents = sorted(page['Contents'], key=lambda x: x['Key'])
                for obj in sorted_contents:
                    # ETag is a hash of the object, perfect for change detection
                    etags.append(obj['ETag'])
        
        if not etags:
            return None

        # Create a single string from all ETags and hash it
        concatenated_etags = "".join(etags)
        return f'"{hashlib.sha256(concatenated_etags.encode("utf-8")).hexdigest()}"'
    
    except ClientError:
        # If we can't list objects, we can't generate an ETag.
        # The main API handler will catch and log the full error.
        return None

def create_app():
    """Application factory function."""
    app = Flask(__name__)
    app.config.from_object(Config)

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
        API endpoint to get a randomized list of photo URLs.
        Includes ETag generation and validation for caching.
        """
        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            
            # 1. Calculate the current state of the gallery
            current_etag = _calculate_gallery_etag(bucket_name)

            if current_etag is None:
                # This happens if the bucket is empty or inaccessible
                return jsonify([])

            # 2. Check if the client's cached version is still fresh
            if_none_match = request.headers.get('If-None-Match')
            if if_none_match and if_none_match == current_etag:
                return make_response(), 304  # Not Modified

            # 3. For HEAD requests, just return the ETag for validation
            if request.method == 'HEAD':
                response = make_response()
                response.headers['ETag'] = current_etag
                response.headers['Cache-Control'] = 'no-cache'
                return response

            # 4. For GET requests, fetch, sign, and return all photo URLs
            paginator = s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_name)
            
            photo_urls = []
            for page in pages:
                if "Contents" in page:
                    for obj in page['Contents']:
                        url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': bucket_name, 'Key': obj['Key']},
                            ExpiresIn=3600
                        )
                        photo_urls.append(url)
            
            random.shuffle(photo_urls)
            
            response = make_response(jsonify(photo_urls))
            response.headers['ETag'] = current_etag
            # 'no-cache' tells the client to always re-validate with the server
            response.headers['Cache-Control'] = 'no-cache'
            return response
            
        except ClientError as e:
            bucket_name = app.config.get('OCI_BUCKET_NAME')
            endpoint_url = app.config.get('OCI_ENDPOINT_URL')
            region = app.config.get('OCI_REGION')
            
            print("--- OCI Client Error ---")
            print(f"Failed to access bucket '{bucket_name}' at {endpoint_url} (Region: {region})")
            
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == 'NoSuchBucket':
                print(f"Error Details: The bucket '{bucket_name}' does not exist.")
                return jsonify({"error": f"Configuration error: The bucket '{bucket_name}' was not found."}), 500
            
            print(f"An S3 client error occurred: {e}")
            return jsonify({"error": "Could not retrieve photos from cloud storage."}), 500
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return jsonify({"error": "An internal server error occurred."}), 500

    return app