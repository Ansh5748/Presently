import React, { useState, useEffect, useRef } from 'react';
// html2canvas is intentionally removed.
// The automatic capture is now handled by the Presently Chrome Extension.
import {
  Globe,
  Smartphone,
  Monitor,
  CheckCircle,
  Sparkles,
  X,
  ArrowDown,
  ShieldCheck,
  RefreshCw,
  Wifi,
  Battery,
  AlertTriangle,
  ScreenShare,
  Zap,
  MousePointer
} from 'lucide-react';

interface LiveCaptureModalProps {
  isOpen: boolean;
  url: string;
  device: 'desktop' | 'mobile';
  onClose: () => void;
  onCaptureComplete: (base64Image: string) => void;
  isLocalComputeEnabled?: boolean;
}

export const LiveCaptureModal: React.FC<LiveCaptureModalProps> = ({
  isOpen,
  url,
  device: initialDevice,
  onClose,
  onCaptureComplete,
  isLocalComputeEnabled = false
}) => {
  const [selectedDevice, setSelectedDevice] =
    useState<'desktop' | 'mobile'>(initialDevice);

  const [typedUrl, setTypedUrl] = useState('');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentStep, setCurrentStep] =
    useState<string>('Opening website in Chrome...');

  const [stepIndex, setStepIndex] = useState(1);
  const [capturedPreview, setCapturedPreview] =
    useState<string | null>(null);

  const [isDone, setIsDone] = useState(false);
  const [errorMsg, setErrorMsg] =
    useState<string | null>(null);

  const [hasFirstViewport, setHasFirstViewport] =
    useState(false);

  const [isCaptureActive, setIsCaptureActive] =
    useState(false);

  const [proxyIndex, setProxyIndex] = useState(0);

  const [isTabSharing, setIsTabSharing] =
    useState(false);

  const [shareCountdown, setShareCountdown] =
    useState<number | null>(null);

  const [isWebpageLoaded, setIsWebpageLoaded] =
    useState(false);

  const [loadingStepIdx, setLoadingStepIdx] =
    useState(0);

  const iframeRef =
    useRef<HTMLIFrameElement>(null);

  const scrollBoxRef =
    useRef<HTMLDivElement>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const captureRequestIdRef =
    useRef<string | null>(null);

  const stopCaptureRef =
    useRef(false);

  const loadingSteps = [
    `Opening ${url} in Chrome...`,
    'Waiting for the real webpage to load...',
    'Preparing full-page capture...',
    'Scrolling from top to bottom...'
  ];

  // ------------------------------------------------------------
  // LOOP LOADING STATUS
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || capturedPreview || errorMsg) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingStepIdx(
        (prev) => (prev + 1) % loadingSteps.length
      );
    }, 1200);

    return () => clearInterval(interval);
  }, [isOpen, capturedPreview, errorMsg, url]);

  // ------------------------------------------------------------
  // DEVICE CHANGE
  // ------------------------------------------------------------

  useEffect(() => {
    setSelectedDevice(initialDevice);
  }, [initialDevice]);

  // ------------------------------------------------------------
  // CANCEL / CLOSE
  // ------------------------------------------------------------

  const handleCancel = () => {
    if (abortControllerRef.current) {
      console.log(
        '[LiveCaptureModal] 🚫 User cancelled capture.'
      );

      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsCaptureActive(false);
    setHasFirstViewport(false);

    onClose();
  };

  // ------------------------------------------------------------
  // STOP & SAVE CAPTURE
  //
  // Different from Cancel:
  //
  // Cancel = discard capture
  // Stop   = stitch everything captured so far
  // ------------------------------------------------------------

  const handleStopCapture = () => {
    const requestId =
      captureRequestIdRef.current;

    if (
      !requestId ||
      isDone ||
      stopCaptureRef.current
    ) {
      return;
    }

    console.log(
      '[LiveCaptureModal] 🛑 STOP & SAVE REQUESTED',
      {
        requestId
      }
    );

    stopCaptureRef.current =
      true;

    setCurrentStep(
      'Stopping capture & stitching captured page...'
    );

    /*
    * IMPORTANT:
    *
    * Do NOT abort the AbortController here.
    *
    * abort() goes through the existing CANCEL flow and
    * would throw away the captured tiles.
    */
    window.postMessage(
      {
        type:
          'PRESENTLY_LIVE_CAPTURE_STOP',
        requestId
      },
      window.location.origin
    );
  };

  // ------------------------------------------------------------
  // MANUAL SCREEN SHARE
  //
  // IMPORTANT:
  // This remains completely independent of the new
  // Chrome Extension live capture system.
  // ------------------------------------------------------------

  const handleShareChromeTab = async () => {
    try {
      if (abortControllerRef.current) {
        console.log(
          '[LiveCaptureModal] 🚫 Aborting background auto-capture for Screen Share...'
        );

        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setIsTabSharing(true);
      setIsCaptureActive(true);
      setHasFirstViewport(false);
      setCurrentStep(
        'Select Chrome tab or window to share...'
      );

      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser'
          },
          audio: false
        });

      const video =
        document.createElement('video');

      video.srcObject = stream;

      await video.play();

      const tileWidth =
        video.videoWidth || 1280;

      const tileHeight =
        video.videoHeight || 800;

      const rawTiles: HTMLCanvasElement[] = [];

      // Existing manual 10-second recording.
      // DO NOT change this behavior.
      for (let sec = 10; sec > 0; sec--) {
        setShareCountdown(sec);

        setCurrentStep(
          `Scroll shared page from Top to Bottom! Recording tile ${11 - sec
          }/10... (${sec}s remaining)`
        );

        const tileCanvas =
          document.createElement('canvas');

        tileCanvas.width = tileWidth;
        tileCanvas.height = tileHeight;

        const tileCtx =
          tileCanvas.getContext('2d');

        if (tileCtx) {
          tileCtx.drawImage(
            video,
            0,
            0,
            tileWidth,
            tileHeight
          );

          rawTiles.push(tileCanvas);
        }

        await new Promise(
          (r) => setTimeout(r, 1000)
        );
      }

      setShareCountdown(null);

      setCurrentStep(
        'Stitching full-page tiles & deduplicating sticky headers...'
      );

      stream
        .getTracks()
        .forEach((track) => track.stop());

      if (rawTiles.length === 0) {
        throw new Error(
          'No screen-share frames were captured.'
        );
      }

      const tiles = [...rawTiles];

      const HEADER_CROP = 70;

      const croppedHeight = Math.max(
        100,
        tileHeight - HEADER_CROP
      );

      const masterHeight =
        tileHeight +
        (tiles.length - 1) *
        croppedHeight;

      const masterCanvas =
        document.createElement('canvas');

      masterCanvas.width = tileWidth;
      masterCanvas.height = masterHeight;

      const masterCtx =
        masterCanvas.getContext('2d');

      if (!masterCtx) {
        throw new Error(
          'Unable to create screen-share canvas.'
        );
      }

      tiles.forEach((tile, idx) => {
        if (idx === 0) {
          masterCtx.drawImage(
            tile,
            0,
            0,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight
          );
        } else {
          const srcY = HEADER_CROP;
          const srcH = croppedHeight;

          const destY =
            tileHeight +
            (idx - 1) *
            croppedHeight;

          masterCtx.drawImage(
            tile,
            0,
            srcY,
            tileWidth,
            srcH,
            0,
            destY,
            tileWidth,
            srcH
          );
        }
      });

      const base64 =
        masterCanvas.toDataURL(
          'image/webp',
          0.85
        );

      setCapturedPreview(base64);
      setIsDone(true);
      setIsTabSharing(false);
      setIsCaptureActive(false);

      onCaptureComplete(base64);
    } catch (e: any) {
      setIsTabSharing(false);
      setShareCountdown(null);
      setIsCaptureActive(false);

      console.warn(
        '[LiveCaptureModal] Share screen cancelled:',
        e
      );
    }
  };

  // ------------------------------------------------------------
  // REAL CHROME EXTENSION CAPTURE BRIDGE
  // ------------------------------------------------------------

  const requestLiveChromeCapture = async (
    targetUrl: string,
    device: 'desktop' | 'mobile',
    signal: AbortSignal
  ): Promise<string> => {
    return new Promise(
      (resolve, reject) => {
        if (signal.aborted) {
          reject(
            new Error('Capture cancelled.')
          );
          return;
        }

        const requestId =
          crypto.randomUUID();

        captureRequestIdRef.current =
          requestId;

        stopCaptureRef.current =
          false;

        let finished = false;

        let timeoutId: ReturnType<
          typeof setTimeout
        > | null = null;

        function cleanup() {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          window.removeEventListener('message', handleMessage);
          signal.removeEventListener('abort', handleAbort);
        }

        const resetTimeout = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          timeoutId = setTimeout(() => {
            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            reject(
              new Error(
                'Presently Live Capture extension did not respond. Please make sure the extension is installed and enabled in Chrome.'
              )
            );
          }, 120000);
        };

        const chunkAccumulator: { [index: number]: string } = {};
        let receivedChunkCount = 0;
        let expectedTotalChunks = 0;

        const handleMessage = (
          event: MessageEvent
        ) => {
          if (event.source !== window) {
            return;
          }

          const data = event.data;

          console.log(
            '[PCAP] A5 REACT WINDOW MESSAGE RECEIVED:',
            {
              type: data?.type,
              requestId: data?.requestId,
              expectedRequestId: requestId,
              imageExists: !!data?.image,
              imageLength: data?.image?.length || 0,
              progress: data?.progress,
              chunkIndex: data?.chunkIndex,
              totalChunks: data?.totalChunks
            }
          );

          if (!data || data.requestId !== requestId) {
            return;
          }

          // Reset timeout since extension is actively sending updates
          resetTimeout();

          // ----------------------------------------------------
          // CHUNKED FINAL SCREENSHOT
          // ----------------------------------------------------
          if (data.type === 'PRESENTLY_LIVE_CAPTURE_RESULT_CHUNK') {
            expectedTotalChunks = data.totalChunks || 1;
            if (!chunkAccumulator[data.chunkIndex]) {
              chunkAccumulator[data.chunkIndex] = data.chunkData || '';
              receivedChunkCount++;
            }

            if (receivedChunkCount === expectedTotalChunks) {
              const assembledImage = Array.from({ length: expectedTotalChunks })
                .map((_, i) => chunkAccumulator[i] || '')
                .join('');

              if (finished) return;
              finished = true;
              cleanup();

              if (assembledImage && assembledImage.length > 500) {
                resolve(assembledImage);
              } else {
                reject(new Error('Reassembled screenshot is empty.'));
              }
            }
            return;
          }

          // ----------------------------------------------------
          // LIVE TILE FROM REAL CHROME
          // ----------------------------------------------------
          if (data.type === 'PRESENTLY_LIVE_CAPTURE_TILE') {
            
            setHasFirstViewport(true);

            setCapturedPreview(data.image);

            if (scrollBoxRef.current) {
              const maxScroll = scrollBoxRef.current.scrollHeight - scrollBoxRef.current.clientHeight;
              if (maxScroll > 0) {
                const prog = (data.progress || 0) / 100;
                scrollBoxRef.current.scrollTop = Math.round(prog * maxScroll);
              }
            }

            setScrollProgress(
              Math.max(35, Math.min(95, data.progress || 35))
            );

            setCurrentStep(`Capturing real Chrome webpage... ${data.progress || 0}%`);
            return;
          }

          // ----------------------------------------------------
          // UNCHUNKED FINAL COMPLETE SCREENSHOT
          // ----------------------------------------------------
          if (data.type === 'PRESENTLY_LIVE_CAPTURE_RESULT') {
            if (finished) return;
            finished = true;
            cleanup();

            if (data.success && data.image) {
              resolve(data.image);
            } else {
              reject(new Error(data.error || 'Live Chrome capture failed.'));
            }
          }
        };

        const handleAbort = () => {
          if (finished) {
            return;
          }

          finished = true;

          cleanup();

          window.postMessage(
            {
              type:
                'PRESENTLY_LIVE_CAPTURE_CANCEL',
              requestId
            },
            window.location.origin
          );

          reject(
            new Error(
              'Capture cancelled.'
            )
          );
        };

        window.addEventListener(
          'message',
          handleMessage
        );

        signal.addEventListener(
          'abort',
          handleAbort,
          { once: true }
        );

        // Start initial timeout timer
        resetTimeout();

        console.log(
          '[LiveCaptureModal] Sending live Chrome capture request:',
          {
            requestId,
            targetUrl,
            device
          }
        );

        window.postMessage(
          {
            type:
              'PRESENTLY_LIVE_CAPTURE_REQUEST',
            requestId,
            url: targetUrl,
            device
          },
          window.location.origin
        );
      }
    );
  };

  // ------------------------------------------------------------
  // AUTOMATIC LIVE CHROME CAPTURE
  // ------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || !url) {
      return;
    }

    const targetFullUrl =
      url.trim().startsWith('http')
        ? url.trim()
        : `https://${url.trim()}`;

    // Reset state
    setTypedUrl('');
    setScrollProgress(0);
    setStepIndex(1);
    setCurrentStep(
      `Opening ${targetFullUrl} in Chrome...`
    );
    setCapturedPreview(null);
    setIsDone(false);
    setErrorMsg(null);
    setProxyIndex(0);
    setIsWebpageLoaded(false);
    setLoadingStepIdx(0);

    setHasFirstViewport(false);
    setIsCaptureActive(true);

    // Fresh AbortController
    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    const signal =
      controller.signal;

    let isMounted = true;

    let typingTimer:
      ReturnType<typeof setInterval> | null =
      null;

    const executeLiveCapture =
      async () => {
        try {
          // ------------------------------------------------------
          // STEP 1
          // Address bar typing animation
          // ------------------------------------------------------

          let charIdx = 0;

          await new Promise<void>(
            (resolve) => {
              typingTimer =
                setInterval(() => {
                  if (
                    signal.aborted ||
                    !isMounted
                  ) {
                    if (typingTimer) {
                      clearInterval(
                        typingTimer
                      );
                    }

                    resolve();
                    return;
                  }

                  charIdx += 2;

                  setTypedUrl(
                    targetFullUrl.slice(
                      0,
                      charIdx
                    )
                  );

                  if (
                    charIdx >=
                    targetFullUrl.length
                  ) {
                    if (typingTimer) {
                      clearInterval(
                        typingTimer
                      );

                      typingTimer = null;
                    }

                    resolve();
                  }
                }, 20);
            }
          );

          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          // ------------------------------------------------------
          // STEP 2
          // Prepare modal while Chrome handles the real page.
          // ------------------------------------------------------

          setStepIndex(2);
          setCurrentStep(
            'Waiting for the real Chrome page to load...'
          );
          setScrollProgress(15);

          // Keep preview scroll at top.
          if (scrollBoxRef.current) {
            scrollBoxRef.current.scrollTop = 0;
          }

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 300)
          );

          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          setIsWebpageLoaded(true);

          setCurrentStep(
            'Preparing full-page capture...'
          );

          setScrollProgress(25);

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 500)
          );

          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          // ------------------------------------------------------
          // STEP 3
          // REAL CHROME CAPTURE
          //
          // IMPORTANT:
          // There is NO /take request here.
          // There is NO Puppeteer dependency here.
          // ------------------------------------------------------

          setStepIndex(3);

          setCurrentStep(
            'Opening webpage in real Chrome...'
          );

          setScrollProgress(35);

          console.log(
            '[LiveCaptureModal] Starting independent Chrome live capture:',
            targetFullUrl
          );

          const base64 =
            await requestLiveChromeCapture(
              targetFullUrl,
              selectedDevice,
              signal
            );

          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          if (
            !base64 ||
            base64.length < 500
          ) {
            throw new Error(
              'Real Chrome capture did not return a screenshot.'
            );
          }

          // ------------------------------------------------------
          // STEP 4
          // FINAL SCREENSHOT
          // ------------------------------------------------------

          setCapturedPreview(base64);

          setStepIndex(4);

          setCurrentStep(
            'Screenshot Captured Successfully!'
          );

          setScrollProgress(100);

          setIsDone(true);

          setIsCaptureActive(false);

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 500)
          );

          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          // Existing ProjectEditor integration.
          onCaptureComplete(base64);

        } catch (err: any) {
          if (
            signal.aborted ||
            !isMounted
          ) {
            return;
          }

          console.error(
            '[LiveCaptureModal] Live Chrome capture error:',
            err
          );

          setIsCaptureActive(false);

          setErrorMsg(
            err?.message ||
            'Live Chrome capture failed.'
          );
        }
      };

    executeLiveCapture();

    return () => {
      isMounted = false;

      if (typingTimer) {
        clearInterval(typingTimer);
      }

      if (
        abortControllerRef.current
      ) {
        abortControllerRef.current.abort();

        abortControllerRef.current =
          null;
      }
    };
  }, [
    isOpen,
    url,
    selectedDevice
  ]);

  // ------------------------------------------------------------
  // DISPLAY VALUES
  // ------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  const isMobile =
    selectedDevice === 'mobile';

  const targetFullUrl =
    url.trim().startsWith('http')
      ? url.trim()
      : `https://${url.trim()}`;

  const cleanDisplayUrl =
    targetFullUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

  // Existing preview/proxy sources are retained.
  const proxySources = [
    targetFullUrl,
    `${import.meta.env.VITE_API_URL || ''
    }/proxy-view?url=${encodeURIComponent(
      targetFullUrl
    )}`
  ];

  const activeIframeSrc =
    proxySources[
    Math.min(
      proxyIndex,
      proxySources.length - 1
    )
    ];

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col w-full max-w-4xl max-h-[92vh] transition-all duration-300">

        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex items-center gap-3">

            <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 font-bold">
              <Globe size={18} />
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center gap-2">
                Live Website Scanner

                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                  REAL-TIME UNBLOCKED
                </span>
              </h3>

              <p className="text-slate-500 text-xs truncate max-w-xs sm:max-w-md font-mono">
                {typedUrl ||
                  cleanDisplayUrl}
              </p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3">

            {/* Desktop / Mobile */}
            <div className="bg-slate-200/70 p-1 rounded-2xl flex items-center gap-1 border border-slate-300/50">

              <button
                onClick={() =>
                  setSelectedDevice(
                    'desktop'
                  )
                }
                disabled={isCaptureActive}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isCaptureActive
                    ? !isMobile
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-400 opacity-50 cursor-not-allowed'
                    : !isMobile
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor size={14} />
                Desktop
              </button>

              <button
                onClick={() =>
                  setSelectedDevice(
                    'mobile'
                  )
                }
                disabled={isCaptureActive}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isCaptureActive
                    ? isMobile
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-400 opacity-50 cursor-not-allowed'
                    : isMobile
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone size={14} />
                Mobile
              </button>

            </div>

            {/* Manual Share Screen */}
            <button
              onClick={
                handleShareChromeTab
              }
              disabled={isTabSharing}
              className="px-3.5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-98"
              title="Share screen to capture full page"
            >
              <ScreenShare size={14} />

              {shareCountdown !== null
                ? `Recording tile (${11 -
                shareCountdown
                }/10)...`
                : 'Share screen'}
            </button>

            <div className="w-px h-5 bg-slate-300/80" />

            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors"
              title="Close Scanner"
            >
              <X size={18} />
            </button>

          </div>
        </div>

        {/* Progress Indicator */}
        <div className="bg-white px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            {!isDone &&
              !errorMsg ? (
              <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping" />
            ) : isDone ? (
              <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold">
                <CheckCircle size={16} />
              </div>
            ) : (
              <div className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-bold">
                <AlertTriangle size={15} />
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-900 font-mono">
                {errorMsg
                  ? errorMsg
                  : isDone
                    ? 'Full Page Screenshot Captured Successfully!'
                    : currentStep}
              </p>

              <p className="text-[11px] text-slate-500 font-mono">
                Stage {stepIndex} of 4 •{' '}
                {scrollProgress}%
                {' '}Progress
              </p>
            </div>

          </div>
          {/* Stop & Save Current Capture */}
          <button
            onClick={
              handleStopCapture
            }
            disabled={
              !hasFirstViewport ||
              isDone ||
              stopCaptureRef.current ||
              isTabSharing ||
              !!errorMsg ||
              !isCaptureActive
            }
            className={`px-3.5 py-2 rounded-2xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm ${
              stopCaptureRef.current
                ? 'bg-slate-200 text-slate-500 cursor-wait'
                : !hasFirstViewport || !isCaptureActive
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-98'
            }`}
            title={
              !hasFirstViewport
                ? 'Stop becomes available after the first viewport is captured'
                : 'Stop capture and save everything captured so far'
            }
          >
            <ArrowDown size={14} />

            {stopCaptureRef.current
              ? 'Stitching...'
              : 'Stop'}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{
              width: `${scrollProgress}%`
            }}
          />
        </div>

        {/* Main Preview */}
        <div className="p-6 bg-[#F8FAFC] flex-1 flex flex-col items-center justify-center min-h-[400px] overflow-y-auto relative">

          {!capturedPreview &&
            !errorMsg && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">

                <div className="bg-white/95 px-6 py-3.5 rounded-2xl border border-slate-200/90 shadow-xl text-center backdrop-blur-xs">

                  <p className="text-xs font-mono font-bold text-slate-800 animate-pulse tracking-wide">
                    {
                      loadingSteps[
                      loadingStepIdx
                      ]
                    }
                  </p>

                </div>
              </div>
            )}

          {errorMsg ? (
            <div className="text-center p-6 bg-white rounded-2xl border border-red-200 max-w-md shadow-xs">

              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />

              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Capture Cancelled or Failed
              </h4>

              <p className="text-xs text-slate-600 mb-4">
                {errorMsg}
              </p>

              <button
                onClick={
                  handleCancel
                }
                className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-blue-700"
              >
                Close Scanner
              </button>

            </div>
          ) : isMobile ? (

            /* Android shell */

            <div className="w-[310px] h-[520px] bg-slate-900 rounded-[38px] border-[8px] border-slate-800 shadow-2xl overflow-hidden relative flex flex-col transition-all duration-300">

              <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-[10px] font-mono flex-shrink-0">
                <span>09:41</span>

                <div className="w-3 h-3 bg-black rounded-full border border-slate-800" />

                <div className="flex items-center gap-1">
                  <Wifi size={10} />
                  <Battery size={10} />
                </div>
              </div>

              <div className="bg-slate-800 px-3 py-1.5 text-slate-300 text-[10px] font-mono flex items-center gap-1.5 flex-shrink-0 border-b border-slate-700">

                <Globe
                  size={11}
                  className="text-emerald-400"
                />

                <span className="truncate">
                  {typedUrl ||
                    cleanDisplayUrl}
                </span>

                <span className="w-1 h-3 bg-blue-400 animate-pulse" />
              </div>

              <div
                ref={scrollBoxRef}
                className="flex-1 bg-white overflow-y-auto relative scroll-smooth"
              >
                {capturedPreview ? (
                  <img
                    src={capturedPreview}
                    alt="Android Full-Page Webpage View"
                    className="w-full h-auto object-top animate-in fade-in duration-300"
                  />
                ) : (
                  <div className="w-full h-[1800px] bg-slate-50 p-4 space-y-4 animate-pulse select-none">

                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="w-24 h-5 bg-slate-200 rounded-md" />
                      <div className="w-12 h-4 bg-slate-200 rounded-md" />
                    </div>

                    <div className="w-full h-36 bg-slate-200 rounded-xl p-4 space-y-2">
                      <div className="w-3/4 h-5 bg-slate-300 rounded-md" />
                      <div className="w-1/2 h-3 bg-slate-300 rounded-md" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {[1, 2, 3, 4, 5, 6].map(
                        (i) => (
                          <div
                            key={i}
                            className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2"
                          >
                            <div className="w-full h-24 bg-slate-200 rounded-md" />
                            <div className="w-3/4 h-3 bg-slate-200 rounded-md" />
                            <div className="w-1/2 h-2.5 bg-slate-200 rounded-md" />
                          </div>
                        )
                      )}
                    </div>

                  </div>
                )}
              </div>

              <div className="bg-slate-900 py-1.5 flex justify-center flex-shrink-0">
                <div className="w-24 h-1 bg-slate-600 rounded-full" />
              </div>

            </div>

          ) : (

            /* Desktop shell */

            <div className="w-full max-w-3xl h-[440px] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col transition-all duration-300 relative">

              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">

                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                </div>

                <div className="flex-1 max-w-lg bg-white border border-slate-200 rounded-xl px-3 py-1 flex items-center gap-2 text-xs font-mono text-slate-700 shadow-2xs">

                  <Globe
                    size={13}
                    className="text-blue-500"
                  />

                  <span className="truncate">
                    {typedUrl ||
                      cleanDisplayUrl}
                  </span>

                  <span className="w-1 h-3.5 bg-blue-500 animate-pulse" />

                </div>

                <span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-200/80 px-2 py-1 rounded-md">
                  1280 × 800
                </span>

              </div>

              <div
                ref={scrollBoxRef}
                className="flex-1 bg-white overflow-y-auto relative scroll-smooth"
              >
                {capturedPreview ? (
                  <img
                    src={capturedPreview}
                    alt="Desktop Full-Page Webpage View"
                    className="w-full h-auto object-top animate-in fade-in duration-300"
                  />
                ) : (
                  <div className="w-full h-[1800px] bg-slate-50 p-6 space-y-6 animate-pulse select-none">

                    <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                      <div className="w-32 h-6 bg-slate-200 rounded-lg" />

                      <div className="flex gap-4">
                        <div className="w-16 h-4 bg-slate-200 rounded-md" />
                        <div className="w-16 h-4 bg-slate-200 rounded-md" />
                        <div className="w-16 h-4 bg-slate-200 rounded-md" />
                      </div>
                    </div>

                    <div className="w-full h-44 bg-slate-200 rounded-2xl flex flex-col justify-center p-6 space-y-3">
                      <div className="w-2/3 h-7 bg-slate-300 rounded-lg" />
                      <div className="w-1/2 h-4 bg-slate-300 rounded-md" />
                      <div className="w-28 h-8 bg-blue-300 rounded-xl mt-1" />
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-2">
                      {[1, 2, 3, 4, 5, 6].map(
                        (i) => (
                          <div
                            key={i}
                            className="bg-white p-3 rounded-xl border border-slate-200 space-y-2"
                          >
                            <div className="w-full h-28 bg-slate-200 rounded-lg" />
                            <div className="w-3/4 h-4 bg-slate-200 rounded-md" />
                            <div className="w-1/2 h-3 bg-slate-200 rounded-md" />
                          </div>
                        )
                      )}
                    </div>

                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-xs flex justify-between items-center text-slate-500 font-medium">

          <span className="flex items-center gap-1.5">
            <ShieldCheck
              size={14}
              className="text-blue-600"
            />
            Live Full-Page Webpage Scanner Engine
          </span>

          <button
            onClick={handleCancel}
            className="text-[11px] font-mono text-red-600 hover:underline font-bold"
          >
            Cancel Live Scanner
          </button>

        </div>

      </div>
    </div>
  );
};
