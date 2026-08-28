// ==================== LEGACY PUPPETEER SCREENSHOT SERVICE (COMMENTED OUT) ====================
// Real Chrome Live Capture Extension (`LiveCaptureModal.tsx` & extension `content.js`) handles all captures client-side directly.

const PRIMARY_SERVICE_URL = `${import.meta.env.VITE_API_URL}/take`;

export const getScreenshotUrl = (targetUrl: string): string => {
    let fullUrl = targetUrl.trim();
    if (!/^https?:\/\//.test(fullUrl)) {
        fullUrl = `https://${fullUrl}`;
    }
    const cacheBuster = new Date().getTime();
    return `${PRIMARY_SERVICE_URL}?url=${encodeURIComponent(fullUrl)}&cache_bust=${cacheBuster}`;
};

export const fetchScreenshotAsBase64 = async (targetUrl: string): Promise<string> => {
    // // Legacy server-side fetch implementation (commented out):
    // const serviceUrl = getScreenshotUrl(targetUrl);
    // const response = await fetch(serviceUrl);
    // const imageBlob = await response.blob();
    // ...
    throw new Error('Server-side Puppeteer /take is legacy. Please use Real Chrome Extension Live Capture in LiveCaptureModal.');
};