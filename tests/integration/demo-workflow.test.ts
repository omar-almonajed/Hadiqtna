import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server.ts';
import { setTokenVerifierForTest } from '../../server/middleware/auth.ts';
import { resetDataStoreForTest } from '../../server/repositories/dataStore.ts';

const app = createApp();

describe('End-to-End DEMO, Citizen Report & Maintenance Workflow Integration Test', () => {
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
      if (token === 'worker-token') {
        return {
          uid: 'worker-uid-1',
          email: 'worker@example.com',
          email_verified: true,
          name: 'خالد الفني',
        };
      }
      throw new Error('Unauthorized');
    });
  });

  it('executes the complete 16-step DEMO & Citizen Maintenance workflow', async () => {
    // 1. Ensure DEMO mode is active
    const settingsRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', 'Bearer admin-token')
      .send({ operatingMode: 'DEMO' });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.config.operatingMode).toBe('DEMO');

    // 2. Simulate 45% -> NORMAL, no alert
    const sim45 = await request(app)
      .post('/api/iot/demo/simulate')
      .set('Authorization', 'Bearer admin-token')
      .send({ binId: 'bin-nakheel-01', fillPercentage: 45 });
    expect(sim45.status).toBe(201);
    expect(sim45.body.bin.status).toBe('NORMAL');
    expect(sim45.body.alertTriggered).toBe(false);

    // 3. Simulate 79% -> NORMAL, warning threshold not crossed
    const sim79 = await request(app)
      .post('/api/iot/demo/simulate')
      .set('Authorization', 'Bearer admin-token')
      .send({ binId: 'bin-nakheel-01', fillPercentage: 79 });
    expect(sim79.status).toBe(201);
    expect(sim79.body.bin.status).toBe('NORMAL');
    expect(sim79.body.alertTriggered).toBe(false);

    // 4. Simulate 80% -> WARNING, alert generated
    const sim80 = await request(app)
      .post('/api/iot/demo/simulate')
      .set('Authorization', 'Bearer admin-token')
      .send({ binId: 'bin-nakheel-01', fillPercentage: 80 });
    expect(sim80.status).toBe(201);
    expect(sim80.body.bin.status).toBe('WARNING');
    expect(sim80.body.alertTriggered).toBe(true);

    // 5. Simulate 95% -> CRITICAL
    const sim95 = await request(app)
      .post('/api/iot/demo/simulate')
      .set('Authorization', 'Bearer admin-token')
      .send({ binId: 'bin-nakheel-01', fillPercentage: 95 });
    expect(sim95.status).toBe(201);
    expect(sim95.body.bin.status).toBe('CRITICAL');

    // 6. Activate worker account via admin
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer worker-token');
    const activateWorker = await request(app)
      .patch('/api/users/worker-uid-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ role: 'WORKER', isActive: true });
    expect(activateWorker.status).toBe(200);

    // 7. Submit public citizen report about broken playground equipment
    const reportRes = await request(app)
      .post('/api/reports')
      .send({
        parkId: 'park-alnakheel',
        reportType: 'PLAYGROUND_DAMAGE',
        title: 'كسر في أرجوحة الأطفال الرئيسية',
        description: 'السلسلة اليمنى للأرجوحة مكسورة وتشكل خطراً على الأطفال.',
        locationDescription: 'منطقة الألعاب الشرقية',
        reporterName: 'أبو سارة',
      });
    expect(reportRes.status).toBe(201);
    const reportId = reportRes.body.referenceNumber as string;
    expect(reportId.startsWith('rep-')).toBe(true);

    // 8. Worker cannot read citizen reports (PII protection)
    const workerReportsDeny = await request(app)
      .get('/api/reports')
      .set('Authorization', 'Bearer worker-token');
    expect(workerReportsDeny.status).toBe(403);

    // 9. Admin converts report into maintenance task assigned to worker
    const convertRes = await request(app)
      .post(`/api/reports/${reportId}/convert`)
      .set('Authorization', 'Bearer admin-token')
      .send({ assignedTo: 'worker-uid-1', priority: 'HIGH' });
    expect(convertRes.status).toBe(201);
    const taskId = convertRes.body.task.id as string;
    expect(convertRes.body.task.status).toBe('ASSIGNED');

    // 10. Worker marks task IN_PROGRESS then COMPLETED with completion notes
    const startRes = await request(app)
      .patch(`/api/maintenance/${taskId}`)
      .set('Authorization', 'Bearer worker-token')
      .send({ status: 'IN_PROGRESS' });
    expect(startRes.status).toBe(200);
    expect(startRes.body.task.status).toBe('IN_PROGRESS');

    const completeRes = await request(app)
      .patch(`/api/maintenance/${taskId}`)
      .set('Authorization', 'Bearer worker-token')
      .send({
        status: 'COMPLETED',
        completionNotes: 'تم استبدال السلسلة وفحص الأمان بالكامل.',
      });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('COMPLETED');
    expect(completeRes.body.task.completedAt).toBeTruthy();

    // 11. Verify analytics reflects real persisted counts
    const analyticsRes = await request(app)
      .get('/api/analytics?source=DEMO')
      .set('Authorization', 'Bearer admin-token');
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.analytics.demoReadingsCount).toBe(4);
    expect(analyticsRes.body.analytics.totalReports).toBe(1);
    expect(analyticsRes.body.analytics.completedTasksCount).toBe(1);
    expect(analyticsRes.body.analytics.maintenanceCompletionRatePercent).toBe(100);
  });

  it('supports Hadiqti public restroom reporting, lifecycle tracking without PII, and Damascus-only searchable parks', async () => {
    const publicParksRes = await request(app).get('/api/parks/public');
    expect(publicParksRes.status).toBe(200);
    expect(Array.isArray(publicParksRes.body.parks)).toBe(true);
    expect(publicParksRes.body.parks.length).toBe(7);
    expect(
      publicParksRes.body.parks.every((p: { location: string }) => p.location.includes('دمشق'))
    ).toBe(true);

    const searchParksRes = await request(app).get(
      `/api/parks/public?q=${encodeURIComponent('السبكي')}`
    );
    expect(searchParksRes.status).toBe(200);
    expect(searchParksRes.body.parks.length).toBe(1);
    expect(searchParksRes.body.parks[0].id).toBe('park-damascus-sabki');

    const submitRes = await request(app)
      .post('/api/reports')
      .send({
        parkId: 'park-damascus-sabki',
        reportType: 'RESTROOM_ISSUE',
        title: 'عطل صنبور في الحمامات العامة',
        description: 'يوجد تسريب مياه مستمر في الحمامات الجانبية بالحديقة.',
        locationDescription: 'بجانب المدخل الشرقي لحديقة السبكي',
        reporterName: 'مواطن سري',
        reporterContact: '+963911000000',
      });
    expect(submitRes.status).toBe(201);
    const refId = submitRes.body.referenceNumber as string;

    const trackInitial = await request(app).get(`/api/reports/track/${refId}`);
    expect(trackInitial.status).toBe(200);
    expect(trackInitial.body.tracking.reportType).toBe('RESTROOM_ISSUE');
    expect(trackInitial.body.tracking.status).toBe('NEW');
    expect(trackInitial.body.tracking.taskStatus).toBeNull();
    // Ensure zero reporter PII or uploaded photo path leaks through public tracking
    expect(trackInitial.body.tracking.reporterName).toBeUndefined();
    expect(trackInitial.body.tracking.reporterContact).toBeUndefined();
    expect(trackInitial.body.tracking.imageUrl).toBeUndefined();

    const convertRes = await request(app)
      .post(`/api/reports/${refId}/convert`)
      .set('Authorization', 'Bearer admin-token')
      .send({ priority: 'HIGH' });
    expect(convertRes.status).toBe(201);

    const trackConverted = await request(app).get(`/api/reports/track/${refId}`);
    expect(trackConverted.status).toBe(200);
    expect(trackConverted.body.tracking.status).toBe('CONVERTED_TO_TASK');
    expect(trackConverted.body.tracking.taskStatus).toBe('PENDING');
  });
});
