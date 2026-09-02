import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Hash, Users, Building2, ChevronDown, ChevronRight, Menu, Send, Eye, Shield, Settings, Plus, UserCircle, ArrowLeft, ChevronUp, X, Pencil, Save, Loader2 } from 'lucide-react';
import { ApiService } from '../services/apiService';
import { GroupManagementModal } from './GroupManagementModal';
import type { Group, ChatMessage, Subgroup, UserSearchResult, UserProfile } from '../types';
import { getTimeZoneOptions, normalizeTimeZoneId } from '../services/timezones';

interface GroupsChatViewProps {
  onClose?: () => void;
  onNavigate?: (path: string) => void;
  path?: string;
}

type ChatTarget =
  | { kind: 'group'; groupId: string; subgroupId: string | null; groupName: string }
  | { kind: 'direct'; recipientId: string; recipientName: string; recipientEmail: string };

interface DMUser {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

export const GroupsChatView: React.FC<GroupsChatViewProps> = ({ onClose, onNavigate, path }) => {
  const getStoredUser = () => {
    try {
      const u = localStorage.getItem('presently_user');
      if (!u) {
        return { userId: '', name: 'You', email: '', avatarUrl: '' };
      }
      const parsed = JSON.parse(u);
      return {
        userId: (parsed.userId || parsed.id || '').toString(),
        name: parsed.name || 'You',
        email: parsed.email || '',
        avatarUrl: parsed.avatarUrl || ''
      };
    } catch {
      return { userId: '', name: 'You', email: '', avatarUrl: '' };
    }
  };

  const currentUser = getStoredUser();
  const currentUserId = currentUser.userId;
  const currentUserName = currentUser.name;
  const currentUserEmail = currentUser.email;
  const currentUserAvatar = currentUser.avatarUrl;
  const getSelfAvatar = () => profile?.avatarUrl || currentUserAvatar || getStoredUser().avatarUrl;
  const initRef = useRef(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<ChatTarget | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  // Visibility selection removed: group messages are scoped to the group by default
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const [showDMInput, setShowDMInput] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmResults, setDmResults] = useState<UserSearchResult[]>([]);
  const [dmUsers, setDmUsers] = useState<DMUser[]>([]);

  const [showManageGroup, setShowManageGroup] = useState(false);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<Partial<UserProfile>>({});
  const [profileEditing, setProfileEditing] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timeZoneRef = useRef<HTMLDivElement>(null);
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);
  const [timeZoneQuery, setTimeZoneQuery] = useState('');
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);
  const normalizedTimeZone = normalizeTimeZoneId((profileDraft.timeZone || '').toString());
  const selectedTimeZone = useMemo(() => {
    if (!normalizedTimeZone) return null;
    return timeZoneOptions.find(o => o.value === normalizedTimeZone) || null;
  }, [timeZoneOptions, normalizedTimeZone]);
  const filteredTimeZones = useMemo(() => {
    const q = (timeZoneQuery || '').trim().toLowerCase();
    if (!q) return timeZoneOptions.slice(0, 60);
    return timeZoneOptions.filter(o => o.searchText.includes(q)).slice(0, 60);
  }, [timeZoneOptions, timeZoneQuery]);

  const loadGroups = useCallback(async () => {
    try {
      // Prefill from cache for snappy UI
      const cached = ApiService.getCachedGroups && ApiService.getCachedGroups();
      if (cached && cached.length) {
        setGroups(cached);
        setExpandedGroups(prev => {
          const next: Record<string, boolean> = { ...prev };
          cached.forEach(g => { if (!(g.id in next)) next[g.id] = true; });
          return next;
        });
      }

      const gs = await ApiService.getGroups();
      setGroups(gs);
      setExpandedGroups(prev => {
        const next: Record<string, boolean> = { ...prev };
        gs.forEach(g => { if (!(g.id in next)) next[g.id] = true; });
        return next;
      });
    } catch (e) { console.error(e); }
    finally { setGroupsLoaded(true); }
  }, []);

  const loadDMs = useCallback(async () => {
    const selfUser = {
      _id: currentUserId,
      name: profile?.name || currentUserName,
      email: profile?.email || currentUserEmail,
      avatarUrl: getSelfAvatar()
    };

    try {
      const all = await ApiService.searchUsers('');
      const filtered = all.filter(u => u._id !== currentUserId);
      setDmUsers([selfUser, ...filtered.slice(0, 29)].map(u => ({ ...u })));
    } catch (e) {
      setDmUsers([selfUser]);
      console.error(e);
    }
  }, [currentUserId, currentUserName, currentUserEmail, profile?.name, profile?.email, profile?.avatarUrl]);

  const loadUserProfile = useCallback(async () => {
    try {
      const p = await ApiService.getMyProfile();
      setProfile(p);
      setProfileDraft({
        _id: p._id,
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        timeZone: p.timeZone || '',
        workingTimeStart: p.workingTimeStart || '',
        workingTimeEnd: p.workingTimeEnd || '',
        statusText: p.statusText || '',
        about: p.about || '',
        avatarUrl: p.avatarUrl || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      });
      try {
        const raw = localStorage.getItem('presently_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.name = p.name || parsed.name;
          parsed.avatarUrl = p.avatarUrl || '';
          parsed.statusText = p.statusText || '';
          localStorage.setItem('presently_user', JSON.stringify(parsed));
        }
      } catch {}
      setDmUsers(prev => {
        const rest = prev.filter(u => u._id !== p._id);
        const selfEntry: DMUser = {
          _id: p._id,
          name: p.name || (prev.find(u => u._id === p._id)?.name) || currentUserName,
          email: p.email || (prev.find(u => u._id === p._id)?.email) || currentUserEmail,
          avatarUrl: p.avatarUrl || ''
        };
        return [selfEntry, ...rest];
      });
    } catch (e) {
      console.error(e);
    }
  }, [currentUserEmail, currentUserName]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      await Promise.all([
        loadUserProfile(),
        loadGroups(),
        loadDMs()
      ]);
    };

    void init();
  }, [loadGroups, loadDMs, loadUserProfile]);

  useEffect(() => {
    if (!target) {
      setMessages([]);
      return;
    }
    // Immediately clear previous messages and show loading state
    setMessages([]);
    setLoadingMessages(true);
    void loadMessages();
  }, [target]);

  useEffect(() => {
    const p = path || window.location.pathname;
    if (!p.startsWith('/chats')) return;
    if (!groupsLoaded) return;

    const parts = p.split('/').filter(Boolean);
    if (parts.length < 2) return;

    const first = parts[1];
    let nextTarget: ChatTarget | null = null;

    if (parts.length >= 3) {
      const g = groups.find(x => x.id === first);
      if (!g) return;
      const sgId = parts[2];
      const sg = (g.subgroups || []).find(s => s.id === sgId);
      nextTarget = { kind: 'group', groupId: g.id, subgroupId: sg ? sg.id : null, groupName: g.name + ' · ' + (sg ? sg.name : 'General') };
    } else {
      const g = groups.find(x => x.id === first);
      if (g) {
        nextTarget = { kind: 'group', groupId: g.id, subgroupId: null, groupName: g.name + ' · General' };
      } else {
        const u = dmUsers.find(x => x._id === first);
        if (u) {
          nextTarget = { kind: 'direct', recipientId: u._id, recipientName: u.name, recipientEmail: u.email };
        } else {
          let foundName = '';
          let foundEmail = '';
          for (const gg of groups) {
            for (const m of gg.members || []) {
              const userObj = typeof (m as any).userId === 'object' ? (m as any).userId : null;
              const memberId = (userObj?._id || (m as any).userId)?.toString?.();
              if (memberId !== first) continue;
              foundName = userObj?.name || (m as any).name || '';
              foundEmail = userObj?.email || (m as any).email || '';
              break;
            }
            if (foundName || foundEmail) break;
          }

          const displayName = foundName || first.slice(-6);
          nextTarget = { kind: 'direct', recipientId: first, recipientName: displayName, recipientEmail: foundEmail };
          if (foundName || foundEmail) {
            setDmUsers(prev => prev.some(x => x._id === first) ? prev : [{ _id: first, name: displayName, email: foundEmail }, ...prev]);
          }
        }
      }
    }

    setTarget(prev => {
      if (!nextTarget) return prev;
      if (!prev) return nextTarget;
      if (nextTarget.kind === 'group' && prev.kind === 'group') {
        return prev.groupId === nextTarget.groupId && prev.subgroupId === nextTarget.subgroupId ? prev : nextTarget;
      }
      if (nextTarget.kind === 'direct' && prev.kind === 'direct') {
        return prev.recipientId === nextTarget.recipientId ? prev : nextTarget;
      }
      return nextTarget;
    });
  }, [path, groups, groupsLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!dmSearch.trim()) { setDmResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await ApiService.searchUsers(dmSearch);
        setDmResults(r.filter(u => u._id !== currentUserId));
      } catch { setDmResults([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [dmSearch]);

  const loadMessages = async () => {
    if (!target) return;
    setLoadingMessages(true);
    try {
      let msgs: ChatMessage[] = [];
      // Try cached messages first
      if (target.kind === 'group') {
        const cached = ApiService.getCachedGroupMessages && ApiService.getCachedGroupMessages(target.groupId, target.subgroupId || undefined);
        if (cached && cached.length) setMessages(cached);
        msgs = await ApiService.getGroupMessages(target.groupId, target.subgroupId || undefined);
      } else {
        const cached = ApiService.getCachedDirectMessages && ApiService.getCachedDirectMessages(target.recipientId);
        if (cached && cached.length) setMessages(cached);
        msgs = await ApiService.getDirectMessages(target.recipientId);
      }
      setMessages(msgs);
    } catch (e) {
      console.error(e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text || !target) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderId: currentUserId,
      senderName: currentUserName,
      senderAvatar: getSelfAvatar(),
      content: text,
      createdAt: new Date().toISOString()
    } as any;

    setMessages(prev => [...prev, optimisticMsg]);
    setMessageText('');
    setSending(true);

    try {
      let msg: ChatMessage;
      if (target.kind === 'group') {
        msg = await ApiService.sendGroupMessage(target.groupId, {
          content: text,
          subgroupId: target.subgroupId || undefined
        });
      } else {
        msg = await ApiService.sendDirectMessage(target.recipientId, text);
      }
      setMessages(prev => prev.map(m => m.id === tempId ? msg : m));
    } catch (e) {
      console.error(e);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const setTargetAndRoute = (t: ChatTarget) => {
    setTarget(t);
    setMobileSidebarOpen(false);
    if (!onNavigate) return;
    if (t.kind === 'group') {
      const nextPath = t.subgroupId ? `/chats/${t.groupId}/${t.subgroupId}` : `/chats/${t.groupId}`;
      if (window.location.pathname !== nextPath) onNavigate(nextPath);
      return;
    }
    const nextPath = `/chats/${t.recipientId}`;
    if (window.location.pathname !== nextPath) onNavigate(nextPath);
  };

  const openManageGroup = (groupId: string) => {
    setManageGroupId(groupId);
    setShowManageGroup(true);
  };

  const openProfile = async () => {
    setShowProfile(true);
    setProfileEditing(false);
    setProfileLoading(true);
    try {
      const p = await ApiService.getMyProfile();
      setProfile(p);
      setProfileDraft({
        _id: p._id,
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        timeZone: p.timeZone || '',
        workingTimeStart: p.workingTimeStart || '',
        workingTimeEnd: p.workingTimeEnd || '',
        statusText: p.statusText || '',
        about: p.about || '',
        avatarUrl: p.avatarUrl || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      });
    } catch (e) {
      const fallback: UserProfile = { _id: currentUserId, name: currentUserName, email: currentUserEmail };
      setProfile(fallback);
      setProfileDraft({ ...fallback });
      console.error(e);
    } finally {
      setProfileLoading(false);
    }
  };

  const closeProfile = () => {
    setShowProfile(false);
    setProfileEditing(false);
    setTimeZoneOpen(false);
    setTimeZoneQuery('');
  };

  const saveProfile = async () => {
    setProfileLoading(true);
    try {
      const updated = await ApiService.updateMyProfile({
        name: (profileDraft.name || '').toString(),
        phone: (profileDraft.phone || '').toString(),
        timeZone: (profileDraft.timeZone || '').toString(),
        workingTimeStart: (profileDraft.workingTimeStart || '').toString(),
        workingTimeEnd: (profileDraft.workingTimeEnd || '').toString(),
        statusText: (profileDraft.statusText || '').toString(),
        about: (profileDraft.about || '').toString(),
        avatarUrl: (profileDraft.avatarUrl || '').toString()
      });
      setProfile(updated);
      setProfileDraft({
        _id: updated._id,
        name: updated.name || '',
        email: updated.email || '',
        phone: updated.phone || '',
        timeZone: updated.timeZone || '',
        workingTimeStart: updated.workingTimeStart || '',
        workingTimeEnd: updated.workingTimeEnd || '',
        statusText: updated.statusText || '',
        about: updated.about || '',
        avatarUrl: updated.avatarUrl || '',
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      });
      setProfileEditing(false);
      try {
        const raw = localStorage.getItem('presently_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.name = updated.name;
          parsed.avatarUrl = updated.avatarUrl || '';
          parsed.statusText = updated.statusText || '';
          localStorage.setItem('presently_user', JSON.stringify(parsed));
          setDmUsers(prev => prev.map(u => u._id === currentUserId ? { ...u, name: updated.name || u.name, avatarUrl: updated.avatarUrl || u.avatarUrl } : u));
        }
      } catch { }
    } catch (e) {
      console.error(e);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!showProfile) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = profileRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        closeProfile();
        return;
      }
      if (timeZoneRef.current && !timeZoneRef.current.contains(e.target as Node)) {
        setTimeZoneOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [showProfile]);

  useEffect(() => {
  if (!showProfile) return;

  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  return () => {
    document.body.style.overflow = originalOverflow;
  };
}, [showProfile]);

  useEffect(() => {
    if (profileEditing) return;
    setTimeZoneOpen(false);
    setTimeZoneQuery('');
  }, [profileEditing]);

  const isTeamGroup = (g: Group) => g.type === 'team';
  const isTeamMember = (() => groups.some(g => g.type === 'team' && g.members.some(m => (typeof m.userId === 'object' ? (m.userId as any)._id : m.userId)?.toString?.() === currentUserId)));

  const getSenderName = (senderId: any) => {
    if (typeof senderId === 'object' && senderId.name) return senderId.name;
    if (senderId === currentUserId) return currentUserName;
    return senderId?.toString?.()?.slice(-6) || 'Unknown';
  };

  const getSenderInitial = (senderId: any) => getSenderName(senderId).charAt(0).toUpperCase();

  const isTeamGroupView = () => {
    if (target?.kind !== 'group') return false;
    const g = groups.find(x => x.id === target.groupId);
    return !!g && isTeamGroup(g);
  };

  const handleAvatarUpload = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string') return;
          setProfileDraft(prev => ({ ...prev, avatarUrl: result }));
        };
        reader.readAsDataURL(file);
    };

  return (
    <>
      <div className="w-full h-full flex bg-slate-50 overflow-hidden min-w-0">
      {/* Sidebar */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40
            w-full bg-slate-800 text-slate-100 flex flex-col
            border-r border-slate-700
            transition-transform duration-300 ease-in-out
            ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}

            md:relative md:inset-auto md:left-auto md:top-auto md:bottom-auto md:z-auto
            md:w-72 md:flex-shrink-0 md:translate-x-0
          `}
        >
        <div className="p-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-400" />
            <span className="font-bold text-lg">Channels</span>
          </div>
          <div className="flex gap-1">
            {onNavigate && (
              <button onClick={() => onNavigate('/')} className="p-1.5 hover:bg-slate-700 rounded transition text-slate-300" title="Dashboard">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition text-slate-300">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden p-1.5 hover:bg-slate-700 rounded transition text-slate-300"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!groupsLoaded ? (
            <div className="p-5 text-center text-slate-400 text-sm">
              Loading channels...
            </div>
          ) : groups.length === 0 ? (
            <div className="p-5 text-center text-slate-400 text-sm">
              No groups yet.<br />Create groups to start collaborating!
            </div>
          ) : null}
          {groups.map(g => (
            <div key={g.id} className="mb-1">
              <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/60">
                <button
                  onClick={() => toggleGroup(g.id)}
                  className="p-1 rounded hover:bg-slate-700/60 transition"
                  title={expandedGroups[g.id] ? 'Collapse' : 'Expand'}
                >
                  {expandedGroups[g.id] ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <button
                  onClick={() => openManageGroup(g.id)}
                  className="flex items-center gap-2 text-left flex-1 min-w-0"
                  title="Manage group"
                >
                  {g.type === 'team' ? <Users className="w-4 h-4 text-indigo-400 flex-shrink-0" /> : <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                  <span className="text-sm font-medium truncate flex-1">{g.name}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0">{g.members.length}</span>
                </button>
                <button
                  onClick={() => openManageGroup(g.id)}
                  className="p-1 rounded hover:bg-slate-700/60 transition text-slate-300"
                  title="Manage group"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {expandedGroups[g.id] && (
                <div className="pl-5">
                  <button
                    onClick={() => setTargetAndRoute({ kind: 'group', groupId: g.id, subgroupId: null, groupName: g.name + ' · General' })}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-slate-700/60 ${target?.kind === 'group' && target.groupId === g.id && !target.subgroupId ? 'bg-slate-700 text-white' : 'text-slate-300'}`}
                  >
                    <Hash className="w-3.5 h-3.5 text-slate-400" />General
                  </button>
                  {Array.from(
                    new Map(
                      (g.subgroups || [])
                        .filter(sg => (sg.name || '').trim().toLowerCase() !== 'general')
                        .map(sg => [sg.id || sg.name, sg])
                    ).values()
                  ).map((sg: Subgroup) => (
                    <button
                      key={sg.id || sg.name}
                      onClick={() => setTargetAndRoute({ kind: 'group', groupId: g.id, subgroupId: sg.id, groupName: g.name + ' · ' + sg.name })}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-sm hover:bg-slate-700/60 ${target?.kind === 'group' && target.groupId === g.id && target.subgroupId === sg.id ? 'bg-slate-700 text-white' : 'text-slate-300'}`}
                    >
                      <Hash className="w-3.5 h-3.5 text-slate-400" />{sg.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="mt-5 px-3 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Direct Messages</span>
            <button onClick={() => setShowDMInput(!showDMInput)} className="p-1 hover:bg-slate-700 rounded transition">
              <Plus className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {showDMInput && (
            <div className="px-3 mb-3 relative">
              <input
                className="w-full px-3 py-2 bg-slate-900 rounded-md border border-slate-700 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500"
                placeholder="Search user by email..."
                value={dmSearch}
                onChange={e => setDmSearch(e.target.value)}
                autoFocus
              />
              {dmResults.length > 0 && (
                <div className="absolute top-full mt-1 left-3 right-3 bg-slate-900 rounded-md shadow-xl border border-slate-700 z-30 max-h-48 overflow-y-auto">
                  {dmResults.map(u => (
                    <button
                      key={u._id}
                      onClick={() => {
                        setTargetAndRoute({ kind: 'direct', recipientId: u._id, recipientName: u.name, recipientEmail: u.email });
                        setShowDMInput(false);
                        setDmSearch('');
                        setDmResults([]);
                        setDmUsers(prev => prev.find(x => x._id === u._id) ? prev : [u, ...prev]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm border-b border-slate-700 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-indigo-400" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-100 truncate">{u.name}</div>
                          <div className="text-xs text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-2">
            {dmUsers.map(u => {
              const avatarSource = u._id === currentUserId ? (getSelfAvatar() || u.avatarUrl) : u.avatarUrl;
              return (
                <button
                  key={u._id}
                  onClick={() => setTargetAndRoute({ kind: 'direct', recipientId: u._id, recipientName: u.name, recipientEmail: u.email })}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-slate-700/60 ${target?.kind === 'direct' && target.recipientId === u._id ? 'bg-slate-700 text-white' : 'text-slate-300'}`}
                >
                  {avatarSource ? (
                    <img src={avatarSource} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate text-sm">{u.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-t border-slate-700 bg-slate-900">
          <button
          onClick={openProfile}
          className="w-full flex items-center gap-2 hover:bg-slate-700 rounded-lg p-2 transition"
          >
          {profile?.avatarUrl || currentUserAvatar ? (
            <img src={profile?.avatarUrl || currentUserAvatar} alt={currentUserName} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-sm font-semibold flex items-center justify-center">
              {(profileDraft.name || currentUserName).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">
            {currentUserName}
          </div>
        <div className="text-xs text-slate-400 truncate">
          {profile?.statusText || "DND"}
        </div>
      </div>
      <UserCircle className="w-5 h-5 text-slate-400" />
      </button>
    </div>
  </div>

      {/* Main Chat */}
        <div className="flex-1 min-w-0 max-w-full flex flex-col overflow-hidden">
          <div className="md:hidden h-12 flex items-center px-3 border-b bg-white flex-shrink-0">
            {onNavigate && (
              <button
                onClick={() => onNavigate('/')}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 flex-shrink-0"
                title="Dashboard"
                aria-label="Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <span className="ml-2 font-semibold text-slate-700">
              Channels
            </span>

            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="ml-auto p-2 rounded-lg hover:bg-slate-100 text-slate-600 flex-shrink-0"
              title="Open channels"
              aria-label="Open channels"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        {!target ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <MessageCircle className="w-20 h-20 mb-6 opacity-20" />
            <h2 className="text-2xl font-bold text-slate-600 mb-2">Welcome to Channels</h2>
            <p className="text-center max-w-md">
              Select a group channel or start a direct message to begin collaborating with your team and clients.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 sm:px-6 py-3 border-b bg-white flex items-center gap-3 flex-shrink-0 min-w-0">
              {target.kind === 'group' ? (
                <>
                  <Hash className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="font-semibold text-slate-800">{target.groupName}</div>
                    <div className="text-xs text-slate-500">
                      {target.subgroupId ? 'Channel' : 'General channel'} · Anyone with access
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {(() => {
                    const isSelf = target.recipientId === currentUserId;
                    const recipientAvatar = isSelf
                      ? getSelfAvatar() || dmUsers.find(u => u._id === target.recipientId)?.avatarUrl
                      : dmUsers.find(u => u._id === target.recipientId)?.avatarUrl;
                    return recipientAvatar ? (
                      <img src={recipientAvatar} alt={target.recipientName} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-sm font-semibold flex items-center justify-center">
                        {target.recipientName.charAt(0).toUpperCase()}
                      </div>
                    );
                  })()}
                  <div>
                    <div className="font-semibold text-slate-800">{target.recipientName}</div>
                    <div className="text-xs text-slate-500">{target.recipientEmail} · Direct message</div>
                  </div>
                </>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-white to-slate-50 relative">
              {loadingMessages && (
                <div className="absolute left-0 right-0 top-2 flex justify-center z-10 pointer-events-none">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 text-xs text-slate-600 shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Refreshing...
                  </div>
                </div>
              )}
              {loadingMessages && messages.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">Loading messages...</div>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">
                  No messages yet. Start the conversation!
                </div>
              )}
              {messages.map(m => {
                const mine = (typeof m.senderId === 'object' ? m.senderId._id : m.senderId) === currentUserId;
                const senderAvatar = typeof m.senderId === 'object'
                  ? (m.senderId as any).avatarUrl
                  : (mine ? (profile?.avatarUrl || currentUserAvatar || getStoredUser().avatarUrl) : undefined);
                return (
                  <div key={m.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                    {senderAvatar ? (
                      <img src={senderAvatar} alt={getSenderName(m.senderId)} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${mine ? 'from-indigo-500 to-purple-600' : 'from-emerald-400 to-teal-500'} text-white text-xs font-semibold flex items-center justify-center flex-shrink-0`}>
                        {getSenderInitial(m.senderId)}
                      </div>
                    )}
                    <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col min-w-0`}>
                      <div className={`flex items-center gap-2 text-xs text-slate-500 mb-1 ${mine ? 'flex-row-reverse' : ''}`}>
                        <span className="font-medium text-slate-600">{getSenderName(m.senderId)}</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {/* team-only visibility removed from group chat UI */}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl ${mine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'}`}>
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 sm:p-4 border-t bg-white flex-shrink-0">
              {/* Visibility controls removed from group chat */}
              <div className="flex gap-2 min-w-0">
                <textarea
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-sm"
                  rows={2}
                  placeholder="Write a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !messageText.trim()}
                  className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center self-stretch"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      <GroupManagementModal
        isOpen={showManageGroup}
        onClose={() => {
          setShowManageGroup(false);
          loadGroups();
        }}
        onGroupChange={loadGroups}
        onNavigate={onNavigate}
        defaultTab="manage"
        initialGroupId={manageGroupId || undefined}
        initialSub="members"
        lockToGroup
      />
      {showProfile && (
  <div
    className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-0 md:p-6 overscroll-none"
    onTouchMove={(e) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
      }
    }}
  >
    <div
      ref={profileRef}
      className="
        w-full h-full
        md:max-w-5xl md:h-[78vh]
        bg-white
        rounded-none md:rounded-2xl
        shadow-2xl
        border-0 md:border border-slate-200
        overflow-hidden overscroll-contain
        flex flex-col
      "
    >
      <div className="flex items-center justify-between px-4 py-4 md:p-5 border-b flex-shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            Profile
          </h2>

          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Manage your personal information
          </p>
        </div>

        <div className="flex items-center gap-2">

        {!profileEditing && (
            <button
                onClick={() => setProfileEditing(true)}
                className="px-3 md:px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center gap-2 transition text-sm"
            >
                <Pencil className="w-4 h-4"/>
                Edit
            </button>
        )}

        <button 
            onClick={closeProfile}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
          <X className="w-5 h-5 text-slate-500"/>
        </button>

        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0">
        <div className="
  w-full md:w-80
  md:border-r
  border-b-0
  bg-white md:bg-slate-50
  px-5 py-3 md:p-8
  flex flex-col items-center
  space-y-3 md:space-y-6
  flex-shrink-0
  md:overflow-hidden
">
        <div className="flex justify-center">

<button
    type="button"
    disabled={!profileEditing}
    onClick={() => avatarInputRef.current?.click()}
    className={`relative w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden
    ${profileEditing ? "cursor-pointer group" : ""}`}
>

    {profileDraft.avatarUrl ? (

        <img
            src={profileDraft.avatarUrl}
            className="w-full h-full object-cover"
        />

    ) : (

        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-3xl font-bold flex items-center justify-center">

            {currentUserName.charAt(0).toUpperCase()}

        </div>

    )}

    {profileEditing && (

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-medium">

            Change Photo

        </div>

    )}

</button>

<input
    ref={avatarInputRef}
    type="file"
    accept="image/*"
    className="hidden"
    onChange={handleAvatarUpload}
/>

</div>

        {/* Name */}

        <div className="w-full">
          <label className="text-sm font-medium">Name</label>

          <input
            disabled={!profileEditing}
            value={profileDraft.name || ""}
            onChange={(e)=>
              setProfileDraft({
                ...profileDraft,
                name:e.target.value
              })
            }
            className="w-full mt-1 border rounded-lg p-2"
          />
        </div>

        {/* Email */}

        <div className="w-full">
          <label className="text-sm font-medium">Email</label>

          <input
            disabled
            value={profileDraft.email || ""}
            className="w-full mt-1 border rounded-lg p-2 bg-slate-100"
          />
        </div>

        {/* Status */}

        <div className="w-full min-w-0 max-w-full">
          <label className="text-sm font-medium">
            Status
          </label>

          <select
            disabled={!profileEditing}
            value={profileDraft.statusText || "DND"}
            onChange={(e) =>
              setProfileDraft({
                ...profileDraft,
                statusText: e.target.value
              })
            }
            className="block w-full min-w-0 max-w-full mt-1 border rounded-lg p-2 text-sm bg-white overflow-hidden"
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box'
            }}
          >
            <option value="DND">DND</option>
            <option value="Online">Online</option>
            <option value="Available">Available</option>
            <option value="Busy">Busy</option>
            <option value="In a Meeting">In a Meeting</option>
            <option value="Focus Time">Focus Time</option>
            <option value="Away">Away</option>
            <option value="AFK">AFK</option>
            <option value="Working Remotely">Working Remotely</option>
            <option value="Out Sick">Out Sick</option>
            <option value="On Holiday">On Holiday</option>
          </select>
        </div>
      </div>

        <div className="flex-1 min-h-0 md:overflow-y-auto px-5 pt-2 pb-5 md:p-8 space-y-5 md:space-y-6">
        {/* Phone */}

        <div>
          <label className="text-sm font-medium">Phone</label>

          <input
            disabled={!profileEditing}
            value={profileDraft.phone || ""}
            onChange={(e)=>
              setProfileDraft({
                ...profileDraft,
                phone:e.target.value
              })
            }
            className="w-full mt-1 border rounded-lg p-2"
          />
        </div>

        {/* Time Zone */}

        <div>
          <label className="text-sm font-medium">
            Time Zone
          </label>
          <div ref={timeZoneRef} className="relative">
            <button
              type="button"
              disabled={!profileEditing}
              onClick={() => {
                if (!profileEditing) return;
                setTimeZoneOpen(v => !v);
                setTimeZoneQuery('');
              }}
              className="w-full mt-1 border rounded-lg p-2 text-left bg-white disabled:bg-slate-100 flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {selectedTimeZone?.label || normalizedTimeZone || 'Select timezone'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition ${timeZoneOpen ? 'rotate-180' : ''}`} />
            </button>

            {timeZoneOpen && profileEditing && (
              <div className="absolute z-50 mt-1 left-0 right-0 w-full max-w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-slate-100">
                  <input
                    value={timeZoneQuery}
                    onChange={(e) => setTimeZoneQuery(e.target.value)}
                    placeholder="Search timezone (e.g. India, IST, Kolkata)..."
                    autoFocus
                    className="w-full border border-slate-200 rounded-md p-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto overscroll-contain">
                  {filteredTimeZones.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        setProfileDraft({ ...profileDraft, timeZone: o.value });
                        setTimeZoneOpen(false);
                        setTimeZoneQuery('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Working Hours */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-3 min-w-0 w-full max-w-full">

          <div className="min-w-0 w-full max-w-full">
            <label className="text-sm font-medium">
              Working Start
            </label>

            <input
              type="time"
              disabled={!profileEditing}
              value={profileDraft.workingTimeStart || ""}
              onChange={(e)=>
                setProfileDraft({
                  ...profileDraft,
                  workingTimeStart:e.target.value
                })
              }
              className="block w-full min-w-0 max-w-full mt-1 border rounded-lg p-2 text-sm"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box'
                }}
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Working End
            </label>

            <input
              type="time"
              disabled={!profileEditing}
              value={profileDraft.workingTimeEnd || ""}
              onChange={(e)=>
                setProfileDraft({
                  ...profileDraft,
                  workingTimeEnd:e.target.value
                })
              }
              className="block w-full min-w-0 max-w-full mt-1 border rounded-lg p-2 text-sm"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box'
                }}
            />
          </div>

        </div>

        {/* About */}

        <div>
          <label className="text-sm font-medium">
            About
          </label>

          <textarea
            disabled={!profileEditing}
            rows={4}
            value={profileDraft.about || ""}
            onChange={(e)=>
              setProfileDraft({
                ...profileDraft,
                about:e.target.value
              })
            }
            className="w-full mt-1 border rounded-lg p-2"
          />
        </div>
      </div>
      </div>

      <div className="border-t px-4 py-3 md:p-4 flex justify-end gap-2 flex-shrink-0 bg-white">

        {profileEditing && (
        <>
            <button
                onClick={() => {
                    setProfileEditing(false);
                    setProfileDraft(profile || {});
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm"
            >
                Cancel
            </button>

            <button
                onClick={saveProfile}
                disabled={profileLoading}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm"
            >
                Save
            </button>
        </>

        )}

      </div>

    </div>
  </div>
)}
    </>
  );
};
