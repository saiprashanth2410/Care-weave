import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'

// Firebase web configuration comes from client/.env (VITE_FIREBASE_*). These values identify the project and are
// meant to be public. What protects the data is the server checking the ID token, not hiding this file.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseConfigured = !!(config.apiKey && config.projectId && config.appId)

const auth = () => getAuth(getApps().length ? getApp() : initializeApp(config))

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this project.',
}
const friendly = (err: unknown) => new Error(MESSAGES[(err as { code?: string }).code ?? ''] ?? 'Sign-in failed. Try again.')

/** Signs in with Firebase and returns an ID token for the server to verify. */
export async function firebaseSignIn(email: string, password: string): Promise<string> {
  try {
    const cred = await signInWithEmailAndPassword(auth(), email, password)
    return await cred.user.getIdToken()
  } catch (err) {
    throw friendly(err)
  }
}

export async function firebaseResetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth(), email)
  } catch (err) {
    // Firebase reports an unknown address differently, but the page must not reveal which emails exist.
    if ((err as { code?: string }).code === 'auth/user-not-found') return
    throw friendly(err)
  }
}

export async function firebaseSignOut(): Promise<void> {
  if (!firebaseConfigured) return
  try {
    await signOut(auth())
  } catch {
    /* the server session is cleared either way */
  }
}
