import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { fetchScreenshotAsBase64 } from '../services/screenshotService';
import { SubscriptionModal } from './SubscriptionModal';
import { AnnotationIssueModal } from './AnnotationIssueModal';
import { LiveCaptureModal } from './LiveCaptureModal';
import { Project, Pin, ProjectStatus, ProjectPage, AnnotationIssue } from '../types';
import { ArrowLeft, Share2, Sparkles, X, MapPin, Eye, Loader2, Image as ImageIcon, Trash2, Layout, Link as LinkIcon, Pencil, Monitor, Smartphone, ChevronDown, ChevronUp, Laptop, Search, SlidersHorizontal, AlertCircle, MessageSquare, RefreshCw, Globe, CheckCircle, Info, Download } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const SPECIAL_EMAILS = [
  'divyanshgupta5748@gmail.com',
  'divyanshgupta4949@gmail.com'
];

// Production screenshot compressor.
// WebP is preferred for both desktop and mobile because it provides
// significantly better size/quality for webpage screenshots.
// JPEG is used only as a compatibility fallback.
const forceCompressWithCanvas = (
  base64: string,
  maxWidth = 1920,
  quality = 0.82
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        if (!originalWidth || !originalHeight) {
          resolve(base64);
          return;
        }

        let width = originalWidth;
        let height = originalHeight;

        // Preserve aspect ratio.
        if (width > maxWidth) {
          height = Math.round(
            (height * maxWidth) / width
          );
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(base64);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          0,
          0,
          originalWidth,
          originalHeight,
          0,
          0,
          width,
          height
        );

        // Prefer WebP.
        try {
          const webpData = canvas.toDataURL(
            'image/webp',
            quality
          );

          if (
            webpData &&
            webpData.startsWith('data:image/webp') &&
            webpData.length > 1000
          ) {
            resolve(webpData);
            return;
          }
        } catch (error) {
          console.warn(
            '[Image Compression] WebP encoding failed, falling back to JPEG.',
            error
          );
        }

        // Compatibility fallback.
        try {
          resolve(
            canvas.toDataURL(
              'image/jpeg',
              quality
            )
          );
        } catch (error) {
          console.error(
            '[Image Compression] JPEG encoding also failed.',
            error
          );

          resolve(base64);
        }
      } catch (error) {
        console.error(
          '[Image Compression] Canvas compression failed.',
          error
        );

        resolve(base64);
      }
    };

    img.onerror = () => {
      console.error(
        '[Image Compression] Failed to load source image.'
      );

      resolve(base64);
    };

    img.src = base64;
  });
};

// Helper: Fast binary base64 to Blob conversion without fetch() network calls
const base64ToBlob = (base64: string): Blob => {
  try {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/jpeg';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  } catch (err) {
    console.warn('[base64ToBlob] Conversion fallback:', err);
    return new Blob([], { type: 'image/jpeg' });
  }
};

/**
 * Production desktop/general screenshot compression.
 *
 * Goals:
 * - Prefer WebP.
 * - Target approximately 250–350 KB.
 * - Never intentionally exceed 400 KB when a reasonable
 *   compressed representation can be produced.
 * - Preserve screenshot dimensions unless size requires
 *   a controlled reduction.
 * - Never enlarge or recompress an already-small image.
 */
const compressImageBase64 = async (
  base64String: string
): Promise<string> => {
  try {
    if (
      !base64String ||
      !base64String.startsWith('data:image')
    ) {
      console.warn('[Frontend Compression] Invalid image input. Keeping original.');
      return base64String;
    }

    const getBytes = (data: string): number => {
      const commaIndex = data.indexOf(',');
      if (commaIndex === -1) return 0;

      const base64 = data.substring(commaIndex + 1);

      // More accurate base64 byte calculation.
      const padding =
        base64.endsWith('==') ? 2 :
        base64.endsWith('=') ? 1 : 0;

      return Math.max(
        0,
        Math.floor((base64.length * 3) / 4) - padding
      );
    };

    const bytesToKB = (bytes: number) =>
      bytes / 1024;

    const originalBytes = getBytes(base64String);
    const originalKB = bytesToKB(originalBytes);

    console.log(
      `[Frontend Compression] Starting. Original: ${originalKB.toFixed(2)} KB`
    );

    /*
     * ------------------------------------------------------------
     * HARD PRODUCTION LIMIT
     * ------------------------------------------------------------
     *
     * <=400 KB:
     *   Do nothing.
     *
     * This prevents unnecessary recompression and quality loss.
     */
    if (originalKB <= 400) {
      console.log(
        '[Frontend Compression] Already <= 400 KB. Keeping original.'
      );

      return base64String;
    }

    const FINAL_MAX_KB = 400;
    const IDEAL_MIN_KB = 250;
    const IDEAL_MAX_KB = 350;

    /*
     * This function determines how large the NEXT compression
     * jump should be.
     *
     * IMPORTANT:
     *
     * We are NOT trying to go from 2 MB directly to 300 KB.
     *
     * Instead:
     *
     * 2.2 MB → ~1.4 MB
     *       → ~600 KB
     *       → ~350 KB
     *
     * And:
     *
     * 5.6 MB → ~800 KB
     *       → ~550 KB
     *       → ~350 KB
     *
     * This dramatically reduces Canvas encoding work.
     */
    const getNextTargetKB = (currentKB: number): number => {
      if (currentKB > 10 * 1024) {
        return Math.max(5000, currentKB - 5000);
      }

      if (currentKB > 5 * 1024) {
        return Math.max(800, currentKB - 4800);
      }

      if (currentKB > 2 * 1024) {
        return Math.max(400, currentKB - 1800);
      }

      if (currentKB > 1024) {
        return Math.max(350, currentKB - 800);
      }

      if (currentKB > 500) {
        return Math.max(350, currentKB - 250);
      }

      // 400–500 KB:
      // Only remove roughly 100–150 KB.
      return Math.max(350, currentKB - 125);
    };

    /*
     * ------------------------------------------------------------
     * ADAPTIVE CANVAS COMPRESSION
     * ------------------------------------------------------------
     *
     * We estimate a quality from the desired size ratio and make
     * only a few attempts around that estimate.
     *
     * We never run the old 50+ attempt matrix.
     */
    const compressTowardTarget = async (
      source: string,
      currentBytes: number,
      targetKB: number,
      maxWidth: number
    ): Promise<{
      result: string;
      bytes: number;
    }> => {
      const currentKB = bytesToKB(currentBytes);

      /*
       * Estimate how aggressive the compression needs to be.
       *
       * WebP quality is not linear with file size, so this is only
       * a starting point. We verify the actual result afterward.
       */
      const ratio = Math.max(
        0.08,
        Math.min(0.95, targetKB / currentKB)
      );

      /*
       * Convert size ratio into a starting quality.
       *
       * We intentionally stay away from extremely low quality
       * values because webpage screenshots contain small text.
       */
      let estimatedQuality =
        0.35 + (ratio * 0.50);

      estimatedQuality = Math.max(
        0.42,
        Math.min(0.88, estimatedQuality)
      );

      const qualities = [
        estimatedQuality,
        Math.max(0.38, estimatedQuality - 0.10),
        Math.max(0.34, estimatedQuality - 0.20)
      ];

      let bestResult = source;
      let bestBytes = currentBytes;

      console.log(
        `[Frontend Compression] Adaptive pass: ${currentKB.toFixed(2)} KB → target ~${targetKB.toFixed(2)} KB`
      );

      for (let i = 0; i < qualities.length; i++) {
        const quality = qualities[i];

        const candidate =
          await forceCompressWithCanvas(
            source,
            maxWidth,
            quality
          );

        const candidateBytes = getBytes(candidate);
        const candidateKB = bytesToKB(candidateBytes);

        console.log(
          `[Frontend Compression] Adaptive attempt ${i + 1}/${qualities.length} — quality=${quality.toFixed(3)} → ${candidateKB.toFixed(2)} KB`
        );

        if (
          candidateBytes > 0 &&
          candidateBytes < bestBytes
        ) {
          bestResult = candidate;
          bestBytes = candidateBytes;
        }

        /*
         * We reached the desired target.
         */
        if (
          candidateKB >= IDEAL_MIN_KB &&
          candidateKB <= IDEAL_MAX_KB
        ) {
          console.log(
            `[Frontend Compression] Ideal range reached: ${candidateKB.toFixed(2)} KB`
          );

          return {
            result: candidate,
            bytes: candidateBytes
          };
        }

        /*
         * We are already safely under the production ceiling.
         * Do not destroy more quality unnecessarily.
         */
        if (
          candidateKB <= FINAL_MAX_KB &&
          candidateKB >= IDEAL_MIN_KB
        ) {
          return {
            result: candidate,
            bytes: candidateBytes
          };
        }
      }

      return {
        result: bestResult,
        bytes: bestBytes
      };
    };

    /*
     * ------------------------------------------------------------
     * MAXIMUM 3 ADAPTIVE PASSES
     * ------------------------------------------------------------
     *
     * This is the important performance improvement.
     *
     * Example:
     *
     * 5.6 MB
     *   ↓
     * ~800 KB
     *   ↓
     * ~550 KB
     *   ↓
     * ~350 KB
     *
     * No giant quality/width matrix.
     */
    let currentResult = base64String;
    let currentBytes = originalBytes;

    for (let pass = 1; pass <= 3; pass++) {
      const currentKB = bytesToKB(currentBytes);

      if (currentKB <= FINAL_MAX_KB) {
        break;
      }

      const targetKB = getNextTargetKB(currentKB);

      console.log(
        `[Frontend Compression] PASS ${pass}/3: ${currentKB.toFixed(2)} KB → target ${targetKB.toFixed(2)} KB`
      );

      /*
       * Keep desktop screenshots at a sensible resolution.
       *
       * Only reduce width for very large images.
       */
      let maxWidth = 1920;

      if (currentKB > 5 * 1024) {
        maxWidth = 1600;
      } else if (currentKB > 2 * 1024) {
        maxWidth = 1760;
      }

      const compressed =
        await compressTowardTarget(
          currentResult,
          currentBytes,
          targetKB,
          maxWidth
        );

      /*
       * Safety:
       * If compression did not actually make the image smaller,
       * stop immediately.
       */
      if (
        compressed.bytes <= 0 ||
        compressed.bytes >= currentBytes
      ) {
        console.warn(
          '[Frontend Compression] Adaptive pass did not reduce size. Stopping safely.'
        );

        break;
      }

      currentResult = compressed.result;
      currentBytes = compressed.bytes;

      console.log(
        `[Frontend Compression] PASS ${pass} result: ${(currentBytes / 1024).toFixed(2)} KB`
      );

      if (
        currentBytes / 1024 >= IDEAL_MIN_KB &&
        currentBytes / 1024 <= IDEAL_MAX_KB
      ) {
        break;
      }
    }

    const finalKB = bytesToKB(currentBytes);

    console.log(
      `[Frontend Compression] Final: ${finalKB.toFixed(2)} KB`
    );

    console.log(
      `[Frontend Compression] Reduction: ${(
        (1 - currentBytes / originalBytes) *
        100
      ).toFixed(1)}%`
    );

    /*
     * Production safety:
     *
     * Return the best compressed image we actually generated.
     * Never return a larger image than the original.
     */
    return currentBytes < originalBytes
      ? currentResult
      : base64String;

  } catch (error) {
    console.error(
      '[Frontend Compression] Failed:',
      error
    );

    /*
     * Screenshot saving must NEVER fail because compression
     * failed.
     */
    return base64String;
  }
};

/**
 * Production mobile screenshot compression.
 *
 * Mobile screenshots are usually tall, so width is intentionally
 * limited to 600px to keep the final image practical for:
 *
 * - MongoDB document size
 * - API payload size
 * - mobile loading
 * - project editor rendering
 *
 * WebP is preferred for Android/mobile as requested.
 */
const compressMobileImageBase64 = async (
  base64String: string
): Promise<string> => {
  try {
    if (
      !base64String ||
      !base64String.startsWith('data:image')
    ) {
      console.warn(
        '[Mobile Compression] Invalid image input. Keeping original.'
      );

      return base64String;
    }

    const getBytes = (data: string): number => {
      const commaIndex = data.indexOf(',');

      if (commaIndex === -1) return 0;

      const base64 = data.substring(commaIndex + 1);

      const padding =
        base64.endsWith('==') ? 2 :
        base64.endsWith('=') ? 1 : 0;

      return Math.max(
        0,
        Math.floor((base64.length * 3) / 4) - padding
      );
    };

    const bytesToKB = (bytes: number) =>
      bytes / 1024;

    const originalBytes = getBytes(base64String);
    const originalKB = bytesToKB(originalBytes);

    console.log(
      `[Mobile Compression] Starting. Original: ${originalKB.toFixed(2)} KB`
    );

    /*
     * Never touch already-small mobile screenshots.
     */
    if (originalKB <= 400) {
      console.log(
        '[Mobile Compression] Already <= 400 KB. Keeping original.'
      );

      return base64String;
    }

    const FINAL_MAX_KB = 400;
    const IDEAL_MIN_KB = 250;
    const IDEAL_MAX_KB = 350;

    /*
     * Same adaptive size-jump strategy as desktop.
     *
     * 400–500 KB → remove ~125 KB
     * 500 KB–1 MB → remove ~250 KB
     * 1–2 MB → remove ~800 KB
     * 2–5 MB → remove ~1.8 MB
     * 5–10 MB → remove ~4.8 MB
     */
    const getNextTargetKB = (currentKB: number): number => {
      if (currentKB > 10 * 1024) {
        return Math.max(5000, currentKB - 5000);
      }

      if (currentKB > 5 * 1024) {
        return Math.max(800, currentKB - 4800);
      }

      if (currentKB > 2 * 1024) {
        return Math.max(400, currentKB - 1800);
      }

      if (currentKB > 1024) {
        return Math.max(350, currentKB - 800);
      }

      if (currentKB > 500) {
        return Math.max(350, currentKB - 250);
      }

      return Math.max(350, currentKB - 125);
    };

    const result = await new Promise<string>((resolve) => {
      const img = new Image();

      img.onload = async () => {
        try {
          const originalWidth =
            img.naturalWidth || img.width;

          const originalHeight =
            img.naturalHeight || img.height;

          console.log(
            '[Mobile Compression] Original dimensions:',
            {
              width: originalWidth,
              height: originalHeight
            }
          );

          /*
           * Mobile uses 600px as the normal maximum width.
           *
           * We only go lower when necessary.
           */
          const getMobileWidth = (
            currentKB: number
          ): number => {
            if (currentKB > 5 * 1024) {
              return 520;
            }

            if (currentKB > 2 * 1024) {
              return 560;
            }

            return 600;
          };

          let currentResult = base64String;
          let currentBytes = originalBytes;

          for (let pass = 1; pass <= 3; pass++) {
            const currentKB =
              bytesToKB(currentBytes);

            if (currentKB <= FINAL_MAX_KB) {
              break;
            }

            const targetKB =
              getNextTargetKB(currentKB);

            const maxWidth =
              getMobileWidth(currentKB);

            /*
             * Calculate current dimensions.
             */
            const scale = Math.min(
              1,
              maxWidth / originalWidth
            );

            const width = Math.max(
              1,
              Math.round(originalWidth * scale)
            );

            const height = Math.max(
              1,
              Math.round(originalHeight * scale)
            );

            console.log(
              `[Mobile Compression] PASS ${pass}/3:`,
              {
                currentKB: currentKB.toFixed(2),
                targetKB: targetKB.toFixed(2),
                width,
                height,
                scale: scale.toFixed(3)
              }
            );

            const ratio =
              Math.max(
                0.08,
                Math.min(
                  0.95,
                  targetKB / currentKB
                )
              );

            let estimatedQuality =
              0.35 + (ratio * 0.50);

            estimatedQuality =
              Math.max(
                0.42,
                Math.min(
                  0.88,
                  estimatedQuality
                )
              );

            /*
             * Only three quality attempts per adaptive pass.
             *
             * This is vastly faster than the previous
             * width × quality matrix.
             */
            const qualities = [
              estimatedQuality,
              Math.max(
                0.38,
                estimatedQuality - 0.10
              ),
              Math.max(
                0.34,
                estimatedQuality - 0.20
              )
            ];

            let bestResult = currentResult;
            let bestBytes = currentBytes;

            for (
              let i = 0;
              i < qualities.length;
              i++
            ) {
              const quality = qualities[i];

              /*
               * IMPORTANT:
               *
               * Always encode from the CURRENT result,
               * not from the original screenshot.
               *
               * This allows:
               *
               * 5.6 MB
               *   → 800 KB
               *   → 550 KB
               *   → 350 KB
               */
              const candidate =
                await forceCompressWithCanvas(
                  currentResult,
                  width,
                  quality
                );

              const candidateBytes =
                getBytes(candidate);

              const candidateKB =
                bytesToKB(candidateBytes);

              console.log(
                `[Mobile Compression] Adaptive attempt ${i + 1}/${qualities.length} — quality=${quality.toFixed(3)} → ${candidateKB.toFixed(2)} KB`
              );

              if (
                candidateBytes > 0 &&
                candidateBytes < bestBytes
              ) {
                bestResult = candidate;
                bestBytes = candidateBytes;
              }

              if (
                candidateKB >= IDEAL_MIN_KB &&
                candidateKB <= IDEAL_MAX_KB
              ) {
                console.log(
                  `[Mobile Compression] Ideal range reached: ${candidateKB.toFixed(2)} KB`
                );

                resolve(candidate);
                return;
              }
            }

            /*
             * Safety:
             * If the pass did not reduce the image, stop.
             */
            if (
              bestBytes <= 0 ||
              bestBytes >= currentBytes
            ) {
              console.warn(
                '[Mobile Compression] Pass did not reduce size. Stopping safely.'
              );

              break;
            }

            currentResult = bestResult;
            currentBytes = bestBytes;

            console.log(
              `[Mobile Compression] PASS ${pass} result: ${(currentBytes / 1024).toFixed(2)} KB`
            );

            if (
              currentBytes / 1024 >= IDEAL_MIN_KB &&
              currentBytes / 1024 <= IDEAL_MAX_KB
            ) {
              break;
            }
          }

          const finalKB =
            bytesToKB(currentBytes);

          console.log(
            `[Mobile Compression] Final: ${finalKB.toFixed(2)} KB`
          );

          console.log(
            `[Mobile Compression] Reduction: ${(
              (1 - currentBytes / originalBytes) *
              100
            ).toFixed(1)}%`
          );

          resolve(
            currentBytes < originalBytes
              ? currentResult
              : base64String
          );

        } catch (error) {
          console.error(
            '[Mobile Compression] Processing failed:',
            error
          );

          resolve(base64String);
        }
      };

      img.onerror = () => {
        console.error(
          '[Mobile Compression] Failed to load source image.'
        );

        resolve(base64String);
      };

      img.src = base64String;
    });

    return result;

  } catch (error) {
    console.error(
      '[Mobile Compression] Failed:',
      error
    );

    /*
     * Compression must never prevent screenshot saving.
     */
    return base64String;
  }
};

interface ProjectEditorProps {
  projectId: string;
  onNavigate: (path: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ projectId, onNavigate }) => {
  const normalizePinDevice = (device: any): 'desktop' | 'mobile' => {
    const raw = String(device ?? '').trim().toLowerCase();
    if (raw === 'mobile' || raw === 'android' || raw === 'ios' || raw === 'phone') {
      return 'mobile';
    }
    return 'desktop';
  };

  const [project, setProject] = useState<Project | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [tempPin, setTempPin] = useState<Partial<Pin> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isFetchingMobile, setIsFetchingMobile] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMobileScreens, setShowMobileScreens] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionModalMode, setSubscriptionModalMode] = useState<'default' | 'expired' | 'subscribe'>('default');
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueModalPin, setIssueModalPin] = useState<Pin | null>(null);
  const [isGroupMember, setIsGroupMember] = useState(false);
  const [isPMorOwner, setIsPMorOwner] = useState(false);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [canAssignFilterAssignees, setCanAssignFilterAssignees] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<{ id: string; name: string; avatarUrl?: string; designation?: string }[]>([]);

  // Search & Filter Drawer State
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>('all');
  const [issueLabelFilter, setIssueLabelFilter] = useState<string>('all');
  const [issueSortBy, setIssueSortBy] = useState<'earliest' | 'latest' | 'number'>('latest');
  const [issueAssigneeFilter, setIssueAssigneeFilter] = useState<string>('all');
  const [issueDeviceFilter, setIssueDeviceFilter] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<'all' | 'issue' | 'comment'>('all');
  const [projectIssues, setProjectIssues] = useState<AnnotationIssue[]>([]);
  const searchDrawerRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isLocalComputeEnabled, setIsLocalComputeEnabled] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentUserId = (() => {
    try {
      const u = localStorage.getItem('presently_user');
      if (!u) return '';
      const parsed = JSON.parse(u);
      return (parsed.userId || parsed.id || '').toString();
    } catch { return ''; }
  })();

  const isProjectOwnerOrAdminOrPMOrQA = (() => {
    if (!project) return false;
    if (project.userId === currentUserId) return true;
    if (isPMorOwner) return true;
    if (SPECIAL_EMAILS.includes(userEmail.toLowerCase())) return true;
    return false;
  })();

  const refreshProjectIssues = async (pid?: string) => {
    const id = pid || project?.id;
    if (!id) return;
    try {
      const issuesData = await ApiService.getProjectIssues(id);
      setProjectIssues(issuesData);
    } catch { setProjectIssues([]); }
  };

  const accessibleIssues = (() => {
    if (isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) return projectIssues;
    return projectIssues.filter(iss => {
      const assigneeId = iss.assigneeId ? (typeof iss.assigneeId === 'object' ? iss.assigneeId._id : iss.assigneeId) : '';
      return assigneeId?.toString() === currentUserId;
    });
  })();

  const canSeePin = (pin: Pin): boolean => {
    if (isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) return true;
    const pinType = pin.type || 'issue';
    if (pinType === 'comment') {
      return true;
    }
    const iss = projectIssues.find(i => i.pinId === pin.id);
    if (!iss) return false;
    const assigneeId = iss.assigneeId ? (typeof iss.assigneeId === 'object' ? iss.assigneeId._id : iss.assigneeId) : '';
    return assigneeId?.toString() === currentUserId;
  };

  const availableLabels = Array.from(new Set(accessibleIssues.flatMap(iss => iss.labels || [])));

  const uniqueAssigneesFromIssues = (() => {
    const seen = new Map<string, { id: string; name: string; designation?: string }>();
    accessibleIssues.forEach(iss => {
      if (!iss.assigneeId) return;
      const id = typeof iss.assigneeId === 'object' ? (iss.assigneeId as any)._id || (iss.assigneeId as any).id : iss.assigneeId;
      if (!id) return;
      const idStr = id.toString();
      if (seen.has(idStr)) return;
      const name = typeof iss.assigneeId === 'object' ? (iss.assigneeId as any).name : assigneeOptions.find(a => a.id === idStr)?.name || 'Assignee';
      const designation = typeof iss.assigneeId === 'object' ? (iss.assigneeId as any).designation : assigneeOptions.find(a => a.id === idStr)?.designation;
      seen.set(idStr, { id: idStr, name, designation });
    });
    assigneeOptions.forEach(a => {
      if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, designation: a.designation });
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filteredAndSortedIssues = (() => {
    let list = accessibleIssues.slice();

    const q = issueSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(iss => {
        const pin = pins.find(p => p.id === iss.pinId);
        const titleMatch = (pin?.title || '').toLowerCase().includes(q);
        const descMatch = (pin?.description || '').toLowerCase().includes(q);
        const numMatch = pin ? `#${pin.number}`.includes(q) || pin.number.toString() === q : false;
        const statusMatch = iss.status.toLowerCase().includes(q);
        const labelMatch = (iss.labels || []).some(l => l.toLowerCase().includes(q));
        const assigneeName = (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any)?.name || '' : '').toLowerCase();
        return titleMatch || descMatch || numMatch || statusMatch || labelMatch || assigneeName.includes(q);
      });
    }

    if (issueStatusFilter !== 'all') {
      list = list.filter(iss => iss.status === issueStatusFilter);
    }

    if (issueLabelFilter !== 'all') {
      list = list.filter(iss => (iss.labels || []).includes(issueLabelFilter));
    }

    if (issueAssigneeFilter !== 'all') {
      list = list.filter(iss => {
        const id = iss.assigneeId ? (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any)._id || (iss.assigneeId as any).id : iss.assigneeId)?.toString() : '';
        if (issueAssigneeFilter === 'unassigned') return !id;
        return id === issueAssigneeFilter;
      });
    }

    if (issueDeviceFilter !== 'all') {
      list = list.filter(iss => {
        const pin = pins.find(p => p.id === iss.pinId);
        if (!pin) return false;
        const dev = normalizePinDevice(pin.device);
        return dev === issueDeviceFilter;
      });
    }

    if (issueTypeFilter !== 'all') {
      list = list.filter(iss => {
        const pin = pins.find(p => p.id === iss.pinId);
        const pinType = pin?.type || 'issue';
        return pinType === issueTypeFilter;
      });
    }

    list.sort((a, b) => {
      const pinA = pins.find(p => p.id === a.pinId);
      const pinB = pins.find(p => p.id === b.pinId);
      if (issueSortBy === 'earliest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (issueSortBy === 'number') {
        return (pinA?.number || 0) - (pinB?.number || 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  })();

  const accessibleComments = (() => {
    return pins.filter(p => p.type === 'comment');
  })();

  const filteredAndSortedItems = (() => {
    const issueItems = filteredAndSortedIssues.filter(iss => {
      const p = pins.find(pp => pp.id === iss.pinId);
      return (p?.type || 'issue') === 'issue';
    }).map(iss => {
      const pin = pins.find(p => p.id === iss.pinId);
      return { kind: 'issue' as const, issue: iss, pin, id: `issue-${iss.id}` };
    });
    const commentPins = accessibleComments.filter(pin => {
      if (issueSearchQuery.trim()) {
        const q = issueSearchQuery.trim().toLowerCase();
        const titleMatch = (pin.title || '').toLowerCase().includes(q);
        const descMatch = (pin.description || '').toLowerCase().includes(q);
        const numMatch = `#${pin.number}`.includes(q) || pin.number.toString() === q;
        if (!(titleMatch || descMatch || numMatch)) return false;
      }
      if (issueDeviceFilter !== 'all') {
        const dev = normalizePinDevice(pin.device);
        if (dev !== issueDeviceFilter) return false;
      }
      if (issueTypeFilter !== 'all' && issueTypeFilter !== 'comment') return false;
      if (issueAssigneeFilter !== 'all' && issueAssigneeFilter !== 'unassigned') return false;
      if (issueStatusFilter !== 'all') return false;
      if (issueLabelFilter !== 'all') return false;
      return true;
    }).map(pin => ({ kind: 'comment' as const, pin, id: `comment-${pin.id}` }));

    const combined = [...issueItems, ...commentPins];
    combined.sort((a, b) => {
      const pinA = a.pin;
      const pinB = b.pin;
      if (!pinA || !pinB) return 0;
      if (issueSortBy === 'number') {
        return (pinA.number || 0) - (pinB.number || 0);
      }
      if (issueSortBy === 'earliest') {
        const aTime = a.kind === 'issue' ? new Date(a.issue.createdAt).getTime() : new Date((pinA as any).createdAt || 0).getTime();
        const bTime = b.kind === 'issue' ? new Date(b.issue.createdAt).getTime() : new Date((pinB as any).createdAt || 0).getTime();
        return aTime - bTime;
      }
      const aTime = a.kind === 'issue' ? new Date(a.issue.createdAt).getTime() : new Date((pinA as any).createdAt || 0).getTime();
      const bTime = b.kind === 'issue' ? new Date(b.issue.createdAt).getTime() : new Date((pinB as any).createdAt || 0).getTime();
      return bTime - aTime;
    });
    return combined;
  })();

  const handleSelectIssueFromDrawer = (issue: AnnotationIssue) => {
    setShowSearchDrawer(false);
    const targetPin = pins.find(p => p.id === issue.pinId);
    if (!targetPin) return;

    if (targetPin.pageId && targetPin.pageId !== activePageId) {
      setActivePageId(targetPin.pageId);
    }

    const pinDevice = normalizePinDevice(targetPin.device);
    if (pinDevice !== viewMode) {
      handleViewModeChange(pinDevice);
    }

    setSelectedPinId(targetPin.id);

    const tryScroll = (retries = 0) => {
      if (!mainScrollRef.current && !imageRef.current) {
        if (retries < 15) setTimeout(() => tryScroll(retries + 1), 100);
        return;
      }
      const pinEl = document.querySelector(`[data-pin-id="${targetPin.id}"]`) as HTMLElement | null;
      const imageEl = imageRef.current;
      if (pinEl) {
        pinEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else if (imageEl) {
        imageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (mainScrollRef.current) {
        mainScrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (!pinEl && retries < 10) setTimeout(() => tryScroll(retries + 1), 150);
    };
    setTimeout(() => tryScroll(), 200);

    const pinType = targetPin.type || 'issue';
    if (pinType === 'issue') {
      setIssueModalPin(targetPin);
      setShowIssueModal(true);
    } else {
      openPinEditor(targetPin);
    }
  };

  useEffect(() => {
    const user = StorageService.getUser() as any;
    if (user) {
      setUserEmail(user.email);
      setIsLocalComputeEnabled(user.isLocalComputeEnabled || false);
    }
    // Prefill synchronously from the full project cache.
    const cachedProject = ApiService.getCachedProject(projectId);

    if (cachedProject) {
      setProject(cachedProject);

      if (cachedProject.pages?.length > 0) {
        setActivePageId(cachedProject.pages[0].id);
      }
    }

    void loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const cachedProject = ApiService.getCachedProject(projectId);
      if (cachedProject) {
        setProject(cachedProject);
        if (cachedProject.pages.length > 0 && !activePageId) setActivePageId(cachedProject.pages[0].id);
        setLoading(false);
      }

      const [projectData, pinsData] = await Promise.all([
        ApiService.getProject(projectId),
        ApiService.getPins(projectId)
      ]);

      setProject(projectData);

      if (projectData.pages?.length > 0 && !activePageId) {
        setActivePageId(projectData.pages[0].id);
      }

      setPins(pinsData);

      const [issuesResult, assigneeResult] = await Promise.allSettled([
        ApiService.getProjectIssues(projectId),
        ApiService.getProjectAssignees(projectId)
      ]);

      // Issues
      if (issuesResult.status === 'fulfilled') {
        setProjectIssues(issuesResult.value);
      } else {
        setProjectIssues([]);
      }

      // Assignees + permissions
      if (assigneeResult.status === 'fulfilled') {
        const assigneeData = assigneeResult.value;

        const allOpts = [
          ...(assigneeData.projectAssignees || []),
          ...((assigneeData.otherGroups || []).flatMap(g => g.members || []))
        ];

        const uniq = new Map<
          string,
          { id: string; name: string; avatarUrl?: string; designation?: string }
        >();

        allOpts.forEach((a: any) => {
          const id = (a._id || a.id || a.userId)?.toString?.();
          if (!id) return;
          if (uniq.has(id)) return;

          uniq.set(id, {
            id,
            name: a.name || 'User',
            avatarUrl: a.avatarUrl,
            designation: a.designation
          });
        });

        setAssigneeOptions(Array.from(uniq.values()));

        const perm = assigneeData.permissions || ({} as any);

        setIsGroupMember(!!perm.isProjectGroupMember);
        setIsTeamMember(!!perm.isTeamMember);

        const isQAOrTester = (() => {
          try {
            const u = StorageService.getUser() as any;
            const e = u?.email?.toLowerCase() || '';

            if (SPECIAL_EMAILS.includes(e)) return true;

            if (projectData.userId?.toString?.() === currentUserId.toString()) {
              return true;
            }
          } catch {}

          return false;
        })();

        const canAssignOrQA = !!perm.canAssign || isQAOrTester;

        setIsPMorOwner(canAssignOrQA);
        setCanAssignFilterAssignees(canAssignOrQA);
      } else {
        console.warn(
          '[loadProject] assignee load failed',
          assigneeResult.reason
        );
      }
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      onNavigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-fetch mobile screenshot if we switch pages while in mobile view
    if (viewMode === 'mobile' && activePage && activePage.originalUrl && !(activePage as any).mobileImageUrl && !isFetchingMobile) {
      handleViewModeChange('mobile');
    }
  }, [activePageId]);

  const handleGrantPermission = async () => {
    setPermissionLoading(true);
    try {
      const user = StorageService.getUser() as any;
      if (!user) {
        onNavigate('/login');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/user/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.accessToken}`
        },
        body: JSON.stringify({ isLocalComputeEnabled: true })
      });

      if (response.ok) {
        const data = await response.json();
        StorageService.saveUser({ ...user, isLocalComputeEnabled: true });
        setIsLocalComputeEnabled(true);
        setShowPermissionModal(false);
      } else {
        console.error("Permission request failed:", response.status);
        showToast("Failed to grant permission. Please try again.", 'error');
      }
    } catch (error: any) {
      console.error("Permission error details:", error);
      if (error.name === 'SyntaxError') {
        showToast(
          "Server error: Received invalid response. Please check your API configuration.",
          'error'
        );
      } else {
        showToast(
          `Network error: ${error.message || 'Check your connection'}`,
          'error'
        );
      }
    } finally {
      setPermissionLoading(false);
    }
  };

  const checkPermission = () => {
    if (SPECIAL_EMAILS.includes(userEmail.toLowerCase()) || isLocalComputeEnabled) {
      return true;
    }
    setShowPermissionModal(true);
    return false;
  };

  const checkSubscriptionAccess = async () => {
    if (SPECIAL_EMAILS.includes(userEmail.toLowerCase())) return true;

    try {
      const user = StorageService.getUser() as any;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/subscription/status`, {
        headers: { 'Authorization': `Bearer ${user.accessToken}` }
      });
      const status = await response.json();

      if (status.hasActiveSubscription) return true;
      if (status.pendingVerification) {
        setShowPendingModal(true);
        return false;
      }
      if (status.isExpired) {
        setSubscriptionModalMode('expired');
        setShowSubscriptionModal(true);
        return false;
      }

      setSubscriptionModalMode('subscribe');
      setShowSubscriptionModal(true);
      return false;
    } catch (e) {
      return false;
    }
  };

  const activePage = project?.pages.find(p => p.id === activePageId);
  const activePins = pins.filter(p => p.pageId === activePageId && normalizePinDevice(p.device) === viewMode);

  function normalizePageName(input: string, projectBaseUrl?: string): string {
    let raw = input.trim().toLowerCase();
    raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");

    if (projectBaseUrl) {
      let base = projectBaseUrl.trim().toLowerCase();
      base = base.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (raw.startsWith(base)) {
        raw = raw.substring(base.length);
      }
    }
    raw = raw.replace(/^\/+/, "");
    return raw || '/';
  }

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedPinId || tempPin) {
      setSelectedPinId(null);
      setTempPin(null);
      return;
    }

    if (!imageRef.current || !activePageId) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setTempPin({
      x,
      y,
      title: '',
      description: '',
      type: project?.mode === 'working' ? 'issue' : 'comment'
    });
    setIsEditingPin(true);
  };

  const handleSavePin = async () => {
    if (!project || !tempPin || !activePageId || !tempPin.title) return;

    const targetType = tempPin.type || (project.mode === 'working' ? 'issue' : 'comment');

    try {
      let savedPin: Pin;
      let savedIssue: AnnotationIssue | null = null;
      if (selectedPinId) {
        savedPin = await ApiService.updatePin(selectedPinId, {
          title: tempPin.title,
          description: tempPin.description,
          device: tempPin.device || viewMode,
          type: targetType
        });
      } else {
        savedPin = await ApiService.createPin(project.id, {
          pageId: activePageId,
          x: tempPin.x!,
          y: tempPin.y!,
          title: tempPin.title!,
          description: tempPin.description || '',
          device: viewMode,
          type: targetType
        });
      }

      if (targetType === 'issue' && project.mode === 'working') {
        try {
          savedIssue = await ApiService.savePinIssue(
            savedPin.id,
            {
              projectId: project.id,
              status: 'active'
            }
          );
        } catch { }
      } else if (targetType === 'comment') {
        try {
          await ApiService.deletePinIssue(savedPin.id);

          setProjectIssues(prev =>
            prev.filter(issue => issue.pinId !== savedPin.id)
          );
        } catch { }
      }

      setPins(prev => {
        if (selectedPinId) {
          return prev.map(pin =>
            pin.id === savedPin.id
              ? savedPin
              : pin
          );
        }

        return [...prev, savedPin];
      });

      if (savedIssue) {
        setProjectIssues(prev => [
          savedIssue!,
          ...prev.filter(
            issue => issue.pinId !== savedIssue!.pinId
          )
        ]);
      }

      setTempPin(null);
      setSelectedPinId(null);
      setIsEditingPin(false);

      showToast(
        selectedPinId ? 'Annotation updated successfully' : 'Annotation added successfully',
        'success'
      );

      if (
        targetType === 'issue' &&
        project.mode === 'working'
      ) {
        setIssueModalPin(savedPin);
        setShowIssueModal(true);
      }
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      showToast('Failed to save pin', 'error');
    }
  };

  const handleDeletePin = async () => {
    if (!selectedPinId || !project) return;

    try {
      await ApiService.deletePin(selectedPinId);

      setPins(prev =>
        prev.filter(pin => pin.id !== selectedPinId)
      );

      setProjectIssues(prev =>
        prev.filter(issue => issue.pinId !== selectedPinId)
      );

      setSelectedPinId(null);
      setTempPin(null);
      setIsEditingPin(false);

      showToast('Annotation deleted successfully', 'success');
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      showToast('Failed to delete pin', 'error');
    }
  };

  const openPinEditor = (pin: Pin) => {
    setSelectedPinId(pin.id);
    setTempPin({
      x: pin.x,
      y: pin.y,
      title: pin.title,
      description: pin.description,
      device: normalizePinDevice(pin.device),
      type: pin.type || (project?.mode === 'working' ? 'issue' : 'comment')
    });
    setIsEditingPin(true);
  };

  const handleEditPin = (pin: Pin, e: React.MouseEvent) => {
    e.stopPropagation();

    if (project?.mode === 'working') {
      const pinType = pin.type || 'issue';
      if (pinType === 'issue') {
        setSelectedPinId(null);
        setTempPin(null);
        setIsEditingPin(false);
        setIssueModalPin(pin);
        setShowIssueModal(true);
        return;
      }
    }

    openPinEditor(pin);
  };

  

  const handlePublish = async () => {
    if (!project) return;

    const wasPublished =
      project.status === ProjectStatus.PUBLISHED;

    try {
      await ApiService.publishProject(project.id);

      const updatedProject =
        await ApiService.getProject(project.id);

      setProject(updatedProject);

      showToast(
        wasPublished
          ? 'Live version has been updated with your latest changes.'
          : 'Project published successfully!',
        'success'
      );
    } catch (error: any) {
      if (
        error.status === 401 ||
        error.status === 403 ||
        (
          error.response &&
          (
            error.response.status === 401 ||
            error.response.status === 403
          )
        )
      ) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }

      showToast('Failed to publish project', 'error');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Simulate backend progress for user feedback
  const simulateLoadingSteps = () => {
    const steps = [
      '🚀 Launching browser...',
      '🌍 Navigating to site...',
      '⏳ Waiting for DOM content...',
      '📜 Scrolling to trigger lazy content...',
      '⏱️  Waiting for network idle...',
      '🖼️  Verifying media loaded...',
      '📸 Capturing final image...',
      '⚠️ Heavy page detected, retrying...',
      '🔄 Attempting alternative capture method...'
    ];
    setLoadingStep(steps[0]);
    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      if (stepIndex < steps.length) setLoadingStep(steps[stepIndex]);
    }, 3500);
    return interval;
  };

  const fetchDeviceScreenshot = async (url: string, device: 'desktop' | 'mobile') => {
    // Use the backend directly to specify device type
    // Add timestamp to prevent caching
    const useLocal = isLocalComputeEnabled ? 'true' : 'false';
    const response = await fetch(`${import.meta.env.VITE_API_URL}/take?url=${encodeURIComponent(url)}&type=${device}&t=${Date.now()}&useLocal=${useLocal}`);
    if (!response.ok) {
      throw new Error('Failed to capture screenshot');
    }

    // Safety Check: Ensure we received an image, not JSON or HTML error
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('image')) {
      throw new Error('Server returned non-image data. Check backend logs.');
    }

    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    // Compress the screenshot on the frontend before sending to backend
    console.log('[Screenshot] Compressing image on frontend...');
    const compressed = await compressImageBase64(base64);
    return compressed;
  };

  const [liveCaptureModalConfig, setLiveCaptureModalConfig] = useState<{
    isOpen: boolean;
    url: string;
    device: 'desktop' | 'mobile';
    isEditingPage?: boolean;
    isMobileViewSwitch?: boolean;
    isDesktopViewSwitch?: boolean;
    autoSwitchMobileAfterAdd?: boolean;
  }>({
    isOpen: false,
    url: '',
    device: 'desktop',
    isEditingPage: false,
    isMobileViewSwitch: false,
    isDesktopViewSwitch: false,
    autoSwitchMobileAfterAdd: false
  });

  const [urlModalConfig, setUrlModalConfig] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    pageId?: string;
    initialUrl: string;
    initialName: string;
  }>({
    isOpen: false,
    mode: 'add',
    initialUrl: '',
    initialName: ''
  });

  const [inputUrl, setInputUrl] = useState('');
  const [inputName, setInputName] = useState('');

  const handleAddFromUrl = async () => {
    if (!checkPermission()) return;
    if (!(await checkSubscriptionAccess())) return;

    const defaultUrl = project?.websiteUrl || '';
    setInputUrl(defaultUrl);
    setInputName('');
    setUrlModalConfig({
      isOpen: true,
      mode: 'add',
      initialUrl: defaultUrl,
      initialName: ''
    });
  };

  const handleOpenEditPageModal = async (e: React.MouseEvent, page: ProjectPage) => {
    e.preventDefault();
    e.stopPropagation();

    if (!checkPermission()) return;
    if (!(await checkSubscriptionAccess())) return;

    setActivePageId(page.id);
    const targetUrl = page.originalUrl || project?.websiteUrl || '';
    setInputUrl(targetUrl);
    setInputName(''); // Empty page name field on edit modal open as requested
    setUrlModalConfig({
      isOpen: true,
      mode: 'edit',
      pageId: page.id,
      initialUrl: targetUrl,
      initialName: page.name || ''
    });
  };

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type?: 'success' | 'error' | 'info';
  }>({ show: false, message: '', type: 'info' });

  const [deletePageConfirmId, setDeletePageConfirmId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'info' });
    }, 4000);
  };

  const handleConfirmUrlModal = async () => {
    if (!inputUrl || !inputUrl.trim()) {
      showToast("Please enter a valid webpage URL.", 'error');
      return;
    }

    const targetUrl = inputUrl.trim();
    const targetName = inputName.trim();
    const isUrlUnchanged = targetUrl.toLowerCase() === urlModalConfig.initialUrl.trim().toLowerCase();

    // Close URL modal
    setUrlModalConfig(prev => ({ ...prev, isOpen: false }));

    // IF EDITING EXISTING PAGE AND URL WAS NOT CHANGED: UPDATE NAME ONLY (DO NOT CALL SCREENSHOT OR LIVECAPTUREMODAL!)
    if (urlModalConfig.mode === 'edit' && urlModalConfig.pageId && isUrlUnchanged) {
      if (targetName && targetName !== urlModalConfig.initialName && project) {
        try {
          await ApiService.updatePage(project.id, urlModalConfig.pageId, { name: targetName });
          const updatedProject = await ApiService.getProject(project.id);
          setProject(updatedProject);
          showToast("Page name updated successfully", 'success');
        } catch (err) {
          console.error("Failed to update page name:", err);
          showToast("Failed to update page name.", 'error');
        }
      }
      return;
    }

    // IF ADDING PAGE FROM MOBILE MODE: RUN DESKTOP CAPTURE FIRST TO CREATE PAGE, THEN AUTO-SWITCH TO MOBILE
    const isAddingFromMobile = urlModalConfig.mode === 'add' && viewMode === 'mobile';

    // IF URL WAS CHANGED OR ADDING NEW PAGE: LAUNCH LIVECAPTUREMODAL
    setLiveCaptureModalConfig({
      isOpen: true,
      url: targetUrl,
      device: isAddingFromMobile ? 'desktop' : viewMode,
      isEditingPage: urlModalConfig.mode === 'edit',
      autoSwitchMobileAfterAdd: isAddingFromMobile
    });
  };

  const handleLiveCaptureAddPage = async (rawScreenshotBase64: string) => {
    if (!project || !liveCaptureModalConfig.url) return;
    try {
      // Compress the screenshot before updating or adding page
      const screenshotBase64 =
        liveCaptureModalConfig.device === 'mobile'
          ? await compressMobileImageBase64(rawScreenshotBase64)
          : await compressImageBase64(rawScreenshotBase64);

      console.log('[LIVE CAPTURE FINAL IMAGE]', {
      device: liveCaptureModalConfig.device,
      rawBytes: rawScreenshotBase64.length,
      rawMB: (rawScreenshotBase64.length / 1024 / 1024).toFixed(2),
      compressedBytes: screenshotBase64.length,
      compressedMB: (screenshotBase64.length / 1024 / 1024).toFixed(2),
      compressedType: screenshotBase64.substring(0, 40)
    });

      // IF RE-CAPTURING / EDITING EXISTING PAGE SCREENSHOT (DESKTOP OR MOBILE):
      if (activePageId && liveCaptureModalConfig.isEditingPage) {
        const pageName = inputName.trim() !== ''
          ? inputName.trim()
          : normalizePageName(liveCaptureModalConfig.url, project.websiteUrl);

        const updateData: any = {
          name: pageName,
          originalUrl: liveCaptureModalConfig.url,
          deleteAllPins: true, // Delete all existing pins on this page
          mobileImageUrl: null // Reset mobile image so switching to Android will re-capture new URL
        };

        if (liveCaptureModalConfig.device === 'mobile') {
          updateData.mobileImageUrl = screenshotBase64;
          updateData.imageUrl = null;
        } else {
          updateData.imageUrl = screenshotBase64;
        }

        await ApiService.updatePage(project.id, activePageId, updateData);
        const updatedProject = await ApiService.getProject(project.id);
        setProject(updatedProject);

        const updatedPins = await ApiService.getPins(project.id);
        setPins(updatedPins);

        showToast("Screen captured successfully", 'success');
        setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop', isEditingPage: false });
        return;
      }

      // IF SWITCHING VIEW MODE TO MOBILE FOR AN EXISTING PAGE: SAVE TO SAME PAGE
      if (liveCaptureModalConfig.isMobileViewSwitch && activePageId) {
        await ApiService.updatePage(project.id, activePageId, {
          mobileImageUrl: screenshotBase64
        } as any);

        setProject(prev => prev ? {
          ...prev,
          pages: prev.pages.map(p => p.id === activePageId ? { ...p, mobileImageUrl: screenshotBase64 } : p)
        } : null);

        setViewMode('mobile');
        showToast("Mobile view captured successfully", 'success');
        setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop', isEditingPage: false, isMobileViewSwitch: false });
        return;
      }

      // IF SWITCHING VIEW MODE TO DESKTOP FOR AN EXISTING PAGE: SAVE TO SAME PAGE
      if (liveCaptureModalConfig.isDesktopViewSwitch && activePageId) {
        await ApiService.updatePage(project.id, activePageId, {
          imageUrl: screenshotBase64
        } as any);

        setProject(prev => prev ? {
          ...prev,
          pages: prev.pages.map(p => p.id === activePageId ? { ...p, imageUrl: screenshotBase64 } : p)
        } : null);

        setViewMode('desktop');
        showToast("Desktop view captured successfully", 'success');
        setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop', isEditingPage: false, isDesktopViewSwitch: false });
        return;
      }

      // ADD NEW PAGE:
      const name = inputName.trim() !== ''
        ? inputName.trim()
        : normalizePageName(liveCaptureModalConfig.url, project.websiteUrl);

      const newPageData: any = {
        name,
        originalUrl: liveCaptureModalConfig.url,
        imageUrl: screenshotBase64,
        mobileImageUrl: null
      };

      const newPage = await ApiService.addPage(project.id, newPageData);
      const updatedProject = await ApiService.getProject(project.id);
      setProject(updatedProject);
      setActivePageId(newPage.id);

      // IF ADDING PAGE WHILE IN MOBILE MODE: NOW AUTO-SWITCH TO MOBILE & TRIGGER MOBILE CAPTURE!
      if (liveCaptureModalConfig.autoSwitchMobileAfterAdd) {
        showToast("Page created. Now capturing Android mobile view...", 'info');
        setLiveCaptureModalConfig({
          isOpen: true,
          url: liveCaptureModalConfig.url,
          device: 'mobile',
          isEditingPage: false,
          isMobileViewSwitch: true,
          autoSwitchMobileAfterAdd: false
        });
        return;
      }

      showToast("New page added successfully", 'success');
      setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop', isEditingPage: false, autoSwitchMobileAfterAdd: false });
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        showToast("Session expired. Please log in again.", 'error');
        onNavigate('/login');
        return;
      }
      showToast("Failed to save live screenshot.", 'error');
      setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop', isEditingPage: false, autoSwitchMobileAfterAdd: false });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && project) {
      if (!(await checkSubscriptionAccess())) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;
          const name = file.name.split('.')[0].replace(/-|_/g, ' ');

          // Compress the uploaded image before sending to backend
          console.log('[Upload] Compressing uploaded image...');
          const compressedImage = await compressImageBase64(base64String);

          const newPage = await ApiService.addPage(project.id, {
            name,
            imageUrl: compressedImage
          });

          const updatedProject = await ApiService.getProject(project.id);
          setProject(updatedProject);
          setActivePageId(newPage.id);
          showToast("Image uploaded successfully", 'success');
        } catch (error: any) {
          if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
            StorageService.clearUser();
            onNavigate('/login');
            return;
          }
          showToast('Failed to upload image', 'error');
        }
      };

      reader.readAsDataURL(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRenamePage = async (e: React.MouseEvent, page: ProjectPage) => {
    handleOpenEditPageModal(e, page);
  };

  const handleDeletePage = async (e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!project) return;

    if (project.pages.length <= 1) {
      showToast("A project must have at least one page.", 'error');
      return;
    }

    setDeletePageConfirmId(pageId);
  };

  const confirmDeletePage = async () => {
    if (!project || !deletePageConfirmId) return;
    const pageId = deletePageConfirmId;
    setDeletePageConfirmId(null);

    try {
      await ApiService.deletePage(project.id, pageId);

      const updatedProject = await ApiService.getProject(project.id);
      setProject(updatedProject);

      if (activePageId === pageId) {
        setActivePageId(updatedProject.pages[0]?.id || null);
      }

      const updatedPins = await ApiService.getPins(project.id);
      setPins(updatedPins);
      showToast("Page deleted successfully", 'success');
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      showToast('Failed to delete page', 'error');
    }
  };

  const handleViewModeChange = async (mode: 'desktop' | 'mobile') => {
    if (mode === 'mobile' && activePage && activePage.originalUrl && !(activePage as any).mobileImageUrl) {
      if (!checkPermission()) return;
      if (!(await checkSubscriptionAccess())) return;

      // Pop up LiveCaptureModal in Android format!
      setLiveCaptureModalConfig({
        isOpen: true,
        url: activePage.originalUrl,
        device: 'mobile',
        isMobileViewSwitch: true
      });
      return;
    }

    if (mode === 'desktop' && activePage && activePage.originalUrl && !activePage.imageUrl) {
      if (!checkPermission()) return;
      if (!(await checkSubscriptionAccess())) return;

      // Pop up LiveCaptureModal in Desktop format!
      setLiveCaptureModalConfig({
        isOpen: true,
        url: activePage.originalUrl,
        device: 'desktop',
        isDesktopViewSwitch: true
      });
      return;
    }

    setViewMode(mode);
  };

  if (loading || !project) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 size={32} className="animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex flex-col md:flex-row justify-between items-center z-20 shadow-sm sticky top-0 md:h-16">
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <button onClick={() => onNavigate('/')} className="text-slate-500 hover:text-slate-900">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-slate-800">{project.name}</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${project.status === ProjectStatus.PUBLISHED ? 'bg-green-500' : 'bg-amber-400'}`}></span>
              <span className="text-slate-500 uppercase tracking-wider">{project.status}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 md:gap-3 mt-2 md:mt-0 w-full md:w-auto justify-end items-center">
          {project?.mode === 'working' && (
            <button
              onClick={() => {
                setShowSearchDrawer(prev => !prev);
                refreshProjectIssues();
                if (project) {
                  ApiService.getPins(project.id).then(setPins).catch(() => { });
                }
              }}
              className={`p-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-medium ${showSearchDrawer ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'}`}
              title="Search & Filter Project Issues"
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Filter Issues</span>
            </button>
          )}

          <div className="flex bg-slate-100 p-1 rounded-lg mr-2 md:static absolute top-3 right-4
                md:flex">
            <button
              onClick={() => handleViewModeChange('desktop')}
              className={`p-2 rounded-md transition-all ${viewMode === 'desktop' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Desktop View"
              disabled={isFetchingMobile}
            >
              <Monitor size={18} />
            </button>
            <button
              onClick={() => handleViewModeChange('mobile')}
              className={`p-2 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Mobile View"
              disabled={isFetchingMobile}
            >
              <Smartphone size={18} />
            </button>
          </div>

          <button
            onClick={() => window.open(`/draft/${project.id}`, '_blank')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Eye size={16} />
            Preview Draft
          </button>

          {project.status === ProjectStatus.PUBLISHED && (
            <button
              onClick={() => window.open(`/live/${project.id}`, '_blank')}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Eye size={16} />
              Preview Live
            </button>
          )}

          <button
            onClick={handlePublish}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Share2 size={16} />
            {project.status === ProjectStatus.PUBLISHED ? 'Update Publish' : 'Publish Delivery'}
          </button>
        </div>
      </header>

      {/* Search & Filter Issues Drawer */}
      {showSearchDrawer && (
        <div
          ref={searchDrawerRef}
          className="fixed top-16 right-4 z-40 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span>Issues & Comments ({filteredAndSortedItems.length})</span>
            </div>
            <button
              onClick={() => setShowSearchDrawer(false)}
              className="p-1 rounded-lg hover:bg-white/60 text-slate-500 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Controls */}
          <div className="p-3 border-b space-y-2.5 bg-slate-50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={issueSearchQuery}
                onChange={e => setIssueSearchQuery(e.target.value)}
                placeholder="Search by title, #pin, label, assignee..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Device & Type toggles (boolean-style) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Device</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-md">
                  {(['all', 'desktop', 'mobile'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setIssueDeviceFilter(v)}
                      className={`py-1 rounded text-[10px] font-medium transition ${issueDeviceFilter === v
                        ? 'bg-white shadow text-indigo-600'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      {v === 'all' ? 'All' : v === 'desktop' ? <Monitor size={12} className="inline" /> : <Smartphone size={12} className="inline" />}
                      {v !== 'all' ? ` ${v.charAt(0).toUpperCase()}${v.slice(1)}` : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Pin Type</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-md">
                  {(['all', 'issue', 'comment'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setIssueTypeFilter(v)}
                      className={`py-1 rounded text-[10px] font-medium transition ${issueTypeFilter === v
                        ? 'bg-white shadow text-indigo-600'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                      {v === 'all' ? 'All' : v === 'issue' ? <AlertCircle size={12} className="inline" /> : <MessageSquare size={12} className="inline" />}
                      {v !== 'all' ? ` ${v.charAt(0).toUpperCase()}${v.slice(1)}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Status</label>
                <select
                  value={issueStatusFilter}
                  onChange={e => setIssueStatusFilter(e.target.value)}
                  className="w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-xs outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Label</label>
                <select
                  value={issueLabelFilter}
                  onChange={e => setIssueLabelFilter(e.target.value)}
                  className="w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-xs outline-none focus:border-indigo-500"
                >
                  <option value="all">All Labels</option>
                  {availableLabels.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Sort By</label>
                <select
                  value={issueSortBy}
                  onChange={e => setIssueSortBy(e.target.value as any)}
                  className="w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-xs outline-none focus:border-indigo-500"
                >
                  <option value="latest">Latest Created</option>
                  <option value="earliest">Earliest Created</option>
                  <option value="number">Pin Number</option>
                </select>
              </div>
            </div>

            {(isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) ? (
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Assignee</label>
                <select
                  value={issueAssigneeFilter}
                  onChange={e => setIssueAssigneeFilter(e.target.value)}
                  className="w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-xs outline-none focus:border-indigo-500"
                >
                  <option value="all">All Assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {uniqueAssigneesFromIssues.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.designation ? ` · ${a.designation}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 italic px-1">
                Showing only issues assigned to you
              </div>
            )}
          </div>

          {/* Issue List */}
          <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[50vh]">
            {filteredAndSortedItems.length === 0 ? (
              <div className="text-center text-slate-400 text-xs py-8">
                No matching issues or comments found
              </div>
            ) : (
              filteredAndSortedItems.map(item => {
                const pin = item.pin;
                const page = project?.pages.find(p => p.id === pin?.pageId);
                const pinType = pin?.type || 'issue';
                const pinDevice = normalizePinDevice(pin?.device);
                const isIssue = item.kind === 'issue';
                const iss = isIssue ? item.issue : null;

                const assigneeName = isIssue && iss
                  ? (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any).name : (iss.assigneeId ? 'Assigned' : 'Unassigned'))
                  : 'Comment';

                const statusBadge = isIssue && iss ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${iss.status === 'active' ? 'bg-blue-50 text-blue-700' :
                    iss.status === 'in_progress' ? 'bg-orange-50 text-orange-700' :
                      iss.status === 'in_review' ? 'bg-purple-50 text-purple-700' :
                        'bg-emerald-50 text-emerald-700'
                    }`}>
                    {iss.status.replace('_', ' ')}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-slate-100 text-slate-600">
                    Comment
                  </span>
                );

                const handleItemClick = () => {
                  setShowSearchDrawer(false);
                  const targetPin = pin;
                  if (!targetPin) return;

                  if (targetPin.pageId && targetPin.pageId !== activePageId) {
                    setActivePageId(targetPin.pageId);
                  }

                  const device = normalizePinDevice(targetPin.device);
                  if (device !== viewMode) {
                    handleViewModeChange(device);
                  }

                  setSelectedPinId(targetPin.id);

                  const tryScroll = (retries = 0) => {
                    if (!mainScrollRef.current && !imageRef.current) {
                      if (retries < 15) setTimeout(() => tryScroll(retries + 1), 100);
                      return;
                    }
                    const pinEl = document.querySelector(`[data-pin-id="${targetPin.id}"]`) as HTMLElement | null;
                    const imageEl = imageRef.current;
                    if (pinEl) {
                      pinEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    } else if (imageEl) {
                      imageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else if (mainScrollRef.current) {
                      mainScrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    if (!pinEl && retries < 10) setTimeout(() => tryScroll(retries + 1), 150);
                  };
                  setTimeout(() => tryScroll(), 200);

                  const t = targetPin.type || 'issue';
                  if (t === 'issue') {
                    setIssueModalPin(targetPin);
                    setShowIssueModal(true);
                  } else {
                    openPinEditor(targetPin);
                  }
                };

                return (
                  <div
                    key={item.id}
                    onClick={handleItemClick}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono flex-shrink-0">
                          #{pin?.number || '?'}
                        </span>
                        <span className="truncate">{pin?.title || 'Annotation'}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span title={pinDevice === 'mobile' ? 'Mobile' : 'Desktop'} className={`text-[9px] p-0.5 rounded flex items-center gap-0.5 font-medium border ${pinDevice === 'mobile' ? 'text-purple-600 border-purple-200 bg-purple-50' : 'text-slate-600 border-slate-200 bg-slate-50'}`}>
                          {pinDevice === 'mobile' ? <Smartphone size={10} /> : <Monitor size={10} />}
                        </span>
                        <span title={pinType === 'issue' ? 'Issue' : 'Comment'} className={`text-[9px] p-0.5 rounded flex items-center gap-0.5 font-medium border ${pinType === 'issue' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                          {pinType === 'issue' ? <AlertCircle size={10} /> : <MessageSquare size={10} />}
                        </span>
                        {statusBadge}
                      </div>
                    </div>

                    {pin?.description && (
                      <p className="text-xs text-slate-500 line-clamp-1">{pin.description}</p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>Page: {page?.name || 'Main'}</span>
                      <span className="truncate ml-2">{isIssue ? `Assignee: ${assigneeName}` : 'No assignee'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Pending Verification Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                <Loader2 size={24} className="animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Verification in Progress</h2>
              <p className="text-slate-600 mb-6">
                We are verifying your payment. Once done, we will activate your plan.
              </p>
              <button
                onClick={() => setShowPendingModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showIssueModal && issueModalPin && project && (
        <AnnotationIssueModal
          isOpen={showIssueModal}
          onClose={() => {
            setShowIssueModal(false);
            setIssueModalPin(null);
            refreshProjectIssues(project.id);
            if (project) {
              ApiService.getPins(project.id).then(setPins).catch(() => { });
            }
          }}
          pin={issueModalPin}
          project={project}
          isGroupMember={isGroupMember}
          isPMorOwner={isPMorOwner}
          isTeamMember={isTeamMember}
          onPinUpdated={(updatedPin) => {
            if (updatedPin) {
              setPins(prev => prev.map(pin => pin.id === updatedPin.id ? updatedPin : pin));
            }
            refreshProjectIssues(project.id);
            if (project) {
              ApiService.getPins(project.id).then(setPins).catch(() => { });
            }
          }}
          onDeletePin={(pinId) => {
            setPins(prev => prev.filter(pin => pin.id !== pinId));
            refreshProjectIssues(project.id);
            if (project) {
              ApiService.getPins(project.id).then(setPins).catch(() => { });
            }
          }}
        />
      )}

      {/* Subscription Modal */}
      {showSubscriptionModal && (
        <SubscriptionModal
          onClose={() => setShowSubscriptionModal(false)}
          onSuccess={(isPending) => {
            setShowSubscriptionModal(false);
            if (isPending) {
              setShowPendingModal(true);
            }
            // Refresh project or state if needed, but usually just closing is enough to let them try again
          }}
          userEmail={userEmail}
          title={subscriptionModalMode === 'expired' ? 'Subscription Expired' : subscriptionModalMode === 'subscribe' ? 'Subscription Required' : undefined}
          message={subscriptionModalMode === 'expired' ? 'Your subscription is expired. Buy another plan to continue working on project.' : subscriptionModalMode === 'subscribe' ? 'You are not subscribed. Choose a plan to create project.' : undefined}
        />
      )}

      {/* Chrome Extension Requirement Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-600 border border-blue-100 shadow-sm">
                <Globe size={24} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Install Chrome Extension</h2>
              <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                To capture real-time, unblocked full-page website screenshots, please ensure the <strong className="text-slate-900 font-semibold">Presently Live Capture Chrome Extension</strong> is installed and enabled.
              </p>

              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                  <span>Real-time Desktop & Mobile Scanner</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                  <span>Bypasses server blocks & bot detection</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                  <span>Client-side compressed instant saving</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 w-full">
                <button
                  onClick={handleGrantPermission}
                  disabled={permissionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
                >
                  {permissionLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                  Enable Live Capture & Continue
                </button>
                <button
                  onClick={() => setShowPermissionModal(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold text-xs transition-colors"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-64 bg-white border-b md:border-r md:border-b-0 border-slate-200 flex flex-col z-30 relative">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-20">
            <button
              onClick={() => setShowMobileScreens(!showMobileScreens)}
              className="font-bold text-slate-700 flex items-center gap-2 text-sm md:cursor-default"
            >
              <Layout size={16} />
              Screens
              <span className="md:hidden text-slate-400 ml-1">
                {showMobileScreens ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            <div className="flex items-center gap-1">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <button
                onClick={handleAddFromUrl}
                className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors"
                title="Add Page from Link"
              >
                <LinkIcon size={16} />
              </button>
              <button
                onClick={handleUploadClick}
                className="text-slate-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors"
                title="Upload Image"
              >
                <ImageIcon size={16} />
              </button>
            </div>
          </div>

          <div className={`
            md:flex-1 md:static md:block md:bg-transparent md:shadow-none md:w-auto md:max-h-none md:overflow-y-auto p-3 transition-all duration-200
            ${showMobileScreens ? 'absolute top-full left-0 w-full bg-white shadow-xl overflow-x-auto border-b border-slate-200' : 'hidden'}
          `}>
            {isFetchingUrl && (
              <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 rounded animate-pulse">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Fetching screenshot...</span>
                </div>
                <div className="text-[10px] text-slate-400">{loadingStep}</div>
              </div>
            )}
            <div className="flex flex-row md:flex-col space-x-3 md:space-x-0 md:space-y-3">
              {project.pages.map((page) => (
                <div
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={`group relative p-2 rounded-lg cursor-pointer border-2 transition-all ${activePageId === page.id ? 'border-blue-500 bg-blue-50/50' : 'border-transparent hover:bg-slate-50'
                    }`}
                  style={{ minWidth: '150px' }}
                >
                  <div className="aspect-video bg-slate-200 rounded-md overflow-hidden mb-2 relative group-hover:shadow-sm">
                    {page.imageUrl ? (
                      <img src={page.imageUrl} alt={page.name} className="w-full h-full object-cover object-top" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100">
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Loading...
                        </div>
                      </div>
                    )}
                    <div className="absolute top-0 right-0 p-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-black/20 to-transparent w-full justify-end">
                      <button
                        onClick={(e) => handleOpenEditPageModal(e, page)}
                        className="bg-white p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                        title="Edit Page URL or Name"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeletePage(e, page.id)}
                        className="bg-white p-1.5 rounded-md text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className={`text-xs font-medium truncate ${activePageId === page.id ? 'text-blue-700' : 'text-slate-600'}`}>
                      {page.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <main ref={mainScrollRef} className="flex-1 overflow-auto p-4 md:p-8 relative flex justify-center bg-slate-100/50">
          {activePage ? (
            <div className={`transition-all duration-300 ${viewMode === 'mobile' ? 'w-[375px] h-[667px] overflow-y-auto border-4 border-slate-800 rounded-[2rem] shadow-2xl bg-slate-800 scrollbar-hide' : 'w-full max-w-[1000px]'}`}>
              <div
                className="relative bg-white shadow-xl rounded-lg overflow-hidden select-none border border-slate-200 transition-all duration-300 flex flex-col"
                style={{ width: '100%', cursor: 'crosshair', minHeight: viewMode === 'mobile' ? 'unset' : activePage.imageUrl ? 'unset' : '600px' , height: 'fit-content' }}
                onClick={handleImageClick}
              >
                {/* {activePage.imageUrl ? ( */}
                {viewMode === 'mobile' && isFetchingMobile ? (
                  <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 text-slate-400">
                    <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
                    <p className="font-medium text-slate-600">Generating Mobile View...</p>
                    <p className="text-xs mt-2 text-slate-400 max-w-[200px] text-center">{loadingStep}</p>
                  </div>
                ) : activePage.imageUrl ? (
                  <>
                    <img
                      ref={imageRef}
                      src={viewMode === 'mobile' ? ((activePage as any).mobileImageUrl || activePage.imageUrl) : activePage.imageUrl}
                      alt={activePage.name}
                      className="w-full h-auto block"
                      draggable={false}
                    />

                    {activePins.filter(canSeePin).map((pin) => (
                      <div
                        key={pin.id}
                        data-pin-id={pin.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
                        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                        onClick={(e) => handleEditPin(pin, e)}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-lg cursor-pointer transition-transform hover:scale-110 border-2 border-white ${selectedPinId === pin.id ? 'bg-blue-600 scale-110 ring-4 ring-blue-600/20' : (pin.type && pin.type !== 'issue' ? 'bg-slate-600' : 'bg-slate-900')
                          }`}>
                          {pin.number}
                        </div>
                        {selectedPinId !== pin.id && (
                          <div className="absolute left-10 top-0 bg-slate-900 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none z-20">
                            <div className="flex items-center gap-1 mb-0.5">
                              {(pin.type || 'issue') === 'issue' ? (
                                <AlertCircle className="w-3 h-3 text-red-400" />
                              ) : (
                                <MessageSquare className="w-3 h-3 text-blue-300" />
                              )}
                              <span className="font-bold">{pin.title}</span>
                            </div>
                            <span className="text-slate-300 line-clamp-2">{pin.description}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {tempPin && !selectedPinId && (
                      <div
                        className="absolute w-8 h-8 rounded-full bg-blue-500 opacity-50 transform -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-sm"
                        style={{ left: `${tempPin.x}%`, top: `${tempPin.y}%` }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-lg text-slate-500 flex items-center gap-3">
                      <Loader2 size={24} className="animate-spin" />
                      Generating new screenshot...
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <ImageIcon size={48} className="mb-4 opacity-50" />
              <p>No screens in this project. Add one from the sidebar.</p>
            </div>
          )}

          {(isEditingPin && tempPin) && (
            <div
              className="fixed z-50 bg-white rounded-xl shadow-2xl p-5 w-full max-w-sm md:w-80 border border-slate-100 animate-in fade-in zoom-in-95 duration-200 bottom-0 right-0 md:bottom-auto md:top-[120px] md:right-[40px]"

            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <MapPin size={16} className="text-blue-600" />
                  {selectedPinId ? 'Edit Annotation' : 'New Annotation'}
                </h3>
                <button
                  onClick={() => {
                    setIsEditingPin(false);
                    setTempPin(null);
                    setSelectedPinId(null);
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {project?.mode === 'working' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pin Mode</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTempPin({ ...tempPin, type: 'issue' })}
                        className={`py-1.5 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${(tempPin.type || 'issue') === 'issue'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        <AlertCircle size={14} /> Issue
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempPin({ ...tempPin, type: 'comment' })}
                        className={`py-1.5 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${tempPin.type === 'comment'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        <MessageSquare size={14} /> Comment
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Title</label>
                  <input
                    autoFocus
                    type="text"
                    className="w-full border-b border-slate-200 pb-1 focus:border-blue-500 focus:outline-none text-slate-900 font-medium"
                    placeholder="e.g. Navigation Logic"
                    value={tempPin.title}
                    onChange={(e) => setTempPin({ ...tempPin, title: e.target.value })}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Explanation</label>
                  </div>
                  <textarea
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-black focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px]"
                    placeholder="Write your notes here..."
                    value={tempPin.description}
                    onChange={(e) => setTempPin({ ...tempPin, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  {selectedPinId && (
                    <button
                      onClick={handleDeletePin}
                      className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  <div className="flex-1"></div>
                  <button
                    onClick={handleSavePin}
                    disabled={!tempPin.title}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
                  >
                    <MapPin size={16} />
                    Save Pin
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Studio Custom Page URL & Name Capture Modal */}
      {urlModalConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 w-full max-w-md relative overflow-hidden font-sans">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 font-bold">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">
                    {urlModalConfig.mode === 'edit' ? 'Edit Page URL & Screenshot' : 'Add New Page from Link'}
                  </h3>
                  <p className="text-slate-500 text-xs font-medium">
                    Configure URL to scan with Live Webpage Engine
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUrlModalConfig(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Webpage URL Input Container */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/90">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Globe size={13} className="text-blue-500" />
                  Webpage URL
                </label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-900 text-xs font-mono font-medium shadow-2xs"
                  placeholder="https://example.com"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                />
              </div>

              {/* Page Name Input Container */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/90">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Pencil size={13} className="text-slate-500" />
                  Page Name (Optional)
                </label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-900 text-xs font-medium shadow-2xs"
                  placeholder="Leave blank to auto-generate from URL"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6">
              <button
                type="button"
                onClick={() => setUrlModalConfig(prev => ({ ...prev, isOpen: false }))}
                className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUrlModal}
                className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Globe size={15} />
                Launch Live Scanner & Capture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live In-Browser Screenshot Scanner Modal */}
      <LiveCaptureModal
        isOpen={liveCaptureModalConfig.isOpen}
        url={liveCaptureModalConfig.url}
        device={liveCaptureModalConfig.device}
        onClose={() => setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop' })}
        onCaptureComplete={handleLiveCaptureAddPage}
        isLocalComputeEnabled={isLocalComputeEnabled}
      />

      {/* Studio Custom Delete Page Confirmation Modal */}
      {deletePageConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm relative overflow-hidden text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center border border-red-100 font-bold mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base mb-1">Delete Page?</h3>
            <p className="text-slate-500 text-xs mb-6 font-medium">
              All pins and notes on this screen will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletePageConfirmId(null)}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePage}
                className="w-1/2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-sm"
              >
                Delete Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Studio Toast Notification Banner (No Native Alert Boxes!) */}
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-4 duration-300 pointer-events-auto">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border bg-white font-sans text-xs font-semibold ${
            toast.type === 'error'
              ? 'border-red-200 text-red-700'
              : toast.type === 'success'
              ? 'border-emerald-200 text-emerald-700'
              : 'border-slate-200 text-slate-700'
          }`}>
            {toast.type === 'error' ? (
              <AlertCircle size={18} className="text-red-500 shrink-0" />
            ) : toast.type === 'success' ? (
              <CheckCircle size={18} className="text-emerald-500 shrink-0" />
            ) : (
              <Info size={18} className="text-blue-500 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'info' })}
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-lg"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};