import { loadPhotoData, fetchSinglePhoto } from './api.js';
import { initUI } from './ui.js';
import { initLightbox, openLightbox } from './lightbox.js';
import { initGear } from './gear.js';

/**
 * Handles the initial scroll to a hash anchor.
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
    const navLinks = document.querySelectorAll('.nav-link');

    if (!toggleBtn || !nav) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !expanded);
        toggleBtn.classList.toggle('active');
        nav.classList.toggle('active');
        document.body.style.overflow = !expanded ? 'hidden' : 'auto';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.classList.remove('active');
            nav.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    });

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
 * Initializes security features to prevent easy image downloads.
 */
function initImageProtection() {
    document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'IMG' || e.target.classList.contains('lightbox-content')) {
            e.preventDefault();
            return false;
        }
    }, false);

    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
}

/**
 * Initializes the application.
 */
async function init() {
    initImageProtection();
    initLightbox();
    initMobileMenu();

    const gearContainer = document.getElementById('gear-container');
    if (gearContainer) {
        const amazonTag = gearContainer.dataset.amazonTag;
        initGear('gear-container', amazonTag);
    }

    // Deep Linking Check
    const urlParams = new URLSearchParams(window.location.search);
    const sharedPhotoKey = urlParams.get('id');

    if (sharedPhotoKey) {
        console.log("Shared photo detected. Loading specifically...");
        try {
            const singlePhoto = await fetchSinglePhoto(sharedPhotoKey);
            if (singlePhoto) {
                // Pass thumbnail URL for fallback
                openLightbox(singlePhoto.full_url, sharedPhotoKey, singlePhoto.thumbnail_url);
            }
        } catch (e) {
            console.error("Failed to load shared photo", e);
        }
    }

    const allPhotos = await loadPhotoData();

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