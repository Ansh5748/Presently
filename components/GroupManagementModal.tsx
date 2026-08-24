import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Users, Building2, Crown, Shield, UserMinus, Hash, Trash2, Send, Search, MoreVertical, Pencil, Save } from 'lucide-react';
import { ApiService } from '../services/apiService';
import type { Group, GroupMember, Subgroup, GroupType, MemberRole, UserSearchResult, Project } from '../types';

type TabType = 'create' | 'manage';
type ManageSub = 'info' | 'members' | 'subgroups' | 'projects';
type ManageView = { group: Group; sub: ManageSub };

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupChange?: () => void;
  onNavigate?: (path: string) => void;
  defaultTab?: TabType;
  initialGroupId?: string;
  initialSub?: ManageSub;
  lockToGroup?: boolean;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({ isOpen, onClose, onGroupChange, onNavigate, defaultTab, initialGroupId, initialSub, lockToGroup }) => {
  const [tab, setTab] = useState<TabType>('create');
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const [manageView, setManageView] = useState<ManageView | null>(null);

  // Create group form
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('team');
  const [groupDesc, setGroupDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Add member
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('member');
  const [memberDesignation, setMemberDesignation] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');

  // New subgroup
  const [newSubgroupName, setNewSubgroupName] = useState('');
  const [newSubgroupDescription, setNewSubgroupDescription] = useState('');

  const currentUserId = (() => {
    try {
      const u = localStorage.getItem('presently_user');
      if (!u) return '';
      const parsed = JSON.parse(u);
      return (parsed.userId || parsed.id || '').toString();
    } catch { return ''; }
  })();
  const hasLoadedInitialDataRef = useRef(false);

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const loadGroups = useCallback(async (applyInitialSelection?: boolean) => {
    try {
      const g = await ApiService.getGroups();
      setGroups(g);
      if (applyInitialSelection && (initialGroupId || lockToGroup)) {
        const selected = initialGroupId ? g.find(x => x.id === initialGroupId) : g[0];
        if (selected) {
          setManageView({ group: selected, sub: initialSub || 'info' });
          setTab('manage');
        }
        return;
      }
      if (manageView) {
        const refreshed = g.find(x => x.id === manageView.group.id);
        if (refreshed) setManageView({ ...manageView, group: refreshed });
      }
    } catch (e) { console.error(e); }
  }, [initialGroupId, initialSub, lockToGroup, manageView]);

  const loadProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const data = await ApiService.getProjects();
      setProjects(data);
    } catch (e) {
      console.error(e);
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      hasLoadedInitialDataRef.current = false;
      return;
    }

    if (hasLoadedInitialDataRef.current) return;
    hasLoadedInitialDataRef.current = true;

    resetForms();
    setTab(defaultTab || (lockToGroup ? 'manage' : 'create'));

    void Promise.all([
      loadProjects(),
      loadGroups(true)
    ]);
  }, [isOpen, defaultTab, lockToGroup, loadGroups, loadProjects]);

  useEffect(() => {
    if (!memberEmail.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await ApiService.searchUsers(memberEmail);
        setSearchResults(res);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [memberEmail]);

  const resetForms = () => {
    setGroupName('');
    setGroupType('team');
    setGroupDesc('');
    setCreateError('');
    setManageView(null);
    setMemberEmail('');
    setMemberRole('member');
    setMemberDesignation('');
    setSearchResults([]);
    setAddMemberError('');
    setNewSubgroupName('');
    setNewSubgroupDescription('');
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await ApiService.createGroup({ name: groupName.trim(), type: groupType, description: groupDesc.trim() });
      onGroupChange?.();
      setTab('manage');
      loadGroups();
    } catch (e: any) {
      setCreateError(e.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleAddMember = async (groupId: string, preSelectedEmail?: string) => {
    const email = (preSelectedEmail || memberEmail).trim();
    if (!email) return;
    setAddMemberError('');
    try {
      await ApiService.addGroupMember(groupId, { memberEmail: email, role: memberRole, designation: memberDesignation.trim() });
      setMemberEmail('');
      setMemberDesignation('');
      setSearchResults([]);
      loadGroups();
    } catch (e: any) {
      setAddMemberError(e.message || 'Failed to add member');
    }
  };

  const handleUpdateMember = async (groupId: string, memberId: string, updates: { role?: MemberRole; designation?: string }) => {
    try {
      await ApiService.updateGroupMember(groupId, memberId, updates);
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    try {
      await ApiService.removeGroupMember(groupId, memberId);
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleAddSubgroup = async (groupId: string) => {
    if (!newSubgroupName.trim()) return;
    try {
      await ApiService.addSubgroup(groupId, newSubgroupName.trim(), newSubgroupDescription.trim());
      setNewSubgroupName('');
      setNewSubgroupDescription('');
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleUpdateSubgroup = async (groupId: string, subgroupId: string) => {
    if (!newSubgroupName.trim()) return;
    try {
      await ApiService.updateSubgroup(groupId, subgroupId, newSubgroupName.trim(), newSubgroupDescription.trim());
      setNewSubgroupName('');
      setNewSubgroupDescription('');
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleDeleteSubgroup = async (groupId: string, subgroupId: string) => {
    if (!confirm('Delete this subgroup? All its messages will be lost.')) return;
    try {
      await ApiService.deleteSubgroup(groupId, subgroupId);
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleUpdateGroup = async (groupId: string, updates: { name?: string; description?: string }) => {
    try {
      await ApiService.updateGroup(groupId, updates);
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const handleAssignProjectToGroup = async (groupId: string, projectId: string) => {
    try {
      setAssigningProjectId(projectId);
      await ApiService.assignProjectToGroup(groupId, projectId);
      await loadProjects();
      await loadGroups();
      onGroupChange?.();
    } catch (e) {
      console.error(e);
    } finally {
      setAssigningProjectId(null);
    }
  };

  const handleUnassignProjectFromGroup = async (groupId: string, projectId: string) => {
    try {
      setAssigningProjectId(projectId);
      await ApiService.unassignProjectFromGroup(groupId, projectId);
      await loadProjects();
      await loadGroups();
      onGroupChange?.();
    } catch (e) {
      console.error(e);
    } finally {
      setAssigningProjectId(null);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Delete this entire group? This cannot be undone.')) return;
    try {
      await ApiService.deleteGroup(groupId);
      setManageView(null);
      onGroupChange?.();
      loadGroups();
    } catch (e) { console.error(e); }
  };

  const getMemberRoleIcon = (role?: MemberRole) => {
    if (role === 'owner') return <Crown className="w-3.5 h-3.5 text-amber-500" />;
    if (role === 'admin') return <Shield className="w-3.5 h-3.5 text-blue-500" />;
    return null;
  };

  const isOwnerOrAdmin = (group: Group) => {
    const createdById = typeof group.createdBy === 'object' ? group.createdBy._id : group.createdBy;
    const m = group.members.find(x => (typeof x.userId === 'object' ? (x.userId as any)._id : x.userId)?.toString?.() === currentUserId);
    return createdById?.toString?.() === currentUserId ||
      m?.role === 'owner' || m?.role === 'admin';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-indigo-50 to-white">
          {lockToGroup ? (
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>Manage Group</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-lg font-medium text-sm transition ${tab === 'create' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setTab('create')}
              >
                <Plus className="w-4 h-4 inline mr-1.5" />Create Group
              </button>
              <button
                className={`px-4 py-2 rounded-lg font-medium text-sm transition ${tab === 'manage' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => { setTab('manage'); setManageView(null); }}
              >
                <Users className="w-4 h-4 inline mr-1.5" />Manage Groups ({groups.length})
              </button>
            </div>
          )}
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {tab === 'create' ? (
            <div className="p-8 w-full max-w-xl mx-auto">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Create a new group</h2>

              <label className="block text-sm font-medium text-slate-700 mb-2">Group Type</label>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <button
                  className={`p-4 rounded-xl border-2 text-left transition ${groupType === 'team' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                  onClick={() => setGroupType('team')}
                >
                  <Users className={`w-7 h-7 mb-2 ${groupType === 'team' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className={`font-semibold ${groupType === 'team' ? 'text-indigo-700' : 'text-slate-700'}`}>Team Group</div>
                  <div className="text-xs text-slate-500 mt-1">Internal company team members</div>
                </button>
                <button
                  className={`p-4 rounded-xl border-2 text-left transition ${groupType === 'client' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                  onClick={() => setGroupType('client')}
                >
                  <Building2 className={`w-7 h-7 mb-2 ${groupType === 'client' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className={`font-semibold ${groupType === 'client' ? 'text-indigo-700' : 'text-slate-700'}`}>Client Group</div>
                  <div className="text-xs text-slate-500 mt-1">Client team + select members</div>
                </button>
              </div>

              <label className="block text-sm font-medium text-slate-700 mb-2">Group Name</label>
              <input
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none mb-5"
                placeholder={groupType === 'team' ? 'e.g. Our Company Team' : 'e.g. ACME Corp Client Team'}
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
              />

              <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
              <textarea
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none mb-4 resize-none"
                rows={3}
                placeholder="Short description..."
                value={groupDesc}
                onChange={e => setGroupDesc(e.target.value)}
              />

              {createError && <div className="text-red-600 text-sm mb-4">{createError}</div>}

              <button
                onClick={handleCreateGroup}
                disabled={creating || !groupName.trim()}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow"
              >
                {creating ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          ) : (
            <>
              {!lockToGroup && (
                <div className="w-64 border-r bg-slate-50 p-3 overflow-y-auto flex-shrink-0">
                  <div className="text-xs font-semibold uppercase text-slate-500 px-2 py-2">YOUR GROUPS</div>
                  {groups.length === 0 && (
                    <div className="text-xs text-slate-500 p-3 text-center">No groups yet. Create one!</div>
                  )}
                  {groups.map(g => (
                    <div
                      key={g.id}
                      className={`w-full px-3 py-2.5 rounded-lg mb-1 transition ${manageView?.group.id === g.id ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-white text-slate-700'}`}
                    >
                      <div className="flex items-center gap-2">
                        <button onClick={() => setManageView({ group: g, sub: 'info' })} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                          {g.type === 'team' ? <Users className="w-4 h-4 text-indigo-500 flex-shrink-0" /> : <Building2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                          <span className="font-medium text-sm truncate">{g.name}</span>
                        </button>
                      </div>
                      <button onClick={() => setManageView({ group: g, sub: 'info' })} className="w-full text-left">
                        <div className="text-xs text-slate-500 mt-0.5 ml-6">{g.members.length} members · {g.subgroups.length} channels</div>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {!manageView ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <Users className="w-16 h-16 mb-4 opacity-40" />
                    <div className="text-lg">{lockToGroup ? 'Loading group...' : 'Select a group to manage'}</div>
                    <div className="text-sm mt-1">Manage members, roles, subgroups</div>
                  </div>
                ) : (
                  <GroupDetailView
                    group={manageView.group}
                    sub={manageView.sub}
                    setSub={(s) => setManageView({ ...manageView, sub: s })}
                    currentUserId={currentUserId}
                    canEdit={isOwnerOrAdmin(manageView.group)}
                    onNavigate={navigateTo}
                    onClose={onClose}
                    memberEmail={memberEmail}
                    setMemberEmail={setMemberEmail}
                    memberRole={memberRole}
                    setMemberRole={setMemberRole}
                    memberDesignation={memberDesignation}
                    setMemberDesignation={setMemberDesignation}
                    searchResults={searchResults}
                    searching={searching}
                    addMemberError={addMemberError}
                    handleAddMember={handleAddMember}
                    handleUpdateMember={handleUpdateMember}
                    handleRemoveMember={handleRemoveMember}
                    newSubgroupName={newSubgroupName}
                    setNewSubgroupName={setNewSubgroupName}
                    newSubgroupDescription={newSubgroupDescription}
                    setNewSubgroupDescription={setNewSubgroupDescription}
                    handleAddSubgroup={handleAddSubgroup}
                    handleUpdateSubgroup={handleUpdateSubgroup}
                    handleDeleteSubgroup={handleDeleteSubgroup}
                    handleUpdateGroup={handleUpdateGroup}
                    handleAssignProjectToGroup={handleAssignProjectToGroup}
                    handleUnassignProjectFromGroup={handleUnassignProjectFromGroup}
                    handleDeleteGroup={handleDeleteGroup}
                    getMemberRoleIcon={getMemberRoleIcon}
                    projects={projects}
                    projectsLoading={projectsLoading}
                    assigningProjectId={assigningProjectId}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface GroupDetailViewProps {
  group: Group;
  sub: ManageSub;
  setSub: (s: ManageSub) => void;
  currentUserId: string;
  canEdit: boolean;
  onNavigate?: (path: string) => void;
  onClose: () => void;
  memberEmail: string;
  setMemberEmail: (v: string) => void;
  memberRole: MemberRole;
  setMemberRole: (v: MemberRole) => void;
  memberDesignation: string;
  setMemberDesignation: (v: string) => void;
  searchResults: UserSearchResult[];
  searching: boolean;
  addMemberError: string;
  handleAddMember: (groupId: string, email?: string) => Promise<void>;
  handleUpdateMember: (groupId: string, memberId: string, updates: any) => void;
  handleRemoveMember: (groupId: string, memberId: string) => void;
  newSubgroupName: string;
  setNewSubgroupName: (v: string) => void;
  newSubgroupDescription: string;
  setNewSubgroupDescription: (v: string) => void;
  handleAddSubgroup: (groupId: string) => Promise<void>;
  handleUpdateSubgroup: (groupId: string, subgroupId: string) => Promise<void>;
  handleDeleteSubgroup: (groupId: string, subgroupId: string) => void;
  handleUpdateGroup: (groupId: string, updates: any) => Promise<void>;
  handleAssignProjectToGroup: (groupId: string, projectId: string) => Promise<void>;
  handleUnassignProjectFromGroup: (groupId: string, projectId: string) => Promise<void>;
  handleDeleteGroup: (groupId: string) => void;
  getMemberRoleIcon: (r?: MemberRole) => React.ReactNode;
  projects: Project[];
  projectsLoading: boolean;
  assigningProjectId: string | null;
}

const GroupDetailView: React.FC<GroupDetailViewProps> = (props) => {
  const { group, sub, setSub } = props;
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [editingSubgroupId, setEditingSubgroupId] = useState<string | null>(null);
  const [projectQuery, setProjectQuery] = useState('');
  const [showProjectResults, setShowProjectResults] = useState(false);
  const [activeProjectMenuId, setActiveProjectMenuId] = useState<string | null>(null);
  const projectSearchRef = useRef<HTMLDivElement | null>(null);

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState(group.name);
  const [draftGroupDesc, setDraftGroupDesc] = useState(group.description || '');

  const canCreateChannel = props.canEdit;
  const currentMember = group.members.find(m => (typeof m.userId === 'object' ? (m.userId as any)._id : m.userId)?.toString?.() === props.currentUserId);
  const currentDesignation = (currentMember?.designation || '').toString();
  const isPM = /\bpm\b/i.test(currentDesignation) || /product\s*manager/i.test(currentDesignation);
  const canManageProjects = props.canEdit || isPM;

  const uniqueProjectIds = Array.from(new Set(group.projectIds || []));
  const assignedProjects = props.projects.filter(p => uniqueProjectIds.includes(p.id));
  const projectQueryLower = projectQuery.trim().toLowerCase();
  const projectResults = projectQueryLower
    ? props.projects.filter(p => (p.name || '').toLowerCase().includes(projectQueryLower))
    : props.projects.slice(0, 20);

  useEffect(() => {
    if (!showProjectResults) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = projectSearchRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setShowProjectResults(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [showProjectResults]);

  useEffect(() => {
    if (isEditingInfo) return;
    setDraftGroupName(group.name);
    setDraftGroupDesc(group.description || '');
  }, [group.id, group.name, group.description, isEditingInfo]);

  const saveAndExitInfoEditMode = async () => {
    if (!props.canEdit) {
      setIsEditingInfo(false);
      return;
    }
    const safeName = (draftGroupName || '').trim() || group.name;
    await props.handleUpdateGroup(group.id, { name: safeName, description: draftGroupDesc });
    setIsEditingInfo(false);
  };

  const setSubWithAutoSave = async (next: ManageSub) => {
    if (isEditingInfo && next !== 'info') {
      await saveAndExitInfoEditMode();
    }
    setSub(next);
  };

  useEffect(() => {
    return () => {
      if (!isEditingInfo) return;
      if (!props.canEdit) return;
      const safeName = (draftGroupName || '').trim() || group.name;
      void props.handleUpdateGroup(group.id, { name: safeName, description: draftGroupDesc });
    };
  }, [isEditingInfo, draftGroupName, draftGroupDesc, group.id, group.name, props.canEdit]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {group.type === 'team' ? (
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center"><Users className="w-5 h-5 text-indigo-600" /></div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-600" /></div>
            )}
            <div>
              {isEditingInfo ? (
                <input
                  className="text-lg font-bold text-slate-800 bg-transparent border-b border-slate-300 focus:border-indigo-500 outline-none px-0.5 py-0.5 -ml-0.5"
                  value={draftGroupName}
                  onChange={e => setDraftGroupName(e.target.value)}
                  disabled={!props.canEdit}
                />
              ) : (
                <div className="text-lg font-bold text-slate-800">{group.name}</div>
              )}
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 uppercase font-medium">{group.type}</span>
                <span>{group.members.length} members</span>
                {group.projectIds?.length > 0 && <span>· {group.projectIds.length} projects</span>}
              </div>
            </div>
          </div>
          {props.canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (!isEditingInfo) {
                    if (sub !== 'info') setSub('info');
                    setDraftGroupName(group.name);
                    setDraftGroupDesc(group.description || '');
                    setIsEditingInfo(true);
                    return;
                  }
                  await saveAndExitInfoEditMode();
                }}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                title={isEditingInfo ? 'Save' : 'Edit'}
              >
                {isEditingInfo ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              </button>
              <button
                onClick={() => props.handleDeleteGroup(group.id)}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete Group
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-1 -mb-4">
          {(['info', 'members', 'subgroups', 'projects'] as const).map(s => (
            <button
              key={s}
              onClick={() => { void setSubWithAutoSave(s); }}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition ${sub === s ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {s === 'info' && 'ℹ️ Info'}
              {s === 'members' && `👥 Members (${group.members.length})`}
              {s === 'subgroups' && `📢 Channels (${group.subgroups.length})`}
              {s === 'projects' && `📁 Projects`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {sub === 'info' && (
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Description</label>
            {isEditingInfo ? (
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-sm"
                rows={4}
                value={draftGroupDesc}
                onChange={e => setDraftGroupDesc(e.target.value)}
                disabled={!props.canEdit}
                placeholder="Add a description..."
              />
            ) : (
              <div className="px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap min-h-[108px]">
                {(group.description || '').trim() ? group.description : 'No description.'}
              </div>
            )}
            {!props.canEdit && <div className="text-xs text-slate-400 mt-2">Only group owners/admins can edit.</div>}
          </div>
        )}

        {sub === 'members' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-700">Members</div>
              {props.canEdit && (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  title="Add member"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {showAddMember && props.canEdit && (
              <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" />Add Member
                  </div>
                  <button
                    onClick={() => { setShowAddMember(false); props.setMemberEmail(''); props.setMemberDesignation(''); }}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-3 relative">
                  <div className="col-span-5 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                      placeholder="Search by email or name..."
                      value={props.memberEmail}
                      onChange={e => props.setMemberEmail(e.target.value)}
                    />
                    {props.searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">...</div>}
                    {props.searchResults.length > 0 && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-xl border border-slate-200 z-20 max-h-48 overflow-y-auto">
                        {props.searchResults.map(u => (
                          <button
                            key={u._id}
                            onClick={async () => { await props.handleAddMember(group.id, u.email); setShowAddMember(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium text-slate-700">{u.name}</div>
                              <div className="text-xs text-slate-500">{u.email}</div>
                            </div>
                            <Send className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    className="col-span-2 px-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                    value={props.memberRole}
                    onChange={e => props.setMemberRole(e.target.value as MemberRole)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input
                    className="col-span-4 px-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                    placeholder="Designation (e.g. PM, Designer)"
                    value={props.memberDesignation}
                    onChange={e => props.setMemberDesignation(e.target.value)}
                  />
                  <button
                    onClick={async () => { await props.handleAddMember(group.id); setShowAddMember(false); }}
                    className="col-span-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                    disabled={!props.memberEmail.trim()}
                  >
                    Add
                  </button>
                </div>
                {props.addMemberError && <div className="text-red-600 text-xs mt-2">{props.addMemberError}</div>}
                <div className="text-xs text-slate-500 mt-2">User must already have signed up to be added.</div>
              </div>
            )}

            {!props.canEdit && (
              <div className="text-xs text-slate-400 mb-4">Only group owners/admins can add or remove members.</div>
            )}

            <div className="space-y-2">
              {group.members.map((m) => (
                <MemberRow key={(typeof m.userId === 'object' ? (m.userId as any)._id : m.userId).toString()} group={group} member={m} props={props} />
              ))}
            </div>
          </div>
        )}

        {sub === 'projects' && (
          <div>
            {canManageProjects ? (
              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <div ref={projectSearchRef} className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                      placeholder="Search projects by name..."
                      value={projectQuery}
                      onChange={(e) => { setProjectQuery(e.target.value); setShowProjectResults(true); }}
                      onFocus={() => setShowProjectResults(true)}
                    />
                    {showProjectResults && !props.projectsLoading && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-xl border border-slate-200 z-20 max-h-64 overflow-y-auto">
                        {projectResults.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No matching projects.</div>
                        ) : (
                          projectResults.map(p => {
                            const isAssigned = uniqueProjectIds.includes(p.id);
                            const pageCount = p.pages?.length || 0;
                            return (
                              <button
                                key={p.id}
                                disabled={isAssigned || props.assigningProjectId === p.id}
                                onClick={async () => {
                                  await props.handleAssignProjectToGroup(group.id, p.id);
                                  setProjectQuery('');
                                  setShowProjectResults(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-slate-100 last:border-b-0 ${isAssigned ? 'bg-slate-50 text-slate-400' : 'hover:bg-indigo-50 text-slate-700'}`}
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{p.name}</div>
                                  <div className="text-xs text-slate-500 truncate">{p.clientName || 'No client'} · {pageCount} pages</div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isAssigned ? (
                                    <span className="text-xs font-medium text-emerald-600">Assigned</span>
                                  ) : (
                                    <Plus className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowProjectResults(true)}
                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    title="Add project"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-2">A project can be assigned to multiple groups.</div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 mb-4">Only owners/admins/Product Managers can assign or remove projects.</div>
            )}

            {props.projectsLoading ? (
              <div className="text-sm text-slate-500">Loading projects...</div>
            ) : assignedProjects.length === 0 ? (
              <div className="text-sm text-slate-500">No projects assigned to this group yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedProjects.map(project => {
                  const coverImage = project.pages?.[0]?.imageUrl;
                  const pageCount = project.pages?.length || 0;
                  const menuOpen = activeProjectMenuId === project.id;
                  return (
                    <div
                      key={project.id}
                      onClick={() => { props.onNavigate?.(`/project/${project.id}`); props.onClose(); }}
                      className="group bg-white rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer overflow-hidden relative"
                    >
                      <div className="h-32 bg-slate-100 overflow-hidden relative">
                        {coverImage ? (
                          <img src={coverImage} alt={project.name} className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 text-sm">No Image</div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-1">
                          {canManageProjects && (
                            <button
                              onClick={async (e) => { e.stopPropagation(); await props.handleUnassignProjectFromGroup(group.id, project.id); }}
                              disabled={props.assigningProjectId === project.id}
                              className="p-1.5 bg-white/90 hover:bg-white text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 shadow-sm transition disabled:opacity-50"
                              title="Remove from group"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveProjectMenuId(menuOpen ? null : project.id); }}
                            className="p-1.5 bg-white/90 hover:bg-white text-slate-500 rounded-lg border border-slate-200 shadow-sm transition"
                            title="Open menu"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="absolute bottom-2 left-2">
                          <span className="bg-slate-900/70 text-white text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                            {pageCount} Pages
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-base text-slate-900 line-clamp-1">{project.name}</h3>
                        <p className="text-sm text-slate-500">{project.clientName || 'No Client Specified'}</p>
                      </div>

                      {menuOpen && (
                        <div
                          className="absolute top-10 right-2 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-30 w-40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { props.onNavigate?.(`/project/${project.id}`); props.onClose(); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            Project
                          </button>
                          <button
                            onClick={() => { props.onNavigate?.(`/draft/${project.id}`); props.onClose(); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            Draft
                          </button>
                          <button
                            onClick={() => { props.onNavigate?.(`/live/${project.id}`); props.onClose(); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            Live
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {sub === 'subgroups' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-700">Channels</div>
              {canCreateChannel && (
                <button
                  onClick={() => { setEditingSubgroupId(null); props.setNewSubgroupName(''); props.setNewSubgroupDescription(''); setShowCreateChannel(true); }}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  title="Create channel"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {showCreateChannel && canCreateChannel && (
              <div className="mb-6">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Hash className="w-4 h-4" />{editingSubgroupId ? 'Edit channel' : 'New channel'}
                    </div>
                    <button
                      onClick={() => { setShowCreateChannel(false); setEditingSubgroupId(null); props.setNewSubgroupName(''); props.setNewSubgroupDescription(''); }}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                      placeholder="Channel name (e.g. meeting, party)"
                      value={props.newSubgroupName}
                      onChange={e => props.setNewSubgroupName(e.target.value)}
                    />
                    <textarea
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm resize-none"
                      rows={3}
                      placeholder="Description (optional)"
                      value={props.newSubgroupDescription}
                      onChange={e => props.setNewSubgroupDescription(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          if (editingSubgroupId) {
                            await props.handleUpdateSubgroup(group.id, editingSubgroupId);
                          } else {
                            await props.handleAddSubgroup(group.id);
                          }
                          setShowCreateChannel(false);
                          setEditingSubgroupId(null);
                        }}
                        disabled={!props.newSubgroupName.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        {editingSubgroupId ? 'Update channel' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {group.subgroups.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                <Hash className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <div className="text-sm">No channels yet</div>
                <div className="text-xs mt-1">Create channels like #meeting, #party</div>
              </div>
            ) : (
              <div className="space-y-2">
                {group.subgroups.map(sg => (
                  <div
                    key={sg.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                    onClick={() => { props.onNavigate?.(`/chats/${group.id}/${sg.id}`); props.onClose(); }}
                  >
                    <Hash className="w-4 h-4 text-slate-400" />
                    <div className="flex-1">
                      <div className="font-medium text-slate-700">{sg.name}</div>
                      {sg.description && <div className="text-xs text-slate-500 mt-0.5">{sg.description}</div>}
                      {sg.createdAt && <div className="text-xs text-slate-400">Created {new Date(sg.createdAt).toLocaleDateString()}</div>}
                    </div>
                    {props.canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSubgroupId(sg.id);
                            props.setNewSubgroupName(sg.name);
                            props.setNewSubgroupDescription(sg.description || '');
                            setShowCreateChannel(true);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                          title="Edit channel"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); props.handleDeleteSubgroup(group.id, sg.id); }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete channel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MemberRow: React.FC<{ group: Group; member: GroupMember; props: GroupDetailViewProps }> = ({ group, member, props }) => {
  const [designation, setDesignation] = useState(member.designation || '');
  const [role, setRole] = useState<MemberRole>(member.role);
  const [isEditing, setIsEditing] = useState(false);
  const userObj = typeof member.userId === 'object' ? (member.userId as any) : null;
  const memberUserId = (userObj?._id || member.userId).toString();
  const name = userObj?.name || (member as any).name || memberUserId.slice(-6);
  const email = userObj?.email || (member as any).email || '';

  const isCurrentUser = memberUserId === props.currentUserId;
  const createdById = typeof group.createdBy === 'object' ? (group.createdBy as any)._id : group.createdBy;
  const isOwner = member.role === 'owner' || createdById?.toString?.() === memberUserId;
  const roleLabel = isOwner ? 'Owner' : (role === 'admin' ? 'Admin' : '');

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
      onClick={() => {
        if (isEditing) return;
        props.onNavigate?.(`/chats/${memberUserId}`);
        props.onClose();
      }}
    >
      {userObj?.avatarUrl ? (
        <img src={userObj.avatarUrl} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${isOwner ? 'from-amber-400 to-orange-500' : 'from-indigo-400 to-purple-500'} text-white flex items-center justify-center font-semibold text-sm flex-shrink-0`}>
          {name ? name.toString().charAt(0).toUpperCase() : '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="font-medium text-slate-700 truncate">{name}</div>
          {props.getMemberRoleIcon(isOwner ? 'owner' : role)}
          {isCurrentUser && <span className="text-xs text-indigo-600 font-medium">(you)</span>}
        </div>
        {roleLabel && <div className="text-[11px] font-semibold text-slate-600">{roleLabel}</div>}
        {designation && <div className="text-xs text-slate-500 truncate">{designation}</div>}
        {email && <div className="text-xs text-slate-400 truncate">{email}</div>}
      </div>

      {props.canEdit && !isOwner && (
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              <select
                value={role}
                onChange={e => setRole(e.target.value as MemberRole)}
                onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1.5 rounded-md border border-slate-200 bg-white text-xs focus:border-indigo-500 outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <input
                className="w-40 px-2 py-1.5 rounded-md border border-slate-200 text-xs focus:border-indigo-500 outline-none"
                placeholder="Designation..."
                value={designation}
                onChange={e => setDesignation(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
              />
              {!isCurrentUser && (
                <button
                  onClick={(e) => { e.stopPropagation(); props.handleRemoveMember(group.id, memberUserId); }}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                  title="Remove member"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing) {
                props.handleUpdateMember(group.id, memberUserId, { role, designation });
                setIsEditing(false);
                return;
              }
              setIsEditing(true);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
            title={isEditing ? 'Save' : 'Edit'}
          >
            {isEditing ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
};
