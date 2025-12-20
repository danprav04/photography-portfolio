import { fetchSinglePhoto } from './api.js';

// --- DOM Element References ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxSpinner = document.getElementById('lightbox-spinner');
const lightboxError = document.getElementById('lightbox-error');
const closeBtn = document.querySelector('.lightbox-close');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');

// --- State Variables ---
const gestureState = {
    scale: 1,
    minScale: 1,
    maxScale: 8, // Increased max zoom
    isPanning: false,
    start: { x: 0, y: 0 },
    translate: { x: 0, y: 0 },
    initialPinchDist: 0,
};

let isUpdateQueued = false;
let currentKey = null;

// --- URL State Management ---
function updateUrlState(key) {
    if (key) {
        const newUrl = `${window.location.pathname}?id=${key}`;
        window.history.pushState({ photoKey: key }, '', newUrl);
    }
}

function clearUrlState() {
    const baseUrl = window.location.pathname;
    window.history.pushState({}, '', baseUrl);
}

// --- Animation Loop ---
function applyUpdate() {
    lightboxImg.style.transform = `translate(${gestureState.translate.x}px, ${gestureState.translate.y}px) scale(${gestureState.scale})`;
    isUpdateQueued = false;
}

function requestUpdate() {
    if (!isUpdateQueued) {
        isUpdateQueued = true;
        requestAnimationFrame(applyUpdate);
    }
}

// --- Utility Functions for Gestures ---
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function clampTranslate() {
    const imgRect = lightboxImg.getBoundingClientRect();
    const containerRect = lightbox.getBoundingClientRect();
    const extraWidth = Math.max(0, (imgRect.width - containerRect.width) / 2);
    const extraHeight = Math.max(0, (imgRect.height - containerRect.height) / 2);

    gestureState.translate.x = clamp(gestureState.translate.x, -extraWidth, extraWidth);
    gestureState.translate.y = clamp(gestureState.translate.y, -extraHeight, extraHeight);
}

function setScale(newScale, center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
    const oldScale = gestureState.scale;
    gestureState.scale = clamp(newScale, gestureState.minScale, gestureState.maxScale);

    if (gestureState.scale === gestureState.minScale) {
        gestureState.translate = { x: 0, y: 0 };
        lightboxImg.classList.remove('zoomed');
    } else {
        const rect = lightboxImg.getBoundingClientRect();
        const mouseX = center.x - rect.left;
        const mouseY = center.y - rect.top;
        gestureState.translate.x -= (mouseX * (gestureState.scale / oldScale - 1));
        gestureState.translate.y -= (mouseY * (gestureState.scale / oldScale - 1));
        lightboxImg.classList.add('zoomed');
    }

    clampTranslate();
    requestUpdate();
}

// --- Event Handlers for Gestures ---
const onPointerDown = (e) => {
    // If the click is on controls or close button, do nothing (let default bubble)
    if (e.target.closest('.lightbox-controls') || e.target.closest('.lightbox-close')) return;
    
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    // Prevent default browser dragging
    e.preventDefault();
    
    if (gestureState.scale > gestureState.minScale) {
        gestureState.isPanning = true;
        gestureState.start = { x: e.clientX - gestureState.translate.x, y: e.clientY - gestureState.translate.y };
        lightboxImg.classList.add('panning');
    }
};

const onPointerMove = (e) => {
    if (gestureState.isPanning) {
        e.preventDefault();
        gestureState.translate.x = e.clientX - gestureState.start.x;
        gestureState.translate.y = e.clientY - gestureState.start.y;
        clampTranslate();
        requestUpdate();
    }
};

const onPointerUp = () => {
    gestureState.isPanning = false;
    lightboxImg.classList.remove('panning');
};

const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.01;
    setScale(gestureState.scale + delta, { x: e.clientX, y: e.clientY });
};

const onTouchStart = (e) => {
    if (e.touches.length === 2) {
        const [t1, t2] = e.touches;
        gestureState.initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
};

const onTouchMove = (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const [t1, t2] = e.touches;
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const scale = (currentDist / gestureState.initialPinchDist) * gestureState.scale;
        const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
        setScale(scale, center);
        gestureState.initialPinchDist = currentDist;
    }
};

// --- Main Lightbox Functions ---
function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Cleanup
    lightboxImg.src = "";
    lightboxImg.classList.remove('loaded');
    delete lightboxImg.dataset.retried;
    
    if (lightboxSpinner) lightboxSpinner.classList.remove('active');
    if (lightboxError) {
        lightboxError.classList.remove('active');
        lightboxError.textContent = "Image failed to load."; // Reset default text
    }

    // Remove listeners
    lightbox.removeEventListener('wheel', onWheel);
    lightbox.removeEventListener('pointerdown', onPointerDown);
    lightbox.removeEventListener('pointermove', onPointerMove);
    lightbox.removeEventListener('pointerup', onPointerUp);
    lightbox.removeEventListener('pointerleave', onPointerUp);
    lightbox.removeEventListener('touchstart', onTouchStart);
    lightbox.removeEventListener('touchmove', onTouchMove);

    clearUrlState();
}

/**
 * Opens the lightbox.
 * @param {string} url - The URL of the full-resolution image.
 * @param {string|null} key - The S3 key/ID of the image for sharing.
 */
export function openLightbox(url, key = null) {
    // Reset state
    gestureState.scale = 1;
    gestureState.translate = { x: 0, y: 0 };
    lightboxImg.classList.remove('zoomed', 'panning', 'loaded');
    delete lightboxImg.dataset.retried;
    currentKey = key;
    
    // UI Reset
    if (lightboxError) {
        lightboxError.classList.remove('active');
        lightboxError.textContent = "Image failed to load."; // Reset
    }
    if (lightboxSpinner) lightboxSpinner.classList.add('active');

    // Setup Load Handler
    lightboxImg.onload = () => {
        if (lightboxSpinner) lightboxSpinner.classList.remove('active');
        if (lightboxError) lightboxError.classList.remove('active');
        lightboxImg.classList.add('loaded');
    };

    // Setup Error/Retry Handler
    lightboxImg.onerror = () => {
        if (lightboxSpinner) lightboxSpinner.classList.remove('active');
        
        // Retry Logic: If we have a key and haven't retried yet
        if (currentKey && lightboxImg.dataset.retried !== 'true') {
            console.log(`Image load failed. Retrying fetch for ${currentKey}...`);
            lightboxImg.dataset.retried = 'true';
            
            // Show spinner again
            if (lightboxSpinner) lightboxSpinner.classList.add('active');
            if (lightboxError) lightboxError.classList.remove('active');
            
            fetchSinglePhoto(currentKey)
                .then(data => {
                    if (data && data.full_url) {
                        lightboxImg.src = data.full_url;
                    } else {
                        throw new Error("API returned no URL");
                    }
                })
                .catch(err => {
                    // Retry failed (network error or server 500/404)
                    console.error("Retry failed:", err);
                    if (lightboxSpinner) lightboxSpinner.classList.remove('active');
                    if (lightboxError) {
                        // Display the actual error to help debugging
                        lightboxError.textContent = `Error: ${err.message}`;
                        lightboxError.classList.add('active');
                    }
                });
        } else {
            // No key or already retried -> Permanent Failure
            if (lightboxError) lightboxError.classList.add('active');
        }
    };
    
    // Performance improvement for mobile decoding
    lightboxImg.decoding = 'async';
    lightboxImg.src = url;
    
    // Check if cached
    if (lightboxImg.complete && lightboxImg.naturalWidth > 0) {
        lightboxImg.onload();
    }

    lightboxImg.draggable = false;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    requestUpdate();

    if (key) updateUrlState(key);

    // Attach Listeners
    lightbox.addEventListener('wheel', onWheel, { passive: false });
    lightbox.addEventListener('pointerdown', onPointerDown);
    lightbox.addEventListener('pointermove', onPointerMove);
    lightbox.addEventListener('pointerup', onPointerUp);
    lightbox.addEventListener('pointerleave', onPointerUp);
    lightbox.addEventListener('touchstart', onTouchStart, { passive: false });
    lightbox.addEventListener('touchmove', onTouchMove, { passive: false });
    
    // Specific security listener for lightbox image
    lightboxImg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}

export function initLightbox() {
    closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });

    lightbox.addEventListener('click', (e) => {
        // If clicking on the background (not image, not controls), close it.
        // Also ensure we aren't clicking the image itself (which has pointer events).
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    window.addEventListener('popstate', (e) => {
        if (lightbox.classList.contains('active')) {
             lightbox.classList.remove('active');
             document.body.style.overflow = 'auto';
        }
    });

    zoomInBtn.addEventListener('click', () => setScale(gestureState.scale + 0.6));
    zoomOutBtn.addEventListener('click', () => setScale(gestureState.scale - 0.6));
    zoomResetBtn.addEventListener('click', () => setScale(1));
}