import { openLightbox } from './lightbox.js';

// --- DOM Element References ---
const galleryContainer = document.getElementById('gallery-container');
const carouselTrack = document.querySelector('.carousel-track');
const carouselNav = document.querySelector('.carousel-nav');
const prevButton = document.querySelector('.carousel-button.prev');
const nextButton = document.querySelector('.carousel-button.next');

// --- Carousel State ---
let slides = [];
let dots = [];
let currentSlide = 0;
let slideInterval;
let autoPlayDelay = 5000;
let isDragging = false;
let startPos = 0;
let currentTranslate = 0;
let prevTranslate = 0;

// --- Gallery State ---
let currentGalleryPhotos = [];
let currentColumnCount = 0;

// --- Utilities ---
const isMobile = () => window.innerWidth <= 768;

// --- Intersection Observer for Lazy Loading & Animations ---
const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const container = entry.target;
            const img = container.querySelector('img');
            
            if (!img) return;
            
            const thumbnailSrc = img.dataset.src;
            const fullSrc = img.dataset.fullSrc;

            if (!thumbnailSrc) return;

            // Load logic
            const handleThumbnailLoad = () => {
                img.onload = null;
                img.classList.add('loaded');

                // Optimization: On mobile, only load full res on lightbox open
                if (fullSrc && !isMobile()) {
                    const fullImage = new Image();
                    fullImage.onload = () => {
                        img.src = fullSrc;
                        container.classList.remove('loading');
                    };
                    fullImage.onerror = () => {
                        container.classList.remove('loading');
                        container.classList.add('load-error');
                    };
                    fullImage.src = fullSrc;
                } else {
                    container.classList.remove('loading');
                }
            };

            img.onload = handleThumbnailLoad;
            img.src = thumbnailSrc;
            
            if (img.complete) handleThumbnailLoad();

            container.classList.add('visible');
            observer.unobserve(container);
        }
    });
}, { rootMargin: '100px', threshold: 0.05 });


/**
 * Renders the hero carousel.
 */
function renderCarousel(featuredPhotos) {
    if (!carouselTrack || !featuredPhotos || featuredPhotos.length === 0) {
        const heroCarousel = document.querySelector('.hero-carousel');
        if (heroCarousel) heroCarousel.style.display = 'none';
        return;
    }
    
    carouselTrack.innerHTML = '';
    carouselNav.innerHTML = '';

    featuredPhotos.forEach((photo, index) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide loading';
        
        slide.style.backgroundImage = `url(${photo.thumbnail_url})`;

        const img = document.createElement('img');
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Featured Portfolio Image';
        
        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        slide.append(img, spinner);
        carouselTrack.appendChild(slide);

        lazyLoadObserver.observe(slide);

        slide.addEventListener('click', (e) => {
            if (!slide.classList.contains('loading') && !isDragging) {
                // PASS THUMBNAIL URL FOR FALLBACK
                openLightbox(photo.full_url, photo.key, photo.thumbnail_url);
            }
        });

        const dot = document.createElement('button');
        dot.className = 'carousel-indicator';
        dot.ariaLabel = `Go to slide ${index + 1}`;
        carouselNav.appendChild(dot);
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            moveToSlide(index);
            pauseAutoPlay();
        });
    });

    slides = Array.from(carouselTrack.children);
    dots = Array.from(carouselNav.children);

    if (slides.length > 0) {
        moveToSlide(0);
        startSlideInterval();
        initTouchGestures();
    }
}

function getColumnCount() {
    const width = window.innerWidth;
    if (width <= 768) return 1;
    if (width <= 1200) return 2;
    return 3;
}

/**
 * Renders the masonry gallery.
 */
function renderGallery(galleryPhotos) {
    currentGalleryPhotos = galleryPhotos;
    const numCols = getColumnCount();
    currentColumnCount = numCols;

    galleryContainer.innerHTML = '';
    
    if (!galleryPhotos || galleryPhotos.length === 0) {
        galleryContainer.innerHTML = '<p class="status-message">No photos found.</p>';
        return;
    }
    
    const columns = [];
    for (let i = 0; i < numCols; i++) {
        const col = document.createElement('div');
        col.className = 'gallery-column';
        columns.push(col);
        galleryContainer.appendChild(col);
    }

    galleryPhotos.forEach((photo, index) => {
        const colIndex = index % numCols;
        const targetColumn = columns[colIndex];

        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item loading';
        galleryItem.style.transitionDelay = `${(index % 5) * 50}ms`;

        const img = document.createElement('img');
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Portfolio Image';

        if (photo.width && photo.height) {
            img.style.aspectRatio = `${photo.width} / ${photo.height}`;
        }

        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        galleryItem.append(img, spinner);
        targetColumn.appendChild(galleryItem);
        
        lazyLoadObserver.observe(galleryItem);

        galleryItem.addEventListener('click', () => {
            if (!galleryItem.classList.contains('loading')) {
                // PASS THUMBNAIL URL FOR FALLBACK
                openLightbox(photo.full_url, photo.key, photo.thumbnail_url);
            }
        });
    });
}

// --- Resize Listener ---
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const newColCount = getColumnCount();
        if (newColCount !== currentColumnCount && currentGalleryPhotos.length > 0) {
            renderGallery(currentGalleryPhotos);
        }
    }, 200);
});

// --- Carousel Logic & Swipe Support ---
const moveToSlide = (targetIndex) => {
    if (!carouselTrack || slides.length === 0) return;
    
    currentSlide = targetIndex;
    currentTranslate = currentSlide * -100;
    prevTranslate = currentTranslate;
    
    carouselTrack.style.transform = `translateX(${currentTranslate}%)`;
    
    dots.forEach(d => d.classList.remove('current-slide'));
    if(dots[currentSlide]) dots[currentSlide].classList.add('current-slide');
};

const nextSlide = () => {
    const next = (currentSlide + 1) % slides.length;
    moveToSlide(next);
};

const prevSlide = () => {
    const prev = (currentSlide - 1 + slides.length) % slides.length;
    moveToSlide(prev);
};

const startSlideInterval = () => {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, autoPlayDelay);
};

const pauseAutoPlay = () => {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 10000);
};

// --- Touch / Swipe Implementation ---
function initTouchGestures() {
    const track = carouselTrack;
    track.addEventListener('touchstart', touchStart);
    track.addEventListener('touchend', touchEnd);
    track.addEventListener('touchmove', touchMove);
    track.addEventListener('mousedown', touchStart);
    track.addEventListener('mouseup', touchEnd);
    track.addEventListener('mouseleave', () => {
        if(isDragging) touchEnd();
    });
    track.addEventListener('mousemove', touchMove);
}

function getPositionX(event) {
    return event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
}

function touchStart(event) {
    if (event.target.closest('.carousel-controls') || event.target.closest('.carousel-nav')) {
        return;
    }
    isDragging = true;
    startPos = getPositionX(event);
    carouselTrack.style.transition = 'none';
    pauseAutoPlay();
}

function touchMove(event) {
    if (isDragging) {
        const currentPosition = getPositionX(event);
        const diff = currentPosition - startPos;
        const containerWidth = carouselTrack.clientWidth;
        const movePercent = (diff / containerWidth) * 100;
        carouselTrack.style.transform = `translateX(${prevTranslate + movePercent}%)`;
    }
}

function touchEnd() {
    if (!isDragging) return;
    isDragging = false;
    carouselTrack.style.transition = 'transform 0.5s ease-out';
    
    const movedBy = currentTranslate - parseFloat(carouselTrack.style.transform.replace('translateX(', '').replace('%)', ''));
    
    if (movedBy < -15) {
        prevSlide();
    } else if (movedBy > 15) {
        nextSlide();
    } else {
        moveToSlide(currentSlide);
    }
}

export function initUI(allPhotos) {
    const featuredPhotos = allPhotos.slice(0, 20);
    renderCarousel(featuredPhotos);
    renderGallery(allPhotos);

    if (prevButton && nextButton) {
        prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            prevSlide();
            pauseAutoPlay();
        });
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            nextSlide();
            pauseAutoPlay();
        });
    }
}