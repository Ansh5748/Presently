// API service for backend communication with MongoDB

const API_BASE = '/api';

const getAuthHeaders = () => {
  const userData = localStorage.getItem('presently_user');
  if (!userData) return {};
  
  const { accessToken } = JSON.parse(userData);
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
};

export const ApiService = {
  // ==================== PROJECTS ====================
  
  async getProjects() {
    const response = await fetch(`${API_BASE}/projects`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }
    
    return await response.json();
  },

  async getProject(projectId: string, view?: 'draft' | 'live') {
    const url = view ? `${API_BASE}/projects/${projectId}?view=${view}` : `${API_BASE}/projects/${projectId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Project not found');
    }
    
    return await response.json();
  },

  async createProject(data: any) {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      if (error.requiresSubscription) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }
      throw new Error(error.error || 'Failed to create project');
    }
    
    return await response.json();
  },

  async deleteProject(projectId: string) {
    const response = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete project');
    }
    
    return await response.json();
  },

  async publishProject(projectId: string) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/publish`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to publish project');
    }
    
    return await response.json();
  },

  // ==================== PAGES ====================

  async addPage(projectId: string, data: { name: string; imageUrl: string; originalUrl?: string }) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/pages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to add page');
    }
    
    return await response.json();
  },

  async updatePage(projectId: string, pageId: string, updates: any) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/pages/${pageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update page');
    }
    
    return await response.json();
  },

  async deletePage(projectId: string, pageId: string) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/pages/${pageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete page');
    }
    
    return await response.json();
  },

  // ==================== PINS ====================

    async getPins(projectId: string, view?: 'draft' | 'live') {
      const url = view ? `${API_BASE}/projects/${projectId}/pins?view=${view}` : `${API_BASE}/projects/${projectId}/pins`;
      const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch pins');
    }
    
    return await response.json();
  },

  async createPin(projectId: string, data: any) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/pins`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create pin');
    }
    
    return await response.json();
  },

  async updatePin(pinId: string, updates: any) {
    const response = await fetch(`${API_BASE}/pins/${pinId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update pin');
    }
    
    return await response.json();
  },

  async deletePin(pinId: string) {
    const response = await fetch(`${API_BASE}/pins/${pinId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete pin');
    }
    
    return await response.json();
  },

  // ==================== SUBSCRIPTION ====================

  async getSubscriptionStatus() {
    const response = await fetch(`${API_BASE}/subscription/status`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Failed to check subscription');
    }
    
    return await response.json();
  }
};
