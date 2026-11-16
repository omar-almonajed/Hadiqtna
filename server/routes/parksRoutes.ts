import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import {
  getDocument,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { ServiceError } from '../services/iotService.ts';
import { createId } from '../utils/crypto.ts';
import { createParkSchema, updateParkSchema } from '../validators/schemas.ts';
import type { Bin, Park } from '../../src/types/domain.ts';

function damascusSortRank(p: Park): number {
  if (p.id === 'park-alnakheel') return 0;
  if (p.id.startsWith('park-damascus-') || p.location.includes('دمشق') || p.name.includes('دمشق')) return 1;
  return 2;
}

function isDamascusPark(p: Park): boolean {
  return damascusSortRank(p) < 2;
}

export const parksRouter = Router();

// Public list of active Damascus parks for landing page and citizen reporting portal (non-sensitive fields only)
parksRouter.get('/public', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const [parks, bins] = await Promise.all([
      listCollection<Park>('parks'),
      listCollection<Bin>('bins'),
    ]);
    const binCounts = new Map<string, number>();
    for (const bin of bins) {
      binCounts.set(bin.parkId, (binCounts.get(bin.parkId) || 0) + 1);
    }

    const active = parks
      .filter((p) => p.status !== 'INACTIVE' && isDamascusPark(p))
      .filter((p) => {
        if (!query) return true;
        return (
          p.name.toLowerCase().includes(query) ||
          p.location.toLowerCase().includes(query) ||
          (p.description || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => damascusSortRank(a) - damascusSortRank(b))
      .map((p) => ({
        id: p.id,
        name: p.name,
        location: p.location,
        description: p.description,
        status: p.status,
        binCount: binCounts.get(p.id) || 0,
      }));
    res.json({ success: true, parks: active });
  } catch (err) {
    next(err);
  }
});

parksRouter.get('/', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'WORKER'), async (_req, res, next) => {
  try {
    const parks = await listCollection<Park>('parks');
    parks.sort((a, b) => damascusSortRank(a) - damascusSortRank(b));
    res.json({ success: true, parks });
  } catch (err) {
    next(err);
  }
});

parksRouter.post('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = createParkSchema.parse(req.body);
    const id = data.id || createId('park');
    const existing = await getDocument<Park>('parks', id);
    if (existing) throw new ServiceError(409, 'PARK_EXISTS', 'معرف الحديقة مسجل مسبقاً.');

    const now = new Date().toISOString();
    const park: Park = {
      id,
      name: data.name,
      description: data.description,
      location: data.location,
      status: data.status,
      createdAt: now,
      updatedAt: now,
    };
    await setDocument('parks', id, park as unknown as Record<string, unknown>);
    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'PARK_CREATED',
      targetCollection: 'parks',
      targetId: id,
      summary: `إضافة حديقة جديدة (${park.name})`,
    });
    res.status(201).json({ success: true, park });
  } catch (err) {
    next(err);
  }
});

parksRouter.patch('/:parkId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const patch = updateParkSchema.parse(req.body);
    const existing = await getDocument<Park>('parks', req.params.parkId);
    if (!existing) throw new ServiceError(404, 'PARK_NOT_FOUND', 'الحديقة غير موجودة.');

    const updated = await updateDocument<Park & Record<string, unknown>>('parks', existing.id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'PARK_UPDATED',
      targetCollection: 'parks',
      targetId: existing.id,
      summary: `تحديث بيانات الحديقة (${existing.name})`,
    });
    res.json({ success: true, park: updated });
  } catch (err) {
    next(err);
  }
});
