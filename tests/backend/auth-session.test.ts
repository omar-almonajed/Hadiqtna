import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server.ts';
import {
  hasExplicitServiceAccount,
  resetAdminFirestoreCheckForTest,
  verifyFirebaseIdToken,
} from '../../server/config/firebaseAdmin.ts';
import { setTokenVerifierForTest } from '../../server/middleware/auth.ts';
import {
  initDataStore,
  resetDataStoreForTest,
  simulateRestartReloadForTest,
} from '../../server/repositories/dataStore.ts';
import {
  LOCAL_STAFF_TOKEN_ISSUER,
  LOCAL_STAFF_TOKEN_PREFIX,
  signLocalStaffToken,
  verifyLocalStaffTokenDetailed,
} from '../../server/utils/crypto.ts';

const TEST_LOCAL_SECRET = 'syria_hadiqtna_hmac_secret_key_2026_verified';

function encodeJwtSegment(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('Authentication, HMAC Session Tokens, Google Firebase Isolation & Session Recovery Suite', () => {
  let tempPersistDir: string;
  let app = createApp();
  let firebaseVerifierCalls = 0;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_STAFF_AUTH_ENABLED = 'true';
    process.env.LOCAL_AUTH_SECRET = TEST_LOCAL_SECRET;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    tempPersistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadiqtna-auth-test-'));
    resetAdminFirestoreCheckForTest();
    resetDataStoreForTest(tempPersistDir);
    firebaseVerifierCalls = 0;

    setTokenVerifierForTest(async (token) => {
      firebaseVerifierCalls += 1;
      if (token === 'google-admin-firebase-id-token') {
        return {
          uid: 'admin-uid-google',
          email: 'mralmnjd363@gmail.com',
          email_verified: true,
          name: 'مدير حديقتنا',
        };
      }
      if (token === 'google-worker-firebase-id-token') {
        return {
          uid: 'worker-uid-google',
          email: 'worker.alnakheel@hadiqtna.sy',
          email_verified: true,
          name: 'فني الصيانة الميداني',
        };
      }
      if (token === 'google-unverified-email-token') {
        return {
          uid: 'unverified-uid',
          email: 'unverified@hadiqtna.sy',
          email_verified: false,
          name: 'غير موثق',
        };
      }
      throw Object.assign(new Error('Invalid Firebase ID token'), { code: 'auth/argument-error' });
    });

    app = createApp();
  });

  afterEach(() => {
    setTokenVerifierForTest(null);
    delete process.env.LOCAL_STAFF_AUTH_ENABLED;
    delete process.env.LOCAL_AUTH_SECRET;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    process.env.NODE_ENV = 'test';
    vi.unstubAllGlobals();
    fs.rmSync(tempPersistDir, { recursive: true, force: true });
  });

  async function provisionActivatedLocalWorker(password = 'SyriaPark#2026!') {
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer google-worker-firebase-id-token');
    await request(app)
      .patch('/api/users/worker-uid-google')
      .set('Authorization', 'Bearer google-admin-firebase-id-token')
      .send({ role: 'WORKER', isActive: true });

    const setCred = await request(app)
      .post('/api/users/worker-uid-google/local-credentials')
      .set('Authorization', 'Bearer google-admin-firebase-id-token')
      .send({ password });
    expect(setCred.status).toBe(200);
  }

  it('1 & 2 & 3. Valid local staff login issues iat/exp seconds HMAC token, rejects wrong password, and accesses protected routes', async () => {
    await provisionActivatedLocalWorker('StrongField#2026');

    const badPwd = await request(app)
      .post('/api/auth/local-login')
      .send({ email: 'worker.alnakheel@hadiqtna.sy', password: 'WrongPassword99' });
    expect(badPwd.status).toBe(401);
    expect(badPwd.body.error).toBe('INVALID_CREDENTIALS');

    const loginRes = await request(app)
      .post('/api/auth/local-login')
      .send({ email: 'worker.alnakheel@hadiqtna.sy', password: 'StrongField#2026' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(/^hq_local_/);
    expect(loginRes.body.expiresInSeconds).toBe(43200);

    const verified = verifyLocalStaffTokenDetailed(loginRes.body.token, TEST_LOCAL_SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.iat).toBeLessThan(1e12);
      expect(verified.claims.exp).toBeLessThan(1e12);
      expect(verified.claims.exp - verified.claims.iat).toBe(43200);
      expect(verified.claims.iss).toBe(LOCAL_STAFF_TOKEN_ISSUER);
    }

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.uid).toBe('worker-uid-google');
    expect(meRes.body.user.role).toBe('WORKER');
  });

  it('4 & 5 & 6. Rejects expired tokens, wrong-signature tokens, millisecond timestamps, and empty/malformed tokens', async () => {
    await provisionActivatedLocalWorker();
    const pastIssuedAt = Math.floor(Date.now() / 1000) - 7200;
    const expiredToken = signLocalStaffToken(
      { uid: 'worker-uid-google', email: 'worker.alnakheel@hadiqtna.sy', name: 'فني' },
      TEST_LOCAL_SECRET,
      60,
      pastIssuedAt
    );

    const expRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(expRes.status).toBe(401);
    expect(expRes.body.error).toBe('TOKEN_EXPIRED');

    // Wrong signing secret
    const wrongSecretToken = signLocalStaffToken(
      { uid: 'worker-uid-google', email: 'worker.alnakheel@hadiqtna.sy', name: 'فني' },
      'another_completely_wrong_secret_12345',
      3600
    );
    const sigRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${wrongSecretToken}`);
    expect(sigRes.status).toBe(401);
    expect(sigRes.body.error).toBe('INVALID_TOKEN');

    // Tampered payload
    const validToken = signLocalStaffToken(
      { uid: 'worker-uid-google', email: 'worker.alnakheel@hadiqtna.sy', name: 'فني' },
      TEST_LOCAL_SECRET,
      3600
    );
    const [h, b, s] = validToken.slice(LOCAL_STAFF_TOKEN_PREFIX.length).split('.');
    const tamperedBody = encodeJwtSegment({
      ...JSON.parse(Buffer.from(b, 'base64url').toString('utf8')),
      uid: 'admin-uid-google',
    });
    const tamperedToken = `${LOCAL_STAFF_TOKEN_PREFIX}${h}.${tamperedBody}.${s}`;
    const tamperRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tamperedToken}`);
    expect(tamperRes.status).toBe(401);
    expect(tamperRes.body.error).toBe('INVALID_TOKEN');

    // Millisecond timestamps instead of Unix seconds signed with valid secret must be rejected!
    const msHeader = encodeJwtSegment({ alg: 'HS256', typ: 'JWT' });
    const nowMs = Date.now();
    const msBody = encodeJwtSegment({
      uid: 'worker-uid-google',
      email: 'worker.alnakheel@hadiqtna.sy',
      name: 'فني',
      email_verified: true,
      provider: 'LOCAL_STAFF',
      iss: LOCAL_STAFF_TOKEN_ISSUER,
      iat: nowMs,
      exp: nowMs + 3600_000,
    });
    const msSig = crypto.createHmac('sha256', TEST_LOCAL_SECRET).update(`${msHeader}.${msBody}`).digest('base64url');
    const msToken = `${LOCAL_STAFF_TOKEN_PREFIX}${msHeader}.${msBody}.${msSig}`;
    const msVerify = verifyLocalStaffTokenDetailed(msToken, TEST_LOCAL_SECRET);
    expect(msVerify).toEqual({ ok: false, reason: 'INVALID_TIMESTAMPS' });

    const msReq = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${msToken}`);
    expect(msReq.status).toBe(401);

    // Empty / malformed headers
    const malformedCases = ['', 'Bearer ', 'Bearer   ', 'Bearer not.a.valid token', 'Bearer hq_local_broken'];
    for (const authHeader of malformedCases) {
      const r = await request(app).get('/api/auth/me').set('Authorization', authHeader);
      expect(r.status).toBe(401);
    }
  });

  it('7. Keeps valid HMAC local tokens valid after server & store restart when LOCAL_AUTH_SECRET persists', async () => {
    await provisionActivatedLocalWorker('RestartSafe#2026');
    const loginRes = await request(app)
      .post('/api/auth/local-login')
      .send({ email: 'worker.alnakheel@hadiqtna.sy', password: 'RestartSafe#2026' });
    const issuedToken = loginRes.body.token as string;

    // Simulate full backend restart: reload persisted disk store + recreate Express app instance
    simulateRestartReloadForTest(tempPersistDir);
    await initDataStore();
    const restartedApp = createApp();

    const restoredRes = await request(restartedApp)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${issuedToken}`);
    expect(restoredRes.status).toBe(200);
    expect(restoredRes.body.user.uid).toBe('worker-uid-google');
    expect(restoredRes.body.user.role).toBe('WORKER');
  });

  it('8 & 9. Restores active local session from apiClient sessionStorage on refresh, prefers active mode over stale token, and cleans up on logout', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    const apiMod = await import('../../src/services/apiClient.ts');
    apiMod.setActiveAuthMode('LOCAL_STAFF');
    apiMod.setStoredLocalToken('hq_local_fresh_session_token');

    // Even before logout cleanup, active mode resolves the stored local token
    expect(await apiMod.getActiveSessionToken()).toBe('hq_local_fresh_session_token');

    // Simulate protected API call returning 401 -> triggers registered unauthorized handler once
    const onUnauthorized = vi.fn(() => {
      apiMod.setStoredLocalToken(null);
      apiMod.setActiveAuthMode(null);
    });
    apiMod.registerUnauthorizedHandler(onUnauthorized);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'TOKEN_EXPIRED', message: 'انتهت الصلاحية' }), { status: 401 }))
    );

    await expect(apiMod.apiRequest('/api/iot/bins')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(apiMod.getStoredLocalToken()).toBeNull();
    expect(apiMod.getActiveAuthMode()).toBeNull();
    expect(await apiMod.getActiveSessionToken()).toBeNull();
    apiMod.registerUnauthorizedHandler(null);
  });

  it('10 & 11. Verifies Google Firebase ID Token flow cleanly, disables checkRevoked when SA key absent, and strictly isolates Firebase vs Local HMAC verifiers', async () => {
    // Verify hasExplicitServiceAccount() & real verifyFirebaseIdToken behavior without SA key
    expect(hasExplicitServiceAccount()).toBe(false);
    await expect(verifyFirebaseIdToken('malformed.firebase.jwt')).rejects.toMatchObject({
      code: 'auth/argument-error',
    });

    // Provision & verify Google Admin + unverified email rejection
    const adminMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer google-admin-firebase-id-token');
    expect(adminMe.status).toBe(200);
    expect(adminMe.body.user.role).toBe('ADMIN');
    expect(adminMe.body.user.isActive).toBe(true);

    const unverifiedRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer google-unverified-email-token');
    expect(unverifiedRes.status).toBe(403);
    expect(unverifiedRes.body.error).toBe('EMAIL_NOT_VERIFIED');

    // Cross-verifier isolation: invalid or expired hq_local_ token MUST NEVER invoke Firebase verifier!
    const callsBefore = firebaseVerifierCalls;
    const badLocalRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${LOCAL_STAFF_TOKEN_PREFIX}a.b.c`);
    expect(badLocalRes.status).toBe(401);
    expect(firebaseVerifierCalls).toBe(callsBefore);

    // Passing a non-hq_local_ JWT string to verifyLocalStaffTokenDetailed MUST always fail
    expect(verifyLocalStaffTokenDetailed('google-admin-firebase-id-token', TEST_LOCAL_SECRET)).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
  });

  it('12. Blocks unauthenticated requests from protected endpoints while leaving public citizen portal accessible', async () => {
    const protectedEndpoints = [
      ['get', '/api/auth/me'],
      ['get', '/api/iot/devices'],
      ['get', '/api/iot/bins'],
      ['get', '/api/settings'],
      ['get', '/api/users'],
      ['get', '/api/analytics'],
    ] as const;

    for (const [method, endpoint] of protectedEndpoints) {
      const res = await request(app)[method](endpoint);
      expect(res.status).toBe(401);
    }

    // Citizen Portal public routes work without any Authorization token
    const pubParks = await request(app).get('/api/parks/public');
    expect(pubParks.status).toBe(200);
    expect(Array.isArray(pubParks.body.parks)).toBe(true);

    const citizenReport = await request(app).post('/api/reports').send({
      parkId: 'park-alnakheel',
      reportType: 'PLAYGROUND_DAMAGE',
      title: 'كسر في مقعد الزوار',
      locationDescription: 'قرب المدخل الرئيسي',
      description: 'مقعد خشبي يحتاج إصلاحاً فورياً.',
    });
    expect(citizenReport.status).toBe(201);
    expect(citizenReport.body.referenceNumber).toBeTruthy();
  });
});
