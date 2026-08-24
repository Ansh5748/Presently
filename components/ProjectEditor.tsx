import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { fetchScreenshotAsBase64 } from '../services/screenshotService';
import { refineText } from '../services/geminiService';
import { SubscriptionModal } from './SubscriptionModal';
import { AnnotationIssueModal } from './AnnotationIssueModal';
import { Project, Pin, ProjectStatus, ProjectPage, AnnotationIssue } from '../types';
import { ArrowLeft, Share2, Sparkles, X, MapPin, Eye, Loader2, Image as ImageIcon, Trash2, Layout, Link as LinkIcon, Pencil, Monitor, Smartphone, ChevronDown, ChevronUp, Laptop, Search, SlidersHorizontal, AlertCircle, MessageSquare } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const SPECIAL_EMAILS = [
  'divyanshgupta5748@gmail.com',
  'divyanshgupta4949@gmail.com'
];

// Helper: Force resize and compress using HTML Canvas (Guaranteed size reduction)
const forceCompressWithCanvas = (base64: string, maxWidth = 1280, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64);
      
      ctx.drawImage(img, 0, 0, width, height);
      // Convert to JPEG (often smaller than PNG/WebP for photos)
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      // Return a 1x1 pixel if loading fails to prevent saving 6MB garbage strings
      resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
    };
  });
};

/**
 * Compress base64 image to target size (200-500KB) using browser-image-compression
 * This replaces the backend compression for better performance on free-tier deployments
 */
const compressImageBase64 = async (base64String: string): Promise<string> => {
  try {
    // Check if it's a valid base64 image
    if (!base64String || !base64String.startsWith('data:image')) {
      return base64String;
    }

    console.log('[Frontend Compression] Starting compression...');
    const startSize = (base64String.length * 3) / 4;
    console.log(`[Frontend Compression] Original size: ${(startSize / 1024).toFixed(2)} KB`);

    const startSizeKB = startSize / 1024;
    // 🚀 Do NOT compress very small images
    if (startSizeKB <= 500) {
      console.log('[Frontend Compression] Skipping compression (already under 500KB)');
      return base64String;
    }
    // Convert base64 to Blob
    const response = await fetch(base64String);
    const blob = await response.blob();

    // Target: 300-500KB
    const TARGET_SIZE_KB = 300; // Aim for middle of range
    const MAX_SIZE_KB = 500;

    // Compression options with progressive quality reduction
    const options = {
      maxSizeMB: TARGET_SIZE_KB / 1024, // Convert KB to MB
      maxWidthOrHeight: 2560, // Limit max dimension
      useWebWorker: true,
      fileType: 'image/webp' as const,
      initialQuality: 0.95
    };

    let compressedBlob = await imageCompression(blob as File, options);

    // If browser-image-compression fails to reduce enough, or fails entirely
    if (compressedBlob.size > MAX_SIZE_KB * 1024 || compressedBlob.size >= blob.size) {
       console.log('[Frontend Compression] Library compression insufficient. Using Canvas fallback...');
       return await forceCompressWithCanvas(base64String, 1280, 0.7);
    }

    // Convert compressed blob back to base64
    const compressedBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(compressedBlob);
    });

    const finalSize = (compressedBase64.length * 3) / 4;
    console.log(`[Frontend Compression] Final size: ${(finalSize / 1024).toFixed(2)} KB (${((1 - finalSize / startSize) * 100).toFixed(1)}% reduction)`);

    return compressedBase64;
  } catch (error) {
    console.error('[Frontend Compression] Failed:', error);
    // Fallback to canvas if the library crashes
    return await forceCompressWithCanvas(base64String, 1000, 0.6);
  }
};

interface ProjectEditorProps {
  projectId: string;
  onNavigate: (path: string) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const ProjectEditor: React.FC<ProjectEditorProps> = ({ projectId, onNavigate }) => {
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
        const assigneeName = (typeof iss.assigneeId === 'object' ? iss.assigneeId?.name : '').toLowerCase();
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
        const dev = pin.device || 'desktop';
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
        const dev = pin.device || 'desktop';
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

    const pinDevice = (targetPin.device || 'desktop') as 'desktop' | 'mobile';
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
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const projectData = await ApiService.getProject(projectId);
      setProject(projectData);
      
      if (projectData.pages.length > 0 && !activePageId) {
        setActivePageId(projectData.pages[0].id);
      }

      const pinsData = await ApiService.getPins(projectId);
      setPins(pinsData);

      try {
        const issuesData = await ApiService.getProjectIssues(projectId);
        setProjectIssues(issuesData);
      } catch { setProjectIssues([]); }

      try {
        const assigneeData = await ApiService.getProjectAssignees(projectId);
        const allOpts = [
          ...(assigneeData.projectAssignees || []),
          ...((assigneeData.otherGroups || []).flatMap(g => g.members || []))
        ];
        const uniq = new Map<string, { id: string; name: string; avatarUrl?: string; designation?: string }>();
        allOpts.forEach((a: any) => {
          const id = (a._id || a.id || a.userId)?.toString?.();
          if (!id) return;
          if (uniq.has(id)) return;
          uniq.set(id, { id, name: a.name || 'User', avatarUrl: a.avatarUrl, designation: a.designation });
        });
        setAssigneeOptions(Array.from(uniq.values()));
        const perm = assigneeData.permissions || {} as any;
        setIsGroupMember(!!perm.isProjectGroupMember);
        setIsTeamMember(!!perm.isTeamMember);
        const isQAOrTester = (() => {
          try {
            const u = StorageService.getUser() as any;
            const e = u?.email?.toLowerCase() || '';
            if (SPECIAL_EMAILS.includes(e)) return true;
            if (projectData.userId?.toString?.() === currentUserId.toString()) return true;
          } catch {}
          return false;
        })();
        const canAssignOrQA = !!perm.canAssign || isQAOrTester;
        setIsPMorOwner(canAssignOrQA);
        setCanAssignFilterAssignees(canAssignOrQA);
      } catch (e: any) {
        console.warn('[loadProject] assignee load failed', e);
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
        alert("Failed to grant permission. Please try again.");
      }
    } catch (error: any) {
      console.error("Permission error details:", error);
      if (error.name === 'SyntaxError') {
        alert("Server error: Received invalid response (likely HTML instead of JSON). Check your VITE_API_URL.");
      } else {
        alert(`Network error: ${error.message || 'Check your connection'}`);
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
  const activePins = pins.filter(p => p.pageId === activePageId && (p.device === viewMode || (!p.device && viewMode === 'desktop')));

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
      if (selectedPinId) {
        savedPin = await ApiService.updatePin(selectedPinId, { 
          title: tempPin.title, 
          description: tempPin.description,
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
          await ApiService.savePinIssue(savedPin.id, { projectId: project.id, status: 'active' });
        } catch {}
      } else if (targetType === 'comment') {
        try {
          await ApiService.deletePinIssue(savedPin.id);
        } catch {}
      }

      const updatedPins = await ApiService.getPins(project.id);
      setPins(updatedPins);
      await refreshProjectIssues(project.id);
      setTempPin(null);
      setSelectedPinId(null);
      setIsEditingPin(false);

      if (targetType === 'issue' && project.mode === 'working') {
        const finalSavedPin = updatedPins.find(p => p.id === savedPin.id) || savedPin;
        setIssueModalPin(finalSavedPin);
        setShowIssueModal(true);
      }
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      alert('Failed to save pin');
    }
  };

  const handleDeletePin = async () => {
    if (!selectedPinId || !project) return;

    try {
      await ApiService.deletePin(selectedPinId);
      const updatedPins = await ApiService.getPins(project.id);
      setPins(updatedPins);
      await refreshProjectIssues(project.id);
      setSelectedPinId(null);
      setTempPin(null);
      setIsEditingPin(false);
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      alert('Failed to delete pin');
    }
  };

  const openPinEditor = (pin: Pin) => {
    setSelectedPinId(pin.id);
    setTempPin({
      x: pin.x,
      y: pin.y,
      title: pin.title,
      description: pin.description,
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

  const handleRefineWithAI = async () => {
    if (!tempPin?.description) return;
    setAiLoading(true);
    try {
      const polished = await refineText(tempPin.description);
      setTempPin({ ...tempPin, description: polished });
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
       alert('AI refinement failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!project) return;
    
    try {
      await ApiService.publishProject(project.id);
      const updatedProject = await ApiService.getProject(project.id);
      setProject(updatedProject);
      alert(project.status !== ProjectStatus.PUBLISHED 
        ? "Project published successfully!" 
        : "Live version has been updated with your latest changes."
      );
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      alert('Failed to publish project');
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

  const handleAddFromUrl = async () => {
    if (!checkPermission()) return;
    if (!(await checkSubscriptionAccess())) return;

    const url = prompt("Enter the URL of the page you want to capture:");
    if (!url || !project) return;

    setIsFetchingUrl(true);
    const interval = simulateLoadingSteps();

    try {
      const screenshotBase64 = await fetchDeviceScreenshot(url, 'desktop');
      const name = normalizePageName(url, project.websiteUrl);
      
      const newPage = await ApiService.addPage(project.id, {
        name,
        imageUrl: screenshotBase64,
        originalUrl: url
      });
      
      const updatedProject = await ApiService.getProject(project.id);
      setProject(updatedProject);
      setActivePageId(newPage.id);
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        alert("Session expired. Please log in again.");
        onNavigate('/login');
        return;
      }
      alert("Failed to capture screenshot. Please check the URL and ensure the screenshot service is running.");
    } finally {
      setIsFetchingUrl(false);
      setLoadingStep('');
      clearInterval(interval);
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
        } catch (error: any) {
          if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
            StorageService.clearUser();
            onNavigate('/login');
            return;
          }
          alert('Failed to upload image');
        }
      };
      
      reader.readAsDataURL(file);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRenamePage = async (e: React.MouseEvent, page: ProjectPage) => {
    e.stopPropagation();
    e.preventDefault();

    if (!project) return;

    if (page.originalUrl) {
      if (!checkPermission()) return;
      if (!(await checkSubscriptionAccess())) return;

      const originalUrl = page.originalUrl;
      const newUrlInput = prompt("Enter the new URL for this page:", originalUrl);
      if (newUrlInput === null) return;
      
      const finalUrl = newUrlInput.trim();
      if (!finalUrl) {
        alert("URL cannot be empty.");
        return;
      }

      const newNameInput = prompt("Enter a new name for this page (leave blank to auto-generate from URL):", page.name);
      if (newNameInput === null) return;

      const finalName = newNameInput.trim() === '' 
        ? normalizePageName(finalUrl, project.websiteUrl) 
        : newNameInput.trim();

      setIsFetchingUrl(true);
      const interval = simulateLoadingSteps();

      try {
        const newScreenshotBase64 = await fetchDeviceScreenshot(finalUrl, 'desktop');
        
        await ApiService.updatePage(project.id, page.id, {
          name: finalName,
          imageUrl: newScreenshotBase64,
          originalUrl: finalUrl,
          deleteAllPins: true,
          mobileImageUrl: null // Clear mobile image so it re-fetches on next view
        });
        
        const updatedProject = await ApiService.getProject(project.id);
        setProject(updatedProject);

        const updatedPins = await ApiService.getPins(project.id);
        setPins(updatedPins);
      } catch (error: any) {
        if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
          StorageService.clearUser();
          alert("Session expired. Please log in again.");
          onNavigate('/login');
          return;
        }
        alert("Failed to update screenshot. Please check the URL and ensure the screenshot service is running.");
      } finally {
        setIsFetchingUrl(false);
        setLoadingStep('');
        clearInterval(interval);
      }
    } else {
      const newNameInput = prompt("Enter a new name for this page:", page.name);
      if (newNameInput === null || newNameInput.trim() === '') return;
      
      const finalName = newNameInput.trim();

      try {
        await ApiService.updatePage(project.id, page.id, { name: finalName });
        const updatedProject = await ApiService.getProject(project.id);
        setProject(updatedProject);
      } catch (error: any) {
        if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
          StorageService.clearUser();
          onNavigate('/login');
          return;
        }
        alert('Failed to rename page');
      }
    }
  };

  const handleDeletePage = async (e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!project) return;
    
    if (project.pages.length <= 1) {
      alert("A project must have at least one page.");
      return;
    }

    if (confirm("Delete this page? All pins on this page will be removed.")) {
      try {
        await ApiService.deletePage(project.id, pageId);
        
        const updatedProject = await ApiService.getProject(project.id);
        setProject(updatedProject);
        
        if (activePageId === pageId) {
          setActivePageId(updatedProject.pages[0]?.id || null);
        }
        
        const updatedPins = await ApiService.getPins(project.id);
        setPins(updatedPins);
      } catch (error: any) {
        if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
          StorageService.clearUser();
          onNavigate('/login');
          return;
        }
        alert('Failed to delete page');
      }
    }
  };

  const handleViewModeChange = async (mode: 'desktop' | 'mobile') => {
    if (mode === 'mobile' && activePage && activePage.originalUrl && !(activePage as any).mobileImageUrl) {
      if (!checkPermission()) return;
    }
    if (mode === 'mobile' && activePage && activePage.originalUrl && !(activePage as any).mobileImageUrl && !(await checkSubscriptionAccess())) return;

    setViewMode(mode);
    
    // If switching to mobile and we don't have the mobile screenshot yet, fetch it
    if (mode === 'mobile' && activePage && activePage.originalUrl && !(activePage as any).mobileImageUrl) {
      setIsFetchingUrl(true);
      setIsFetchingMobile(true);
      const interval = simulateLoadingSteps();
      
      try {
        const mobileScreenshot = await fetchDeviceScreenshot(activePage.originalUrl, 'mobile');
        
        // Save the mobile screenshot to the page
        await ApiService.updatePage(project!.id, activePage.id, {
          mobileImageUrl: mobileScreenshot
        } as any);
        
        // Update local state immediately to show the image
        setProject(prev => prev ? {
          ...prev,
          pages: prev.pages.map(p => p.id === activePage.id ? { ...p, mobileImageUrl: mobileScreenshot } : p)
        } : null);

      } catch (error: any) {
        if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
          StorageService.clearUser();
          onNavigate('/login');
          return;
        }
        alert("Failed to capture mobile screenshot.");
        setViewMode('desktop'); // Revert on failure
      } finally {
        setIsFetchingUrl(false);
        setIsFetchingMobile(false);
        setLoadingStep('');
        clearInterval(interval);
      }
    }
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
                  ApiService.getPins(project.id).then(setPins).catch(() => {});
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
                      className={`py-1 rounded text-[10px] font-medium transition ${
                        issueDeviceFilter === v
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
                      className={`py-1 rounded text-[10px] font-medium transition ${
                        issueTypeFilter === v
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
                const pinDevice = pin?.device || 'desktop';
                const isIssue = item.kind === 'issue';
                const iss = isIssue ? item.issue : null;

                const assigneeName = isIssue && iss
                  ? (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any).name : (iss.assigneeId ? 'Assigned' : 'Unassigned'))
                  : 'Comment';

                const statusBadge = isIssue && iss ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    iss.status === 'active' ? 'bg-blue-50 text-blue-700' :
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

                  const device = (targetPin.device || 'desktop') as 'desktop' | 'mobile';
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
              ApiService.getPins(project.id).then(setPins).catch(() => {});
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
              ApiService.getPins(project.id).then(setPins).catch(() => {});
            }
          }}
          onDeletePin={(pinId) => {
            setPins(prev => prev.filter(pin => pin.id !== pinId));
            refreshProjectIssues(project.id);
            if (project) {
              ApiService.getPins(project.id).then(setPins).catch(() => {});
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

      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
                <Laptop size={24} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Enable Local Compute</h2>
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                To ensure the best performance and avoid server overload, we need your permission to use your local browser resources for processing screenshots.
              </p>
              
              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={handleGrantPermission}
                  disabled={permissionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {permissionLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                  Allow & Continue
                </button>
                <button 
                  onClick={() => setShowPermissionModal(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-4">
                You only need to do this once.
              </p>
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
                className={`group relative p-2 rounded-lg cursor-pointer border-2 transition-all ${
                  activePageId === page.id ? 'border-blue-500 bg-blue-50/50' : 'border-transparent hover:bg-slate-50'
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
                      onClick={(e) => handleRenamePage(e, page)}
                      className="bg-white p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                      title="Rename"
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
              style={{ width: '100%', cursor: 'crosshair', minHeight: viewMode === 'mobile' ? 'unset' : '600px', height: 'fit-content' }}
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-lg cursor-pointer transition-transform hover:scale-110 border-2 border-white ${
                        selectedPinId === pin.id ? 'bg-blue-600 scale-110 ring-4 ring-blue-600/20' : (pin.type && pin.type !== 'issue' ? 'bg-slate-600' : 'bg-slate-900')
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
                  <MapPin size={16} className="text-blue-600"/>
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
                        className={`py-1.5 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                          (tempPin.type || 'issue') === 'issue'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <AlertCircle size={14} /> Issue
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempPin({ ...tempPin, type: 'comment' })}
                        className={`py-1.5 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                          tempPin.type === 'comment'
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
                    onChange={(e) => setTempPin({...tempPin, title: e.target.value})}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Explanation</label>
                    <button 
                      onClick={handleRefineWithAI}
                      disabled={aiLoading || !tempPin.description}
                      className="hidden text-xs flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                    >
                      <Sparkles size={12} />
                      {aiLoading ? 'Refining...' : 'AI Rewrite'}
                    </button>
                  </div>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-black focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px]"
                    placeholder="Write your notes here..."
                    value={tempPin.description}
                    onChange={(e) => setTempPin({...tempPin, description: e.target.value})}
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
    </div>
  );
};