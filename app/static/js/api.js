const CACHE_KEY_ETAG = 'galleryETag';
const CACHE_KEY_DATA = 'galleryData';

/**
 * Fetches fresh photo data from the API and updates the local cache.
 * @returns {Promise<object|null>} A promise that resolves to the new photo data or null on error.
 */
async function fetchFreshData() {
    console.log("Fetching fresh data from server.");
    try {
        const response = await fetch('/api/photos');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const newETag = response.headers.get('ETag');
        const data = await response.json();

        // If the response is valid, update localStorage.
        if (newETag && data) {
            localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
            localStorage.setItem(CACHE_KEY_ETAG, newETag);
        }
        return data;
    } catch (error) {
        console.error("Could not fetch photos:", error);
        return null;
    }
}

/**
 * Loads gallery data, validating against a cached ETag first.
 * If the cache is valid, it returns cached data. Otherwise, it fetches fresh data.
 * @returns {Promise<object|null>} A promise that resolves to the gallery photo data or null on error.
 */
export async function loadGalleryData() {
    const cachedETag = localStorage.getItem(CACHE_KEY_ETAG);
    const cachedDataJSON = localStorage.getItem(CACHE_KEY_DATA);

    // If there's no cache, fetch fresh data immediately.
    if (!cachedETag || !cachedDataJSON) {
        return await fetchFreshData();
    }

    try {
        // Send a HEAD request to check the current ETag on the server.
        const response = await fetch('/api/photos', { method: 'HEAD' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const currentETag = response.headers.get('ETag');

        // If server ETag matches cached ETag, the cache is valid.
        if (currentETag === cachedETag) {
            console.log("Cache is valid. Using cached data.");
            return JSON.parse(cachedDataJSON);
        } else {
            // Otherwise, fetch the new data.
            return await fetchFreshData();
        }
    } catch (error) {
        console.error("Failed to validate cache, falling back to cached data.", error);
        // Fallback to cached data if the validation check fails.
        return JSON.parse(cachedDataJSON);
    }
}