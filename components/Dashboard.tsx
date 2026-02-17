import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { fetchScreenshotAsBase64 } from '../services/screenshotService';
import { SubscriptionModal } from './SubscriptionModal';
import { Project, ProjectStatus } from '../types';
import logoImg from '../src/assets/presently_logo.png'; 
import adminImg from '../src/assets/admin.png';
import { Plus, ExternalLink, Trash2, Loader2, ArrowRight, LogOut, Crown, Laptop, CheckCircle, XCircle, Info, FileText, Mail, Users, DollarSign, Activity, Ban, Gift } from 'lucide-react';

const SPECIAL_EMAILS = [
  'divyanshgupta5748@gmail.com',
  'divyanshgupta4949@gmail.com'
];

interface DashboardProps {
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: '', websiteUrl: '', clientName: '' });
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
  
  // Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isLocalComputeEnabled, setIsLocalComputeEnabled] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);

  // Admin State
  const [adminPendingSubs, setAdminPendingSubs] = useState<any[]>([]);
  const [showFooterModal, setShowFooterModal] = useState<'about' | 'terms' | null>(null);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminAllSubs, setAdminAllSubs] = useState<any[]>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantDuration, setGrantDuration] = useState(30);
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'pending' | 'subscriptions' | 'grant'>('overview');

  useEffect(() => {
    const user = StorageService.getUser() as any;
    if (user) {
      setUserName(user.name);
      setUserEmail(user.email);
      setIsLocalComputeEnabled(user.isLocalComputeEnabled || false);
      loadProjects();
      checkSubscription();
      
      if (!user.isLocalComputeEnabled && !SPECIAL_EMAILS.includes(user.email.toLowerCase())) {
        setShowPermissionModal(true);
      }

      if (user.email === 'divyanshgupta5748@gmail.com') {
        loadAdminData();
      }
    } else {
      onNavigate('/login');
    }
  }, []);

  const loadProjects = async () => {
    try {
      const projectsData = await ApiService.getProjects();
      setProjects(projectsData);
    } catch (error) {
      if ((error as any).status === 401 || (error as any).status === 403 || ((error as any).response && ((error as any).response.status === 401 || (error as any).response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      console.error('[Dashboard] Failed to load projects:', error);
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
        onNavigate('/login');
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

  const handleNewProjectClick = () => {
    if (SPECIAL_EMAILS.includes(userEmail.toLowerCase())) {
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = StorageService.getUser();
      if (!user) {
        throw new Error("User not authenticated.");
      }

      // Custom fetch to include useLocal param
      const useLocal = isLocalComputeEnabled ? 'true' : 'false';
      const response = await fetch(`${import.meta.env.VITE_API_URL}/take?url=${encodeURIComponent(newProjectData.websiteUrl)}&type=desktop&t=${Date.now()}&useLocal=${useLocal}`);
      if (!response.ok) throw new Error('Failed to capture screenshot');
      const blob = await response.blob();
      const screenshotBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const payload: any = {
        ...newProjectData,
        initialPageUrl: screenshotBase64,
      };

      const newProject = await ApiService.createProject(payload);

      setProjects([newProject, ...projects]);
      setIsCreating(false);
      setNewProjectData({ name: '', websiteUrl: '', clientName: '' });
      
      onNavigate(`/project/${newProject.id}`);
    } catch (error: any) {
      if (error.status === 401 || error.status === 403 || (error.response && (error.response.status === 401 || error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      if (error.message === 'SUBSCRIPTION_REQUIRED') {
        setIsCreating(false);
        setShowSubscriptionModal(true);
      } else {
        if (error.message === "User not authenticated.") onNavigate('/login');
        alert("Failed to create project. Make sure the screenshot service is running and the URL is valid.");
      }
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
          onNavigate('/login');
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
    StorageService.clearUser();
    onLogout();
    onNavigate('/login');
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-10 gap-4 md:gap-0">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-1">
          <img src={logoImg} alt="Presently Logo" className="h-12 w-auto object-contain" />
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-1">Welcome, <span className="font-medium text-slate-600">{userName || 'Guest'}</span></p>
          {!loadingSubscription && !hasActiveSubscription && !pendingVerification && (
            <p className="w-full sm:w-auto text-amber-600 text-sm mt-1 flex items-center gap-1">
              <Crown size={14} />
              Subscribe to create unlimited projects
            </p>
          )}
          {pendingVerification && <p className="text-blue-600 text-sm mt-1">Payment verification pending...</p>}
        </div>
        </div>
        <div className="flex flex-row items-center gap-3 md:gap-4 w-full md:w-auto">
          {!loadingSubscription && !hasActiveSubscription && !pendingVerification && (
            <button 
              onClick={() => setShowSubscriptionModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium sm:ml-0"
            >
              <Crown size={16} />
              Subscribe
            </button>
          )}
          <div className='flex flex-row ml-auto sm:ml-0'>
          <button 
            onClick={handleNewProjectClick}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg transition-all shadow-sm font-small"
          >
            <Plus size={18} />
            New Project
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-500 hover:text-red-600 px-3 py-2.5 rounded-lg transition-all text-sm font-medium sm:ml-0"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
          </div>
        </div>
      </div>

      {/* Admin Panel */}
      {userEmail === 'divyanshgupta5748@gmail.com' && (
        <div className="mb-12 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Crown size={18} className="text-amber-500" />
                Admin Dashboard
              </h2>
              <div className="flex gap-2">
                <button onClick={() => setActiveAdminTab('overview')} className={`px-3 py-1 rounded-md text-sm font-medium ${activeAdminTab === 'overview' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}>Overview</button>
                <button onClick={() => setActiveAdminTab('pending')} className={`px-3 py-1 rounded-md text-sm font-medium ${activeAdminTab === 'pending' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}>Pending ({adminPendingSubs.length})</button>
                <button onClick={() => setActiveAdminTab('subscriptions')} className={`px-3 py-1 rounded-md text-sm font-medium ${activeAdminTab === 'subscriptions' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}>Subscriptions</button>
                <button onClick={() => setActiveAdminTab('grant')} className={`px-3 py-1 rounded-md text-sm font-medium ${activeAdminTab === 'grant' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}>Grant Plan</button>
              </div>
            </div>
          </div>

          {activeAdminTab === 'overview' && adminStats && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 text-blue-600 mb-2"><Users size={20} /> <span className="font-medium">Total Users</span></div>
                <p className="text-2xl font-bold text-slate-900">{adminStats.totalUsers}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                <div className="flex items-center gap-2 text-green-600 mb-2"><Activity size={20} /> <span className="font-medium">Active Subs</span></div>
                <p className="text-2xl font-bold text-slate-900">{adminStats.activeSubscriptions}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <div className="flex items-center gap-2 text-amber-600 mb-2"><DollarSign size={20} /> <span className="font-medium">Est. Revenue (₹)</span></div>
                <p className="text-2xl font-bold text-slate-900">₹{adminStats.revenue}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <div className="flex items-center gap-2 text-purple-600 mb-2"><CheckCircle size={20} /> <span className="font-medium">Pending Manual</span></div>
                <p className="text-2xl font-bold text-slate-900">{adminStats.pendingManual}</p>
              </div>
            </div>
          )}

          {activeAdminTab === 'grant' && (
            <div className="p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Gift size={18} /> Grant Subscription</h3>
              <form onSubmit={handleAdminGrantSub} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">User Email</label>
                  <input type="email" required value={grantEmail} onChange={e => setGrantEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="user@example.com" />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Days</label>
                  <input type="number" required value={grantDuration} onChange={e => setGrantDuration(parseInt(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">Grant</button>
              </form>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {activeAdminTab === 'pending' && (adminPendingSubs.length === 0 ? <p className="p-6 text-slate-500 text-center">No pending verifications.</p> : adminPendingSubs.map((sub) => (
              <div key={sub._id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <p className="font-medium text-slate-900">{sub.userId?.name} ({sub.userId?.email})</p>
                  <p className="text-sm text-slate-500">Plan: {sub.plan} | Amount: {sub.currency} {sub.amount}</p>
                  <p className="text-xs text-slate-400 font-mono mt-1">Order: {sub.orderId} | Payment: {sub.paymentId}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAdminVerify(sub._id, 'approve')}
                    className="flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-200"
                  >
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button 
                    onClick={() => handleAdminVerify(sub._id, 'reject')}
                    className="flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-200"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </div>
            )))}
            {activeAdminTab === 'subscriptions' && (adminAllSubs.length === 0 ? <p className="p-6 text-slate-500 text-center">No subscriptions found.</p> : adminAllSubs.map((sub) => (
              <div key={sub._id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">{sub.userId?.name} ({sub.userId?.email})</p>
                  <p className="text-sm text-slate-500">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${sub.status === 'active' ? 'bg-green-500' : sub.status === 'pending_verification' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                    {sub.status.toUpperCase()} | {sub.plan} | {sub.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-1">Expires: {new Date(sub.expiresAt).toLocaleDateString()}</p>
                </div>
                {sub.status === 'active' && (
                  <button onClick={() => handleAdminCancelSub(sub._id)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg text-sm font-medium flex items-center gap-1">
                    <Ban size={14} /> Cancel
                  </button>
                )}
              </div>
            )))}
          </div>
        </div>
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

      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md animate-fade-in">
            <h2 className="text-xl font-bold mb-6 text-slate-900">Create New Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. E-Commerce Redesign"
                  value={newProjectData.name}
                  onChange={e => setNewProjectData({...newProjectData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client Name (Optional)</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Acme Corp"
                  value={newProjectData.clientName}
                  onChange={e => setNewProjectData({...newProjectData, clientName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Website URL</label>
                <input 
                  required
                  type="url" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="https://example.com"
                  value={newProjectData.websiteUrl}
                  onChange={e => setNewProjectData({...newProjectData, websiteUrl: e.target.value})}
                />
                {/* <p className="text-xs text-slate-500 mt-2">
                  System will capture Home, About, and Contact pages automatically.
                </p> */}
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Scanning pages...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 border-dashed">
          <p className="text-slate-500 mb-4">No projects yet. Start by creating one.</p>
          <button onClick={() => setIsCreating(true)} className="text-blue-600 font-medium hover:underline">
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => {
            const coverImage = project.pages?.[0]?.imageUrl;
            const pageCount = project.pages?.length || 0;
            
            return (
              <div 
                key={project.id} 
                onClick={() => onNavigate(`/project/${project.id}`)}
                className="group bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer overflow-hidden flex flex-col h-full"
              >
                <div className="h-48 bg-slate-100 overflow-hidden relative">
                  {coverImage ? (
                    <img src={coverImage} alt={project.name} className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No Image</div>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                     <span className="bg-slate-900/70 text-white text-xs font-bold px-2 py-1 rounded-full backdrop-blur-sm">
                       {pageCount} Pages
                     </span>
                     {project.status === ProjectStatus.PUBLISHED && (
                       <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full border border-green-200">
                         PUBLISHED
                       </span>
                     )}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-900 line-clamp-1">{project.name}</h3>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">{project.clientName || 'No Client Specified'}</p>
                  <div className="mt-auto flex justify-between items-center border-t border-slate-100 pt-4">
                    <span className="text-xs text-slate-400">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => handleDelete(project.id, e)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-200 pt-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
          <div>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
              <Info size={18} /> About Us
            </h3>
            <button onClick={() => setShowFooterModal('about')} className="text-slate-600 hover:text-blue-600 text-sm">
              Our Mission & Team
            </button>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
              <FileText size={18} /> Legal
            </h3>
            <button onClick={() => setShowFooterModal('terms')} className="text-slate-600 hover:text-blue-600 text-sm">
              Terms & Conditions
            </button>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-center md:justify-start gap-2">
              <Mail size={18} /> Contact
            </h3>
            <a href="mailto:dishlook.contact@gmail.com" className="text-slate-600 hover:text-blue-600 text-sm">
              Contact Support
            </a>
          </div>
        </div>
      </footer>

      {/* Footer Modals */}
      {showFooterModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95">
            <button 
              onClick={() => setShowFooterModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <Trash2 size={20} className="rotate-45" /> {/* Using Trash icon rotated as close for style or import X */}
            </button>

            {showFooterModal === 'about' && (
              <div className="text-center">
                <img src={adminImg} alt="Divyansh Gupta" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-slate-100" />
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Divyansh Gupta</h2>
                <p className="text-blue-600 font-medium mb-4">Founder & CEO</p>
                <p className="text-slate-600 leading-relaxed text-sm">
                  Presently is the ultimate collaboration tool designed for freelancers, agencies, and SaaS companies.
                </p>
                
                <div className="text-left mt-6 space-y-4 text-sm text-slate-600 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  <h3 className="font-bold text-slate-900 border-b pb-2">Who uses Presently?</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-blue-600 mb-1">For Creative & Tech Teams</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Freelancers:</strong> Share live previews and get sign-off without meetings.</li>
                        <li><strong>Agencies:</strong> Manage 50+ client projects and streamline QA.</li>
                        <li><strong>SaaS Builders:</strong> Collect visual bug reports from beta testers.</li>
                        <li><strong>Developers:</strong> Test responsiveness across mobile/desktop views.</li>
                        <li><strong>QA Engineers:</strong> Log visual defects with exact coordinates.</li>
                        <li><strong>Product Managers:</strong> Visualize roadmap changes on existing pages.</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-purple-600 mb-1">For Business & Marketing</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>Marketers:</strong> Audit landing pages and ad placements.</li>
                        <li><strong>SEO Specialists:</strong> Highlight on-page optimization opportunities.</li>
                        <li><strong>Copywriters:</strong> Review text in context of the final design.</li>
                        <li><strong>Sales Teams:</strong> Annotate prospect websites for personalized demos.</li>
                        <li><strong>Recruiters:</strong> Review and annotate candidate portfolios.</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-amber-600 mb-1">For Specialized Sectors</h4>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><strong>E-commerce:</strong> Audit checkout flows and product displays.</li>
                        <li><strong>Legal/Compliance:</strong> Archive and verify ToS/Privacy pages.</li>
                        <li><strong>Education:</strong> Grade web design assignments visually.</li>
                        <li><strong>Real Estate:</strong> Annotate property listings for updates.</li>
                        <li><strong>Non-Profits:</strong> Optimize donor journeys and campaign pages.</li>
                        <li><strong>Healthcare:</strong> Review patient portal usability and compliance.</li>
                        <li><strong>Finance:</strong> Audit banking dashboards for clarity.</li>
                        <li><strong>Travel:</strong> Verify booking engines and itinerary displays.</li>
                        <li><strong>Startups:</strong> Share visual progress updates with investors.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showFooterModal === 'terms' && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">Terms & Conditions</h2>
                <div className="space-y-4 text-slate-600 text-sm max-h-[60vh] overflow-y-auto pr-2">
                  <p><strong>1. Services:</strong> Presently provides screenshot and annotation tools for web projects.</p>
                  <p><strong>2. No Refunds:</strong> All payments are final. We do not offer refunds for subscription plans once activated. Please verify your needs before subscribing.</p>
                  <p><strong>3. Usage:</strong> You agree to use the platform for lawful purposes only. We reserve the right to terminate accounts engaging in malicious activity.</p>
                  <p><strong>4. Availability:</strong> While we strive for 99.9% uptime, services are provided "as is" without warranties of any kind.</p>
                </div>
              </div>
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
    </div>
  );
};
