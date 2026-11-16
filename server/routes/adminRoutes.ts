import { Router } from 'express';
import { env, getLocalAuthConfig } from '../config/env.ts';
import { verifyFirestoreWriteProbe } from '../config/firebaseAdmin.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { publicWriteLimiter } from '../middleware/rateLimit.ts';
import {
  getDocument,
  getPersistenceDiagnostics,
  getSystemConfig,
  listCollection,
  recordAuditLog,
  setDocument,
  updateDocument,
  type LocalStaffCredential,
} from '../repositories/dataStore.ts';
import { ServiceError } from '../services/iotService.ts';
import { getSyncStatus } from '../services/syncService.ts';
import { createId, hashPassword, signLocalStaffToken, verifyPassword } from '../utils/crypto.ts';
import { broadcastSseEvent, registerSseClient } from '../utils/sseHub.ts';
import {
  localLoginSchema,
  setLocalCredentialSchema,
  systemConfigSchema,
  userRoleUpdateSchema,
} from '../validators/schemas.ts';
import type {
  AlertItem,
  AlertSeverity,
  AuditLog,
  Bin,
  CitizenReport,
  Device,
  MaintenanceTask,
  ReportStatus,
  ReportType,
  SensorReading,
  StaffDirectoryEntry,
  SystemConfig,
  UserProfile,
} from '../../src/types/domain.ts';

export const adminRouter = Router();

adminRouter.get('/auth/methods', (_req, res) => {
  const localCfg = getLocalAuthConfig();
  res.json({
    success: true,
    googleSignIn: true,
    emailPasswordFirebase: true,
    localStaffAuthEnabled: localCfg.configured,
    phoneAuth963Supported: false,
    phoneAuthWarning:
      'تم تعطيل التحقق عبر رسائل SMS لأرقام +963 لعدم موثوقية التسليم في سوريا؛ اعتمد تسجيل Google أو البريد الإلكتروني أو المصادقة المحلية للبلدية.',
  });
});

adminRouter.post('/auth/local-login', publicWriteLimiter, async (req, res, next) => {
  try {
    const localCfg = getLocalAuthConfig();
    if (!localCfg.configured) {
      throw new ServiceError(
        503,
        'LOCAL_AUTH_DISABLED',
        'تسجيل الدخول المحلي غير مفعّل على هذا الخادم (يتطلب LOCAL_STAFF_AUTH_ENABLED=true و LOCAL_AUTH_SECRET بطول 16 محرفاً على الأقل).'
      );
    }

    const { email, password } = localLoginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const creds = await listCollection<LocalStaffCredential>('localStaffCredentials');
    const cred = creds.find((c) => c.email.toLowerCase() === normalizedEmail);
    if (!cred || !verifyPassword(password, cred.passwordHash)) {
      throw new ServiceError(401, 'INVALID_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    }

    const user = await getDocument<UserProfile>('users', cred.uid);
    if (!user || !user.isActive || user.role === 'PENDING') {
      throw new ServiceError(403, 'ACCOUNT_PENDING_OR_INACTIVE', 'الحساب غير مفعّل أو بانتظار موافقة مدير النظام.');
    }

    const ttlSeconds = 43200;
    const token = signLocalStaffToken(
      { uid: user.uid, email: user.email, name: user.fullName },
      localCfg.secret,
      ttlSeconds
    );

    await recordAuditLog({
      actorUid: user.uid,
      actorEmail: user.email,
      action: 'LOCAL_STAFF_LOGIN',
      targetCollection: 'users',
      targetId: user.uid,
      summary: `تسجيل دخول موظف عبر المصادقة المحلية الآمنة (${user.email})`,
    });

    res.json({
      success: true,
      token,
      expiresInSeconds: ttlSeconds,
      user,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/users/:uid/local-credentials',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res, next) => {
    try {
      const { password } = setLocalCredentialSchema.parse(req.body);
      const user = await getDocument<UserProfile>('users', req.params.uid);
      if (!user) throw new ServiceError(404, 'USER_NOT_FOUND', 'المستخدم غير موجود.');

      const now = new Date().toISOString();
      const record: LocalStaffCredential = {
        uid: user.uid,
        email: user.email.toLowerCase(),
        passwordHash: hashPassword(password),
        updatedAt: now,
      };
      await setDocument('localStaffCredentials', user.uid, record as unknown as Record<string, unknown>);

      await recordAuditLog({
        actorUid: req.user!.uid,
        actorEmail: req.user!.email,
        action: 'LOCAL_CREDENTIAL_SET',
        targetCollection: 'localStaffCredentials',
        targetId: user.uid,
        summary: `تعيين كلمة مرور محلية احتياطية للموظف (${user.email})`,
      });

      res.json({ success: true, uid: user.uid, updatedAt: now });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get(
  '/diagnostics/deployment',
  requireAuth,
  requireRole('ADMIN'),
  async (_req, res, next) => {
    try {
      const diag = getPersistenceDiagnostics();
      const [probe, sync] = await Promise.all([verifyFirestoreWriteProbe(), getSyncStatus()]);
      const appUrl = (process.env.APP_URL || env.appUrl || '').trim();
      const isPreviewAuthProxyUrl = appUrl.includes('ais-dev-') || appUrl === 'MY_APP_URL';
      const localCfg = getLocalAuthConfig();

      res.json({
        success: true,
        diagnostics: {
          environment: process.env.NODE_ENV || env.nodeEnv,
          firestoreAdminConnected: diag.firestoreAdminConnected,
          firestoreError: diag.firestoreError,
          firestoreWriteProbeOk: probe.ok,
          firestoreProbeError: probe.error,
          persistenceMode: diag.persistenceMode,
          productionPersistenceReady: diag.productionPersistenceReady,
          dataDirIsTmp: diag.dataDirIsTmp,
          localServerMode: diag.localServerMode,
          centralSyncConfigured: sync.centralSyncConfigured,
          syncPendingCount: sync.pendingCount,
          syncSyncedCount: sync.syncedCount,
          localStaffAuthEnabled: localCfg.configured,
          appUrl,
          isPreviewAuthProxyUrl,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get('/auth/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

adminRouter.get(
  '/settings',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (_req, res, next) => {
    try {
      const config = await getSystemConfig();
      res.json({ success: true, config });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.patch('/settings', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const patch = systemConfigSchema.parse(req.body);
    const current = await getSystemConfig();

    const nextWarning = patch.warningThresholdPercent ?? current.warningThresholdPercent;
    const nextCritical = patch.criticalThresholdPercent ?? current.criticalThresholdPercent;
    if (nextCritical <= nextWarning) {
      throw new ServiceError(400, 'INVALID_THRESHOLDS', 'عتبة الخطر الحرج يجب أن تكون أكبر من عتبة التحذير.');
    }

    const nextEmpty = patch.defaultEmptyDistanceCm ?? current.defaultEmptyDistanceCm;
    const nextFull = patch.defaultFullDistanceCm ?? current.defaultFullDistanceCm;
    if (nextEmpty <= nextFull) {
      throw new ServiceError(400, 'INVALID_CALIBRATION', 'مسافة الفراغ يجب أن تكون أكبر من مسافة الامتلاء.');
    }

    const updated = await updateDocument<SystemConfig & Record<string, unknown>>('systemConfig', 'global', {
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.email,
    });

    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'SYSTEM_CONFIG_UPDATED',
      targetCollection: 'systemConfig',
      targetId: 'global',
      summary: `تحديث إعدادات النظام (وضع التشغيل: ${updated?.operatingMode})`,
    });

    if (updated) {
      broadcastSseEvent('config:updated', updated, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER']);
    }
    res.json({ success: true, config: updated });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/users', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const users = await listCollection<UserProfile>('users');
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/users/:uid', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const patch = userRoleUpdateSchema.parse(req.body);
    const existing = await getDocument<UserProfile>('users', req.params.uid);
    if (!existing) throw new ServiceError(404, 'USER_NOT_FOUND', 'المستخدم غير موجود.');

    const now = new Date().toISOString();
    const updated = await updateDocument<UserProfile & Record<string, unknown>>('users', existing.uid, {
      ...patch,
      updatedAt: now,
    });

    if (updated) {
      const dirEntry: StaffDirectoryEntry = {
        uid: updated.uid,
        fullName: updated.fullName,
        role: updated.role,
        isActive: updated.isActive,
        updatedAt: now,
      };
      await setDocument('staffDirectory', updated.uid, dirEntry as unknown as Record<string, unknown>);
    }

    await recordAuditLog({
      actorUid: req.user!.uid,
      actorEmail: req.user!.email,
      action: 'USER_ROLE_UPDATED',
      targetCollection: 'users',
      targetId: existing.uid,
      summary: `تعديل صلاحية المستخدم (${existing.email}) إلى ${patch.role ?? existing.role}`,
    });

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

adminRouter.get(
  '/staff',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'),
  async (_req, res, next) => {
    try {
      const staff = await listCollection<StaffDirectoryEntry>('staffDirectory');
      res.json({ success: true, staff: staff.filter((s) => s.isActive) });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.get('/audit-logs', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const logs = await listCollection<AuditLog>('auditLogs');
    logs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    res.json({ success: true, logs: logs.slice(0, 100) });
  } catch (err) {
    next(err);
  }
});

adminRouter.get(
  '/analytics',
  requireAuth,
  requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const config = await getSystemConfig();
      const sourceFilter =
        req.query.source === 'ALL'
          ? null
          : req.query.source === 'HARDWARE' || req.query.source === 'DEMO'
            ? req.query.source
            : config.operatingMode;

      const [bins, devices, allReadings, alerts, reports, tasks] = await Promise.all([
        listCollection<Bin>('bins'),
        listCollection<Device>('devices'),
        listCollection<SensorReading>('sensorReadings'),
        listCollection<AlertItem>('alerts'),
        listCollection<CitizenReport>('citizenReports'),
        listCollection<MaintenanceTask>('maintenanceTasks'),
      ]);

      const readings = allReadings
        .filter((r) => (!sourceFilter || r.source === sourceFilter) && r.qualityStatus === 'VALID')
        .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));

      const hardwareReadingsCount = allReadings.filter((r) => r.source === 'HARDWARE').length;
      const demoReadingsCount = allReadings.filter((r) => r.source === 'DEMO').length;

      const averageFillPercentage =
        bins.length > 0
          ? Math.round(bins.reduce((acc, b) => acc + b.currentFillPercentage, 0) / bins.length)
          : 0;

      const activeAlertsCount = alerts.filter((a) => a.status !== 'RESOLVED').length;
      const resolvedAlertsCount = alerts.filter((a) => a.status === 'RESOLVED').length;

      const connectedDevices = devices.filter((d) => d.connectionStatus !== 'NEVER_CONNECTED');
      const onlineDevices = connectedDevices.filter((d) => d.connectionStatus === 'ONLINE');
      const deviceUptimeEstimatePercent =
        connectedDevices.length > 0
          ? Math.round((onlineDevices.length / connectedDevices.length) * 100)
          : null;

      const openReportsCount = reports.filter(
        (r) => !['REJECTED', 'RESOLVED', 'CLOSED'].includes(r.status)
      ).length;

      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
      const maintenanceCompletionRatePercent =
        tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : null;

      const responseMinutes: number[] = [];
      for (const t of completedTasks) {
        if (t.completedAt && t.createdAt) {
          const diff = (Date.parse(t.completedAt) - Date.parse(t.createdAt)) / 60000;
          if (diff >= 0 && Number.isFinite(diff)) responseMinutes.push(diff);
        }
      }
      const averageResponseTimeMinutes =
        responseMinutes.length > 0
          ? Math.round(responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length)
          : null;

      const reportCounts = new Map<ReportType, number>();
      const reportStatusCounts = new Map<ReportStatus, number>();
      const reportsByDay = new Map<string, number>();

      for (const r of reports) {
        reportCounts.set(r.reportType, (reportCounts.get(r.reportType) ?? 0) + 1);
        reportStatusCounts.set(r.status, (reportStatusCounts.get(r.status) ?? 0) + 1);
        const day = r.createdAt.slice(0, 10);
        if (day) {
          reportsByDay.set(day, (reportsByDay.get(day) ?? 0) + 1);
        }
      }

      const alertSevCounts = new Map<AlertSeverity, number>();
      for (const a of alerts) {
        alertSevCounts.set(a.severity, (alertSevCounts.get(a.severity) ?? 0) + 1);
      }

      res.json({
        success: true,
        activeMode: config.operatingMode,
        analytics: {
          totalReadings: readings.length,
          hardwareReadingsCount,
          demoReadingsCount,
          averageFillPercentage,
          totalAlerts: alerts.length,
          activeAlertsCount,
          resolvedAlertsCount,
          deviceUptimeEstimatePercent,
          totalReports: reports.length,
          openReportsCount,
          totalTasks: tasks.length,
          completedTasksCount: completedTasks.length,
          maintenanceCompletionRatePercent,
          averageResponseTimeMinutes,
          fillTrend: readings.slice(-40).map((r) => ({
            timestamp: r.receivedAt,
            fillPercentage: r.fillPercentage,
            distanceCm: r.distanceCm,
            source: r.source,
          })),
          reportsByType: Array.from(reportCounts.entries()).map(([type, count]) => ({ type, count })),
          reportsByStatus: Array.from(reportStatusCounts.entries()).map(([status, count]) => ({
            status,
            count,
          })),
          reportsOverTime: Array.from(reportsByDay.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, count]) => ({ date, count })),
          alertsBySeverity: Array.from(alertSevCounts.entries()).map(([severity, count]) => ({
            severity,
            count,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Authenticated SSE stream for live dashboard updates
adminRouter.get('/stream', requireAuth, requireRole('ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = createId('sse');
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, role: req.user!.role })}\n\n`);

  const unsubscribe = registerSseClient({
    id: clientId,
    res,
    role: req.user!.role,
    uid: req.user!.uid,
  });

  const keepAlive = setInterval(() => {
    try {
      res.write(`: keepalive\n\n`);
    } catch {
      clearInterval(keepAlive);
      unsubscribe();
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
