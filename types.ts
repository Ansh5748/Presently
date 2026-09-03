export enum ProjectStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED'
}

export type ProjectMode = 'present' | 'working';

export interface ProjectPage {
  id: string;
  name: string; // e.g., "Home", "About", "Contact"
  imageUrl: string;
  originalUrl?: string; // The URL this page was captured from
  details?: string; // New field for editable implementation details
}

export interface Pin {
  id: string;
  projectId: string;
  pageId: string; // Link pin to a specific page
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  title: string;
  description: string;
  number: number;
  device?: 'desktop' | 'mobile';
  type?: 'issue' | 'comment';
  createdAt?: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  clientName: string;
  websiteUrl: string;
  groupId?: string;
  groupIds?: string[];
  mode?: ProjectMode;
  assignedUserIds?: string[];
  pages: ProjectPage[];
  status: ProjectStatus;
  createdAt: string;
  publishedSnapshot?: {
    pages: ProjectPage[];
    pins: Pin[];
    publishedAt: string;
  };
}

export interface ProjectSummary {
  id: string;
  userId: string;
  name: string;
  clientName: string;
  websiteUrl: string;
  groupId?: string;
  groupIds?: string[];
  mode?: ProjectMode;
  assignedUserIds?: string[];
  status: ProjectStatus;
  createdAt: string;

  // Lightweight dashboard fields
  pageCount: number;
  coverImageUrl?: string | null;
}

export interface ProjectFormData extends Pick<Project, 'name' | 'clientName' | 'websiteUrl'> {
  initialPageUrl: string;
  groupId?: string;
  mode?: ProjectMode;
}

export type GroupType = 'team' | 'client';
export type MemberRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  userId: string;
  role: MemberRole;
  designation: string;
  joinedAt?: string;
  name?: string;
  email?: string;
}

export interface Subgroup {
  id: string;
  name: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  description?: string;
  createdBy: string | { _id: string; name: string; email: string };
  members: GroupMember[];
  subgroups: Subgroup[];
  projectIds: string[];
  createdAt: string;
}

export type MessageVisibility = 'all' | 'team';

export interface ChatMessage {
  id: string;
  groupId?: string;
  subgroupId?: string;
  directRecipientId?: string | { _id: string; name: string; email: string };
  senderId: string | { _id: string; name: string; email: string };
  content: string;
  visibility: MessageVisibility;
  createdAt: string;
}

export type AnnotationIssueStatus = 'active' | 'in_progress' | 'in_review' | 'resolved';

export interface AnnotationIssueAssignmentEvent {
  fromUserId?: string | { _id: string; name: string; email: string } | null;
  toUserId?: string | { _id: string; name: string; email: string } | null;
  status: AnnotationIssueStatus;
  at: string;
}

export interface AnnotationIssue {
  id: string;
  pinId: string;
  projectId: string;
  assigneeId?: string | { _id: string; name: string; email: string } | null;
  status: AnnotationIssueStatus;
  labels: string[];
  createdBy: string | { _id: string; name: string; email: string };
  assignmentHistory?: AnnotationIssueAssignmentEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationMessage {
  id: string;
  annotationIssueId: string;
  senderId: string | { _id: string; name: string; email: string };
  content: string;
  visibility: MessageVisibility;
  createdAt: string;
}

export interface AssigneeOption {
  _id: string;
  name: string;
  email: string;
  designation?: string;
  role?: MemberRole;
  groupType?: GroupType;
  groupName?: string;
}

export interface UserSearchResult {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  timeZone?: string;
  workingTimeStart?: string;
  workingTimeEnd?: string;
  statusText?: string;
  about?: string;
  avatarUrl?: string;
  avatarPlaceholderUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  isLocalComputeEnabled?: boolean;
}
