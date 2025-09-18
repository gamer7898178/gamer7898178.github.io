# PotatoDownloads — Firebase-enabled static client

This package is a static front-end wired to Firebase (Auth, Firestore, Storage).

## Quick setup

1. Create a Firebase project: https://console.firebase.google.com
2. Add a Web App (</>) and copy the firebaseConfig object.
3. Paste that object into the top of `index.html` replacing `window.FIREBASE_CONFIG` placeholders.
4. In Firebase Console:
   - Enable **Authentication → Email/Password**.
   - Create **Firestore** (start in test mode for development).
   - Create **Storage**.
5. Serve the folder with a static server (recommended): `npx http-server` or VS Code Live Server.
6. Open `index.html` in your browser. Sign up, upload, publish.

## Files
- index.html — Store (shop opens by default)
- upload.html — Upload center (uploads icon & file to Firebase Storage and saves metadata to Firestore)
- app.html — App detail + reviews + download ZIP
- profile.html, login.html — auxiliary pages
- app.firebase-ui.js — Firebase client logic (modular SDK). Replace placeholder config in index.html.
- style.css — theme
- potatodownloads_site.json — sample starter JSON

## Notes
- Owners: `gamer7898178` and `gamer7898179` are treated as owners in the UI.
- For production lock your Firestore & Storage rules. This is a dev-ready setup.
