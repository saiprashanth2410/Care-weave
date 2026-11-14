import { getApp, getApps, initializeApp } from 'firebase/app'
import { confirmPasswordReset, getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, verifyPasswordResetCode } from 'firebase/auth'

import { firebaseConfigured, firebaseWebConfig } from './firebaseConfig'

const auth = () => getAuth(getApps().length ? getApp() : initializeApp(firebaseWebConfig))

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this project.',
  'auth/expired-action-code': 'This link has expired. Ask an administrator for a new one.',
  'auth/invalid-action-code': 'This link is not valid or was already used. Ask an administrator for a new one.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
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

/** Checks a reset link's one-time code and returns the email address it is for. */
export async function firebaseVerifyResetCode(code: string): Promise<string> {
  try {
    return await verifyPasswordResetCode(auth(), code)
  } catch (err) {
    throw friendly(err)
  }
}

/** Saves the new password for a reset link's code. The code works once. */
export async function firebaseConfirmReset(code: string, password: string): Promise<void> {
  try {
    await confirmPasswordReset(auth(), code, password)
  } catch (err) {
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
