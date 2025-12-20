import { fetchSinglePhoto } from './api.js';

// --- DOM Element References ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxSpinner = document.getElementById('lightbox-spinner');
// New Elements
const lightboxStatus = document.getElementById('lightbox-status');
const lightboxMessage = document.getElementById('lightbox-message');
const lightboxActionBtn = document.getElementById('lightbox-action-btn');

const closeBtn = document.querySelector('.lightbox-close');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');

// --- State Variables ---
const gestureState = {
    scale: 1,
    minScale: 1,
    maxScale: 8,
    isPanning: false,
    start: { x: 0, y: 0 },
    translate: { x: 0, y: 0 },
    initialPinchDist: 0,
};

let isUpdateQueued = false;
let currentKey = null;
let currentThumbnailUrl = null;
let currentFullUrl = null;

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
    if (e.target.closest('.lightbox-controls') || e.target.closest('.lightbox-close') || e.target.closest('.lightbox-status')) return;
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

// --- Error & Fallback UI ---
function setUIState(state, message = "") {
    // Hide everything first
    if (lightboxSpinner) lightboxSpinner.classList.remove('active');
    if (lightboxStatus) lightboxStatus.classList.remove('active');
    if (lightboxActionBtn) lightboxActionBtn.classList.remove('active');
    
    if (state === 'loading') {
        if (lightboxSpinner) lightboxSpinner.classList.add('active');
        lightboxImg.classList.remove('loaded');
    } 
    else if (state === 'loaded') {
        lightboxImg.classList.add('loaded');
    }
    else if (state === 'error') {
        if (lightboxStatus) lightboxStatus.classList.add('active');
        if (lightboxMessage) {
            lightboxMessage.textContent = message || "Image failed to load.";
            lightboxMessage.style.color = "#ff6b6b";
        }
        // Show button if we have a URL to link to
        if (currentFullUrl && lightboxActionBtn) {
            lightboxActionBtn.href = currentFullUrl;
            lightboxActionBtn.textContent = "Open Original Image";
            lightboxActionBtn.classList.add('active');
        }
    }
    else if (state === 'fallback') {
        // We reuse the status div but style it as a warning
        if (lightboxStatus) lightboxStatus.classList.add('active');
        if (lightboxMessage) {
            lightboxMessage.textContent = "Preview Mode (Low Resolution)";
            lightboxMessage.style.color = "var(--accent-color)";
        }
        // Also show the button to open full res
        if (currentFullUrl && lightboxActionBtn) {
            lightboxActionBtn.href = currentFullUrl;
            lightboxActionBtn.textContent = "View Original";
            lightboxActionBtn.classList.add('active');
        }
        lightboxImg.classList.add('loaded');
    }
}

// --- Main Lightbox Functions ---
function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';

    // Cleanup
    lightboxImg.src = "";
    lightboxImg.classList.remove('loaded');
    delete lightboxImg.dataset.retried;
    
    setUIState('reset');

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
 * @param {string|null} thumbnailUrl - Optional URL for the thumbnail fallback.
 */
export function openLightbox(url, key = null, thumbnailUrl = null) {
    // Reset state
    gestureState.scale = 1;
    gestureState.translate = { x: 0, y: 0 };
    lightboxImg.classList.remove('zoomed', 'panning');
    delete lightboxImg.dataset.retried;
    currentKey = key;
    currentThumbnailUrl = thumbnailUrl;
    currentFullUrl = url;

    setUIState('loading');

    // Setup Load Handler
    lightboxImg.onload = () => {
        // If we are showing the fallback thumbnail, set UI to fallback state
        if (currentThumbnailUrl && lightboxImg.src.includes(currentThumbnailUrl)) {
             setUIState('fallback');
        } else {
             setUIState('loaded');
        }
    };

    // Setup Error/Retry Handler
    lightboxImg.onerror = () => {
        // 1. First Retry: Bypass Cache (Timestamp)
        if (currentKey && lightboxImg.dataset.retried !== 'true') {
            console.log(`Image load failed. Retrying with cache-busting for ${currentKey}...`);
            lightboxImg.dataset.retried = 'true';
            
            setUIState('loading');
            
            // Add a small delay to allow memory GC or network stability
            setTimeout(() => {
                fetchSinglePhoto(currentKey, true)
                    .then(data => {
                        if (data && data.full_url) {
                            currentFullUrl = data.full_url; // Update for button
                            lightboxImg.src = data.full_url;
                        } else {
                            throw new Error("API returned no URL");
                        }
                    })
                    .catch(err => {
                        console.error("Retry failed:", err);
                        triggerFallback();
                    });
            }, 500); // 500ms delay

        } else {
            // 2. Second Retry: Fallback to Thumbnail
            triggerFallback();
        }
    };

    function triggerFallback() {
        if (currentThumbnailUrl) {
            console.warn("Full image failed. Falling back to thumbnail.");
            // Prevent infinite loop if thumbnail also fails
            lightboxImg.onerror = () => {
                setUIState('error', "Image failed to load.");
            };
            lightboxImg.src = currentThumbnailUrl;
        } else {
            setUIState('error', "Image failed to load.");
        }
    }
    
    // REMOVED 'async' decoding to help mobile browsers with limited memory/rendering 
    lightboxImg.decoding = 'auto'; // Default behavior
    lightboxImg.src = url;
    
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