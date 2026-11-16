import type { NotificationType, StaffNotification, UserRole } from '../../src/types/domain.ts';
import { setDocument } from '../repositories/dataStore.ts';
import { createId } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';

export async function createStaffNotification(input: {
  type: NotificationType;
  title: string;
  message: string;
  targetRoles: UserRole[];
  targetUid?: string;
  relatedCollection?: string;
  relatedId?: string;
}): Promise<StaffNotification> {
  const now = new Date().toISOString();
  const notification: StaffNotification = {
    id: createId('notif'),
    type: input.type,
    title: input.title,
    message: input.message,
    targetRoles: input.targetRoles,
    ...(input.targetUid ? { targetUid: input.targetUid } : {}),
    ...(input.relatedCollection ? { relatedCollection: input.relatedCollection } : {}),
    ...(input.relatedId ? { relatedId: input.relatedId } : {}),
    isRead: false,
    readBy: [],
    createdAt: now,
  };

  await setDocument('notifications', notification.id, notification as unknown as Record<string, unknown>);
  broadcastSseEvent('notification:created', notification, input.targetRoles, input.targetUid);
  return notification;
}
