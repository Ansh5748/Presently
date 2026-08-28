import puppeteer from 'puppeteer';

async function runTest() {
  console.log('🧪 Starting Screenshot Engine Verification Test...');
  const testUrls = [
    'https://thelabellife.com/collections/clothing-skirts-bottoms',
    'https://embercookware.com',
    'https://vaaree.com'
  ];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    for (const url of testUrls) {
      console.log(`\n--------------------------------------------------`);
      console.log(`🌍 Testing URL: ${url}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0 Safari/537.36');

      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`⏱️ Navigation completed in ${Date.now() - startTime}ms`);

      // Fast Chunked Auto-Scroll with 4500px Hard Cap
      await page.evaluate(async () => {
        // Remove popups & newsletter overlays
        document.querySelectorAll('[class*="popup"], [class*="modal"], [id*="newsletter"]').forEach(e => e.remove());
        await new Promise(resolve => {
          let totalHeight = 0;
          const distance = 250;
          const maxScroll = Math.min(document.body.scrollHeight, 4500);
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= maxScroll) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 30);
        });
      });

      await new Promise(r => setTimeout(r, 400));

      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: 'webp',
        quality: 70
      });

      console.log(`✅ Screenshot Captured Successfully!`);
      console.log(`📦 Buffer Size: ${(screenshotBuffer.length / 1024).toFixed(2)} KB`);
      console.log(`⚡ Total Execution Time: ${Date.now() - startTime}ms`);

      if (screenshotBuffer.length < 5000) {
        throw new Error(`Screenshot size too small (${screenshotBuffer.length} bytes)`);
      }

      await page.close();
    }

    console.log(`\n==================================================`);
    console.log(`🎉 ALL TEST CASES PASSED SUCCESSFULLY! ZERO ERRORS.`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error(`❌ TEST FAILED:`, err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTest();
