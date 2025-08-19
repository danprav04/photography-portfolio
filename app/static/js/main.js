document.addEventListener('DOMContentLoaded', () => {
    const galleryContainer = document.getElementById('gallery-container');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.lightbox-close');

    /**
     * Fetches photo URLs from the API.
     * @returns {Promise<string[]>} A promise that resolves to an array of photo URLs.
     */
    async function fetchPhotos() {
        try {
            const response = await fetch('/api/photos');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Could not fetch photos:", error);
            galleryContainer.innerHTML = '<p class="loader">Failed to load photos. Please try again later.</p>';
            return [];
        }
    }

    /**
     * Renders photos in the gallery.
     * @param {string[]} photoUrls - An array of photo URLs.
     */
    function renderGallery(photoUrls) {
        // Clear the loading message
        galleryContainer.innerHTML = '';

        if (photoUrls.length === 0) {
            galleryContainer.innerHTML = '<p class="loader">No photos found in the gallery.</p>';
            return;
        }

        photoUrls.forEach(url => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';

            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Portfolio Image'; // Consider adding more descriptive alt text later
            img.loading = 'lazy'; // Lazy load images for performance

            // Add click event for lightbox
            img.addEventListener('click', () => openLightbox(url));
            
            galleryItem.appendChild(img);
            galleryContainer.appendChild(galleryItem);
        });
    }

    /**
     * Opens the lightbox with the specified image URL.
     * @param {string} url - The URL of the image to display.
     */
    function openLightbox(url) {
        lightboxImg.src = url;
        lightbox.classList.add('active');
    }

    /**
     * Closes the lightbox.
     */
    function closeLightbox() {
        lightbox.classList.remove('active');
        lightboxImg.src = ''; // Clear src to stop loading if in progress
    }

    /**
     * Initializes the application.
     */
    async function init() {
        const photos = await fetchPhotos();
        renderGallery(photos);

        // Event listeners for closing the lightbox
        closeBtn.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            // Close if the click is on the background, not the image itself
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
        
        // Close lightbox with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
            }
        });
    }

    // Start the application
    init();
});