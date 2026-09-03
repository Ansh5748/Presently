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
  ProjectSummary,
  Pin,
  Subgroup,
  UserProfile,
  UserSearchResult
} from '../types';

import { CacheService } from './cacheService';

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


const CACHE_KEYS = {
  PROJECTS: (userId: string) => `presently:projects:${userId}`,
  PROJECT: (userId: string, projectId: string) => `presently:project:${userId}:${projectId}`,
  PINS: (userId: string, projectId: string, view: string) => `presently:pins:${userId}:${projectId}:${view}`,
  PROJECT_ASSIGNEES: (userId: string, projectId: string) => `presently:projectAssignees:${userId}:${projectId}`,
  SUBSCRIPTION_STATUS: (userId: string) => `presently:subscription:${userId}`,
  USER_SEARCH: (userId: string, email: string) => `presently:userSearch:${userId}:${email}`,
  USERS_ALL: (userId: string) => `presently:users:${userId}`,
  MY_PROFILE: (userId: string) => `presently:myProfile:${userId}`,
  MY_AVATAR: (userId: string) => `presently:myAvatar:${userId}`,
  GROUPS: (userId: string) => `presently:groups:${userId}`,
  GROUP: (userId: string, groupId: string) => `presently:group:${userId}:${groupId}`,
  GROUP_MESSAGES: (userId: string, groupId: string, subgroupId: string) => `presently:groupMessages:${userId}:${groupId}:${subgroupId}`,
  DIRECT_MESSAGES: (userId: string, recipientId: string) => `presently:directMessages:${userId}:${recipientId}`,
  DIRECT_MESSAGE_CONTACTS: (userId: string) => `presently:directMessageContacts:${userId}`,
  PROJECT_ISSUES: (userId: string, projectId: string) => `presently:projectIssues:${userId}:${projectId}`,
  PIN_ISSUE: (userId: string, pinId: string) => `presently:pinIssue:${userId}:${pinId}`,
  ISSUE_MESSAGES: (userId: string, issueId: string) => `presently:issueMessages:${userId}:${issueId}`
};

const CACHE_TTL = {
  projects: 60 * 1000,
  project: 2 * 60 * 1000,
  pins: 60 * 1000,
  groups: 2 * 60 * 1000,
  group: 2 * 60 * 1000,
  profile: 5 * 60 * 1000,
  subscription: 60 * 1000,
  users: 5 * 60 * 1000,
  avatar: 30 * 24 * 60 * 60 * 1000,
  issues: 30 * 1000,
  assignees: 2 * 60 * 1000,
  messages: 15 * 1000
};

const inFlightRequests = new Map<string, Promise<unknown>>();

class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

const getCacheEntry = <T>(key: string): CacheEntry<T> | null => {
  try {
    const entry = CacheService.get<T>(key) as CacheEntry<T> | null;

    if (!entry) return null;

    // Supports the new { data, cachedAt } cache format.
    if (
      typeof entry === 'object' &&
      'data' in entry &&
      'cachedAt' in entry
    ) {
      return entry;
    }

    // Backwards compatibility with an older raw-value cache.
    return {
      data: entry as T,
      cachedAt: 0
    };
  } catch {
    return null;
  }
};

const getCacheData = <T>(key: string): T | null => {
  return getCacheEntry<T>(key)?.data ?? null;
};

const getRequestKey = (url: string) =>
  `${CacheService.userId()}::${url}`;

const fetchJson = async <T>(
  url: string,
  errorMessage: string
): Promise<T> => {
  const response = await authFetch(url);

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const serverMessage =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : undefined;

    throw new ApiError(
      serverMessage || errorMessage,
      response.status,
      payload
    );
  }

  return payload as T;
};

const refreshCached = async <T>(
  key: string,
  url: string,
  errorMessage: string
): Promise<T> => {
  const requestKey = getRequestKey(url);
  const existing = inFlightRequests.get(requestKey);

  if (existing) {
    return existing as Promise<T>;
  }

  const request = fetchJson<T>(url, errorMessage)
    .then(data => {
      CacheService.set(key, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(requestKey);
    });

  inFlightRequests.set(requestKey, request);

  return request;
};

const getCachedOrFetch = async <T>(
  key: string,
  url: string,
  ttl: number,
  errorMessage: string
): Promise<T> => {
  const cached = getCacheEntry<T>(key);

  if (cached) {
    const age = Math.max(0, Date.now() - cached.cachedAt);

    // Fresh cache: return immediately and do not hit the API.
    if (age < ttl) {
      return cached.data;
    }

    // Stale cache: return immediately and silently refresh.
    void refreshCached<T>(key, url, errorMessage).catch(() => {
      // Keep stale data when background refresh fails.
    });

    return cached.data;
  }

  // No cache: first visit must wait for the API.
  return refreshCached<T>(key, url, errorMessage);
};

const projectListPrefix = () => {
  const userId = CacheService.userId();
  const key = CACHE_KEYS.PROJECTS(userId);
  return key.slice(0, key.lastIndexOf(':') + 1);
};

const pinListPrefix = (projectId: string, view = '') => {
  const userId = CacheService.userId();
  const key = CACHE_KEYS.PINS(userId, projectId, view);
  return key.slice(0, key.lastIndexOf(':') + 1);
};

export const ApiService = {
  async getProjects(): Promise<ProjectSummary[]> {
    const key = CACHE_KEYS.PROJECTS(CacheService.userId());

    return getCachedOrFetch<ProjectSummary[]>(
      key,
      `${API_BASE}/projects`,
      CACHE_TTL.projects,
      'Failed to fetch projects'
    );
  },

  async getProject(
    projectId: string,
    view?: 'draft' | 'live'
  ): Promise<Project> {
    const url = view
      ? `${API_BASE}/projects/${projectId}?view=${view}`
      : `${API_BASE}/projects/${projectId}`;

    // Live published views remain network-based because they are public
    // and should not be mixed with a user's private draft cache.
    if (view === 'live') {
      return fetchJson<Project>(
        url,
        'Project not found'
      );
    }

    const key = CACHE_KEYS.PROJECT(
      CacheService.userId(),
      projectId
    );

    return getCachedOrFetch<Project>(
      key,
      url,
      CACHE_TTL.project,
      'Project not found'
    );
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
    otherGroups: {
      id: string;
      name: string;
      type: GroupType;
      members: AssigneeOption[];
    }[];
    permissions: {
      isProjectGroupMember: boolean;
      canAssign: boolean;
      canCrossGroupSearch: boolean;
      isTeamMember: boolean;
    };
  }> {
    const key = CACHE_KEYS.PROJECT_ASSIGNEES(
      CacheService.userId(),
      projectId
    );

    return getCachedOrFetch(
      key,
      `${API_BASE}/projects/${projectId}/assignees`,
      CACHE_TTL.assignees,
      'Failed to fetch assignees'
    );
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

  async getPins(
    projectId: string,
    view?: 'draft' | 'live'
  ): Promise<Pin[]> {
    const url = view
      ? `${API_BASE}/projects/${projectId}/pins?view=${view}`
      : `${API_BASE}/projects/${projectId}/pins`;

    // Public live pins are not stored in the private user cache.
    if (view === 'live') {
      return fetchJson<Pin[]>(
        url,
        'Failed to fetch pins'
      );
    }

    const key = CACHE_KEYS.PINS(
      CacheService.userId(),
      projectId,
      view || 'default'
    );

    return getCachedOrFetch<Pin[]>(
      key,
      url,
      CACHE_TTL.pins,
      'Failed to fetch pins'
    );
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
    const key = CACHE_KEYS.SUBSCRIPTION_STATUS(
      CacheService.userId()
    );

    return getCachedOrFetch(
      key,
      `${API_BASE}/subscription/status`,
      CACHE_TTL.subscription,
      'Failed to check subscription'
    );
  },

  async searchUsers(email: string): Promise<UserSearchResult[]> {
    const normalized = email.trim().toLowerCase();
    const key = CACHE_KEYS.USER_SEARCH(
      CacheService.userId(),
      normalized
    );

    return getCachedOrFetch<UserSearchResult[]>(
      key,
      `${API_BASE}/users/search?email=${encodeURIComponent(normalized)}`,
      CACHE_TTL.users,
      'Failed to search users'
    );
  },

    async getDirectMessageContacts(): Promise<Array<{
    _id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    lastMessageAt?: string;
  }>> {
    const key = CACHE_KEYS.DIRECT_MESSAGE_CONTACTS(
      CacheService.userId()
    );

    return getCachedOrFetch(
      key,
      `${API_BASE}/messages/direct/contacts`,
      CACHE_TTL.users,
      'Failed to fetch direct message contacts'
    );
  },

  async getAllUsers(): Promise<UserSearchResult[]> {
    const key = CACHE_KEYS.USERS_ALL(
      CacheService.userId()
    );

    return getCachedOrFetch<UserSearchResult[]>(
      key,
      `${API_BASE}/users/all`,
      CACHE_TTL.users,
      'Failed to fetch users'
    );
  },

    async getUserAvatars(
      userIds: string[]
    ): Promise<Array<{
      _id: string;
      avatarUrl?: string;
    }>> {
      const ids = [
        ...new Set(
          userIds
            .map(id => id?.toString())
            .filter(Boolean)
        )
      ].sort();

      if (!ids.length) {
        return [];
      }

      const key =
        `presently:userAvatars:placeholder:${CacheService.userId()}:${ids.join(',')}`;

      return getCachedOrFetch(
        key,
        `${API_BASE}/users/avatars?ids=${encodeURIComponent(ids.join(','))}`,
        CACHE_TTL.avatar,
        'Failed to fetch user avatars'
      );
    },

  async getUserFullAvatars(
    userIds: string[]
  ): Promise<Array<{
    _id: string;
    avatarUrl?: string;
  }>> {
    const ids = [
      ...new Set(
        userIds
          .map(id => id?.toString())
          .filter(Boolean)
      )
    ].sort();

    if (!ids.length) {
      return [];
    }

    const key =
      `presently:userAvatars:full:${CacheService.userId()}:${ids.join(',')}`;

    return getCachedOrFetch(
      key,
      `${API_BASE}/users/avatars/full?ids=${encodeURIComponent(ids.join(','))}`,
      CACHE_TTL.avatar,
      'Failed to fetch full user avatars'
    );
  },

  async getMyProfile(): Promise<UserProfile> {
    const key = CACHE_KEYS.MY_PROFILE(
      CacheService.userId()
    );

    return getCachedOrFetch<UserProfile>(
      key,
      `${API_BASE}/users/me`,
      CACHE_TTL.profile,
      'Failed to fetch profile'
    );
  },

  async getMyAvatar(): Promise<{
  _id: string;
  avatarUrl?: string;
}> {
  const key = CACHE_KEYS.MY_AVATAR(CacheService.userId());

  return getCachedOrFetch(
    key,
    `${API_BASE}/users/me/avatar`,
    CACHE_TTL.avatar,
    'Failed to fetch avatar'
  );
},

async getMyAvatarPlaceholder(): Promise<{
  _id: string;
  avatarPlaceholderUrl?: string;
}> {
  const key = `${CACHE_KEYS.MY_AVATAR(CacheService.userId())}:placeholder`;

  return getCachedOrFetch(
    key,
    `${API_BASE}/users/me/avatar/placeholder`,
    CACHE_TTL.avatar,
    'Failed to fetch avatar placeholder'
  );
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
    const key = CACHE_KEYS.GROUPS(
      CacheService.userId()
    );

    return getCachedOrFetch<Group[]>(
      key,
      `${API_BASE}/groups`,
      CACHE_TTL.groups,
      'Failed to fetch groups'
    );
  },

  async getGroup(groupId: string): Promise<Group> {
    const key = CACHE_KEYS.GROUP(
      CacheService.userId(),
      groupId
    );

    return getCachedOrFetch<Group>(
      key,
      `${API_BASE}/groups/${groupId}`,
      CACHE_TTL.group,
      'Failed to fetch group'
    );
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

  async getGroupMessages(
    groupId: string,
    subgroupId?: string
  ): Promise<ChatMessage[]> {
    const key = CACHE_KEYS.GROUP_MESSAGES(
      CacheService.userId(),
      groupId,
      subgroupId || 'general'
    );

    const cached = getCacheData<ChatMessage[]>(key);

    // Preserve the historical "up to 500" contract.
    // If a smaller paginated cache exists, fetch the full compatibility payload.
    if (cached && cached.length >= 500) {
      return cached;
    }

    return this.getGroupMessagesPage(
      groupId,
      subgroupId,
      undefined,
      500
    );
  },

  async getGroupMessagesPage(
    groupId: string,
    subgroupId?: string,
    before?: string,
    limit = 30
  ): Promise<ChatMessage[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const params = new URLSearchParams();

    params.set('limit', String(safeLimit));

    if (before) params.set('before', before);
    if (subgroupId) params.set('subgroupId', subgroupId);

    const url = `${API_BASE}/groups/${groupId}/messages?${params.toString()}`;

    const key = CACHE_KEYS.GROUP_MESSAGES(
      CacheService.userId(),
      groupId,
      subgroupId || 'general'
    );

    // Older pages are pagination requests and should always hit the server.
    if (before) {
      const data = await fetchJson<ChatMessage[]>(
        url,
        'Failed to fetch messages'
      );

      const cached = getCacheData<ChatMessage[]>(key);

      if (cached && Array.isArray(cached)) {
        const ids = new Set(cached.map(message => message.id));
        CacheService.set(key, [
          ...data.filter(message => !ids.has(message.id)),
          ...cached
        ]);
      } else {
        CacheService.set(key, data);
      }

      return data;
    }

    // Initial page: cache-first + stale-while-revalidate.
    return getCachedOrFetch<ChatMessage[]>(
      key,
      url,
      CACHE_TTL.messages,
      'Failed to fetch messages'
    );
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
      const cached = CacheService.getData<ChatMessage[]>(key);
      if (cached && Array.isArray(cached)) CacheService.set(key, [...cached, msg]);
      else CacheService.set(key, [msg]);
    } catch {}
    return msg;
  },

  async getDirectMessages(
    recipientId: string
  ): Promise<ChatMessage[]> {
    const key = CACHE_KEYS.DIRECT_MESSAGES(
      CacheService.userId(),
      recipientId
    );

    const cached = getCacheData<ChatMessage[]>(key);

    if (cached && cached.length >= 500) {
      return cached;
    }

    return this.getDirectMessagesPage(
      recipientId,
      undefined,
      500
    );
  },

  async getDirectMessagesPage(
    recipientId: string,
    before?: string,
    limit = 30
  ): Promise<ChatMessage[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const params = new URLSearchParams();

    params.set('limit', String(safeLimit));

    if (before) params.set('before', before);

    const url =
      `${API_BASE}/messages/direct/${recipientId}?${params.toString()}`;

    const key = CACHE_KEYS.DIRECT_MESSAGES(
      CacheService.userId(),
      recipientId
    );

    // Older pages always go to the server.
    if (before) {
      const data = await fetchJson<ChatMessage[]>(
        url,
        'Failed to fetch messages'
      );

      const cached = getCacheData<ChatMessage[]>(key);

      if (cached && Array.isArray(cached)) {
        const ids = new Set(cached.map(message => message.id));
        CacheService.set(key, [
          ...data.filter(message => !ids.has(message.id)),
          ...cached
        ]);
      } else {
        CacheService.set(key, data);
      }

      return data;
    }

    return getCachedOrFetch<ChatMessage[]>(
      key,
      url,
      CACHE_TTL.messages,
      'Failed to fetch messages'
    );
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
      const cached = CacheService.getData<ChatMessage[]>(key);
      if (cached && Array.isArray(cached)) CacheService.set(key, [...cached, msg]);
      else CacheService.set(key, [msg]);
    } catch {}
    return msg;
  },

  async getProjectIssues(
    projectId: string
  ): Promise<AnnotationIssue[]> {
    const key = CACHE_KEYS.PROJECT_ISSUES(
      CacheService.userId(),
      projectId
    );

    return getCachedOrFetch<AnnotationIssue[]>(
      key,
      `${API_BASE}/projects/${projectId}/issues`,
      CACHE_TTL.issues,
      'Failed to fetch issues'
    );
  },

  async getPinIssue(
    pinId: string
  ): Promise<AnnotationIssue | null> {
    const key = CACHE_KEYS.PIN_ISSUE(
      CacheService.userId(),
      pinId
    );

    const cached = getCacheEntry<AnnotationIssue | null>(key);

    if (cached) {
      const age = Math.max(
        0,
        Date.now() - cached.cachedAt
      );

      if (age < CACHE_TTL.issues) {
        return cached.data;
      }

      void refreshCached<AnnotationIssue | null>(
        key,
        `${API_BASE}/pins/${pinId}/issue`,
        'Failed to fetch issue'
      ).catch(() => {});

      return cached.data;
    }

    try {
      return await refreshCached<AnnotationIssue | null>(
        key,
        `${API_BASE}/pins/${pinId}/issue`,
        'Failed to fetch issue'
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 403
      ) {
        return null;
      }

      throw error;
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

  async getIssueMessages(
    issueId: string
  ): Promise<AnnotationMessage[]> {
    const key = CACHE_KEYS.ISSUE_MESSAGES(
      CacheService.userId(),
      issueId
    );

    const cached = getCacheData<AnnotationMessage[]>(key);

    if (cached && cached.length >= 500) {
      return cached;
    }

    return this.getIssueMessagesPage(
      issueId,
      undefined,
      500
    );
  },

  async getIssueMessagesPage(
    issueId: string,
    before?: string,
    limit = 30
  ): Promise<AnnotationMessage[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const params = new URLSearchParams();

    params.set('limit', String(safeLimit));

    if (before) params.set('before', before);

    const url =
      `${API_BASE}/issues/${issueId}/messages?${params.toString()}`;

    const key = CACHE_KEYS.ISSUE_MESSAGES(
      CacheService.userId(),
      issueId
    );

    // Older pages always go to the server.
    if (before) {
      const data = await fetchJson<AnnotationMessage[]>(
        url,
        'Failed to fetch issue messages'
      );

      const cached = getCacheData<AnnotationMessage[]>(key);

      if (cached && Array.isArray(cached)) {
        const ids = new Set(cached.map(message => message.id));
        CacheService.set(key, [
          ...data.filter(message => !ids.has(message.id)),
          ...cached
        ]);
      } else {
        CacheService.set(key, data);
      }

      return data;
    }

    return getCachedOrFetch<AnnotationMessage[]>(
      key,
      url,
      CACHE_TTL.messages,
      'Failed to fetch issue messages'
    );
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
      const cached = CacheService.getData<AnnotationMessage[]>(key);
      if (cached && Array.isArray(cached)) {
        CacheService.set(key, [...cached, msg]);
      } else {
        CacheService.set(key, [msg]);
      }
    } catch {}
    return msg;
  }
  ,
  // Synchronous cache-read helpers for instant UI hydration.
  getCachedProjects(): ProjectSummary[] | null {
    return getCacheData<ProjectSummary[]>(
      CACHE_KEYS.PROJECTS(CacheService.userId())
    );
  },

  getCachedProject(projectId: string): Project | null {
    return getCacheData<Project>(
      CACHE_KEYS.PROJECT(
        CacheService.userId(),
        projectId
      )
    );
  },

  getCachedPins(
    projectId: string,
    view: 'draft' | 'live' | '' = ''
  ): Pin[] | null {
    if (view === 'live') return null;

    return getCacheData<Pin[]>(
      CACHE_KEYS.PINS(
        CacheService.userId(),
        projectId,
        view || 'default'
      )
    );
  },

  getCachedGroups(): Group[] | null {
    return getCacheData<Group[]>(
      CACHE_KEYS.GROUPS(CacheService.userId())
    );
  },

  getCachedGroupMessages(
    groupId: string,
    subgroupId?: string
  ): ChatMessage[] | null {
    return getCacheData<ChatMessage[]>(
      CACHE_KEYS.GROUP_MESSAGES(
        CacheService.userId(),
        groupId,
        subgroupId || 'general'
      )
    );
  },

  getCachedDirectMessages(
    recipientId: string
  ): ChatMessage[] | null {
    return getCacheData<ChatMessage[]>(
      CACHE_KEYS.DIRECT_MESSAGES(
        CacheService.userId(),
        recipientId
      )
    );
  },

  getCachedMyProfile(): UserProfile | null {
    return getCacheData<UserProfile>(
      CACHE_KEYS.MY_PROFILE(CacheService.userId())
    );
  },

  getCachedProjectAssignees(projectId: string): {
    projectAssignees: AssigneeOption[];
    otherGroups: {
      id: string;
      name: string;
      type: GroupType;
      members: AssigneeOption[];
    }[];
    permissions: {
      isProjectGroupMember: boolean;
      canAssign: boolean;
      canCrossGroupSearch: boolean;
      isTeamMember: boolean;
    };
  } | null {
    return getCacheData(
      CACHE_KEYS.PROJECT_ASSIGNEES(
        CacheService.userId(),
        projectId
      )
    );
  },

  getCachedPinIssue(
    pinId: string
  ): AnnotationIssue | null {
    return getCacheData<AnnotationIssue | null>(
      CACHE_KEYS.PIN_ISSUE(
        CacheService.userId(),
        pinId
      )
    );
  },

  getCachedIssueMessages(
    issueId: string
  ): AnnotationMessage[] | null {
    return getCacheData<AnnotationMessage[]>(
      CACHE_KEYS.ISSUE_MESSAGES(
        CacheService.userId(),
        issueId
      )
    );
  }
};
