# Presently (Freetry) — Full Project Documentation

This single file is the single source of truth for developers and AI assistants to understand:
- Product features and user roles
- Complete codebase structure (Frontend, Backend, Extension, Services, Models)
- Real Chrome Live Capture Extension Architecture (Client-side)
- Collaboration system (Groups, Channels, Direct Messages, Issue Tracking)
- Image Processing & Compression Pipeline
- Legacy Puppeteer `/take` status (commented out)
- Troubleshooting guides (including MongoDB Atlas DNS `ENOTFOUND` fixes)

Repository root: `c:\Users\Divyansh Gupta\OneDrive\Desktop\freetry`

---

## 1) Product Overview

Presently is a freelance delivery + collaboration platform for presenting website work to clients using full-page screenshots, numbered pin annotations, shareable live delivery links, team/client collaboration groups, realtime chat, and a "working mode" issue tracker.

### Primary User Roles & Permissions
- **Freelancer / Project Owner**: Creates projects, pages, pins, publishes live delivery links, manages group ownership.
- **Team Members**: Collaborate in team groups, manage assigned tasks, and see "team-only" messages (chat + issue threads).
- **Client Collaborators**: View public/live delivery links and participate in client groups.
- **Admin**: Hard-coded by email in UI/backend (`divyanshgupta5748@gmail.com`); verifies manual subscription payments and grants/cancels subscriptions.

---

## 2) Tech Stack (Actual Implementation)

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS via CDN (`index.html`) + Vanilla CSS
- **Icons**: `lucide-react`
- **Client-Side Compression**: Custom width-only canvas scaling + `base64ToBlob` binary converter
- **Router**: Custom lightweight state router in `App.tsx` (`history.pushState`)

### Real Chrome Extension (Primary Capture System)
- **Manifest**: Manifest V3 extension located in `chrome-extension/`
- **Engine**: Chrome Debugger Protocol (`chrome.debugger`) + `Emulation.setDeviceMetricsOverride`
- **IPC Transfer**: Chunked messaging protocol (`sendChunkedMessage` / `PRESENTLY_LIVE_CAPTURE_RESULT_CHUNK`) splitting base64 data into 300KB slices to bypass Chrome extension messaging limits
- **Stitching**: Client-side HTML5 Canvas stitching in `chrome-extension/content.js` with `MAX_CANVAS_HEIGHT = 30000`, `MAX_CANVAS_AREA = 250000000`, and `ctx.imageSmoothingQuality = 'high'`
- **Stop & Stitch On Demand**: Instant "Stop & Stitch Now" button in `LiveCaptureModal.tsx` allowing users to stop scrolling early and stitch screenshot tiles captured up to current position.

### Backend & Database
- **Server**: Node.js + Express (`backend/server.js`)
- **Database**: MongoDB Atlas + Mongoose
- **Auth**: JWT access tokens + httpOnly refresh token cookies
- **Legacy Puppeteer Service**: Server-side `/take` route and Puppeteer browser launcher commented out (`//`) in favor of Real Chrome extension capture
- **Payments**: Razorpay (optional) + manual payment / admin verification
- **Email**: Nodemailer Gmail SMTP with fallback to Resend API

### AI Integration
- Google Gemini via `@google/genai` (copy rewrite & website structure scanner)

---

## 3) Repository Structure & File Map

### Chrome Extension (`chrome-extension/`)
- `manifest.json`: Manifest V3 configuration with debugger, tabs, and host permissions.
- `background.js`: Service worker managing tab creation, debugger attachment, device emulation, chunked IPC routing, and keep-alive response handling.
- `content.js`: Injected script scrolling target webpage, requesting viewport tiles, stitching canvas at full 1:1 physical width, and returning base64 screenshots.

### Frontend (`src/` & `components/`)
- `App.tsx`: App routing, auth gating, and route mapping.
- `components/`:
  - `LandingPage.tsx`: Marketing landing page + About/Terms modals.
  - `AuthLayout.tsx`, `LoginPage.tsx`, `SignupPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`: Authentication flows.
  - `Dashboard.tsx`: Project listing, project creation flow, subscription gating, local compute permission, admin panel.
  - `ProjectEditor.tsx`: Multi-page editor, desktop/mobile view toggles, pin creation/editing, Present vs Working mode toggles, header issue search & filter drawer.
  - `DeliveryView.tsx`: Client-facing live delivery screen.
  - `LiveCaptureModal.tsx`: Real Chrome capture modal with animated URL bar, progress indicator, Stop & Stitch button, and chunk reassembly.
  - `GroupManagementModal.tsx`: Group/subgroup CRUD, role protection, project assignment/unassignment based on role/PM designation, navigation to DMs.
  - `GroupsChatView.tsx`: Slack-like channels, DMs, visibility toggle ("all" vs "team only"), User Profile & Avatar reload sync (`getMyProfile()`).
  - `AnnotationIssueModal.tsx`: Pin-based issue tracking modal with assignee timeline history.
  - `SubscriptionModal.tsx`: Plan selection, coupon codes, Razorpay/manual checkout.

### Services (`services/`)
- `apiService.ts`: Central API wrapper handling JWT headers.
- `screenshotService.ts`: Legacy screenshot URL generator (Puppeteer fetch commented out).
- `geminiService.ts`: AI copy rewrite and structure scanner.
- `storageService.ts`: Legacy localStorage DB helper for user persistence.

### Backend (`backend/`)
- `backend/server.js`: Express server entry (auth, subscription, CORS proxy-view; Puppeteer `/take` commented out).
- `backend/routes/collabRoutes.js`: Collaboration routes (groups/chat/issues + project/pin endpoints).
- `backend/models/`: Mongoose schemas (`User`, `Project`, `Pin`, `Subscription`, `Group`, `Message`, `AnnotationIssue`, `AnnotationMessage`).
- `backend/services/emailService.js`: Email sending service.

---

## 4) Detailed Feature Breakdown

### 4.1 Route Map (`App.tsx`)
- **Public**: `/` (logged out landing page), `/live/:projectId` (published client view), `/draft/:projectId`.
- **Auth**: `/login`, `/signup`, `/forgot-password`, `/reset-password`.
- **Protected**: `/` (logged in dashboard), `/project/:projectId` (ProjectEditor), `/chats` (GroupsChatView).

### 4.2 Dashboard & Project Creation
- Lists user projects + single-click delete.
- Project creation uses **Real Chrome Extension Live Capture** (`LiveCaptureModal.tsx`).
- Subscription gating: Blocks creation if subscription is expired/missing.
- Admin panel (hard-coded email `divyanshgupta5748@gmail.com`): Verify manual sub payments, grant/cancel subscriptions.

### 4.3 Project Editor & Issue Drawer
- **Multi-page Projects**: Add pages via URL capture or uploading design image files.
- **Desktop vs Mobile Screenshots**: Dedicated mobile frame view and desktop view.
- **Present vs Working Modes**:
  - *Present Mode*: Pin edits show basic title & description popover.
  - *Working Mode*: Clicking a pin opens `AnnotationIssueModal` for full task management.
- **Header Issue Search & Filter Drawer**: Filter issues by status (`active`, `in_progress`, `in_review`, `resolved`), labels, assignee, and search terms. One-click card navigation jumps directly to pin location on canvas.

### 4.4 Collaboration Groups, Channels & Chat
- **Group Management**: Create/edit/delete groups and channels.
  - Group creator is owner-protected and cannot be removed or downgraded.
  - Only owners/admins can create/edit/delete channels.
  - Project assign/unassign controls restricted to owners/admins and Product Managers.
- **GroupsChatView**:
  - Slack-style group channels + direct messages.
  - Message visibility: "All Members" vs "Team Only".
  - **User Profile & Avatar Reload Sync**: Automatically calls `getMyProfile()` on mount to maintain custom profile avatar image and status text (`statusText || 'DND'`) across page reloads.

### 4.5 Annotation Issue Modal (`AnnotationIssueModal.tsx`)
- **View vs Edit Toggle**: Status and Assignee displayed in static badge view mode with an edit toggle (`Pencil`).
- **Strict Permissions & Current Assignee Edit Access**: Editing permitted for Owner, Admin, PM, QA, Tester, Issue Creator, or Current Assignee (`isAssignedToMe`).
- **Assignee Search**: Elevated `z-[100]` dropdown prevents parent overflow clipping. Instant name resolution (never raw Mongo IDs).
- **Assignment History Timeline Modal**: Displays status dot, full name, designation, exact date/time, and "Assigned by [Name]".
- **Pin Mode Selector**: Switch between "Issue" and "Comment" pin types.
- **Trash Icon Pin Deletion**: One-click deletion of pin and issue thread.

---

## 5) Real Chrome Extension Architecture & Storage Pipeline

### Workflow Diagram

```
[LiveCaptureModal] ---> window.postMessage(PRESENTLY_START_LIVE_CAPTURE)
                              │
                              ▼
[background.js] ---> Creates Real Chrome Tab + Attaches Debugger
                              │
                              ▼
[content.js] ------> Scrolls page & captures physical viewport tiles
                              │
  (Optional: User clicks "Stop & Stitch Now" in Modal)
                              │
                              ▼
[content.js] ------> Stitches canvas at 1:1 physical width (750px/1920px)
                              │
                              ▼
[IPC Chunking] ----> Slices base64 into 300KB chunks & sends to Presently
                              │
                              ▼
[ProjectEditor] ---> base64ToBlob conversion + Client compression (~400KB)
                              │
                              ▼
[MongoDB Atlas] ---> Saved to Project document in MongoDB
```

### Canvas Downscaling Fix & Physical Width Preservation
- In `chrome-extension/content.js`, `stitchTiles` canvas limits were updated to `MAX_CANVAS_WIDTH = 16000`, `MAX_CANVAS_HEIGHT = 30000`, `MAX_CANVAS_AREA = 250000000`.
- Scale factor is locked to preserve full `1:1` physical viewport width (`750px` for mobile / `1920px` for desktop).
- `ctx.imageSmoothingQuality = 'high'` and JPEG export quality `0.85` ensure text remains 100% sharp and readable.

---

## 6) MongoDB Atlas Connection & Troubleshooting

### Error: `MongoServerSelectionError: getaddrinfo ENOTFOUND ac-mymjwzj-shard-00-00...`

If backend console outputs:
```
[Get Project] Error: MongoServerSelectionError: getaddrinfo ENOTFOUND ac-mymjwzj-shard-00-00.stshn10.mongodb.net
```

#### Cause
`getaddrinfo ENOTFOUND` is a standard Node.js DNS resolution failure. It indicates that Node.js cannot resolve the MongoDB Atlas SRV hostname to an IP address.

#### Step-by-Step Resolution:
1. **Verify Local Internet Connection**: Ensure the developer machine is online and not experiencing Wi-Fi disconnection.
2. **Flush Local DNS Cache** (Windows CMD/PowerShell):
   ```cmd
   ipconfig /flushdns
   ```
3. **Check MongoDB Atlas IP Access List**:
   - Log in to [MongoDB Atlas Console](https://cloud.mongodb.com).
   - Go to **Network Access**.
   - Ensure `0.0.0.0/0` (Allow Access from Anywhere) or your current IP is added to the IP Access List.
4. **Check Firewall & VPN**:
   - Verify that your corporate VPN or Windows Firewall is not blocking outbound connections to port `27017` or DNS port `53`.
5. **Verify `.env` Connection String**:
   - Ensure `MONGODB_URI` in `backend/.env` is correctly formatted:
     `mongodb+srv://<username>:<password>@cluster0.stshn10.mongodb.net/presently?retryWrites=true&w=majority`

---

## 7) Legacy Features & Migration Notes

- **Puppeteer `/take` Endpoint**: Server-side Puppeteer screenshot code in `backend/server.js` and `services/screenshotService.ts` has been commented out using `//` line comments. Do NOT uncomment unless legacy server-side capture is explicitly requested.
- **Independent Extension**: Extension handles real Chrome capture independently without relying on Puppeteer or server resources.
