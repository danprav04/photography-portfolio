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
        // A standard GET request. The browser will automatically handle sending the
        // If-None-Match header if it has a cached ETag for this URL. The server
        // will respond with 304 Not Modified if the data hasn't changed, and
        // the browser will serve the response from its cache.
        const response = await fetch('/api/photos');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // If the server explicitly returns no content, provide an empty array.
        if (response.status === 204) {
             return [];
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Could not fetch photos:", error);
        // In case of a network or server error, return null to be handled gracefully.
        return null;
    }
}