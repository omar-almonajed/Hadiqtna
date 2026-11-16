import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server.ts';
import { setTokenVerifierForTest } from '../../server/middleware/auth.ts';
import { resetDataStoreForTest } from '../../server/repositories/dataStore.ts';

const app = createApp();

function setupAuthTokens() {
  setTokenVerifierForTest(async (token) => {
    if (token === 'admin-token') {
      return {
        uid: 'admin-uid-1',
        email: 'mralmnjd363@gmail.com',
        email_verified: true,
        name: 'مدير النظام',
      };
    }
    if (token === 'worker-token') {
      return {
        uid: 'worker-uid-1',
        email: 'worker@example.com',
        email_verified: true,
        name: 'فني الصيانة',
      };
    }
    throw new Error('Invalid test token');
  });
}

describe('Hadiqtna IoT REST API & Security Tests', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDataStoreForTest();
    setupAuthTokens();
  });

  it('GET /api/health returns backend availability and database connectivity', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.databaseConnected).toBe(true);
  });

  it('rejects unauthenticated staff API access with 401 and pending user with 403', async () => {
    const unauth = await request(app).get('/api/iot/devices');
    expect(unauth.status).toBe(401);

    // First login as worker creates a PENDING user who cannot access protected routes
    const pendingRes = await request(app)
      .get('/api/iot/bins')
      .set('Authorization', 'Bearer worker-token');
    expect(pendingRes.status).toBe(403);
  });

  it('provisions device token, ingests ESP32 readings, rejects invalid/duplicate payloads, and triggers deduplicated 80% alerts', async () => {
    // 1. Admin rotates/provisions token for pilot device BIN-ESP32-001
    const rotRes = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    expect(rotRes.status).toBe(200);
    const deviceToken = rotRes.body.provisionedToken as string;
    expect(deviceToken.startsWith('hq_dev_')).toBe(true);

    // 2. Reject invalid device token
    const badTokenRes = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', 'Bearer wrong_token')
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 1,
        distanceCm: 50,
        signalStrength: -65,
        measuredAt: new Date().toISOString(),
      });
    expect(badTokenRes.status).toBe(401);

    // 3. Reject negative distance (-10cm)
    const negRes = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 1,
        distanceCm: -10,
        signalStrength: -65,
        measuredAt: new Date().toISOString(),
      });
    expect(negRes.status).toBe(422);

    // 4. Accept valid reading below 80% (empty=90, full=15 -> dist=52.5 => 50%)
    const ok50 = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 10,
        distanceCm: 52.5,
        signalStrength: -62,
        measuredAt: new Date().toISOString(),
      });
    expect(ok50.status).toBe(201);
    expect(ok50.body.fillPercentage).toBe(50);
    expect(ok50.body.alertTriggered).toBe(false);

    // 5. Reject duplicate/replayed sequenceNumber <= 10
    const replayRes = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 10,
        distanceCm: 50,
        signalStrength: -62,
        measuredAt: new Date().toISOString(),
      });
    expect(replayRes.status).toBe(409);

    // 6. Cross 80% threshold (dist=28.5 -> (90-28.5)/75 = 82%)
    const ok82 = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 11,
        distanceCm: 28.5,
        signalStrength: -60,
        measuredAt: new Date().toISOString(),
      });
    expect(ok82.status).toBe(201);
    expect(ok82.body.fillPercentage).toBe(82);
    expect(ok82.body.alertTriggered).toBe(true);

    // 7. Subsequent reading at 85% should NOT create duplicate alert
    const ok85 = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 12,
        distanceCm: 26.2,
        signalStrength: -60,
        measuredAt: new Date().toISOString(),
      });
    expect(ok85.status).toBe(201);
    expect(ok85.body.alertTriggered).toBe(false);

    const alertsRes = await request(app)
      .get('/api/iot/alerts')
      .set('Authorization', 'Bearer admin-token');
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.alerts).toHaveLength(1);

    // 8. Revoke token and verify subsequent reading is rejected
    const revokeRes = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/revoke')
      .set('Authorization', 'Bearer admin-token');
    expect(revokeRes.status).toBe(200);

    const afterRevoke = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        deviceId: 'BIN-ESP32-001',
        sequenceNumber: 13,
        distanceCm: 40,
        signalStrength: -60,
        measuredAt: new Date().toISOString(),
      });
    expect(afterRevoke.status).toBe(401);
  });
});
