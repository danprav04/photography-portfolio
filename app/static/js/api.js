const CACHE_KEY_ETAG = 'galleryETag';
const CACHE_KEY_DATA = 'galleryData';

/**
 * Fetches fresh photo data from the API and updates the local cache.
 * @returns {Promise<Array|null>} A promise that resolves to the new photo data or null on error.
 */
async function fetchFreshPhotoData() {
    console.log("Fetching fresh photo data from server.");
    try {
        const response = await fetch('/api/photos');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const newETag = response.headers.get('ETag');
        const data = await response.json();

        if (newETag && data) {
            localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
            localStorage.setItem(CACHE_KEY_ETAG, newETag);
        }
        return data;
    } catch (error)
    {
        console.error("Could not fetch photos:", error);
        return null;
    }
}

/**
 * Loads photo data, validating against a cached ETag first.
 * If the cache is valid, it returns cached data. Otherwise, it fetches fresh data.
 * @returns {Promise<Array|null>} A promise that resolves to the photo data or null on error.
 */
export async function loadPhotoData() {
    const cachedETag = localStorage.getItem(CACHE_KEY_ETAG);
    const cachedDataJSON = localStorage.getItem(CACHE_KEY_DATA);

    if (!cachedETag || !cachedDataJSON) {
        return await fetchFreshPhotoData();
    }

    try {
        const response = await fetch('/api/photos', { method: 'HEAD' });
        
        // Browsers automatically handle 304 Not Modified based on ETag,
        // but we double-check the ETag header manually for robustness.
        const currentETag = response.headers.get('ETag');
        if (response.status === 304 || currentETag === cachedETag) {
             console.log("Photo cache is valid. Using cached data.");
             return JSON.parse(cachedDataJSON);
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await fetchFreshPhotoData();

    } catch (error) {
        console.error("Failed to validate cache, falling back to cached data.", error);
        return JSON.parse(cachedDataJSON);
    }
}