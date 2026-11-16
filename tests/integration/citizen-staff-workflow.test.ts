import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server.ts';
import { setTokenVerifierForTest } from '../../server/middleware/auth.ts';
import { resetDataStoreForTest } from '../../server/repositories/dataStore.ts';

const app = createApp();

// Valid 1x1 PNG binary header + body for upload validation
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
  0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('Citizen (Hadiqti) + Staff Operations & Maintenance Full Workflow', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDataStoreForTest();
    setTokenVerifierForTest(async (token) => {
      if (token === 'admin-token') {
        return {
          uid: 'admin-uid-1',
          email: 'mralmnjd363@gmail.com',
          email_verified: true,
          name: 'مدير النظام',
        };
      }
      if (token === 'supervisor-token') {
        return {
          uid: 'sup-uid-1',
          email: 'supervisor@damascus.gov.sy',
          email_verified: true,
          name: 'مشرف الحدائق',
        };
      }
      if (token === 'operator-token') {
        return {
          uid: 'op-uid-1',
          email: 'operator@damascus.gov.sy',
          email_verified: true,
          name: 'موظف التشغيل',
        };
      }
      if (token === 'maint-token') {
        return {
          uid: 'maint-uid-1',
          email: 'tech@damascus.gov.sy',
          email_verified: true,
          name: 'فني الصيانة',
        };
      }
      throw new Error('Unauthorized');
    });
  });

  async function provisionStaffRoles() {
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer supervisor-token');
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer operator-token');
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer maint-token');

    await request(app)
      .patch('/api/users/sup-uid-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ role: 'SUPERVISOR', isActive: true });

    await request(app)
      .patch('/api/users/op-uid-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ role: 'OPERATOR', isActive: true });

    await request(app)
      .patch('/api/users/maint-uid-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ role: 'MAINTENANCE', isActive: true });
  }

  it('completes the 7-stage citizen report -> maintenance after-photo -> closure -> analytics lifecycle', async () => {
    await provisionStaffRoles();

    // 1. Citizen submits FULL_BIN report with photo upload
    const submitRes = await request(app)
      .post('/api/reports')
      .field('parkId', 'park-alnakheel')
      .field('reportType', 'FULL_BIN')
      .field('description', 'السلة بجانب مدخل التشرين ممتلئة تماماً وتفيض.')
      .field('locationDescription', 'البوابة الشرقية لحديقة تشرين')
      .field('reporterName', 'زائر دمشقي')
      .field('reporterContact', '+963944123456')
      .attach('photos', VALID_PNG_BUFFER, { filename: 'bin.png', contentType: 'image/png' });

    expect(submitRes.status).toBe(201);
    const reportId = submitRes.body.referenceNumber as string;
    const trackingCode = submitRes.body.trackingCode as string;
    expect(reportId).toMatch(/^rep-/);
    expect(trackingCode).toMatch(/^\d{6}$/);

    // 2. Unverified tracking hides PII and photo URLs
    const unverifiedTrack = await request(app).get(`/api/reports/track/${reportId}`);
    expect(unverifiedTrack.status).toBe(200);
    expect(unverifiedTrack.body.tracking.verified).toBe(false);
    expect(unverifiedTrack.body.tracking.imageUrl).toBeUndefined();
    expect(unverifiedTrack.body.tracking.imageUrls).toBeUndefined();
    expect(unverifiedTrack.body.tracking.reporterName).toBeUndefined();

    // 3. Verified tracking with trackingCode unlocks citizen photo & description
    const verifiedTrack = await request(app).get(`/api/reports/track/${reportId}?code=${trackingCode}`);
    expect(verifiedTrack.status).toBe(200);
    expect(verifiedTrack.body.tracking.verified).toBe(true);
    expect(verifiedTrack.body.tracking.imageUrls.length).toBe(1);
    const signedPhotoUrl = verifiedTrack.body.tracking.imageUrls[0] as string;
    expect(signedPhotoUrl).toContain(`/api/reports/citizen-photo/${reportId}/`);

    const photoFetchOk = await request(app).get(signedPhotoUrl);
    expect(photoFetchOk.status).toBe(200);

    const wrongCodePhotoUrl = signedPhotoUrl.replace(trackingCode, '000000');
    const photoFetchDenied = await request(app).get(wrongCodePhotoUrl);
    expect(photoFetchDenied.status).toBe(403);

    // 4. Supervisor receives NEW_REPORT notification and marks it read
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer supervisor-token');
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.notifications.some((n: { type: string; relatedId?: string }) => n.type === 'NEW_REPORT' && n.relatedId === reportId)).toBe(true);
    const notifId = notifRes.body.notifications[0].id as string;

    const markReadRes = await request(app)
      .post(`/api/notifications/${notifId}/read`)
      .set('Authorization', 'Bearer supervisor-token');
    expect(markReadRes.status).toBe(200);
    expect(markReadRes.body.notification.isRead).toBe(true);

    // 5. Supervisor updates notes & UNDER_REVIEW, then converts to Maintenance Task
    const reviewRes = await request(app)
      .patch(`/api/reports/${reportId}`)
      .set('Authorization', 'Bearer supervisor-token')
      .send({
        status: 'UNDER_REVIEW',
        internalNotes: 'تم التحقق من الصورة وسيُرسل فريق التفريغ فوراً.',
      });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.report.internalNotes).toContain('فريق التفريغ');

    const convertRes = await request(app)
      .post(`/api/reports/${reportId}/convert`)
      .set('Authorization', 'Bearer supervisor-token')
      .send({
        assignedTo: 'maint-uid-1',
        assignedTeam: 'فريق النظافة والتفريغ',
        scheduledFor: '2026-12-01T10:00:00.000Z',
        priority: 'HIGH',
      });
    expect(convertRes.status).toBe(201);
    const taskId = convertRes.body.task.id as string;
    expect(convertRes.body.task.assignedTeam).toBe('فريق النظافة والتفريغ');

    // 6. Maintenance technician transitions task IN_PROGRESS -> syncs report IN_PROGRESS
    const techTasks = await request(app)
      .get('/api/maintenance')
      .set('Authorization', 'Bearer maint-token');
    expect(techTasks.status).toBe(200);
    expect(techTasks.body.tasks.length).toBe(1);

    const startRes = await request(app)
      .patch(`/api/maintenance/${taskId}`)
      .set('Authorization', 'Bearer maint-token')
      .send({ status: 'IN_PROGRESS' });
    expect(startRes.status).toBe(200);

    const trackInProgress = await request(app).get(`/api/reports/track/${reportId}`);
    expect(trackInProgress.body.tracking.status).toBe('IN_PROGRESS');

    // 7. Technician completes task with afterPhoto -> syncs report to RESOLVED
    const completeRes = await request(app)
      .post(`/api/maintenance/${taskId}/complete`)
      .set('Authorization', 'Bearer maint-token')
      .field('completionNotes', 'تم تفريغ السلة وتنظيف محيطها بالكامل.')
      .attach('afterPhoto', VALID_PNG_BUFFER, { filename: 'after.png', contentType: 'image/png' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('COMPLETED');
    expect(completeRes.body.task.afterImageUrl).toMatch(/^\/api\/maintenance\/uploads\//);

    const trackResolved = await request(app).get(`/api/reports/track/${reportId}?code=${trackingCode}`);
    expect(trackResolved.status).toBe(200);
    expect(trackResolved.body.tracking.status).toBe('RESOLVED');
    expect(trackResolved.body.tracking.completionNotes).toContain('تفريغ السلة');
    expect(trackResolved.body.tracking.afterImageUrl).toContain(`/api/reports/citizen-photo/${reportId}/`);

    // 8. Supervisor closes report (CLOSED) & verifies analytics breakdown
    const closeRes = await request(app)
      .patch(`/api/reports/${reportId}`)
      .set('Authorization', 'Bearer supervisor-token')
      .send({ status: 'CLOSED' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.report.closedAt).toBeTruthy();
    expect(closeRes.body.report.statusHistory.length).toBeGreaterThanOrEqual(5);

    const analyticsRes = await request(app)
      .get('/api/analytics?source=ALL')
      .set('Authorization', 'Bearer supervisor-token');
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.analytics.reportsByStatus).toEqual([{ status: 'CLOSED', count: 1 }]);
    expect(analyticsRes.body.analytics.reportsOverTime.length).toBe(1);
  });

  it('supports ESP8266/HC-SR04 hardware readings, OPERATOR notifications, and bin emptying without exposing citizen PII', async () => {
    await provisionStaffRoles();

    // 1. Switch to HARDWARE mode and rotate token for seeded device
    const cfgRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', 'Bearer admin-token')
      .send({ operatingMode: 'HARDWARE' });
    expect(cfgRes.status).toBe(200);

    const tokenRes = await request(app)
      .post('/api/iot/devices/BIN-ESP32-001/rotate-token')
      .set('Authorization', 'Bearer admin-token');
    expect(tokenRes.status).toBe(200);
    const deviceToken = tokenRes.body.provisionedToken as string;

    // 2. Post HC-SR04 hardware distance reading corresponding to >= 85% fill (empty=90, full=15, d=22 -> 91%)
    const readingRes = await request(app)
      .post('/api/iot/readings')
      .set('x-device-token', deviceToken)
      .send({
        d: 'BIN-ESP32-001',
        s: 101,
        cm: 22,
        r: -64,
        t: new Date().toISOString(),
        net: 'WIFI_4G_ROUTER',
      });
    expect(readingRes.status).toBe(201);
    expect(readingRes.body.fillPercentage).toBeGreaterThanOrEqual(85);
    expect(readingRes.body.alertTriggered).toBe(true);

    // 3. OPERATOR receives BIN_HIGH_FILL notification and accesses IoT endpoints + analytics
    const opNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer operator-token');
    expect(opNotifs.status).toBe(200);
    expect(opNotifs.body.notifications.some((n: { type: string }) => n.type === 'BIN_HIGH_FILL')).toBe(true);

    const opDevices = await request(app)
      .get('/api/iot/devices')
      .set('Authorization', 'Bearer operator-token');
    expect(opDevices.status).toBe(200);

    const opAnalytics = await request(app)
      .get('/api/analytics?source=ALL')
      .set('Authorization', 'Bearer operator-token');
    expect(opAnalytics.status).toBe(200);

    // 4. OPERATOR must NOT access raw citizen reports (PII protection)
    const opReportsDenied = await request(app)
      .get('/api/reports')
      .set('Authorization', 'Bearer operator-token');
    expect(opReportsDenied.status).toBe(403);

    // 5. OPERATOR records bin emptying -> fill resets to 0%
    const emptyRes = await request(app)
      .post('/api/iot/bins/bin-nakheel-01/empty')
      .set('Authorization', 'Bearer operator-token');
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.bin.currentFillPercentage).toBe(0);
    expect(emptyRes.body.bin.status).toBe('NORMAL');
  });
});
