export enum ProjectStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED'
}

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
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  clientName: string;
  websiteUrl: string;
  pages: ProjectPage[]; // Replaces single screenshotUrl
  status: ProjectStatus;
  createdAt: string; // ISO String
}

export interface ProjectFormData extends Pick<Project, 'name' | 'clientName' | 'websiteUrl'> {
  initialPageUrl: string;
}
