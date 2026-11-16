import type { NextFunction, Request, Response } from 'express';
import { env, getLocalAuthConfig } from '../config/env.ts';
import { verifyFirebaseIdToken } from '../config/firebaseAdmin.ts';
import {
  getDocument,
  setDocument,
  type DeviceCredentialRecord,
} from '../repositories/dataStore.ts';
import {
  LOCAL_STAFF_TOKEN_PREFIX,
  timingSafeStringEqual,
  verifyDeviceToken,
  verifyLocalStaffTokenDetailed,
} from '../utils/crypto.ts';
import type { StaffDirectoryEntry, UserProfile, UserRole } from '../../src/types/domain.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      authenticatedDeviceId?: string;
    }
  }
}

export type TokenVerifier = (token: string) => Promise<{
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}>;

let customTestTokenVerifier: TokenVerifier | null = null;

export function setTokenVerifierForTest(verifier: TokenVerifier | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test token verifier can only be set in NODE_ENV=test');
  }
  customTestTokenVerifier = verifier;
}

async function resolveUserProfile(
  decoded: {
    uid: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  },
  provider: 'FIREBASE' | 'LOCAL_STAFF'
): Promise<AuthenticatedUser | null> {
  const email = (decoded.email || '').toLowerCase();
  const emailVerified = Boolean(decoded.email_verified);
  const fullName = decoded.name || email.split('@')[0] || 'مستخدم';
  const now = new Date().toISOString();

  let profile = await getDocument<UserProfile>('users', decoded.uid);

  // Local staff tokens must map strictly to an existing user record (never auto-provision via local token)
  if (provider === 'LOCAL_STAFF') {
    if (!profile) return null;
    return {
      uid: profile.uid,
      email: profile.email,
      emailVerified,
      fullName: profile.fullName,
      role: profile.role,
      isActive: profile.isActive,
    };
  }

  const isBootstrap = emailVerified && email === env.bootstrapAdminEmail;

  if (!profile) {
    profile = {
      uid: decoded.uid,
      fullName,
      email,
      role: isBootstrap ? 'ADMIN' : 'PENDING',
      isActive: isBootstrap,
      createdAt: now,
      updatedAt: now,
    };
    await setDocument('users', decoded.uid, profile as unknown as Record<string, unknown>);
    const dirEntry: StaffDirectoryEntry = {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
      isActive: profile.isActive,
      updatedAt: now,
    };
    await setDocument('staffDirectory', decoded.uid, dirEntry as unknown as Record<string, unknown>);
  } else if (isBootstrap && (profile.role !== 'ADMIN' || !profile.isActive)) {
    profile = {
      ...profile,
      role: 'ADMIN',
      isActive: true,
      updatedAt: now,
    };
    await setDocument('users', decoded.uid, profile as unknown as Record<string, unknown>);
    const dirEntry: StaffDirectoryEntry = {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
      isActive: profile.isActive,
      updatedAt: now,
    };
    await setDocument('staffDirectory', decoded.uid, dirEntry as unknown as Record<string, unknown>);
  }

  return {
    uid: profile.uid,
    email: profile.email,
    emailVerified,
    fullName: profile.fullName,
    role: profile.role,
    isActive: profile.isActive,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.path === '/stream' && typeof req.query.token === 'string') {
      token = req.query.token.trim();
    }

    if (!token || /\s/.test(token) || token.length > 8192) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'مطلوب تسجيل الدخول للوصول إلى هذا المسار.',
      });
      return;
    }

    // Strict Path 1: Local Staff HMAC Session Token (never falls through to Firebase verifier)
    if (token.startsWith(LOCAL_STAFF_TOKEN_PREFIX)) {
      const localCfg = getLocalAuthConfig();
      if (!localCfg.configured) {
        res.status(401).json({
          success: false,
          error: 'LOCAL_AUTH_DISABLED',
          message: 'المصادقة المحلية غير مفعّلة أو لم يتم تهيئة سر التوقيع على الخادم.',
        });
        return;
      }

      const verified = verifyLocalStaffTokenDetailed(token, localCfg.secret);
      if (verified.ok === false) {
        const isExpired = verified.reason === 'EXPIRED';
        res.status(401).json({
          success: false,
          error: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: isExpired
            ? 'انتهت صلاحية الجلسة المحلية، يرجى تسجيل الدخول مجدداً.'
            : 'رمز الجلسة غير صالح أو منتهي الصلاحية.',
        });
        return;
      }

      const resolved = await resolveUserProfile(verified.claims, 'LOCAL_STAFF');
      if (!resolved) {
        res.status(401).json({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'حساب الجلسة غير موجود، يرجى تسجيل الدخول مجدداً.',
        });
        return;
      }

      req.user = resolved;
      next();
      return;
    }

    // Strict Path 2: Firebase ID Token (never falls through to Local HMAC verifier)
    let decoded: {
      uid: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    try {
      decoded = customTestTokenVerifier
        ? await customTestTokenVerifier(token)
        : await verifyFirebaseIdToken(token);
    } catch (err) {
      const fbCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const isExpired = fbCode === 'auth/id-token-expired' || fbCode === 'auth/id-token-revoked';
      res.status(401).json({
        success: false,
        error: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired
          ? 'انتهت صلاحية جلسة Firebase، يرجى تسجيل الدخول مجدداً.'
          : 'رمز الجلسة غير صالح أو منتهي الصلاحية.',
      });
      return;
    }

    if (!decoded.email_verified) {
      res.status(403).json({
        success: false,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'يجب التحقق من البريد الإلكتروني للمتابعة.',
      });
      return;
    }

    const resolved = await resolveUserProfile(decoded, 'FIREBASE');
    if (!resolved) {
      res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'تعذر استرجاع ملف الحساب.',
      });
      return;
    }

    req.user = resolved;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'رمز الجلسة غير صالح أو منتهي الصلاحية.',
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'غير مصرح بالوصول.',
      });
      return;
    }
    if (!req.user.isActive || req.user.role === 'PENDING') {
      res.status(403).json({
        success: false,
        error: 'ACCOUNT_PENDING_OR_INACTIVE',
        message: 'حسابك بانتظار التفعيل أو معطّل من قِبل مدير النظام.',
      });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'ليست لديك الصلاحية الكافية لتنفيذ هذا الإجراء.',
      });
      return;
    }
    next();
  };
}

export async function requireDeviceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const altHeader = typeof req.headers['x-device-token'] === 'string' ? req.headers['x-device-token'] : '';
    let rawToken = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7).trim();
    } else if (altHeader) {
      rawToken = altHeader.trim();
    }

    if (!rawToken) {
      res.status(401).json({
        success: false,
        error: 'MISSING_DEVICE_TOKEN',
        message: 'رمز مصادقة الجهاز مفقود في الترويسة Authorization.',
      });
      return;
    }

    const rawDeviceId = req.body?.deviceId ?? req.body?.d;
    const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId.trim() : '';

    if (!deviceId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_ID',
        message: 'حقل deviceId مطلوب.',
      });
      return;
    }

    const cred = await getDocument<DeviceCredentialRecord>('deviceCredentials', deviceId);
    if (!cred || cred.isRevoked) {
      res.status(401).json({
        success: false,
        error: 'DEVICE_TOKEN_REVOKED_OR_UNKNOWN',
        message: 'رمز الجهاز غير صالح أو تم إلغاؤه.',
      });
      return;
    }

    if (!verifyDeviceToken(rawToken, cred.tokenHash)) {
      res.status(401).json({
        success: false,
        error: 'INVALID_DEVICE_TOKEN',
        message: 'فشل التحقق من رمز مصادقة الجهاز.',
      });
      return;
    }

    req.authenticatedDeviceId = deviceId;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'DEVICE_AUTH_ERROR',
      message: 'تعذر التحقق من مصادقة الجهاز.',
    });
  }
}

export function requireSyncSecret(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = (process.env.SYNC_SHARED_SECRET || env.syncSharedSecret || '').trim();
  if (configuredSecret.length < 16) {
    res.status(503).json({
      success: false,
      error: 'SYNC_NOT_CONFIGURED',
      message: 'مزامنة الخادم المحلي غير مفعّلة (SYNC_SHARED_SECRET غير مضبوط).',
    });
    return;
  }

  const provided = typeof req.headers['x-sync-secret'] === 'string' ? req.headers['x-sync-secret'].trim() : '';
  if (!timingSafeStringEqual(provided, configuredSecret)) {
    res.status(401).json({
      success: false,
      error: 'INVALID_SYNC_SECRET',
      message: 'رمز مصادقة المزامنة غير صالح.',
    });
    return;
  }

  next();
}
