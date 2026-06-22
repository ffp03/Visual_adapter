# Walkthrough - Centralized Smart Rule Architecture

## Overview
We have successfully refactored the Visual Adapter to use a **Centralized Knowledge Base**.
- **Client**: The extension is now a "Thin Client" that requests rules from the cloud.
- **Backend**: A Node.js service (to be hosted on Hugging Face) that generates and optimizes rules.
- **Storage**: Firebase Realtime Database stores rules and requests.

## 🚀 Deployment Guide (Hugging Face)

### 1. Create Space
1.  Go to [huggingface.co/new-space](https://huggingface.co/new-space).
2.  **Name**: `visual-adapter-backend`
3.  **License**: `MIT`
4.  **SDK**: `Docker`
5.  Click **Create Space**.

### 2. Upload Files
1.  In your Space, go to the **Files** tab.
2.  Click **Add file > Upload files**.
3.  Upload the following files from `Visual_adapter/backend/`:
    -   `Dockerfile`
    -   `package.json`
    -   `index.js`
4.  Click **Commit changes**.

### 3. Configure Secrets
1.  Go to **Settings** tab (top right of Space).
2.  Scroll to **Variables and secrets**.
3.  Add the following **Secrets** (NOT Variables):
    -   `FIREBASE_URL`: `https://visual-adapter-default-rtdb.firebaseio.com/`
    -   `FIREBASE_SECRET`: `pr6IGWkc8Wa28DqgfxMWZdZueGfKyJfoWhPf4g9V`
    -   `GEMINI_API_KEY`: *(Your Gemini API Key)*

### 4. Verify
- The Space will build (takes ~2-3 mins).
- Once "Running", the backend is live!

## 🧪 Verification

### Manual Test (Local)
To verify the backend logic *before* deploying:
1.  Open a terminal in `Visual_adapter/backend`.
2.  Run `npm install`.
3.  Run `node index.js`.
4.  In another terminal, run `node ../tests/backend_test.js`.
5.  You should see "SUCCESS: Rule generated!".

### Extension Test
1.  Load the extension in Chrome.
2.  Visit a new site (e.g., `https://example.com`).
3.  **Observe**:
    -   Banner: "⏳ Analyzing page structure..."
    -   (After ~5s): Banner turns Green "✨ Smart Rule Found!"
    -   Content updates automatically.

## 📂 Key Changes
- **[NEW] `backend/`**: Contains the Brain (Node.js service).
- **[MOD] `background.js`**: Removed local AI, added Request/Listen logic.
- **[MOD] `sidepanel.js`**: Added "Pending" state and Live Update support.
- **[DEL] `options.html`**: Removed API Key setup (no longer needed on client).
