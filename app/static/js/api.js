/**
 * Loads photo data from the API.
 * This function specifically disables caching to ensure that the S3 Presigned URLs
 * returned by the server are always fresh and valid.
 * 
 * @returns {Promise<Array|null>} A promise that resolves to the photo data or null on error.
 */
export async function loadPhotoData() {
    console.log("Fetching photo data from server.");
    try {
        // Add a timestamp to the URL to bust any aggressive ISP/proxy caching
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/photos?_t=${timestamp}`, {
            method: 'GET',
            cache: 'no-store', // Tell browser not to look in cache
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
            }
        });

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
 * Used for deep linking / sharing and for retrying expired links.
 * 
 * @param {string} key - The S3 object key of the photo.
 * @param {boolean} bypassCache - If true, adds a timestamp to force a fresh fetch from the server.
 * @returns {Promise<Object>} A promise resolving to the single photo object.
 * @throws {Error} If the fetch fails.
 */
export async function fetchSinglePhoto(key, bypassCache = false) {
    if (!key) throw new Error("No photo key provided");
    
    // Encode the key to handle slashes/special chars in URL safe way
    const encodedKey = encodeURIComponent(key);
    let url = `/api/photo/${encodedKey}`;
    
    // Always append timestamp or use fetch options to ensure freshness 
    // for single photo retrieval as well.
    const timestamp = Date.now();
    url += `?_t=${timestamp}`;

    if (bypassCache) {
        console.log(`Bypassing cache for photo: ${key}`);
    } else {
        console.log(`Fetching single photo: ${key}`);
    }
    
    const response = await fetch(url, {
        cache: 'no-store',
        headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
        }
    });
    
    if (!response.ok) {
        // Throw error to be caught by the UI layer
        throw new Error(`Server error: ${response.status}`);
    }
    
    return await response.json();
}