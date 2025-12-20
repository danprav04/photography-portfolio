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

// A flag to ensure we only schedule one frame update at a time.
let isUpdateQueued = false;

// --- URL State Management ---
/**
 * Updates the browser URL to reflect the currently viewed photo.
 * @param {string} key - The ID/Key of the photo.
 */
function updateUrlState(key) {
    if (key) {
        const newUrl = `${window.location.pathname}?id=${key}`;
        window.history.pushState({ photoKey: key }, '', newUrl);
    }
}

/**
 * Reverts the browser URL to the base state (clearing the query param).
 */
function clearUrlState() {
    const baseUrl = window.location.pathname;
    window.history.pushState({}, '', baseUrl);
}

// --- Animation Loop ---
/**
 * Applies the current gesture state (translation and scale) to the image.
 * This function is called by requestAnimationFrame, ensuring it runs efficiently
 * just before the browser repaints the screen.
 */
function applyUpdate() {
    // Apply the transform to the DOM element.
    lightboxImg.style.transform = `translate(${gestureState.translate.x}px, ${gestureState.translate.y}px) scale(${gestureState.scale})`;
    // Reset the flag so a new update can be queued.
    isUpdateQueued = false;
}

/**
 * Schedules an update to the image's transform. If an update is already
 * scheduled for the next frame, it does nothing, preventing redundant work.
 */
function requestUpdate() {
    if (!isUpdateQueued) {
        isUpdateQueued = true;
        requestAnimationFrame(applyUpdate);
    }
}

// --- Utility Functions for Gestures ---
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Ensures the image does not pan beyond its boundaries when zoomed in.
 */
function clampTranslate() {
    const imgRect = lightboxImg.getBoundingClientRect();
    const containerRect = lightbox.getBoundingClientRect();
    const extraWidth = Math.max(0, (imgRect.width - containerRect.width) / 2);
    const extraHeight = Math.max(0, (imgRect.height - containerRect.height) / 2);

    gestureState.translate.x = clamp(gestureState.translate.x, -extraWidth, extraWidth);
    gestureState.translate.y = clamp(gestureState.translate.y, -extraHeight, extraHeight);
}

/**
 * Sets the scale of the image, zooming towards a specific point on the screen.
 * @param {number} newScale - The target scale factor.
 * @param {object} center - The {x, y} coordinates to zoom towards.
 */
function setScale(newScale, center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }) {
    const oldScale = gestureState.scale;
    gestureState.scale = clamp(newScale, gestureState.minScale, gestureState.maxScale);

    if (gestureState.scale === gestureState.minScale) {
        // Reset translation when fully zoomed out.
        gestureState.translate = { x: 0, y: 0 };
        lightboxImg.classList.remove('zoomed');
    } else {
        // Adjust translation to keep the 'center' point stationary during zoom.
        const rect = lightboxImg.getBoundingClientRect();
        const mouseX = center.x - rect.left;
        const mouseY = center.y - rect.top;
        gestureState.translate.x -= (mouseX * (gestureState.scale / oldScale - 1));
        gestureState.translate.y -= (mouseY * (gestureState.scale / oldScale - 1));
        lightboxImg.classList.add('zoomed');
    }

    clampTranslate();
    requestUpdate(); // Schedule a visual update.
}

// --- Event Handlers for Gestures ---
const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
        requestUpdate(); // Schedule a visual update.
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

    // Clear Image data to free memory
    lightboxImg.src = "";
    lightboxImg.classList.remove('loaded');
    
    // Reset spinner and error
    if (lightboxSpinner) lightboxSpinner.classList.remove('active');
    if (lightboxError) lightboxError.classList.remove('active');

    // Cleanup gesture event listeners to prevent memory leaks.
    lightbox.removeEventListener('wheel', onWheel);
    lightbox.removeEventListener('pointerdown', onPointerDown);
    lightbox.removeEventListener('pointermove', onPointerMove);
    lightbox.removeEventListener('pointerup', onPointerUp);
    lightbox.removeEventListener('pointerleave', onPointerUp);
    lightbox.removeEventListener('touchstart', onTouchStart);
    lightbox.removeEventListener('touchmove', onTouchMove);

    // Reset URL
    clearUrlState();
}

/**
 * Opens the lightbox.
 * @param {string} url - The URL of the full-resolution image.
 * @param {string|null} key - The S3 key/ID of the image for sharing (optional).
 */
export function openLightbox(url, key = null) {
    // Reset state for the new image.
    gestureState.scale = 1;
    gestureState.translate = { x: 0, y: 0 };
    lightboxImg.classList.remove('zoomed', 'panning', 'loaded'); 
    
    // UI Reset
    if (lightboxError) lightboxError.classList.remove('active');
    if (lightboxSpinner) lightboxSpinner.classList.add('active');

    // --- Image Loading Logic ---
    const handleLoad = () => {
        if (lightboxSpinner) lightboxSpinner.classList.remove('active');
        lightboxImg.classList.add('loaded'); // Trigger CSS fade-in
    };

    const handleError = () => {
        if (lightboxSpinner) lightboxSpinner.classList.remove('active');
        if (lightboxError) lightboxError.classList.add('active');
    };

    lightboxImg.onload = handleLoad;
    lightboxImg.onerror = handleError;
    
    // Set source
    lightboxImg.src = url;
    
    // Check if cached immediately
    if (lightboxImg.complete && lightboxImg.naturalWidth > 0) {
        handleLoad();
    }

    lightboxImg.draggable = false;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    requestUpdate(); // Apply the reset state visually.

    // Update URL for deep linking if key is provided
    if (key) {
        updateUrlState(key);
    }

    // Add event listeners for all interactions.
    lightbox.addEventListener('wheel', onWheel, { passive: false });
    lightbox.addEventListener('pointerdown', onPointerDown);
    lightbox.addEventListener('pointermove', onPointerMove);
    lightbox.addEventListener('pointerup', onPointerUp);
    lightbox.addEventListener('pointerleave', onPointerUp);
    lightbox.addEventListener('touchstart', onTouchStart, { passive: false });
    lightbox.addEventListener('touchmove', onTouchMove, { passive: false });
}

/**
 * Initializes the main event listeners for the lightbox.
 */
export function initLightbox() {
    closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // Listen for browser back button to close lightbox
    window.addEventListener('popstate', (e) => {
        if (lightbox.classList.contains('active')) {
             lightbox.classList.remove('active');
             document.body.style.overflow = 'auto';
        }
    });

    // Zoom control buttons with a larger increment for a snappier feel.
    zoomInBtn.addEventListener('click', () => setScale(gestureState.scale + 0.6));
    zoomOutBtn.addEventListener('click', () => setScale(gestureState.scale - 0.6));
    zoomResetBtn.addEventListener('click', () => setScale(1));
}