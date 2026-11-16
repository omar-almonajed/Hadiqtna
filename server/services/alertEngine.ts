import type {
  AlertItem,
  AlertSeverity,
  AlertType,
  Bin,
  Device,
  ReadingSource,
  SystemConfig,
} from '../../src/types/domain.ts';
import {
  getSystemConfig,
  listCollection,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { createId } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';
import { createStaffNotification } from './notificationService.ts';

export interface AlertEvaluationOutcome {
  alertTriggered: boolean;
  alert: AlertItem | null;
  resolvedCount: number;
}

/**
 * Evaluates fill-level thresholds and enforces deduplication:
 * - Creates BIN_80_PERCENT (WARNING at 80-94%, CRITICAL at 95-99%) or BIN_FULL (CRITICAL at 100%)
 * - Never creates duplicate ACTIVE/ACKNOWLEDGED alerts while bin remains above threshold
 * - Escalates WARNING -> CRITICAL if crossing 95% or 100%
 * - Resolves open fill alerts when bin drops below warning threshold (emptied)
 */
export async function evaluateBinAlerts(
  bin: Bin,
  deviceId: string,
  fillPercentage: number,
  source: ReadingSource,
  config?: SystemConfig
): Promise<AlertEvaluationOutcome> {
  const cfg = config ?? (await getSystemConfig());
  const allAlerts = await listCollection<AlertItem>('alerts');
  const openFillAlerts = allAlerts.filter(
    (a) =>
      a.binId === bin.id &&
      (a.type === 'BIN_80_PERCENT' || a.type === 'BIN_FULL') &&
      (a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED')
  );

  const now = new Date().toISOString();

  // Below warning threshold (with 5% hysteresis if an alert is already open; always resolve at <= 5% / empty)
  const resolveCutoff =
    openFillAlerts.length > 0 ? Math.max(5, cfg.warningThresholdPercent - 5) : cfg.warningThresholdPercent;
  if (fillPercentage < resolveCutoff) {
    let resolvedCount = 0;
    for (const alert of openFillAlerts) {
      const updated = await updateDocument<AlertItem & Record<string, unknown>>('alerts', alert.id, {
        status: 'RESOLVED',
        resolvedAt: now,
      });
      if (updated) {
        resolvedCount += 1;
        broadcastSseEvent('alert:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
      }
    }
    return { alertTriggered: false, alert: null, resolvedCount };
  }

  // Within hysteresis band (e.g. 75%-79% while alert is open) — keep existing alert without spamming
  if (fillPercentage < cfg.warningThresholdPercent && openFillAlerts.length > 0) {
    return { alertTriggered: false, alert: openFillAlerts[0], resolvedCount: 0 };
  }

  let targetType: AlertType = 'BIN_80_PERCENT';
  let targetSeverity: AlertSeverity = 'WARNING';
  let message = `تنبيه: وصلت نسبة امتلاء الحاوية (${bin.name}) إلى ${fillPercentage}%`;

  if (fillPercentage >= 100) {
    targetType = 'BIN_FULL';
    targetSeverity = 'CRITICAL';
    message = `حالة حرجة: الحاوية (${bin.name}) ممتلئة بالكامل (100%) وتحتاج إلى تفريغ فوري`;
  } else if (fillPercentage >= cfg.criticalThresholdPercent) {
    targetType = 'BIN_80_PERCENT';
    targetSeverity = 'CRITICAL';
    message = `تحذير حرج: وصلت نسبة امتلاء الحاوية (${bin.name}) إلى ${fillPercentage}%`;
  }

  // Check if an open alert already exists for this bin
  const existingAlert = openFillAlerts[0];
  if (existingAlert) {
    // Escalate severity/type if fill level crossed into a higher tier
    if (existingAlert.severity !== targetSeverity || existingAlert.type !== targetType) {
      const escalated = await updateDocument<AlertItem & Record<string, unknown>>(
        'alerts',
        existingAlert.id,
        {
          type: targetType,
          severity: targetSeverity,
          message,
          source,
        }
      );
      if (escalated) {
        broadcastSseEvent('alert:updated', escalated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
      }
      return { alertTriggered: false, alert: escalated, resolvedCount: 0 };
    }
    // Deduplicate: do not create another alert while already active/acknowledged
    return { alertTriggered: false, alert: existingAlert, resolvedCount: 0 };
  }

  const newAlert: AlertItem = {
    id: createId('alt'),
    binId: bin.id,
    deviceId,
    type: targetType,
    severity: targetSeverity,
    message,
    status: 'ACTIVE',
    source,
    createdAt: now,
  };

  await setDocument('alerts', newAlert.id, newAlert as unknown as Record<string, unknown>);
  broadcastSseEvent('alert:created', newAlert, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);

  await createStaffNotification({
    type: 'BIN_HIGH_FILL',
    title: fillPercentage >= 100 ? `حاوية ممتلئة بالكامل: ${bin.name}` : `تجاوزت الحاوية 80%: ${bin.name}`,
    message,
    targetRoles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    relatedCollection: 'bins',
    relatedId: bin.id,
  });

  return { alertTriggered: true, alert: newAlert, resolvedCount: 0 };
}

/**
 * Resolves any active DEVICE_OFFLINE alerts when a device communicates again.
 */
export async function resolveDeviceOfflineAlerts(deviceId: string): Promise<void> {
  const allAlerts = await listCollection<AlertItem>('alerts');
  const openOffline = allAlerts.filter(
    (a) => a.deviceId === deviceId && a.type === 'DEVICE_OFFLINE' && a.status !== 'RESOLVED'
  );
  const now = new Date().toISOString();
  for (const alert of openOffline) {
    const updated = await updateDocument<AlertItem & Record<string, unknown>>('alerts', alert.id, {
      status: 'RESOLVED',
      resolvedAt: now,
    });
    if (updated) {
      broadcastSseEvent('alert:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
    }
  }
}

/**
 * Marks devices offline if lastSeenAt exceeds offlineTimeoutSeconds.
 * Never marks NEVER_CONNECTED devices as OFFLINE.
 */
export async function evaluateOfflineDevices(): Promise<number> {
  const cfg = await getSystemConfig();
  const devices = await listCollection<Device>('devices');
  const alerts = await listCollection<AlertItem>('alerts');
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let markedOffline = 0;

  for (const dev of devices) {
    if (!dev.isActive) continue;
    if (dev.connectionStatus === 'NEVER_CONNECTED' || !dev.lastSeenAt) continue;

    const lastSeenMs = Date.parse(dev.lastSeenAt);
    if (Number.isNaN(lastSeenMs)) continue;

    const elapsedSeconds = (nowMs - lastSeenMs) / 1000;
    const timeoutSeconds = Math.max(cfg.offlineTimeoutSeconds, (dev.reportingIntervalSeconds ?? 300) * 3);

    if (elapsedSeconds > timeoutSeconds && dev.connectionStatus === 'ONLINE') {
      const updatedDev = await updateDocument<Device & Record<string, unknown>>('devices', dev.id, {
        connectionStatus: 'OFFLINE',
        updatedAt: nowIso,
      });
      if (updatedDev) {
        broadcastSseEvent('device:updated', updatedDev, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);
      }
      markedOffline += 1;

      const existingOfflineAlert = alerts.find(
        (a) => a.deviceId === dev.id && a.type === 'DEVICE_OFFLINE' && a.status !== 'RESOLVED'
      );
      // Cooldown guard: avoid creating repeated offline alerts during rapid Wi-Fi flapping
      const cooldownMs = Math.max(60_000, timeoutSeconds * 1000);
      const recentlyAlerted = alerts.some(
        (a) =>
          a.deviceId === dev.id &&
          a.type === 'DEVICE_OFFLINE' &&
          nowMs - Date.parse(a.createdAt) < cooldownMs
      );
      if (!existingOfflineAlert && !recentlyAlerted) {
        const offlineAlert: AlertItem = {
          id: createId('alt'),
          binId: dev.binId,
          deviceId: dev.id,
          type: 'DEVICE_OFFLINE',
          severity: 'WARNING',
          message: `انقطع الاتصال بالجهاز (${dev.id}) منذ أكثر من ${Math.round(elapsedSeconds)} ثانية.`,
          status: 'ACTIVE',
          source: cfg.operatingMode,
          createdAt: nowIso,
        };
        await setDocument('alerts', offlineAlert.id, offlineAlert as unknown as Record<string, unknown>);
        broadcastSseEvent('alert:created', offlineAlert, ['ADMIN', 'SUPERVISOR', 'OPERATOR']);

        await createStaffNotification({
          type: 'SENSOR_OFFLINE',
          title: `انقطاع حساس: ${dev.name}`,
          message: offlineAlert.message,
          targetRoles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
          relatedCollection: 'bins',
          relatedId: dev.binId,
        });
      }
    }
  }

  return markedOffline;
}
