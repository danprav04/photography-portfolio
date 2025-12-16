import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
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
    
    # --- SECRETS for OCI Object Storage (from Environment Variables) ---
    OCI_ENDPOINT_URL = os.getenv('OCI_ENDPOINT_URL')
    OCI_REGION = os.getenv('OCI_REGION')
    OCI_ACCESS_KEY_ID = os.getenv('OCI_ACCESS_KEY_ID')
    OCI_SECRET_ACCESS_KEY = os.getenv('OCI_SECRET_ACCESS_KEY')
    OCI_BUCKET_NAME = os.getenv('OCI_BUCKET_NAME', 'portfolio')

    # --- PUBLIC CONTENT (from JSON file, with fallbacks) ---
    PORTFOLIO_TITLE = content_config.get('PORTFOLIO_TITLE', 'My Photography Portfolio')
    PORTFOLIO_META_DESCRIPTION = content_config.get('PORTFOLIO_META_DESCRIPTION', 'A collection of my best work.')
    PORTFOLIO_ABOUT_HEADING = content_config.get('PORTFOLIO_ABOUT_HEADING', 'About Me')
    PORTFOLIO_ABOUT_CONTENT = content_config.get('PORTFOLIO_ABOUT_CONTENT', 'Welcome to my portfolio.')
    PORTFOLIO_CONTACT_HEADING = content_config.get('PORTFOLIO_CONTACT_HEADING', 'Contact')
    PORTFOLIO_CONTACT_EMAIL = content_config.get('PORTFOLIO_CONTACT_EMAIL', 'email@example.com')
    PORTFOLIO_FOOTER_TEXT = content_config.get('PORTFOLIO_FOOTER_TEXT', '© 2025 Me. All rights reserved.')
    
    # --- AFFILIATE CONFIGURATION ---
    AMAZON_TAG = content_config.get('AMAZON_TAG', '')
    PORTFOLIO_DISCLAIMER_TEXT = content_config.get('PORTFOLIO_DISCLAIMER_TEXT', 'As an Amazon Associate I earn from qualifying purchases.')