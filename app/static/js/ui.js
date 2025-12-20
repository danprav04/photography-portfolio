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
/**
 * Detects if the device is mobile based on screen width.
 * Matches the CSS breakpoint (max-width: 768px).
 */
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
                img.classList.add('loaded'); // Trigger fade-in

                // Optimization: On mobile, we DO NOT pre-load the full resolution image
                // into the grid/carousel. We stay with the thumbnail (400px width) which
                // is sufficient for mobile screens. The full res is only loaded when
                // the user explicitly opens the lightbox.
                // This saves massive bandwidth and memory, preventing lightbox load failures.
                if (fullSrc && !isMobile()) {
                    const fullImage = new Image();
                    fullImage.onload = () => {
                        img.src = fullSrc;
                        container.classList.remove('loading');
                    };
                    fullImage.onerror = () => {
                        // If full load fails, keep thumbnail but remove spinner
                        container.classList.remove('loading');
                        container.classList.add('load-error');
                    };
                    fullImage.src = fullSrc;
                } else {
                    // Mobile or no full source: stop here (keep thumbnail).
                    // We must remove 'loading' class so the click handler works.
                    container.classList.remove('loading');
                }
            };

            img.onload = handleThumbnailLoad;
            img.src = thumbnailSrc;
            
            // Handle cached images
            if (img.complete) handleThumbnailLoad();

            // Add visible class for stagger animation
            container.classList.add('visible');

            observer.unobserve(container);
        }
    });
}, { rootMargin: '100px', threshold: 0.05 });


/**
 * Renders the hero carousel.
 * Selects the top 20 newest photos.
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
        
        // Background image for the blur effect
        slide.style.backgroundImage = `url(${photo.thumbnail_url})`;

        const img = document.createElement('img');
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Featured Portfolio Image';
        
        // Prevent default drag to allow our custom swipe logic
        img.addEventListener('dragstart', (e) => e.preventDefault());

        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        slide.append(img, spinner);
        carouselTrack.appendChild(slide);

        lazyLoadObserver.observe(slide);

        // Click to open lightbox (only if not dragging)
        img.addEventListener('click', (e) => {
            if (!slide.classList.contains('loading') && !isDragging) {
                openLightbox(photo.full_url, photo.key);
            }
        });

        // Indicators
        const dot = document.createElement('button');
        dot.className = 'carousel-indicator';
        dot.ariaLabel = `Go to slide ${index + 1}`;
        carouselNav.appendChild(dot);
        dot.addEventListener('click', () => {
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

/**
 * Helper function to determine the number of columns based on viewport width.
 * Matches breakpoints: > 1200px (3 cols), 768px-1200px (2 cols), < 768px (1 col).
 */
function getColumnCount() {
    const width = window.innerWidth;
    if (width <= 768) return 1;
    if (width <= 1200) return 2;
    return 3;
}

/**
 * Renders the masonry gallery.
 * Items are distributed round-robin: 0->Col1, 1->Col2, 2->Col3, 3->Col1...
 */
function renderGallery(galleryPhotos) {
    // Store data for potential re-renders on resize
    currentGalleryPhotos = galleryPhotos;
    const numCols = getColumnCount();
    currentColumnCount = numCols;

    galleryContainer.innerHTML = '';
    
    if (!galleryPhotos || galleryPhotos.length === 0) {
        galleryContainer.innerHTML = '<p class="status-message">No photos found.</p>';
        return;
    }
    
    // Create column wrappers
    const columns = [];
    for (let i = 0; i < numCols; i++) {
        const col = document.createElement('div');
        col.className = 'gallery-column';
        columns.push(col);
        galleryContainer.appendChild(col);
    }

    // Distribute photos into columns
    galleryPhotos.forEach((photo, index) => {
        const colIndex = index % numCols;
        const targetColumn = columns[colIndex];

        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item loading';
        // Add a slight stagger to the animation delay based on index
        galleryItem.style.transitionDelay = `${(index % 5) * 50}ms`;

        const img = document.createElement('img');
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Portfolio Image';

        // Reserve vertical space to prevent layout shift
        if (photo.width && photo.height) {
            img.style.aspectRatio = `${photo.width} / ${photo.height}`;
        }

        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        galleryItem.append(img, spinner);
        targetColumn.appendChild(galleryItem);
        
        lazyLoadObserver.observe(galleryItem);

        // Pass the key to openLightbox for sharing support
        img.addEventListener('click', () => {
            if (!galleryItem.classList.contains('loading')) {
                openLightbox(photo.full_url, photo.key);
            }
        });
    });
}

// --- Resize Listener for Responsive Re-flow ---
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
    // Restart after 10 seconds of inactivity
    slideInterval = setInterval(nextSlide, 10000);
};

// --- Touch / Swipe Implementation ---
function initTouchGestures() {
    const track = carouselTrack;
    
    // Touch events
    track.addEventListener('touchstart', touchStart);
    track.addEventListener('touchend', touchEnd);
    track.addEventListener('touchmove', touchMove);
    
    // Mouse events (for desktop dragging)
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

function touchStart(index) {
    return function(event) {
        isDragging = true;
        startPos = getPositionX(event);
        carouselTrack.style.transition = 'none'; // Remove transition for instant drag following
        pauseAutoPlay();
    }
}

function touchMove(event) {
    if (isDragging) {
        const currentPosition = getPositionX(event);
        const diff = currentPosition - startPos;
        // Calculate percentage movement based on container width
        const containerWidth = carouselTrack.clientWidth;
        const movePercent = (diff / containerWidth) * 100;
        
        carouselTrack.style.transform = `translateX(${prevTranslate + movePercent}%)`;
    }
}

function touchEnd() {
    isDragging = false;
    carouselTrack.style.transition = 'transform 0.5s ease-out';
    
    const movedBy = currentTranslate - parseFloat(carouselTrack.style.transform.replace('translateX(', '').replace('%)', ''));
    
    // If moved by more than 15%, change slide
    if (movedBy < -15) {
        prevSlide();
    } else if (movedBy > 15) {
        nextSlide();
    } else {
        moveToSlide(currentSlide);
    }
}


/**
 * Initializes all UI components.
 */
export function initUI(allPhotos) {
    // Pick top 20 newest for carousel
    const featuredPhotos = allPhotos.slice(0, 20);

    // Render components
    renderCarousel(featuredPhotos);
    renderGallery(allPhotos);

    // Carousel Button Listeners
    if (prevButton && nextButton) {
        prevButton.addEventListener('click', () => {
            prevSlide();
            pauseAutoPlay();
        });
        nextButton.addEventListener('click', () => {
            nextSlide();
            pauseAutoPlay();
        });
    }
}