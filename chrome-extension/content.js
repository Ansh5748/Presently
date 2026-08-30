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
  const SCROLL_RATIO = 1.0;


  // Wait after every scroll.
  // Gives lazy-loaded content time to appear.
  const SCROLL_SETTLE_MS = 450;


  // Additional wait at the bottom.
  // Important for ecommerce / lazy-loaded pages.
  const BOTTOM_WAIT_MS = 1800;


  // ============================================================
  // CAPTURE UI CLEANUP
  // ============================================================

  // Small rendering buffer after a popup is actually closed.
  // This is NOT a popup detection wait.
  const POPUP_CLEANUP_WAIT_MS = 250;

  // MutationObserver watches the page continuously.
  // We do not intentionally wait 2-5 seconds for a popup.
  const POPUP_OBSERVER_ENABLED = true;

  // Small rendering buffer only after we actually close a popup.
  // We NEVER wait for a popup to appear.
  const POPUP_SETTLE_MAX_MS = 150;

  // Immediately hide high-confidence popup/backdrop elements
  // while their real close button is still rendering.
  const HIDE_POPUP_BEFORE_CLOSE_BUTTON = true;

  // Only use aggressive hiding for very strong popup candidates.
  // This protects normal fixed headers/chat buttons/etc.
  const POPUP_MIN_Z_INDEX = 100;

  // Restore popup elements after capture.
  const RESTORE_HIDDEN_POPUPS = true;

  // Do not aggressively remove arbitrary fixed elements.
  // Only high-confidence header/footer candidates are hidden.
  const ENABLE_FIXED_HEADER_FOOTER_CLEANUP = true;

  // Run popup cleanup before every viewport capture.
  const CLEAN_POPUPS_DURING_CAPTURE = true;

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
      
      // --------------------------------------------------------
      // STOP CURRENT LIVE CAPTURE
      //
      // Presently React -> content.js via window.postMessage
      // -> background.js via chrome.runtime.sendMessage
      // --------------------------------------------------------

      if (
        data.type ===
        'PRESENTLY_LIVE_CAPTURE_STOP'
      ) {

        console.log(
          '[PCT] PRESENTLY → EXTENSION STOP',
          {
            requestId:
              data.requestId
          }
        );

        chrome.runtime.sendMessage(
          {
            type:
              'PRESENTLY_LIVE_CAPTURE_STOP',

            requestId:
              data.requestId
          }
        )
          .then(() => {

            console.log(
              '[PCT] STOP SENT TO BACKGROUND'
            );

          })
          .catch(error => {

            console.error(
              '[PCT] STOP SEND FAILED',
              error
            );

          });

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

        console.log(
          '[PCT] STOP REQUEST RECEIVED VIA RUNTIME MSG'
        );

        if (
          captureSession &&
          !captureSession.cancelled
        ) {

          captureSession.stopRequested =
            true;

          // If a screenshot is currently in-flight,
          // receiveCaptureTile() will finish the capture
          // after that tile arrives.
          if (
            captureSession.captureInFlight
          ) {

            console.log(
              '[PCT] STOP WAITING FOR IN-FLIGHT TILE'
            );

          } else {

            console.log(
              '[PCT] STOP - NO TILE IN FLIGHT - STITCHING NOW'
            );

            finishCapture()
              .catch(error => {
                console.error(
                  '[PCT] STOP FINISH CAPTURE FAILED',
                  error
                );
              });
          }
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
  // CAPTURE UI CLEANUP
  // ============================================================

  let captureUiCleanupState = null;

  let popupObserver = null;

  let popupCleanupInProgress = false;

  // Elements temporarily hidden while a popup is active.
  // We restore them after capture finishes.
  const temporarilyHiddenPopupElements =
    new Map();

  /**
   * Returns the visible text of an element.
   */
  function getElementText(element) {
    try {
      return (
        element.innerText ||
        element.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    } catch {
      return '';
    }
  }


  /**
   * Returns whether an element is currently visible.
   */
  function isElementVisible(element) {
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 10 &&
        rect.height > 10 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    } catch {
      return false;
    }
  }


  /**
   * Try to identify and click an obvious popup/banner close button.
   *
   * We intentionally do NOT remove arbitrary elements.
   * Clicking a real close button is safer for the website.
   */
  function closeObviousPopupButtons() {
    if (!CLEAN_POPUPS_DURING_CAPTURE) {
      return 0;
    }

    let clicked = 0;

    try {
      const elements = Array.from(
        document.querySelectorAll(
          'button, [role="button"], a, input[type="button"], input[type="submit"]'
        )
      );

      const closeTextRegex =
        /^(×|✕|✖|x|close|dismiss|cancel|no thanks|no thank you|not now|maybe later|skip|got it|continue without|decline|reject)$/i;

      const ariaRegex =
        /(close|dismiss|cancel|no thanks|not now|skip)/i;

      for (const element of elements) {
        if (!isElementVisible(element)) {
          continue;
        }

        const text = getElementText(element);

        const aria =
          (
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            ''
          ).trim();

        const looksLikeCloseText =
          closeTextRegex.test(text);

        const looksLikeCloseAria =
          ariaRegex.test(aria);

        /*
        * Only consider small controls.
        *
        * This avoids accidentally clicking large CTA buttons
        * such as "Shop Now", "Buy Now", etc.
        */
        const rect =
          element.getBoundingClientRect();

        const isSmallControl =
          rect.width <= 180 &&
          rect.height <= 100;

        if (
          isSmallControl &&
          (
            looksLikeCloseText ||
            looksLikeCloseAria
          )
        ) {
          try {
            console.log(
              '[PCT] POPUP CLOSE BUTTON CLICK',
              {
                text,
                aria,
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            );

            element.click();

            clicked++;

            /*
            * Don't click dozens of unrelated buttons.
            * A few obvious dismiss controls are enough.
            */
            if (clicked >= 5) {
              break;
            }
          } catch (error) {
            console.warn(
              '[PCT] Popup close click failed:',
              error
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        '[PCT] Popup detection failed:',
        error
      );
    }

    return clicked;
  }

  /**
   * Start an always-on popup cleanup observer for the current
   * capture session.
   *
   * Important:
   * - Does NOT block scrolling.
   * - Does NOT wait 2-5 seconds.
   * - Runs whenever the website adds/changes DOM elements.
   * - Tries the real close button first.
   */

      /**
     * Temporarily hide a popup/backdrop immediately.
     *
     * This is the fallback for the important case where:
     *
     * popup appears
     *    ↓
     * close icon has NOT rendered yet
     *
     * We hide the visual popup immediately so it can never
     * cover the screenshot.
     *
     * Later, when its close button appears, the normal
     * closeObviousPopupButtons() logic can click it.
     */
    function temporarilyHidePopupElement(element, reason) {
      if (
        !element ||
        !element.isConnected ||
        temporarilyHiddenPopupElements.has(element)
      ) {
        return false;
      }

      try {
        const style =
          window.getComputedStyle(element);

        const original = {
          visibility:
            element.style.visibility,

          opacity:
            element.style.opacity,

          pointerEvents:
            element.style.pointerEvents
        };

        temporarilyHiddenPopupElements.set(
          element,
          original
        );

        element.style.setProperty(
          'visibility',
          'hidden',
          'important'
        );

        element.style.setProperty(
          'opacity',
          '0',
          'important'
        );

        element.style.setProperty(
          'pointer-events',
          'none',
          'important'
        );

        console.log(
          '[PCT] POPUP HIDDEN BEFORE CLOSE BUTTON',
          {
            reason,
            tag:
              element.tagName,
            id:
              element.id,
            className:
              typeof element.className === 'string'
                ? element.className
                : '',
            zIndex:
              style.zIndex
          }
        );

        return true;

      } catch (error) {
        console.warn(
          '[PCT] FAILED TO HIDE POPUP ELEMENT',
          error
        );

        temporarilyHiddenPopupElements.delete(
          element
        );

        return false;
      }
    }

    /**
     * Detect a strong popup/backdrop candidate.
     *
     * We deliberately DO NOT hide arbitrary fixed elements.
     *
     * We target:
     *
     * 1. Full-screen dark/translucent backdrops
     * 2. Large centered fixed dialogs
     * 3. Elements explicitly named modal/popup/dialog/overlay/etc.
     */
    function isLikelyPopupElement(element) {
      try {
        if (
          !element ||
          !element.isConnected ||
          element === document.body ||
          element === document.documentElement
        ) {
          return false;
        }

        const style =
          window.getComputedStyle(element);

        const rect =
          element.getBoundingClientRect();

        if (
          rect.width < 20 ||
          rect.height < 20
        ) {
          return false;
        }

        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity || '1') <= 0
        ) {
          return false;
        }

        const position =
          style.position;

        if (
          position !== 'fixed' &&
          position !== 'absolute'
        ) {
          return false;
        }

        const viewportWidth =
          window.innerWidth;

        const viewportHeight =
          window.innerHeight;

        const widthRatio =
          rect.width /
          Math.max(1, viewportWidth);

        const heightRatio =
          rect.height /
          Math.max(1, viewportHeight);

        const top =
          rect.top;

        const left =
          rect.left;

        const right =
          rect.right;

        const bottom =
          rect.bottom;

        const centered =
          Math.abs(
            (
              left +
              rect.width / 2
            ) -
            viewportWidth / 2
          ) <
          viewportWidth * 0.25;

        const identity =
          `${element.id || ''} ${
            typeof element.className === 'string'
              ? element.className
              : ''
          } ${
            element.getAttribute('role') || ''
          } ${
            element.getAttribute('aria-label') || ''
          }`.toLowerCase();

        const popupName =
          /(modal|popup|pop-up|overlay|dialog|lightbox|newsletter|subscribe|consent|cookie)/i
            .test(identity);

        /*
        * ============================================================
        * 1. FULL-SCREEN BACKDROP
        *
        * IMPORTANT:
        * NO z-index requirement.
        *
        * This is what should remove the black/dark background
        * immediately.
        * ============================================================
        */

        const coversViewport =
          widthRatio >= 0.90 &&
          heightRatio >= 0.80 &&
          top <= 10 &&
          left <= 10 &&
          right >= viewportWidth - 10 &&
          bottom >= viewportHeight - 10;

        if (
          coversViewport
        ) {
          return true;
        }

        /*
        * ============================================================
        * 2. LARGE CENTERED POPUP
        *
        * Again, don't require z-index.
        *
        * The screenshot you showed is exactly this type:
        * a large centered white popup sitting above the page.
        * ============================================================
        */

        const zIndex =
          parseInt(
            style.zIndex,
            10
          );

        const hasHighPopupZIndex =
          Number.isFinite(zIndex) &&
          zIndex >= POPUP_MIN_Z_INDEX;

        const largeCenteredPopup =
          centered &&
          widthRatio >= 0.40 &&
          heightRatio >= 0.20 &&
          heightRatio <= 0.95 &&
          top >= -50 &&
          bottom <= viewportHeight + 50 &&
          (
            popupName ||
            hasHighPopupZIndex
          );

        if (
          largeCenteredPopup
        ) {
          return true;
        }

        /*
        * ============================================================
        * 3. EXPLICIT POPUP/MODAL ELEMENT
        * ============================================================
        */

        if (
          popupName &&
          widthRatio >= 0.25 &&
          heightRatio >= 0.15
        ) {
          return true;
        }

        /*
        * ============================================================
        * 4. NATIVE DIALOG
        * ============================================================
        */

        if (
          element.tagName === 'DIALOG' &&
          element.open
        ) {
          return true;
        }

        return false;

      } catch {
        return false;
      }
    }

    /**
     * ============================================================
     * IMMEDIATE POPUP BACKDROP SUPPRESSION
     * ============================================================
     *
     * Some websites render:
     *
     *   backdrop/scrim
     *        +
     *   popup/dialog
     *
     * as two separate elements.
     *
     * The popup may disappear while the backdrop remains visible.
     *
     * This function specifically looks for full-viewport fixed/
     * absolute dark overlays and hides them immediately.
     *
     * IMPORTANT:
     * - No waiting.
     * - No scrolling delay.
     * - Does NOT click anything.
     * - Does NOT hide normal page content.
     */
    function hidePopupBackdropsImmediately() {
      if (
        !HIDE_POPUP_BEFORE_CLOSE_BUTTON ||
        !captureSession ||
        captureSession.cancelled
      ) {
        return 0;
      }

      let hidden = 0;

      try {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const elements = Array.from(
          document.querySelectorAll('body *')
        );

        /*
        * ------------------------------------------------------------
        * HELPER
        * ------------------------------------------------------------
        *
        * Detect whether an element is visually dark/translucent.
        */
        const looksDarkOrTranslucent = (style) => {
          const backgroundColor =
            style.backgroundColor || '';

          const backgroundImage =
            style.backgroundImage || '';

          const opacity =
            parseFloat(style.opacity || '1');

          /*
          * rgba()/hsla() with alpha.
          */
          const rgbaMatch =
            backgroundColor.match(
              /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/i
            );

          if (rgbaMatch) {
            const alpha =
              rgbaMatch[1] !== undefined
                ? parseFloat(rgbaMatch[1])
                : 1;

            if (alpha > 0 && alpha < 1) {
              return true;
            }
          }

          /*
          * Common black/dark backdrop colors.
          */
          if (
            /rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(
              backgroundColor
            )
          ) {
            return true;
          }

          /*
          * Gradient overlays are commonly used as backdrops.
          */
          if (
            /linear-gradient|radial-gradient/i.test(
              backgroundImage
            )
          ) {
            return true;
          }

          /*
          * Element itself is translucent.
          */
          if (
            opacity > 0 &&
            opacity < 1
          ) {
            return true;
          }

          return false;
        };

        /*
        * ------------------------------------------------------------
        * FIRST PASS
        *
        * Find actual full-screen overlay elements.
        * ------------------------------------------------------------
        */
        for (const element of elements) {
          try {
            if (
              !element ||
              !element.isConnected ||
              element === document.body ||
              element === document.documentElement
            ) {
              continue;
            }

            const style =
              window.getComputedStyle(element);

            const rect =
              element.getBoundingClientRect();

            const position =
              style.position;

            if (
              position !== 'fixed' &&
              position !== 'absolute'
            ) {
              continue;
            }

            if (
              rect.width < viewportWidth * 0.80 ||
              rect.height < viewportHeight * 0.70
            ) {
              continue;
            }

            /*
            * It must cover essentially the viewport.
            */
            const coversViewport =
              rect.top <= 20 &&
              rect.left <= 20 &&
              rect.right >= viewportWidth - 20 &&
              rect.bottom >= viewportHeight - 20;

            if (!coversViewport) {
              continue;
            }

            const identity =
              `${element.id || ''} ${
                typeof element.className === 'string'
                  ? element.className
                  : ''
              } ${
                element.getAttribute('role') || ''
              } ${
                element.getAttribute('aria-label') || ''
              }`.toLowerCase();

            const explicitBackdropName =
              /(backdrop|back-drop|scrim|overlay|modal-overlay|popup-overlay|dialog-overlay|lightbox-overlay|drawer-overlay|modal-backdrop|popup-backdrop|shade|dimmer|mask)/i
                .test(identity);

            const darkOrTranslucent =
              looksDarkOrTranslucent(style);

            /*
            * z-index is useful but NOT mandatory.
            */
            const zIndex =
              parseInt(style.zIndex, 10);

            const highZIndex =
              Number.isFinite(zIndex) &&
              zIndex >= POPUP_MIN_Z_INDEX;

            /*
            * Strong candidate if:
            *
            * 1. Explicitly named backdrop/overlay
            * OR
            * 2. Dark/translucent + full screen
            * OR
            * 3. Very high z-index + full screen
            */
            const isStrongBackdrop =
              explicitBackdropName ||
              darkOrTranslucent ||
              highZIndex;

            if (!isStrongBackdrop) {
              continue;
            }

            /*
            * Save original styles only once.
            */
            if (
              !temporarilyHiddenPopupElements.has(
                element
              )
            ) {
              temporarilyHiddenPopupElements.set(
                element,
                {
                  visibility:
                    element.style.visibility,

                  opacity:
                    element.style.opacity,

                  pointerEvents:
                    element.style.pointerEvents
                }
              );
            }

            element.style.setProperty(
              'visibility',
              'hidden',
              'important'
            );

            element.style.setProperty(
              'opacity',
              '0',
              'important'
            );

            element.style.setProperty(
              'pointer-events',
              'none',
              'important'
            );

            hidden++;

            console.log(
              '[PCT] POPUP BACKDROP HIDDEN IMMEDIATELY',
              {
                tag:
                  element.tagName,

                id:
                  element.id,

                className:
                  typeof element.className === 'string'
                    ? element.className
                    : '',

                position,

                zIndex:
                  style.zIndex,

                width:
                  Math.round(rect.width),

                height:
                  Math.round(rect.height),

                top:
                  Math.round(rect.top),

                left:
                  Math.round(rect.left),

                backgroundColor:
                  style.backgroundColor,

                backgroundImage:
                  style.backgroundImage,

                opacity:
                  style.opacity,

                reason:
                  explicitBackdropName
                    ? 'explicit-backdrop-name'
                    : darkOrTranslucent
                      ? 'dark-or-translucent'
                      : 'high-z-index'
              }
            );

            /*
            * Normally there is only one backdrop.
            * Allow a few because some sites have nested overlays.
            */
            if (hidden >= 3) {
              break;
            }

          } catch (elementError) {
            console.warn(
              '[PCT] BACKDROP ELEMENT CHECK FAILED',
              elementError
            );
          }
        }

        /*
        * ------------------------------------------------------------
        * SECOND PASS
        *
        * Catch a very common case where the backdrop does not have
        * an obvious class/name but is the topmost full-screen layer.
        *
        * We inspect points OUTSIDE the centered popup.
        * ------------------------------------------------------------
        */

        const testPoints = [
          [5, 5],
          [viewportWidth - 5, 5],
          [5, viewportHeight - 5],
          [viewportWidth - 5, viewportHeight - 5],
          [5, Math.round(viewportHeight / 2)],
          [
            viewportWidth - 5,
            Math.round(viewportHeight / 2)
          ]
        ];

        for (const [x, y] of testPoints) {
          try {
            const stack =
              document.elementsFromPoint(
                x,
                y
              );

            for (const element of stack) {
              if (
                !element ||
                element === document.body ||
                element === document.documentElement
              ) {
                continue;
              }

              if (
                temporarilyHiddenPopupElements.has(
                  element
                )
              ) {
                continue;
              }

              const style =
                window.getComputedStyle(element);

              const rect =
                element.getBoundingClientRect();

              const position =
                style.position;

              if (
                position !== 'fixed' &&
                position !== 'absolute'
              ) {
                continue;
              }

              if (
                rect.width <
                  viewportWidth * 0.80 ||
                rect.height <
                  viewportHeight * 0.70
              ) {
                continue;
              }

              const identity =
                `${element.id || ''} ${
                  typeof element.className === 'string'
                    ? element.className
                    : ''
                } ${
                  element.getAttribute('role') || ''
                } ${
                  element.getAttribute('aria-label') || ''
                }`.toLowerCase();

              const explicitBackdropName =
                /(backdrop|back-drop|scrim|overlay|modal-overlay|popup-overlay|dialog-overlay|lightbox-overlay|drawer-overlay|modal-backdrop|popup-backdrop|shade|dimmer|mask)/i
                  .test(identity);

              const darkOrTranslucent =
                looksDarkOrTranslucent(style);

              const zIndex =
                parseInt(style.zIndex, 10);

              const highZIndex =
                Number.isFinite(zIndex) &&
                zIndex >= POPUP_MIN_Z_INDEX;

              /*
              * Only treat this as backdrop if it has a strong
              * overlay characteristic.
              */
              if (
                !explicitBackdropName &&
                !darkOrTranslucent &&
                !highZIndex
              ) {
                continue;
              }

              if (
                !temporarilyHiddenPopupElements.has(
                  element
                )
              ) {
                temporarilyHiddenPopupElements.set(
                  element,
                  {
                    visibility:
                      element.style.visibility,

                    opacity:
                      element.style.opacity,

                    pointerEvents:
                      element.style.pointerEvents
                  }
                );
              }

              element.style.setProperty(
                'visibility',
                'hidden',
                'important'
              );

              element.style.setProperty(
                'opacity',
                '0',
                'important'
              );

              element.style.setProperty(
                'pointer-events',
                'none',
                'important'
              );

              hidden++;

              console.log(
                '[PCT] TOPMOST POPUP BACKDROP HIDDEN',
                {
                  x,
                  y,

                  tag:
                    element.tagName,

                  id:
                    element.id,

                  className:
                    typeof element.className === 'string'
                      ? element.className
                      : '',

                  zIndex:
                    style.zIndex,

                  backgroundColor:
                    style.backgroundColor,

                  opacity:
                    style.opacity
                }
              );

              break;

            }

            if (hidden >= 3) {
              break;
            }

          } catch (pointError) {
            console.warn(
              '[PCT] BACKDROP POINT CHECK FAILED',
              pointError
            );
          }
        }

      } catch (error) {
        console.warn(
          '[PCT] POPUP BACKDROP SCAN FAILED',
          error
        );
      }

      if (hidden > 0) {
        console.log(
          '[PCT] POPUP BACKDROP SUPPRESSION COMPLETE',
          {
            hidden,
            scrollY:
              Math.round(
                window.scrollY
              )
          }
        );
      } else {
        console.log(
          '[PCT] NO POPUP BACKDROP FOUND',
          {
            scrollY:
              Math.round(
                window.scrollY
              ),

            viewportWidth,
            viewportHeight
          }
        );
      }

      return hidden;
    }

    /**
     * Find and immediately hide popup/backdrop elements.
     *
     * This is intentionally synchronous and does not wait.
     */
    function hidePopupOverlaysImmediately() {
      if (
        !HIDE_POPUP_BEFORE_CLOSE_BUTTON ||
        !captureSession ||
        captureSession.cancelled
      ) {
        return 0;
      }

      let hidden = 0;

      try {
        const elements =
          Array.from(
            document.querySelectorAll(
              'body *'
            )
          );

        for (
          const element of elements
        ) {
          if (
            !isLikelyPopupElement(
              element
            )
          ) {
            continue;
          }

          if (
            temporarilyHidePopupElement(
              element,
              'popup-overlay-detected'
            )
          ) {
            hidden++;
          }

          /*
          * We normally only need a backdrop + popup.
          * Avoid touching dozens of elements on a badly
          * structured website.
          */
          if (
            hidden >= 4
          ) {
            break;
          }
        }

      } catch (error) {
        console.warn(
          '[PCT] POPUP OVERLAY SCAN FAILED',
          error
        );
      }

      if (
        hidden > 0
      ) {
        console.log(
          '[PCT] POPUP/BACKDROP HIDDEN IMMEDIATELY',
          {
            hidden,
            scrollY:
              Math.round(
                window.scrollY
              )
          }
        );
      }

      return hidden;
    }
  function startPopupCleanupObserver() {
    if (
      !POPUP_OBSERVER_ENABLED ||
      popupObserver
    ) {
      return;
    }

    console.log(
      '[PCT] POPUP OBSERVER STARTING'
    );

    const runCleanup = () => {
      if (
        popupCleanupInProgress ||
        !captureSession ||
        captureSession.cancelled
      ) {
        return;
      }

      popupCleanupInProgress = true;

      try {
        /*
        * STEP 1:
        * Hide full-screen popup backdrop immediately.
        */
        const backdropHidden =
          hidePopupBackdropsImmediately();

        if (backdropHidden > 0) {
          console.log(
            '[PCT] POPUP BACKDROP HIDDEN BEFORE CLOSE BUTTON',
            {
              backdropHidden,
              scrollY:
                Math.round(
                  window.scrollY
                )
            }
          );
        }
        /*
        * --------------------------------------------------------
        * STEP 2
        *
        * Immediately hide the popup/backdrop.
        *
        * This happens BEFORE we look for the close button.
        * So the popup cannot appear in the screenshot even
        * when its X button has not rendered yet.
        * --------------------------------------------------------
        */
        const hidden =
          hidePopupOverlaysImmediately();

        if (
          hidden > 0
        ) {
          console.log(
            '[PCT] POPUP VISUAL SUPPRESSION ACTIVE',
            {
              hidden,
              scrollY:
                Math.round(
                  window.scrollY
                )
            }
          );
        }

        /*
        * --------------------------------------------------------
        * STEP 3
        *
        * Now try the real close button.
        *
        * If the X has already rendered, click it normally.
        * --------------------------------------------------------
        */
        const clicked =
          closeObviousPopupButtons();

        if (
          clicked > 0
        ) {
          console.log(
            '[PCT] POPUP OBSERVER CLOSED POPUP',
            {
              clicked,
              scrollY:
                Math.round(
                  window.scrollY
                )
            }
          );
        }

      } catch (error) {
        console.warn(
          '[PCT] POPUP OBSERVER CLEANUP ERROR',
          error
        );

      } finally {
        popupCleanupInProgress = false;
      }
    };

    try {
      popupObserver =
        new MutationObserver(
          mutations => {
            if (
              !captureSession ||
              captureSession.cancelled
            ) {
              return;
            }

            let relevantChange = false;

            for (
              const mutation of mutations
            ) {
              if (
                mutation.type === 'childList' &&
                (
                  mutation.addedNodes?.length ||
                  mutation.removedNodes?.length
                )
              ) {
                relevantChange = true;
                break;
              }

              if (
                mutation.type === 'attributes' &&
                (
                  mutation.attributeName ===
                    'class' ||
                  mutation.attributeName ===
                    'style' ||
                  mutation.attributeName ===
                    'aria-label' ||
                  mutation.attributeName ===
                    'title'
                )
              ) {
                relevantChange = true;
                break;
              }
            }

            if (relevantChange) {
              /*
              * Run immediately after the current DOM mutation batch.
              *
              * We intentionally do NOT wait for the close button.
              * The popup itself can be hidden now.
              */
              queueMicrotask(
                runCleanup
              );
            }
          }
        );

      const observerTarget =
        document.documentElement ||
        document.body;

      if (!observerTarget) {
        console.warn(
          '[PCT] POPUP OBSERVER NO TARGET'
        );

        popupObserver = null;
        return;
      }

      popupObserver.observe(
        observerTarget,
        {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: [
            'class',
            'style',
            'aria-label',
            'title'
          ]
        }
      );

      // One immediate pass for a popup that already exists.
      runCleanup();

      console.log(
        '[PCT] POPUP OBSERVER ACTIVE'
      );

    } catch (error) {
      console.error(
        '[PCT] POPUP OBSERVER START FAILED',
        error
      );

      popupObserver = null;
    }
  }

  /**
   * Stop popup observation when capture finishes/cancels.
   */
  function stopPopupCleanupObserver() {
    if (!popupObserver) {
      return;
    }

    try {
      popupObserver.disconnect();

      console.log(
        '[PCT] POPUP OBSERVER STOPPED'
      );

    } catch (error) {
      console.warn(
        '[PCT] POPUP OBSERVER STOP FAILED',
        error
      );
    }

    popupObserver = null;
    popupCleanupInProgress = false;
  }

  /**
   * Restore any popup elements that were temporarily hidden.
   */
  function restoreTemporarilyHiddenPopups() {
    if (
      !RESTORE_HIDDEN_POPUPS ||
      temporarilyHiddenPopupElements.size === 0
    ) {
      return;
    }

    for (
      const [
        element,
        original
      ] of temporarilyHiddenPopupElements
    ) {
      try {
        element.style.visibility =
          original.visibility || '';

        element.style.opacity =
          original.opacity || '';

        element.style.pointerEvents =
          original.pointerEvents || '';

      } catch {
        // Website may have removed the popup.
      }
    }

    console.log(
      '[PCT] RESTORED TEMPORARILY HIDDEN POPUPS',
      {
        restored:
          temporarilyHiddenPopupElements.size
      }
    );

    temporarilyHiddenPopupElements.clear();
  }

  /**
   * Score an element as a likely persistent header/footer.
   *
   * We are deliberately conservative.
   */
  function scorePersistentChrome(element) {
    try {
      if (!isElementVisible(element)) {
        return 0;
      }

      const style =
        window.getComputedStyle(element);

      const rect =
        element.getBoundingClientRect();

      const position =
        style.position;

      if (
        position !== 'fixed' &&
        position !== 'sticky'
      ) {
        return 0;
      }

      const viewportWidth =
        window.innerWidth;

      const viewportHeight =
        window.innerHeight;

      let score = 0;

      const widthRatio =
        rect.width / Math.max(1, viewportWidth);

      const heightRatio =
        rect.height / Math.max(1, viewportHeight);

      const topDistance =
        Math.abs(rect.top);

      const bottomDistance =
        Math.abs(
          viewportHeight - rect.bottom
        );

      const text =
        getElementText(element);

      const className =
        typeof element.className === 'string'
          ? element.className.toLowerCase()
          : '';

      const id =
        (
          element.id ||
          ''
        ).toLowerCase();

      /*
      * Must span a substantial part of the viewport.
      */
      if (widthRatio >= 0.70) {
        score += 3;
      } else if (widthRatio >= 0.50) {
        score += 1;
      }

      /*
      * A header/footer is normally relatively short.
      */
      if (heightRatio <= 0.30) {
        score += 2;
      }

      /*
      * Top fixed/sticky element.
      */
      if (
        topDistance <= 8 &&
        rect.height <= 180
      ) {
        score += 4;
      }

      /*
      * Bottom fixed/sticky element.
      */
      if (
        bottomDistance <= 8 &&
        rect.height <= 180
      ) {
        score += 4;
      }

      /*
      * Navigation/header/footer terminology.
      */
      if (
        /(header|navbar|nav-bar|navigation|site-header|main-header|sticky-header|footer|bottom-bar)/i
          .test(`${id} ${className}`)
      ) {
        score += 3;
      }

      /*
      * Navigation-like content.
      */
      if (
        /(menu|home|shop|account|cart|search|contact|about)/i
          .test(text)
      ) {
        score += 1;
      }

      /*
      * Don't classify giant full-screen modals as headers.
      */
      if (
        widthRatio >= 0.90 &&
        heightRatio >= 0.70
      ) {
        return 0;
      }

      return score;
    } catch {
      return 0;
    }
  }


  /**
   * Temporarily hide persistent fixed/sticky header/footer elements.
   *
   * We use visibility:hidden rather than display:none.
   *
   * This is critical:
   * display:none can change document layout and therefore
   * change scroll positions.
   *
   * visibility:hidden keeps the exact layout dimensions.
   */
  function hidePersistentHeadersFooters() {
    if (!ENABLE_FIXED_HEADER_FOOTER_CLEANUP) {
      return 0;
    }

    if (!captureUiCleanupState) {
      captureUiCleanupState = {
        hiddenElements: []
      };
    }

    try {
      const allElements =
        Array.from(
          document.querySelectorAll(
            'body *'
          )
        );

      let hiddenCount = 0;
      let topHeaderHeight = 0;

      for (const element of allElements) {
        if (
          captureUiCleanupState.hiddenElements
            .some(item => item.element === element)
        ) {
          continue;
        }

        const score =
          scorePersistentChrome(element);

        /*
        * High-confidence only.
        *
        * We require a reasonably strong score so that ordinary
        * fixed chat buttons and content aren't accidentally hidden.
        */
        if (score < 7) {
          continue;
        }

        const style =
          window.getComputedStyle(element);

        const originalVisibility =
          element.style.visibility;

        /*
        * Don't override an element that is already hidden.
        */
        if (
          style.visibility === 'hidden'
        ) {
          continue;
        }

        captureUiCleanupState.hiddenElements.push({
          element,
          originalVisibility
        });

        const rect =
          element.getBoundingClientRect();

        const isTopHeader =
          rect.top <= 8 &&
          rect.height > 0 &&
          rect.height <= 180 &&
          rect.width >=
            window.innerWidth * 0.50;

        if (
          isTopHeader &&
          rect.height > topHeaderHeight
        ) {
          topHeaderHeight =
            Math.round(rect.height);
        }

        element.style.setProperty(
          'visibility',
          'hidden',
          'important'
        );

        hiddenCount++;

        console.log(
          '[PCT] HIDING PERSISTENT HEADER/FOOTER',
          {
            tag: element.tagName,
            id: element.id,
            className:
              typeof element.className === 'string'
                ? element.className
                : '',
            score
          }
        );

        /*
        * Don't hide hundreds of elements on a badly structured site.
        */
        if (hiddenCount >= 10) {
          break;
        }
      }

      console.log(
        '[PCT] PERSISTENT UI CLEANUP COMPLETE',
        {
          hiddenCount,
          topHeaderHeight
        }
      );
      return topHeaderHeight; 
    } catch (error) {
      console.warn(
        '[PCT] Persistent UI cleanup failed:',
        error
      );
    }
  }

  /**
   * Restore every element changed by the capture cleanup.
   */
  function restorePersistentHeadersFooters() {
    if (!captureUiCleanupState) {
      return;
    }

    try {
      for (
        const item of
        captureUiCleanupState.hiddenElements
      ) {
        try {
          item.element.style.visibility =
            item.originalVisibility || '';
        } catch {
          // Element may have been removed by the website.
        }
      }

      console.log(
        '[PCT] RESTORED PERSISTENT HEADER/FOOTER UI',
        {
          restored:
            captureUiCleanupState.hiddenElements.length
        }
      );
    } catch (error) {
      console.warn(
        '[PCT] Failed restoring persistent UI:',
        error
      );
    }

    captureUiCleanupState = null;
  }


  /**
   * Complete UI cleanup pass.
   */
    async function preparePageForCapture() {
      console.log(
        '[PCT] INITIAL POPUP CHECK START',
        {
          scrollY:
            Math.round(window.scrollY)
        }
      );

      if (
        !captureSession ||
        captureSession.cancelled
      ) {
        return;
      }

      // Start continuous popup monitoring.
      // This does not block the first screenshot.
      startPopupCleanupObserver();

      // Immediate synchronous check for popups
      // that already exist.
      const backdropHidden =
        hidePopupBackdropsImmediately();

      const hidden =
        hidePopupOverlaysImmediately();

      const clicked =
        closeObviousPopupButtons();

      if (
        backdropHidden > 0 ||
        hidden > 0 ||
        clicked > 0
      ) {
        console.log(
          '[PCT] EXISTING POPUP CLOSED IMMEDIATELY',
          {
            backdropHidden,
            hidden,
            clicked,  
          }
        );

        await delay(
          POPUP_CLEANUP_WAIT_MS
        );
      } else {
        console.log(
          '[PCT] NO EXISTING POPUP - NO POPUP WAIT'
        );
      }

      console.log(
        '[PCT] INITIAL POPUP PREPARATION COMPLETE',
        {
          scrollY:
            Math.round(window.scrollY)
        }
      );

      // IMPORTANT:
      // We intentionally do not wait for delayed popups here.
      //
      // MutationObserver will close their close button as soon
      // as the website inserts/renders it.
      //
      // This prevents a 2-5 second artificial delay before
      // every capture.
    }

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

        stopRequested: false,

        captureInFlight: false,

        lastRequestedY: null,

        firstScrollDone: false,

        firstScrollAdjustment: 0,

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

      // Some websites restore the scroll position after load.
      // Force top again.
      window.scrollTo(
        0,
        0
      );

      await delay(
        100
      );

      // --------------------------------------------------------
      // NOW check for popup.
      //
      // Header is still visible.
      // --------------------------------------------------------

      await preparePageForCapture();


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
      //
      // IMPORTANT:
      // The first viewport MUST contain the normal website header.
      // Popup/banner has already been closed above.
      // --------------------------------------------------------

      console.log(
        '[PCT] FIRST VIEWPORT - HEADER STILL VISIBLE'
      );

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
      captureSession.cancelled ||
      captureSession.stopRequested
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
    // STOP REQUESTED
    //
    // The in-flight screenshot has now arrived.
    // Store it first, then stitch everything captured so far.
    // ----------------------------------------------------------

    if (
      captureSession.stopRequested
    ) {

      console.log(
        '[PCT] STOP REQUESTED - TILE RECEIVED - STITCHING'
      );

      await finishCapture();

      return;
    }

    // ----------------------------------------------------------
    // FIRST TILE COMPLETE.
    //
    // The first screenshot has now definitely been captured
    // with the real website header visible.
    //
    // ONLY NOW hide the persistent header/footer so it does not
    // repeat in the following viewport screenshots.
    // ----------------------------------------------------------

    if (
      captureSession.tiles.length === 1
    ) {
      console.log(
        '[PCT] FIRST TILE CAPTURED - NOW HIDING PERSISTENT HEADER/FOOTER'
      );

      const hiddenHeaderHeight =
        hidePersistentHeadersFooters();

      captureSession.firstScrollAdjustment =
        Math.max(
          0,
          Math.round(
            hiddenHeaderHeight || 0
          )
        );

      captureSession.firstScrollDone =
        false;

      console.log(
        '[PCT] FIRST SCROLL ADJUSTMENT READY',
        {
          hiddenHeaderHeight:
            captureSession.firstScrollAdjustment,
          viewportHeight:
            window.innerHeight
        }
      );
    }


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


    let step;

    const isFirstPostHeaderScroll =
      captureSession.tiles.length === 1 &&
      !captureSession.firstScrollDone;

    if (
      isFirstPostHeaderScroll
    ) {
      step =
        Math.max(
          300,
          Math.floor(
            viewportHeight -
            captureSession.firstScrollAdjustment
          )
        );

      captureSession.firstScrollDone =
        true;

      console.log(
        '[PCT] FIRST POST-HEADER SCROLL',
        {
          viewportHeight,
          headerHeight:
            captureSession.firstScrollAdjustment,
          step
        }
      );

    } else {
      step =
        Math.max(
          300,
          Math.floor(
            viewportHeight *
            SCROLL_RATIO
          )
        );

      console.log(
        '[PCT] NORMAL VIEWPORT SCROLL',
        {
          viewportHeight,
          step,
          ratio:
            SCROLL_RATIO
        }
      );
    }


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

    // Popup cleanup is now handled continuously by
    // MutationObserver. Do one lightweight synchronous
    // pass here as an additional safety check.

    if (
      CLEAN_POPUPS_DURING_CAPTURE
    ) {
      /*
      * First hide any newly appearing popup BACKDROP.
      */
      const backdropHidden =
        hidePopupBackdropsImmediately();

      /*
      * First hide any newly appearing popup/backdrop.
      * This must happen before the next screenshot.
      */
      const hidden =
        hidePopupOverlaysImmediately();

      /*
      * Then try the real close button.
      *
      * If the website has rendered it already, click it.
      */
      const clicked =
        closeObviousPopupButtons();

      if (
        backdropHidden > 0 ||
        hidden > 0 ||
        clicked > 0
      ) {
        console.log(
          '[PCT] POPUP CLEANUP AFTER SCROLL',
          {
            backdropHidden,
            hidden,
            clicked,
            scrollY:
              Math.round(
                window.scrollY
              )
          }
        );

        /*
        * Only wait a tiny rendering buffer when we
        * actually changed something.
        */
        await delay(
          POPUP_SETTLE_MAX_MS
        );
      }
    }

    // ----------------------------------------------------------
    // Wait for lazy content.
    // ----------------------------------------------------------

    await waitForPageToSettle(
      false
    );


    if (
      !captureSession ||
      captureSession.cancelled ||
      captureSession.stopRequested
    ) {

      console.log(
        '[PCT] STOP/CANCEL DETECTED AFTER PAGE SETTLE - NOT REQUESTING NEXT TILE'
      );
      
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

      restorePersistentHeadersFooters();

      stopPopupCleanupObserver();

      restoreTemporarilyHiddenPopups();

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
    // Draw screenshot tiles sequentially.
    //
    // IMPORTANT:
    // If the final bottom screenshot has the same scrollY as the
    // previous screenshot, keep only the latest screenshot.
    //
    // For normal tiles, use the exact scroll distance between
    // screenshots so no overlapping pixels are stitched twice.
    // ----------------------------------------------------------

    const uniqueTilesByScrollY =
      new Map();

    for (const tile of tiles) {
      if (
        !tile ||
        !tile.image
      ) {
        continue;
      }

      uniqueTilesByScrollY.set(
        Number(tile.scrollY || 0),
        tile
      );
    }

    const stitchTilesList =
      Array.from(
        uniqueTilesByScrollY.values()
      ).sort(
        (a, b) =>
          Number(a.scrollY || 0) -
          Number(b.scrollY || 0)
      );

    console.log(
      '[PCT] STITCH UNIQUE TILES',
      {
        originalTileCount:
          tiles.length,

        uniqueTileCount:
          stitchTilesList.length
      }
    );


    for (
      let i = 0;
      i < stitchTilesList.length;
      i++
    ) {

      const tile =
        stitchTilesList[i];

      const image =
        (i === 0)
          ? firstImage
          : await loadImage(
              tile.image
            );

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


      // --------------------------------------------------------
      // Current and previous scroll positions in CSS pixels.
      // --------------------------------------------------------

      const currentScrollY =
        Number(
          tile.scrollY || 0
        );

      const previousScrollY =
        i === 0
          ? 0
          : Number(
              stitchTilesList[i - 1].scrollY || 0
            );


      // --------------------------------------------------------
      // Screenshot viewport height in CSS pixels.
      // --------------------------------------------------------

      const viewportCssHeight =
        image.naturalHeight /
        dpr;


      // --------------------------------------------------------
      // Determine how much of this screenshot is NEW.
      //
      // Normal tile:
      //
      // previous Y = 800
      // current Y  = 1600
      // delta      = 800
      //
      // Final overlapping tile:
      //
      // previous Y = 1600
      // current Y  = 1700
      // delta      = 100
      //
      // We only stitch the new 100px.
      // --------------------------------------------------------

      const scrollDeltaCss =
        i === 0
          ? viewportCssHeight
          : Math.max(
              0,
              currentScrollY -
              previousScrollY
            );


      if (
        scrollDeltaCss <= 0
      ) {

        console.log(
          '[PCT] SKIPPING ZERO-DELTA TILE',
          {
            index:
              i + 1,

            scrollY:
              currentScrollY
          }
        );

        continue;
      }


      // --------------------------------------------------------
      // Source crop.
      //
      // If the scroll delta is smaller than the viewport,
      // the top part overlaps the previous screenshot.
      // Skip that overlapping source area.
      // --------------------------------------------------------

      const sourceYCss =
        Math.max(
          0,
          viewportCssHeight -
          scrollDeltaCss
        );

      const sourceY =
        Math.round(
          sourceYCss *
          dpr
        );

      const sourceHeight =
        Math.min(
          image.naturalHeight -
          sourceY,

          Math.round(
            scrollDeltaCss *
            dpr
          )
        );


      if (
        sourceHeight <= 0
      ) {
        continue;
      }


      // --------------------------------------------------------
      // Destination position.
      //
      // The cropped content starts immediately after the
      // previous screenshot's already stitched content.
      // --------------------------------------------------------

      const destinationY =
        Math.round(
          (
            currentScrollY +
            sourceYCss
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
          sourceHeight *
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
        visibleHeight <= 0
      ) {
        continue;
      }


      // --------------------------------------------------------
      // Draw only the NEW portion.
      // --------------------------------------------------------

      ctx.drawImage(
        image,

        0,
        sourceY,

        image.naturalWidth,
        sourceHeight,

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
            stitchTilesList.length,

          scrollY:
            currentScrollY,

          previousScrollY,

          scrollDeltaCss,

          sourceYCss,

          sourceHeight,

          destinationY,

          visibleHeight
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

    restorePersistentHeadersFooters();

    stopPopupCleanupObserver();

    restoreTemporarilyHiddenPopups();

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