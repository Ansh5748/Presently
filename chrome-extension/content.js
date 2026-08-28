// ============================================================
// PRESENTLY LIVE CAPTURE
// content.js
// ============================================================
//
// Runs on:
// 1. Presently
// 2. The real webpage being captured
//
// Presently:
//   window.postMessage()
//       ↓
//   chrome.runtime
//       ↓
//   background.js
//
// Target webpage:
//   background.js
//       ↓
//   chrome.runtime
//       ↓
//   this script
//
if (window.__PRESENTLY_CONTENT_SCRIPT_LOADED__) {
  console.log('[PCT] Content script already initialized on this window - skipping duplicate init.');
} else {
  window.__PRESENTLY_CONTENT_SCRIPT_LOADED__ = true;

  let captureSession = null;


  // ============================================================
  // CONFIG
  // ============================================================

  // Scroll approximately 88% of viewport.
  // This keeps enough overlap for stitching.
  const SCROLL_RATIO = 0.88;


  // Wait after every scroll.
  // Gives lazy-loaded content time to appear.
  const SCROLL_SETTLE_MS = 450;


  // Additional wait at the bottom.
  // Important for ecommerce / lazy-loaded pages.
  const BOTTOM_WAIT_MS = 1800;


  // Maximum number of times we allow the page
  // to grow while sitting at the bottom.
  const MAX_BOTTOM_RECHECKS = 4;


  // Small wait after initial scroll-to-top.
  const INITIAL_SETTLE_MS = 800;


  // ============================================================
  // PRESENTLY PAGE → EXTENSION
  // ============================================================

  window.addEventListener(
    'message',
    event => {

      if (
        event.source !== window
      ) {
        return;
      }


      const data =
        event.data;


      if (
        !data ||
        !data.type
      ) {
        return;
      }


      // --------------------------------------------------------
      // START
      // --------------------------------------------------------

      if (
        data.type ===
        'PRESENTLY_LIVE_CAPTURE_REQUEST'
      ) {

        console.log(
          '[PCT] PRESENTLY → EXTENSION START',
          {
            requestId:
              data.requestId,

            url:
              data.url,

            device:
              data.device
          }
        );


        chrome.runtime.sendMessage(
          {
            type:
              'PRESENTLY_LIVE_CAPTURE_REQUEST',

            requestId:
              data.requestId,

            url:
              data.url,

            device:
              data.device
          }
        )
          .then(
            () => {

              console.log(
                '[PCT] START SENT TO BACKGROUND'
              );
            }
          )
          .catch(
            error => {

              console.error(
                '[PCT] START SEND FAILED',
                error
              );
            }
          );


        return;
      }


      // --------------------------------------------------------
      // CANCEL
      // --------------------------------------------------------

      if (
        data.type ===
        'PRESENTLY_LIVE_CAPTURE_CANCEL'
      ) {

        console.log(
          '[PCT] PRESENTLY → EXTENSION CANCEL',
          {
            requestId:
              data.requestId
          }
        );


        chrome.runtime.sendMessage(
          {
            type:
              'PRESENTLY_LIVE_CAPTURE_CANCEL',

            requestId:
              data.requestId
          }
        )
          .catch(
            error => {

              console.error(
                '[PCT] CANCEL SEND FAILED',
                error
              );
            }
          );


        return;
      }
    }
  );


  // ============================================================
  // CHUNKED MESSAGING HELPER
  // ============================================================

  const chunkAccumulators = new Map();

  async function sendChunkedMessage(target, baseMessage, largeField, payloadString) {
    const CHUNK_SIZE = 300000;
    if (!payloadString || payloadString.length <= CHUNK_SIZE) {
      if (target === 'runtime') {
        await chrome.runtime.sendMessage({ ...baseMessage, [largeField]: payloadString });
      } else if (target === 'window') {
        window.postMessage({ ...baseMessage, [largeField]: payloadString }, window.location.origin);
      }
      return;
    }

    const totalChunks = Math.ceil(payloadString.length / CHUNK_SIZE);
    const chunkType = `${baseMessage.type}_CHUNK`;

    for (let i = 0; i < totalChunks; i++) {
      const chunkData = payloadString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkMsg = {
        ...baseMessage,
        type: chunkType,
        chunkIndex: i,
        totalChunks,
        chunkData
      };
      delete chunkMsg[largeField];

      if (target === 'runtime') {
        await chrome.runtime.sendMessage(chunkMsg);
      } else if (target === 'window') {
        window.postMessage(chunkMsg, window.location.origin);
      }
    }
  }

  function processIncomingChunk(message, onComplete) {
    const key = `${message.type}_${message.requestId}`;
    let item = chunkAccumulators.get(key);
    if (!item) {
      item = { chunks: new Array(message.totalChunks), count: 0, meta: message };
      chunkAccumulators.set(key, item);
    }
    if (!item.chunks[message.chunkIndex]) {
      item.chunks[message.chunkIndex] = message.chunkData;
      item.count++;
    }
    if (item.count === message.totalChunks) {
      chunkAccumulators.delete(key);
      const fullPayload = item.chunks.join('');
      const originalType = message.type.replace('_CHUNK', '');
      const completeMsg = { ...item.meta, type: originalType, image: fullPayload };
      delete completeMsg.chunkIndex;
      delete completeMsg.totalChunks;
      delete completeMsg.chunkData;
      onComplete(completeMsg);
    }
  }

  // ============================================================
  // EXTENSION → PAGE
  // ============================================================

  chrome.runtime.onMessage.addListener(
    message => {

      if (
        !message ||
        !message.type
      ) {
        return;
      }


      console.log(
        '[PCT] EXTENSION → PAGE',
        {
          type:
            message.type,

          requestId:
            message.requestId,

          progress:
            message.progress,

          scrollY:
            message.scrollY,

          imageLength:
            message.image?.length ||
            0
        }
      );


      // --------------------------------------------------------
      // Incoming chunked messages.
      // --------------------------------------------------------

      if (message.type.endsWith('_CHUNK')) {
        processIncomingChunk(message, (assembledMsg) => {
          if (
            assembledMsg.type === 'PRESENTLY_LIVE_CAPTURE_TILE' ||
            assembledMsg.type === 'PRESENTLY_LIVE_CAPTURE_RESULT' ||
            assembledMsg.type === 'PRESENTLY_CAPTURE_ERROR'
          ) {
            sendChunkedMessage('window', assembledMsg, 'image', assembledMsg.image);
            console.log('[PCT] CHUNK REASSEMBLED & FORWARDED TO REACT', assembledMsg.type);
          }
        });
        return;
      }


      // --------------------------------------------------------
      // Messages going back to Presently React.
      // --------------------------------------------------------

      if (
        message.type ===
        'PRESENTLY_LIVE_CAPTURE_TILE' ||

        message.type ===
        'PRESENTLY_LIVE_CAPTURE_RESULT' ||

        message.type ===
        'PRESENTLY_CAPTURE_ERROR'
      ) {

        sendChunkedMessage('window', message, 'image', message.image);


        console.log(
          '[PCT] FORWARDED TO REACT',
          message.type
        );


        return;
      }


      // --------------------------------------------------------
      // Start capture on REAL target webpage.
      // --------------------------------------------------------

      if (
        message.type ===
        'PRESENTLY_START_REAL_CAPTURE'
      ) {

        console.log(
          '[PCT] START_REAL_CAPTURE',
          {
            requestId:
              message.requestId,

            url:
              window.location.href
          }
        );


        startRealCapture(
          message.requestId
        );


        return;
      }


      // --------------------------------------------------------
      // Screenshot tile from background.
      // --------------------------------------------------------

      if (
        message.type ===
        'PRESENTLY_CAPTURE_CURRENT_TILE'
      ) {

        receiveCaptureTile(
          message
        );


        return;
      }


      // --------------------------------------------------------
      // Stop & stitch capture early on demand.
      // --------------------------------------------------------

      if (
        message.type ===
        'PRESENTLY_LIVE_CAPTURE_STOP'
      ) {
        console.log('[PCT] STOP REQUEST RECEIVED VIA RUNTIME MSG');
        if (captureSession && !captureSession.cancelled) {
          captureSession.stopRequested = true;
          finishCapture();
        }
        return;
      }


      // --------------------------------------------------------
      // Cancel target capture.
      // --------------------------------------------------------

      if (
        message.type ===
        'PRESENTLY_CANCEL_REAL_CAPTURE'
      ) {

        cancelRealCapture();

        return;
      }
    }
  );


  // ============================================================
  // START REAL CAPTURE
  // ============================================================

  async function startRealCapture(
    requestId
  ) {

    // ----------------------------------------------------------
    // Prevent accidental duplicate starts.
    // ----------------------------------------------------------

    if (
      captureSession &&
      !captureSession.cancelled
    ) {

      console.warn(
        '[PCT] CAPTURE ALREADY RUNNING - IGNORING DUPLICATE START'
      );

      return;
    }


    try {

      console.log(
        '[PCT] E1 REAL PAGE START',
        {
          requestId,

          url:
            window.location.href,

          readyState:
            document.readyState,

          innerWidth:
            window.innerWidth,

          innerHeight:
            window.innerHeight,

          dpr:
            window.devicePixelRatio
        }
      );


      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve, { once: true });
          setTimeout(resolve, 2000);
        });
      }


      captureSession = {

        requestId,

        tiles: [],

        cancelled: false,

        captureInFlight: false,

        lastRequestedY: null,

        startedAt:
          Date.now(),

        bottomRechecks: 0,

        initialDocumentHeight:
          getDocumentHeight()
      };


      // --------------------------------------------------------
      // Freeze animations/transitions.
      //
      // We do NOT hide content.
      // --------------------------------------------------------

      removeFreezeStyle();


      const style =
        document.createElement(
          'style'
        );


      style.id =
        'presently-live-capture-freeze';


      style.textContent = `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `;


      (
        document.head ||
        document.documentElement
      ).appendChild(
        style
      );


      // --------------------------------------------------------
      // ALWAYS START FROM TOP.
      // --------------------------------------------------------

      console.log(
        '[PCT] E2 SCROLLING TO Y=0'
      );


      window.scrollTo(
        {
          top: 0,
          left: 0,
          behavior: 'instant'
        }
      );


      await delay(
        INITIAL_SETTLE_MS
      );


      if (
        !captureSession ||
        captureSession.cancelled
      ) {
        return;
      }


      // --------------------------------------------------------
      // Force a second top position.
      //
      // Some websites restore scroll position after load.
      // --------------------------------------------------------

      window.scrollTo(
        0,
        0
      );


      await delay(
        100
      );


      console.log(
        '[PCT] E3 INITIAL PAGE READY',
        {
          scrollY:
            window.scrollY,

          documentHeight:
            getDocumentHeight(),

          maxScroll:
            getMaxScroll()
        }
      );


      // --------------------------------------------------------
      // FIRST SCREENSHOT.
      // --------------------------------------------------------

      requestCurrentViewport();

    } catch (error) {

      console.error(
        '[PCT] START CAPTURE ERROR',
        error
      );


      reportCaptureError(
        requestId,
        error
      );
    }
  }


  // ============================================================
  // REQUEST CURRENT VIEWPORT
  // ============================================================

  function requestCurrentViewport() {

    if (
      !captureSession ||
      captureSession.cancelled
    ) {
      return;
    }


    // ----------------------------------------------------------
    // Do not issue another screenshot while one is still
    // travelling through the extension.
    // ----------------------------------------------------------

    if (
      captureSession.captureInFlight
    ) {

      console.log(
        '[PCT] CAPTURE ALREADY IN FLIGHT'
      );

      return;
    }


    const currentY =
      Math.round(
        window.scrollY
      );


    const maxScroll =
      getMaxScroll();


    const progress =
      maxScroll <= 0
        ? 100
        : Math.min(
          100,
          Math.round(
            (
              currentY /
              maxScroll
            ) *
            100
          )
        );


    // ----------------------------------------------------------
    // Duplicate protection.
    // ----------------------------------------------------------

    if (
      currentY ===
      captureSession.lastRequestedY
    ) {

      console.warn(
        '[PCT] DUPLICATE VIEWPORT REQUEST PREVENTED',
        {
          currentY
        }
      );


      return;
    }


    captureSession.lastRequestedY =
      currentY;


    captureSession.captureInFlight =
      true;


    console.log(
      '[PCT] REQUESTING SCREENSHOT',
      {
        currentY,

        maxScroll,

        progress,

        tileCount:
          captureSession.tiles.length
      }
    );


    chrome.runtime.sendMessage(
      {
        type:
          'PRESENTLY_CAPTURE_CURRENT_VIEW',

        requestId:
          captureSession.requestId,

        scrollY:
          currentY,

        progress
      }
    )
      .then(
        () => {

          console.log(
            '[PCT] SCREENSHOT REQUEST SENT',
            {
              currentY,

              progress
            }
          );
        }
      )
      .catch(
        error => {

          console.error(
            '[PCT] SCREENSHOT REQUEST FAILED',
            error
          );


          if (
            captureSession
          ) {

            captureSession.captureInFlight =
              false;
          }


          reportCaptureError(
            captureSession?.requestId,
            error
          );
        }
      );
  }


  // ============================================================
  // RECEIVE SCREENSHOT TILE
  // ============================================================

  async function receiveCaptureTile(
    message
  ) {

    if (
      !captureSession ||
      captureSession.cancelled
    ) {

      console.warn(
        '[PCT] TILE IGNORED - NO ACTIVE SESSION'
      );

      return;
    }


    if (
      message.requestId !==
      captureSession.requestId
    ) {

      console.warn(
        '[PCT] TILE IGNORED - REQUEST ID MISMATCH'
      );

      return;
    }


    // ----------------------------------------------------------
    // Mark screenshot request complete.
    // ----------------------------------------------------------

    captureSession.captureInFlight =
      false;


    console.log(
      '[PCT] TILE RECEIVED',
      {
        tile:
          captureSession.tiles.length + 1,

        scrollY:
          message.scrollY,

        progress:
          message.progress,

        imageLength:
          message.image?.length ||
          0
      }
    );


    if (
      !message.image
    ) {

      reportCaptureError(
        message.requestId,
        new Error(
          'Screenshot tile was empty.'
        )
      );


      return;
    }


    // ----------------------------------------------------------
    // Store tile.
    // ----------------------------------------------------------

    captureSession.tiles.push(
      {
        image:
          message.image,

        scrollY:
          Number(
            message.scrollY ||
            0
          )
      }
    );


    // ----------------------------------------------------------
    // Check if this was the final bottom tile
    // ----------------------------------------------------------

    if (
      captureSession.isFinalTile
    ) {

      console.log(
        '[PCT] FINAL BOTTOM TILE RECEIVED - CALLING FINISH CAPTURE'
      );

      await finishCapture();

      return;
    }


    // ----------------------------------------------------------
    // Check current page dimensions.
    // ----------------------------------------------------------

    const currentY =
      Math.round(
        window.scrollY
      );


    const documentHeight =
      getDocumentHeight();


    const maxScroll =
      getMaxScroll();


    console.log(
      '[PCT] AFTER TILE PAGE DIMENSIONS',
      {
        currentY,

        maxScroll,

        documentHeight,

        viewportHeight:
          window.innerHeight,

        tiles:
          captureSession.tiles.length
      }
    );


    // ----------------------------------------------------------
    // BOTTOM DETECTION.
    //
    // We don't immediately finish.
    //
    // First wait 3.5 seconds.
    // Then check whether lazy-loading increased height.
    // ----------------------------------------------------------

    if (
      currentY >=
      maxScroll - 5
    ) {

      await handleBottomReached();

      return;
    }


    // ----------------------------------------------------------
    // Calculate next scroll.
    // ----------------------------------------------------------

    const viewportHeight =
      Math.max(
        1,
        window.innerHeight
      );


    const step =
      Math.max(
        300,
        Math.floor(
          viewportHeight *
          SCROLL_RATIO
        )
      );


    let nextY =
      Math.min(
        currentY +
        step,

        maxScroll
      );


    // ----------------------------------------------------------
    // Safety against no movement.
    // ----------------------------------------------------------

    if (
      nextY <=
      currentY
    ) {

      nextY =
        maxScroll;
    }


    console.log(
      '[PCT] SCROLLING TO NEXT POSITION',
      {
        from:
          currentY,

        to:
          nextY,

        step,

        maxScroll,

        ratio:
          SCROLL_RATIO
      }
    );


    // ----------------------------------------------------------
    // Scroll.
    //
    // behavior:auto is intentional.
    // We do NOT use smooth scrolling because screenshot
    // capture during smooth scrolling can catch intermediate
    // frames.
    // ----------------------------------------------------------

    window.scrollTo(
      {
        top:
          nextY,

        left: 0,

        behavior:
          'auto'
      }
    );


    // ----------------------------------------------------------
    // Wait for lazy content.
    // ----------------------------------------------------------

    await waitForPageToSettle(
      false
    );


    if (
      !captureSession ||
      captureSession.cancelled
    ) {

      return;
    }


    // ----------------------------------------------------------
    // Verify that the scroll actually happened.
    // ----------------------------------------------------------

    const actualY =
      Math.round(
        window.scrollY
      );


    const updatedMaxScroll =
      getMaxScroll();


    console.log(
      '[PCT] NEXT VIEWPORT READY',
      {
        requestedY:
          nextY,

        actualY,

        maxScroll:
          updatedMaxScroll,

        documentHeight:
          getDocumentHeight()
      }
    );


    // ----------------------------------------------------------
    // If Chrome/site refused the scroll, try once more.
    // ----------------------------------------------------------

    if (
      Math.abs(
        actualY -
        nextY
      ) > 10
    ) {

      console.warn(
        '[PCT] SCROLL DID NOT REACH REQUESTED POSITION',
        {
          requestedY:
            nextY,

          actualY
        }
      );


      window.scrollTo(
        0,
        nextY
      );


      await delay(
        250
      );
    }


    // ----------------------------------------------------------
    // Continue.
    // ----------------------------------------------------------

    requestCurrentViewport();
  }


  // ============================================================
  // BOTTOM HANDLER
  // ============================================================

  async function handleBottomReached() {

    if (
      !captureSession ||
      captureSession.cancelled
    ) {
      return;
    }


    const session =
      captureSession;


    const heightBefore =
      getDocumentHeight();


    const maxBefore =
      getMaxScroll();


    const yBefore =
      Math.round(
        window.scrollY
      );


    console.log(
      '[PCT] BOTTOM REACHED - STARTING FINAL WAIT',
      {
        y:
          yBefore,

        maxScroll:
          maxBefore,

        documentHeight:
          heightBefore,

        bottomRechecks:
          session.bottomRechecks
      }
    );


    // ----------------------------------------------------------
    // Wait 3.5 seconds.
    //
    // This is intentionally longer than normal scrolling.
    // ----------------------------------------------------------

    await delay(
      BOTTOM_WAIT_MS
    );


    if (
      !captureSession ||
      captureSession.cancelled
    ) {
      return;
    }


    const heightAfter =
      getDocumentHeight();


    const maxAfter =
      getMaxScroll();


    const yAfter =
      Math.round(
        window.scrollY
      );


    console.log(
      '[PCT] BOTTOM WAIT COMPLETE',
      {
        heightBefore,

        heightAfter,

        maxBefore,

        maxAfter,

        yBefore,

        yAfter
      }
    );


    // ----------------------------------------------------------
    // If the page grew, continue capturing.
    // ----------------------------------------------------------

    if (
      heightAfter >
      heightBefore + 20
      ||
      maxAfter >
      maxBefore + 20
    ) {

      session.bottomRechecks += 1;


      console.log(
        '[PCT] PAGE GREW AT BOTTOM - CONTINUING',
        {
          bottomRechecks:
            session.bottomRechecks,

          newHeight:
            heightAfter,

          newMaxScroll:
            maxAfter
        }
      );


      if (
        session.bottomRechecks <=
        MAX_BOTTOM_RECHECKS
      ) {

        // Stay at new bottom.
        window.scrollTo(
          0,
          maxAfter
        );


        await waitForPageToSettle(
          false
        );


        requestCurrentViewport();

        return;
      }
    }


    // ----------------------------------------------------------
    // Bottom is stable.
    //
    // IMPORTANT:
    // Capture the stabilized bottom viewport one more time.
    //
    // This ensures lazy-loaded content that appeared during
    // the 3.5 second wait is actually included.
    // ----------------------------------------------------------

    console.log(
      '[PCT] BOTTOM STABLE - CAPTURING FINAL BOTTOM VIEWPORT',
      {
        tileCount:
          session.tiles.length,

        documentHeight:
          getDocumentHeight(),

        maxScroll:
          getMaxScroll()
      }
    );


    // Reset duplicate protection because we intentionally
    // want another screenshot at the same Y position.

    session.lastRequestedY =
      null;


    // Mark this request as the final bottom capture.
    // When receiveCaptureTile receives this tile, it will call finishCapture().

    session.isFinalTile =
      true;


    requestCurrentViewport();
  }


  // ============================================================
  // FINISH CAPTURE
  // ============================================================

  async function finishCapture() {

    if (
      !captureSession ||
      captureSession.cancelled
    ) {
      return;
    }


    const session =
      captureSession;


    try {

      console.log(
        '[PCT] F1 STARTING FULL PAGE STITCH',
        {
          tileCount:
            session.tiles.length,

          documentHeight:
            getDocumentHeight(),

          maxScroll:
            getMaxScroll(),

          elapsedMs:
            Date.now() -
            session.startedAt
        }
      );


      if (
        session.tiles.length ===
        0
      ) {

        throw new Error(
          'No screenshot tiles were captured.'
        );
      }


      const finalImage =
        await stitchTiles(
          session.tiles
        );


      if (
        !finalImage ||
        finalImage.length <
        1000
      ) {

        throw new Error(
          'Full-page screenshot is empty.'
        );
      }


      console.log(
        '[PCT] F2 FULL PAGE STITCH COMPLETE',
        {
          imageLength:
            finalImage.length
        }
      );


      // --------------------------------------------------------
      // Send final screenshot to background with chunking support.
      // --------------------------------------------------------

      await sendChunkedMessage(
        'runtime',
        {
          type:
            'PRESENTLY_CAPTURE_COMPLETE',

          requestId:
            session.requestId
        },
        'image',
        finalImage
      );


      console.log(
        '[PCT] F3 FINAL IMAGE SENT TO BACKGROUND'
      );


      removeFreezeStyle();


      captureSession =
        null;


    } catch (error) {

      console.error(
        '[PCT] FINALIZATION ERROR',
        error
      );


      reportCaptureError(
        session.requestId,
        error
      );
    }
  }


  // ============================================================
  // STITCH TILES
  // ============================================================
  //
  // IMPORTANT:
  //
  // We cannot blindly create a canvas using the entire
  // document height at full DPR.
  //
  // Long webpages can exceed browser canvas limits.
  //
  // We therefore calculate a safe output scale.
  // This preserves the entire webpage while keeping the
  // canvas inside browser-safe dimensions.
  //
  // The result remains client-side.
  // No server-side compression is used here.
  // ============================================================

  async function stitchTiles(
    tiles
  ) {

    if (
      !tiles ||
      tiles.length ===
      0
    ) {

      throw new Error(
        'No screenshot tiles were captured.'
      );
    }


    console.log(
      '[PCT] STITCH START',
      {
        tileCount:
          tiles.length
      }
    );


    // ----------------------------------------------------------
    // Load first tile.
    // ----------------------------------------------------------

    const firstImage =
      await loadImage(
        tiles[0].image
      );


    if (
      !firstImage ||
      !firstImage.naturalWidth ||
      !firstImage.naturalHeight
    ) {

      throw new Error(
        'First screenshot tile is invalid.'
      );
    }


    const dpr =
      window.devicePixelRatio ||
      1;


    const viewportWidth =
      firstImage.naturalWidth;


    const viewportHeight =
      firstImage.naturalHeight;


    const documentCssHeight =
      getDocumentHeight();


    // ----------------------------------------------------------
    // Desired dimensions before safety scaling.
    // ----------------------------------------------------------

    const desiredWidth =
      viewportWidth;


    const desiredHeight =
      Math.max(
        viewportHeight,

        Math.ceil(
          documentCssHeight *
          dpr
        )
      );


    // ----------------------------------------------------------
    // High-resolution canvas limits preserving 1:1 full physical pixel width.
    // Modern Chrome supports up to 32,767px canvas height.
    // ----------------------------------------------------------

    const MAX_CANVAS_WIDTH = 16000;
    const MAX_CANVAS_HEIGHT = 30000;
    const MAX_CANVAS_AREA = 250000000;


    let scale = 1;


    if (
      desiredWidth >
      MAX_CANVAS_WIDTH
    ) {

      scale =
        Math.min(
          scale,

          MAX_CANVAS_WIDTH /
          desiredWidth
        );
    }


    if (
      desiredHeight >
      MAX_CANVAS_HEIGHT
    ) {

      scale =
        Math.min(
          scale,

          MAX_CANVAS_HEIGHT /
          desiredHeight
        );
    }


    if (
      desiredWidth *
      desiredHeight *
      scale *
      scale >
      MAX_CANVAS_AREA
    ) {

      scale =
        Math.min(
          scale,

          Math.sqrt(
            MAX_CANVAS_AREA /
            (
              desiredWidth *
              desiredHeight
            )
          )
        );
    }


    // Do not downscale below full physical viewport width
    scale =
      Math.max(
        0.5,

        Math.min(
          1,
          scale
        )
      );


    const outputWidth =
      Math.max(
        1,

        Math.floor(
          desiredWidth *
          scale
        )
      );


    const outputHeight =
      Math.max(
        1,

        Math.floor(
          desiredHeight *
          scale
        )
      );


    console.log(
      '[PCT] STITCH SAFE CANVAS',
      {
        dpr,

        documentCssHeight,

        desiredWidth,

        desiredHeight,

        scale,

        outputWidth,

        outputHeight
      }
    );


    // ----------------------------------------------------------
    // Create final canvas.
    // ----------------------------------------------------------

    const canvas =
      document.createElement(
        'canvas'
      );


    canvas.width =
      outputWidth;


    canvas.height =
      outputHeight;


    const ctx =
      canvas.getContext(
        '2d'
      );


    if (!ctx) {

      throw new Error(
        'Could not create screenshot canvas.'
      );
    }


    // Enable high quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';


    // ----------------------------------------------------------
    // White background.
    // ----------------------------------------------------------

    ctx.fillStyle =
      '#ffffff';


    ctx.fillRect(
      0,
      0,
      outputWidth,
      outputHeight
    );


    // ----------------------------------------------------------
    // Draw every screenshot tile sequentially to optimize memory.
    // ----------------------------------------------------------

    for (
      let i = 0;
      i < tiles.length;
      i++
    ) {

      const tile =
        tiles[i];


      if (
        !tile ||
        !tile.image
      ) {

        console.warn(
          '[PCT] SKIPPING INVALID TILE',
          i
        );

        continue;
      }


      const image = (i === 0) ? firstImage : await loadImage(tile.image);


      if (
        !image ||
        !image.naturalWidth ||
        !image.naturalHeight
      ) {

        console.warn(
          '[PCT] SKIPPING UNREADABLE TILE',
          i
        );

        continue;
      }


      // scrollY is CSS pixels.
      // Screenshot dimensions are physical pixels.
      // Convert using DPR and final scale.

      const destinationY =
        Math.round(
          Number(
            tile.scrollY ||
            0
          ) *
          dpr *
          scale
        );


      const destinationWidth =
        Math.round(
          image.naturalWidth *
          scale
        );


      const destinationHeight =
        Math.round(
          image.naturalHeight *
          scale
        );


      if (
        destinationY >=
        outputHeight
      ) {

        continue;
      }


      const visibleHeight =
        Math.min(
          destinationHeight,

          outputHeight -
          destinationY
        );


      if (
        visibleHeight <=
        0
      ) {

        continue;
      }


      ctx.drawImage(
        image,

        0,
        0,

        image.naturalWidth,
        image.naturalHeight,

        0,
        destinationY,

        destinationWidth,
        visibleHeight
      );


      console.log(
        '[PCT] TILE STITCHED',
        {
          index:
            i + 1,

          total:
            tiles.length,

          scrollY:
            tile.scrollY,

          destinationY
        }
      );


      // Give browser event loop a chance.

      if (
        i % 3 ===
        0
      ) {

        await delay(
          0
        );
      }
    }


    console.log(
      '[PCT] STITCH CANVAS COMPLETE'
    );


    // ----------------------------------------------------------
    // Export final screenshot with crisp quality.
    // ----------------------------------------------------------

    let finalImage =
      canvas.toDataURL(
        'image/jpeg',
        0.85
      );


    if (
      !finalImage ||
      finalImage ===
      'data:,' ||
      finalImage.length <
      1000
    ) {

      finalImage =
        canvas.toDataURL(
          'image/webp',
          0.85
        );
    }


    if (
      !finalImage ||
      finalImage ===
      'data:,' ||
      finalImage.length <
      1000
    ) {

      throw new Error(
        'Browser could not export the full-page screenshot.'
      );
    }


    console.log(
      '[PCT] STITCH COMPLETE',
      {
        imageLength:
          finalImage.length,

        width:
          outputWidth,

        height:
          outputHeight,

        scale
      }
    );


    return finalImage;
  }


  // ============================================================
  // PAGE SETTLE
  // ============================================================

  async function waitForPageToSettle(
    initial
  ) {

    const baseWait =
      initial
        ? INITIAL_SETTLE_MS
        : SCROLL_SETTLE_MS;


    console.log(
      '[PCT] SETTLE START',
      {
        initial,

        baseWait,

        scrollY:
          window.scrollY
      }
    );


    await delay(
      baseWait
    );


    // ----------------------------------------------------------
    // Wait for currently pending images.
    //
    // Do not wait forever.
    // ----------------------------------------------------------

    const images =
      Array.from(
        document.images ||
        []
      );


    const pendingImages =
      images.filter(
        img =>
          !img.complete
      );


    console.log(
      '[PCT] SETTLE IMAGE STATUS',
      {
        total:
          images.length,

        pending:
          pendingImages.length
      }
    );


    if (
      pendingImages.length >
      0
    ) {

      await Promise.race(
        [

          Promise.all(
            pendingImages
              .slice(
                0,
                20
              )
              .map(
                img =>
                  waitForImage(
                    img,
                    1200
                  )
              )
          ),

          delay(
            1400
          )
        ]
      );
    }


    // ----------------------------------------------------------
    // One final rendering buffer.
    // ----------------------------------------------------------

    await delay(
      150
    );


    console.log(
      '[PCT] SETTLE COMPLETE',
      {
        scrollY:
          window.scrollY,

        documentHeight:
          getDocumentHeight()
      }
    );
  }


  // ============================================================
  // WAIT FOR ONE IMAGE
  // ============================================================

  function waitForImage(
    img,
    timeoutMs
  ) {

    return new Promise(
      resolve => {

        if (
          img.complete
        ) {

          resolve();

          return;
        }


        let finished =
          false;


        const done =
          () => {

            if (finished) {
              return;
            }


            finished =
              true;


            img.removeEventListener(
              'load',
              done
            );


            img.removeEventListener(
              'error',
              done
            );


            resolve();
          };


        img.addEventListener(
          'load',
          done,
          {
            once: true
          }
        );


        img.addEventListener(
          'error',
          done,
          {
            once: true
          }
        );


        setTimeout(
          done,
          timeoutMs
        );
      }
    );
  }


  // ============================================================
  // DOCUMENT HEIGHT
  // ============================================================

  function getDocumentHeight() {

    return Math.max(

      document.body
        ? document.body.scrollHeight
        : 0,

      document.documentElement
        ? document.documentElement.scrollHeight
        : 0,

      document.body
        ? document.body.offsetHeight
        : 0,

      document.documentElement
        ? document.documentElement.offsetHeight
        : 0,

      document.body
        ? document.body.clientHeight
        : 0,

      document.documentElement
        ? document.documentElement.clientHeight
        : 0
    );
  }


  // ============================================================
  // MAX SCROLL
  // ============================================================

  function getMaxScroll() {

    return Math.max(
      0,

      getDocumentHeight() -
      window.innerHeight
    );
  }


  // ============================================================
  // CANCEL
  // ============================================================

  function cancelRealCapture() {

    console.log(
      '[PCT] CAPTURE CANCELLED'
    );


    if (
      !captureSession
    ) {

      return;
    }


    captureSession.cancelled =
      true;


    removeFreezeStyle();


    captureSession =
      null;
  }


  // ============================================================
  // REMOVE FREEZE STYLE
  // ============================================================

  function removeFreezeStyle() {

    const style =
      document.getElementById(
        'presently-live-capture-freeze'
      );


    if (
      style
    ) {

      style.remove();
    }
  }


  // ============================================================
  // REPORT ERROR
  // ============================================================

  function reportCaptureError(
    requestId,
    error
  ) {

    const message =
      error?.message ||
      String(
        error ||
        'Real Chrome capture failed.'
      );


    console.error(
      '[PCT] REPORTING CAPTURE ERROR',
      {
        requestId,

        error:
          message
      }
    );


    chrome.runtime.sendMessage(
      {
        type:
          'PRESENTLY_CAPTURE_ERROR',

        requestId,

        error:
          message
      }
    )
      .catch(
        sendError => {

          console.error(
            '[PCT] ERROR REPORT SEND FAILED',
            sendError
          );
        }
      );
  }


  // ============================================================
  // LOAD IMAGE
  // ============================================================

  function loadImage(
    src
  ) {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        const img =
          new Image();


        img.onload =
          () => {

            resolve(
              img
            );
          };


        img.onerror =
          () => {

            reject(
              new Error(
                'Could not decode screenshot tile.'
              )
            );
          };


        img.src =
          src;
      }
    );
  }


  // ============================================================
  // UTILITY
  // ============================================================

  function delay(
    ms
  ) {

    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );
  }


  // ============================================================
  // LOADED
  // ============================================================

  console.log(
    '[PCT] Presently Live Capture content script loaded.',
    {
      url:
        window.location.href
    }
  );
}