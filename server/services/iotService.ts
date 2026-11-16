import {
  calculateDistanceFromFill,
  calculateFillPercentage,
  classifyBinStatus,
  validateDistanceReading,
} from '../../src/utils/calibration.ts';
import type {
  AlertItem,
  Bin,
  Device,
  SensorReading,
} from '../../src/types/domain.ts';
import {
  getDocument,
  getSystemConfig,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { createId } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';
import { evaluateBinAlerts, resolveDeviceOfflineAlerts } from './alertEngine.ts';

import { enqueueSyncReading } from './syncService.ts';

export class ServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface HardwareReadingPayload {
  deviceId: string;
  sequenceNumber: number;
  distanceCm: number;
  signalStrength: number;
  measuredAt: string;
  queuedReadingsCount?: number;
  overflowDroppedCount?: number;
  lastPowerResetReason?: string;
  networkType?: string;
}

export interface BatchReadingItem {
  sequenceNumber: number;
  distanceCm: number;
  signalStrength: number;
  measuredAt: string;
}

export async function ingestHardwareReading(
  authenticatedDeviceId: string,
  payload: HardwareReadingPayload,
  options: { skipSyncOutbox?: boolean } = {}
) {
  if (payload.deviceId !== authenticatedDeviceId) {
    throw new ServiceError(403, 'DEVICE_ID_MISMATCH', 'معرف الجهاز في الحمولة لا يطابق رمز المصادقة.');
  }

  const device = await getDocument<Device>('devices', authenticatedDeviceId);
  if (!device) {
    throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير مسجل.');
  }
  if (!device.isActive) {
    throw new ServiceError(403, 'DEVICE_INACTIVE', 'الجهاز معطّل حالياً.');
  }

  // Replay / duplicate sequence protection
  if (
    typeof device.lastSequenceNumber === 'number' &&
    payload.sequenceNumber <= device.lastSequenceNumber
  ) {
    throw new ServiceError(
      409,
      'DUPLICATE_SEQUENCE',
      `رقم التسلسل (${payload.sequenceNumber}) مكرر أو قديم. آخر تسلسل مسجل: ${device.lastSequenceNumber}`
    );
  }

  const bin = await getDocument<Bin>('bins', device.binId);
  if (!bin) {
    throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية المرتبطة غير موجودة.');
  }

  const config = await getSystemConfig();
  const validation = validateDistanceReading(payload.distanceCm, {
    emptyDistanceCm: bin.emptyDistanceCm,
    fullDistanceCm: bin.fullDistanceCm,
    maxSensorRangeCm: 450,
  });

  const receivedAt = new Date().toISOString();

  if (!validation.valid) {
    // Store invalid reading telemetry and raise/record diagnostic error without corrupting bin level
    const invalidReading: SensorReading = {
      id: createId('rd'),
      deviceId: device.id,
      binId: bin.id,
      distanceCm: payload.distanceCm,
      fillPercentage: bin.currentFillPercentage,
      signalStrength: payload.signalStrength,
      sequenceNumber: payload.sequenceNumber,
      measuredAt: payload.measuredAt,
      receivedAt,
      source: 'HARDWARE',
      qualityStatus: validation.reason === 'OUT_OF_SENSOR_RANGE' ? 'OUT_OF_RANGE' : 'INVALID',
    };
    await setDocument('sensorReadings', invalidReading.id, invalidReading as unknown as Record<string, unknown>);
    throw new ServiceError(422, 'INVALID_DISTANCE_READING', `قراءة المسافة غير صالحة فيزيائياً: ${validation.reason}`);
  }

  const fillPercentage = calculateFillPercentage(
    payload.distanceCm,
    bin.emptyDistanceCm,
    bin.fullDistanceCm
  );

  const newStatus = classifyBinStatus(
    fillPercentage,
    config.warningThresholdPercent,
    config.criticalThresholdPercent
  );

  const reading: SensorReading = {
    id: createId('rd'),
    deviceId: device.id,
    binId: bin.id,
    distanceCm: Math.round(payload.distanceCm * 10) / 10,
    fillPercentage,
    signalStrength: payload.signalStrength,
    sequenceNumber: payload.sequenceNumber,
    measuredAt: payload.measuredAt,
    receivedAt,
    source: 'HARDWARE',
    qualityStatus: 'VALID',
  };

  await setDocument('sensorReadings', reading.id, reading as unknown as Record<string, unknown>);

  if (!options.skipSyncOutbox) {
    await enqueueSyncReading({
      deviceId: device.id,
      sequenceNumber: payload.sequenceNumber,
      distanceCm: reading.distanceCm,
      signalStrength: payload.signalStrength,
      measuredAt: payload.measuredAt,
    });
  }

  const updatedBin = await updateDocument<Bin & Record<string, unknown>>('bins', bin.id, {
    currentFillPercentage: fillPercentage,
    lastDistanceCm: reading.distanceCm,
    status: newStatus,
    lastReadingAt: receivedAt,
    lastReadingSource: 'HARDWARE',
    updatedAt: receivedAt,
  });

  const devicePatch: Partial<Device> & Record<string, unknown> = {
    connectionStatus: 'ONLINE',
    lastSeenAt: receivedAt,
    lastSignalStrength: payload.signalStrength,
    lastSequenceNumber: payload.sequenceNumber,
    updatedAt: receivedAt,
  };
  if (payload.queuedReadingsCount !== undefined) devicePatch.queuedReadingsCount = payload.queuedReadingsCount;
  if (payload.overflowDroppedCount !== undefined) devicePatch.overflowDroppedCount = payload.overflowDroppedCount;
  if (payload.lastPowerResetReason !== undefined) devicePatch.lastPowerResetReason = payload.lastPowerResetReason;
  if (payload.networkType !== undefined) devicePatch.networkType = payload.networkType;

  const updatedDevice = await updateDocument<Device & Record<string, unknown>>('devices', device.id, devicePatch);

  await resolveDeviceOfflineAlerts(device.id);
  const alertOutcome = await evaluateBinAlerts(updatedBin ?? bin, device.id, fillPercentage, 'HARDWARE', config);

  broadcastSseEvent('reading:created', reading, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
  if (updatedBin) broadcastSseEvent('bin:updated', updatedBin, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);
  if (updatedDevice) broadcastSseEvent('device:updated', updatedDevice, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);

  return {
    success: true,
    deviceId: device.id,
    binId: bin.id,
    fillPercentage,
    alertTriggered: alertOutcome.alertTriggered,
    receivedAt,
  };
}

export async function ingestHardwareReadingBatch(
  authenticatedDeviceId: string,
  batch: {
    deviceId: string;
    readings: BatchReadingItem[];
    queuedReadingsCount?: number;
    overflowDroppedCount?: number;
    lastPowerResetReason?: string;
    networkType?: string;
  },
  options: { skipSyncOutbox?: boolean } = {}
) {
  if (batch.deviceId !== authenticatedDeviceId) {
    throw new ServiceError(403, 'DEVICE_ID_MISMATCH', 'معرف الجهاز في الحمولة لا يطابق رمز المصادقة.');
  }

  const ordered = [...batch.readings].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const results: Array<{
    sequenceNumber: number;
    status: 'ACCEPTED' | 'DUPLICATE' | 'INVALID';
    fillPercentage?: number;
  }> = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i];
    const isLast = i === ordered.length - 1;
    try {
      const outcome = await ingestHardwareReading(
        authenticatedDeviceId,
        {
          deviceId: batch.deviceId,
          sequenceNumber: item.sequenceNumber,
          distanceCm: item.distanceCm,
          signalStrength: item.signalStrength,
          measuredAt: item.measuredAt,
          ...(isLast
            ? {
                queuedReadingsCount: batch.queuedReadingsCount,
                overflowDroppedCount: batch.overflowDroppedCount,
                lastPowerResetReason: batch.lastPowerResetReason,
                networkType: batch.networkType,
              }
            : {}),
        },
        options
      );
      results.push({
        sequenceNumber: item.sequenceNumber,
        status: 'ACCEPTED',
        fillPercentage: outcome.fillPercentage,
      });
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'DUPLICATE_SEQUENCE') {
        results.push({ sequenceNumber: item.sequenceNumber, status: 'DUPLICATE' });
      } else if (err instanceof ServiceError && err.code === 'INVALID_DISTANCE_READING') {
        results.push({ sequenceNumber: item.sequenceNumber, status: 'INVALID' });
      } else {
        throw err;
      }
    }
  }

  return {
    success: true,
    deviceId: batch.deviceId,
    acceptedCount: results.filter((r) => r.status === 'ACCEPTED').length,
    duplicateCount: results.filter((r) => r.status === 'DUPLICATE').length,
    invalidCount: results.filter((r) => r.status === 'INVALID').length,
    results,
  };
}

export async function simulateDemoReading(
  binId: string,
  fillPercentage: number,
  signalStrength: number,
  actor: { uid: string; email?: string }
) {
  const config = await getSystemConfig();
  if (config.operatingMode !== 'DEMO') {
    throw new ServiceError(
      400,
      'DEMO_MODE_DISABLED',
      'المحاكاة متاحة فقط عندما يكون النظام في وضع المحاكاة (DEMO).'
    );
  }

  const bin = await getDocument<Bin>('bins', binId);
  if (!bin) {
    throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');
  }

  const deviceId = bin.deviceId || 'BIN-ESP32-001';
  const device = await getDocument<Device>('devices', deviceId);
  const distanceCm = calculateDistanceFromFill(fillPercentage, bin.emptyDistanceCm, bin.fullDistanceCm);
  const now = new Date().toISOString();
  const nextSeq = (device?.lastSequenceNumber ?? 0) + 1;

  const reading: SensorReading = {
    id: createId('rd'),
    deviceId,
    binId: bin.id,
    distanceCm,
    fillPercentage: Math.round(fillPercentage),
    signalStrength,
    sequenceNumber: nextSeq,
    measuredAt: now,
    receivedAt: now,
    source: 'DEMO',
    qualityStatus: 'VALID',
  };

  await setDocument('sensorReadings', reading.id, reading as unknown as Record<string, unknown>);

  const newStatus = classifyBinStatus(
    reading.fillPercentage,
    config.warningThresholdPercent,
    config.criticalThresholdPercent
  );

  const updatedBin = await updateDocument<Bin & Record<string, unknown>>('bins', bin.id, {
    currentFillPercentage: reading.fillPercentage,
    lastDistanceCm: distanceCm,
    status: newStatus,
    lastReadingAt: now,
    lastReadingSource: 'DEMO',
    updatedAt: now,
  });

  if (device) {
    const updatedDevice = await updateDocument<Device & Record<string, unknown>>('devices', device.id, {
      connectionStatus: 'ONLINE',
      lastSeenAt: now,
      lastSignalStrength: signalStrength,
      lastSequenceNumber: nextSeq,
      updatedAt: now,
    });
    if (updatedDevice) {
      broadcastSseEvent('device:updated', updatedDevice, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
    }
  }

  await resolveDeviceOfflineAlerts(deviceId);
  const alertOutcome = await evaluateBinAlerts(
    updatedBin ?? bin,
    deviceId,
    reading.fillPercentage,
    'DEMO',
    config
  );

  await recordAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'DEMO_SIMULATE_READING',
    targetCollection: 'bins',
    targetId: bin.id,
    summary: `محاكاة قراءة تجريبية بنسبة امتلاء ${reading.fillPercentage}%`,
  });

  broadcastSseEvent('reading:created', reading, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
  if (updatedBin) broadcastSseEvent('bin:updated', updatedBin, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);

  return {
    success: true,
    reading,
    bin: updatedBin,
    alertTriggered: alertOutcome.alertTriggered,
  };
}

export async function simulateDemoDeviceStatus(
  deviceId: string,
  connectionStatus: 'ONLINE' | 'OFFLINE',
  actor: { uid: string; email?: string }
) {
  const config = await getSystemConfig();
  if (config.operatingMode !== 'DEMO') {
    throw new ServiceError(400, 'DEMO_MODE_DISABLED', 'تغيير حالة الاتصال التجريبي متاح في وضع DEMO فقط.');
  }
  const device = await getDocument<Device>('devices', deviceId);
  if (!device) {
    throw new ServiceError(404, 'DEVICE_NOT_FOUND', 'الجهاز غير موجود.');
  }

  const now = new Date().toISOString();
  const updatedDevice = await updateDocument<Device & Record<string, unknown>>('devices', deviceId, {
    connectionStatus,
    lastSeenAt: connectionStatus === 'ONLINE' ? now : device.lastSeenAt,
    updatedAt: now,
  });

  if (connectionStatus === 'OFFLINE') {
    const allAlerts = await listCollection<AlertItem>('alerts');
    const existing = allAlerts.find(
      (a) => a.deviceId === deviceId && a.type === 'DEVICE_OFFLINE' && a.status !== 'RESOLVED'
    );
    if (!existing) {
      const alert: AlertItem = {
        id: createId('alt'),
        binId: device.binId,
        deviceId,
        type: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        message: `[DEMO] محاكاة انقطاع اتصال الجهاز (${deviceId}).`,
        status: 'ACTIVE',
        source: 'DEMO',
        createdAt: now,
      };
      await setDocument('alerts', alert.id, alert as unknown as Record<string, unknown>);
      broadcastSseEvent('alert:created', alert, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
    }
  } else {
    await resolveDeviceOfflineAlerts(deviceId);
  }

  await recordAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'DEMO_DEVICE_STATUS',
    targetCollection: 'devices',
    targetId: deviceId,
    summary: `محاكاة حالة اتصال الجهاز: ${connectionStatus}`,
  });

  if (updatedDevice) broadcastSseEvent('device:updated', updatedDevice, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
  return updatedDevice;
}

export async function recordManualBinEmpty(
  binId: string,
  actor: { uid: string; email?: string }
) {
  const bin = await getDocument<Bin>('bins', binId);
  if (!bin) {
    throw new ServiceError(404, 'BIN_NOT_FOUND', 'الحاوية غير موجودة.');
  }
  const now = new Date().toISOString();
  const updatedBin = await updateDocument<Bin & Record<string, unknown>>('bins', binId, {
    currentFillPercentage: 0,
    lastDistanceCm: bin.emptyDistanceCm,
    status: 'NORMAL',
    updatedAt: now,
  });

  const config = await getSystemConfig();
  await evaluateBinAlerts(updatedBin ?? bin, bin.deviceId ?? 'MANUAL', 0, config.operatingMode, config);

  await recordAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'BIN_EMPTIED_MANUAL',
    targetCollection: 'bins',
    targetId: binId,
    summary: `تسجيل تفريغ يدوي للحاوية (${bin.name}) وإعادة ضبط نسبة الامتلاء إلى 0%`,
  });

  if (updatedBin) broadcastSseEvent('bin:updated', updatedBin, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);
  return updatedBin;
}
