import { loadPhotoData, fetchSinglePhoto } from './api.js';
import { initUI } from './ui.js';
import { initLightbox, openLightbox } from './lightbox.js';
import { initGear } from './gear.js';

/**
 * Handles the initial scroll to a hash anchor (e.g. #gear) if present.
 * This is necessary because dynamic content (like the carousel) is inserted
 * after the page load, pushing sections down.
 * 
 * We use requestAnimationFrame to wait for the DOM render to complete.
 * Because we now set aspect-ratio on images, the layout height is calculated
 * immediately, making the scroll target accurate.
 */
function handleInitialScroll() {
    const hash = window.location.hash;
    
    // Check if hash exists and isn't just an empty anchor or a potential photo ID (assuming IDs don't conflict with section names)
    if (hash && hash.length > 1) {
        // Double RAF: First one waits for JS stack to clear, second waits for layout/paint.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    const targetElement = document.querySelector(hash);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'auto' });
                    }
                } catch (e) {
                    console.warn("Could not scroll to hash:", e);
                }
            });
        });
    }
}

/**
 * Initializes the application.
 * This function orchestrates the fetching of data, rendering the UI,
 * and setting up interactive components like the lightbox.
 */
async function init() {
    // 1. Initialize the lightbox controls and base event listeners.
    initLightbox();

    // 2. Initialize Gear Section (if present)
    // This adds content to the DOM immediately.
    const gearContainer = document.getElementById('gear-container');
    if (gearContainer) {
        const amazonTag = gearContainer.dataset.amazonTag;
        initGear('gear-container', amazonTag);
    }

    // 3. Deep Linking Check: Check if a specific photo is requested via URL params.
    const urlParams = new URLSearchParams(window.location.search);
    const sharedPhotoKey = urlParams.get('id');

    if (sharedPhotoKey) {
        console.log("Shared photo detected. Loading specifically...");
        try {
            // Fetch only the specific photo first to ensure fast load time
            const singlePhoto = await fetchSinglePhoto(sharedPhotoKey);
            if (singlePhoto) {
                // Open lightbox immediately
                openLightbox(singlePhoto.full_url, sharedPhotoKey);
            }
        } catch (e) {
            console.error("Failed to load shared photo", e);
        }
    }

    // 4. Load all photo data for the main gallery in the background
    // (This happens regardless of whether a shared photo was opened)
    const allPhotos = await loadPhotoData();

    // 5. Render the UI (carousel and gallery) with the loaded data.
    if (allPhotos) {
        initUI(allPhotos);
        
        // 6. Fix scroll position after dynamic content insertion
        handleInitialScroll();
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