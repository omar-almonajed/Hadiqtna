import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env } from './env.ts';

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;
let firestoreVerified = false;
let firestoreCheckDone = false;
let lastFirestoreError: string | null = null;

function parseServiceAccount(raw: string): ServiceAccount | null {
  if (!raw.trim()) return null;
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as ServiceAccount;
    }
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded) as ServiceAccount;
  } catch {
    return null;
  }
}

export function hasExplicitServiceAccount(): boolean {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || env.firebaseServiceAccountKey || '').trim();
  return Boolean(parseServiceAccount(raw));
}

export function getFirebaseAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const rawKey = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || env.firebaseServiceAccountKey || '').trim();
  const sa = parseServiceAccount(rawKey);
  if (sa) {
    adminApp = initializeApp({
      credential: cert(sa),
      projectId: env.firebaseConfig.projectId,
    });
  } else {
    adminApp = initializeApp({
      projectId: env.firebaseConfig.projectId,
    });
  }
  return adminApp;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  const shouldCheckRevoked = hasExplicitServiceAccount();
  return getAuth(app).verifyIdToken(idToken, shouldCheckRevoked);
}

export async function checkAdminFirestoreAvailability(): Promise<boolean> {
  if (firestoreCheckDone) return firestoreVerified;
  firestoreCheckDone = true;
  try {
    const app = getFirebaseAdminApp();
    const db = getFirestore(app, env.firebaseConfig.firestoreDatabaseId);
    await db.collection('_health_probe').limit(1).get();
    adminFirestore = db;
    firestoreVerified = true;
    lastFirestoreError = null;
    return true;
  } catch (err) {
    adminFirestore = null;
    firestoreVerified = false;
    const rawMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreError = env.firebaseServiceAccountKey
      ? rawMsg
      : `FIREBASE_SERVICE_ACCOUNT_KEY not configured (${rawMsg})`;
    return false;
  }
}

export async function verifyFirestoreWriteProbe(): Promise<{ ok: boolean; error: string | null }> {
  const connected = await checkAdminFirestoreAvailability();
  if (!connected || !adminFirestore) {
    return { ok: false, error: lastFirestoreError || 'Firestore Admin SDK is not connected.' };
  }
  try {
    const probeRef = adminFirestore.collection('_health_probe').doc('server_write_probe');
    await probeRef.set({ checkedAt: new Date().toISOString(), service: 'hadiqtna-api' });
    const snap = await probeRef.get();
    return { ok: snap.exists, error: snap.exists ? null : 'Probe document did not persist.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function getLastFirestoreError(): string | null {
  return lastFirestoreError;
}

export function getAdminFirestore(): Firestore | null {
  return firestoreVerified ? adminFirestore : null;
}

export function resetAdminFirestoreCheckForTest(): void {
  firestoreCheckDone = false;
  firestoreVerified = false;
  adminFirestore = null;
  lastFirestoreError = null;
}
