import os
import random
from flask import Flask, render_template, jsonify, url_for
import boto3
from botocore.client import Config as BotocoreConfig
from botocore.exceptions import ClientError
from app.config import Config

minio_client = None

def create_app():
    """Application factory function."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize MinIO client
    global minio_client
    minio_client = boto3.client(
        's3',
        endpoint_url=f"http://{app.config['MINIO_ENDPOINT']}",
        aws_access_key_id=app.config['MINIO_ACCESS_KEY'],
        aws_secret_access_key=app.config['MINIO_SECRET_KEY'],
        config=BotocoreConfig(signature_version='s3v4'),
        region_name='us-east-1'
    )

    with app.app_context():
        # Ensure the bucket exists, create it if it doesn't
        try:
            minio_client.head_bucket(Bucket=app.config['MINIO_BUCKET_NAME'])
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                minio_client.create_bucket(Bucket=app.config['MINIO_BUCKET_NAME'])
                # Set a public read policy for the bucket
                policy = f'{{"Version":"2012-10-17","Statement":[{{"Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{app.config["MINIO_BUCKET_NAME"]}/*"]}}]}}'
                minio_client.put_bucket_policy(Bucket=app.config['MINIO_BUCKET_NAME'], Policy=policy)
            else:
                raise

    @app.route('/')
    def index():
        """Render the main portfolio page."""
        # Pass portfolio content from config to the template
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
            paginator = minio_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=app.config['MINIO_BUCKET_NAME'])
            
            photo_urls = []
            for page in pages:
                if "Contents" in page:
                    for obj in page['Contents']:
                        # Generate a presigned URL for each object
                        # These URLs grant temporary access to the private objects
                        url = minio_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': app.config['MINIO_BUCKET_NAME'], 'Key': obj['Key']},
                            ExpiresIn=3600  # URL is valid for 1 hour
                        )
                        photo_urls.append(url)
            
            random.shuffle(photo_urls)
            return jsonify(photo_urls)
            
        except ClientError as e:
            print(f"Error connecting to MinIO: {e}")
            return jsonify({"error": "Could not retrieve photos"}), 500

    return app