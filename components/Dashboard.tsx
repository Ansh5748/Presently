import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { SubscriptionModal } from './SubscriptionModal';
import { GroupManagementModal } from './GroupManagementModal';
import { LiveCaptureModal } from './LiveCaptureModal';
import { ProjectSummary, ProjectStatus, ProjectMode, Group } from '../types';
import logoImg from '../src/assets/presently_logo.png'; 
import { 
  Plus, ExternalLink, Trash2, Loader2, ArrowRight, LogOut, Crown, Laptop, 
  CheckCircle, XCircle, Users, DollarSign, Activity, Ban, Gift, MessageCircle, 
  Settings, Briefcase, Play, Wrench, Search, Filter, Layers, Sparkles, 
  Globe, FolderGit2, CheckSquare, ShieldCheck, HelpCircle, Zap, Send, MessageSquare, BookOpen, Compass, Download
} from 'lucide-react';

const SPECIAL_EMAILS = [
  'divyanshgupta5748@gmail.com',
  'divyanshgupta4949@gmail.com'
];

interface DashboardProps {
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onLogout }) => {
  const safeLower = (v?: string) => (v || '').toLowerCase();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectData, setNewProjectData] = useState<{ name: string; websiteUrl: string; clientName: string; groupId: string; mode: ProjectMode }>({ name: '', websiteUrl: '', clientName: '', groupId: 'none', mode: 'present' });
  const [quickUrl, setQuickUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [subscriptionModalMode, setSubscriptionModalMode] = useState<'default' | 'expired' | 'subscribe'>('default');
  const [showGroupManagement, setShowGroupManagement] = useState(false);
  
  // UI Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'working'>('all');

  // Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isLocalComputeEnabled, setIsLocalComputeEnabled] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);

  // Admin State
  const [adminPendingSubs, setAdminPendingSubs] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminAllSubs, setAdminAllSubs] = useState<any[]>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantDuration, setGrantDuration] = useState(30);
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'pending' | 'subscriptions' | 'grant'>('overview');

  useEffect(() => {
    const user = StorageService.getUser() as any;
    if (user) {
      setUserName(user.name);
      setUserEmail(user.email || '');
      setIsLocalComputeEnabled(user.isLocalComputeEnabled || false);
      void Promise.all([
        loadProjects(),
        loadGroups(),
        checkSubscription()
      ]);
      
      if (!user.isLocalComputeEnabled && !SPECIAL_EMAILS.includes(safeLower(user.email))) {
        setShowPermissionModal(true);
      }

      if (safeLower(user.email) === 'divyanshgupta5748@gmail.com') {
        loadAdminData();
      }
    } else {
      onNavigate('/');
    }
  }, []);

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      const projectsData = await ApiService.getProjects();
      setProjects(projectsData);
    } catch (error) {
      if ((error as any).status === 401 || (error as any).status === 403 || ((error as any).response && ((error as any).response.status === 401 || (error as any).response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/');
        return;
      }
      console.error('[Dashboard] Failed to load projects:', error);
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const groupsData = await ApiService.getGroups();
      setGroups(groupsData);
    } catch (error) {
      console.error('[Dashboard] Failed to load groups:', error);
    }
  };

  const loadAdminData = async () => {
    try {
      const user = StorageService.getUser() as any;
      const headers = { 'Authorization': `Bearer ${user.accessToken}` };
      
      const [pendingRes, statsRes, subsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/admin/subscriptions/pending`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/admin/stats`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/admin/subscriptions`, { headers })
      ]);

      if (pendingRes.ok) setAdminPendingSubs(await pendingRes.json());
      if (statsRes.ok) setAdminStats(await statsRes.json());
      if (subsRes.ok) setAdminAllSubs(await subsRes.json());

    } catch (error) {
      console.error('Failed to load admin data', error);
    }
  };

  const checkSubscription = async () => {
    try {
      const status: any = await ApiService.getSubscriptionStatus();
      setHasActiveSubscription(status.hasActiveSubscription);
      setPendingVerification(status.pendingVerification || false);
      setIsExpired(status.isExpired || false);
    } catch (error) {
      if ((error as any).status === 401 || (error as any).status === 403 || ((error as any).response && ((error as any).response.status === 401 || (error as any).response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/');
        return;
      }
      console.error('[Dashboard] Failed to check subscription:', error);
    } finally {
      setLoadingSubscription(false);
    }
  };

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
        StorageService.saveUser({ ...user, isLocalComputeEnabled: true });
        setIsLocalComputeEnabled(true);
        setShowPermissionModal(false);
      } else {
        console.error("Permission request failed:", response.status);
        alert("Failed to grant permission. Please try again.");
      }
    } catch (error: any) {
      console.error("Permission error details:", error);
      alert(`Network error: ${error.message || 'Check your connection'}`);
    } finally {
      setPermissionLoading(false);
    }
  };

  const handleNewProjectClick = () => {
    if (SPECIAL_EMAILS.includes(safeLower(userEmail))) {
      setIsCreating(true);
      return;
    }

    if (pendingVerification) {
      setShowPendingModal(true);
      return;
    }

    if (isExpired) {
      setSubscriptionModalMode('expired');
      setShowSubscriptionModal(true);
      return;
    }

    if (hasActiveSubscription) {
      setIsCreating(true);
    } else {
      setSubscriptionModalMode('subscribe');
      setShowSubscriptionModal(true);
    }
  };

  const handleQuickScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl) return;
    let formattedUrl = quickUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    let host = 'Website';
    try {
      host = new URL(formattedUrl).hostname.replace('www.', '');
    } catch (err) {}
    
    setNewProjectData({
      name: `${host.charAt(0).toUpperCase() + host.slice(1)} Delivery`,
      websiteUrl: formattedUrl,
      clientName: '',
      groupId: 'none',
      mode: 'present'
    });
    setIsCreating(true);
  };

  const [liveCaptureModalConfig, setLiveCaptureModalConfig] = useState<{
    isOpen: boolean;
    url: string;
    device: 'desktop' | 'mobile';
    pendingPayload?: any;
  }>({
    isOpen: false,
    url: '',
    device: 'desktop'
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectData.websiteUrl) return;
    setIsCreating(false);
    setLiveCaptureModalConfig({
      isOpen: true,
      url: newProjectData.websiteUrl,
      device: 'desktop',
      pendingPayload: { ...newProjectData }
    });
  };

  const handleLiveCaptureComplete = async (base64Image: string) => {
    if (!liveCaptureModalConfig.pendingPayload) return;
    setLoading(true);
    try {
      const user = StorageService.getUser();
      if (!user) throw new Error("User not authenticated.");

      const payload: any = {
        ...liveCaptureModalConfig.pendingPayload,
        initialPageUrl: base64Image,
        groupId: liveCaptureModalConfig.pendingPayload.groupId === 'none' ? undefined : liveCaptureModalConfig.pendingPayload.groupId,
        mode: liveCaptureModalConfig.pendingPayload.mode,
      };

      const newProject = await ApiService.createProject(payload);

      setProjects(prev => [
        {
          id: newProject.id,
          userId: newProject.userId,
          name: newProject.name,
          clientName: newProject.clientName,
          websiteUrl: newProject.websiteUrl,
          groupId: newProject.groupId,
          groupIds: newProject.groupIds,
          mode: newProject.mode,
          assignedUserIds: newProject.assignedUserIds,
          status: newProject.status,
          createdAt: newProject.createdAt,
          pageCount: newProject.pages?.length ?? 0,
          coverImageUrl: newProject.pages?.[0]?.imageUrl ?? null
        },
        ...prev
      ]);
      setNewProjectData({ name: '', websiteUrl: '', clientName: '', groupId: 'none', mode: 'present' });
      setQuickUrl('');
      setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop' });
      
      onNavigate(`/project/${newProject.id}`);
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/');
        return;
      }
      if (error.message === 'SUBSCRIPTION_REQUIRED') {
        setShowSubscriptionModal(true);
      } else {
        if (error.message === "User not authenticated.") onNavigate('/');
        alert("Failed to create project.");
      }
      setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project?")) {
      try {
        await ApiService.deleteProject(id);
        setProjects(projects.filter(p => p.id !== id));
      } catch (error: any) {
        if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
          StorageService.clearUser();
          onNavigate('/');
          return;
        }
         alert('Failed to delete project');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    onLogout();
  };

  const handleAdminVerify = async (subId: string, status: 'approve' | 'reject') => {
    try {
      const user = StorageService.getUser() as any;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/subscriptions/${subId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.accessToken}`
        },
        body: JSON.stringify({ 
          status, 
          message: status === 'approve' ? 'Payment verified. Plan activated.' : 'Payment verification failed.' 
        })
      });

      if (response.ok) {
        alert(`Subscription ${status}d`);
        loadAdminData();
      }
    } catch (error) {
      alert('Action failed');
    }
  };

  const handleAdminCancelSub = async (subId: string) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;
    try {
      const user = StorageService.getUser() as any;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/subscriptions/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.accessToken}`
        },
        body: JSON.stringify({ subscriptionId: subId })
      });

      if (response.ok) {
        alert('Subscription cancelled');
        loadAdminData();
      }
    } catch (error) {
      alert('Action failed');
    }
  };

  const handleAdminGrantSub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = StorageService.getUser() as any;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/subscriptions/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.accessToken}`
        },
        body: JSON.stringify({ email: grantEmail, durationDays: grantDuration, plan: 'admin_grant' })
      });

      if (response.ok) {
        alert('Subscription granted successfully');
        setGrantEmail('');
        loadAdminData();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to grant subscription');
      }
    } catch (error) {
      alert('Action failed');
    }
  };

  // Filter Projects
  const filteredProjects = projects.filter(p => {
    const query = safeLower(searchQuery);
    const matchesSearch = (p.name || '').toLowerCase().includes(query) || 
                          (p.clientName && (p.clientName || '').toLowerCase().includes(query)) ||
                          (p.websiteUrl && (p.websiteUrl || '').toLowerCase().includes(query));
    if (!matchesSearch) return false;

    if (filterStatus === 'draft') return p.status === ProjectStatus.DRAFT;
    if (filterStatus === 'published') return p.status === ProjectStatus.PUBLISHED;
    if (filterStatus === 'working') return p.mode === 'working';
    return true;
  });

  const publishedCount = projects.filter(p => p.status === ProjectStatus.PUBLISHED).length;
  const workingModeCount = projects.filter(p => p.mode === 'working').length;

  return (
    <div className="min-h-screen bg-[#FAFBFD] text-slate-800 flex flex-col justify-between antialiased">
      {/* Crisp Modern Studio Top Navbar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 sm:gap-3 relative">          
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Presently Logo" className="h-8 w-auto object-contain cursor-pointer" onClick={() => onNavigate('/')} />
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-slate-900 tracking-tight">Presently</span>
              <span className="bg-slate-100 text-slate-700 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border border-slate-200/80">
                Workspace
              </span>
            </div>
          </div>

          {/* Nav Controls */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end shrink-0 sm:ml-auto">
            {!loadingSubscription && !hasActiveSubscription && !pendingVerification && (
              <button 
                onClick={() => setShowSubscriptionModal(true)}
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 px-2 sm:px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold"
              >
                <Crown size={14} className="text-amber-600" />
                <span className="hidden sm:inline">Upgrade Plan</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('/faq')}
              className="flex items-center gap-1.5 bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 px-2 sm:px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold"
              title="View Feature Documentation & FAQ"
            >
              <HelpCircle size={14} className="text-purple-600" />
                <span className="sm:hidden">F&G</span>
                <span className="hidden sm:inline">FAQ & Guide</span>
            </button>
            <button
              onClick={() => setShowGroupManagement(true)}
              className="flex items-center gap-1.5 bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 px-2 sm:px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold"
            >
              <Settings size={14} className="text-slate-500" />Groups({groups.length})
                {/* <span className="sm:hidden">Groups({groups.length})</span>
                <span className="hidden sm:inline">Groups ({groups.length})</span> */}
            </button>
            <button
              onClick={() => onNavigate('/chats')}
              className="flex items-center gap-1.5 bg-blue-50/80 hover:bg-blue-100/80 text-blue-700 border border-blue-200/80 px-2 sm:px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold"
            >
              <MessageCircle size={14} className="text-blue-600" />
                <span className="sm:hidden">Chat</span>
                <span className="hidden sm:inline">Team Chat</span>
            </button>
            <button 
              onClick={handleNewProjectClick}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-2.5 sm:px-4 py-1.5 rounded-xl transition-all shadow-xs hover:shadow text-xs font-semibold shrink-0"
            >
              <Plus size={16} />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Project</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1 text-slate-400 hover:text-red-600 p-2 rounded-xl transition-colors ml-1 absolute top-2 right-3 sm:static"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-16 flex-1 w-full">
        {/* Fresh Modern Light Hero Card (NO dark blue/purple AI blobs) */}
        <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50/40 rounded-3xl p-6 md:p-8 mb-8 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles size={13} className="text-emerald-600" /> Active Delivery Workspace
                </span>
                {hasActiveSubscription && (
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold flex items-center gap-1">
                    <ShieldCheck size={13} className="text-blue-600" /> PRO Account
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                Welcome back, {userName || 'Creator'} 👋
              </h1>
              <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                Paste any live website URL below to instantly capture desktop & mobile viewports, place pin annotations, and track working issues.
              </p>
            </div>

            {/* Instant URL Scanner Box */}
            <form onSubmit={handleQuickScan} className="w-full lg:w-auto bg-white border border-slate-200 shadow-xs p-2 rounded-2xl flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-[260px]">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="url"
                  required
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="https://clientwebsite.com"
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
              >
                <Zap size={14} /> Instant Scan
              </button>
            </form>
          </div>
        </div>

        {/* Admin Dashboard Command Panel */}
        {userEmail === 'divyanshgupta5748@gmail.com' && (
          <div className="mb-8 bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
            <div className="bg-slate-100/90 px-6 py-3.5 border-b border-slate-200/80 flex justify-between items-center">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Crown size={16} className="text-amber-500" /> Admin Command Center
              </h2>
              <div className="flex gap-1.5">
                <button onClick={() => setActiveAdminTab('overview')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${activeAdminTab === 'overview' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/80'}`}>Overview</button>
                <button onClick={() => setActiveAdminTab('pending')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${activeAdminTab === 'pending' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/80'}`}>Pending ({adminPendingSubs.length})</button>
                <button onClick={() => setActiveAdminTab('subscriptions')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${activeAdminTab === 'subscriptions' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/80'}`}>Subscriptions</button>
                <button onClick={() => setActiveAdminTab('grant')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${activeAdminTab === 'grant' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/80'}`}>Grant Plan</button>
              </div>
            </div>

            {activeAdminTab === 'overview' && adminStats && (
              <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                  <div className="flex items-center gap-2 text-slate-700 mb-1"><Users size={18} /> <span className="font-medium text-xs">Total Users</span></div>
                  <p className="text-xl font-bold text-slate-900">{adminStats.totalUsers}</p>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200/60">
                  <div className="flex items-center gap-2 text-emerald-700 mb-1"><Activity size={18} /> <span className="font-medium text-xs">Active Subs</span></div>
                  <p className="text-xl font-bold text-slate-900">{adminStats.activeSubscriptions}</p>
                </div>
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/60">
                  <div className="flex items-center gap-2 text-amber-700 mb-1"><DollarSign size={18} /> <span className="font-medium text-xs">Revenue</span></div>
                  <p className="text-xl font-bold text-slate-900">₹{adminStats.revenue}</p>
                </div>
                <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-200/60">
                  <div className="flex items-center gap-2 text-purple-700 mb-1"><CheckCircle size={18} /> <span className="font-medium text-xs">Pending Manual</span></div>
                  <p className="text-xl font-bold text-slate-900">{adminStats.pendingManual}</p>
                </div>
              </div>
            )}

            {activeAdminTab === 'grant' && (
              <div className="p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm"><Gift size={16} /> Grant Subscription</h3>
                <form onSubmit={handleAdminGrantSub} className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">User Email</label>
                    <input type="email" required value={grantEmail} onChange={e => setGrantEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="user@example.com" />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Days</label>
                    <input type="number" required value={grantDuration} onChange={e => setGrantDuration(parseInt(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-medium text-sm">Grant</button>
                </form>
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {activeAdminTab === 'pending' && (adminPendingSubs.length === 0 ? <p className="p-6 text-slate-500 text-center text-xs">No pending verifications.</p> : adminPendingSubs.map((sub) => (
                <div key={sub._id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="font-medium text-slate-900 text-xs">{sub.userId?.name} ({sub.userId?.email})</p>
                    <p className="text-[11px] text-slate-500">Plan: {sub.plan} | Amount: {sub.currency} {sub.amount}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAdminVerify(sub._id, 'approve')}
                      className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-medium hover:bg-emerald-200"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button 
                      onClick={() => handleAdminVerify(sub._id, 'reject')}
                      className="flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-medium hover:bg-red-200"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              )))}
              {activeAdminTab === 'subscriptions' && (adminAllSubs.length === 0 ? <p className="p-6 text-slate-500 text-center text-xs">No subscriptions found.</p> : adminAllSubs.map((sub) => (
                <div key={sub._id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-900 text-xs">{sub.userId?.name} ({sub.userId?.email})</p>
                    <p className="text-[11px] text-slate-500">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${sub.status === 'active' ? 'bg-emerald-500' : sub.status === 'pending_verification' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                      {sub.status.toUpperCase()} | {sub.plan} | {sub.paymentMethod}
                    </p>
                  </div>
                  {sub.status === 'active' && (
                    <button onClick={() => handleAdminCancelSub(sub._id)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg text-xs font-medium flex items-center gap-1">
                      <Ban size={14} /> Cancel
                    </button>
                  )}
                </div>
              )))}
            </div>
          </div>
        )}

        {/* Toolbar: Search + Non-Repetitive Segmented Filter Track */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs mb-8 flex flex-col md:flex-row justify-between items-center gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by project or client name..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
            />
          </div>

          {/* Segmented Filter Control */}
          <div className="bg-slate-100/80 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60 w-full md:w-auto overflow-x-auto">
            {[
              { id: 'all', label: 'All Projects', count: projects.length },
              { id: 'draft', label: 'Drafts', count: projects.filter(p => p.status === ProjectStatus.DRAFT).length },
              { id: 'published', label: 'Published', count: publishedCount },
              { id: 'working', label: 'Working Mode', count: workingModeCount }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  filterStatus === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${filterStatus === tab.id ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/60 text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Projects Grid */}
        {projectsLoading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 p-8 shadow-2xs mb-12" role="status" aria-busy={true}>
            <Loader2 className="mx-auto text-slate-400 animate-spin" size={28} />
            <h3 className="text-base font-bold text-slate-900 mt-4">Loading...</h3>
            <p className="text-slate-500 text-xs mt-2">This may take a moment</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 border-dashed p-8 shadow-2xs mb-12">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-blue-100">
              <FolderGit2 size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {searchQuery ? 'No matching projects' : 'No projects created yet'}
            </h3>
            <p className="text-slate-500 text-xs mb-5 max-w-sm mx-auto">
              {searchQuery ? 'Try clearing your search term or selecting a different filter.' : 'Capture your first website URL to annotate, collaborate, and share with clients.'}
            </p>
            <button
              onClick={handleNewProjectClick}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5 text-xs"
            >
              <Plus size={15} /> Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {filteredProjects.map(project => {
              const coverImage = project.coverImageUrl;
              const pageCount = project.pageCount;
              const isWorking = project.mode === 'working';
              const isPublished = project.status === ProjectStatus.PUBLISHED;

              return (
                <div 
                  key={project.id} 
                  onClick={() => onNavigate(`/project/${project.id}`)}
                  className="group bg-white rounded-2xl border border-slate-200/80 hover:border-blue-400/80 shadow-2xs hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full"
                >
                  {/* Image Preview Banner */}
                  <div className="h-48 bg-slate-100/80 overflow-hidden relative border-b border-slate-100">
                    {coverImage ? (
                      <img 
                        src={coverImage} 
                        alt={project.name} 
                        className="w-full h-full object-cover object-top opacity-95 group-hover:scale-105 transition-transform duration-500" 
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium">
                        No Preview Image
                      </div>
                    )}
                    
                    {/* Floating Badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md font-mono border shadow-2xs ${
                        isWorking ? 'bg-indigo-50/90 text-indigo-700 border-indigo-200' : 'bg-white/90 text-slate-700 border-slate-200/80'
                      }`}>
                        {isWorking ? '⚡ Working' : '▶ Present'}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {isPublished ? (
                        <span className="bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs uppercase tracking-wider font-mono">
                          Published
                        </span>
                      ) : (
                        <span className="bg-slate-800 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs uppercase tracking-wider font-mono">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 mb-1">
                        {project.name}
                      </h3>
                      <p className="text-xs font-medium text-slate-500 mb-4 flex items-center gap-1.5">
                        <Globe size={13} className="text-slate-400" />
                        {project.clientName ? `Client: ${project.clientName}` : project.websiteUrl || 'Direct Upload'}
                      </p>
                    </div>

                    <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100/70 px-2.5 py-1 rounded-md">
                        <Layers size={13} className="text-slate-400" /> {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}
                      </div>

                      <div className="flex items-center gap-1">
                        {isPublished && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(`/live/${project.id}`);
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Open Public Live Preview"
                          >
                            <ExternalLink size={15} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => handleDelete(project.id, e)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 size={15} />
                        </button>
                        <button className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors font-semibold text-xs flex items-center gap-1 ml-1">
                          Edit <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Extended Content Below Projects */}
        <div className="space-y-8 pt-6 border-t border-slate-200/80">
          {/* Quick Start Feature Guides */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" /> Workspace Highlights & Best Practices
              </h2>
              <button onClick={() => onNavigate('/support')} className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                Help Docs <ArrowRight size={12} />
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3 border border-blue-100">
                  <Globe size={20} />
                </div>
                <h4 className="font-bold text-slate-900 text-xs md:text-sm mb-1">Automated Viewport Captures</h4>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Enter any live URL to auto-render both full-length desktop and mobile viewports automatically.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-3 border border-indigo-100">
                  <Wrench size={20} />
                </div>
                <h4 className="font-bold text-slate-900 text-xs md:text-sm mb-1">Working Mode Issue Tracker</h4>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Convert annotation pins into assigned ticket issues with status tracking, history, and threaded chat.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3 border border-emerald-100">
                  <ExternalLink size={20} />
                </div>
                <h4 className="font-bold text-slate-900 text-xs md:text-sm mb-1">Shareable Client Delivery</h4>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Publish immutable snapshot links (`/live/:id`) allowing clients to review and sign off without logging in.
                </p>
              </div>
            </div>
          </div>

          {/* Team Collaboration Ribbon */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center border border-slate-200/80 flex-shrink-0">
                <MessageSquare size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-xs md:text-sm mb-0.5">Need help or team collaboration?</h4>
                <p className="text-slate-500 text-xs">Access team channels, direct messages, or reach developer support anytime.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('/chats')}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
              >
                <MessageCircle size={14} /> Open Team Chat
              </button>
              <button
                onClick={() => onNavigate('/support')}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <HelpCircle size={14} /> Support & Status
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Production Dashboard Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-6 px-4 sm:px-6 text-slate-400 text-xs mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-medium text-slate-500">
            © {new Date().getFullYear()} Presently Inc. • Enterprise Workspace Platform
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-medium text-slate-500">
            <button onClick={() => onNavigate('/support')} className="hover:text-slate-900 transition-colors">
              Support Hub & Status
            </button>
            <span className="text-slate-300">•</span>
            <button onClick={() => onNavigate('/privacy')} className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </button>
            <span className="text-slate-300">•</span>
            <button onClick={() => onNavigate('/terms')} className="hover:text-slate-900 transition-colors">
              Terms of Service
            </button>
            <span className="text-slate-300">•</span>
            <button onClick={() => onNavigate('/cookies')} className="hover:text-slate-900 transition-colors">
              Cookie Policy
            </button>
            <span className="text-slate-300">•</span>
            <button onClick={() => onNavigate('/refund-policy')} className="hover:text-slate-900 transition-colors">
              Refund Policy
            </button>
          </div>
        </div>
      </footer>

      {/* Chrome Extension Requirement Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md border border-slate-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-600 border border-blue-100 shadow-sm">
                <Globe size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Install Chrome Extension</h2>
              <p className="text-slate-600 text-xs mb-5 leading-relaxed">
                To capture real-time, unblocked full-page website screenshots directly in your browser, please ensure the <strong className="text-slate-900 font-semibold">Presently Live Capture Chrome Extension</strong> is installed and enabled.
              </p>

              <div className="flex flex-col gap-2 w-full">
                <button 
                  onClick={handleGrantPermission}
                  disabled={permissionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold transition-all shadow-xs flex items-center justify-center gap-2 text-xs active:scale-98"
                >
                  {permissionLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={14} />}
                  Enable Live Capture & Continue
                </button>
                <button 
                  onClick={() => setShowPermissionModal(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-medium text-xs transition-colors"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200">
            <h2 className="text-xl font-bold mb-6 text-slate-900">Create New Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Project Name</label>
                <input
                  required
                  type="text"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none text-xs"
                  placeholder="e.g. E-Commerce Redesign V2"
                  value={newProjectData.name}
                  onChange={e => setNewProjectData({...newProjectData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Client Name (Optional)</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none text-xs"
                  placeholder="e.g. Acme Corp"
                  value={newProjectData.clientName}
                  onChange={e => setNewProjectData({...newProjectData, clientName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Website URL</label>
                <input
                  required
                  type="url"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none text-xs"
                  placeholder="https://example.com"
                  value={newProjectData.websiteUrl}
                  onChange={e => setNewProjectData({...newProjectData, websiteUrl: e.target.value})}
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-600" /> Assign to Group (Optional)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none text-xs bg-white"
                  value={newProjectData.groupId}
                  onChange={e => setNewProjectData({...newProjectData, groupId: e.target.value})}
                >
                  <option value="none">— None —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.type === 'team' ? '👥' : '🏢'} {g.name} ({g.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  <Wrench className="w-3.5 h-3.5 text-slate-600" /> Project Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${newProjectData.mode === 'present' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" className="sr-only" checked={newProjectData.mode === 'present'} onChange={() => setNewProjectData({...newProjectData, mode: 'present'})} />
                    <Play className={`w-4 h-4 mt-0.5 ${newProjectData.mode === 'present' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <div className={`font-semibold text-xs ${newProjectData.mode === 'present' ? 'text-blue-900' : 'text-slate-700'}`}>Present Mode</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Classic client presentation & annotation notes.</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${newProjectData.mode === 'working' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" className="sr-only" checked={newProjectData.mode === 'working'} onChange={() => setNewProjectData({...newProjectData, mode: 'working'})} />
                    <Wrench className={`w-4 h-4 mt-0.5 ${newProjectData.mode === 'working' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <div className={`font-semibold text-xs ${newProjectData.mode === 'working' ? 'text-blue-900' : 'text-slate-700'}`}>Working Mode</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Full issue ticket tracker with status & assignees.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-semibold text-xs disabled:opacity-50 transition-all shadow-xs"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Scanning pages...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Management Modal */}
      <GroupManagementModal
        isOpen={showGroupManagement}
        onClose={() => setShowGroupManagement(false)}
        onGroupChange={loadGroups}
        onNavigate={onNavigate}
      />

      {/* Pending Verification Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md text-center border border-slate-200">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-800 border border-slate-200">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Verification in Progress</h2>
            <p className="text-slate-600 text-xs mb-6 leading-relaxed">
              We are currently reviewing your payment transaction. Once confirmed, your subscription will be activated automatically.
            </p>
            <button 
              onClick={() => setShowPendingModal(false)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      {showSubscriptionModal && (
        <SubscriptionModal
          onClose={() => setShowSubscriptionModal(false)}
          onSuccess={(isPending) => {
            setShowSubscriptionModal(false);
            checkSubscription();
            if (isPending) {
              setShowPendingModal(true);
            } else {
              setIsCreating(true);
            }
          }}
          userEmail={userEmail}
          title={subscriptionModalMode === 'expired' ? 'Subscription Expired' : subscriptionModalMode === 'subscribe' ? 'Subscription Required' : undefined}
          message={subscriptionModalMode === 'expired' ? 'Your subscription is expired. Buy another plan to continue working on project.' : subscriptionModalMode === 'subscribe' ? 'You are not subscribed. Choose a plan to create project.' : undefined}
        />
      )}

      {/* Live In-Browser Screenshot Scanner Modal */}
      <LiveCaptureModal
        isOpen={liveCaptureModalConfig.isOpen}
        url={liveCaptureModalConfig.url}
        device={liveCaptureModalConfig.device}
        onClose={() => setLiveCaptureModalConfig({ isOpen: false, url: '', device: 'desktop' })}
        onCaptureComplete={handleLiveCaptureComplete}
        isLocalComputeEnabled={isLocalComputeEnabled}
      />
    </div>
  );
};