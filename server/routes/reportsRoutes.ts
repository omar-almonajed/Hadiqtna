import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { citizenReportLimiter } from '../middleware/rateLimit.ts';
import {
  getDocument,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
} from '../repositories/dataStore.ts';
import { ServiceError } from '../services/iotService.ts';
import { createStaffNotification } from '../services/notificationService.ts';
import { createId, timingSafeStringEqual } from '../utils/crypto.ts';
import { broadcastSseEvent } from '../utils/sseHub.ts';
import {
  citizenReportSchema,
  convertReportSchema,
  updateReportSchema,
} from '../validators/schemas.ts';
import type {
  CitizenReport,
  MaintenanceTask,
  Park,
  ReportStatus,
  ReportStatusHistoryEntry,
} from '../../src/types/domain.ts';
import { REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from '../../src/utils/i18n.ts';

export const reportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 4 },
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
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function appendHistory(
  existing: ReportStatusHistoryEntry[] | undefined,
  status: ReportStatus,
  changedAt: string,
  actorName?: string,
  note?: string
): ReportStatusHistoryEntry[] {
  const base: ReportStatusHistoryEntry[] = Array.isArray(existing) ? [...existing] : [];
  const label = REPORT_STATUS_LABELS[status]?.ar || status;
  base.push({
    status,
    label,
    changedAt,
    ...(actorName ? { actorName } : {}),
    ...(note ? { note } : {}),
  });
  return base.slice(-30);
}

// Public citizen submission endpoint (supports single `photo` or multiple `photos` up to 4)
reportsRouter.post(
  '/',
  citizenReportLimiter,
  upload.fields([
    { name: 'photos', maxCount: 4 },
    { name: 'photo', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const parsed = citizenReportSchema.parse(req.body);
      const park = await getDocument<Park>('parks', parsed.parkId);
      if (!park) {
        throw new ServiceError(404, 'PARK_NOT_FOUND', 'الحديقة المحددة غير موجودة.');
      }

      const fileBag = req.files as { photos?: Express.Multer.File[]; photo?: Express.Multer.File[] } | undefined;
      const incomingFiles = [
        ...(fileBag?.photo ?? []),
        ...(fileBag?.photos ?? []),
      ].slice(0, 4);

      const imageUrls: string[] = [];
      if (incomingFiles.length > 0) {
        fs.mkdirSync(env.uploadDir, { recursive: true });
        for (const f of incomingFiles) {
          const ext = detectImageExtension(f.buffer);
          if (!ext) {
            throw new ServiceError(400, 'INVALID_FILE_SIGNATURE', 'أحد الملفات المرفقة ليس صورة صالحة.');
          }
          const filename = `${createId('repimg')}.${ext}`;
          fs.writeFileSync(path.join(env.uploadDir, filename), f.buffer);
          imageUrls.push(`/api/reports/uploads/${filename}`);
        }
      }

      const id = createId('rep');
      const trackingCode = String(crypto.randomInt(100000, 1000000));
      const now = new Date().toISOString();
      const derivedTitle =
        parsed.title && parsed.title.trim().length >= 3
          ? parsed.title.trim()
          : REPORT_TYPE_LABELS[parsed.reportType].ar;
      const derivedLocation =
        parsed.locationDescription && parsed.locationDescription.trim().length >= 2
          ? parsed.locationDescription.trim()
          : 'داخل الحديقة';

      const initialHistory: ReportStatusHistoryEntry[] = [
        {
          status: 'NEW',
          label: REPORT_STATUS_LABELS.NEW.ar,
          changedAt: now,
        },
      ];

      const report: CitizenReport = {
        id,
        parkId: parsed.parkId,
        reportType: parsed.reportType,
        title: derivedTitle,
        description: parsed.description,
        locationDescription: derivedLocation,
        ...(imageUrls.length > 0 ? { imageUrl: imageUrls[0], imageUrls } : {}),
        trackingCode,
        ...(parsed.reporterName ? { reporterName: parsed.reporterName } : {}),
        ...(parsed.reporterContact ? { reporterContact: parsed.reporterContact } : {}),
        status: 'NEW',
        priority:
          parsed.reportType === 'PLAYGROUND_DAMAGE' || parsed.reportType === 'FULL_BIN'
            ? 'HIGH'
            : 'MEDIUM',
        statusHistory: initialHistory,
        createdAt: now,
        updatedAt: now,
      };

      await setDocument('citizenReports', id, report as unknown as Record<string, unknown>);
      broadcastSseEvent('report:created', report, ['ADMIN', 'SUPERVISOR']);

      await createStaffNotification({
        type: 'NEW_REPORT',
        title: `بلاغ جديد: ${REPORT_TYPE_LABELS[report.reportType].ar}`,
        message: `ورد بلاغ جديد (${report.id}) في ${park.name}`,
        targetRoles: ['ADMIN', 'SUPERVISOR'],
        relatedCollection: 'citizenReports',
        relatedId: report.id,
      });

      res.status(201).json({
        success: true,
        referenceNumber: id,
        trackingCode,
        report: {
          id: report.id,
          parkId: report.parkId,
          reportType: report.reportType,
          title: report.title,
          status: report.status,
          createdAt: report.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Serve validated uploaded report images safely (staff-only to protect citizen report context)
reportsRouter.get(
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

// Serve report/completion photo strictly to the citizen who possesses the matching tracking code
reportsRouter.get(
  '/citizen-photo/:reportId/:filename',
  citizenReportLimiter,
  async (req, res, next) => {
    try {
      const rawId = String(req.params.reportId || '').trim();
      const safeName = path.basename(req.params.filename);
      const code = String(req.query.code ?? req.headers['x-tracking-code'] ?? '').trim();

      if (!/^[a-zA-Z0-9_-]{3,128}$/.test(rawId) || !/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(safeName)) {
        throw new ServiceError(400, 'INVALID_REQUEST', 'معطيات الصورة غير صالحة.');
      }

      const report = await getDocument<CitizenReport>('citizenReports', rawId);
      if (!report || !report.trackingCode || !code || !timingSafeStringEqual(code, report.trackingCode)) {
        throw new ServiceError(403, 'INVALID_TRACKING_CODE', 'رمز المتابعة مطلوب أو غير مطابق.');
      }

      const tasks = await listCollection<MaintenanceTask>('maintenanceTasks');
      const linkedTask = tasks.find((tk) => tk.reportId === report.id);

      const allowedFiles = new Set<string>();
      if (report.imageUrl) allowedFiles.add(path.basename(report.imageUrl));
      for (const u of report.imageUrls ?? []) {
        allowedFiles.add(path.basename(u));
      }
      if (linkedTask?.afterImageUrl) {
        allowedFiles.add(path.basename(linkedTask.afterImageUrl));
      }

      if (!allowedFiles.has(safeName)) {
        throw new ServiceError(404, 'FILE_NOT_FOUND', 'الصورة غير مرتبطة بهذا البلاغ.');
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

// Public non-PII report status tracking by reference number
// Unverified queries return status summary & timeline WITHOUT photos or PII
// Verified queries (?code=xxxxxx) also include citizen-uploaded photos, description, location, and after-maintenance photo
reportsRouter.get('/track/:reportId', citizenReportLimiter, async (req, res, next) => {
  try {
    const rawId = String(req.params.reportId || '').trim();
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(rawId)) {
      throw new ServiceError(400, 'INVALID_REFERENCE_ID', 'صيغة الرقم المرجعي غير صالحة.');
    }

    const report = await getDocument<CitizenReport>('citizenReports', rawId);
    if (!report) {
      throw new ServiceError(404, 'REPORT_NOT_FOUND', 'لم يتم العثور على بلاغ بهذا الرقم المرجعي.');
    }

    const [park, tasks] = await Promise.all([
      getDocument<Park>('parks', report.parkId),
      listCollection<MaintenanceTask>('maintenanceTasks'),
    ]);
    const linkedTask = tasks.find((tk) => tk.reportId === report.id);

    const providedCode = String(req.query.code ?? req.headers['x-tracking-code'] ?? '').trim();
    const verified = Boolean(
      providedCode && report.trackingCode && timingSafeStringEqual(providedCode, report.trackingCode)
    );

    const history: ReportStatusHistoryEntry[] =
      Array.isArray(report.statusHistory) && report.statusHistory.length > 0
        ? report.statusHistory
        : [
            {
              status: report.status,
              label: REPORT_STATUS_LABELS[report.status]?.ar || report.status,
              changedAt: report.updatedAt || report.createdAt,
            },
          ];

    const rawPhotos =
      report.imageUrls && report.imageUrls.length > 0
        ? report.imageUrls
        : report.imageUrl
          ? [report.imageUrl]
          : [];

    const verifiedPhotos = verified
      ? rawPhotos.map(
          (u) =>
            `/api/reports/citizen-photo/${report.id}/${path.basename(u)}?code=${encodeURIComponent(providedCode)}`
        )
      : undefined;

    const verifiedAfterPhoto =
      verified && linkedTask?.afterImageUrl
        ? `/api/reports/citizen-photo/${report.id}/${path.basename(linkedTask.afterImageUrl)}?code=${encodeURIComponent(providedCode)}`
        : undefined;

    res.json({
      success: true,
      tracking: {
        referenceNumber: report.id,
        parkId: report.parkId,
        parkName: park?.name || report.parkId,
        parkLocation: park?.location || '',
        reportType: report.reportType,
        title: report.title,
        status: report.status,
        priority: report.priority,
        taskStatus: linkedTask?.status ?? null,
        assignedTeam: linkedTask?.assignedTeam ?? report.assignedTeam ?? null,
        scheduledFor: linkedTask?.scheduledFor ?? null,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        resolvedAt: report.resolvedAt ?? null,
        closedAt: report.closedAt ?? null,
        completedAt: linkedTask?.completedAt ?? null,
        statusHistory: history,
        verified,
        ...(verified
          ? {
              description: report.description,
              locationDescription: report.locationDescription,
              imageUrls: verifiedPhotos,
              afterImageUrl: verifiedAfterPhoto ?? null,
              completionNotes: linkedTask?.completionNotes ?? null,
            }
          : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Staff reports management (strictly ADMIN & SUPERVISOR due to reporter PII)
reportsRouter.get('/', requireAuth, requireRole('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const all = await listCollection<CitizenReport>('citizenReports');
    const reports = all
      .filter((r) => !statusFilter || r.status === statusFilter)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    res.json({ success: true, reports });
  } catch (err) {
    next(err);
  }
});

reportsRouter.patch(
  '/:reportId',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const patch = updateReportSchema.parse(req.body);
      const existing = await getDocument<CitizenReport>('citizenReports', req.params.reportId);
      if (!existing) throw new ServiceError(404, 'REPORT_NOT_FOUND', 'البلاغ غير موجود.');

      const now = new Date().toISOString();
      const nextStatus = patch.status ?? existing.status;
      const statusChanged = nextStatus !== existing.status;

      const history = statusChanged
        ? appendHistory(existing.statusHistory, nextStatus, now, req.user!.fullName, patch.statusNote)
        : existing.statusHistory ?? appendHistory(undefined, existing.status, existing.createdAt);

      const updateFields: Partial<CitizenReport> & Record<string, unknown> = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.assignedTo !== undefined ? { assignedTo: patch.assignedTo } : {}),
        ...(patch.assignedTeam !== undefined ? { assignedTeam: patch.assignedTeam } : {}),
        ...(patch.internalNotes !== undefined ? { internalNotes: patch.internalNotes } : {}),
        statusHistory: history,
        updatedAt: now,
      };

      if (nextStatus === 'RESOLVED' && !existing.resolvedAt) {
        updateFields.resolvedAt = now;
      }
      if (nextStatus === 'CLOSED' && !existing.closedAt) {
        updateFields.closedAt = now;
      }

      const updated = await updateDocument<CitizenReport & Record<string, unknown>>(
        'citizenReports',
        existing.id,
        updateFields
      );

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'REPORT_UPDATED',
        targetCollection: 'citizenReports',
        targetId: existing.id,
        summary: `تحديث البلاغ (${existing.id}) إلى الحالة ${nextStatus}`,
      });

      if (statusChanged && updated) {
        await createStaffNotification({
          type: 'REPORT_STATUS_UPDATED',
          title: `تحديث حالة بلاغ (${existing.id})`,
          message: `أصبحت حالة البلاغ "${existing.title}" الآن: ${REPORT_STATUS_LABELS[nextStatus]?.ar || nextStatus}`,
          targetRoles: ['ADMIN', 'SUPERVISOR'],
          ...(updated.assignedTo ? { targetUid: updated.assignedTo } : {}),
          relatedCollection: 'citizenReports',
          relatedId: existing.id,
        });
      }

      if (updated) broadcastSseEvent('report:updated', updated, ['ADMIN', 'SUPERVISOR']);
      res.json({ success: true, report: updated });
    } catch (err) {
      next(err);
    }
  }
);

reportsRouter.post(
  '/:reportId/convert',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR'),
  async (req, res, next) => {
    try {
      const data = convertReportSchema.parse(req.body);
      const report = await getDocument<CitizenReport>('citizenReports', req.params.reportId);
      if (!report) throw new ServiceError(404, 'REPORT_NOT_FOUND', 'البلاغ غير موجود.');

      const now = new Date().toISOString();
      const taskId = createId('task');
      const task: MaintenanceTask = {
        id: taskId,
        reportId: report.id,
        parkId: report.parkId,
        ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
        ...(data.assignedTeam ? { assignedTeam: data.assignedTeam } : {}),
        locationDescription: report.locationDescription,
        ...(data.scheduledFor ? { scheduledFor: new Date(data.scheduledFor).toISOString() } : {}),
        title: data.title || report.title,
        description:
          data.description ||
          `${report.description}\nالموقع داخل الحديقة: ${report.locationDescription}`,
        priority: data.priority || report.priority,
        status: data.assignedTo || data.assignedTeam ? 'ASSIGNED' : 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      await setDocument('maintenanceTasks', taskId, task as unknown as Record<string, unknown>);

      const history = appendHistory(
        report.statusHistory,
        'CONVERTED_TO_TASK',
        now,
        req.user!.fullName,
        data.assignedTeam ? `إسناد إلى: ${data.assignedTeam}` : undefined
      );

      const updatedReport = await updateDocument<CitizenReport & Record<string, unknown>>(
        'citizenReports',
        report.id,
        {
          status: 'CONVERTED_TO_TASK',
          ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
          ...(data.assignedTeam ? { assignedTeam: data.assignedTeam } : {}),
          statusHistory: history,
          updatedAt: now,
        }
      );

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'REPORT_CONVERTED_TO_TASK',
        targetCollection: 'maintenanceTasks',
        targetId: taskId,
        summary: `تحويل البلاغ (${report.id}) إلى مهمة صيانة (${taskId})`,
      });

      await createStaffNotification({
        type: 'TASK_ASSIGNED',
        title: `جدولة مهمة صيانة: ${task.title}`,
        message: data.assignedTeam
          ? `تم تحويل البلاغ (${report.id}) إلى مهمة لفريق ${data.assignedTeam}`
          : `تم تحويل البلاغ (${report.id}) إلى مهمة صيانة جديدة`,
        targetRoles: ['ADMIN', 'SUPERVISOR', 'MAINTENANCE', 'WORKER'],
        ...(data.assignedTo ? { targetUid: data.assignedTo } : {}),
        relatedCollection: 'maintenanceTasks',
        relatedId: taskId,
      });

      broadcastSseEvent('task:created', task, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);
      if (updatedReport) broadcastSseEvent('report:updated', updatedReport, ['ADMIN', 'SUPERVISOR']);

      res.status(201).json({ success: true, task, report: updatedReport });
    } catch (err) {
      next(err);
    }
  }
);
