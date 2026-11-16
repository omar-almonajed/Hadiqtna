import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { getDocument, listCollection, updateDocument } from '../repositories/dataStore.ts';
import { ServiceError } from '../services/iotService.ts';
import type { StaffNotification, UserRole } from '../../src/types/domain.ts';

export const notificationsRouter = Router();

function isVisibleToUser(n: StaffNotification, uid: string, role: UserRole): boolean {
  if (n.targetUid && n.targetUid === uid) return true;
  if (Array.isArray(n.targetRoles) && n.targetRoles.includes(role)) return true;
  return false;
}

notificationsRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const all = await listCollection<StaffNotification>('notifications');
      const visible = all
        .filter((n) => isVisibleToUser(n, req.user!.uid, req.user!.role))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 100);

      const unreadCount = visible.filter(
        (n) => !n.isRead && !(n.readBy ?? []).includes(req.user!.uid)
      ).length;

      res.json({ success: true, notifications: visible, unreadCount });
    } catch (err) {
      next(err);
    }
  }
);

notificationsRouter.post(
  '/:notificationId/read',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const notif = await getDocument<StaffNotification>('notifications', req.params.notificationId);
      if (!notif || !isVisibleToUser(notif, req.user!.uid, req.user!.role)) {
        throw new ServiceError(404, 'NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود.');
      }

      const now = new Date().toISOString();
      const readBy = Array.from(new Set([...(notif.readBy ?? []), req.user!.uid]));
      const updated = await updateDocument<StaffNotification & Record<string, unknown>>(
        'notifications',
        notif.id,
        {
          isRead: true,
          readBy,
          readAt: notif.readAt ?? now,
        }
      );
      res.json({ success: true, notification: updated });
    } catch (err) {
      next(err);
    }
  }
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const all = await listCollection<StaffNotification>('notifications');
      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const notif of all) {
        if (!isVisibleToUser(notif, req.user!.uid, req.user!.role)) continue;
        if (notif.isRead && (notif.readBy ?? []).includes(req.user!.uid)) continue;
        const readBy = Array.from(new Set([...(notif.readBy ?? []), req.user!.uid]));
        await updateDocument<StaffNotification & Record<string, unknown>>(
          'notifications',
          notif.id,
          {
            isRead: true,
            readBy,
            readAt: notif.readAt ?? now,
          }
        );
        updatedCount += 1;
      }
      res.json({ success: true, updatedCount });
    } catch (err) {
      next(err);
    }
  }
);
