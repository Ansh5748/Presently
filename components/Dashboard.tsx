import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { fetchScreenshotAsBase64 } from '../services/screenshotService';
import { SubscriptionModal } from './SubscriptionModal';
import { Project, ProjectStatus } from '../types';
import logoImg from '../src/assets/presently_logo.png'; 
import { Plus, ExternalLink, Trash2, Loader2, ArrowRight, LogOut, Crown, Laptop } from 'lucide-react';

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
  
  // Permission State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isLocalComputeEnabled, setIsLocalComputeEnabled] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);

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

  const checkSubscription = async () => {
    try {
      const status = await ApiService.getSubscriptionStatus();
      setHasActiveSubscription(status.hasActiveSubscription);
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
    if (SPECIAL_EMAILS.includes(userEmail.toLowerCase()) || isLocalComputeEnabled) {
      setIsCreating(true);
    } else {
      setShowPermissionModal(true);
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-10 gap-4 md:gap-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
          <img src={logoImg} alt="Presently Logo" className="h-12 w-auto object-contain" />
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-1">Welcome, <span className="font-medium text-slate-600">{userName || 'Guest'}</span></p>
          {!loadingSubscription && !hasActiveSubscription && (
            <p className="text-amber-600 text-sm mt-1 flex items-center gap-1">
              <Crown size={14} />
              Subscribe to create unlimited projects
            </p>
          )}
        </div>
        </div>
        <div className="flex flex-row items-center gap-3 md:gap-4 w-full md:w-auto">
          {!loadingSubscription && !hasActiveSubscription && (
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
            onClick={onLogout}
            className="flex items-center gap-2 text-slate-500 hover:text-red-600 px-3 py-2.5 rounded-lg transition-all text-sm font-medium sm:ml-0"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
          </div>
        </div>
      </div>

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

      {/* Subscription Modal */}
      {showSubscriptionModal && (
        <SubscriptionModal
          onClose={() => setShowSubscriptionModal(false)}
          onSuccess={() => {
            setShowSubscriptionModal(false);
            checkSubscription();
            setIsCreating(true);
          }}
          userEmail={userEmail}
        />
      )}
    </div>
  );
};
