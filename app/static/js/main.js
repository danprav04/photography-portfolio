document.addEventListener('DOMContentLoaded', () => {
    const galleryContainer = document.getElementById('gallery-container');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.lightbox-close');

    const CACHE_KEY_ETAG = 'galleryETag';
    const CACHE_KEY_URLS = 'galleryPhotoURLs';

    /**
     * Renders photos in the gallery's masonry grid.
     * @param {string[]} photoUrls - An array of photo URLs.
     */
    function renderGallery(photoUrls) {
        // Clear the loading/status message
        galleryContainer.innerHTML = '';

        if (!photoUrls || photoUrls.length === 0) {
            galleryContainer.innerHTML = '<p class="loader">No photos found in the gallery.</p>';
            return;
        }

        photoUrls.forEach(url => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';

            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Portfolio Image';
            img.loading = 'lazy';

            img.addEventListener('click', () => openLightbox(url));
            
            galleryItem.appendChild(img);
            galleryContainer.appendChild(galleryItem);
        });
    }

    /**
     * Fetches the latest photo list from the server and caches it.
     */
    async function fetchAndCachePhotos() {
        console.log("Cache miss or invalid. Fetching fresh data from server.");
        try {
            const response = await fetch('/api/photos');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const newETag = response.headers.get('ETag');
            const photoUrls = await response.json();

            if (newETag && photoUrls) {
                localStorage.setItem(CACHE_KEY_URLS, JSON.stringify(photoUrls));
                localStorage.setItem(CACHE_KEY_ETAG, newETag);
                console.log("New data fetched and cached successfully.");
            }
            
            renderGallery(photoUrls);

        } catch (error) {
            console.error("Could not fetch photos:", error);
            galleryContainer.innerHTML = '<p class="loader">Failed to load photos. Please try again later.</p>';
        }
    }

    /**
     * Checks if the cached data is still valid by comparing ETags with the server.
     */
    async function validateCacheAndRender() {
        const cachedETag = localStorage.getItem(CACHE_KEY_ETAG);
        const cachedUrlsJSON = localStorage.getItem(CACHE_KEY_URLS);

        if (!cachedETag || !cachedUrlsJSON) {
            // No cache exists, perform a full fetch.
            await fetchAndCachePhotos();
            return;
        }

        try {
            // Use a HEAD request to get only headers, saving bandwidth
            const response = await fetch('/api/photos', { method: 'HEAD' });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const currentETag = response.headers.get('ETag');

            if (currentETag === cachedETag) {
                // Cache is valid, render from localStorage
                console.log("Cache is valid. Rendering from localStorage.");
                renderGallery(JSON.parse(cachedUrlsJSON));
            } else {
                // Cache is stale, fetch new data
                await fetchAndCachePhotos();
            }
        } catch (error) {
            console.error("Failed to validate cache, falling back to cached version.", error);
            // In case of network error during validation, render the stale cache as a fallback
            renderGallery(JSON.parse(cachedUrlsJSON));
        }
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
        await validateCacheAndRender();

        // Event listeners for closing the lightbox
        closeBtn.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });
    }

    // Start the application
    init();
});