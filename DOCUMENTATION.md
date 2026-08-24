# Presently (Freetry) — Full Project Documentation

This single file is meant to be enough context for any developer (or AI assistant) to understand:
- What the product does
- What features are implemented (frontend + backend)
- How the system is structured and how modules interact
- What remains to be built / fixed
- What to work on next

Repository root: `c:\Users\Divyansh Gupta\OneDrive\Desktop\freetry`

---

## 1) Product Overview

Presently is a freelance delivery + collaboration tool for presenting website work to clients using screenshots, pins (annotations), and shareable delivery links. It also includes team/client groups, chat, and a “working mode” issue tracker tied to pins.

### Primary user roles (current behavior)
- Freelancer / project owner: creates projects, pages, pins, publishes live delivery links.
- Team members: collaborate in team groups and see “team-only” messages (chat + issue threads).
- Client collaborators: can be added to client groups; can view what the group exposes.
- Admin (hard-coded by email in UI/backend): verifies manual subscription payments and can grant/cancel subscriptions.

---

## 2) Tech Stack (Actual Implementation)

### Frontend
- React 19 + TypeScript + Vite
- TailwindCSS via CDN (`https://cdn.tailwindcss.com`) in `index.html` (not installed as npm dependency)
- Icons: `lucide-react`
- Client-side image compression: `browser-image-compression`
- “Routing”: custom lightweight router in `App.tsx` using `history.pushState()` (no react-router)

### Backend
- Node.js + Express
- MongoDB + Mongoose (NOT PostgreSQL/Prisma)
- Auth: JWT access tokens + refresh tokens stored in httpOnly cookie + persisted per-user
- Screenshot engine: Puppeteer (runs inside same backend server process)
- Payments: Razorpay (optional) + manual payment / admin verification
- Email: Nodemailer Gmail SMTP with fallback to Resend API

### AI (currently partially wired)
- Google Gemini via `@google/genai` (frontend service)

---

## 3) Repository Structure (What each folder does)

### Frontend
- `App.tsx`: app entry routing + auth gating + route mapping.
- `components/`: all UI screens and modals.
- `services/`: API wrappers, screenshot helpers, Gemini helper, and legacy localStorage persistence.
- `types.ts`: shared TypeScript types used by components/services.
- `index.html`: includes Tailwind CDN + importmap; loads `index.tsx`.

### Backend
- `backend/server.js`: Express server (auth, subscription, screenshot endpoint, plus older project/pin endpoints).
- `backend/routes/collabRoutes.js`: collaboration-centric routes (groups/chat/issues + overrides of some project/pin routes).
- `backend/models/*.js`: Mongoose schemas (User, Project, Pin, Group, Message, Subscription, AnnotationIssue, AnnotationMessage).
- `backend/services/emailService.js`: email sending for welcome + password reset.
- `backend/Dockerfile`, `backend/start.sh`: deployment helpers.

---

## 4) Frontend: Features + Where They Live

### 4.1 Route map (App.tsx)

Public:
- `/` (not logged in): Landing page
- `/live/:projectId`: public “client view” (live/published)
- `/draft/:projectId`: currently accessible even without auth due to route ordering (see Known Issues)

Auth:
- `/login`, `/signup`, `/forgot-password`, `/reset-password`

Protected (requires localStorage user):
- `/` (logged in): Dashboard
- `/project/:projectId`: ProjectEditor (main editor)
- `/chats` and `/chats/...`: GroupsChatView

### 4.2 Component map (components/)

Marketing + auth
- `LandingPage.tsx`: marketing landing page + About/Terms modals.
- `AuthLayout.tsx`: shared auth layout wrapper.
- `LoginPage.tsx`: login; saves `{...user, accessToken}` into localStorage.
- `SignupPage.tsx`: signup + success screen.
- `ForgotPasswordPage.tsx`: requests password reset email.
- `ResetPasswordPage.tsx`: completes password reset via `?token=...`.

Projects + delivery
- `Dashboard.tsx`:
  - Lists projects + delete projects
  - Creates a project: captures screenshot via `/take`, compresses it, then calls `POST /projects`
  - Subscription gating: blocks project creation if subscription missing/expired/pending verification
  - “Enable Local Compute” permission toggle stored in user object
  - Admin panel (hard-coded email): view pending subs, verify manual, cancel, grant
  - Entry points into Group management and Chat
- `ProjectEditor.tsx`:
  - Multi-page projects: add page by URL capture or by uploading an image
  - Desktop/mobile screenshot toggles; mobile screenshot auto-capture for URL pages
  - Pin creation/editing/deletion with numbering
  - Publish workflow (draft vs published)
  - “Present” vs “Working” project modes:
    - Present: pin edit = title/description
    - Working: clicking a pin opens the issue modal (issue tracker) rather than simple editing
- `DeliveryView.tsx`:
  - Draft and Live views (controlled via `isLiveView` and `view=draft|live` query param)
  - Multi-page navigation + pin overlay + pin list
  - Draft view allows editing per-page “Implementation Details”; live is read-only

### Collaboration (groups + chat + profile)
- `GroupManagementModal.tsx`:
  - Create/edit/delete groups
  - Add/remove members; set roles; store “designation”; display member avatar images
  - Create/delete subgroups (channels)
  - Assign/unassign projects to groups
  - Important constraints are enforced:
    - Group creator is admin/owner-protected and cannot be removed or have role downgraded
    - Only creator can delete the group
    - Only owners/admins can create or edit channels; only owners/admins can delete channels
  - UX behaviors:
    - “+” actions for adding members and creating channels are only rendered for owners/admins (not shown for regular members)
    - Project assign/unassign controls are only shown for owners/admins and members whose designation indicates PM/Product Manager
    - Clicking a channel in Manage Group navigates to a direct message (`/chats/:groupId/:subgroupId`)
    - Clicking a member in Manage Group navigates to a direct message (`/chats/:userId`)
    - Member role/designation editing is behind a single edit button (edit → inline controls → save), and row navigation is disabled while editing
- `GroupsChatView.tsx`:
  - Slack-like group channels + direct messages
  - “Visibility”: messages can be “all” or “team only”
  - **User Profile & Avatar Reload Sync**: Immediately fetches `getMyProfile()` on mount to sync custom profile avatar image and status text (`profile.statusText || 'DND'`) on page reload. Profile avatar images rendered in bottom-left profile status bar, DM user list, group member lists, and chat message headers.

Issue tracking (pins in working mode)
- `AnnotationIssueModal.tsx`:
  - Maintains issue per-pin: status, assignee, labels
  - **View vs Edit Toggle**: Status and Assignee shown in static text badge view mode with an edit toggle icon (`Pencil`). Placed **BELOW** the Create/Update Issue button.
  - **Strict Permissions & Current Assignee Edit Access**: Editing status/assignee permitted for Owner, Admin, PM, QA, Tester, Issue Creator, or Current Assignee (`isAssignedToMe`). Current assignees can reassign issues to team members even if not Admin/PM/Owner.
  - **Assignee Display & Search**: Assignee name is always rendered as full name (never raw Mongo ID). Dropdown lists members immediately on open and live-filters on typing. "Search other groups" popup uses elevated `z-[100]` positioning to prevent parent overflow clipping. Includes a scrollbar after 3 items and pagination after 10 results.
  - **Assignment History Timeline Modal**: Maximise button enabled whenever there are at least 2 entries (Creator + assignee). Displays status dot, first name, designation, exact date/time, and "Assigned by [First Name]".
  - **Pin Mode Selector (Issue vs Comment)**: Toggle option between "Issue" and "Comment" when creating/editing pins in Working Mode. Saving as an "Issue" directly opens `AnnotationIssueModal` and sets future clicks to open the modal. Saving as a "Comment" converts/deletes any existing issue for that pin and opens standard title & description popovers.
  - **Pin Deletion Icon**: Trash icon button (`Trash2`) in header permits single-click deletion of the entire pin and its issue thread.

Header Issue Search & Filter Drawer (ProjectEditor.tsx)
- **Header Filter Button**: Located to the left of the Desktop/Mobile view toggle. Exclusively rendered when project is in Working Mode (`project.mode === 'working'`).
- **Search & Filter Drawer**:
  - Full-text search for issue titles, pin numbers, descriptions, labels, and assignees.
  - Multi-criteria filtering by status (`active`, `in_progress`, `in_review`, `resolved`), labels, and creation time / pin number sorting.
  - Permission-scoped: Owners, Admins, PMs, QA, and Testers view ALL project issues; other members view ONLY issues assigned to them.
  - One-click navigation: Clicking an issue card closes drawer, switches page if needed, scrolls smoothly to pin location, and opens `AnnotationIssueModal`.

Payments
- `SubscriptionModal.tsx`:
  - Plan selection + coupon codes
  - Razorpay checkout flow or manual payment flow depending on backend configuration

### 4.3 Frontend services (services/)

- `apiService.ts`:
  - Central wrapper around `fetch()` for backend endpoints
  - Builds `Authorization: Bearer <accessToken>` from `localStorage.presently_user`
  - Note: `getProject()` and `getPins()` intentionally do not send auth headers (used by public views). This is dangerous for draft access unless backend enforces access.
- `screenshotService.ts`:
  - Builds `/take?url=...` endpoints
  - Optional: fetches screenshot and returns base64 data URL
- `geminiService.ts`:
  - `refineText()` (copy rewrite) and `scanWebsiteStructure()` (AI generated page list)
  - Current limitation: reads `process.env.API_KEY` which likely won’t exist in Vite runtime unless injected; should be moved to server or to `import.meta.env`
- `storageService.ts`:
  - Legacy localStorage DB for projects/pages/pins and publish snapshots
  - Currently used mainly for user persistence (`getUser/saveUser/clearUser`) and not for the core project state (which uses backend MongoDB)

---

## 5) Backend: Architecture + Features

Backend root: `backend/`

### 5.1 Server entry (backend/server.js)

Responsibilities inside this server:
- Auth routes (signup/login/token refresh/logout/forgot/reset password)
- Subscription + payments + admin verification endpoints
- Screenshot endpoint `/take` (Puppeteer)
- Project/pin/page routes (some older, some overridden by collabRoutes)

### 5.2 Collaboration routes (backend/routes/collabRoutes.js)

Adds collaboration features and also overrides some project/pin routes to support:
- Project visibility based on group membership + explicit assignment
- Group CRUD + membership + subgroups (channels)
- Group chat + direct messages
- Issue tracker (per pin) + issue messages
- Safe pin deletion that also removes related issues + messages
- **Avatar Population**: All user population queries (`members.userId`, `createdBy`, `senderId`, `assigneeId`, `assignmentHistory.fromUserId`, `assignmentHistory.toUserId`) explicitly include `avatarUrl` field.

### 5.3 Database models (backend/models/)

MongoDB collections via Mongoose:
- `User.js`:
  - `name`, `email`, `password` (hashed), `refreshTokens[]`
  - `isLocalComputeEnabled` flag
  - password reset token + expiry
- `Project.js`:
  - `pages[]` with desktop + optional `mobileImageUrl`, `originalUrl`, and draft-only `details`
  - `status`: DRAFT/PUBLISHED
  - `publishedSnapshot`: published pages + pins snapshot (immutable “live view”)
  - Collaboration: `groupId`, `groupIds[]`, `assignedUserIds[]`, `mode: present|working`
- `Pin.js`:
  - `projectId` (string), `pageId` (string), coordinates, number, title, description, device
- `Group.js`:
  - `type: team|client`
  - `createdBy` (ObjectId), `members[]` with role owner/admin/member + designation
  - `subgroups[]` (channels)
  - `projectIds[]` (string project ids assigned to this group)
- `Message.js`:
  - group messages or direct messages; supports `visibility: all|team`
- `AnnotationIssue.js`:
  - one issue per pin (by pinId) with assignee/status/labels and creator
- `AnnotationMessage.js`:
  - thread messages for an annotation issue; also has `visibility: all|team`
- `Subscription.js`:
  - plan 1/6/12 month, currency, amount, status, payment method, expiry, manual verification states

---

## 6) API Endpoints (Actual Paths + Auth Expectations)

Base URL: `import.meta.env.VITE_API_URL` on the frontend.

### 6.1 Auth

- `POST /auth/signup` (public)
- `POST /auth/login` (public) → returns accessToken; also sets refresh cookie
- `POST /auth/token` (public but requires refresh cookie)
- `POST /auth/logout` (auth required)
- `POST /auth/forgot-password` (public)
- `POST /auth/reset-password` (public)

### 6.2 User
- `POST /user/permissions` (auth required): toggles `isLocalComputeEnabled`
- `GET /users/search?email=...` (auth required): limited to users accessible through your groups
- `GET /users/all` (auth required): returns all users (should likely be admin-only; see Known Issues)

### 6.3 Projects / Pages / Pins

Important note: There are overlapping route definitions between `collabRoutes.js` and `server.js`. The effective behavior is determined by route registration order.

Core:
- `GET /projects` (auth required): returns accessible projects (overridden in collabRoutes to include group/assigned)
- `POST /projects` (auth required): create project (supports group + mode in collabRoutes)
- `PATCH /projects/:projectId` (auth required): update metadata + group/mode (collab-aware in collabRoutes)
- `DELETE /projects/:projectId` (auth required)

Pages:
- `POST /projects/:projectId/pages` (auth required)
- `PATCH /projects/:projectId/pages/:pageId` (auth required)
- `DELETE /projects/:projectId/pages/:pageId` (auth required)

Pins:
- `POST /projects/:projectId/pins` (auth required)
- `PATCH /pins/:pinId` (auth required, but currently missing strong authorization checks; see Known Issues)
- `DELETE /pins/:pinId` (auth required; collabRoutes version also deletes related issues/messages and reindexes pins)

Public views (currently public in backend):
- `GET /projects/:projectId?view=draft|live` (no auth)
- `GET /projects/:projectId/pins?view=draft|live` (no auth)

### 6.4 Publish
- `POST /projects/:projectId/publish` (auth required): snapshots pages+pins into `publishedSnapshot` and sets status PUBLISHED

### 6.5 Subscriptions / payments / admin

- `GET /subscription/status` (auth required)
- `POST /subscription/calculate-price` (auth required)
- `POST /subscription/create-order` (auth required)
- `POST /subscription/verify-payment` (auth required)

Admin (hard-coded admin email check):
- `GET /admin/subscriptions/pending`
- `POST /admin/subscriptions/:id/verify`
- `GET /admin/stats`
- `GET /admin/subscriptions`
- `POST /admin/subscriptions/cancel`
- `POST /admin/subscriptions/grant`

### 6.6 Groups / subgroups / membership

- `GET /groups` (auth required)
- `GET /groups/:groupId` (auth required)
- `POST /groups` (auth required)
- `PATCH /groups/:groupId` (auth required)
- `DELETE /groups/:groupId` (auth required; restricted to creator)
- `POST /groups/:groupId/members` (auth required)
- `PATCH /groups/:groupId/members/:memberId` (auth required; role rules enforced)
- `DELETE /groups/:groupId/members/:memberId` (auth required; creator cannot be removed)
- `POST /groups/:groupId/subgroups` (auth required)
- `DELETE /groups/:groupId/subgroups/:subgroupId` (auth required)
- `POST /groups/:groupId/projects/:projectId` (auth required)
- `DELETE /groups/:groupId/projects/:projectId` (auth required)

### 6.7 Chat

Group chat:
- `GET /groups/:groupId/messages?subgroupId=...` (auth required)
- `POST /groups/:groupId/messages` (auth required) with `visibility: all|team`

Direct chat:
- `GET /messages/direct/:recipientId` (auth required)
- `POST /messages/direct/:recipientId` (auth required)

### 6.8 Issues (Working Mode)

- `GET /projects/:projectId/issues` (auth required; access: owner, assigned user, or group member)
- `GET /pins/:pinId/issue` (auth required)
- `POST /pins/:pinId/issue` (auth required) create/update
- `PATCH /issues/:issueId/status` (auth required)
- `GET /issues/:issueId/messages` (auth required; visibility rules apply)
- `POST /issues/:issueId/messages` (auth required)

### 6.9 Screenshot engine

- `GET /take?url=<encoded>&type=desktop|mobile&useLocal=true|false` (public)
  - Captures page using Puppeteer and returns `image/webp`
  - Uses a mutex to serialize heavy browser work and avoid OOM
  - `useLocal` is currently not implemented (server still captures)

---

## 7) Implementation Status (What’s Done vs Pending)

Legend:
- [x] shipped/working
- [~] partially implemented / unstable / needs fixes
- [ ] not implemented

### Core delivery workflow
- [x] Signup/login/logout with JWT access token
- [x] Create project from URL with screenshot capture
- [x] Multi-page projects (URL capture + image upload)
- [x] Pin annotations (create/edit/delete + numbering)
- [x] Desktop + mobile screenshot modes (mobile capture stored per page)
- [x] Draft vs Published snapshot workflow
- [x] Public “live view” route for clients (`/live/:id`)
- [~] Draft view protections (currently not actually protected; backend + frontend need changes)

### Collaboration
- [x] Groups (team/client types) + members + roles
- [x] Subgroups (channels) + channel deletion cleanup of messages
- [x] Assign/unassign projects to groups
- [x] Group chat + direct messages
- [x] Team-only visibility gating for team groups
- [x] Project-level assignment of users (assignees)

### Working mode (issue tracker on pins)
- [x] Per-pin issue object (assignee/status/labels)
- [x] Per-issue thread messages + visibility
- [~] Frontend permission flags for issue modal (currently passed as always-false; needs wiring)

### Subscription / billing
- [x] Subscription status gating for project creation and page addition
- [x] Coupon handling (FREEDG100 / OFFERDG50)
- [x] Razorpay flow (when enabled) + manual payment flow fallback
- [x] Admin verification + admin grant/cancel endpoints (hard-coded admin email)
- [~] Email notifications for subscription approval/rejection (explicit TODO in backend)

### AI
- [~] Gemini refineText integration exists but UI button is hidden
- [~] Gemini scanWebsiteStructure exists but not integrated into UI flow
- [~] Secret management for Gemini key not production-safe (client-side key usage)

### Ops / deployment
- [x] Vercel SPA rewrite config
- [x] Backend Dockerfile
- [~] Env var documentation and production-safe secret handling

---

## 8) Known Issues / Risks / Tech Debt (High priority)

Security / access control
- Draft data is currently accessible publicly:
  - `GET /projects/:projectId` and `GET /projects/:projectId/pins` do not require auth and return draft state unless `view=live` is requested.
  - `/draft/:id` route is rendered before auth gating in `App.tsx`, so it is effectively public.
- `PATCH /pins/:pinId` lacks strict authorization checks (updates by pinId without verifying ownership/group access).
- `GET /users/all` returns every user to any authenticated user (should likely be restricted).

Backend correctness/maintainability
- Duplicate admin routes exist twice inside `backend/server.js`, which is confusing and can drift.
- Overlapping route definitions between `collabRoutes.js` and `server.js` can cause shadowing and unexpected behavior.
- `emailService.js` imports `node-fetch` dynamically, but `node-fetch` is not listed in backend dependencies.

Frontend correctness
- `ProjectEditor.tsx` declares permission flags (`isGroupMember`, `isPMorOwner`, `isTeamMember`) but never sets them before passing to `AnnotationIssueModal`, so UI permissions likely behave incorrectly.
- AI rewrite button is present but hidden in UI (`className="hidden"`).

Build/runtime
- `index.html` references `/index.css` but no such file exists in repo (harmless if not required, but should be cleaned up).
- `geminiService.ts` reads `process.env.API_KEY` which is not standard in Vite browser runtime.

---

## 9) Next Plan (Recommended Roadmap)

### P0 (must-fix)
- Protect draft data end-to-end:
  - Make `GET /projects/:id` and `GET /projects/:id/pins` require auth for draft, and only allow unauth access to published snapshots.
  - Fix `App.tsx` routing so `/draft/:id` is actually protected.
- Add proper authorization checks to `PATCH /pins/:pinId`.
- Restrict `GET /users/all` (admin-only or remove).
- Remove duplicated routes / consolidate project routes into a single authoritative module.

### P1 (stability + UX)
- Wire real permission flags for issue modal (derive from group membership + role + assignment).
- Unhide AI rewrite button and add a safe key strategy (prefer backend proxy).
- Add “client feedback” on pins (client can respond/comment per pin or mark “approved/change requested”).
- Add “share settings”:
  - optional password-protected link
  - expiring link
  - allow sharing draft link selectively

### P2 (product expansion)
- Video walkthrough attachments (Loom link / upload) per pin or per project.
- Version history (before/after slider per page).
- Custom domain support for live delivery pages.

---

## 10) Local Development Setup

### Frontend
From repo root:
```bash
npm install
npm run dev
```

Frontend env:
- `.env` (Vite) should provide:
  - `VITE_API_URL=http://localhost:3001`

### Backend
From `backend/`:
```bash
npm install
npm start
```

Backend env vars (typical)
- `PORT=3001`
- `FRONTEND_URL=http://localhost:5173`
- `MONGODB_URI=mongodb://...`
- `ACCESS_TOKEN_SECRET=...`
- `REFRESH_TOKEN_SECRET=...`
- `EMAIL_USER=...` (Gmail)
- `EMAIL_PASSWORD=...` (Gmail app password)
- `RESEND_API_KEY=...` (optional fallback)
- `USE_RAZORPAY=true|false`
- `RAZORPAY_KEY_ID=...`
- `RAZORPAY_KEY_SECRET=...`
- `PUPPETEER_EXECUTABLE_PATH=...` (optional; helpful in some deployments)

---

## 11) Documentation Update Log (append-only)

- 2026-08-24: Filter drawer + Delivery view UX overhaul: (1) Filter Issues drawer in both ProjectEditor and DeliveryView now displays BOTH issues and comment-type pins (previously only pins with AnnotationIssue entries were shown, hiding all comments). Unified `filteredAndSortedItems` merges issue cards with comment pins and applies consistent sorting (earliest/latest/number) and filter rules (search, device, type). (2) Clicking a comment-type pin from the filter drawer no longer attempts to open an issue modal; instead it scrolls to the pin and (in ProjectEditor) opens the pin title/description editor, or (in DeliveryView) simply activates + scrolls to the pin without opening a modal. (3) In DeliveryView "Notes for this screen" sidebar: text labels "desktop/mobile/issue/comment" removed and replaced with icon-only indicators (Monitor / Smartphone / AlertCircle / MessageSquare). Number badge and title now click to scroll+activate only; clicking the whole card no longer opens the issue modal. (4) Added a dedicated Maximize2 icon button on each issue-type note card in the sidebar to explicitly open the AnnotationIssueModal — comments have no such button since they have no issue thread. (5) Pin hover popovers in DeliveryView no longer show chip-style text labels for device and type; they now use only colored icons for device and type to reduce UI clutter.
- 2026-08-23: Assignment History color & attribution overhaul: (a) Backend now pushes a history entry for status-only updates (with fromUserId===toUserId) so frontend can distinguish assignment-vs-status changes. (b) Frontend `assignmentChain` now carries `assigneeChanged`, `assignedByMe`, `assignedToMe`, `wasAssignedFromMe` metadata. (c) New `getHistoryColors` helper implements rules: status-only update (same assignee) → dot color changes + name stays black; my status change on my own assigned issue → name color also changes to status color; me assigning the issue to someone else → name is black + dot is chosen status color; creator always red dot/red name. (d) "Assigned by X" text now uses actual event `fromUserId` (no forced fallback to creator) so the real assigner's profile is shown. (e) "Assignment & Status" editable div above the button left completely untouched as required.
- 2026-08-23: Fixed AnnotationIssueModal create/update issue bugs: (1) Backend canEdit/canUpdate permission checks now include issue creator + QA/Tester designations + directly assigned users. (2) Removed redundant `loadIssue()` call at end of `handleSaveIssue` that was overwriting saved state and causing assignee-name reversion. (3) `assigneeId` state extracted robustly with explicit `.toString()` handling ObjectId types. (4) Create/Update Issue button now shows animated Loader2 spinner + context-aware text (Creating.../Updating...) during save.
- 2026-07-31: Fixed Manage Group navigation when opened from Dashboard (Dashboard now passes `onNavigate`, and modal also has a history fallback). Updated members UI to use a single edit button for role/designation changes. Restricted project assign/unassign UI to owners/admins/PM while keeping project menu navigation for everyone.
- 2026-07-31: Restricted Manage Group UI actions so only owners/admins can add members or create/edit channels. Added navigation from Manage Group member/channel rows into the corresponding chat routes.
- 2026-07-31: Added Group Management UX improvements: explicit group info edit mode (Edit ↔ Save) and channel edit support (update subgroup endpoint + UI edit flow).
- 2026-07-31: Replaced outdated Prisma/Postgres docs with full repo-accurate documentation (MongoDB/Mongoose, groups/chat/issues/subscriptions, known issues, roadmap). Added status + next plan.
