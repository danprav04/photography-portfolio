// --- DOM Element References ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
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

    // Cleanup gesture event listeners to prevent memory leaks.
    lightbox.removeEventListener('wheel', onWheel);
    lightbox.removeEventListener('pointerdown', onPointerDown);
    lightbox.removeEventListener('pointermove', onPointerMove);
    lightbox.removeEventListener('pointerup', onPointerUp);
    lightbox.removeEventListener('pointerleave', onPointerUp);
    lightbox.removeEventListener('touchstart', onTouchStart);
    lightbox.removeEventListener('touchmove', onTouchMove);
}

export function openLightbox(url) {
    lightboxImg.src = url;
    lightboxImg.draggable = false;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Reset state for the new image.
    gestureState.scale = 1;
    gestureState.translate = { x: 0, y: 0 };
    lightboxImg.classList.remove('zoomed', 'panning');
    requestUpdate(); // Apply the reset state visually.

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

    // Zoom control buttons with a larger increment for a snappier feel.
    zoomInBtn.addEventListener('click', () => setScale(gestureState.scale + 0.6));
    zoomOutBtn.addEventListener('click', () => setScale(gestureState.scale - 0.6));
    zoomResetBtn.addEventListener('click', () => setScale(1));
}