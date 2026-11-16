import { Router } from 'express';
import { requireAuth, requireDeviceAuth, requireRole, requireSyncSecret } from '../middleware/auth.ts';
import { iotIngestionLimiter } from '../middleware/rateLimit.ts';
import {
  getDocument,
  getSystemConfig,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
  type DeviceCredentialRecord,
} from '../repositories/dataStore.ts';
import {
  ingestHardwareReading,
  ingestHardwareReadingBatch,
  recordManualBinEmpty,
  ServiceError,
  simulateDemoDeviceStatus,
  simulateDemoReading,
} from '../services/iotService.ts';
import { flushSyncOutbox, getSyncStatus } from '../services/syncService.ts';
import { createId, generateDeviceToken } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';
import {
  createBinSchema,
  demoDeviceStatusSchema,
  demoSimulateSchema,
  iotBatchReadingSchema,
  iotReadingSchema,
  registerDeviceSchema,
  updateBinSchema,
  updateDeviceSchema,
} from '../validators/schemas.ts';
import type { AlertItem, Bin, Device, Park, SensorReading } from '../../src/types/domain.ts';

export const iotRouter = Router();

// ESP32 Hardware ingestion endpoint (accepts both standard and compact low-bandwidth JSON)
iotRouter.post(
  '/readings',
  iotIngestionLimiter,
  requireDeviceAuth,
  async (req, res, next) => {
    try {
      const parsed = iotReadingSchema.parse(req.body);
      const result = await ingestHardwareReading(req.authenticatedDeviceId!, parsed);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Batch ESP32 ingestion for reconnecting after offline outages (single HTTPS round-trip)
iotRouter.post(
  '/readings/batch',
  iotIngestionLimiter,
  requireDeviceAuth,
  async (req, res, next) => {
    try {
      const parsed = iotBatchReadingSchema.parse(req.body);
      const result = await ingestHardwareReadingBatch(req.authenticatedDeviceId!, parsed);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Authenticated central server sync receiver from a park/municipality local server
iotRouter.post(
  '/sync/ingest',
  iotIngestionLimiter,
  requireSyncSecret,
  async (req, res, next) => {
    try {
      const parsed = iotBatchReadingSchema.parse(req.body);
      const result = await ingestHardwareReadingBatch(parsed.deviceId, parsed, {
        skipSyncOutbox: true,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.get(
  '/sync/status',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (_req, res, next) => {
    try {
      const status = await getSyncStatus();
      res.json({ success: true, sync: status });
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post(
  '/sync/flush',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const outcome = await flushSyncOutbox(req.user!);
      res.json({ success: true, outcome });
    } catch (err) {
      next(err);
    }
  }
);

// Staff device endpoints
iotRouter.get('/devices', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'), async (_req, res, next) => {
  try {
    const [devices, creds] = await Promise.all([
      listCollection<Device>('devices'),
      listCollection<DeviceCredentialRecord>('deviceCredentials'),
    ]);
    const credMap = new Map(creds.map((c) => [c.deviceId, c]));
    const safeDevices = devices.map((d) => {
      const cred = credMap.get(d.id);
      return {
        ...d,
        hasCredential: Boolean(cred && !cred.isRevoked),
        tokenPrefix: cred?.tokenPrefix ?? null,
        tokenRotatedAt: cred?.rotatedAt ?? null,
        isTokenRevoked: cred?.isRevoked ?? false,
      };
    });
    res.json({ success: true, devices: safeDevices });
  } catch (err) {
    next(err);
  }
});

iotRouter.get(
  '/devices/:deviceId',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const device = await getDocument<Device>('devices', req.params.deviceId);
      if (!device) {
        throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود.');
      }
      const cred = await getDocument<DeviceCredentialRecord>('deviceCredentials', device.id);
      res.json({
        success: true,
        device: {
          ...device,
          hasCredential: Boolean(cred && !cred.isRevoked),
          tokenPrefix: cred?.tokenPrefix ?? null,
          tokenRotatedAt: cred?.rotatedAt ?? null,
          isTokenRevoked: cred?.isRevoked ?? false,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post('/devices', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = registerDeviceSchema.parse(req.body);
    const id = data.id || createId('ESP32');
    const existing = await getDocument<Device>('devices', id);
    if (existing) {
      throw new ServiceError(409, 'DEVICE_EXISTS', 'معرف الجهاز مسجل مسبقاً.');
    }

    const park = await getDocument<Park>('parks', data.parkId);
    if (!park) throw new ServiceError(404, 'PARK_NOT_FOUND', 'الحديقة غير موجودة.');
    const bin = await getDocument<Bin>('bins', data.binId);
    if (!bin) throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');

    const now = new Date().toISOString();
    const device: Device = {
      id,
      name: data.name,
      deviceType: data.deviceType,
      sensorModel: data.sensorModel,
      binId: data.binId,
      parkId: data.parkId,
      connectionStatus: 'NEVER_CONNECTED',
      firmwareVersion: data.firmwareVersion,
      reportingIntervalSeconds: data.reportingIntervalSeconds,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const { rawToken, tokenHash, tokenPrefix } = generateDeviceToken();
    const cred: DeviceCredentialRecord = {
      deviceId: id,
      tokenHash,
      tokenPrefix,
      isRevoked: false,
      rotatedAt: now,
    };

    await setDocument('devices', id, device as unknown as Record<string, unknown>);
    await setDocument('deviceCredentials', id, cred as unknown as Record<string, unknown>);
    await updateDocument<Bin & Record<string, unknown>>('bins', bin.id, {
      deviceId: id,
      updatedAt: now,
    });

    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'DEVICE_REGISTERED',
      targetCollection: 'devices',
      targetId: id,
      summary: `تسجيل جهاز IoT جديد (${id}) وربطه بالحاوية (${bin.name})`,
    });

    broadcastSseEvent('device:updated', device, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);

    // Return plaintext token ONLY once upon initial provisioning
    res.status(201).json({
      success: true,
      device,
      provisionedToken: rawToken,
      tokenPrefix,
      warning: 'احفظ رمز الجهاز الآن؛ لن يُعرض مرة أخرى.',
    });
  } catch (err) {
    next(err);
  }
});

iotRouter.patch('/devices/:deviceId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const patch = updateDeviceSchema.parse(req.body);
    const existing = await getDocument<Device>('devices', req.params.deviceId);
    if (!existing) throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود.');

    if (patch.binId) {
      const bin = await getDocument<Bin>('bins', patch.binId);
      if (!bin) throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');
    }

    const now = new Date().toISOString();
    const updated = await updateDocument<Device & Record<string, unknown>>('devices', existing.id, {
      ...patch,
      updatedAt: now,
    });

    if (patch.binId && updated) {
      await updateDocument<Bin & Record<string, unknown>>('bins', patch.binId, {
        deviceId: updated.id,
        updatedAt: now,
      });
    }

    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'DEVICE_UPDATED',
      targetCollection: 'devices',
      targetId: existing.id,
      summary: `تحديث إعدادات الجهاز (${existing.id})`,
    });

    if (updated) broadcastSseEvent('device:updated', updated, ['ADMIN', 'SUPERVISOR']);
    res.json({ success: true, device: updated });
  } catch (err) {
    next(err);
  }
});

iotRouter.post('/devices/:deviceId/revoke', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const device = await getDocument<Device>('devices', req.params.deviceId);
    if (!device) throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود.');

    const now = new Date().toISOString();
    const cred = await getDocument<DeviceCredentialRecord>('deviceCredentials', device.id);
    if (cred) {
      await updateDocument<DeviceCredentialRecord & Record<string, unknown>>('deviceCredentials', device.id, {
        isRevoked: true,
        revokedAt: now,
      });
    }
    const updated = await updateDocument<Device & Record<string, unknown>>('devices', device.id, {
      isActive: false,
      updatedAt: now,
    });

    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'DEVICE_TOKEN_REVOKED',
      targetCollection: 'deviceCredentials',
      targetId: device.id,
      summary: `إلغاء صلاحية ورمز المصادقة للجهاز (${device.id})`,
    });

    if (updated) broadcastSseEvent('device:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
    res.json({ success: true, message: 'تم إلغاء اعتماد الجهاز بنجاح.', device: updated });
  } catch (err) {
    next(err);
  }
});

iotRouter.post(
  '/devices/:deviceId/rotate-token',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const device = await getDocument<Device>('devices', req.params.deviceId);
      if (!device) throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود.');

      const now = new Date().toISOString();
      const { rawToken, tokenHash, tokenPrefix } = generateDeviceToken();
      const cred: DeviceCredentialRecord = {
        deviceId: device.id,
        tokenHash,
        tokenPrefix,
        isRevoked: false,
        rotatedAt: now,
      };

      await setDocument('deviceCredentials', device.id, cred as unknown as Record<string, unknown>);
      const updated = await updateDocument<Device & Record<string, unknown>>('devices', device.id, {
        isActive: true,
        updatedAt: now,
      });

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'DEVICE_TOKEN_ROTATED',
        targetCollection: 'deviceCredentials',
        targetId: device.id,
        summary: `تدوير وإصدار رمز مصادقة جديد للجهاز (${device.id})`,
      });

      if (updated) broadcastSseEvent('device:updated', updated, ['ADMIN', 'SUPERVISOR']);
      res.json({
        success: true,
        deviceId: device.id,
        provisionedToken: rawToken,
        tokenPrefix,
        rotatedAt: now,
        warning: 'احفظ الرمز الجديد الآن؛ لن يُعرض مرة أخرى بعد إغلاق هذه النافذة.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// Bins endpoints
iotRouter.get('/bins', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'), async (_req, res, next) => {
  try {
    const bins = await listCollection<Bin>('bins');
    res.json({ success: true, bins });
  } catch (err) {
    next(err);
  }
});

iotRouter.get(
  '/bins/:binId',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const bin = await getDocument<Bin>('bins', req.params.binId);
      if (!bin) throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');
      res.json({ success: true, bin });
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post('/bins', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = createBinSchema.parse(req.body);
    if (data.emptyDistanceCm <= data.fullDistanceCm) {
      throw new ServiceError(400, 'INVALID_CALIBRATION', 'مسافة الفراغ يجب أن تكون أكبر من مسافة الامتلاء.');
    }
    const park = await getDocument<Park>('parks', data.parkId);
    if (!park) throw new ServiceError(404, 'PARK_NOT_FOUND', 'الحديقة غير موجودة.');

    const id = data.id || createId('bin');
    const now = new Date().toISOString();
    const bin: Bin = {
      id,
      parkId: data.parkId,
      name: data.name,
      binType: data.binType,
      capacityLiters: data.capacityLiters,
      status: 'NORMAL',
      currentFillPercentage: 0,
      emptyDistanceCm: data.emptyDistanceCm,
      fullDistanceCm: data.fullDistanceCm,
      locationDescription: data.locationDescription,
      createdAt: now,
      updatedAt: now,
    };

    await setDocument('bins', id, bin as unknown as Record<string, unknown>);
    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'BIN_CREATED',
      targetCollection: 'bins',
      targetId: id,
      summary: `إضافة حاوية ذكية جديدة (${bin.name})`,
    });
    broadcastSseEvent('bin:updated', bin, ['ADMIN', 'SUPERVISOR', 'WORKER']);
    res.status(201).json({ success: true, bin });
  } catch (err) {
    next(err);
  }
});

iotRouter.patch('/bins/:binId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const patch = updateBinSchema.parse(req.body);
    const existing = await getDocument<Bin>('bins', req.params.binId);
    if (!existing) throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');

    const nextEmpty = patch.emptyDistanceCm ?? existing.emptyDistanceCm;
    const nextFull = patch.fullDistanceCm ?? existing.fullDistanceCm;
    if (nextEmpty <= nextFull) {
      throw new ServiceError(400, 'INVALID_CALIBRATION', 'مسافة الفراغ يجب أن تكون أكبر من مسافة الامتلاء.');
    }

    const updated = await updateDocument<Bin & Record<string, unknown>>('bins', existing.id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'BIN_UPDATED',
      targetCollection: 'bins',
      targetId: existing.id,
      summary: `تعديل معايرة أو بيانات الحاوية (${existing.name})`,
    });
    if (updated) broadcastSseEvent('bin:updated', updated, ['ADMIN', 'SUPERVISOR', 'WORKER']);
    res.json({ success: true, bin: updated });
  } catch (err) {
    next(err);
  }
});

iotRouter.get(
  '/bins/:binId/readings',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const bin = await getDocument<Bin>('bins', req.params.binId);
      if (!bin) throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');

      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const sourceFilter =
        req.query.source === 'HARDWARE' || req.query.source === 'DEMO' ? req.query.source : null;

      const all = await listCollection<SensorReading>('sensorReadings');
      const filtered = all
        .filter((r) => r.binId === bin.id && (!sourceFilter || r.source === sourceFilter))
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
        .slice(0, limit);

      res.json({ success: true, readings: filtered });
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post(
  '/bins/:binId/empty',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const bin = await recordManualBinEmpty(req.params.binId, req.user!);
      res.json({ success: true, bin });
    } catch (err) {
      next(err);
    }
  }
);

// Alerts endpoints
iotRouter.get('/alerts', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'), async (req, res, next) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const all = await listCollection<AlertItem>('alerts');
    const alerts = all
      .filter((a) => !statusFilter || a.status === statusFilter)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});

iotRouter.post(
  '/alerts/:alertId/acknowledge',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const alert = await getDocument<AlertItem>('alerts', req.params.alertId);
      if (!alert) throw new ServiceError(404, 'ALERT_NOT_FOUND', 'التنبيه غير موجود.');
      if (alert.status === 'RESOLVED') {
        throw new ServiceError(400, 'ALERT_ALREADY_RESOLVED', 'لا يمكن الإقرار بتنبيه محلول مسبقاً.');
      }
      const now = new Date().toISOString();
      const updated = await updateDocument<AlertItem & Record<string, unknown>>('alerts', alert.id, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: now,
        acknowledgedBy: req.user!.fullName || req.user!.email,
      });
      if (updated) broadcastSseEvent('alert:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
      res.json({ success: true, alert: updated });
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post(
  '/alerts/:alertId/resolve',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const alert = await getDocument<AlertItem>('alerts', req.params.alertId);
      if (!alert) throw new ServiceError(404, 'ALERT_NOT_FOUND', 'التنبيه غير موجود.');
      const now = new Date().toISOString();
      const updated = await updateDocument<AlertItem & Record<string, unknown>>('alerts', alert.id, {
        status: 'RESOLVED',
        acknowledgedAt: alert.acknowledgedAt ?? now,
        acknowledgedBy: alert.acknowledgedBy ?? (req.user!.fullName || req.user!.email),
        resolvedAt: now,
      });
      if (updated) broadcastSseEvent('alert:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
      res.json({ success: true, alert: updated });
    } catch (err) {
      next(err);
    }
  }
);

// Demo simulation endpoints (explicitly restricted to DEMO mode)
iotRouter.post(
  '/demo/simulate',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const parsed = demoSimulateSchema.parse(req.body);
      const outcome = await simulateDemoReading(
        parsed.binId,
        parsed.fillPercentage,
        parsed.signalStrength,
        req.user!
      );
      res.status(201).json(outcome);
    } catch (err) {
      next(err);
    }
  }
);

iotRouter.post(
  '/demo/device-status',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const parsed = demoDeviceStatusSchema.parse(req.body);
      const device = await simulateDemoDeviceStatus(
        parsed.deviceId,
        parsed.connectionStatus,
        req.user!
      );
      res.json({ success: true, device });
    } catch (err) {
      next(err);
    }
  }
);

// Recent readings overview (filtered by active mode if requested)
iotRouter.get('/readings', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'), async (req, res, next) => {
  try {
    const config = await getSystemConfig();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const source =
      req.query.source === 'ALL'
        ? null
        : req.query.source === 'HARDWARE' || req.query.source === 'DEMO'
          ? req.query.source
          : config.operatingMode;

    const all = await listCollection<SensorReading>('sensorReadings');
    const readings = all
      .filter((r) => !source || r.source === source)
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
      .slice(0, limit);

    res.json({ success: true, readings, activeMode: config.operatingMode });
  } catch (err) {
    next(err);
  }
});
