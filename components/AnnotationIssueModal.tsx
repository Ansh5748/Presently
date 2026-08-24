import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Tag, Shield, Eye, UserCheck, Clock, CheckCircle2, AlertCircle, ChevronDown, Plus, XCircle, Pencil, Maximize2, Trash2, MessageSquare, Loader2 } from 'lucide-react';
import { ApiService } from '../services/apiService';
import type { Pin, Project, AnnotationIssue, AnnotationMessage, AssigneeOption, AnnotationIssueStatus, MessageVisibility } from '../types';

interface AnnotationIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  pin: Pin | null;
  project: Project;
  isGroupMember: boolean;
  isPMorOwner: boolean;
  isTeamMember: boolean;
  readOnly?: boolean;
  onPinUpdated?: (pin?: Pin) => void;
  onDeletePin?: (pinId: string) => void;
}

const STATUS_OPTIONS: { value: AnnotationIssueStatus; label: string; color: string; Icon: any }[] = [
  { value: 'active', label: 'Active', color: 'bg-blue-50 text-blue-700 border-blue-200', Icon: AlertCircle },
  { value: 'in_progress', label: 'In Progress', color: 'bg-orange-50 text-orange-700 border-orange-200', Icon: Clock },
  { value: 'in_review', label: 'In Review', color: 'bg-purple-50 text-purple-700 border-purple-200', Icon: Eye },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 }
];

const STATUS_DOT: Record<AnnotationIssueStatus, string> = {
  active: 'bg-blue-500',
  in_progress: 'bg-orange-500',
  in_review: 'bg-purple-500',
  resolved: 'bg-emerald-500'
};

const STATUS_TEXT: Record<AnnotationIssueStatus, string> = {
  active: 'text-blue-700',
  in_progress: 'text-orange-700',
  in_review: 'text-purple-700',
  resolved: 'text-emerald-700'
};

export const AnnotationIssueModal: React.FC<AnnotationIssueModalProps> = ({
  isOpen,
  onClose,
  pin,
  project,
  isGroupMember,
  isPMorOwner,
  isTeamMember,
  readOnly = false,
  onPinUpdated,
  onDeletePin
}) => {
  const currentUserId = (() => {
    try {
      const u = localStorage.getItem('presently_user');
      if (!u) return '';
      const parsed = JSON.parse(u);
      return (parsed.userId || parsed.id || '').toString();
    } catch { return ''; }
  })();
  const currentUserName = (() => {
    try {
      const u = localStorage.getItem('presently_user');
      return u ? JSON.parse(u).name : 'You';
    } catch { return 'You'; }
  })();

  const [issue, setIssue] = useState<AnnotationIssue | null>(null);
  const [projectAssignees, setProjectAssignees] = useState<AssigneeOption[]>([]);
  const [otherGroups, setOtherGroups] = useState<{ id: string; name: string; type: string; members: AssigneeOption[] }[]>([]);
  const [assigneePermissions, setAssigneePermissions] = useState<{
    isProjectGroupMember: boolean;
    canAssign: boolean;
    canCrossGroupSearch: boolean;
    isTeamMember: boolean;
  } | null>(null);
  const [messages, setMessages] = useState<AnnotationMessage[]>([]);

  const [assigneeId, setAssigneeId] = useState<string>('');
  const [status, setStatus] = useState<AnnotationIssueStatus>('active');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSource, setAssigneeSource] = useState<'project' | 'otherGroup'>('project');
  const [groupQuery, setGroupQuery] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [selectedOtherGroupId, setSelectedOtherGroupId] = useState<string>('');
  const [isEditingAssigneeStatus, setIsEditingAssigneeStatus] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  const [messageText, setMessageText] = useState('');
  const [visibility, setVisibility] = useState<MessageVisibility>('all');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingPinDetails, setEditingPinDetails] = useState(false);
  const [pinDraftTitle, setPinDraftTitle] = useState('');
  const [pinDraftDescription, setPinDraftDescription] = useState('');
  const [pinModeDraft, setPinModeDraft] = useState<'issue' | 'comment'>('issue');
  const [pinDetailsSaving, setPinDetailsSaving] = useState(false);
  const [localPin, setLocalPin] = useState<Pin | null>(pin);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const isCreator = issue && (typeof issue.createdBy === 'object' ? issue.createdBy._id : issue.createdBy) === currentUserId;
  const isAssignedToMe = issue && issue.assigneeId &&
    (typeof issue.assigneeId === 'object' ? issue.assigneeId._id : issue.assigneeId) === currentUserId;

  const effectiveIsGroupMember = assigneePermissions?.isProjectGroupMember ?? isGroupMember;
  const effectiveCanAssign = assigneePermissions?.canAssign ?? isPMorOwner;
  const canCrossGroupSearch = !!assigneePermissions?.canCrossGroupSearch;

  const canUserEditAssigneeOrStatus = !readOnly && (isPMorOwner || isCreator || isAssignedToMe || effectiveCanAssign);
  const canChangeAssignee = canUserEditAssigneeOrStatus && effectiveCanAssign;
  const canChangeStatus = canUserEditAssigneeOrStatus;
  const canSeeAssigneeButton = (effectiveIsGroupMember || effectiveCanAssign);

  useEffect(() => {
    setLocalPin(pin);
  }, [pin]);

  useEffect(() => {
    if (isOpen && pin) {
      loadIssue();
    } else {
      setIssue(null);
      setMessages([]);
      setIsEditingAssigneeStatus(false);
    }
  }, [isOpen, pin]);

  useEffect(() => {
    if (isOpen && pin) {
      loadAssigneeOptions();
    }
  }, [isOpen, pin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadAssigneeOptions = async () => {
    try {
      const assigneeData = await ApiService.getProjectAssignees(project.id);
      setProjectAssignees(assigneeData.projectAssignees || []);
      setOtherGroups(assigneeData.otherGroups || []);
      setAssigneePermissions(assigneeData.permissions || null);
    } catch (e) {
      console.error(e);
    }
  };

  const loadIssue = async () => {
    if (!pin) return;
    setLoading(true);
    try {
      const existing = await ApiService.getPinIssue(pin.id);
      if (existing) {
        const existingAssigneeId = existing.assigneeId
          ? (typeof existing.assigneeId === 'object'
              ? (existing.assigneeId as any)._id || (existing.assigneeId as any).id
              : existing.assigneeId).toString()
          : '';
        setIssue(existing);
        setAssigneeId(existingAssigneeId);
        setStatus(existing.status);
        setLabels(existing.labels || []);
        loadMessages(existing.id);
      } else {
        setIssue(null);
        setAssigneeId('');
        setStatus('active');
        setLabels([]);
        setMessages([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (issueId: string) => {
    try {
      const msgs = await ApiService.getIssueMessages(issueId);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    }
  };

  const [assigneeSearchPage, setAssigneeSearchPage] = useState(1);

  const getAssigneeName = (assigneeObj: any) => {
    if (!assigneeObj) return 'Unassigned';
    if (typeof assigneeObj === 'object' && assigneeObj.name) return assigneeObj.name;
    const needle = (typeof assigneeObj === 'object' ? (assigneeObj._id || assigneeObj.id) : assigneeObj)?.toString();
    if (!needle) return 'Unassigned';

    if (issue?.assigneeId && typeof issue.assigneeId === 'object' && ((issue.assigneeId as any)._id || (issue.assigneeId as any).id)?.toString() === needle) {
      return issue.assigneeId.name;
    }

    const found =
      projectAssignees.find(x => ((x as any)._id || (x as any).id)?.toString?.() === needle) ||
      otherGroups.flatMap(g => g.members || []).find(x => ((x as any)._id || (x as any).id)?.toString?.() === needle);

    return found?.name || (typeof issue?.assigneeId === 'object' ? issue?.assigneeId?.name : 'Unassigned');
  };

  const getSenderName = (senderId: any) => {
    if (typeof senderId === 'object' && senderId?.name) return senderId.name;
    if (senderId === currentUserId) return currentUserName;
    return senderId?.toString?.().slice(-6) || 'Unknown';
  };

  const getSenderAvatar = (senderId: any, mine: boolean) => {
    if (typeof senderId === 'object' && senderId?.avatarUrl) return senderId.avatarUrl;
    if (mine) {
      try {
        const raw = localStorage.getItem('presently_user');
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        return parsed?.avatarUrl || '';
      } catch {
        return '';
      }
    }
    return '';
  };

  const getSenderInitial = (senderId: any) => getSenderName(senderId).charAt(0).toUpperCase();

  const getFirstNameAndDesignation = (user: any) => {
    if (!user) {
      return { firstName: 'Unknown', designation: '', fullName: 'Unknown' };
    }
    if (typeof user === 'object') {
      const fullName = user.name || user.email || 'Unknown';
      const firstName = (user.name || user.email || 'Unknown').toString().split(' ')[0] || 'Unknown';
      return {
        firstName,
        designation: user.designation || '',
        fullName
      };
    }
    const value = user.toString();
    const found = projectAssignees.find(x => x._id?.toString?.() === value) ||
      otherGroups.flatMap(g => g.members || []).find(x => x._id?.toString?.() === value);
    return {
      firstName: found?.name?.split(' ')[0] || value.slice(-6),
      designation: found?.designation || '',
      fullName: found?.name || value
    };
  };

  const selectedOtherGroup = otherGroups.find(g => g.id === selectedOtherGroupId) || null;

  const groupFiltered = (() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return [];
    return otherGroups
      .filter(g => `${g.name} ${g.type}`.toLowerCase().includes(q))
      .slice(0, 20);
  })();

  const memberFiltered = (() => {
    const q = assigneeQuery.trim().toLowerCase();
    if (!q) return { list: [], total: 0 };

    const basePool = assigneeSource === 'otherGroup' && selectedOtherGroup ? selectedOtherGroup.members : projectAssignees;
    const uniqueMap = new Map();
    basePool.forEach((a, idx) => {
      const idStr = (a._id || (a as any).id || (a as any).userId || (a as any)._computedId || `member-${idx}`)?.toString();
      if (!idStr || uniqueMap.has(idStr)) return;
      uniqueMap.set(idStr, { ...a, _computedId: idStr, groupName: a.groupName || selectedOtherGroup?.name || 'Project' });
    });

    const deduplicated = Array.from(uniqueMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const matched = deduplicated.filter(a => {
      const hay = `${a.name || ''} ${a.email || ''} ${a.designation || ''} ${a.groupName || ''} ${a.groupType || ''}`.toLowerCase();
      return hay.includes(q);
    });

    return { list: matched, total: matched.length };
  })();

  const saveIssue = async (_?: boolean) => {
    await handleSaveIssue();
  };

  const handleSaveIssue = async () => {
    if (!pin || !canUserEditAssigneeOrStatus) return;
    setSaving(true);
    try {
      const payload = {
        projectId: project.id,
        assigneeId: assigneeId || null,
        status,
        labels
      };
      const saved = await ApiService.savePinIssue(pin.id, payload);
      const savedAssigneeId = saved.assigneeId
        ? (typeof saved.assigneeId === 'object'
            ? (saved.assigneeId as any)._id || (saved.assigneeId as any).id
            : saved.assigneeId).toString()
        : '';
      setIssue(saved);
      setAssigneeId(savedAssigneeId);
      setStatus(saved.status);
      setLabels(saved.labels || []);
      setIsEditingAssigneeStatus(false);
      onPinUpdated?.();
      if (saved.id && !messages.length) {
        loadMessages(saved.id);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to save issue');
    } finally { setSaving(false); }
  };

  const handleSavePinDetails = async () => {
    if (!localPin) return;
    const title = pinDraftTitle.trim();
    const description = pinDraftDescription.trim();

    if (!title) {
      alert('Annotation title is required');
      return;
    }

    setPinDetailsSaving(true);
    try {
      if (pinModeDraft === 'comment') {
        try {
          await ApiService.deletePinIssue(localPin.id);
        } catch {}
        const updatedPin = await ApiService.updatePin(localPin.id, { title, description, type: 'comment' });
        onPinUpdated?.(updatedPin);
        setEditingPinDetails(false);
        onClose();
        return;
      }

      const updatedPin = await ApiService.updatePin(localPin.id, { title, description, type: 'issue' });
      setLocalPin(updatedPin);
      onPinUpdated?.(updatedPin);
      setEditingPinDetails(false);
    } catch (e: any) {
      alert(e.message || 'Failed to update annotation');
    } finally {
      setPinDetailsSaving(false);
    }
  };

  const handleDeleteCompletePin = async () => {
    if (!localPin) return;
    if (!confirm('Are you sure you want to delete this pin and its issue?')) return;
    try {
      await ApiService.deletePin(localPin.id);
      if (onDeletePin) {
        onDeletePin(localPin.id);
      } else {
        onPinUpdated?.(localPin);
      }
      onClose();
    } catch (e: any) {
      alert(e.message || 'Failed to delete pin');
    }
  };

  const sendChatMessage = async () => {
    if (!messageText.trim() || !issue) return;
    setSendingMsg(true);
    try {
      const msg = await ApiService.sendIssueMessage(issue.id, messageText.trim(), visibility);
      setMessages(prev => [...prev, msg]);
      setMessageText('');
    } catch (e: any) {
      alert(e.message || 'Failed to send');
    } finally { setSendingMsg(false); }
  };

  const addLabel = () => {
    const t = labelInput.trim();
    if (t && !labels.includes(t)) {
      setLabels([...labels, t]);
      setLabelInput('');
    }
  };

  const removeLabel = (l: string) => {
    setLabels(labels.filter(x => x !== l));
  };

  if (!isOpen || !pin) return null;

  const currentStatusMeta = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  const CurrentStatusIcon = currentStatusMeta.Icon;
  const activePin = localPin || pin;

  const assignmentChain = (() => {
    if (!issue) return [];

    const events = (issue.assignmentHistory || [])
      .filter(e => !!e?.toUserId)
      .slice()
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    type ChainEntry = {
      user: any;
      status: AnnotationIssueStatus;
      isCreator: boolean;
      fromUser?: any;
      at?: string;
      assignedByMe: boolean;
      assignedToMe: boolean;
      wasAssignedFromMe: boolean;
      assigneeChanged: boolean;
      previousUserId?: string;
    };

    const getUserId = (u: any): string => {
      if (!u) return '';
      return (typeof u === 'object' ? (u._id || u.id) : u)?.toString?.() || '';
    };

    const currentUserIdStr = currentUserId.toString();

    const raw: ChainEntry[] = [];
    const creatorUserId = getUserId(issue.createdBy);

    raw.push({
      user: issue.createdBy,
      status: 'active',
      isCreator: true,
      at: issue.createdAt as any,
      assignedByMe: creatorUserId === currentUserIdStr,
      assignedToMe: creatorUserId === currentUserIdStr,
      wasAssignedFromMe: false,
      assigneeChanged: false,
      previousUserId: ''
    });

    let previousUserId = creatorUserId;
    events.forEach(ev => {
      const toUserId = getUserId(ev.toUserId);
      const fromUserId = getUserId(ev.fromUserId || issue.createdBy);
      const assigneeChanged = toUserId !== previousUserId;
      raw.push({
        user: ev.toUserId,
        status: ev.status || 'active',
        isCreator: false,
        fromUser: ev.fromUserId || issue.createdBy,
        at: ev.at,
        assignedByMe: fromUserId === currentUserIdStr,
        assignedToMe: toUserId === currentUserIdStr,
        wasAssignedFromMe: previousUserId === currentUserIdStr,
        assigneeChanged,
        previousUserId
      });
      if (toUserId) previousUserId = toUserId;
    });

    if (raw.length <= 1 && issue.assigneeId) {
      const toUserId = getUserId(issue.assigneeId);
      const fromUserId = creatorUserId;
      const assigneeChanged = toUserId !== previousUserId;
      raw.push({
        user: issue.assigneeId,
        status: issue.status,
        isCreator: false,
        fromUser: issue.createdBy,
        at: issue.updatedAt as any,
        assignedByMe: fromUserId === currentUserIdStr,
        assignedToMe: toUserId === currentUserIdStr,
        wasAssignedFromMe: previousUserId === currentUserIdStr,
        assigneeChanged,
        previousUserId
      });
    }

    const collapsed: ChainEntry[] = [];
    raw.forEach(item => {
      const itemUserId = getUserId(item.user);
      const lastItem = collapsed[collapsed.length - 1];
      const lastUserId = lastItem ? getUserId(lastItem.user) : '';

      if (!lastItem || lastUserId !== itemUserId) {
        collapsed.push(item);
      } else {
        collapsed[collapsed.length - 1] = {
          ...item,
          assigneeChanged: lastItem.assigneeChanged || item.assigneeChanged
        };
      }
    });

    if (collapsed.length >= 1) {
      const last = collapsed[collapsed.length - 1];
      const lastUserId = getUserId(last.user);
      const issueAssigneeId = getUserId(issue.assigneeId);
      if (issueAssigneeId && lastUserId === issueAssigneeId && issue.status !== last.status) {
        collapsed[collapsed.length - 1] = {
          ...last,
          status: issue.status
        };
      }
    }

    return collapsed;
  })();

  const getHistoryColors = (n: any) => {
    if (n.isCreator) {
      return {
        dotClass: 'bg-red-500',
        nameClass: 'text-red-700'
      };
    }
    if (n.assigneeChanged) {
      if (n.assignedByMe) {
        return {
          dotClass: STATUS_DOT[n.status],
          nameClass: 'text-black font-semibold'
        };
      }
      return {
        dotClass: STATUS_DOT[n.status],
        nameClass: 'text-slate-800 font-semibold'
      };
    } else {
      if (n.assignedToMe) {
        return {
          dotClass: STATUS_DOT[n.status],
          nameClass: `${STATUS_TEXT[n.status]} font-bold`
        };
      }
      return {
        dotClass: STATUS_DOT[n.status],
        nameClass: 'text-slate-800 font-semibold'
      };
    }
  };

  const getAssigneeNameTextColor = () => {
    if (status === 'active') return 'text-black font-semibold';
    if (isAssignedToMe) {
      if (status === 'in_progress') return 'text-orange-600 font-bold';
      if (status === 'in_review') return 'text-purple-600 font-bold';
      if (status === 'resolved') return 'text-emerald-600 font-bold';
    }
    return 'text-slate-800 font-semibold';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 via-white to-purple-50 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-xl font-bold text-slate-800 truncate">
                Issue · #{activePin.number}: {activePin.title || 'Annotation'}
              </h3>
            </div>
            {(!editingPinDetails || readOnly) ? (
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {activePin.description ? <p className="text-sm text-slate-500 line-clamp-2">{activePin.description}</p> : <p className="text-sm text-slate-400">No description yet</p>}
                </div>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => {
                        setPinDraftTitle(activePin.title || '');
                        setPinDraftDescription(activePin.description || '');
                        setPinModeDraft('issue');
                        setEditingPinDetails(true);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/70 text-slate-500 transition"
                      title="Edit annotation"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDeleteCompletePin}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                      title="Delete pin and issue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                {readOnly && (
                  <span className="text-[10px] uppercase font-semibold px-2 py-1 rounded bg-slate-100 text-slate-500 flex-shrink-0">
                    View Only
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Pin Mode</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPinModeDraft('issue')}
                      className={`py-1 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                        pinModeDraft === 'issue'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" /> Issue
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinModeDraft('comment')}
                      className={`py-1 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                        pinModeDraft === 'comment'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Comment
                    </button>
                  </div>
                </div>
                <input
                  value={pinDraftTitle}
                  onChange={(e) => setPinDraftTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Annotation title"
                />
                <textarea
                  value={pinDraftDescription}
                  onChange={(e) => setPinDraftDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Annotation description"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingPinDetails(false)}
                    className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePinDetails}
                    disabled={pinDetailsSaving}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {pinDetailsSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Left: controls */}
          <div className="w-80 border-r bg-slate-50 flex-shrink-0 p-5 space-y-5 overflow-y-auto">
            {loading && <div className="text-sm text-slate-500 py-8 text-center">Loading...</div>}

            {!loading && (
              <>
                {/* Labels */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
                    <Tag className="w-3.5 h-3.5" />Labels
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                    {labels.length === 0 && <span className="text-xs text-slate-400">No labels</span>}
                    {labels.map(l => (
                      <span key={l} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs">
                        {l}
                        {!readOnly && <button onClick={() => removeLabel(l)} className="hover:text-red-600"><XCircle className="w-3 h-3" /></button>}
                      </span>
                    ))}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1.5">
                      <input
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                        placeholder="Add a label..."
                        value={labelInput}
                        onChange={e => setLabelInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                      />
                      <button
                        onClick={addLabel}
                        disabled={!labelInput.trim()}
                        className="px-2.5 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Assignment & Status Section */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                      Assignment & Status
                    </span>
                    {canUserEditAssigneeOrStatus && (
                      <button
                        onClick={() => setIsEditingAssigneeStatus(!isEditingAssigneeStatus)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition"
                        title={isEditingAssigneeStatus ? 'Done editing' : 'Edit assignee & status'}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!isEditingAssigneeStatus ? (
                    /* Plain View Mode */
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Assignee:</span>
                        <span className="text-sm text-slate-800 font-semibold">
                          {assigneeId ? getAssigneeName(assigneeId) : 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Status:</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                          <span className={`font-medium text-xs ${STATUS_TEXT[status]}`}>{currentStatusMeta.label}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Edit Mode */
                    <div className="space-y-3 pt-1 border-t border-slate-100">
                      {/* Assignee Selector */}
                      <div ref={assigneeRef}>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                          <UserCheck className="w-3.5 h-3.5" />Assignee
                        </label>
                        {canSeeAssigneeButton ? (
                          <div className="relative">
                            <button
                              type="button"
                              disabled={!canChangeAssignee}
                              onClick={() => canChangeAssignee && setAssigneeOpen(v => !v)}
                              className={`w-full px-3 py-2 rounded-lg border bg-white text-xs flex items-center justify-between gap-2 outline-none transition
                                ${canChangeAssignee ? 'border-slate-300 hover:bg-slate-50' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                              <span className="truncate">{assigneeId ? getAssigneeName(assigneeId) : 'Unassigned'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition ${assigneeOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {assigneeOpen && canChangeAssignee && (
                              <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-2xl overflow-visible">
                                <div className="p-2 border-b border-slate-100 space-y-1.5 bg-white rounded-t-xl relative z-40">
                                  <input
                                    value={assigneeQuery}
                                    onChange={(e) => {
                                      setAssigneeQuery(e.target.value);
                                      setAssigneeSearchPage(1);
                                    }}
                                    placeholder="Search name/email/designation..."
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                                  />
                                  {canCrossGroupSearch && (
                                    <div className="relative z-50" ref={groupRef}>
                                      <button
                                        type="button"
                                        onClick={() => setGroupOpen(v => !v)}
                                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs flex items-center justify-between hover:bg-slate-50 bg-white"
                                      >
                                        <span className="truncate">
                                          {assigneeSource === 'project'
                                            ? 'Only project assignees'
                                            : selectedOtherGroup
                                              ? `Other group: ${selectedOtherGroup.name}`
                                              : 'Search other groups'}
                                        </span>
                                        <ChevronDown className={`w-3 h-3 text-slate-400 transition ${groupOpen ? 'rotate-180' : ''}`} />
                                      </button>
                                      {groupOpen && (
                                        <div className="absolute z-[100] mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl py-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAssigneeSource('project');
                                              setSelectedOtherGroupId('');
                                              setGroupOpen(false);
                                              setGroupQuery('');
                                            }}
                                            className={`w-full px-2.5 py-1.5 text-xs text-left hover:bg-slate-50 ${assigneeSource === 'project' ? 'bg-slate-50' : ''}`}
                                          >
                                            Only project assignees
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAssigneeSource('otherGroup');
                                              setGroupOpen(true);
                                            }}
                                            className={`w-full px-2.5 py-1.5 text-xs text-left hover:bg-slate-50 ${assigneeSource === 'otherGroup' ? 'bg-slate-50' : ''}`}
                                          >
                                            Search other groups
                                          </button>

                                          {assigneeSource === 'otherGroup' && (
                                            <div className="border-t border-slate-100 mt-1">
                                              <div className="p-2 border-b border-slate-100 bg-white sticky top-0 z-10">
                                                <input
                                                  value={groupQuery}
                                                  onChange={(e) => setGroupQuery(e.target.value)}
                                                  placeholder="Search groups..."
                                                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                                                />
                                              </div>
                                              {groupQuery.trim() && groupFiltered.length === 0 ? (
                                                <div className="px-2.5 py-2 text-[11px] text-slate-400">No other groups found</div>
                                              ) : groupFiltered.map(g => (
                                                <button
                                                  key={g.id}
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedOtherGroupId(g.id);
                                                    setAssigneeSource('otherGroup');
                                                    setGroupOpen(false);
                                                    setGroupQuery('');
                                                  }}
                                                  className={`w-full px-2.5 py-1.5 text-xs text-left hover:bg-slate-50 ${selectedOtherGroupId === g.id ? 'bg-slate-50' : ''}`}
                                                >
                                                  {g.name} <span className="text-[10px] text-slate-400">· {g.type}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {assigneeQuery.trim() && memberFiltered.total === 0 ? (
                                  <div className="p-3 text-center text-xs text-slate-400 bg-white rounded-b-xl">
                                    No members found
                                  </div>
                                ) : (
                                  <div className="bg-white rounded-b-xl overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => { setAssigneeId(''); setAssigneeOpen(false); setAssigneeQuery(''); }}
                                      className="w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 border-b border-slate-100 font-medium text-slate-500"
                                    >
                                      Unassigned
                                    </button>

                                    <div className={`overflow-y-auto ${memberFiltered.total > 3 ? 'max-h-[140px]' : ''}`}>
                                      {memberFiltered.list
                                        .slice((assigneeSearchPage - 1) * 10, assigneeSearchPage * 10)
                                        .map((a, idx) => {
                                          const aId = (a._id || (a as any).id || (a as any)._computedId || idx)?.toString();
                                          return (
                                            <button
                                              key={aId}
                                              type="button"
                                              onClick={() => { setAssigneeId(aId); setAssigneeOpen(false); setAssigneeQuery(''); }}
                                              className="w-full px-3 py-2 text-xs text-left hover:bg-indigo-50 border-b border-slate-50 flex flex-col transition"
                                            >
                                              <div className="font-semibold text-slate-800">
                                                {a.name} {a.designation ? <span className="text-slate-400 font-normal">({a.designation})</span> : null}
                                              </div>
                                              <div className="text-[10px] text-slate-400">{a.email}</div>
                                              {a.groupName ? (
                                                <div className="text-[10px] text-indigo-500">{a.groupName}</div>
                                              ) : null}
                                            </button>
                                          );
                                        })}
                                    </div>

                                    {memberFiltered.total > 10 && (
                                      <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
                                        <button
                                          type="button"
                                          disabled={assigneeSearchPage === 1}
                                          onClick={() => setAssigneeSearchPage(p => Math.max(1, p - 1))}
                                          className="px-2 py-1 rounded border bg-white disabled:opacity-40 text-[11px]"
                                        >
                                          Prev
                                        </button>
                                        <span className="text-[10px] text-slate-500 font-medium">
                                          Page {assigneeSearchPage} of {Math.ceil(memberFiltered.total / 10)}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={assigneeSearchPage >= Math.ceil(memberFiltered.total / 10)}
                                          onClick={() => setAssigneeSearchPage(p => p + 1)}
                                          className="px-2 py-1 rounded border bg-white disabled:opacity-40 text-[11px]"
                                        >
                                          Next
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">{assigneeId ? getAssigneeName(assigneeId) : 'Unassigned'}</div>
                        )}
                      </div>

                      {/* Status Selector */}
                      <div ref={statusRef}>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                          <CurrentStatusIcon className="w-3.5 h-3.5" />Status
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            disabled={!canChangeStatus}
                            onClick={() => canChangeStatus && setStatusOpen(v => !v)}
                            className={`w-full px-3 py-2 rounded-lg border bg-white text-xs flex items-center justify-between gap-2 outline-none transition
                              ${canChangeStatus ? 'border-slate-300 hover:bg-slate-50' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                              <span className={`truncate font-medium ${STATUS_TEXT[status]}`}>{currentStatusMeta.label}</span>
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition ${statusOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {statusOpen && canChangeStatus && (
                            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                              {STATUS_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => { setStatus(opt.value); setStatusOpen(false); }}
                                  className={`w-full px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 text-left ${status === opt.value ? 'bg-slate-50' : ''}`}
                                >
                                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[opt.value]}`} />
                                  <span className="font-medium text-slate-700">{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingAssigneeStatus(false)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-md font-medium"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => saveIssue(false)}
                  disabled={saving || !canUserEditAssigneeOrStatus}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-sm flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {issue ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    issue ? 'Update Issue' : 'Create Issue'
                  )}
                </button>

                {/* Assignment History Section */}
                {issue && assignmentChain.length >= 1 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                        Assignment History
                      </span>
                      {assignmentChain.length >= 2 && (
                        <button
                          onClick={() => setShowHistoryModal(true)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition"
                          title="View full assignment history"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {assignmentChain.length > 3 && <span className="text-slate-400 font-semibold">... →</span>}

                      {(assignmentChain.length > 3 ? assignmentChain.slice(-3) : assignmentChain).map((n, idx, arr) => {
                        const { firstName, designation } = getFirstNameAndDesignation(n.user);
                        const { dotClass, nameClass } = getHistoryColors(n);

                        return (
                          <React.Fragment key={`${n.user?._id || n.user}-${idx}`}>
                            <div className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                              <div className="flex flex-col">
                                <span className={`text-xs font-medium ${nameClass}`}>
                                  {firstName}
                                </span>
                                {designation && (
                                  <span className="text-[10px] text-slate-400 leading-tight">({designation})</span>
                                )}
                              </div>
                            </div>
                            {idx < arr.length - 1 && (
                              <span className="text-slate-300 font-semibold">→</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-200">
                  {isPMorOwner && <div>✅ You have PM/Owner permissions</div>}
                  {isGroupMember ? <div>✅ You are a group member</div> : <div>ℹ️ You are assigned to this project but not a group member</div>}
                  {isAssignedToMe && <div>🎯 This issue is assigned to you</div>}
                </div>
              </>
            )}
          </div>

          {/* Right: chat */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-5 py-3 border-b bg-white text-sm text-slate-600 flex items-center justify-between">
              <span className="font-semibold text-slate-700">Discussion</span>
              <span className="text-xs text-slate-400">{messages.length} message{messages.length === 1 ? '' : 's'}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-white to-slate-50">
              {!issue && !loading && (
                <div className="text-center text-slate-400 text-sm py-10">
                  Create the issue first to start a discussion
                </div>
              )}
              {issue && messages.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">
                  No messages yet. Start a thread below.
                </div>
              )}
              {messages.map(m => {
                const mine = (typeof m.senderId === 'object' ? m.senderId._id : m.senderId) === currentUserId;
                const teamOnly = m.visibility === 'team';
                const senderAvatar = getSenderAvatar(m.senderId, mine);
                return (
                  <div key={m.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                    {senderAvatar ? (
                      <img src={senderAvatar} alt={getSenderName(m.senderId)} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${mine ? 'from-indigo-500 to-purple-600' : 'from-emerald-400 to-teal-500'} text-white text-xs font-semibold flex items-center justify-center flex-shrink-0`}>
                        {getSenderInitial(m.senderId)}
                      </div>
                    )}
                    <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`flex items-center gap-2 text-xs text-slate-500 mb-1 ${mine ? 'flex-row-reverse' : ''}`}>
                        <span className="font-medium text-slate-600">{getSenderName(m.senderId)}</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {teamOnly && (
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 flex items-center gap-1">
                            <Shield className="w-3 h-3" />team only
                          </span>
                        )}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words ${mine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'}`}>
                        {m.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t bg-white">
              {issue && (
                <>
                  {isTeamMember && (
                    <div className="flex gap-2 mb-2 items-center">
                      <span className="text-xs text-slate-500 mr-1">Visibility:</span>
                      <button
                        onClick={() => setVisibility('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${visibility === 'all' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'text-slate-500 hover:bg-slate-100 border border-transparent'}`}
                      >
                        <Eye className="w-3 h-3 inline mr-1" />Everyone
                      </button>
                      <button
                        onClick={() => setVisibility('team')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${visibility === 'team' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'text-slate-500 hover:bg-slate-100 border border-transparent'}`}
                      >
                        <Shield className="w-3 h-3 inline mr-1" />Team only
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-sm"
                      rows={2}
                      placeholder="Add a comment..."
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                      }}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={sendingMsg || !messageText.trim()}
                      className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center self-stretch"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Assignment History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
              <h4 className="font-bold text-slate-800 text-sm">
                Complete Assignment History · Issue #{activePin.number}
              </h4>
              <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-slate-200 rounded transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 max-h-96 overflow-y-auto space-y-3">
              {assignmentChain.map((n, idx) => {
                const { firstName, designation, fullName } = getFirstNameAndDesignation(n.user);
                const assignerFirstName = getFirstNameAndDesignation(n.fromUser).firstName;
                const { dotClass, nameClass } = getHistoryColors(n);

                return (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dotClass}`} />
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold truncate ${nameClass}`}>
                          {firstName} {designation ? <span className="text-xs font-normal text-slate-500">({designation})</span> : null}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {fullName} {n.isCreator ? '· Creator' : (designation ? `· ${designation}` : '')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end flex-shrink-0">
                      <div className="text-xs font-medium text-slate-600">
                        {n.at ? new Date(n.at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Initial'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        {n.isCreator ? 'Issue Created' : (n.fromUser ? `Assigned by ${assignerFirstName}` : 'Assigned')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
