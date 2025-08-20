import os
import random
from flask import Flask, render_template, jsonify, url_for
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config

s3_client = None

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
    
    # In a production setup, the bucket is expected to be created and managed
    # outside the application's lifecycle (e.g., via the cloud console or Terraform).
    # This application assumes the bucket specified in the .env file already exists.

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

    @app.route('/api/photos')
    def get_photos():
        """API endpoint to get a randomized list of photo URLs."""
        try:
            bucket_name = app.config['OCI_BUCKET_NAME']
            
            # Use a paginator to handle buckets with many objects
            paginator = s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=bucket_name)
            
            photo_urls = []
            for page in pages:
                if "Contents" in page:
                    for obj in page['Contents']:
                        # Generate a presigned URL for each object.
                        # These URLs grant secure, temporary access to private objects.
                        url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': bucket_name, 'Key': obj['Key']},
                            ExpiresIn=3600  # URL is valid for 1 hour
                        )
                        photo_urls.append(url)
            
            random.shuffle(photo_urls)
            return jsonify(photo_urls)
            
        except ClientError as e:
            # Provide more specific error feedback
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == 'NoSuchBucket':
                print(f"Error: The bucket '{bucket_name}' does not exist.")
                return jsonify({"error": f"The configured bucket '{bucket_name}' was not found."}), 500
            
            print(f"An S3 client error occurred: {e}")
            return jsonify({"error": "Could not retrieve photos from cloud storage."}), 500
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return jsonify({"error": "An internal server error occurred."}), 500

    return app