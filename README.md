# Presently: A Freelance Delivery & Feedback Tool

Presently is a powerful tool designed for freelancers and agencies to present web design and development work to clients in a professional and interactive way. It allows you to capture full-page screenshots of websites, add numbered annotations with detailed notes, and share a clean, public-facing link for client feedback.

## Key Features

*   **Visual Project Creation:** Instantly create new projects by simply providing a website URL. The system automatically captures a high-quality screenshot.
*   **Interactive Annotations:** Add numbered pins directly onto screenshots to highlight specific elements and provide detailed explanations or ask for feedback.
*   **Draft vs. Published Workflow:** Work on your projects in a private `DRAFT` state. When ready, `PUBLISH` a version to a shareable link for clients. You can continue to make changes to your draft without affecting the live version until you're ready to "Update Publish".
*   **Multi-Page Projects:** Add multiple screens or pages to a single project, either from a URL or by uploading an image.
*   **Secure Authentication:** A complete user signup and login system ensures that your draft projects remain private and accessible only to you.
*   **Self-Hosted Screenshot Service:** The project includes its own Node.js and Puppeteer-based backend service for taking high-quality, full-page screenshots, giving you full control over the capture process.

## Tech Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS
*   **Backend (Screenshot & Auth Service):** Node.js, Express, Puppeteer, JWT, bcrypt

## Running the Project Locally

This project consists of two parts: a frontend React application and a backend Node.js service. Both must be running simultaneously.

### Prerequisites

*   Node.js (v18 or later recommended)

### 1. Setup the Frontend

In your first terminal window, navigate to the project's root directory and install the dependencies:
```bash
npm install
npm run dev
```

### 2. Setup and Run the Backend Service

In a **second, separate terminal window**, navigate to the `backend` directory:
```bash
cd backend
npm install
npm start
```

Your application will now be running, with the frontend accessible at `http://localhost:5173` and the backend service running on `http://localhost:3001`.
