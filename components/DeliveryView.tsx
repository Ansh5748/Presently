import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { Project, Pin, ProjectPage, AnnotationIssue } from '../types';
import { Loader2, Layout, MessageSquare, Monitor, Smartphone, SlidersHorizontal, Search, X, AlertCircle, ChevronDown, Maximize2 } from 'lucide-react';
import { AnnotationIssueModal } from './AnnotationIssueModal';

const SPECIAL_EMAILS = ['guptadivyansh2707@gmail.com'];

interface DeliveryViewProps {
  projectId: string;
  isLiveView?: boolean;
  onNavigate?: (path: string) => void;
}

export const DeliveryView: React.FC<DeliveryViewProps> = ({ projectId, isLiveView = false, onNavigate }) => {
  const normalizePinDevice = (device: any): 'desktop' | 'mobile' => {
    const raw = String(device ?? '').trim().toLowerCase();
    if (raw === 'mobile' || raw === 'android' || raw === 'ios' || raw === 'phone') {
      return 'mobile';
    }
    return 'desktop';
  };

  const [project, setProject] = useState<Project | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(() => {
    if (typeof window === 'undefined') return 'desktop';

    if (isLiveView && window.matchMedia('(max-width: 768px)').matches) {
      return 'mobile';
    }

    return 'desktop';
  });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isGroupMember, setIsGroupMember] = useState(false);
  const [isPMorOwner, setIsPMorOwner] = useState(false);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [canAssignFilterAssignees, setCanAssignFilterAssignees] = useState(false);

  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [projectIssues, setProjectIssues] = useState<AnnotationIssue[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ id: string; name: string; avatarUrl?: string; designation?: string }[]>([]);
  const [issueSearchQuery, setIssueSearchQuery] = useState('');
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>('all');
  const [issueLabelFilter, setIssueLabelFilter] = useState<string>('all');
  const [issueSortBy, setIssueSortBy] = useState<'earliest' | 'latest' | 'number'>('latest');
  const [issueAssigneeFilter, setIssueAssigneeFilter] = useState<string>('all');
  const [issueDeviceFilter, setIssueDeviceFilter] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<'all' | 'issue' | 'comment'>('all');

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueModalPin, setIssueModalPin] = useState<Pin | null>(null);

    useEffect(() => {
    const u = StorageService.getUser() as any;

    setCurrentUserId(
      (u?.userId || u?.id || '').toString()
    );

    void loadProject();
  }, [projectId, isLiveView]);

  const loadProject = async () => {
    let projectData: Project | null = null;

    try {
      const view = isLiveView ? 'live' : 'draft';

      // -----------------------------------------
      // 1. INSTANT CACHE READ
      // -----------------------------------------

      if (!isLiveView) {
        const cachedProject =
          ApiService.getCachedProject(projectId);

        const cachedPins =
          ApiService.getCachedPins(projectId, view);

        let hasCache = false;

        if (cachedProject) {
          projectData = cachedProject;
          hasCache = true;

          setProject(cachedProject);

          if (cachedProject.pages?.length) {
            setActivePageId(
              cachedProject.pages[0].id
            );
          }
        }

        if (cachedPins) {
          hasCache = true;
          setPins(cachedPins);
        }

        if (hasCache) {
          setLoading(false);
        }
      }

      // -----------------------------------------
      // 2. PROJECT + PINS IN PARALLEL
      // -----------------------------------------

      const [freshProject, freshPins] =
        await Promise.all([
          ApiService.getProject(projectId, view),
          ApiService.getPins(projectId, view)
        ]);

      projectData = freshProject;

      setProject(freshProject);

      if (freshProject.pages?.length) {
        setActivePageId(
          freshProject.pages[0].id
        );
      }

      setPins(freshPins);

      // -----------------------------------------
      // 3. WORKING MODE DATA IN PARALLEL
      // -----------------------------------------

      if (freshProject.mode === 'working') {
        const [issuesResult, assigneeResult] =
          await Promise.allSettled([
            ApiService.getProjectIssues(projectId),
            ApiService.getProjectAssignees(projectId)
          ]);

        if (
          issuesResult.status === 'fulfilled'
        ) {
          setProjectIssues(
            issuesResult.value
          );
        }

        if (
          assigneeResult.status === 'fulfilled'
        ) {
          const assigneeData =
            assigneeResult.value;

          const allOpts = [
            ...(assigneeData.projectAssignees || []),
            ...(
              assigneeData.otherGroups || []
            ).flatMap(
              (g: any) => g.members || []
            )
          ];

          const uniq = new Map<
            string,
            {
              id: string;
              name: string;
              avatarUrl?: string;
              designation?: string;
            }
          >();

          allOpts.forEach((a: any) => {
            const id = (
              a._id ||
              a.id ||
              a.userId
            )?.toString?.();

            if (!id) return;
            if (uniq.has(id)) return;

            uniq.set(id, {
              id,
              name: a.name || 'User',
              avatarUrl: a.avatarUrl,
              designation: a.designation
            });
          });

          setAssigneeOptions(
            Array.from(uniq.values())
          );

          const perm =
            assigneeData.permissions ||
            ({} as any);

          setIsGroupMember(
            !!perm.isProjectGroupMember
          );

          setIsTeamMember(
            !!perm.isTeamMember
          );

          const u =
            StorageService.getUser() as any;

          const isOwnerOrAdmin =
            freshProject.userId
              ?.toString?.() ===
              currentUserId.toString() ||
            SPECIAL_EMAILS.includes(
              (u?.email || '').toLowerCase()
            );

          const canAssignOrQA =
            !!perm.canAssign ||
            isOwnerOrAdmin;

          setIsPMorOwner(
            canAssignOrQA
          );

          setCanAssignFilterAssignees(
            canAssignOrQA
          );
        }
      }

    } catch (error: any) {
      if (
        !isLiveView &&
        onNavigate &&
        (
          error.status === 403 ||
          (
            error.response &&
            error.response.status === 403
          )
        )
      ) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }

      if (!projectData) {
        alert('Project not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const u = StorageService.getUser() as any;
  const isProjectOwnerOrAdminOrPMOrQA =
    (project && project.userId?.toString?.() === currentUserId.toString()) ||
    SPECIAL_EMAILS.includes((u?.email || '').toLowerCase()) ||
    isPMorOwner;

  const refreshProjectIssues = async () => {
    if (!project) return;
    try {
      const issuesData = await ApiService.getProjectIssues(project.id);
      setProjectIssues(issuesData);
    } catch {}
  };

  const accessibleIssues = (() => {
    if (isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) return projectIssues;
    return projectIssues.filter(iss => {
      const assigneeId = iss.assigneeId ? (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any)._id : iss.assigneeId) : '';
      return assigneeId?.toString() === currentUserId;
    });
  })();

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

  const canSeePin = (pin: Pin): boolean => {
    // Published Live view must use the published snapshot directly.
    // It must never depend on authenticated projectIssues data.
    if (isLiveView) {
      return true;
    }

    if (isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) {
      return true;
    }

    const pinType = pin.type || 'issue';

    if (pinType === 'comment') {
      return true;
    }

    const iss = projectIssues.find(i => i.pinId === pin.id);

    if (!iss) {
      return false;
    }

    const assigneeId = iss.assigneeId
      ? (
          typeof iss.assigneeId === 'object'
            ? (iss.assigneeId as any)._id
            : iss.assigneeId
        )
      : '';

    return assigneeId?.toString() === currentUserId;
  };

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
        const assigneeName = (typeof iss.assigneeId === 'object' ? (iss.assigneeId as any).name : '').toLowerCase();
        return titleMatch || descMatch || numMatch || statusMatch || labelMatch || assigneeName.includes(q);
      });
    }
    if (issueStatusFilter !== 'all') list = list.filter(iss => iss.status === issueStatusFilter);
    if (issueLabelFilter !== 'all') list = list.filter(iss => (iss.labels || []).includes(issueLabelFilter));
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
        return (pin?.type || 'issue') === issueTypeFilter;
      });
    }
    list.sort((a, b) => {
      const pinA = pins.find(p => p.id === a.pinId);
      const pinB = pins.find(p => p.id === b.pinId);
      if (issueSortBy === 'earliest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (issueSortBy === 'number') return (pinA?.number || 0) - (pinB?.number || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  })();

  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!project || !activePageId) return;
    const newDetails = e.target.value;
    setProject(prev => prev ? { ...prev, pages: prev.pages.map(p => p.id === activePageId ? { ...p, details: newDetails } : p) } : null);
  };

  const handleSubmitDetails = async () => {
    if (!project || !activePageId) return;
    const page = project.pages.find(p => p.id === activePageId);
    if (page) {
      try {
        await ApiService.updatePage(project.id, activePageId, { details: (page as any).details });
      } catch (error: any) {
        if (!isLiveView && onNavigate && (error.status === 403 || (error.response && error.response.status === 403))) {
          StorageService.clearUser();
          onNavigate('/login');
          return;
        }
        console.error('Failed to save details:', error);
      }
    }
    setIsEditingDetails(false);
  };

  const handleEnterEditMode = () => {
    const activePage = project?.pages.find(p => p.id === activePageId);
    if (activePage && !(activePage as any).details) {
      const defaultDetails = `Review the implementation details for this screen below.\n\n- Mobile Responsive\n- Accessibility Checked`;
      setProject(prev => prev ? { ...prev, pages: prev.pages.map(p => p.id === activePageId ? { ...p, details: defaultDetails } : p) } : null);
    }
    setIsEditingDetails(true);
  };

  const handleNoteClick = (pin: Pin) => {
    setActivePinId(pin.id);
    scrollPinIntoView(pin);
    const pinType = pin.type || 'issue';
    if (pinType === 'issue') {
      setIssueModalPin(pin);
      setShowIssueModal(true);
    }
  };

  const handleOpenIssueModal = (pin: Pin) => {
    setActivePinId(pin.id);
    setIssueModalPin(pin);
    setShowIssueModal(true);
    scrollPinIntoView(pin);
  };

  const scrollPinIntoView = (pin: Pin) => {
    const tryScroll = (retries = 0) => {
      const container = imageContainerRef.current;
      const pinEl = document.querySelector(`[data-pin-id="${pin.id}"]`) as HTMLElement | null;
      const img = container?.querySelector('img') as HTMLImageElement | null;
      if (pinEl) {
        pinEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else if (img && container) {
        const imageTotalHeight = img.offsetHeight;
        const pinYPosition = (pin.y / 100) * imageTotalHeight;
        const scrollTo = pinYPosition - (container.offsetHeight / 2);
        container.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
      } else if (retries < 10) {
        setTimeout(() => tryScroll(retries + 1), 100);
      }
    };
    tryScroll();
  };

  const handleSelectIssueFromDrawer = (issue: AnnotationIssue) => {
    setShowSearchDrawer(false);
    const targetPin = pins.find(p => p.id === issue.pinId);
    if (!targetPin) return;

    if (targetPin.pageId && targetPin.pageId !== activePageId) {
      setActivePageId(targetPin.pageId);
    }
    const pinDevice = normalizePinDevice(targetPin.device);
    if (pinDevice !== viewMode) {
      setViewMode(pinDevice);
    }
    setActivePinId(targetPin.id);
    const pinType = targetPin.type || 'issue';

    setTimeout(() => {
      scrollPinIntoView(targetPin);
      if (pinType === 'issue') {
        setIssueModalPin(targetPin);
        setShowIssueModal(true);
      }
    }, 220);
  };

  const accessibleComments = (() => {
    const allPagePins = pins.filter(p => p.type === 'comment');
    if (isProjectOwnerOrAdminOrPMOrQA || canAssignFilterAssignees) return allPagePins;
    return allPagePins;
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

  const activePage = project?.pages.find(p => p.id === activePageId);
  const activePins = pins.filter(pin => {
    if (pin.pageId !== activePageId) return false;
    const pinDevice = normalizePinDevice(pin.device);
    return pinDevice === viewMode;
  });
  const visiblePins = activePins.filter(canSeePin);

  const pageSlug = (activePage as any)?.originalUrl?.toLowerCase().replace(/\s/g, '-') || '';
  const websiteUrl = (project as any)?.websiteUrl;
  const looksLikeDomainOrUrl = /(\.[a-z]{2,}|https?:\/\/|:\d{2,5})/.test(pageSlug);
  const displayUrl = looksLikeDomainOrUrl ||
    (websiteUrl && pageSlug.startsWith(websiteUrl.toLowerCase()))
    ? pageSlug
    : `${websiteUrl || ''}/${pageSlug}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 size={48} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Project Not Found</h1>
          <p className="text-slate-500">This project doesn't exist or hasn't been published yet.</p>
        </div>
      </div>
    );
  }

  const isWorkingMode = project.mode === 'working';

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center shadow-sm flex-none">
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap md:flex-nowrap">
          <div className="h-8 md:h-6 w-px bg-slate-200 shrink-0"></div>
          <span className="font-semibold text-slate-900 truncate">{project.name}</span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${isLiveView ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {isLiveView ? 'Live' : 'Draft'}
          </span>
          {isWorkingMode && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="md:hidden h-5 w-px bg-slate-200"></div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0 md:ml-0">
                Working Mode
              </span>
            </div>
          )}
        </div>
        <div className="hidden md:block text-sm text-slate-500 text-right pr-4">
          Prepared for <span className="font-semibold text-slate-900">{project.clientName || 'Client'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isWorkingMode && (
            <button
              onClick={() => {
                setShowSearchDrawer(prev => !prev);
                refreshProjectIssues();
                ApiService.getPins(projectId, isLiveView ? 'live' : 'draft').then(setPins).catch(() => {});
              }}
              className={`p-2 rounded-lg border transition flex items-center gap-1.5 text-xs font-medium ${showSearchDrawer ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'}`}
              title="Search & Filter Project Issues"
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Filter Issues</span>
            </button>
          )}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('desktop')}
              className={`p-2 rounded-md transition-all ${viewMode === 'desktop' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Desktop View"
            >
              <Monitor size={18} />
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={`p-2 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              title="Mobile View"
            >
              <Smartphone size={18} />
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 w-full flex flex-col lg:flex-row gap-4 lg:gap-8 p-4 md:p-6 lg:p-8">
        {/* Left Column */}
        <div className="lg:w-1/3 space-y-6 flex flex-col lg:max-h-[calc(100vh-120px)] lg:sticky top-24 self-start">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
              <Layout size={14} /> Screens
            </h3>
            <div className="flex flex-wrap gap-2">
              {project.pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={`
                    px-3 py-1.5 rounded-full text-sm font-medium transition-all
                    ${activePageId === page.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                  `}
                >
                  {page.name.length > 25 ? page.name.slice(0, 25) + '...' : page.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                {activePage?.name ? (activePage.name.length > 25 ? activePage.name.slice(0, 25) + '...' : activePage.name) : 'Overview'}
              </h2>
              {!isLiveView && (
                isEditingDetails ? (
                  <button onClick={handleSubmitDetails} className="text-sm font-medium bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">Submit</button>
                ) : (
                  <button onClick={handleEnterEditMode} className="text-sm font-medium text-slate-600 hover:text-slate-900">Edit</button>
                )
              )}
            </div>
            {isLiveView || !isEditingDetails ? (
              <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {(activePage as any)?.details !== undefined && (activePage as any)?.details !== null
                  ? (activePage as any).details
                  : (isLiveView ? 'No implementation details provided.' : "Click 'Edit' to add implementation details.")}
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Implementation Details</label>
                <textarea
                  value={(activePage as any)?.details || 'Review the implementation details for this screen below.\n\n- Mobile Responsive\n- Accessibility Checked'}
                  onChange={handleDetailsChange}
                  placeholder="Add implementation notes, features, or points here..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[150px] leading-relaxed"
                />
                <p className="text-xs text-slate-400 mt-2">
                  This text is only editable in the draft preview and will be read-only in the live version.
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0 max-h-[250px] lg:max-h-none" style={{ minHeight: '200px' }}>
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex-none">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare size={16} />
                Notes for this screen
              </h3>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {visiblePins.length === 0 && (
                <div className="p-8 text-slate-400 text-center text-sm">No notes added for this screen.</div>
              )}
              {visiblePins.map(pin => {
                const pinType = pin.type || 'issue';
                const isIssueType = pinType === 'issue';
                return (
                  <div
                    key={pin.id}
                    className={`p-5 transition-colors hover:bg-slate-50 ${activePinId === pin.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => { setActivePinId(activePinId === pin.id ? null : pin.id); scrollPinIntoView(pin); }}
                        className="flex-shrink-0 cursor-pointer"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${activePinId === pin.id ? 'bg-blue-600 text-white' : (pin.type && pin.type !== 'issue' ? 'bg-slate-500 text-white' : 'bg-slate-200 text-slate-600')}`}>
                          {pin.number}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => { setActivePinId(pin.id); scrollPinIntoView(pin); }}
                            className={`font-semibold mb-1 text-left ${activePinId === pin.id ? 'text-blue-900' : 'text-slate-800'} hover:text-blue-700`}
                          >
                            {pin.title}
                          </button>
                          <span title={normalizePinDevice(pin.device) === 'mobile' ? 'Mobile' : 'Desktop'}>
                            {normalizePinDevice(pin.device) === 'mobile' ? (
                              <Smartphone size={11} className="text-purple-500" />
                            ) : (
                              <Monitor size={11} className="text-slate-400" />
                            )}
                          </span>
                          <span title={pinType === 'issue' ? 'Issue' : 'Comment'}>
                            {pinType === 'issue' ? (
                              <AlertCircle size={11} className="text-red-500" />
                            ) : (
                              <MessageSquare size={11} className="text-blue-500" />
                            )}
                          </span>
                          {isIssueType && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenIssueModal(pin); }}
                              className="ml-auto p-1 rounded-md text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex-shrink-0"
                              title="Open Issue Details"
                            >
                              <Maximize2 size={13} />
                            </button>
                          )}
                        </div>
                        <p className="text-slate-600 text-sm leading-relaxed line-clamp-2">{pin.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Visuals */}
        <div className="lg:w-2/3 flex justify-center">
          <div className={`bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative transition-all duration-300 mx-auto ${viewMode === 'mobile' ? 'max-w-[375px] w-full' : 'w-full'}`}>
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="mx-auto bg-white px-3 py-1 rounded-md text-xs text-slate-400 w-1/2 text-center truncate">
                {displayUrl}
              </div>
            </div>

            <div ref={imageContainerRef} className="relative max-h-[80vh] overflow-y-auto">
              {activePage ? (
                <div className="relative">
                  <img
                    src={viewMode === 'mobile' ? ((activePage as any).mobileImageUrl || activePage.imageUrl) : activePage.imageUrl}
                    alt={activePage.name}
                    className="w-full h-auto block"
                  />

                  {visiblePins.map(pin => (
                    <button
                      key={pin.id}
                      data-pin-id={pin.id}
                      onClick={() => { setActivePinId(activePinId === pin.id ? null : pin.id); }}
                      onDoubleClick={() => handleNoteClick(pin)}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 focus:outline-none group"
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    >
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-xl transition-all duration-300 border-2 border-white
                        ${activePinId === pin.id ? 'bg-blue-600 scale-125 ring-4 ring-blue-600/30' : ((pin.type && pin.type !== 'issue') ? 'bg-slate-600 hover:scale-110 hover:bg-slate-700' : 'bg-slate-900 hover:scale-110 hover:bg-slate-800')}
                      `}>
                        {pin.number}
                      </div>

                      <div className={`
                        absolute left-1/2 -translate-x-1/2 mt-3 w-64 bg-slate-900 text-white text-sm p-4 rounded-xl shadow-2xl z-20 pointer-events-none transition-all duration-200 origin-top text-left
                        ${activePinId === pin.id ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0'}
                      `}>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                        <div className="flex items-start gap-1.5 mb-2">
                          {(pin.type || 'issue') === 'issue' ? (
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-blue-300 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="font-bold text-base leading-tight flex-1">{pin.title}</span>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                            {normalizePinDevice(pin.device) === 'mobile' ? (
                              <Smartphone size={12} className="text-purple-400" />
                            ) : (
                              <Monitor size={12} className="text-slate-300" />
                            )}
                            {(pin.type || 'issue') === 'issue' ? (
                              <AlertCircle size={12} className="text-red-400" />
                            ) : (
                              <MessageSquare size={12} className="text-blue-300" />
                            )}
                          </div>
                        </div>
                        <p className="text-slate-300 font-light leading-relaxed text-[13px] text-left block">{pin.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-[80vh] flex items-center justify-center text-slate-400">Image Loading...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Issues Drawer (Working Mode only) */}
      {isWorkingMode && showSearchDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSearchDrawer(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 via-white to-white flex-none">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  Filter Issues & Comments
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {filteredAndSortedItems.length} result{filteredAndSortedItems.length === 1 ? '' : 's'} · Working Mode
                </p>
              </div>
              <button onClick={() => setShowSearchDrawer(false)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

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

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Device</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-md">
                    {(['all', 'desktop', 'mobile'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setIssueDeviceFilter(v)}
                        className={`py-1 rounded text-[10px] font-medium transition ${issueDeviceFilter === v ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
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
                        className={`py-1 rounded text-[10px] font-medium transition ${issueTypeFilter === v ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
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
                    {availableLabels.map(l => (<option key={l} value={l}>{l}</option>))}
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
                <div className="text-[10px] text-slate-400 italic px-1">Showing only issues assigned to you</div>
              )}
            </div>

            <div className="p-3 overflow-y-auto flex-1 space-y-2">
              {filteredAndSortedItems.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-8">No matching issues or comments found</div>
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

                  const handleClick = () => {
                    setShowSearchDrawer(false);
                    const targetPin = pin;
                    if (!targetPin) return;

                    if (targetPin.pageId && targetPin.pageId !== activePageId) {
                      setActivePageId(targetPin.pageId);
                    }
                    const device = normalizePinDevice(targetPin.device);
                    if (device !== viewMode) {
                      setViewMode(device);
                    }
                    setActivePinId(targetPin.id);

                    setTimeout(() => {
                      scrollPinIntoView(targetPin);
                      if (isIssue) {
                        setIssueModalPin(targetPin);
                        setShowIssueModal(true);
                      }
                    }, 220);
                  };

                  return (
                    <div
                      key={item.id}
                      onClick={handleClick}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono flex-shrink-0">#{pin?.number || '?'}</span>
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
                      {pin?.description && <p className="text-xs text-slate-500 line-clamp-1">{pin.description}</p>}
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
        </div>
      )}

      {/* Working-mode Issue Modal (read-only: can chat + see history, no edits) */}
      {isWorkingMode && showIssueModal && issueModalPin && project && (
        <AnnotationIssueModal
          isOpen={showIssueModal}
          onClose={() => {
            setShowIssueModal(false);
            setIssueModalPin(null);
            refreshProjectIssues();
          }}
          pin={issueModalPin}
          project={project}
          isGroupMember={isGroupMember}
          isPMorOwner={isPMorOwner}
          isTeamMember={isTeamMember}
          readOnly={true}
          onPinUpdated={() => refreshProjectIssues()}
          onDeletePin={() => { refreshProjectIssues(); }}
        />
      )}
    </div>
  );
};