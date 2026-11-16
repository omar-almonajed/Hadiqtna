import { env } from '../config/env.ts';
import {
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { createId } from '../utils/crypto.ts';
import type { SyncOutboxItem } from '../../src/types/domain.ts';

function isLocalSyncActive(): boolean {
  const localMode = process.env.LOCAL_SERVER_MODE === 'true' || env.localServerMode;
  const centralUrl = (process.env.CENTRAL_SYNC_URL || env.centralSyncUrl || '').trim();
  return localMode && Boolean(centralUrl);
}

export async function enqueueSyncReading(item: {
  deviceId: string;
  sequenceNumber: number;
  distanceCm: number;
  signalStrength: number;
  measuredAt: string;
}): Promise<SyncOutboxItem | null> {
  if (!isLocalSyncActive()) return null;

  const id = createId('sync');
  const record: SyncOutboxItem = {
    id,
    deviceId: item.deviceId,
    sequenceNumber: item.sequenceNumber,
    distanceCm: item.distanceCm,
    signalStrength: item.signalStrength,
    measuredAt: item.measuredAt,
    createdAt: new Date().toISOString(),
    syncStatus: 'PENDING',
    attempts: 0,
  };
  await setDocument('syncOutbox', id, record as unknown as Record<string, unknown>);
  return record;
}

export async function getSyncStatus() {
  const localMode = process.env.LOCAL_SERVER_MODE === 'true' || env.localServerMode;
  const centralUrl = (process.env.CENTRAL_SYNC_URL || env.centralSyncUrl || '').trim();
  const outbox = await listCollection<SyncOutboxItem>('syncOutbox');
  return {
    localServerMode: localMode,
    centralSyncConfigured: Boolean(centralUrl),
    pendingCount: outbox.filter((o) => o.syncStatus === 'PENDING').length,
    syncedCount: outbox.filter((o) => o.syncStatus === 'SYNCED' || o.syncStatus === 'CONFLICT_DUPLICATE').length,
  };
}

export interface SyncFlushResult {
  attempted: number;
  synced: number;
  duplicates: number;
  failed: number;
  error?: string;
}

export type SyncTransport = (
  url: string,
  payload: { deviceId: string; readings: Array<{ sequenceNumber: number; distanceCm: number; signalStrength: number; measuredAt: string }> },
  syncSecret: string
) => Promise<{
  ok: boolean;
  status: number;
  results?: Array<{ sequenceNumber: number; status: string }>;
  error?: string;
}>;

const defaultTransport: SyncTransport = async (url, payload, syncSecret) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    results?: Array<{ sequenceNumber: number; status: string }>;
    message?: string;
  };
  return {
    ok: res.ok,
    status: res.status,
    results: data.results,
    error: data.message,
  };
};

export async function flushSyncOutbox(
  actor?: { uid: string; email?: string },
  transport: SyncTransport = defaultTransport
): Promise<SyncFlushResult> {
  const centralUrl = (process.env.CENTRAL_SYNC_URL || env.centralSyncUrl || '').trim().replace(/\/+$/, '');
  const syncSecret = (process.env.SYNC_SHARED_SECRET || env.syncSharedSecret || '').trim();

  if (!centralUrl || syncSecret.length < 16) {
    return {
      attempted: 0,
      synced: 0,
      duplicates: 0,
      failed: 0,
      error: 'CENTRAL_SYNC_URL or SYNC_SHARED_SECRET is not configured.',
    };
  }

  const all = await listCollection<SyncOutboxItem>('syncOutbox');
  const pending = all
    .filter((i) => i.syncStatus === 'PENDING')
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  if (pending.length === 0) {
    return { attempted: 0, synced: 0, duplicates: 0, failed: 0 };
  }

  // Group by deviceId, max 50 items per batch
  const byDevice = new Map<string, SyncOutboxItem[]>();
  for (const item of pending) {
    const arr = byDevice.get(item.deviceId) ?? [];
    arr.push(item);
    byDevice.set(item.deviceId, arr);
  }

  let synced = 0;
  let duplicates = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (const [deviceId, items] of byDevice.entries()) {
    const chunk = items.slice(0, 50);
    try {
      const response = await transport(
        `${centralUrl}/api/iot/sync/ingest`,
        {
          deviceId,
          readings: chunk.map((c) => ({
            sequenceNumber: c.sequenceNumber,
            distanceCm: c.distanceCm,
            signalStrength: c.signalStrength,
            measuredAt: c.measuredAt,
          })),
        },
        syncSecret
      );

      if (!response.ok) {
        lastError = response.error || `HTTP_${response.status}`;
        for (const item of chunk) {
          failed += 1;
          await updateDocument<SyncOutboxItem & Record<string, unknown>>('syncOutbox', item.id, {
            attempts: item.attempts + 1,
            lastError,
          });
        }
        continue;
      }

      const statusBySeq = new Map<number, string>(
        (response.results || []).map((r) => [r.sequenceNumber, r.status])
      );

      for (const item of chunk) {
        const itemStatus = statusBySeq.get(item.sequenceNumber) || 'ACCEPTED';
        if (itemStatus === 'DUPLICATE') {
          duplicates += 1;
          await updateDocument<SyncOutboxItem & Record<string, unknown>>('syncOutbox', item.id, {
            syncStatus: 'CONFLICT_DUPLICATE',
            attempts: item.attempts + 1,
            lastError: undefined,
          });
        } else if (itemStatus === 'INVALID') {
          failed += 1;
          await updateDocument<SyncOutboxItem & Record<string, unknown>>('syncOutbox', item.id, {
            attempts: item.attempts + 1,
            lastError: 'INVALID_DISTANCE_READING',
          });
        } else {
          synced += 1;
          await updateDocument<SyncOutboxItem & Record<string, unknown>>('syncOutbox', item.id, {
            syncStatus: 'SYNCED',
            attempts: item.attempts + 1,
            lastError: undefined,
          });
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      for (const item of chunk) {
        failed += 1;
        await updateDocument<SyncOutboxItem & Record<string, unknown>>('syncOutbox', item.id, {
          attempts: item.attempts + 1,
          lastError,
        });
      }
    }
  }

  if (actor) {
    await recordAuditLog({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'LOCAL_SYNC_FLUSH',
      targetCollection: 'syncOutbox',
      targetId: 'batch',
      summary: `مزامنة الخادم المحلي مع المركزي: نجح=${synced}، مكرر=${duplicates}، فشل=${failed}`,
    });
  }

  return {
    attempted: pending.length,
    synced,
    duplicates,
    failed,
    ...(lastError ? { error: lastError } : {}),
  };
}
