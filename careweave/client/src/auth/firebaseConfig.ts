// Firebase web configuration comes from client/.env (VITE_FIREBASE_*). These values identify the project and are
// meant to be public. What protects the data is the server checking the ID token, not hiding this file.
// Kept apart from firebase.ts so reading them does not pull the Firebase SDK into the first page load.
export const firebaseWebConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseConfigured = !!(firebaseWebConfig.apiKey && firebaseWebConfig.projectId && firebaseWebConfig.appId)
