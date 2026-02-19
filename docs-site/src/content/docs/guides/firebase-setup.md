---
title: Firebase Setup
description: Create a Firebase project and configure it for Code Insights.
---

Code Insights needs two things from Firebase:

1. **Service account key** — Used by the CLI to write session data to Firestore.
2. **Web SDK config** — Used by the dashboard to read data from your Firestore.

This guide walks through creating both.

## Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or **"Add project"**)
3. Enter a project name (e.g., `code-insights-yourname`)
4. Disable Google Analytics when prompted (not needed)
5. Click **"Create project"** and wait for it to finish

## Enable Firestore

1. In your new project, click **"Build"** in the left sidebar
2. Click **"Firestore Database"**
3. Click **"Create database"**
4. Choose **"Start in production mode"**
5. Select the region closest to you (this cannot be changed later)
6. Click **"Enable"**

## Download the Service Account Key

1. Click the **gear icon** next to "Project Overview" in the sidebar
2. Select **"Project settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"** then **"Generate key"**
5. A JSON file will download — save it somewhere accessible (e.g., `~/Downloads/serviceAccountKey.json`)

The CLI will read three values from this file during setup: `project_id`, `client_email`, and `private_key`.

## Register a Web App

1. Still in **Project settings**, go to the **"General"** tab
2. Scroll down to **"Your apps"**
3. Click the **Web icon** (`</>`) to add a web app
4. Enter a nickname (e.g., `code-insights-web`), click **"Register app"**
5. Firebase will show a code snippet — copy the entire snippet and save it to a file (e.g., `~/Downloads/firebase-web-config.js`):

```javascript
// You can paste the entire Firebase snippet as-is
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

The CLI automatically extracts the config from the JavaScript — no manual conversion to JSON needed.

## Update Firestore Security Rules

The default production rules block all reads, which prevents the dashboard from loading your data. Update them:

1. In Firebase Console, go to **Firestore Database** then **Rules**
2. Replace the default rules with:

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

3. Click **"Publish"**

:::caution
These rules allow open access, which is fine for personal use since your project ID isn't public. For shared or team use, see the [Firebase Security Rules documentation](https://firebase.google.com/docs/firestore/security/get-started) to set up proper authentication-based rules.
:::

## Next Steps

You now have both JSON files needed to configure the CLI. Head to [Quick Start](/getting-started/quick-start/) to run `code-insights init` and start syncing.
