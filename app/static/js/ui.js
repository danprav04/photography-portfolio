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

// --- Intersection Observer for Lazy Loading ---
const observerOptions = {
    root: null, // observes intersections relative to the viewport
    rootMargin: '0px 0px 300px 0px', // trigger when 300px away from the bottom of the viewport
    threshold: 0.01 // trigger as soon as a tiny part is visible
};

const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const container = entry.target;
            const img = container.querySelector('img');
            const thumbnailSrc = img.dataset.src;
            const fullSrc = img.dataset.fullSrc;

            if (!thumbnailSrc) return;

            // Define the complete loading logic in a function to avoid repetition.
            const handleImageLoad = () => {
                // The thumbnail is now loaded, so make it visible.
                img.style.opacity = 1;

                // --- Stage 2: Load the full-resolution image in the background ---
                if (fullSrc) {
                    const fullImage = new Image();
                    fullImage.src = fullSrc;

                    fullImage.onload = () => {
                        // Once the full image is fully loaded, swap the src
                        // and remove the loading spinner for the final state.
                        img.src = fullSrc;
                        container.classList.remove('loading');
                    };
                } else {
                    // If for some reason there's no full-res image, just remove the spinner.
                    container.classList.remove('loading');
                }
            };

            // --- FIX: Attach the event handler BEFORE setting the src attribute. ---
            // This prevents a race condition where the image loads from cache
            // before the onload handler is attached.
            img.onload = handleImageLoad;

            // --- Set the src to initiate the download. ---
            img.src = thumbnailSrc;

            // --- FIX: Add a fallback for cached images. ---
            // If the image is already in the browser's cache, the `load` event
            // may have already fired. The `img.complete` property will be true in this
            // case, so we manually call the handler to ensure the UI updates.
            if (img.complete) {
                handleImageLoad();
            }

            // We've initiated the loading process, so we can stop observing this element.
            observer.unobserve(container);
        }
    });
}, observerOptions);


/**
 * Shuffles an array in place and returns a new array containing the first `count` items.
 * Uses the Fisher-Yates (aka Knuth) shuffle algorithm for an unbiased shuffle.
 * @param {Array} array The array to shuffle.
 * @param {number} count The number of items to return from the shuffled array.
 * @returns {Array} A new array with `count` random items.
 */
function shuffleAndPick(array, count) {
    const shuffled = [...array]; // Create a shallow copy to avoid modifying the original.
    let currentIndex = shuffled.length;
    let randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex !== 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [shuffled[currentIndex], shuffled[randomIndex]] = [
            shuffled[randomIndex], shuffled[currentIndex]];
    }

    return shuffled.slice(0, count);
}

/**
 * Renders the hero carousel with placeholders for lazy loading.
 * @param {Array} featuredPhotos - An array of photo objects for the carousel.
 */
function renderCarousel(featuredPhotos) {
    if (!carouselTrack || !featuredPhotos || featuredPhotos.length === 0) {
        const heroCarousel = document.querySelector('.hero-carousel');
        if (heroCarousel) heroCarousel.style.display = 'none';
        return;
    }
    carouselTrack.innerHTML = '';
    carouselNav.innerHTML = '';

    featuredPhotos.forEach(photo => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide loading';
        slide.style.backgroundImage = `url(${photo.thumbnail_url})`;

        const img = document.createElement('img');
        // Use a placeholder src and store the real sources in data attributes
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Featured Image';
        img.style.opacity = 0; // Set initial opacity to 0 for fade-in

        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        slide.append(img, spinner);
        carouselTrack.appendChild(slide);

        // Add the slide to the observer to be lazy-loaded
        lazyLoadObserver.observe(slide);

        img.addEventListener('click', () => {
            if (!slide.classList.contains('loading')) {
                openLightbox(photo.full_url);
            }
        });

        const dot = document.createElement('button');
        dot.className = 'carousel-indicator';
        carouselNav.appendChild(dot);
    });

    slides = Array.from(carouselTrack.children);
    dots = Array.from(carouselNav.children);

    if (slides.length > 0) {
        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                moveToSlide(index);
                resetSlideInterval();
            });
        });
        moveToSlide(0);
        startSlideInterval();
    }
}

/**
 * Renders the masonry gallery grid with placeholders for lazy loading.
 * @param {Array} galleryPhotos - An array of all photo objects for the gallery.
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
        // Use a placeholder src and store the real sources in data attributes
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        img.dataset.src = photo.thumbnail_url;
        img.dataset.fullSrc = photo.full_url;
        img.alt = 'Portfolio Image';
        img.style.opacity = 0; // Set initial opacity to 0 for fade-in

        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';

        galleryItem.append(img, spinner);
        galleryContainer.appendChild(galleryItem);
        
        // Add the item to the observer to be lazy-loaded
        lazyLoadObserver.observe(galleryItem);

        img.addEventListener('click', () => {
            if (!galleryItem.classList.contains('loading')) {
                openLightbox(photo.full_url);
            }
        });
    });
}

// --- Carousel Logic ---
const moveToSlide = (targetIndex) => {
    if (!carouselTrack || slides.length === 0) return;
    carouselTrack.style.transform = `translateX(-${targetIndex * 100}%)`;
    if(dots[currentSlide]) dots[currentSlide].classList.remove('current-slide');
    if(dots[targetIndex]) dots[targetIndex].classList.add('current-slide');
    currentSlide = targetIndex;
};
const startSlideInterval = () => {
    slideInterval = setInterval(() => moveToSlide((currentSlide + 1) % slides.length), 5000);
};
const resetSlideInterval = () => {
    clearInterval(slideInterval);
    startSlideInterval();
};

/**
 * Initializes all UI components. It randomizes featured photos from the main
 * list before rendering the carousel and gallery.
 * @param {Array} allPhotos - The complete, sorted list of photos from the API.
 */
export function initUI(allPhotos) {
    // --- Randomization Logic ---
    const totalPhotos = allPhotos.length;
    const poolSize = Math.max(5, Math.floor(totalPhotos * 0.20));
    const carouselPool = allPhotos.slice(0, poolSize);
    const numFeatured = Math.min(5, carouselPool.length);
    const featuredPhotos = shuffleAndPick(carouselPool, numFeatured);

    // The gallery always shows all photos.
    const galleryPhotos = allPhotos;
    
    // --- Rendering ---
    renderCarousel(featuredPhotos);
    renderGallery(galleryPhotos);

    if (prevButton && nextButton) {
        prevButton.addEventListener('click', () => {
            moveToSlide((currentSlide - 1 + slides.length) % slides.length);
            resetSlideInterval();
        });
        nextButton.addEventListener('click', () => {
            moveToSlide((currentSlide + 1) % slides.length);
            resetSlideInterval();
        });
    }
}