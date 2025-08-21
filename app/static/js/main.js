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

    // --- Lightbox Zoom & Pan State ---
    let zoomState = {
        scale: 1,
        minScale: 1,
        maxScale: 4,
        isPanning: false,
        start: { x: 0, y: 0 },
        translate: { x: 0, y: 0 }
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
            const response = await fetch('/api/photos', { method: 'HEAD' });
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

    // --- Lightbox Logic ---
    function updateImageTransform() {
        lightboxImg.style.transform = `translate(${zoomState.translate.x}px, ${zoomState.translate.y}px) scale(${zoomState.scale})`;
    }
    
    function adjustZoom(amount) {
        zoomState.scale = Math.max(zoomState.minScale, Math.min(zoomState.maxScale, zoomState.scale + amount));
        if (zoomState.scale === zoomState.minScale) {
            zoomState.translate = { x: 0, y: 0 };
            lightboxImg.classList.remove('zoomed');
        } else {
            lightboxImg.classList.add('zoomed');
        }
        updateImageTransform();
    }

    const panStart = (e) => {
        if (zoomState.scale > zoomState.minScale) {
            zoomState.isPanning = true;
            zoomState.start = { x: e.clientX - zoomState.translate.x, y: e.clientY - zoomState.translate.y };
            lightboxImg.classList.add('panning');
        }
    };
    const panMove = (e) => {
        if (zoomState.isPanning) {
            zoomState.translate.x = e.clientX - zoomState.start.x;
            zoomState.translate.y = e.clientY - zoomState.start.y;
            updateImageTransform();
        }
    };
    const panEnd = () => {
        zoomState.isPanning = false;
        lightboxImg.classList.remove('panning');
    };

    const handleWheelZoom = (e) => {
        e.preventDefault();
        adjustZoom(e.deltaY * -0.01);
    };

    function openLightbox(url) {
        lightboxImg.src = url;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Reset zoom state
        zoomState.scale = 1;
        zoomState.translate = { x: 0, y: 0 };
        updateImageTransform();
        lightboxImg.classList.remove('zoomed');

        // Add event listeners
        lightboxImg.addEventListener('wheel', handleWheelZoom);
        lightboxImg.addEventListener('mousedown', panStart);
        lightboxImg.addEventListener('mousemove', panMove);
        lightboxImg.addEventListener('mouseup', panEnd);
        lightboxImg.addEventListener('mouseleave', panEnd);
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // Remove event listeners for cleanup
        lightboxImg.removeEventListener('wheel', handleWheelZoom);
        lightboxImg.removeEventListener('mousedown', panStart);
        lightboxImg.removeEventListener('mousemove', panMove);
        lightboxImg.removeEventListener('mouseup', panEnd);
        lightboxImg.removeEventListener('mouseleave', panEnd);
    }
    
    async function init() {
        await validateCacheAndRender();

        closeBtn.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

        if (prevButton && nextButton) {
            prevButton.addEventListener('click', () => { moveToSlide((currentSlide - 1 + slides.length) % slides.length); resetSlideInterval(); });
            nextButton.addEventListener('click', () => { moveToSlide((currentSlide + 1) % slides.length); resetSlideInterval(); });
        }
        
        zoomInBtn.addEventListener('click', () => adjustZoom(0.2));
        zoomOutBtn.addEventListener('click', () => adjustZoom(-0.2));
        zoomResetBtn.addEventListener('click', () => {
            zoomState.scale = 1;
            zoomState.translate = { x: 0, y: 0 };
            updateImageTransform();
            lightboxImg.classList.remove('zoomed');
        });
    }

    init();
});