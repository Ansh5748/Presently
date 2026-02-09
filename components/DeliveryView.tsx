import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { Project, Pin, ProjectPage } from '../types';
import { Loader2, Layout, MessageSquare, Monitor, Smartphone } from 'lucide-react';

interface DeliveryViewProps {
  projectId: string;
  isLiveView?: boolean;
  onNavigate?: (path: string) => void;
}

export const DeliveryView: React.FC<DeliveryViewProps> = ({ projectId, isLiveView = false, onNavigate }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProject();
  }, [projectId, isLiveView]);

  const loadProject = async () => {
    try {
      const view = isLiveView ? 'live' : 'draft';
      const projectData = await ApiService.getProject(projectId, view);
      setProject(projectData);
      
      if (projectData.pages.length > 0) {
        setActivePageId(projectData.pages[0].id);
      }

      const pinsData = await ApiService.getPins(projectId, view);
      setPins(pinsData);
    } catch (error: any) {
      if (!isLiveView && onNavigate && (error.status === 403 || (error.response && error.response.status === 403))) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
       alert('Project not found');
    } finally {
      setLoading(false);
    }
  };

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

    if (imageContainerRef.current) {
      const container = imageContainerRef.current;
      const image = container.querySelector('img');
      if (image) {
        const imageTotalHeight = image.offsetHeight;
        const pinYPosition = (pin.y / 100) * imageTotalHeight;
        const scrollTo = pinYPosition - (container.offsetHeight / 2);
        container.scrollTo({ top: scrollTo, behavior: 'smooth' });
      }
    }
  };

  const activePage = project?.pages.find(p => p.id === activePageId);
  const activePins = pins.filter(p => p.pageId === activePageId && (p.device === viewMode || (!p.device && viewMode === 'desktop')));

  const pageSlug = (activePage as any)?.originalUrl?.toLowerCase().replace(/\s/g, '-') || "";
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      {/* Navigation / Brand Bar (Minimal) */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center shadow-sm flex-none">
        <div className="flex items-center gap-3">
          <div className="h-6 w-px bg-slate-200"></div>
          <span className="font-semibold text-slate-900">{project.name}</span>
        </div>
        <div className="text-sm text-slate-500 text-right">
          Prepared for <span className="font-semibold text-slate-900">{project.clientName || 'Client'}</span>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg ml-4">
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
      </nav>

      <div className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-8 p-4 md:p-6 lg:p-10">
        
        {/* Left Column: Context & List */}
        <div className="lg:w-1/3 space-y-6 flex flex-col h-full lg:max-h-[calc(100vh-120px)] lg:sticky top-24">
          
          {/* Screens Selector */}
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
                  {page.name}
                </button>
              ))}
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-slate-900">{activePage?.name || 'Overview'}</h2>
              {!isLiveView && (
                isEditingDetails ? (
                  <button onClick={handleSubmitDetails} className="text-sm font-medium bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">
                    Submit
                  </button>
                ) : (
                  <button onClick={handleEnterEditMode} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    Edit
                  </button>
                )
              )}
            </div>
            {isLiveView || !isEditingDetails ? (
              <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                {(activePage as any)?.details !== undefined && (activePage as any)?.details !== null 
                  ? (activePage as any).details 
                  : (isLiveView ? "No implementation details provided." : "Click 'Edit' to add implementation details.")}
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Implementation Details</label>
                <textarea
                  value={(activePage as any)?.details || `Review the implementation details for this screen below.\n\n- Mobile Responsive\n- Accessibility Checked`}
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

          {/* Notes List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0 max-h-[250px] lg:max-h-none" style={{ minHeight: '200px' }}>
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex-none">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare size={16} />
                Notes for this screen
              </h3>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto">
              {activePins.length === 0 && (
                <div className="p-8 text-slate-400 text-center text-sm">No notes added for this screen.</div>
              )}
              {activePins.map(pin => (
                <div 
                  key={pin.id} 
                  onClick={() => handleNoteClick(pin)}
                  className={`p-5 cursor-pointer transition-colors hover:bg-slate-50 ${activePinId === pin.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`
                      flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                      ${activePinId === pin.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}
                    `}>
                      {pin.number}
                    </span>
                    <div>
                      <h4 className={`font-semibold mb-1 ${activePinId === pin.id ? 'text-blue-900' : 'text-slate-800'}`}>{pin.title}</h4>
                      <p className="text-slate-600 text-sm leading-relaxed">{pin.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Visuals */}
        <div className="lg:w-2/3">
          <div className={`bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative transition-all duration-300 mx-auto ${viewMode === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
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
            
            {/* This container will hold the image and allow vertical scrolling */}
            <div ref={imageContainerRef} className="relative max-h-[80vh] overflow-y-auto">
              {activePage ? (
                <div className="relative">
                  <img 
                    src={viewMode === 'mobile' ? ((activePage as any).mobileImageUrl || activePage.imageUrl) : activePage.imageUrl} 
                    alt={activePage.name} 
                    className="w-full h-auto block" 
                  />

                  {/* Pins Overlay */}
                  {activePins.map(pin => (
                    <button
                      key={pin.id}
                      onClick={() => setActivePinId(activePinId === pin.id ? null : pin.id)}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 focus:outline-none group"
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    >
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-xl transition-all duration-300 border-2 border-white
                        ${activePinId === pin.id ? 'bg-blue-600 scale-125 ring-4 ring-blue-600/30' : 'bg-slate-900 hover:scale-110 hover:bg-slate-800'}
                      `}>
                        {pin.number}
                      </div>
                      
                      {/* Tooltip on Hover */}
                      <div className={`
                        absolute left-1/2 -translate-x-1/2 mt-3 w-64 bg-slate-900 text-white text-sm p-4 rounded-xl shadow-2xl z-20 pointer-events-none transition-all duration-200 origin-top
                        ${activePinId === pin.id ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2'}
                      `}>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                        <span className="font-bold block mb-1 text-base">{pin.title}</span>
                        <span className="text-slate-300 font-light leading-relaxed">{pin.description}</span>
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
    </div>
  );
};