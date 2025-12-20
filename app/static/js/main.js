import { loadPhotoData, fetchSinglePhoto } from './api.js';
import { initUI } from './ui.js';
import { initLightbox, openLightbox } from './lightbox.js';
import { initGear } from './gear.js';

/**
 * Handles the initial scroll to a hash anchor (e.g. #gear) if present.
 * This is necessary because dynamic content (like the carousel) is inserted
 * after the page load, pushing sections down.
 */
function handleInitialScroll() {
    const hash = window.location.hash;
    
    if (hash && hash.length > 1) {
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
 * Initializes the mobile navigation toggle.
 */
function initMobileMenu() {
    const toggleBtn = document.querySelector('.mobile-menu-toggle');
    const nav = document.getElementById('main-nav');
    const navLinks = document.querySelectorAll('.nav-link'); // Select text links

    if (!toggleBtn || !nav) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !expanded);
        toggleBtn.classList.toggle('active');
        nav.classList.toggle('active');
        document.body.style.overflow = !expanded ? 'hidden' : 'auto'; // Prevent scrolling when menu is open
    });

    // Close menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.classList.remove('active');
            nav.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (nav.classList.contains('active') && !nav.contains(e.target) && !toggleBtn.contains(e.target)) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.classList.remove('active');
            nav.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });
}

/**
 * Initializes the application.
 */
async function init() {
    // 1. Initialize global UI components
    initLightbox();
    initMobileMenu();

    // 2. Initialize Gear Section (if present)
    const gearContainer = document.getElementById('gear-container');
    if (gearContainer) {
        const amazonTag = gearContainer.dataset.amazonTag;
        initGear('gear-container', amazonTag);
    }

    // 3. Deep Linking Check
    const urlParams = new URLSearchParams(window.location.search);
    const sharedPhotoKey = urlParams.get('id');

    if (sharedPhotoKey) {
        console.log("Shared photo detected. Loading specifically...");
        try {
            const singlePhoto = await fetchSinglePhoto(sharedPhotoKey);
            if (singlePhoto) {
                openLightbox(singlePhoto.full_url, sharedPhotoKey);
            }
        } catch (e) {
            console.error("Failed to load shared photo", e);
        }
    }

    // 4. Load all photo data
    const allPhotos = await loadPhotoData();

    // 5. Render the UI
    if (allPhotos) {
        initUI(allPhotos);
        handleInitialScroll();
    } else {
        const galleryContainer = document.getElementById('gallery-container');
        if (galleryContainer) {
            galleryContainer.innerHTML = '<p class="status-message">Failed to load photos. Please try again later.</p>';
        }
    }
}

document.addEventListener('DOMContentLoaded', init);