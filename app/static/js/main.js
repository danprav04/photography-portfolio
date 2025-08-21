import { loadGalleryData } from './api.js';
import { initUI } from './ui.js';
import { initLightbox } from './lightbox.js';

/**
 * Initializes the application.
 * This function orchestrates the fetching of data, rendering the UI,
 * and setting up interactive components like the lightbox.
 */
async function init() {
    // 1. Initialize the lightbox controls and base event listeners.
    initLightbox();

    // 2. Load photo data, using cache validation.
    const photoData = await loadGalleryData();

    // 3. Render the UI (carousel and gallery) with the loaded data.
    if (photoData) {
        initUI(photoData.featured, photoData.gallery);
    } else {
        // Display an error message if data could not be loaded.
        const galleryContainer = document.getElementById('gallery-container');
        if (galleryContainer) {
            galleryContainer.innerHTML = '<p class="status-message">Failed to load photos. Please try again later.</p>';
        }
    }
}

// Start the application once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', init);