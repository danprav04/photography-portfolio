import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file for secrets
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))

# --- Load Content Configuration from JSON file ---
# The path is relative to this config.py file, going up one level to the project root.
config_path = os.path.join(basedir, '..', 'portfolio_config.json')
try:
    with open(config_path, 'r') as f:
        content_config = json.load(f)
except FileNotFoundError:
    print(f"WARNING: Configuration file not found at {config_path}. Using default values.")
    content_config = {}

class Config:
    """Base configuration class."""
    
    # --- SECRETS (from Environment Variables) ---
    MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'minio:9000')
    MINIO_ACCESS_KEY = os.getenv('MINIO_ROOT_USER')
    MINIO_SECRET_KEY = os.getenv('MINIO_ROOT_PASSWORD')
    MINIO_BUCKET_NAME = os.getenv('MINIO_BUCKET_NAME', 'portfolio')
    MINIO_SECURE = os.getenv('MINIO_SECURE', 'False').lower() in ['true', '1', 't']

    # --- PUBLIC CONTENT (from JSON file, with fallbacks) ---
    PORTFOLIO_TITLE = content_config.get('PORTFOLIO_TITLE', 'My Photography Portfolio')
    PORTFOLIO_META_DESCRIPTION = content_config.get('PORTFOLIO_META_DESCRIPTION', 'A collection of my best work.')
    PORTFOLIO_ABOUT_HEADING = content_config.get('PORTFOLIO_ABOUT_HEADING', 'About Me')
    PORTFOLIO_ABOUT_CONTENT = content_config.get('PORTFOLIO_ABOUT_CONTENT', 'Welcome to my portfolio.')
    PORTFOLIO_CONTACT_HEADING = content_config.get('PORTFOLIO_CONTACT_HEADING', 'Contact')
    PORTFOLIO_CONTACT_EMAIL = content_config.get('PORTFOLIO_CONTACT_EMAIL', 'email@example.com')
    PORTFOLIO_FOOTER_TEXT = content_config.get('PORTFOLIO_FOOTER_TEXT', '© 2025 Me. All rights reserved.')