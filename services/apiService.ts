import type {
  AnnotationIssue,
  AnnotationIssueStatus,
  AnnotationMessage,
  AssigneeOption,
  ChatMessage,
  Group,
  GroupMember,
  GroupType,
  MemberRole,
  MessageVisibility,
  Project,
  Subgroup,
  UserProfile,
  UserSearchResult
} from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';
export const AUTH_EVENT = 'presently:auth:error';

type StoredUser = {
  accessToken?: string;
  userId?: string;
  id?: string;
};

const readStoredUser = (): StoredUser => {
  try {
    const raw = localStorage.getItem('presently_user');
    return raw ? (JSON.parse(raw) as StoredUser) : {};
  } catch {
    return {};
  }
};

const getAuthHeaders = (): Record<string, string> => {
  const user = readStoredUser();
  const token = user.accessToken;

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export const authFetch = async (url: string, options: RequestInit = {}) => {
  const defaultHeaders = getAuthHeaders();
  const resolvedHeaders =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : ((options.headers as Record<string, string> | undefined) ?? {});

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...resolvedHeaders
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('presently_user');
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, {
      detail: { target: '/login' }
    }));
  }

  return response;
};

const CacheService = {
  userId: () => {
    const user = readStoredUser();
    return user.userId || user.id || 'anonymous';
  },
  set: (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  },
  get: (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  invalidate: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  },
  invalidatePrefix: (prefix: string) => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // ignore storage errors
    }
  }
};

const CACHE_KEYS = {
  PROJECTS: (userId: string) => `presently:projects:${userId}`,
  PROJECT: (userId: string, projectId: string) => `presently:project:${userId}:${projectId}`,
  PINS: (userId: string, projectId: string, view: string) => `presently:pins:${userId}:${projectId}:${view}`,
  PROJECT_ASSIGNEES: (userId: string, projectId: string) => `presently:projectAssignees:${userId}:${projectId}`,
  SUBSCRIPTION_STATUS: (userId: string) => `presently:subscription:${userId}`,
  USER_SEARCH: (userId: string, email: string) => `presently:userSearch:${userId}:${email}`,
  USERS_ALL: (userId: string) => `presently:users:${userId}`,
  MY_PROFILE: (userId: string) => `presently:myProfile:${userId}`,
  GROUPS: (userId: string) => `presently:groups:${userId}`,
  GROUP: (userId: string, groupId: string) => `presently:group:${userId}:${groupId}`,
  GROUP_MESSAGES: (userId: string, groupId: string, subgroupId: string) => `presently:groupMessages:${userId}:${groupId}:${subgroupId}`,
  DIRECT_MESSAGES: (userId: string, recipientId: string) => `presently:directMessages:${userId}:${recipientId}`,
  PROJECT_ISSUES: (userId: string, projectId: string) => `presently:projectIssues:${userId}:${projectId}`,
  PIN_ISSUE: (userId: string, pinId: string) => `presently:pinIssue:${userId}:${pinId}`,
  ISSUE_MESSAGES: (userId: string, issueId: string) => `presently:issueMessages:${userId}:${issueId}`
};

const projectListPrefix = () => {
  const userId = CacheService.userId();
  return CACHE_KEYS.PROJECTS(userId).slice(0, CACHE_KEYS.PROJECTS(userId).lastIndexOf(':') + 1);
};

const pinListPrefix = (projectId: string, view = '') => {
  const userId = CacheService.userId();
  return CACHE_KEYS.PINS(userId, projectId, view).slice(0, CACHE_KEYS.PINS(userId, projectId, view).lastIndexOf(':') + 1);
};

export const ApiService = {
  async getProjects(): Promise<Project[]> {
    // Return cached projects immediately if available to improve perceived load times,
    // then refresh the cache in the background.
    try {
      const key = CACHE_KEYS.PROJECTS(CacheService.userId());
      const cached = CacheService.get(key) as Project[] | null;
      if (cached && cached.length) {
        // Kick off a background refresh but don't await it
        (async () => {
          try {
            const resp = await authFetch(`${API_BASE}/projects`);
            if (resp.ok) {
              const fresh = (await resp.json()) as Project[];
              CacheService.set(key, fresh);
            }
          } catch {}
        })();
        return cached;
      }

      const response = await authFetch(`${API_BASE}/projects`);

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = (await response.json()) as Project[];
      CacheService.set(CACHE_KEYS.PROJECTS(CacheService.userId()), data);
      return data;
    } catch (err) {
      // Fallback to network call if cache read caused issues
      const response = await authFetch(`${API_BASE}/projects`);
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = (await response.json()) as Project[];
      CacheService.set(CACHE_KEYS.PROJECTS(CacheService.userId()), data);
      return data;
    }
  },

  async getProject(projectId: string, view?: 'draft' | 'live'): Promise<Project> {
    const url = view ? `${API_BASE}/projects/${projectId}?view=${view}` : `${API_BASE}/projects/${projectId}`;
    const response = await authFetch(url);

    if (!response.ok) {
      throw new Error('Project not found');
    }

    const data = (await response.json()) as Project;
    if (!view || view !== 'live') {
      CacheService.set(CACHE_KEYS.PROJECT(CacheService.userId(), projectId), data);
    }
    return data;
  },

  async createProject(data: Record<string, unknown>): Promise<Project> {
    const response = await authFetch(`${API_BASE}/projects`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { requiresSubscription?: boolean; error?: string };
      if (error.requiresSubscription) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }
      throw new Error(error.error || 'Failed to create project');
    }

    const result = (await response.json()) as Project;
    CacheService.invalidatePrefix(projectListPrefix());
    return result;
  },

  async updateProject(projectId: string, updates: Record<string, unknown>): Promise<Project> {
    const response = await authFetch(`${API_BASE}/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update project');
    }

    const data = (await response.json()) as Project;
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    CacheService.invalidatePrefix(projectListPrefix());
    return data;
  },

  async deleteProject(projectId: string) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete project');
    }

    const data = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    CacheService.invalidatePrefix(projectListPrefix());
    return data;
  },

  async publishProject(projectId: string) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/publish`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to publish project');
    }

    const data = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    CacheService.invalidatePrefix(projectListPrefix());
    return data;
  },

  async assignUsersToProject(projectId: string, userIds: string[]) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/assign-users`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to assign users');
    }

    const data = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    return data;
  },

  async getProjectAssignees(projectId: string): Promise<{
    projectAssignees: AssigneeOption[];
    otherGroups: { id: string; name: string; type: GroupType; members: AssigneeOption[] }[];
    permissions: { isProjectGroupMember: boolean; canAssign: boolean; canCrossGroupSearch: boolean; isTeamMember: boolean };
  }> {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/assignees`);

    if (!response.ok) {
      throw new Error('Failed to fetch assignees');
    }

    const data = (await response.json()) as {
      projectAssignees: AssigneeOption[];
      otherGroups: { id: string; name: string; type: GroupType; members: AssigneeOption[] }[];
      permissions: { isProjectGroupMember: boolean; canAssign: boolean; canCrossGroupSearch: boolean; isTeamMember: boolean };
    };

    CacheService.set(CACHE_KEYS.PROJECT_ASSIGNEES(CacheService.userId(), projectId), data);
    return data;
  },

  async addPage(projectId: string, data: { name: string; imageUrl: string; originalUrl?: string }) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/pages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to add page');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    return result;
  },

  async updatePage(projectId: string, pageId: string, updates: Record<string, unknown>) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error('Failed to update page');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    return result;
  },

  async deletePage(projectId: string, pageId: string) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/pages/${pageId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete page');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    return result;
  },

  async getPins(projectId: string, view?: 'draft' | 'live') {
    const url = view ? `${API_BASE}/projects/${projectId}/pins?view=${view}` : `${API_BASE}/projects/${projectId}/pins`;
    const response = await authFetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch pins');
    }

    const data = await response.json();
    if (!view || view !== 'live') {
      CacheService.set(CACHE_KEYS.PINS(CacheService.userId(), projectId, view || 'default'), data);
    }
    return data;
  },

  async createPin(projectId: string, data: Record<string, unknown>) {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/pins`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to create pin');
    }

    const result = await response.json();
    CacheService.invalidatePrefix(pinListPrefix(projectId));
    return result;
  },

  async updatePin(pinId: string, updates: Record<string, unknown>) {
    const response = await authFetch(`${API_BASE}/pins/${pinId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error('Failed to update pin');
    }

    const result = await response.json();
    const projectId = result?.projectId as string | undefined;
    if (projectId) {
      CacheService.invalidatePrefix(pinListPrefix(projectId));
    }
    return result;
  },

  async deletePin(pinId: string) {
    const response = await authFetch(`${API_BASE}/pins/${pinId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete pin');
    }

    const result = await response.json();
    const projectId = result?.projectId as string | undefined;
    if (projectId) {
      CacheService.invalidatePrefix(pinListPrefix(projectId));
    }
    return result;
  },

  async getSubscriptionStatus() {
    const response = await authFetch(`${API_BASE}/subscription/status`);

    if (!response.ok) {
      throw new Error('Failed to check subscription');
    }

    const data = await response.json();
    CacheService.set(CACHE_KEYS.SUBSCRIPTION_STATUS(CacheService.userId()), data);
    return data;
  },

  async searchUsers(email: string): Promise<UserSearchResult[]> {
    const response = await authFetch(`${API_BASE}/users/search?email=${encodeURIComponent(email)}`);

    if (!response.ok) {
      throw new Error('Failed to search users');
    }

    const data = (await response.json()) as UserSearchResult[];
    CacheService.set(CACHE_KEYS.USER_SEARCH(CacheService.userId(), email), data);
    return data;
  },

  async getAllUsers(): Promise<UserSearchResult[]> {
    const response = await authFetch(`${API_BASE}/users/all`);

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = (await response.json()) as UserSearchResult[];
    CacheService.set(CACHE_KEYS.USERS_ALL(CacheService.userId()), data);
    return data;
  },

  async getMyProfile(): Promise<UserProfile> {
    const response = await authFetch(`${API_BASE}/users/me`);

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    const data = (await response.json()) as UserProfile;
    CacheService.set(CACHE_KEYS.MY_PROFILE(CacheService.userId()), data);
    return data;
  },

  async updateMyProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const response = await authFetch(`${API_BASE}/users/me`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update profile');
    }

    const data = (await response.json()) as UserProfile;
    CacheService.invalidate(CACHE_KEYS.MY_PROFILE(CacheService.userId()));
    return data;
  },

  async getGroups(): Promise<Group[]> {
    const response = await authFetch(`${API_BASE}/groups`);

    if (!response.ok) {
      throw new Error('Failed to fetch groups');
    }

    const data = (await response.json()) as Group[];
    CacheService.set(CACHE_KEYS.GROUPS(CacheService.userId()), data);
    return data;
  },

  async getGroup(groupId: string): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch group');
    }

    const data = (await response.json()) as Group;
    CacheService.set(CACHE_KEYS.GROUP(CacheService.userId(), groupId), data);
    return data;
  },

  async createGroup(data: { name: string; type: GroupType; description?: string }): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to create group');
    }

    const result = (await response.json()) as Group;
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async updateGroup(groupId: string, updates: { name?: string; description?: string }): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update group');
    }

    const result = (await response.json()) as Group;
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async deleteGroup(groupId: string) {
    const response = await authFetch(`${API_BASE}/groups/${groupId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete group');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async addGroupMember(groupId: string, data: { memberEmail: string; role?: MemberRole; designation?: string }): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to add member');
    }

    const result = (await response.json()) as Group;
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async updateGroupMember(groupId: string, memberId: string, updates: { role?: GroupMember['role']; designation?: string }): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update member');
    }

    const result = (await response.json()) as Group;
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async removeGroupMember(groupId: string, memberId: string): Promise<Group> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to remove member');
    }

    const result = (await response.json()) as Group;
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    return result;
  },

  async addSubgroup(groupId: string, name: string, description?: string): Promise<Subgroup[]> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/subgroups`, {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to create subgroup');
    }

    const result = (await response.json()) as Subgroup[];
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    return result;
  },

  async updateSubgroup(groupId: string, subgroupId: string, name: string, description?: string): Promise<Subgroup[]> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/subgroups/${subgroupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update subgroup');
    }

    const result = (await response.json()) as Subgroup[];
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    return result;
  },

  async deleteSubgroup(groupId: string, subgroupId: string): Promise<Subgroup[]> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/subgroups/${subgroupId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to delete subgroup');
    }

    const result = (await response.json()) as Subgroup[];
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUP_MESSAGES(CacheService.userId(), groupId, subgroupId));
    return result;
  },

  async assignProjectToGroup(groupId: string, projectId: string) {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/projects/${projectId}`, {
      method: 'POST'
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to assign project');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    CacheService.invalidatePrefix(projectListPrefix());
    return result;
  },

  async unassignProjectFromGroup(groupId: string, projectId: string) {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/projects/${projectId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to unassign project');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.GROUP(CacheService.userId(), groupId));
    CacheService.invalidate(CACHE_KEYS.GROUPS(CacheService.userId()));
    CacheService.invalidate(CACHE_KEYS.PROJECT(CacheService.userId(), projectId));
    CacheService.invalidatePrefix(projectListPrefix());
    return result;
  },

  async getGroupMessages(groupId: string, subgroupId?: string): Promise<ChatMessage[]> {
    // Backwards-compatible: fetch up to 500 messages (original behaviour)
    return this.getGroupMessagesPage(groupId, subgroupId, undefined, 500);
  },

  async getGroupMessagesPage(groupId: string, subgroupId?: string, before?: string | undefined, limit = 30): Promise<ChatMessage[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (before) params.set('before', before);
    if (subgroupId) params.set('subgroupId', subgroupId);
    const url = `${API_BASE}/groups/${groupId}/messages?${params.toString()}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch messages');
    const data = (await response.json()) as ChatMessage[];
    const key = CACHE_KEYS.GROUP_MESSAGES(CacheService.userId(), groupId, subgroupId || 'general');
    try {
      const cached = CacheService.get(key) as ChatMessage[] | null;
      if (!before) {
        CacheService.set(key, data);
      } else {
        // prepend older messages to cache
        if (cached && Array.isArray(cached)) {
          // avoid duplicates by id
          const ids = new Set(cached.map(m => m.id));
          const merged = [...data.filter(m => !ids.has(m.id)), ...cached];
          CacheService.set(key, merged);
        } else {
          CacheService.set(key, [...data]);
        }
      }
    } catch {}
    return data;
  },

  async sendGroupMessage(groupId: string, data: { content: string; subgroupId?: string; visibility?: MessageVisibility }): Promise<ChatMessage> {
    const response = await authFetch(`${API_BASE}/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to send message');
    }

    const msg = (await response.json()) as ChatMessage;
    try {
      const key = CACHE_KEYS.GROUP_MESSAGES(CacheService.userId(), groupId, data.subgroupId || 'general');
      const cached = CacheService.get(key) as ChatMessage[] | null;
      if (cached && Array.isArray(cached)) CacheService.set(key, [...cached, msg]);
      else CacheService.set(key, [msg]);
    } catch {}
    return msg;
  },

  async getDirectMessages(recipientId: string): Promise<ChatMessage[]> {
    return this.getDirectMessagesPage(recipientId, undefined, 500);
  },

  async getDirectMessagesPage(recipientId: string, before?: string | undefined, limit = 30): Promise<ChatMessage[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (before) params.set('before', before);
    const url = `${API_BASE}/messages/direct/${recipientId}?${params.toString()}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch messages');
    const data = (await response.json()) as ChatMessage[];
    const key = CACHE_KEYS.DIRECT_MESSAGES(CacheService.userId(), recipientId);
    try {
      const cached = CacheService.get(key) as ChatMessage[] | null;
      if (!before) {
        CacheService.set(key, data);
      } else {
        if (cached && Array.isArray(cached)) {
          const ids = new Set(cached.map(m => m.id));
          const merged = [...data.filter(m => !ids.has(m.id)), ...cached];
          CacheService.set(key, merged);
        } else {
          CacheService.set(key, [...data]);
        }
      }
    } catch {}
    return data;
  },

  async sendDirectMessage(recipientId: string, content: string): Promise<ChatMessage> {
    const response = await authFetch(`${API_BASE}/messages/direct/${recipientId}`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to send message');
    }

    const msg = (await response.json()) as ChatMessage;
    try {
      const key = CACHE_KEYS.DIRECT_MESSAGES(CacheService.userId(), recipientId);
      const cached = CacheService.get(key) as ChatMessage[] | null;
      if (cached && Array.isArray(cached)) CacheService.set(key, [...cached, msg]);
      else CacheService.set(key, [msg]);
    } catch {}
    return msg;
  },

  async getProjectIssues(projectId: string): Promise<AnnotationIssue[]> {
    const response = await authFetch(`${API_BASE}/projects/${projectId}/issues`);

    if (!response.ok) {
      throw new Error('Failed to fetch issues');
    }

    const data = (await response.json()) as AnnotationIssue[];
    CacheService.set(CACHE_KEYS.PROJECT_ISSUES(CacheService.userId(), projectId), data);
    return data;
  },

  async getPinIssue(pinId: string): Promise<AnnotationIssue | null> {
    const key = CACHE_KEYS.PIN_ISSUE(CacheService.userId(), pinId);
    try {
      const cached = CacheService.get(key) as AnnotationIssue | null;
      if (cached) {
        // Refresh in background
        (async () => {
          try {
            const resp = await authFetch(`${API_BASE}/pins/${pinId}/issue`);
            if (resp.ok) {
              const fresh = (await resp.json()) as AnnotationIssue | null;
              CacheService.set(key, fresh);
            }
          } catch {}
        })();
        return cached;
      }

      const response = await authFetch(`${API_BASE}/pins/${pinId}/issue`);

      if (!response.ok) {
        if (response.status === 403) {
          return null;
        }
        throw new Error('Failed to fetch issue');
      }

      const data = (await response.json()) as AnnotationIssue | null;
      CacheService.set(key, data);
      return data;
    } catch (e) {
      // final attempt network-only
      const response = await authFetch(`${API_BASE}/pins/${pinId}/issue`);
      if (!response.ok) {
        if (response.status === 403) return null;
        throw new Error('Failed to fetch issue');
      }
      const data = (await response.json()) as AnnotationIssue | null;
      CacheService.set(key, data);
      return data;
    }
  },

  async deletePinIssue(pinId: string): Promise<unknown> {
    const response = await authFetch(`${API_BASE}/pins/${pinId}/issue`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete issue for pin');
    }

    const result = await response.json();
    CacheService.invalidate(CACHE_KEYS.PIN_ISSUE(CacheService.userId(), pinId));
    return result;
  },

  async savePinIssue(pinId: string, data: {
    projectId?: string;
    assigneeId?: string | null;
    status?: AnnotationIssueStatus;
    labels?: string[];
  }): Promise<AnnotationIssue> {
    const response = await authFetch(`${API_BASE}/pins/${pinId}/issue`, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to save issue');
    }

    const result = (await response.json()) as AnnotationIssue;
    CacheService.invalidate(CACHE_KEYS.PIN_ISSUE(CacheService.userId(), pinId));
    if (result.projectId) {
      CacheService.invalidate(CACHE_KEYS.PROJECT_ISSUES(CacheService.userId(), result.projectId));
    }
    return result;
  },

  async updateIssueStatus(issueId: string, status: AnnotationIssueStatus): Promise<AnnotationIssue> {
    const response = await authFetch(`${API_BASE}/issues/${issueId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to update status');
    }

    const result = (await response.json()) as AnnotationIssue;
    if (result.projectId) {
      CacheService.invalidate(CACHE_KEYS.PROJECT_ISSUES(CacheService.userId(), result.projectId));
    }
    if (result.pinId) {
      CacheService.invalidate(CACHE_KEYS.PIN_ISSUE(CacheService.userId(), result.pinId));
    }
    return result;
  },

  async getIssueMessages(issueId: string): Promise<AnnotationMessage[]> {
    // Backwards-compatible: fetch up to 500 messages (original behaviour)
    return this.getIssueMessagesPage(issueId, undefined, 500);
  },

  async getIssueMessagesPage(issueId: string, before?: string | undefined, limit = 30): Promise<AnnotationMessage[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (before) params.set('before', before);
    const url = `${API_BASE}/issues/${issueId}/messages?${params.toString()}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch issue messages');
    const data = (await response.json()) as AnnotationMessage[];
    const key = CACHE_KEYS.ISSUE_MESSAGES(CacheService.userId(), issueId);
    try {
      const cached = CacheService.get(key) as AnnotationMessage[] | null;
      if (!before) {
        CacheService.set(key, data);
      } else {
        if (cached && Array.isArray(cached)) {
          const ids = new Set(cached.map(m => m.id));
          const merged = [...data.filter(m => !ids.has(m.id)), ...cached];
          CacheService.set(key, merged);
        } else {
          CacheService.set(key, [...data]);
        }
      }
    } catch {}
    return data;
  },

  async sendIssueMessage(issueId: string, content: string, visibility: MessageVisibility = 'all'): Promise<AnnotationMessage> {
    const response = await authFetch(`${API_BASE}/issues/${issueId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, visibility })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(error.error || 'Failed to send message');
    }

    const msg = (await response.json()) as AnnotationMessage;
    try {
      const key = CACHE_KEYS.ISSUE_MESSAGES(CacheService.userId(), issueId);
      const cached = CacheService.get(key) as AnnotationMessage[] | null;
      if (cached && Array.isArray(cached)) {
        CacheService.set(key, [...cached, msg]);
      } else {
        CacheService.set(key, [msg]);
      }
    } catch {}
    return msg;
  }
  ,
  // Cache-read helpers (synchronous) to enable immediate UI rendering from localStorage
  getCachedProjects(): Project[] | null {
    try {
      const key = CACHE_KEYS.PROJECTS(CacheService.userId());
      return CacheService.get(key) as Project[] | null;
    } catch {
      return null;
    }
  },
  getCachedGroups(): Group[] | null {
    try {
      const key = CACHE_KEYS.GROUPS(CacheService.userId());
      return CacheService.get(key) as Group[] | null;
    } catch {
      return null;
    }
  },
  getCachedGroupMessages(groupId: string, subgroupId?: string): ChatMessage[] | null {
    try {
      const key = CACHE_KEYS.GROUP_MESSAGES(CacheService.userId(), groupId, subgroupId || 'general');
      return CacheService.get(key) as ChatMessage[] | null;
    } catch {
      return null;
    }
  },
  getCachedDirectMessages(recipientId: string): ChatMessage[] | null {
    try {
      const key = CACHE_KEYS.DIRECT_MESSAGES(CacheService.userId(), recipientId);
      return CacheService.get(key) as ChatMessage[] | null;
    } catch {
      return null;
    }
  },
  getCachedMyProfile(): UserProfile | null {
    try {
      const key = CACHE_KEYS.MY_PROFILE(CacheService.userId());
      return CacheService.get(key) as UserProfile | null;
    } catch {
      return null;
    }
  }
  ,
  getCachedProjectAssignees(projectId: string): { projectAssignees: AssigneeOption[]; otherGroups: { id: string; name: string; type: GroupType; members: AssigneeOption[] }[]; permissions: { isProjectGroupMember: boolean; canAssign: boolean; canCrossGroupSearch: boolean; isTeamMember: boolean } } | null {
    try {
      const key = CACHE_KEYS.PROJECT_ASSIGNEES(CacheService.userId(), projectId);
      return CacheService.get(key) as any || null;
    } catch {
      return null;
    }
  },
  getCachedPinIssue(pinId: string): AnnotationIssue | null {
    try {
      const key = CACHE_KEYS.PIN_ISSUE(CacheService.userId(), pinId);
      return CacheService.get(key) as AnnotationIssue | null;
    } catch {
      return null;
    }
  },
  getCachedIssueMessages(issueId: string): AnnotationMessage[] | null {
    try {
      const key = CACHE_KEYS.ISSUE_MESSAGES(CacheService.userId(), issueId);
      return CacheService.get(key) as AnnotationMessage[] | null;
    } catch {
      return null;
    }
  }
};
