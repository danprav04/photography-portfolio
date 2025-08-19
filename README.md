# Photography Portfolio Website

A modern, fast, and dynamic photography portfolio website built with Flask and vanilla JavaScript, running in Docker containers with a self-hosted MinIO server for file storage.

## Features

- **Dockerized**: The entire application stack is managed with Docker Compose.
- **Self-Hosted Storage**: Uses MinIO, an S3-compatible object storage server, to store all photos.
- **Persistent Data**: Photo data is stored in a Docker volume, ensuring it persists across container restarts and updates.
- **Dynamic & Randomized Gallery**: The gallery displays a unique, random order of photos on every page load.
- **Performant**: Built with a lightweight Flask backend and dependency-free vanilla JavaScript for fast load times.
- **Modern UI**: Features a responsive masonry grid layout, a lightbox for viewing images, and lazy loading for efficiency.
- **Configurable**: All site content and credentials can be easily configured via a `.env` file.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd <your-repo-folder>
```

### 2. Configure Your Environment

The application is configured using a `.env` file. A template is not provided in the repo for security, so you must create one.

Create a file named `.env` in the project root and copy the contents from the example below:

```.env
# ---------------------------------
# MINIO CONFIGURATION
# ---------------------------------
# The root user and password for the MinIO console
MINIO_ROOT_USER=changeme
MINIO_ROOT_PASSWORD=changeme-super-secret

# The name of the S3 bucket where you will store your photos
MINIO_BUCKET_NAME=portfolio

# ---------------------------------
# APPLICATION CONFIGURATION
# ---------------------------------
# Set to "development" or "production"
FLASK_ENV=production

# ---------------------------------
# PORTFOLIO CONTENT
# All content here supports basic HTML tags like <b>, <i>, <a href="...">
# ---------------------------------
PORTFOLIO_TITLE=Your Name Photography
PORTFOLIO_META_DESCRIPTION=The professional photography portfolio of Your Name. Specializing in landscape, portrait, and event photography.

# About Me Section
PORTFOLIO_ABOUT_HEADING=About Me
PORTFOLIO_ABOUT_CONTENT="<p>I am a passionate photographer with a love for capturing the moment.</p>"

# Contact Section
PORTFOLIO_CONTACT_HEADING=Get In Touch
PORTFOLIO_CONTACT_EMAIL=your-email@example.com
PORTFOLIO_FOOTER_TEXT=© 2025 Your Name. All Rights Reserved.
```

**Important:** Change the `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` to secure, unique values. Update the portfolio content as you see fit.

### 3. Build and Run the Application

From the project root, run the following command:

```bash
docker-compose up --build
```

- `--build`: This flag forces Docker to rebuild the application image if there are any changes to the `Dockerfile` or source code.
- You can add `-d` to run the containers in detached mode (in the background).

The first time you run this, it will download the necessary Docker images and build your application container. This may take a few minutes.

### 4. Upload Your Photos

Once the containers are running:

1.  **Access the MinIO Console**: Open your web browser and navigate to `http://localhost:9001`.
2.  **Log In**: Use the `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` you set in your `.env` file.
3.  **Find Your Bucket**: On the left-hand side, you will see a bucket with the name you specified in `MINIO_BUCKET_NAME` (e.g., `portfolio`). The application automatically creates it for you on first startup.
4.  **Upload Photos**: Click on the bucket, and then click the "Upload" button to start adding your image files.

### 5. View Your Portfolio

Open a new browser tab and navigate to `http://localhost:8000`.

Your portfolio website will load, fetch the photos you uploaded to MinIO, and display them in a random order.

## Development Workflow

- To stop the containers, press `Ctrl+C` in the terminal where `docker-compose` is running. If in detached mode, run `docker-compose down`.
- If you make changes to the Python/Flask code or `requirements.txt`, you will need to rebuild the image using the `docker-compose up --build` command again.
- Changes to static files (JS, CSS) or templates (HTML) will be reflected automatically if you are running in development mode (`FLASK_ENV=development`), but for production, a rebuild is recommended to ensure consistency.