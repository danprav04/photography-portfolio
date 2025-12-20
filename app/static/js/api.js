/**
 * Loads photo data from the API.
 * This function relies on the browser's standard HTTP caching (via ETags sent
 * by the server), but does not implement any additional client-side application
 * caching in localStorage.
 * @returns {Promise<Array|null>} A promise that resolves to the photo data or null on error.
 */
export async function loadPhotoData() {
    console.log("Fetching photo data from server.");
    try {
        const response = await fetch('/api/photos');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (response.status === 204) {
             return [];
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Could not fetch photos:", error);
        return null;
    }
}

/**
 * Loads a single photo's details (Presigned URL) by its key.
 * Used for deep linking / sharing.
 * @param {string} key - The S3 object key of the photo.
 * @returns {Promise<Object|null>} A promise resolving to the single photo object or null.
 */
export async function fetchSinglePhoto(key) {
    if (!key) return null;
    console.log(`Fetching single photo: ${key}`);
    try {
        // Encode the key to handle slashes/special chars in URL safe way
        const encodedKey = encodeURIComponent(key);
        const response = await fetch(`/api/photo/${encodedKey}`);
        
        if (!response.ok) {
            console.warn(`Could not load shared photo: ${response.status}`);
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error("Error fetching single photo:", error);
        return null;
    }
}