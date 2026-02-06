# Client Delivery Tool - Technical Documentation

## 1. High-Level System Architecture

The system follows a modern Monolithic or Microservices hybrid approach depending on scale.

*   **Frontend (SPA):** React + TailwindCSS. Handles UI, canvas interaction for annotations, and display logic. Connects to backend via REST API.
*   **Backend API (Node.js/Express):** Manages project state, authentication, and orchestrates the screenshot worker.
*   **Worker Service (Screenshot Engine):** A separate service (or queue consumer) running Puppeteer/Playwright. It receives a URL, renders the page in a headless browser, captures full-page and viewport screenshots, and uploads them to object storage (S3/R2).
*   **Database (PostgreSQL):** Relational data store for users, projects, and annotation pins.
*   **AI Service:** Integration with Google Gemini API for rewriting text.

## 2. Database Schema (PostgreSQL/Prisma)

```prisma
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  password  String    // Hashed
  name      String?
  projects  Project[]
  createdAt DateTime  @default(now())
}

model Project {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  clientName  String?
  websiteUrl  String
  status      String   // "DRAFT", "PUBLISHED"
  screenshotUrl String? // URL to object storage
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  pins        Pin[]
}

model Pin {
  id          String   @id @default(uuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  xPosition   Float    // Percentage relative to width (0-100)
  yPosition   Float    // Percentage relative to height (0-100)
  title       String
  content     String   // The explanation
  orderIndex  Int      // For numbering (1, 2, 3...)
  createdAt   DateTime @default(now())
}
```

## 3. API Endpoints

*   **Auth**
    *   `POST /api/auth/login` - Authenticate user.
    *   `POST /api/auth/register` - Create account.
*   **Projects**
    *   `GET /api/projects` - List all projects for logged-in user.
    *   `POST /api/projects` - Create new project (triggers screenshot job).
    *   `GET /api/projects/:id` - Get details (Editor view).
    *   `PUT /api/projects/:id` - Update metadata.
    *   `DELETE /api/projects/:id` - Archive/Delete.
*   **Pins**
    *   `POST /api/projects/:id/pins` - Add annotation.
    *   `PUT /api/pins/:id` - Edit annotation.
    *   `DELETE /api/pins/:id` - Remove annotation.
*   **Public**
    *   `GET /api/public/:shareId` - Read-only view for clients (no auth required).

## 4. MVP Feature Checklist

- [x] Create Project from URL
- [x] Mock Screenshot capture (using placeholder for MVP demo)
- [x] Interactive Image Pinning (Click to annotate)
- [x] AI Text Refinement (Gemini integration)
- [x] Read-only "Client View" link generation
- [x] Dashboard for project management
- [x] Persistent local storage (simulating DB for this demo)

## 5. Future Scope

1.  **Video Walkthroughs:** Allow attaching a Loom/video bubble to specific pins.
2.  **Version Control:** "Before vs After" slider for website redesigns.
3.  **Client Feedback:** Allow clients to "Accept" or "Request Change" on specific pins.
4.  **Custom Domain:** Allow freelancers to serve delivery pages from `updates.mystudio.com`.
