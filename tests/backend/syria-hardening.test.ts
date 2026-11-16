import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server.ts';
import { resetAdminFirestoreCheckForTest } from '../../server/config/firebaseAdmin.ts';
import { setTokenVerifierForTest } from '../../server/middleware/auth.ts';
import {
  getDocument,
  initDataStore,
  listCollection,
  resetDataStoreForTest,
  simulateRestartReloadForTest,
  updateDocument,
} from '../../server/repositories/dataStore.ts';
import { evaluateOfflineDevices } from '../../server/services/alertEngine.ts';
import { flushSyncOutbox, getSyncStatus } from '../../server/services/syncService.ts';
import type { AlertItem, Device, SensorReading, SyncOutboxItem } from '../../src/types/domain.ts';

const app = createApp();

// Software mirror of ESP32 bounded FIFO queue overflow policy (DROP_OLDEST)
function simulateEsp32OfflineBuffer<T>(capacity: number, readings: T[]) {
  const queue: T[] = [];
  let droppedOverflowCount = 0;
  for (const r of readings) {
    if (queue.length >= capacity) {
      queue.shift();
      droppedOverflowCount += 1;
    }
    queue.push(r);
  }
  return { queue, droppedOverflowCount };
}

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
        email: 'worker@syria-park.example',
        email_verified: true,
        name: 'فني الحديقة',
      };
    }
    throw new Error('Invalid token');
  });
}

describe('Syria Field Deployment Hardening Suite', () => {
  let tempPersistDir: string;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.LOCAL_SERVER_MODE;
    delete process.env.CENTRAL_SYNC_URL;
    delete process.env.SYNC_SHARED_SECRET;
    delete process.env.LOCAL_STAFF_AUTH_ENABLED;
    delete process.env.LOCAL_AUTH_SECRET;
    delete process.env.ALLOW_EPHEMERAL_LOCAL_STORE;
    tempPersistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadiqtna-syria-test-'));
    resetAdminFirestoreCheckForTest();
    resetDataStoreForTest(tempPersistDir);
    setupAuthTokens();
  });

  afterEach(() => {
    delete process.env.LOCAL_SERVER_MODE;
    delete process.env.CENTRAL_SYNC_URL;
    delete process.env.SYNC_SHARED_SECRET;
    delete process.env.LOCAL_STAFF_AUTH_ENABLED;
    delete process.env.LOCAL_AUTH_SECRET;
    delete process.env.ALLOW_EPHEMERAL_LOCAL_STORE;
    process.env.NODE_ENV = 'test';
    fs.rmSync(tempPersistDir, { recursive: true, force: true });
  });

  it('buffers offline readings with bounded DROP_OLDEST policy, flushes compact batch on reconnect, and prevents duplicates', async () => {
    // Provision device token
    const rot = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    expect(rot.status).toBe(200);
    const deviceToken = rot.body.provisionedToken as string;

    // Step 1: Simulate 125 offline readings buffered in a 120-slot bounded ESP32 queue -> oldest 5 dropped
    const generated = Array.from({ length: 125 }, (_, i) => ({
      s: i + 1,
      cm: 60 - (i % 10),
      r: -68,
      t: new Date(Date.now() - (125 - i) * 300_000).toISOString(),
    }));
    const buffered = simulateEsp32OfflineBuffer(120, generated);
    expect(buffered.queue).toHaveLength(120);
    expect(buffered.droppedOverflowCount).toBe(5);
    expect(buffered.queue[0].s).toBe(6);

    // Step 2: Reconnect and flush first compact batch (seq 6..15) using compact low-bandwidth keys
    const batch1 = await request(app)
      .post('/api/iot/readings/batch')
      .set('x-device-token', deviceToken)
      .send({
        d: 'BIN-ESP32-001',
        b: buffered.queue.slice(0, 10),
        q: buffered.queue.length - 10,
        ov: buffered.droppedOverflowCount,
        rst: 'BROWNOUT_POWER_DROP',
        net: 'WIFI_BACKUP_4G',
      });

    expect(batch1.status).toBe(200);
    expect(batch1.body.acceptedCount).toBe(10);
    expect(batch1.body.duplicateCount).toBe(0);

    // Step 3: Re-send overlapping batch (seq 14..18) after simulated network drop -> 14,15 DUPLICATE; 16,17,18 ACCEPTED
    const overlapBatch = await request(app)
      .post('/api/iot/readings/batch')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        b: buffered.queue.slice(8, 13), // seq 14..18
        q: 0,
        ov: buffered.droppedOverflowCount,
        net: 'WIFI_PRIMARY',
      });

    expect(overlapBatch.status).toBe(200);
    expect(overlapBatch.body.duplicateCount).toBe(2);
    expect(overlapBatch.body.acceptedCount).toBe(3);

    // Step 4: Single compact reading with stale sequence (seq 18) is rejected as 409 DUPLICATE_SEQUENCE
    const staleSingle = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 18,
        cm: 50,
        r: -64,
        t: new Date().toISOString(),
      });
    expect(staleSingle.status).toBe(409);
    expect(staleSingle.body.error).toBe('DUPLICATE_SEQUENCE');

    const device = await getDocument<Device>('devices', 'BIN-ESP32-001');
    expect(device?.lastSequenceNumber).toBe(18);
    expect(device?.overflowDroppedCount).toBe(5);
    expect(device?.lastPowerResetReason).toBe('BROWNOUT_POWER_DROP');
    expect(device?.networkType).toBe('WIFI_PRIMARY');
  });

  it('recovers persisted readings, sequence numbers, and bin state across simulated power restart', async () => {
    const rot = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    const deviceToken = rot.body.provisionedToken as string;

    const sendRes = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 42,
        cm: 22.5, // (90 - 22.5) / 75 = 90%
        r: -61,
        t: new Date().toISOString(),
      });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.fillPercentage).toBe(90);

    // Wipe in-memory cache and reload strictly from disk to simulate power restart
    simulateRestartReloadForTest(tempPersistDir);
    await initDataStore();

    const recoveredDevice = await getDocument<Device>('devices', 'BIN-ESP32-001');
    expect(recoveredDevice?.lastSequenceNumber).toBe(42);

    const readings = await listCollection<SensorReading>('sensorReadings');
    expect(readings.some((r) => r.sequenceNumber === 42 && r.fillPercentage === 90)).toBe(true);

    // Duplicate check still prevents replay of seq=42 after restart!
    const replayAfterRestart = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 42,
        cm: 22.5,
        r: -61,
        t: new Date().toISOString(),
      });
    expect(replayAfterRestart.status).toBe(409);
  });

  it('refuses ephemeral /tmp persistence in production mode when Firestore Admin is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    simulateRestartReloadForTest('/tmp/hadiqtna-ephemeral-blocked');
    const status = await initDataStore();

    expect(status.firestoreAdminConnected).toBe(false);
    expect(status.persistenceMode).toBe('MISCONFIGURED_NO_PERSISTENT_DB');
    expect(status.productionPersistenceReady).toBe(false);

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(false);
    expect(health.body.productionPersistenceReady).toBe(false);
    expect(health.body.persistenceMode).toBe('MISCONFIGURED_NO_PERSISTENT_DB');
  });

  it('marks stale online devices OFFLINE without spamming duplicate alerts and resolves on reconnect', async () => {
    const rot = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    const deviceToken = rot.body.provisionedToken as string;

    // 1. Device sends initial reading -> ONLINE
    await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 1,
        cm: 60,
        r: -65,
        t: new Date().toISOString(),
      });

    // 2. Backdate lastSeenAt to 45 minutes ago (well beyond 900s timeout)
    const oldTs = new Date(Date.now() - 45 * 60_000).toISOString();
    await updateDocument<Device & Record<string, unknown>>('devices', 'BIN-ESP32-001', {
      lastSeenAt: oldTs,
    });

    const markedCount1 = await evaluateOfflineDevices();
    expect(markedCount1).toBe(1);

    const devOffline = await getDocument<Device>('devices', 'BIN-ESP32-001');
    expect(devOffline?.connectionStatus).toBe('OFFLINE');

    // Second sweep must not duplicate alert
    const markedCount2 = await evaluateOfflineDevices();
    expect(markedCount2).toBe(0);

    const alertsAfterOffline = await listCollection<AlertItem>('alerts');
    const offlineAlerts = alertsAfterOffline.filter((a) => a.type === 'DEVICE_OFFLINE');
    expect(offlineAlerts).toHaveLength(1);
    expect(offlineAlerts[0].status).toBe('ACTIVE');

    // 3. Reconnect resolves DEVICE_OFFLINE alert cleanly
    const reconnect = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 2,
        cm: 58,
        r: -63,
        t: new Date().toISOString(),
      });
    expect(reconnect.status).toBe(201);

    const devBackOnline = await getDocument<Device>('devices', 'BIN-ESP32-001');
    expect(devBackOnline?.connectionStatus).toBe('ONLINE');

    const alertsAfterReconnect = await listCollection<AlertItem>('alerts');
    expect(alertsAfterReconnect.find((a) => a.type === 'DEVICE_OFFLINE')?.status).toBe('RESOLVED');
  });

  it('queues local-server readings into syncOutbox during outage and pushes authenticated batches on reconnect', async () => {
    process.env.LOCAL_SERVER_MODE = 'true';
    process.env.CENTRAL_SYNC_URL = 'https://central.hadiqtna.test';
    process.env.SYNC_SHARED_SECRET = 'syria_super_secret_sync_key_12345';

    const rot = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    const deviceToken = rot.body.provisionedToken as string;

    // 1. Ingest on local server -> enqueued in syncOutbox
    const res1 = await request(app)
      .post('/api/iot/readings')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        d: 'BIN-ESP32-001',
        s: 100,
        cm: 45,
        r: -66,
        t: new Date().toISOString(),
      });
    expect(res1.status).toBe(201);

    const statusBefore = await getSyncStatus();
    expect(statusBefore.pendingCount).toBe(1);

    // 2. Failed network sync leaves item PENDING
    const failedFlush = await flushSyncOutbox(undefined, async () => {
      throw new Error('ECONNREFUSED external internet offline');
    });
    expect(failedFlush.failed).toBe(1);
    expect(failedFlush.synced).toBe(0);
    expect((await getSyncStatus()).pendingCount).toBe(1);

    // 3. Central /api/iot/sync/ingest rejects invalid x-sync-secret
    const unauthSync = await request(app)
      .post('/api/iot/sync/ingest')
      .set('x-sync-secret', 'wrong_secret_value')
      .send({
        deviceId: 'BIN-ESP32-001',
        readings: [{ sequenceNumber: 100, distanceCm: 45, signalStrength: -66, measuredAt: new Date().toISOString() }],
      });
    expect(unauthSync.status).toBe(401);

    // 4. Successful flush marks outbox item SYNCED
    const okFlush = await flushSyncOutbox(
      { uid: 'admin-uid-1', email: 'mralmnjd363@gmail.com' },
      async (_url, payload, secret) => {
        expect(secret).toBe('syria_super_secret_sync_key_12345');
        return {
          ok: true,
          status: 200,
          results: payload.readings.map((r) => ({ sequenceNumber: r.sequenceNumber, status: 'ACCEPTED' })),
        };
      }
    );
    expect(okFlush.synced).toBe(1);
    expect(okFlush.failed).toBe(0);

    const outbox = await listCollection<SyncOutboxItem>('syncOutbox');
    expect(outbox[0].syncStatus).toBe('SYNCED');
  });

  it('supports safe scrypt/HMAC local staff login alternative without +963 SMS Phone Auth', async () => {
    process.env.LOCAL_STAFF_AUTH_ENABLED = 'true';
    process.env.LOCAL_AUTH_SECRET = 'syria_local_hmac_signing_secret_987654';

    // 1. Check /api/auth/methods explicitly reports +963 phone auth disabled and local auth enabled
    const methodsRes = await request(app).get('/api/auth/methods');
    expect(methodsRes.status).toBe(200);
    expect(methodsRes.body.phoneAuth963Supported).toBe(false);
    expect(methodsRes.body.localStaffAuthEnabled).toBe(true);

    // 2. Register worker via initial /api/auth/me then activate role=WORKER via admin
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer worker-token');
    await request(app)
      .patch('/api/users/worker-uid-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ role: 'WORKER', isActive: true });

    // 3. Admin sets local fallback password for worker
    const setCredRes = await request(app)
      .post('/api/users/worker-uid-1/local-credentials')
      .set('Authorization', 'Bearer admin-token')
      .send({ password: 'FieldWorker2026!' });
    expect(setCredRes.status).toBe(200);

    // 4. Wrong password is rejected
    const badLogin = await request(app)
      .post('/api/auth/local-login')
      .send({ email: 'worker@syria-park.example', password: 'WrongPassword123' });
    expect(badLogin.status).toBe(401);

    // 5. Valid credentials return signed local session token accepted by RBAC routes
    const okLogin = await request(app)
      .post('/api/auth/local-login')
      .send({ email: 'worker@syria-park.example', password: 'FieldWorker2026!' });
    expect(okLogin.status).toBe(200);
    const localToken = okLogin.body.token as string;
    expect(localToken.startsWith('hq_local_')).toBe(true);

    const binsRes = await request(app)
      .get('/api/iot/bins')
      .set('Authorization', `Bearer ${localToken}`);
    expect(binsRes.status).toBe(200);

    // Worker still cannot access admin-only diagnostics route
    const adminOnlyRes = await request(app)
      .get('/api/diagnostics/deployment')
      .set('Authorization', `Bearer ${localToken}`);
    expect(adminOnlyRes.status).toBe(403);
  });
});
