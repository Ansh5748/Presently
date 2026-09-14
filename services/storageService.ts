import { Project, Pin, ProjectStatus, ProjectFormData, ProjectPage } from '../types';

const STORAGE_KEYS = {
  PROJECTS: 'presently_projects',
  PINS: 'presently_pins',
  USER: 'presently_user'
};

// Helpers
const generateId = () => Math.random().toString(36).substr(2, 9);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to clear non-essential API cache from localStorage when quota is tight
const clearApiCacheFromLocalStorage = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('presently:') || key.startsWith('presently_projects_published_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('[StorageService] Failed to clear API cache:', e);
  }
};

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[StorageService] Initial setItem for ${key} failed, attempting cache cleanup...`, e);
    // Quota exceeded: Evict non-essential API cache and published snapshots
    clearApiCacheFromLocalStorage();
    try {
      localStorage.setItem(key, value);
    } catch (retryError) {
      console.error(`[StorageService] Retry setItem for ${key} failed:`, retryError);
      // Fallback to sessionStorage for user session if localStorage is completely blocked
      if (key === STORAGE_KEYS.USER) {
        try {
          sessionStorage.setItem(key, value);
        } catch (sessionErr) {
          console.error('[StorageService] SessionStorage fallback also failed:', sessionErr);
        }
      }
    }
  }
};

export const StorageService = {
  // --- User Management ---
  saveUser: (user: { id: string; name: string; email: string; accessToken: string }) => {
    safeSetLocalStorage(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getUser: (): { id: string; name: string; email: string; accessToken: string } | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER) || sessionStorage.getItem(STORAGE_KEYS.USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clearUser: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      sessionStorage.removeItem(STORAGE_KEYS.USER);
    } catch {}
  },

  // --- Project Management (Now User-Aware) ---
  getProjects: (userId: string): Project[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (!data) return [];
    
    const allProjects: Project[] = JSON.parse(data);
    // Filter projects for the given user
    return allProjects.filter(p => p.userId === userId);
  },

  getProjectById: (projectId: string): Project | undefined => {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (!data) return undefined;
    const allProjects: Project[] = JSON.parse(data);
    return allProjects.find(p => p.id === projectId);
  },

  _getAllProjects: (): Project[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    return data ? JSON.parse(data) : [];
  },

  createProject: async (data: ProjectFormData, userId: string): Promise<{ newProject: Project, allProjects: Project[] }> => {
    await delay(1000); // Simulate initial connection

    // Just capture the main page provided
    const pageName = "Main Page";
    const initialPages: ProjectPage[] = [{
        id: generateId(),
        name: pageName,
        imageUrl: data.initialPageUrl,
        originalUrl: data.websiteUrl, // Save the original URL
    }];

    const newProject: Project = {
      id: generateId(),
      userId: userId, // Associate with the logged-in user
      name: data.name,
      clientName: data.clientName,
      websiteUrl: data.websiteUrl,
      pages: initialPages,
      status: ProjectStatus.DRAFT,
      createdAt: new Date().toISOString(),
    };

    const projects = StorageService._getAllProjects();
    const allProjects = [newProject, ...projects];
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(allProjects));
    return { newProject, allProjects: allProjects.filter(p => p.userId === userId) };
  },

  addPageToProject: (projectId: string, name: string, imageUrl: string, originalUrl?: string): ProjectPage => {
    const projects = StorageService._getAllProjects();
    const newPage: ProjectPage = { id: generateId(), name, imageUrl, originalUrl };
    
    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        return { ...p, pages: [...p.pages, newPage] };
      }
      return p;
    });

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
    return newPage;
  },

  updatePageName: (projectId: string, pageId: string, newName: string): void => {
    const projects = StorageService._getAllProjects();
    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        const updatedPages = p.pages.map(page => 
            page.id === pageId ? { ...page, name: newName } : page
        );
        return { ...p, pages: updatedPages };
      }
      return p;
    });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
  },

  updatePage: (projectId: string, pageId: string, updates: Partial<ProjectPage>): void => {
    const projects = StorageService._getAllProjects();
    const projectIndex = projects.findIndex(p => p.id === projectId);

    if (projectIndex !== -1) {
      const pageIndex = projects[projectIndex].pages.findIndex(p => p.id === pageId);
      
      if (pageIndex !== -1) {
        // Merge the existing page data with the updates
        projects[projectIndex].pages[pageIndex] = { 
          ...projects[projectIndex].pages[pageIndex], 
          ...updates 
        };
        
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
      }
    }
  },

  removePageFromProject: (projectId: string, pageId: string): void => {
    const projects = StorageService._getAllProjects();
    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        // Filter out the page with matching ID
        const newPages = p.pages.filter(page => page.id !== pageId);
        return { ...p, pages: newPages };
      }
      return p;
    });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));

    // Also remove pins associated with this page
    const allPinsData = localStorage.getItem(STORAGE_KEYS.PINS);
    if (allPinsData) {
      const allPins: Pin[] = JSON.parse(allPinsData);
      const filteredPins = allPins.filter(pin => pin.pageId !== pageId);
      localStorage.setItem(STORAGE_KEYS.PINS, JSON.stringify(filteredPins));
    }
  },

  deleteProject: (id: string): void => {
    const projects = StorageService._getAllProjects();
    const filtered = projects.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
  },

  updateProjectStatus: (id: string, status: ProjectStatus): void => {
    const projects = StorageService._getAllProjects();
    const updated = projects.map(p => p.id === id ? { ...p, status } : p);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
  },

  publishProject: (id: string): void => {
    const projects = StorageService._getAllProjects();
    const projectToPublish = projects.find(p => p.id === id);
    if (!projectToPublish) return;

    // Create a lightweight "published" version without the large image data.
    // We only need to store the data that defines the published state.
    const lightweightPublishedVersion = {
      ...projectToPublish,
      status: ProjectStatus.PUBLISHED,
      // Map over pages to remove the heavy imageUrl
      pages: projectToPublish.pages.map(page => {
        const { imageUrl, ...restOfPage } = page; // Destructure to exclude imageUrl
        return restOfPage;
      }),
    };

    // Save the published version with a special key
    localStorage.setItem(`${STORAGE_KEYS.PROJECTS}_published_${id}`, JSON.stringify(lightweightPublishedVersion));
  },

  getPins: (projectId: string): Pin[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PINS);
    const allPins: Pin[] = data ? JSON.parse(data) : [];
    return allPins.filter(p => p.projectId === projectId).sort((a, b) => a.number - b.number);
  },

  addPin: (pinData: Omit<Pin, 'id' | 'number'>): Pin => {
    const allPinsData = localStorage.getItem(STORAGE_KEYS.PINS);
    let allPins: Pin[] = allPinsData ? JSON.parse(allPinsData) : [];
    
    // Calculate next number for this PROJECT
    const projectPins = allPins.filter(p => p.projectId === pinData.projectId);
    const nextNumber = projectPins.length + 1;

    const newPin: Pin = {
      id: generateId(),
      number: nextNumber,
      ...pinData
    };

    allPins.push(newPin);
    localStorage.setItem(STORAGE_KEYS.PINS, JSON.stringify(allPins));
    return newPin;
  },

  updatePin: (pinId: string, updates: Partial<Pin>): void => {
    const allPinsData = localStorage.getItem(STORAGE_KEYS.PINS);
    if (!allPinsData) return;
    const allPins: Pin[] = JSON.parse(allPinsData);
    const updated = allPins.map(p => p.id === pinId ? { ...p, ...updates } : p);
    localStorage.setItem(STORAGE_KEYS.PINS, JSON.stringify(updated));
  },

  deletePin: (pinId: string): void => {
    const allPinsData = localStorage.getItem(STORAGE_KEYS.PINS);
    if (!allPinsData) return;
    let allPins: Pin[] = JSON.parse(allPinsData);
    
    const pinToDelete = allPins.find(p => p.id === pinId);
    if (!pinToDelete) return;
    
    allPins = allPins.filter(p => p.id !== pinId);
    
    // Re-index remaining pins for that project
    const projectPins = allPins.filter(p => p.projectId === pinToDelete.projectId).sort((a, b) => a.number - b.number);
    const otherPins = allPins.filter(p => p.projectId !== pinToDelete.projectId);
    
    const reindexedProjectPins = projectPins.map((p, index) => ({
      ...p,
      number: index + 1
    }));

    localStorage.setItem(STORAGE_KEYS.PINS, JSON.stringify([...otherPins, ...reindexedProjectPins]));
  }
};
