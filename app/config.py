import os
from dotenv import load_dotenv

# Load environment variables from .env file
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))

class Config:
    """Base configuration."""
    # MinIO/S3 Configuration
    MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'minio:9000')
    MINIO_ACCESS_KEY = os.getenv('MINIO_ROOT_USER')
    MINIO_SECRET_KEY = os.getenv('MINIO_ROOT_PASSWORD')
    MINIO_BUCKET_NAME = os.getenv('MINIO_BUCKET_NAME', 'portfolio')
    MINIO_SECURE = os.getenv('MINIO_SECURE', 'False').lower() in ['true', '1', 't']

    # Portfolio Content Configuration
    PORTFOLIO_TITLE = os.getenv('PORTFOLIO_TITLE', 'My Photography Portfolio')
    PORTFOLIO_META_DESCRIPTION = os.getenv('PORTFOLIO_META_DESCRIPTION', 'A collection of my best work.')
    PORTFOLIO_ABOUT_HEADING = os.getenv('PORTFOLIO_ABOUT_HEADING', 'About Me')
    PORTFOLIO_ABOUT_CONTENT = os.getenv('PORTFOLIO_ABOUT_CONTENT', 'Welcome to my portfolio.')
    PORTFOLIO_CONTACT_HEADING = os.getenv('PORTFOLIO_CONTACT_HEADING', 'Contact')
    PORTFOLIO_CONTACT_EMAIL = os.getenv('PORTFOLIO_CONTACT_EMAIL', 'email@example.com')
    PORTFOLIO_FOOTER_TEXT = os.getenv('PORTFOLIO_FOOTER_TEXT', '© 2025 Me. All rights reserved.')