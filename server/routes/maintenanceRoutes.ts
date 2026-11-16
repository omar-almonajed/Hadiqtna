import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import {
  getDocument,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { ServiceError } from '../services/iotService.ts';
import { createStaffNotification } from '../services/notificationService.ts';
import { createId } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';
import { createTaskSchema, updateTaskSchema } from '../validators/schemas.ts';
import type {
  CitizenReport,
  MaintenanceTask,
  Park,
  ReportStatus,
  ReportStatusHistoryEntry,
} from '../../src/types/domain.ts';
import { REPORT_STATUS_LABELS } from '../../src/utils/i18n.ts';

export const maintenanceRouter = Router();

const uploadAfterPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

function detectImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}

function appendReportHistory(
  existing: ReportStatusHistoryEntry[] | undefined,
  status: ReportStatus,
  changedAt: string,
  actorName?: string,
  note?: string
): ReportStatusHistoryEntry[] {
  const base = Array.isArray(existing) ? [...existing] : [];
  base.push({
    status,
    label: REPORT_STATUS_LABELS[status]?.ar || status,
    changedAt,
    ...(actorName ? { actorName } : {}),
    ...(note ? { note } : {}),
  });
  return base.slice(-30);
}

maintenanceRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const all = await listCollection<MaintenanceTask>('maintenanceTasks');
      const isFieldTech = req.user!.role === 'WORKER' || req.user!.role === 'MAINTENANCE';
      const tasks = isFieldTech ? all.filter((t) => t.assignedTo === req.user!.uid) : all;
      tasks.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      res.json({ success: true, tasks });
    } catch (err) {
      next(err);
    }
  }
);

// Serve validated after-maintenance completion photos to staff
maintenanceRouter.get(
  '/uploads/:filename',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  (req, res, next) => {
    try {
      const safeName = path.basename(req.params.filename);
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(safeName)) {
        throw new ServiceError(400, 'INVALID_FILENAME', 'اسم الملف غير صالح.');
      }
      const fullPath = path.join(env.uploadDir, safeName);
      if (!fs.existsSync(fullPath)) {
        throw new ServiceError(404, 'FILE_NOT_FOUND', 'الصورة غير موجودة.');
      }
      res.sendFile(fullPath);
    } catch (err) {
      next(err);
    }
  }
);

maintenanceRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const data = createTaskSchema.parse(req.body);
      const park = await getDocument<Park>('parks', data.parkId);
      if (!park) throw new ServiceError(404, 'PARK_NOT_FOUND', 'الحديقة غير موجودة.');

      const now = new Date().toISOString();
      const id = createId('task');
      const task: MaintenanceTask = {
        id,
        ...(data.reportId ? { reportId: data.reportId } : {}),
        parkId: data.parkId,
        ...(data.binId ? { binId: data.binId } : {}),
        ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
        ...(data.assignedTeam ? { assignedTeam: data.assignedTeam } : {}),
        ...(data.locationDescription ? { locationDescription: data.locationDescription } : {}),
        ...(data.scheduledFor ? { scheduledFor: new Date(data.scheduledFor).toISOString() } : {}),
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.assignedTo || data.assignedTeam ? 'ASSIGNED' : 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      await setDocument('maintenanceTasks', id, task as unknown as Record<string, unknown>);
      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'TASK_CREATED',
        targetCollection: 'maintenanceTasks',
        targetId: id,
        summary: `إنشاء مهمة صيانة جديدة (${task.title})`,
      });

      if (task.assignedTo || task.assignedTeam) {
        await createStaffNotification({
          type: 'TASK_ASSIGNED',
          title: `مهمة صيانة مسندة: ${task.title}`,
          message: task.assignedTeam
            ? `أُسندت مهمة صيانة جديدة في ${park.name} إلى ${task.assignedTeam}`
            : `أُسندت لك مهمة صيانة جديدة في ${park.name}`,
          targetRoles: ['ADMIN', 'SUPERVISOR', 'MAINTENANCE', 'WORKER'],
          ...(task.assignedTo ? { targetUid: task.assignedTo } : {}),
          relatedCollection: 'maintenanceTasks',
          relatedId: id,
        });
      }

      broadcastSseEvent('task:created', task, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);
      res.status(201).json({ success: true, task });
    } catch (err) {
      next(err);
    }
  }
);

async function syncLinkedReportOnTaskTransition(
  reportId: string | undefined,
  taskStatus: MaintenanceTask['status'],
  now: string,
  actorName: string,
  completionNotes?: string
) {
  if (!reportId) return;
  const report = await getDocument<CitizenReport>('citizenReports', reportId);
  if (!report || ['REJECTED', 'CLOSED'].includes(report.status)) return;

  if (taskStatus === 'IN_PROGRESS' && report.status !== 'RESOLVED') {
    const history = appendReportHistory(report.statusHistory, 'IN_PROGRESS', now, actorName);
    const updatedReport = await updateDocument<CitizenReport & Record<string, unknown>>(
      'citizenReports',
      reportId,
      {
        status: 'IN_PROGRESS',
        statusHistory: history,
        updatedAt: now,
      }
    );
    if (updatedReport) {
      broadcastSseEvent('report:updated', updatedReport, ['ADMIN', 'SUPERVISOR']);
      await createStaffNotification({
        type: 'REPORT_STATUS_UPDATED',
        title: `بدأ تنفيذ الصيانة للبلاغ (${report.id})`,
        message: `باشر فريق الصيانة معالجة "${report.title}"`,
        targetRoles: ['ADMIN', 'SUPERVISOR'],
        relatedCollection: 'citizenReports',
        relatedId: report.id,
      });
    }
  } else if (taskStatus === 'COMPLETED') {
    const history = appendReportHistory(
      report.statusHistory,
      'RESOLVED',
      now,
      actorName,
      completionNotes
    );
    const updatedReport = await updateDocument<CitizenReport & Record<string, unknown>>(
      'citizenReports',
      reportId,
      {
        status: 'RESOLVED',
        resolvedAt: report.resolvedAt ?? now,
        statusHistory: history,
        updatedAt: now,
      }
    );
    if (updatedReport) {
      broadcastSseEvent('report:updated', updatedReport, ['ADMIN', 'SUPERVISOR']);
      await createStaffNotification({
        type: 'REPORT_STATUS_UPDATED',
        title: `تم حل البلاغ (${report.id})`,
        message: `أُنجزت أعمال الصيانة للبلاغ "${report.title}" وبانتظار الإغلاق النهائي`,
        targetRoles: ['ADMIN', 'SUPERVISOR'],
        relatedCollection: 'citizenReports',
        relatedId: report.id,
      });
    }
  }
}

maintenanceRouter.patch(
  '/:taskId',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'MAINTENANCE', 'WORKER'),
  async (req, res, next) => {
    try {
      const patch = updateTaskSchema.parse(req.body);
      const existing = await getDocument<MaintenanceTask>('maintenanceTasks', req.params.taskId);
      if (!existing) throw new ServiceError(404, 'TASK_NOT_FOUND', 'مهمة الصيانة غير موجودة.');

      const isWorker = req.user!.role === 'WORKER' || req.user!.role === 'MAINTENANCE';
      if (isWorker) {
        if (existing.assignedTo !== req.user!.uid) {
          throw new ServiceError(403, 'FORBIDDEN_TASK_ACCESS', 'لا يمكنك تعديل مهمة غير مسندة إليك.');
        }
        if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
          throw new ServiceError(400, 'TERMINAL_TASK_STATE', 'المهمة مغلقة بالفعل ولا يمكن تعديلها.');
        }
        if (patch.assignedTo || patch.assignedTeam || patch.priority || patch.description || patch.scheduledFor) {
          throw new ServiceError(403, 'WORKER_FIELD_RESTRICTED', 'يمكن لفني الصيانة تحديث الحالة وملاحظات الإنجاز فقط.');
        }
        if (patch.status && !['IN_PROGRESS', 'COMPLETED'].includes(patch.status)) {
          throw new ServiceError(403, 'WORKER_INVALID_STATUS', 'الحالة المسموحة هي قيد التنفيذ أو مكتملة.');
        }
      }

      const now = new Date().toISOString();
      const nextStatus =
        patch.status ??
        ((patch.assignedTo || patch.assignedTeam) && existing.status === 'PENDING'
          ? 'ASSIGNED'
          : existing.status);

      const cleanScheduledFor =
        patch.scheduledFor === ''
          ? undefined
          : patch.scheduledFor
            ? new Date(patch.scheduledFor).toISOString()
            : undefined;

      const updated = await updateDocument<MaintenanceTask & Record<string, unknown>>(
        'maintenanceTasks',
        existing.id,
        {
          ...patch,
          ...(cleanScheduledFor !== undefined ? { scheduledFor: cleanScheduledFor } : {}),
          status: nextStatus,
          ...(nextStatus === 'COMPLETED' && !existing.completedAt ? { completedAt: now } : {}),
          updatedAt: now,
        }
      );

      await syncLinkedReportOnTaskTransition(
        existing.reportId,
        nextStatus,
        now,
        req.user!.fullName,
        patch.completionNotes
      );

      if (patch.assignedTo && patch.assignedTo !== existing.assignedTo) {
        await createStaffNotification({
          type: 'TASK_ASSIGNED',
          title: `إسناد مهمة صيانة: ${existing.title}`,
          message: `تم إسناد المهمة (${existing.id}) إليك للمتابعة والتنفيذ.`,
          targetRoles: ['ADMIN', 'SUPERVISOR'],
          targetUid: patch.assignedTo,
          relatedCollection: 'maintenanceTasks',
          relatedId: existing.id,
        });
      }

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'TASK_UPDATED',
        targetCollection: 'maintenanceTasks',
        targetId: existing.id,
        summary: `تحديث مهمة الصيانة (${existing.id}) إلى الحالة ${nextStatus}`,
      });

      if (updated) {
        broadcastSseEvent('task:updated', updated, [
          'ADMIN',
          'SUPERVISOR',
          'OPERATOR',
          'MAINTENANCE',
          'WORKER',
        ]);
      }
      res.json({ success: true, task: updated });
    } catch (err) {
      next(err);
    }
  }
);

// Complete maintenance task with optional after-maintenance photo upload
maintenanceRouter.post(
  '/:taskId/complete',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'MAINTENANCE', 'WORKER'),
  uploadAfterPhoto.single('afterPhoto'),
  async (req, res, next) => {
    try {
      const existing = await getDocument<MaintenanceTask>('maintenanceTasks', req.params.taskId);
      if (!existing) throw new ServiceError(404, 'TASK_NOT_FOUND', 'مهمة الصيانة غير موجودة.');

      const isWorker = req.user!.role === 'WORKER' || req.user!.role === 'MAINTENANCE';
      if (isWorker && existing.assignedTo !== req.user!.uid) {
        throw new ServiceError(403, 'FORBIDDEN_TASK_ACCESS', 'لا يمكنك إتمام مهمة غير مسندة إليك.');
      }
      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new ServiceError(400, 'TERMINAL_TASK_STATE', 'المهمة مغلقة بالفعل ولا يمكن تعديلها.');
      }

      let afterImageUrl = existing.afterImageUrl;
      if (req.file) {
        const ext = detectImageExtension(req.file.buffer);
        if (!ext) {
          throw new ServiceError(400, 'INVALID_FILE_SIGNATURE', 'الملف المرفق ليس صورة صالحة.');
        }
        fs.mkdirSync(env.uploadDir, { recursive: true });
        const filename = `${createId('taskimg')}.${ext}`;
        fs.writeFileSync(path.join(env.uploadDir, filename), req.file.buffer);
        afterImageUrl = `/api/maintenance/uploads/${filename}`;
      }

      const completionNotes =
        typeof req.body?.completionNotes === 'string' && req.body.completionNotes.trim()
          ? req.body.completionNotes.trim().slice(0, 1000)
          : existing.completionNotes || 'تم إنجاز الصيانة الميدانية بنجاح.';

      const now = new Date().toISOString();
      const updated = await updateDocument<MaintenanceTask & Record<string, unknown>>(
        'maintenanceTasks',
        existing.id,
        {
          status: 'COMPLETED',
          completionNotes,
          ...(afterImageUrl ? { afterImageUrl } : {}),
          completedAt: now,
          updatedAt: now,
        }
      );

      await syncLinkedReportOnTaskTransition(
        existing.reportId,
        'COMPLETED',
        now,
        req.user!.fullName,
        completionNotes
      );

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'TASK_COMPLETED',
        targetCollection: 'maintenanceTasks',
        targetId: existing.id,
        summary: `إتمام مهمة الصيانة (${existing.id})${afterImageUrl ? ' مع إرفاق صورة بعد الإصلاح' : ''}`,
      });

      if (updated) {
        broadcastSseEvent('task:updated', updated, [
          'ADMIN',
          'SUPERVISOR',
          'OPERATOR',
          'MAINTENANCE',
          'WORKER',
        ]);
      }

      res.json({ success: true, task: updated });
    } catch (err) {
      next(err);
    }
  }
);
