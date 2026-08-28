// ============================================================
// PRESENTLY LIVE CAPTURE
// background.js
// ============================================================
//
// Architecture:
//
// Presently
//    ↓
// content.js on Presently
//    ↓
// chrome.runtime
//    ↓
// background.js
//    ↓
// REAL Chrome tab
//    ↓
// chrome.debugger
//    ↓
// Page.captureScreenshot
//    ↓
// background.js
//    ↓
// content.js on target webpage
//    ↓
// stitching
//    ↓
// background.js
//    ↓
// content.js on Presently
//    ↓
// LiveCaptureModal
//
// IMPORTANT:
// This is completely independent of:
//   - /take
//   - Puppeteer
//   - getDisplayMedia()
//
// ============================================================


const sessions = new Map();


// ============================================================
// CONFIG
// ============================================================

const DEBUGGER_VERSION = '1.3';

const PAGE_LOAD_TIMEOUT = 30000;

const INITIAL_RENDER_WAIT = 800;

const CONTENT_SCRIPT_RETRY_COUNT = 30;

const CONTENT_SCRIPT_RETRY_DELAY = 300;


// ============================================================
// LOGGING
// ============================================================

function log(requestId, message, data = null) {
  const prefix = `[PBG][${requestId || '-'}]`;

  if (data !== null) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}


// ============================================================
// CHUNKED MESSAGING HELPER (BACKGROUND)
// ============================================================

const chunkAccumulatorsBg = new Map();

function processIncomingChunkBg(message, onComplete) {
  const key = `${message.type}_${message.requestId}`;
  let item = chunkAccumulatorsBg.get(key);
  if (!item) {
    item = { chunks: new Array(message.totalChunks), count: 0, meta: message };
    chunkAccumulatorsBg.set(key, item);
  }
  if (!item.chunks[message.chunkIndex]) {
    item.chunks[message.chunkIndex] = message.chunkData;
    item.count++;
  }
  if (item.count === message.totalChunks) {
    chunkAccumulatorsBg.delete(key);
    const fullPayload = item.chunks.join('');
    const originalType = message.type.replace('_CHUNK', '');
    const completeMsg = { ...item.meta, type: originalType, image: fullPayload };
    delete completeMsg.chunkIndex;
    delete completeMsg.totalChunks;
    delete completeMsg.chunkData;
    onComplete(completeMsg);
  }
}

async function sendChunkedToPresently(tabId, message, largeField, payloadString) {
  const CHUNK_SIZE = 300000;
  if (!payloadString || payloadString.length <= CHUNK_SIZE) {
    await sendToPresently(tabId, { ...message, [largeField]: payloadString });
    return;
  }

  const totalChunks = Math.ceil(payloadString.length / CHUNK_SIZE);
  const chunkType = `${message.type}_CHUNK`;

  for (let i = 0; i < totalChunks; i++) {
    const chunkData = payloadString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkMsg = {
      ...message,
      type: chunkType,
      chunkIndex: i,
      totalChunks,
      chunkData
    };
    delete chunkMsg[largeField];
    await sendToPresently(tabId, chunkMsg);
  }
}


// ============================================================
// MESSAGE ROUTER
// ============================================================

chrome.runtime.onMessage.addListener(
  (message, sender) => {

    if (!message || !message.type) {
      return;
    }

    log(
      message.requestId,
      `MESSAGE ${message.type}`,
      {
        senderTabId: sender?.tab?.id,
        senderUrl: sender?.tab?.url
      }
    );


    // --------------------------------------------------------
    // Target webpage sending screenshot chunk.
    // --------------------------------------------------------

    if (message.type === 'PRESENTLY_CAPTURE_COMPLETE_CHUNK') {
      processIncomingChunkBg(message, (assembledMessage) => {
        finishCapture(assembledMessage);
      });
      return;
    }


    // --------------------------------------------------------
    // Presently wants a new capture.
    // --------------------------------------------------------

    if (
      message.type ===
      'PRESENTLY_LIVE_CAPTURE_REQUEST'
    ) {
      startCapture(message, sender);
      return;
    }


    // --------------------------------------------------------
    // Target webpage wants current viewport captured.
    // --------------------------------------------------------

    if (
      message.type ===
      'PRESENTLY_CAPTURE_CURRENT_VIEW'
    ) {
      captureCurrentView(message);
      return;
    }


    // --------------------------------------------------------
    // Target webpage finished stitching.
    // --------------------------------------------------------

    if (
      message.type ===
      'PRESENTLY_CAPTURE_COMPLETE'
    ) {
      finishCapture(message);
      return;
    }


    // --------------------------------------------------------
    // Target webpage reported an error.
    // --------------------------------------------------------

    if (
      message.type ===
      'PRESENTLY_CAPTURE_ERROR'
    ) {
      handleCaptureError(message);
      return;
    }


    // --------------------------------------------------------
    // Presently cancelled.
    // --------------------------------------------------------

    if (
      message.type ===
      'PRESENTLY_LIVE_CAPTURE_CANCEL'
    ) {
      cancelCapture(message.requestId);
      return;
    }
  }
);


// ============================================================
// START CAPTURE
// ============================================================

async function startCapture(
  message,
  sender
) {

  const requestId =
    message.requestId;

  let targetTabId = null;

  try {

    log(
      requestId,
      'A1 START CAPTURE',
      {
        url: message.url,
        device: message.device,
        sourceTabId: sender?.tab?.id
      }
    );


    if (!sender?.tab?.id) {
      throw new Error(
        'Could not identify the Presently tab.'
      );
    }


    const sourceTabId =
      sender.tab.id;

    const sourceWindowId =
      sender.tab.windowId;


    // --------------------------------------------------------
    // Normalize URL.
    // --------------------------------------------------------

    let targetUrl =
      String(
        message.url || ''
      ).trim();


    if (
      !/^https?:\/\//i.test(
        targetUrl
      )
    ) {
      targetUrl =
        `https://${targetUrl}`;
    }


    // --------------------------------------------------------
    // Remove trailing whitespace.
    // --------------------------------------------------------

    targetUrl =
      targetUrl.trim();


    log(
      requestId,
      'A2 CREATING REAL CHROME TAB',
      {
        targetUrl
      }
    );


    // --------------------------------------------------------
    // Create actual Chrome tab and restore focus to Presently.
    // --------------------------------------------------------

    const targetTab =
      await chrome.tabs.create({
        url: targetUrl,
        active: true,
        windowId: sourceWindowId
      });


    if (!targetTab?.id) {
      throw new Error(
        'Chrome could not create the capture tab.'
      );
    }


    targetTabId =
      targetTab.id;

    // Instantly return focus to Presently tab so user stays on Presently
    if (sourceTabId) {
      try {
        await chrome.tabs.update(
          sourceTabId,
          {
            active: true
          }
        );
      } catch { }
    }

    log(
      requestId,
      'A3 CHROME CAPTURE TAB CREATED',
      {
        targetTabId,
        sourceTabId,
        targetUrl
      }
    );

    // --------------------------------------------------------
    // Save session.
    // --------------------------------------------------------

    sessions.set(
      requestId,
      {
        requestId,

        sourceTabId,

        sourceWindowId,

        targetTabId,

        targetUrl,

        device:
          message.device ||
          'desktop',

        cancelled: false,

        debuggerAttached: false
      }
    );


    log(
      requestId,
      'A3 REAL CHROME TAB CREATED',
      {
        targetTabId,
        sourceTabId,
        targetUrl
      }
    );


    // --------------------------------------------------------
    // Wait for real page to finish loading.
    // --------------------------------------------------------

    log(
      requestId,
      'A4 WAITING FOR PAGE LOAD'
    );


    await waitForTabLoaded(
      targetTabId,
      requestId
    );


    const sessionAfterLoad =
      sessions.get(
        requestId
      );


    if (
      !sessionAfterLoad ||
      sessionAfterLoad.cancelled
    ) {
      return;
    }


    log(
      requestId,
      'A5 PAGE LOAD COMPLETE'
    );


    // --------------------------------------------------------
    // Attach debugger.
    // --------------------------------------------------------

    await attachDebugger(
      targetTabId,
      requestId
    );


    const session =
      sessions.get(
        requestId
      );


    if (
      !session ||
      session.cancelled
    ) {
      return;
    }


    session.debuggerAttached =
      true;


    // --------------------------------------------------------
    // Enable Page domain.
    // --------------------------------------------------------

    await chrome.debugger.sendCommand(
      {
        tabId: targetTabId
      },
      'Page.enable'
    );


    // Enable focus emulation on target tab so background tab JS/scroll execution is unthrottled
    try {
      await chrome.debugger.sendCommand(
        { tabId: targetTabId },
        'Emulation.setFocusEmulationEnabled',
        { enabled: true }
      );
    } catch { }


    // --------------------------------------------------------
    // Mobile Emulation if device === 'mobile'
    // --------------------------------------------------------

    if (message.device === 'mobile') {
      try {
        await chrome.debugger.sendCommand(
          { tabId: targetTabId },
          'Emulation.setDeviceMetricsOverride',
          {
            width: 375,
            height: 812,
            deviceScaleFactor: 2,
            mobile: true
          }
        );

        await chrome.debugger.sendCommand(
          { tabId: targetTabId },
          'Emulation.setUserAgentOverride',
          {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
          }
        );

        log(
          requestId,
          'A6.1 MOBILE EMULATION ENABLED'
        );
      } catch (emuErr) {
        console.warn('[PBG] Mobile emulation failed:', emuErr);
      }
    }


    log(
      requestId,
      'A6 DEBUGGER ATTACHED + PAGE ENABLED'
    );


    // --------------------------------------------------------
    // Small initial render wait.
    // --------------------------------------------------------

    await delay(
      INITIAL_RENDER_WAIT
    );


    const sessionAfterWait =
      sessions.get(
        requestId
      );


    if (
      !sessionAfterWait ||
      sessionAfterWait.cancelled
    ) {
      return;
    }


    // --------------------------------------------------------
    // Start content script.
    // Ensure content script is explicitly injected first.
    // --------------------------------------------------------

    log(
      requestId,
      'A7 INJECTING AND STARTING TARGET CONTENT SCRIPT'
    );

    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: ['content.js']
      });
      log(requestId, 'EXPLICIT SCRIPT INJECTION SUCCESS');
    } catch (injErr) {
      log(requestId, 'SCRIPT INJECTION NOTICE', injErr?.message);
    }


    await sendToTargetWithRetry(
      targetTabId,
      {
        type:
          'PRESENTLY_START_REAL_CAPTURE',

        requestId
      },
      requestId
    );


    log(
      requestId,
      'A8 START MESSAGE SENT TO TARGET'
    );

  } catch (error) {

    console.error(
      `[PBG][${requestId}] START CAPTURE ERROR`,
      error
    );


    sendResultToPresently(
      requestId,
      false,
      null,
      error?.message ||
      'Could not start real Chrome capture.'
    );


    await cleanupSession(
      requestId
    );
  }
}


// ============================================================
// CAPTURE CURRENT VIEWPORT
// ============================================================

async function captureCurrentView(
  message
) {

  const requestId =
    message.requestId;


  const session =
    sessions.get(
      requestId
    );


  log(
    requestId,
    'B1 CAPTURE REQUEST RECEIVED',
    {
      scrollY: message.scrollY,
      progress: message.progress,
      targetTabId:
        session?.targetTabId
    }
  );


  if (
    !session ||
    session.cancelled
  ) {

    log(
      requestId,
      'B2 SESSION MISSING OR CANCELLED'
    );

    return;
  }


  if (
    !session.targetTabId
  ) {

    log(
      requestId,
      'B3 TARGET TAB MISSING'
    );

    return;
  }


  try {

    // --------------------------------------------------------
    // Ensure debugger is attached.
    // --------------------------------------------------------

    if (
      !session.debuggerAttached
    ) {

      log(
        requestId,
        'B4 DEBUGGER NOT ATTACHED - ATTACHING'
      );


      await attachDebugger(
        session.targetTabId,
        requestId
      );


      session.debuggerAttached =
        true;


      await chrome.debugger.sendCommand(
        {
          tabId:
            session.targetTabId
        },
        'Page.enable'
      );
    }


    // --------------------------------------------------------
    // Give Chrome one animation frame before screenshot.
    //
    // This helps after scrolling/lazy-loading.
    // --------------------------------------------------------

    try {

      await chrome.debugger.sendCommand(
        {
          tabId:
            session.targetTabId
        },
        'Runtime.evaluate',
        {
          expression:
            `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
          awaitPromise: true,
          returnByValue: true
        }
      );

    } catch {
      // Not fatal. Screenshot can still proceed.
    }


    // --------------------------------------------------------
    // Capture REAL Chrome viewport.
    //
    // DO NOT use captureVisibleTab().
    // DO NOT activate the tab.
    // --------------------------------------------------------

    log(
      requestId,
      'B5 CALLING Page.captureScreenshot',
      {
        scrollY: message.scrollY,
        progress: message.progress
      }
    );


    const result =
      await chrome.debugger.sendCommand(
        {
          tabId:
            session.targetTabId
        },
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          quality: 70
        }
      );


    if (
      !result ||
      !result.data
    ) {

      throw new Error(
        'Chrome debugger returned an empty screenshot.'
      );
    }


    const image =
      `data:image/jpeg;base64,${result.data}`;


    log(
      requestId,
      'B6 DEBUGGER SCREENSHOT SUCCESS',
      {
        scrollY: message.scrollY,
        progress: message.progress,
        base64Length:
          image.length
      }
    );


    // --------------------------------------------------------
    // Send tile to target content.js.
    // --------------------------------------------------------

    await chrome.tabs.sendMessage(
      session.targetTabId,
      {
        type:
          'PRESENTLY_CAPTURE_CURRENT_TILE',

        requestId:
          session.requestId,

        image,

        scrollY:
          message.scrollY,

        progress:
          message.progress
      }
    );


    log(
      requestId,
      'B7 TILE SENT TO TARGET'
    );


    // --------------------------------------------------------
    // Send live tile to Presently.
    //
    // This is what removes the shimmer progressively.
    // --------------------------------------------------------

    await sendToPresently(
      session.sourceTabId,
      {
        type:
          'PRESENTLY_LIVE_CAPTURE_TILE',

        requestId:
          session.requestId,

        image,

        scrollY:
          message.scrollY,

        progress:
          message.progress
      }
    );


    log(
      requestId,
      'B8 LIVE TILE SENT TO PRESENTLY'
    );

  } catch (error) {

    console.error(
      `[PBG][${requestId}] CAPTURE ERROR`,
      {
        scrollY:
          message.scrollY,

        progress:
          message.progress,

        error:
          error?.message ||
          error
      }
    );


    sendResultToPresently(
      requestId,
      false,
      null,
      error?.message ||
      'Chrome screenshot capture failed.'
    );


    await cleanupSession(
      requestId
    );
  }
}


// ============================================================
// FINAL CAPTURE
// ============================================================

async function finishCapture(
  message
) {

  const requestId =
    message.requestId;


  const session =
    sessions.get(
      requestId
    );


  log(
    requestId,
    'C1 FINAL SCREENSHOT RECEIVED',
    {
      success:
        message.success,

      imageLength:
        message.image?.length ||
        0
    }
  );


  if (
    !session ||
    session.cancelled
  ) {
    return;
  }


  try {

    if (
      !message.image
    ) {

      throw new Error(
        'Final screenshot image is empty.'
      );
    }


    // --------------------------------------------------------
    // Return final image to Presently with chunking support.
    // --------------------------------------------------------

    await sendChunkedToPresently(
      session.sourceTabId,
      {
        type:
          'PRESENTLY_LIVE_CAPTURE_RESULT',

        requestId:
          session.requestId,

        success: true
      },
      'image',
      message.image
    );


    log(
      requestId,
      'C2 FINAL IMAGE SENT TO PRESENTLY',
      {
        imageLength:
          message.image.length
      }
    );


    await cleanupSession(
      requestId
    );

  } catch (error) {

    console.error(
      `[PBG][${requestId}] FINAL CAPTURE ERROR`,
      error
    );


    sendResultToPresently(
      requestId,
      false,
      null,
      error?.message ||
      'Could not return final screenshot.'
    );


    await cleanupSession(
      requestId
    );
  }
}


// ============================================================
// TARGET PAGE ERROR
// ============================================================

async function handleCaptureError(
  message
) {

  const requestId =
    message.requestId;


  log(
    requestId,
    'C1 ERROR RECEIVED FROM TARGET',
    {
      error:
        message.error
    }
  );


  sendResultToPresently(
    requestId,
    false,
    null,
    message.error ||
    'Real Chrome capture failed.'
  );


  await cleanupSession(
    requestId
  );
}


// ============================================================
// CANCEL
// ============================================================

async function cancelCapture(
  requestId
) {

  const session =
    sessions.get(
      requestId
    );


  if (!session) {
    return;
  }


  log(
    requestId,
    'CANCEL REQUESTED'
  );


  session.cancelled =
    true;


  try {

    if (
      session.targetTabId
    ) {

      await chrome.tabs.sendMessage(
        session.targetTabId,
        {
          type:
            'PRESENTLY_CANCEL_REAL_CAPTURE',

          requestId
        }
      );
    }

  } catch {
    // Target may already be gone.
  }


  await cleanupSession(
    requestId
  );
}


// ============================================================
// DEBUGGER ATTACH
// ============================================================

async function attachDebugger(
  tabId,
  requestId
) {

  log(
    requestId,
    'DEBUGGER ATTACH START',
    {
      tabId
    }
  );


  try {

    await chrome.debugger.attach(
      {
        tabId
      },
      DEBUGGER_VERSION
    );

  } catch (error) {

    const message =
      error?.message ||
      '';


    if (
      message
        .toLowerCase()
        .includes(
          'already attached'
        )
    ) {

      log(
        requestId,
        'DEBUGGER ALREADY ATTACHED'
      );

      return;
    }


    throw error;
  }


  log(
    requestId,
    'DEBUGGER ATTACH SUCCESS',
    {
      tabId
    }
  );
}


// ============================================================
// SEND TO TARGET WITH RETRIES
// ============================================================

async function sendToTargetWithRetry(
  tabId,
  message,
  requestId
) {

  let lastError =
    null;


  for (
    let attempt = 1;
    attempt <=
    CONTENT_SCRIPT_RETRY_COUNT;
    attempt++
  ) {

    const session =
      sessions.get(
        requestId
      );


    if (
      !session ||
      session.cancelled
    ) {

      throw new Error(
        'Capture session was cancelled.'
      );
    }


    try {

      await chrome.tabs.sendMessage(
        tabId,
        message
      );


      log(
        requestId,
        'TARGET MESSAGE SUCCESS',
        {
          attempt
        }
      );


      return;

    } catch (error) {

      lastError =
        error;


      log(
        requestId,
        'TARGET MESSAGE RETRY',
        {
          attempt,

          maxAttempts:
            CONTENT_SCRIPT_RETRY_COUNT,

          error:
            error?.message ||
            error
        }
      );


      await delay(
        CONTENT_SCRIPT_RETRY_DELAY
      );
    }
  }


  throw (
    lastError ||
    new Error(
      'Could not communicate with the target webpage.'
    )
  );
}


// ============================================================
// SEND TO PRESENTLY
// ============================================================

async function sendToPresently(
  tabId,
  message
) {

  try {

    await chrome.tabs.sendMessage(
      tabId,
      message
    );

  } catch (error) {

    console.warn(
      '[PBG] Could not send message to Presently:',
      {
        tabId,

        type:
          message?.type,

        error:
          error?.message ||
          error
      }
    );
  }
}


// ============================================================
// SEND RESULT
// ============================================================

function sendResultToPresently(
  requestId,
  success,
  image,
  error
) {

  const session =
    sessions.get(
      requestId
    );


  if (!session) {
    return;
  }


  sendToPresently(
    session.sourceTabId,
    {
      type:
        'PRESENTLY_LIVE_CAPTURE_RESULT',

      requestId,

      success,

      image,

      error
    }
  );
}


// ============================================================
// WAIT FOR TAB LOAD
// ============================================================

function waitForTabLoaded(
  tabId,
  requestId
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      let finished =
        false;


      let timeout;


      const finish =
        (
          error
        ) => {

          if (finished) {
            return;
          }


          finished =
            true;


          clearTimeout(
            timeout
          );


          chrome.tabs.onUpdated.removeListener(
            listener
          );


          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };


      const listener = (
        updatedTabId,
        changeInfo
      ) => {

        if (
          updatedTabId !==
          tabId
        ) {
          return;
        }


        if (
          changeInfo.status ===
          'complete'
        ) {

          log(
            requestId,
            'TAB STATUS COMPLETE'
          );


          finish();
        }
      };


      chrome.tabs.onUpdated.addListener(
        listener
      );


      timeout =
        setTimeout(
          () => {

            finish(
              new Error(
                'Timed out waiting for webpage to load.'
              )
            );

          },
          PAGE_LOAD_TIMEOUT
        );


      // --------------------------------------------------------
      // Race protection.
      // --------------------------------------------------------

      chrome.tabs.get(
        tabId
      )
        .then(
          tab => {

            if (
              tab.status ===
              'complete'
            ) {

              log(
                requestId,
                'TAB WAS ALREADY COMPLETE'
              );


              finish();
            }
          }
        )
        .catch(
          error => {
            finish(error);
          }
        );
    }
  );
}


// ============================================================
// CLEANUP
// ============================================================

async function cleanupSession(
  requestId
) {

  const session =
    sessions.get(
      requestId
    );


  if (!session) {
    return;
  }


  log(
    requestId,
    'CLEANUP START',
    {
      targetTabId:
        session.targetTabId,

      debuggerAttached:
        session.debuggerAttached
    }
  );


  sessions.delete(
    requestId
  );


  // ----------------------------------------------------------
  // Detach debugger.
  // ----------------------------------------------------------

  if (
    session.debuggerAttached &&
    session.targetTabId
  ) {

    try {

      await chrome.debugger.detach(
        {
          tabId:
            session.targetTabId
        }
      );


      log(
        requestId,
        'DEBUGGER DETACHED'
      );

    } catch (error) {

      console.warn(
        '[PBG] Debugger detach failed:',
        error?.message ||
        error
      );
    }
  }


  // ----------------------------------------------------------
  // Close temporary target tab.
  // ----------------------------------------------------------

  if (
    session.targetTabId
  ) {

    try {

      await chrome.tabs.remove(
        session.targetTabId
      );


      log(
        requestId,
        'TARGET TAB CLOSED'
      );

    } catch {
      // Already closed.
    }
  }


  log(
    requestId,
    'CLEANUP COMPLETE'
  );
}


// ============================================================
// UTILITY
// ============================================================

function delay(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


// ============================================================
// DEBUGGER DISCONNECT SAFETY
// ============================================================

chrome.debugger.onDetach.addListener(
  (
    source,
    reason
  ) => {

    const tabId =
      source?.tabId;


    if (!tabId) {
      return;
    }


    for (
      const [
        requestId,
        session
      ]
      of sessions.entries()
    ) {

      if (
        session.targetTabId ===
        tabId
      ) {

        console.warn(
          '[PBG] DEBUGGER DETACHED UNEXPECTEDLY',
          {
            requestId,
            tabId,
            reason
          }
        );


        sendResultToPresently(
          requestId,
          false,
          null,
          `Chrome debugger disconnected: ${reason ||
          'unknown reason'
          }`
        );


        cleanupSession(
          requestId
        );
      }
    }
  }
);


// ============================================================
// TARGET TAB CLOSED SAFETY
// ============================================================

chrome.tabs.onRemoved.addListener(
  (
    tabId
  ) => {

    for (
      const [
        requestId,
        session
      ]
      of sessions.entries()
    ) {

      if (
        session.targetTabId ===
        tabId
      ) {

        console.warn(
          '[PBG] TARGET TAB CLOSED DURING CAPTURE',
          {
            requestId,
            tabId
          }
        );


        sessions.delete(
          requestId
        );


        sendToPresently(
          session.sourceTabId,
          {
            type:
              'PRESENTLY_LIVE_CAPTURE_RESULT',

            requestId,

            success: false,

            image: null,

            error:
              'The real Chrome capture tab was closed.'
          }
        );
      }
    }
  }
);


// ============================================================
// SERVICE WORKER READY
// ============================================================

console.log(
  '[PBG] Presently Live Capture background service worker loaded.'
);