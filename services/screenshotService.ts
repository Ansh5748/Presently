const PRIMARY_SERVICE_URL = `${import.meta.env.VITE_API_URL}/take`;

/**
 * Generates a screenshot URL, prioritizing the primary local service.
 * If the primary service is not running, it provides a fallback URL.
 * Note: This function does not actually fetch; it constructs the URL string.
 * @param targetUrl The website URL to screenshot.
 * @returns A URL string for an <img> src attribute.
 */
export const getScreenshotUrl = (targetUrl: string): string => {
    // 1. Sanitize and prepare the URL
    let fullUrl = targetUrl.trim();
    if (!/^https?:\/\//.test(fullUrl)) {
        fullUrl = `https://${fullUrl}`;
    }

    // 2. Add a cache-busting parameter to ensure a fresh screenshot
    const cacheBuster = new Date().getTime();

    // 3. Construct the primary service URL
    // We will use our own service as the main one.
    // The fallback can be used if the local service is down, but for now we'll rely on our own.
    return `${PRIMARY_SERVICE_URL}?url=${encodeURIComponent(fullUrl)}&cache_bust=${cacheBuster}`;
};

/**
 * Fetches a screenshot from the service and returns it as a base64 data URL.
 * This is more robust as it ensures the image is generated before being displayed.
 * @param targetUrl The website URL to screenshot.
 * @returns A promise that resolves to a base64 string (e.g., "data:image/png;base64,...").
 */
export const fetchScreenshotAsBase64 = async (targetUrl: string): Promise<string> => {
    console.log(`[screenshotService] 1. Starting fetch for: ${targetUrl}`);
    const serviceUrl = getScreenshotUrl(targetUrl);
    console.log(`[screenshotService] 2. Constructed service URL: ${serviceUrl}`);

    try {
        console.log(`[screenshotService] 3. Making fetch request...`);
        const response = await fetch(serviceUrl);
        console.log(`[screenshotService] 4. Received response. Status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`Screenshot service failed with status: ${response.status}`);
        }

        const imageBlob = await response.blob();
        console.log(`[screenshotService] 5. Converted response to blob. Size: ${imageBlob.size} bytes, Type: ${imageBlob.type}`);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                console.log(`[screenshotService] 6. Converted blob to base64. Length: ${base64String.length}`);
                resolve(base64String);
            };
            reader.onerror = (error) => {
                console.error("[screenshotService] FileReader error:", error);
                reject(error);
            };
            reader.readAsDataURL(imageBlob);
        });
    } catch (error) {
        console.error("Failed to fetch or convert screenshot:", error);
        throw error; // Re-throw to be handled by the caller
    }
};