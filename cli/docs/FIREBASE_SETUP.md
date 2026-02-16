# Firebase Setup Guide

This guide walks you through setting up Firebase for Code Insights.

## Prerequisites

- A Google account
- [Firebase Console](https://console.firebase.google.com) access

> **Tip:** For visual guidance with screenshots, see [Firebase's official documentation](https://firebase.google.com/docs/web/setup).

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"** (or **"Add project"**)
3. Enter a project name (e.g., "code-insights-data")
4. Disable Google Analytics (optional, not needed)
5. Click **"Create project"**

## Step 2: Enable Firestore

1. In your Firebase project, click **"Build"** in the sidebar
2. Click **"Firestore Database"**
3. Click **"Create database"**
4. Choose **"Start in production mode"**
5. Select a location closest to you (this cannot be changed later)
6. Click **"Enable"**

## Step 3: Download Service Account Key

1. Click the **gear icon** next to "Project Overview"
2. Select **"Project settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"**
5. Click **"Generate key"** to download the JSON file
6. Save the file (e.g., `~/Downloads/serviceAccountKey.json`)

## Step 4: Get Web SDK Config (for Dashboard)

1. In Project Settings, go to the **"General"** tab
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., "code-insights-web")
5. Click **"Register app"**
6. Note the config values shown — you'll enter them during `code-insights init`

> **Tip:** Click the **"Config"** radio button (instead of "npm") to see the raw key-value pairs. You'll need: `apiKey`, `authDomain`, `storageBucket`, `messagingSenderId`, and `appId`.

## Step 5: Configure Code Insights CLI

```bash
code-insights init
```

The interactive wizard will prompt you for:
1. **Service account credentials** — `project_id`, `client_email`, and `private_key` from the JSON file downloaded in Step 3
2. **Web SDK config** — the values from Step 4
3. **Dashboard URL** — press Enter for the default (`https://code-insights.app`)

## Step 6: Sync Your Sessions

```bash
code-insights sync
```

## Step 7: Open the Dashboard

Generate a URL to connect the dashboard to your Firebase:

```bash
code-insights connect
```

Or visit [code-insights.app](https://code-insights.app) and configure manually.

## Troubleshooting

### "Permission denied" errors

Update Firestore security rules in Firebase Console > Firestore > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> **Security Warning:** The rules above allow anyone with your project ID to read/write data. This is fine for personal use since your project ID is not public. For shared or team use, implement proper authentication rules. See [Firebase Security Rules documentation](https://firebase.google.com/docs/firestore/security/get-started).

### "Invalid service account" errors

- Ensure the JSON file is unmodified from Firebase
- Check that private_key includes BEGIN/END markers

### Dashboard not connecting

- Verify web config `projectId` matches service account `project_id`
- Clear browser localStorage and try the setup link again
