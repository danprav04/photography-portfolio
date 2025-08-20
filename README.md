# Photography Portfolio Website

A modern, fast, and dynamic photography portfolio website built with Flask and vanilla JavaScript, running in a Docker container and using Oracle Cloud Infrastructure (OCI) Object Storage for scalable, external file storage.

## Features

- **Dockerized**: The application is fully containerized with Docker.
- **Cloud Storage**: Uses OCI Object Storage, an S3-compatible, enterprise-grade solution available in Oracle's Always Free tier.
- **Production Ready**: The included GitHub Actions workflow automates building the Docker image and deploying it to a production server.
- **Dynamic & Randomized Gallery**: The gallery displays a unique, random order of photos on every page load.
- **Performant**: Built with a lightweight Flask backend and dependency-free vanilla JavaScript for fast load times.
- **Modern UI**: Features a responsive masonry grid layout, a lightbox for viewing images, and lazy loading for efficiency.
- **Configurable**: All site content and cloud credentials are managed via environment variables.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- An [Oracle Cloud "Always Free" account](https://www.oracle.com/cloud/free/)

## Getting Started

### 1. Set Up OCI Object Storage

Before running the application, you need to configure a bucket in your Oracle Cloud account.

#### A. Create an S3 Compatibility Key

The application uses S3-compatible credentials to connect to OCI.

1.  Log in to the OCI Console.
2.  Go to your User Profile (icon in the top-right) -> **My Profile**.
3.  On the left, click **Customer secret keys**.
4.  Click **Generate secret key**, give it a name (e.g., `portfolio-app-key`), and click **Generate secret key**.
5.  **Important:** Copy the generated **Secret Key** immediately and save it somewhere secure. You will not see it again.
6.  The **Access Key** will be listed in the table. Copy this as well.

#### B. Find Your OCI Details

You will need the following information for the configuration file:

1.  **Namespace**: In the OCI Console, go to your User Profile -> **Tenancy**. Your Object Storage Namespace is listed under **Object Storage Settings**.
2.  **Region**: Your region is displayed in the top-right of the OCI console (e.g., `us-ashburn-1`).
3.  **Endpoint URL**: The S3-compatible endpoint is formatted as `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`.

#### C. Create a Bucket

1.  In the OCI Console, navigate to **Storage** -> **Object Storage & Archive Storage**.
2.  Click **Buckets**.
3.  Click **Create Bucket**.
4.  Give the bucket a name (e.g., `portfolio-photos`).
5.  Keep the visibility as **Private**, as the application will generate secure, temporary links to your photos.
6.  Click **Create**.

### 2. Configure Your Environment

Create a file named `.env` in the project root. Copy the contents from the example below and fill in the values you collected from OCI.

```.env
# ---------------------------------
# OCI OBJECT STORAGE CONFIGURATION
# ---------------------------------
# The S3-compatible endpoint URL you constructed earlier.
OCI_ENDPOINT_URL=https://<your-namespace>.compat.objectstorage.<your-region>.oraclecloud.com

# The region of your bucket (e.g., us-ashburn-1)
OCI_REGION=<your-region>

# The Customer Secret Key credentials you generated.
OCI_ACCESS_KEY_ID=<your-access-key>
OCI_SECRET_ACCESS_KEY=<your-secret-key>

# The name of the bucket you created in the OCI console.
OCI_BUCKET_NAME=portfolio-photos

# ---------------------------------
# APPLICATION CONFIGURATION
# ---------------------------------
# Set to "development" or "production"
FLASK_ENV=production