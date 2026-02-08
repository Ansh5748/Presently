import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { ApiService } from '../services/apiService';
import { fetchScreenshotAsBase64 } from '../services/screenshotService';
import { refineText } from '../services/geminiService';
import { Project, Pin, ProjectStatus, ProjectPage } from '../types';
import { ArrowLeft, Share2, Sparkles, X, MapPin, Eye, Loader2, Image as ImageIcon, Trash2, Layout, Link as LinkIcon, Pencil, Monitor, Smartphone, ChevronDown, ChevronUp } from 'lucide-react';

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
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
    } catch (error) {
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

    setTempPin({ x, y, title: '', description: '' });
    setIsEditingPin(true);
  };

  const handleSavePin = async () => {
    if (!project || !tempPin || !activePageId || !tempPin.title) return;

    try {
      if (selectedPinId) {
        await ApiService.updatePin(selectedPinId, { 
          title: tempPin.title, 
          description: tempPin.description 
        });
      } else {
        await ApiService.createPin(project.id, {
          pageId: activePageId,
          x: tempPin.x!,
          y: tempPin.y!,
          title: tempPin.title!,
          description: tempPin.description || '',
          device: viewMode
        });
      }

      const updatedPins = await ApiService.getPins(project.id);
      setPins(updatedPins);
      setTempPin(null);
      setSelectedPinId(null);
      setIsEditingPin(false);
    } catch (error: any) {
      if (error.status === 403 || (error.response && error.response.status === 403)) {
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
      setSelectedPinId(null);
      setTempPin(null);
      setIsEditingPin(false);
    } catch (error: any) {
      if (error.status === 403 || (error.response && error.response.status === 403)) {
        StorageService.clearUser();
        onNavigate('/login');
        return;
      }
      alert('Failed to delete pin');
    }
  };

  const handleEditPin = (pin: Pin, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPinId(pin.id);
    setTempPin({
      x: pin.x,
      y: pin.y,
      title: pin.title,
      description: pin.description
    });
    setIsEditingPin(true);
  };

  const handleRefineWithAI = async () => {
    if (!tempPin?.description) return;
    setAiLoading(true);
    try {
      const polished = await refineText(tempPin.description);
      setTempPin({ ...tempPin, description: polished });
    } catch (error) {
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
      if (error.status === 403 || (error.response && error.response.status === 403)) {
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
    // Add timestamp to prevent caching (Fix for 304 Not Modified issues)
    const response = await fetch(`${import.meta.env.VITE_API_URL}/take?url=${encodeURIComponent(url)}&type=${device}&t=${Date.now()}`);
    if (!response.ok) {
      throw new Error('Failed to capture screenshot');
    }
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const handleAddFromUrl = async () => {
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
      if (error.status === 403 || (error.response && error.response.status === 403)) {
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
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;
          const name = file.name.split('.')[0].replace(/-|_/g, ' ');
          
          const newPage = await ApiService.addPage(project.id, {
            name,
            imageUrl: base64String
          });
          
          const updatedProject = await ApiService.getProject(project.id);
          setProject(updatedProject);
          setActivePageId(newPage.id);
        } catch (error: any) {
          if (error.status === 403 || (error.response && error.response.status === 403)) {
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
          deleteAllPins: true
        });
        
        const updatedProject = await ApiService.getProject(project.id);
        setProject(updatedProject);

        const updatedPins = await ApiService.getPins(project.id);
        setPins(updatedPins);
      } catch (error: any) {
        if (error.status === 403 || (error.response && error.response.status === 403)) {
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
        if (error.status === 403 || (error.response && error.response.status === 403)) {
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
        if (error.status === 403 || (error.response && error.response.status === 403)) {
          StorageService.clearUser();
          onNavigate('/login');
          return;
        }
        alert('Failed to delete page');
      }
    }
  };

  const handleViewModeChange = async (mode: 'desktop' | 'mobile') => {
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
        if (error.status === 403 || (error.response && error.response.status === 403)) {
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
        <div className="flex gap-2 md:gap-3 mt-2 md:mt-0 w-full md:w-auto justify-end">
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

        <main className="flex-1 overflow-auto p-4 md:p-8 relative flex justify-center bg-slate-100/50">
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
      
                  {activePins.map((pin) => (
                    <div
                      key={pin.id}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      onClick={(e) => handleEditPin(pin, e)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-lg cursor-pointer transition-transform hover:scale-110 border-2 border-white ${
                        selectedPinId === pin.id ? 'bg-blue-600 scale-110 ring-4 ring-blue-600/20' : 'bg-slate-900'
                      }`}>
                        {pin.number}
                      </div>
                      {selectedPinId !== pin.id && (
                        <div className="absolute left-10 top-0 bg-slate-900 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 pointer-events-none z-20">
                          <span className="font-bold block mb-0.5">{pin.title}</span>
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
                      className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
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