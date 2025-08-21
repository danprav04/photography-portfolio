# Stage 1: Use the official Python image as a parent image
FROM python:3.11-slim

# Stage 2: Set the working directory in the container
WORKDIR /app

# Stage 3: Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
# Set the number of Gunicorn workers.
# A common starting point is (2 * CPU_CORES) + 1.
ENV GUNICORN_WORKERS 3

# Stage 4: Install system dependencies for Pillow and application dependencies
# Copy the requirements file first to leverage Docker cache
COPY requirements.txt .
# Install build-base for Pillow, then the Python packages, then clean up.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libjpeg-dev zlib1g-dev && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y --auto-remove gcc libjpeg-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

# Stage 5: Copy the application code and config into the container
COPY ./app /app/app
COPY portfolio_config.json .

# Stage 6: Create a directory for the thumbnail cache
RUN mkdir -p /app/cache/thumbnails

# Stage 7: Expose the port the app runs on
EXPOSE 8000

# Stage 8: The command to run the application
# Use /bin/sh -c to ensure environment variables like ${GUNICORN_WORKERS} are expanded.
# The app module (app:create_app()) does not need to be quoted.
CMD ["/bin/sh", "-c", "exec gunicorn --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS} --worker-class gevent --timeout 90 app:create_app()"]