document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const galleryContainer = document.getElementById('gallery-container');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.lightbox-close');
    const carouselTrack = document.querySelector('.carousel-track');
    const carouselNav = document.querySelector('.carousel-nav');
    const prevButton = document.querySelector('.carousel-button.prev');
    const nextButton = document.querySelector('.carousel-button.next');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    // --- State Variables ---
    let slides = [];
    let dots = [];
    let currentSlide = 0;
    let slideInterval;
    const CACHE_KEY_ETAG = 'galleryETag';
    const CACHE_KEY_DATA = 'galleryData';

    // --- Lightbox Gesture State ---
    const gestureState = {
        scale: 1,
        minScale: 1,
        maxScale: 5,
        isPanning: false,
        start: { x: 0, y: 0 },
        translate: { x: 0, y: 0 },
        initialPinchDist: 0,
    };

    /**
     * Kicks off the process of loading full-resolution images for all thumbnails.
     */
    function loadFullResolutionImages() {
        const imagesToLoad = document.querySelectorAll('img[data-full-src]');
        imagesToLoad.forEach(imgElement => {
            const fullSrc = imgElement.dataset.fullSrc;
            const fullImage = new Image();
            fullImage.src = fullSrc;

            fullImage.onload = () => {
                imgElement.src = fullSrc;
                const wrapper = imgElement.closest('.gallery-item, .carousel-slide');
                if (wrapper) {
                    wrapper.classList.remove('loading');
                }
                imgElement.removeAttribute('data-full-src');
            };
        });
    }

    /**
     * Renders the hero carousel with thumbnails and loading indicators.
     */
    function renderCarousel(featuredPhotos) {
        if (!carouselTrack || !featuredPhotos || featuredPhotos.length === 0) {
            document.querySelector('.hero-carousel').style.display = 'none';
            return;
        }
        carouselTrack.innerHTML = '';
        carouselNav.innerHTML = '';

        featuredPhotos.forEach(photo => {
            const slide = document.createElement('div');
            slide.className = 'carousel-slide loading';
            slide.style.backgroundImage = `url(${photo.thumbnail_url})`;

            const img = document.createElement('img');
            img.src = photo.thumbnail_url;
            img.alt = 'Featured Image';
            img.dataset.fullSrc = photo.full_url;

            const spinner = document.createElement('div');
            spinner.className = 'loader-spinner';

            slide.append(img, spinner);
            carouselTrack.appendChild(slide);

            img.addEventListener('click', () => {
                if (!slide.classList.contains('loading')) {
                    openLightbox(photo.full_url);
                }
            });

            const dot = document.createElement('button');
            dot.className = 'carousel-indicator';
            dot.addEventListener('click', () => {
                moveToSlide(slides.indexOf(slide));
                resetSlideInterval();
            });
            carouselNav.appendChild(dot);
        });

        slides = Array.from(carouselTrack.children);
        dots = Array.from(carouselNav.children);
        if (slides.length > 0) {
            moveToSlide(0);
            startSlideInterval();
        }
    }

    /**
     * Renders the gallery grid with thumbnails and loading indicators.
     */
    function renderGallery(galleryPhotos) {
        galleryContainer.innerHTML = '';
        if (!galleryPhotos || galleryPhotos.length === 0) {
            galleryContainer.innerHTML = '<p class="status-message">No photos found.</p>';
            return;
        }
        galleryPhotos.forEach(photo => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item loading';

            const img = document.createElement('img');
            img.src = photo.thumbnail_url;
            img.alt = 'Portfolio Image';
            img.dataset.fullSrc = photo.full_url;

            const spinner = document.createElement('div');
            spinner.className = 'loader-spinner';

            galleryItem.append(img, spinner);
            galleryContainer.appendChild(galleryItem);

            img.addEventListener('click', () => {
                if (!galleryItem.classList.contains('loading')) {
                    openLightbox(photo.full_url);
                }
            });
        });
    }

    async function fetchAndCachePhotos() {
        console.log("Fetching fresh data from server.");
        try {
            const response = await fetch('/api/photos');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const newETag = response.headers.get('ETag');
            const data = await response.json();
            if (newETag && data) {
                localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
                localStorage.setItem(CACHE_KEY_ETAG, newETag);
            }
            renderCarousel(data.featured);
            renderGallery(data.gallery);
            loadFullResolutionImages();
        } catch (error) {
            console.error("Could not fetch photos:", error);
            galleryContainer.innerHTML = '<p class="status-message">Failed to load photos.</p>';
        }
    }

    async function validateCacheAndRender() {
        const cachedETag = localStorage.getItem(CACHE_KEY_ETAG);
        const cachedDataJSON = localStorage.getItem(CACHE_KEY_DATA);
        if (!cachedETag || !cachedDataJSON) {
            await fetchAndCachePhotos();
            return;
        }
        try {
            const response = await fetch('/api/photos', {
                method: 'HEAD'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const currentETag = response.headers.get('ETag');
            const data = JSON.parse(cachedDataJSON);
            renderCarousel(data.featured);
            renderGallery(data.gallery);
            if (currentETag === cachedETag) {
                console.log("Cache is valid.");
                loadFullResolutionImages();
            } else {
                await fetchAndCachePhotos();
            }
        } catch (error) {
            console.error("Failed to validate cache, falling back to cached.", error);
            const data = JSON.parse(cachedDataJSON);
            renderCarousel(data.featured);
            renderGallery(data.gallery);
            loadFullResolutionImages();
        }
    }

    // --- Carousel Logic ---
    const moveToSlide = (targetIndex) => {
        if (!carouselTrack || slides.length === 0) return;
        carouselTrack.style.transform = `translateX(-${targetIndex * 100}%)`;
        dots[currentSlide].classList.remove('current-slide');
        dots[targetIndex].classList.add('current-slide');
        currentSlide = targetIndex;
    };
    const startSlideInterval = () => {
        slideInterval = setInterval(() => moveToSlide((currentSlide + 1) % slides.length), 5000);
    };
    const resetSlideInterval = () => {
        clearInterval(slideInterval);
        startSlideInterval();
    };

    // --- Lightbox Gesture and Zoom Logic ---
    function updateImageTransform() {
        lightboxImg.style.transform = `translate(${gestureState.translate.x}px, ${gestureState.translate.y}px) scale(${gestureState.scale})`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function clampTranslate() {
        const imgRect = lightboxImg.getBoundingClientRect();
        const containerRect = lightbox.getBoundingClientRect();
        const extraWidth = (imgRect.width - containerRect.width) / 2;
        const extraHeight = (imgRect.height - containerRect.height) / 2;

        if (extraWidth > 0) {
            gestureState.translate.x = clamp(gestureState.translate.x, -extraWidth, extraWidth);
        } else {
            gestureState.translate.x = 0;
        }
        if (extraHeight > 0) {
            gestureState.translate.y = clamp(gestureState.translate.y, -extraHeight, extraHeight);
        } else {
            gestureState.translate.y = 0;
        }
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

            gestureState.translate.x = gestureState.translate.x - (mouseX * (gestureState.scale / oldScale - 1));
            gestureState.translate.y = gestureState.translate.y - (mouseY * (gestureState.scale / oldScale - 1));
            lightboxImg.classList.add('zoomed');
        }
        clampTranslate();
        updateImageTransform();
    }
    
    // --- Event Handlers for Gestures ---
    const onPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
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
            updateImageTransform();
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

    // Mobile Pinch-to-Zoom handlers
    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            gestureState.initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    };
    const onTouchMove = (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const scale = (currentDist / gestureState.initialPinchDist) * gestureState.scale;

            const center = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
            setScale(scale, center);
            gestureState.initialPinchDist = currentDist; // Update for continuous zoom
        }
    };

    function openLightbox(url) {
        lightboxImg.src = url;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset state
        gestureState.scale = 1;
        gestureState.translate = { x: 0, y: 0 };
        updateImageTransform();
        lightboxImg.classList.remove('zoomed');

        // Add event listeners for mouse, wheel, and pointer events
        lightbox.addEventListener('wheel', onWheel, { passive: false });
        lightbox.addEventListener('pointerdown', onPointerDown);
        lightbox.addEventListener('pointermove', onPointerMove);
        lightbox.addEventListener('pointerup', onPointerUp);
        lightbox.addEventListener('pointerleave', onPointerUp);

        // Add specific touch listeners for pinch-to-zoom
        lightbox.addEventListener('touchstart', onTouchStart, { passive: false });
        lightbox.addEventListener('touchmove', onTouchMove, { passive: false });
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = 'auto';

        // Cleanup all gesture event listeners
        lightbox.removeEventListener('wheel', onWheel);
        lightbox.removeEventListener('pointerdown', onPointerDown);
        lightbox.removeEventListener('pointermove', onPointerMove);
        lightbox.removeEventListener('pointerup', onPointerUp);
        lightbox.removeEventListener('pointerleave', onPointerUp);
        lightbox.removeEventListener('touchstart', onTouchStart);
        lightbox.removeEventListener('touchmove', onTouchMove);
    }

    async function init() {
        await validateCacheAndRender();

        closeBtn.addEventListener('click', closeLightbox);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox(); });

        if (prevButton && nextButton) {
            prevButton.addEventListener('click', () => { moveToSlide((currentSlide - 1 + slides.length) % slides.length); resetSlideInterval(); });
            nextButton.addEventListener('click', () => { moveToSlide((currentSlide + 1) % slides.length); resetSlideInterval(); });
        }

        zoomInBtn.addEventListener('click', () => setScale(gestureState.scale + 0.3));
        zoomOutBtn.addEventListener('click', () => setScale(gestureState.scale - 0.3));
        zoomResetBtn.addEventListener('click', () => setScale(1));
    }

    init();
});