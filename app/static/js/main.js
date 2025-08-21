document.addEventListener('DOMContentLoaded', () => {
    const galleryContainer = document.getElementById('gallery-container');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.lightbox-close');

    // Carousel elements
    const carouselTrack = document.querySelector('.carousel-track');
    const carouselNav = document.querySelector('.carousel-nav');
    const prevButton = document.querySelector('.carousel-button.prev');
    const nextButton = document.querySelector('.carousel-button.next');
    let slides = [];
    let dots = [];
    let currentSlide = 0;
    let slideInterval;

    const CACHE_KEY_ETAG = 'galleryETag';
    const CACHE_KEY_DATA = 'galleryData';

    /**
     * Renders the hero carousel with featured photos.
     * @param {object[]} featuredPhotos - Array of photo objects.
     */
    function renderCarousel(featuredPhotos) {
        if (!carouselTrack || !featuredPhotos || featuredPhotos.length === 0) {
            document.querySelector('.hero-carousel').style.display = 'none';
            return;
        }

        carouselTrack.innerHTML = '';
        carouselNav.innerHTML = '';

        featuredPhotos.forEach((photo, index) => {
            // Create slide
            const slide = document.createElement('div');
            slide.className = 'carousel-slide';
            const img = document.createElement('img');
            img.src = photo.thumbnail_url;
            img.alt = `Featured Image ${index + 1}`;
            img.loading = 'lazy';
            img.addEventListener('click', () => openLightbox(photo.full_url));
            slide.appendChild(img);
            carouselTrack.appendChild(slide);

            // Create indicator dot
            const dot = document.createElement('button');
            dot.className = 'carousel-indicator';
            dot.addEventListener('click', () => {
                moveToSlide(index);
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
     * Renders photos in the gallery's masonry grid.
     * @param {object[]} galleryPhotos - An array of photo objects.
     */
    function renderGallery(galleryPhotos) {
        galleryContainer.innerHTML = ''; // Clear the loading/status message

        if (!galleryPhotos || galleryPhotos.length === 0) {
            galleryContainer.innerHTML = '<p class="status-message">No photos found in the gallery.</p>';
            return;
        }

        galleryPhotos.forEach(photo => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';

            const img = document.createElement('img');
            img.src = photo.thumbnail_url;
            img.alt = 'Portfolio Image';
            img.loading = 'lazy';
            img.dataset.fullSrc = photo.full_url;

            img.addEventListener('click', () => openLightbox(img.dataset.fullSrc));

            galleryItem.appendChild(img);
            galleryContainer.appendChild(galleryItem);
        });
    }

    /**
     * Fetches the latest photo data from the server and caches it.
     */
    async function fetchAndCachePhotos() {
        console.log("Cache miss or invalid. Fetching fresh data from server.");
        try {
            const response = await fetch('/api/photos');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const newETag = response.headers.get('ETag');
            const data = await response.json();

            if (newETag && data) {
                localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
                localStorage.setItem(CACHE_KEY_ETAG, newETag);
                console.log("New data fetched and cached successfully.");
            }

            renderCarousel(data.featured);
            renderGallery(data.gallery);

        } catch (error) {
            console.error("Could not fetch photos:", error);
            galleryContainer.innerHTML = '<p class="status-message">Failed to load photos. Please try again later.</p>';
        }
    }

    /**
     * Checks if the cached data is still valid by comparing ETags with the server.
     */
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

            if (currentETag === cachedETag) {
                console.log("Cache is valid. Rendering from localStorage.");
                const data = JSON.parse(cachedDataJSON);
                renderCarousel(data.featured);
                renderGallery(data.gallery);
            } else {
                await fetchAndCachePhotos();
            }
        } catch (error) {
            console.error("Failed to validate cache, falling back to cached version.", error);
            const data = JSON.parse(cachedDataJSON);
            renderCarousel(data.featured);
            renderGallery(data.gallery);
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
        slideInterval = setInterval(() => {
            const nextIndex = (currentSlide + 1) % slides.length;
            moveToSlide(nextIndex);
        }, 5000); // Change slide every 5 seconds
    };

    const resetSlideInterval = () => {
        clearInterval(slideInterval);
        startSlideInterval();
    };

    // --- Lightbox Logic ---
    function openLightbox(url) {
        lightboxImg.src = url;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        lightboxImg.src = ''; // Clear src to stop loading
        document.body.style.overflow = 'auto';
    }

    /**
     * Initializes the application.
     */
    async function init() {
        await validateCacheAndRender();

        // Event listeners for closing the lightbox
        closeBtn.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
        });

        // Event listeners for carousel navigation
        if (prevButton && nextButton) {
            prevButton.addEventListener('click', () => {
                const prevIndex = (currentSlide - 1 + slides.length) % slides.length;
                moveToSlide(prevIndex);
                resetSlideInterval();
            });
            nextButton.addEventListener('click', () => {
                const nextIndex = (currentSlide + 1) % slides.length;
                moveToSlide(nextIndex);
                resetSlideInterval();
            });
        }
    }

    init();
});