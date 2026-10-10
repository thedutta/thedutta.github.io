/* ============================================================
   Splitbaby — Firebase project config

   Paste the object Firebase hands you at:
     console.firebase.google.com
       -> Project settings -> Your apps -> Web (</>)

   This is NOT a secret. A web API key is a public project
   identifier; Firestore security rules are what actually
   control access. See firestore.rules.

   While the placeholders below are still here the app runs
   entirely in DEMO MODE on localStorage, so the whole UI is
   usable before the project exists.
   ============================================================ */

export const FIREBASE_CONFIG = {
  apiKey:            "PASTE_API_KEY",
  authDomain:        "PASTE_PROJECT.firebaseapp.com",
  projectId:         "PASTE_PROJECT",
  storageBucket:     "PASTE_PROJECT.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId:             "PASTE_APP_ID"
};
