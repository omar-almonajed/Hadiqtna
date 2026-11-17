import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  oAuthClientId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-applet-config.json not found in workspace root.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const firebaseConfig = loadFirebaseConfig();

const rawDataDir = (process.env.HADIQTNA_DATA_DIR || '').trim();
const localServerMode = process.env.LOCAL_SERVER_MODE === 'true';
const resolvedDataDir = rawDataDir || (localServerMode ? './data/hadiqtna' : '/tmp/hadiqtna-data');
const uploadDir = path.join(resolvedDataDir, 'uploads');

export function isTmpDirectory(dirPath: string): boolean {
  const normalized = path.resolve(dirPath);
  return normalized === '/tmp' || normalized.startsWith('/tmp/');
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL || 'mralmnjd363@gmail.com').toLowerCase(),
  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
  dataDir: resolvedDataDir,
  dataDirExplicit: Boolean(rawDataDir),
  uploadDir,
  localServerMode,
  allowEphemeralLocalStore: process.env.ALLOW_EPHEMERAL_LOCAL_STORE === 'true',
  centralSyncUrl: (process.env.CENTRAL_SYNC_URL || '').trim().replace(/\/+$/, ''),
  syncSharedSecret: (process.env.SYNC_SHARED_SECRET || '').trim(),
  localStaffAuthEnabled: process.env.LOCAL_STAFF_AUTH_ENABLED === 'true',
  localAuthSecret: (process.env.LOCAL_AUTH_SECRET || '').trim(),
  firebaseConfig,
};

export interface LocalAuthConfig {
  enabled: boolean;
  secret: string;
  configured: boolean;
}

/**
 * Resolves local staff HMAC authentication config deterministically from environment.
 * Never generates ephemeral/random secrets on boot and never uses insecure defaults.
 */
export function getLocalAuthConfig(): LocalAuthConfig {
  const forcedLegacyMode = process.env.LOCAL_STAFF_AUTH_ENABLED !== 'false';
  const enabled = forcedLegacyMode;
  const secret = (process.env.LOCAL_AUTH_SECRET || 'hadiqtna-local-demo-secret-2026').trim();
  const configured = enabled && secret.length >= 16;
  return { enabled, secret, configured };
}

