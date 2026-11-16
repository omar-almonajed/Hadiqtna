import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, Save, Server, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type {
  AuditLog,
  DeploymentDiagnostics,
  OperatingMode,
  UserProfile,
  UserRole,
} from '../types/domain';
import { formatDateTime, ROLE_LABELS } from '../utils/i18n';

export function SettingsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { config, refreshAll } = useRealtime();

  const isAdmin = profile?.role === 'ADMIN';

  const [operatingMode, setOperatingMode] = useState<OperatingMode>(config?.operatingMode || 'DEMO');
  const [warningThreshold, setWarningThreshold] = useState(config?.warningThresholdPercent ?? 80);
  const [criticalThreshold, setCriticalThreshold] = useState(config?.criticalThresholdPercent ?? 95);
  const [intervalSec, setIntervalSec] = useState(config?.defaultReportingIntervalSeconds ?? 300);
  const [offlineTimeout, setOfflineTimeout] = useState(config?.offlineTimeoutSeconds ?? 900);
  const [emptyDist, setEmptyDist] = useState(config?.defaultEmptyDistanceCm ?? 90);
  const [fullDist, setFullDist] = useState(config?.defaultFullDistanceCm ?? 15);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<DeploymentDiagnostics | null>(null);
  const [localPwdUid, setLocalPwdUid] = useState<string | null>(null);
  const [localPwdValue, setLocalPwdValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [flushingSync, setFlushingSync] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setOperatingMode(config.operatingMode);
      setWarningThreshold(config.warningThresholdPercent);
      setCriticalThreshold(config.criticalThresholdPercent);
      setIntervalSec(config.defaultReportingIntervalSeconds);
      setOfflineTimeout(config.offlineTimeoutSeconds);
      setEmptyDist(config.defaultEmptyDistanceCm);
      setFullDist(config.defaultFullDistanceCm);
    }
  }, [config]);

  const loadAdminExtras = () => {
    if (!isAdmin) return;
    Promise.all([
      apiRequest<{ users: UserProfile[] }>('/api/users'),
      apiRequest<{ logs: AuditLog[] }>('/api/audit-logs'),
      apiRequest<{ diagnostics: DeploymentDiagnostics }>('/api/diagnostics/deployment'),
    ])
      .then(([uRes, aRes, dRes]) => {
        setUsers(uRes.users);
        setAuditLogs(aRes.logs);
        setDiagnostics(dRes.diagnostics);
      })
      .catch(() => {
        // Ignore non-critical load failure
      });
  };

  useEffect(() => {
    loadAdminExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: {
          operatingMode,
          warningThresholdPercent: Number(warningThreshold),
          criticalThresholdPercent: Number(criticalThreshold),
          defaultReportingIntervalSeconds: Number(intervalSec),
          offlineTimeoutSeconds: Number(offlineTimeout),
          defaultEmptyDistanceCm: Number(emptyDist),
          defaultFullDistanceCm: Number(fullDist),
        },
      });
      setFeedback(t('تم حفظ إعدادات النظام وتحديثها لجميع الجلسات.', 'System settings saved successfully.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر حفظ الإعدادات.', 'Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (uid: string, patch: { role?: UserRole; isActive?: boolean }) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(`/api/users/${uid}`, {
        method: 'PATCH',
        body: patch,
      });
      setUsers((prev) => prev.map((u) => (u.uid === uid ? res.user : u)));
      setFeedback(t('تم تحديث صلاحية المستخدم بنجاح.', 'User role updated.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحديث المستخدم.', 'Failed to update user.'));
    }
  };

  const handleSetLocalPassword = async (uid: string) => {
    if (localPwdValue.length < 8) {
      setFeedback(t('يجب أن تتكون كلمة المرور المحلية من 8 أحرف على الأقل.', 'Password must be at least 8 characters.'));
      return;
    }
    setFeedback(null);
    try {
      await apiRequest(`/api/users/${uid}/local-credentials`, {
        method: 'POST',
        body: { password: localPwdValue },
      });
      setLocalPwdUid(null);
      setLocalPwdValue('');
      setFeedback(t('تم تعيين كلمة المرور المحلية الاحتياطية للموظف.', 'Local fallback password updated.'));
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر حفظ كلمة المرور المحلية.', 'Failed to set password.'));
    }
  };

  const handleFlushSync = async () => {
    setFlushingSync(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        outcome: { attempted: number; synced: number; duplicates: number; failed: number; error?: string };
      }>('/api/iot/sync/flush', { method: 'POST' });
      const o = res.outcome;
      setFeedback(
        t(
          `نتيجة المزامنة: تمت مزامنة ${o.synced}، مكرر ${o.duplicates}، فشل ${o.failed}${o.error ? ` (${o.error})` : ''}`,
          `Sync result: synced=${o.synced}, duplicate=${o.duplicates}, failed=${o.failed}`
        )
      );
      loadAdminExtras();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذرت المزامنة.', 'Sync failed.'));
    } finally {
      setFlushingSync(false);
    }
  };

  return (
    <DashboardLayout
      title={t('الإعدادات وإدارة الصلاحيات', 'Settings & System Configuration')}
      subtitle={t('ملف المستخدم، وضع التشغيل (DEMO/HARDWARE)، عتبات التنبيه، وصلاحيات الفريق', 'Profile, DEMO/HARDWARE mode selector, calibration defaults, and RBAC management')}
    >
      <div className="space-y-6">
        {feedback && (
          <div className="bg-white border border-[#E2E6E1] rounded-lg px-4 py-3 text-sm text-[#17211C]">
            {feedback}
          </div>
        )}

        {/* User Profile Card */}
        {profile && (
          <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-3">
            <h2 className="font-display font-bold text-base text-[#17211C]">
              {t('ملف الحساب الحالي', 'Your Account Profile')}
            </h2>
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-stone-500 block">{t('الاسم الكامل', 'Full Name')}</span>
                <span className="text-sm font-semibold text-[#17211C]">{profile.fullName}</span>
              </div>
              <div>
                <span className="text-stone-500 block">{t('البريد الإلكتروني', 'Email')}</span>
                <span className="font-mono text-sm text-[#17211C]">{profile.email}</span>
              </div>
              <div>
                <span className="text-stone-500 block">{t('الصلاحية الوظيفية', 'Role')}</span>
                <span className="text-sm font-semibold text-[#14532D]">{ROLE_LABELS[profile.role][lang]}</span>
              </div>
            </div>
          </section>
        )}

        {!isAdmin ? (
          <div className="bg-white border border-[#E2E6E1] rounded-lg p-6 flex items-center gap-3 text-sm text-stone-600">
            <Shield className="w-5 h-5 text-stone-500 shrink-0" />
            <span>
              {t(
                'تعديل وضع التشغيل وعتبات التنبيه وإدارة المستخدمين مقصور على مدير النظام (ADMIN).',
                'System mode, thresholds, and user management are restricted to administrators.'
              )}
            </span>
          </div>
        ) : (
          <>
            {/* Admin System Settings */}
            <form onSubmit={handleSaveConfig} className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-base text-[#17211C]">
                    {t('إعدادات النظام ووضع التشغيل', 'Operating Mode & System Configuration')}
                  </h2>
                  <p className="text-xs text-stone-500">
                    {t('التبديل بين DEMO و HARDWARE لا يمس القراءات التاريخية المخزنة.', 'Switching modes preserves all historical readings with explicit source tags.')}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F6F5F1] rounded-lg">
                  {(['DEMO', 'HARDWARE'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOperatingMode(m)}
                      className={`px-3.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors ${
                        operatingMode === m
                          ? m === 'HARDWARE'
                            ? 'bg-[#14532D] text-white'
                            : 'bg-amber-600 text-white'
                          : 'text-stone-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('عتبة التحذير (%)', 'Warning Threshold (%)')}
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={warningThreshold}
                    onChange={(e) => setWarningThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('عتبة الخطر الحرج (%)', 'Critical Threshold (%)')}
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={100}
                    value={criticalThreshold}
                    onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('فاصل الإرسال الافتراضي (ثانية)', 'Reporting Interval (s)')}
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={86400}
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('مهلة اعتبار الجهاز منقطعاً (ثانية)', 'Offline Timeout (s)')}
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={86400}
                    value={offlineTimeout}
                    onChange={(e) => setOfflineTimeout(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('مسافة الفراغ الافتراضية (سم)', 'Default Empty Distance (cm)')}
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={emptyDist}
                    onChange={(e) => setEmptyDist(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    {t('مسافة الامتلاء الافتراضية (سم)', 'Default Full Distance (cm)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    value={fullDist}
                    onChange={(e) => setFullDist(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ الإعدادات', 'Save Configuration')}</span>
                </button>
              </div>
            </form>

            {/* Field & Cloud Persistence Diagnostics */}
            {diagnostics && (
              <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#14532D]" />
                    <h2 className="font-display font-bold text-base text-[#17211C]">
                      {t('تشخيص جاهزية النشر وقاعدة البيانات (سوريا)', 'Deployment & Firestore Persistence Diagnostics')}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {diagnostics.centralSyncConfigured && (
                      <button
                        type="button"
                        disabled={flushingSync}
                        onClick={() => void handleFlushSync()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-md hover:bg-[#0F3F22]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t('مزامنة الصندوق المحلي الآن', 'Flush Sync Outbox')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={loadAdminExtras}
                      className="px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-md hover:bg-stone-50"
                    >
                      {t('تحديث الفحص', 'Refresh Probe')}
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-2 border-t border-[#E2E6E1]">
                  <div>
                    <span className="text-stone-500 block">{t('اتصال Firebase Admin Firestore', 'Firestore Admin SDK')}</span>
                    <span className={`font-mono font-semibold ${diagnostics.firestoreAdminConnected ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {diagnostics.firestoreAdminConnected
                        ? t('متصل ومُتحقق (قراءة/كتابة)', 'CONNECTED (Write Probe OK)')
                        : t('غير متصل (يحتاج مفتاح خدمة)', 'DISCONNECTED')}
                    </span>
                    {diagnostics.firestoreError && (
                      <span className="block text-[11px] text-stone-500 mt-0.5 break-all">{diagnostics.firestoreError}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-stone-500 block">{t('وضع التخزين الفعلي', 'Active Persistence Mode')}</span>
                    <span className="font-mono font-semibold text-[#17211C]">{diagnostics.persistenceMode}</span>
                    <span className={`block text-[11px] mt-0.5 ${diagnostics.productionPersistenceReady ? 'text-emerald-700' : 'text-red-700'}`}>
                      {diagnostics.productionPersistenceReady
                        ? t('جاهز للاستمرارية الإنتاجية', 'Production persistence ready')
                        : t('تحذير: التخزين المؤقت غير صالح للإنتاج', 'Warning: Not production-persistent (/tmp)')}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">{t('وصول ESP32 عبر HTTPS', 'ESP32 HTTPS Reachability')}</span>
                    <span className={`font-mono font-semibold ${diagnostics.isPreviewAuthProxyUrl ? 'text-red-700' : 'text-[#17211C]'}`}>
                      {diagnostics.isPreviewAuthProxyUrl
                        ? t('رابط معاينة محمي بكوكيز (غير صالح للـ ESP32)', 'Preview Auth Proxy (Blocked for ESP32)')
                        : diagnostics.appUrl || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">{t('وضع الخادم المحلي والمصادقة', 'Local Fallback & Auth')}</span>
                    <span className="font-mono text-[#17211C]">
                      {diagnostics.localServerMode ? t('خادم محلي مفعّل', 'LOCAL_SERVER_MODE') : t('وضع سحابي مركزي', 'CENTRAL_MODE')}
                      {diagnostics.centralSyncConfigured
                        ? ` · ${t('معلق:', 'Pending:')} ${diagnostics.syncPendingCount}`
                        : ''}
                    </span>
                    <span className="block text-[11px] text-stone-500 mt-0.5">
                      {diagnostics.localStaffAuthEnabled
                        ? t('المصادقة المحلية للطاقم: مفعّلة', 'Local Staff Auth: ENABLED')
                        : t('المصادقة المحلية للطاقم: معطّلة', 'Local Staff Auth: DISABLED')}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* User Roles Management */}
            <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
              <h2 className="font-display font-bold text-base text-[#17211C]">
                {t('إدارة صلاحيات الموظفين', 'Staff & Role Management')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E6E1] text-stone-500">
                      <th className="py-2 text-start font-medium">{t('الاسم', 'Name')}</th>
                      <th className="py-2 text-start font-medium">{t('البريد', 'Email')}</th>
                      <th className="py-2 text-start font-medium">{t('الدور', 'Role')}</th>
                      <th className="py-2 text-start font-medium">{t('التفعيل', 'Status')}</th>
                      <th className="py-2 text-start font-medium">{t('دخول محلي بديل', 'Local Fallback')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E6E1]">
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-2.5 font-medium text-[#17211C]">{u.fullName}</td>
                        <td className="py-2.5 font-mono text-stone-600">{u.email}</td>
                        <td className="py-2.5">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              void handleUpdateUser(u.uid, { role: e.target.value as UserRole })
                            }
                            className="px-2 py-1 border border-[#D4DAD3] rounded bg-white text-xs"
                          >
                            {(['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER', 'PENDING'] as UserRole[]).map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r][lang]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => void handleUpdateUser(u.uid, { isActive: !u.isActive })}
                            className={`px-2.5 py-1 rounded text-xs font-medium border ${
                              u.isActive
                                ? 'border-emerald-300 text-emerald-900 bg-emerald-50'
                                : 'border-stone-300 text-stone-600 bg-stone-50'
                            }`}
                          >
                            {u.isActive ? t('نشط', 'Active') : t('معطّل', 'Inactive')}
                          </button>
                        </td>
                        <td className="py-2.5">
                          {localPwdUid === u.uid ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="password"
                                minLength={8}
                                placeholder={t('8 أحرف+', '8+ chars')}
                                value={localPwdValue}
                                onChange={(e) => setLocalPwdValue(e.target.value)}
                                className="px-2 py-1 border border-[#D4DAD3] rounded text-xs w-28"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSetLocalPassword(u.uid)}
                                className="px-2 py-1 bg-[#14532D] text-white rounded text-xs"
                              >
                                {t('حفظ', 'Save')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setLocalPwdUid(null);
                                  setLocalPwdValue('');
                                }}
                                className="px-2 py-1 border border-[#D4DAD3] rounded text-xs"
                              >
                                {t('إلغاء', 'Cancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLocalPwdUid(u.uid);
                                setLocalPwdValue('');
                              }}
                              className="px-2.5 py-1 border border-[#D4DAD3] rounded text-xs hover:bg-stone-50"
                            >
                              {t('تعيين كلمة مرور محلية', 'Set Local Password')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Audit Logs */}
            <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
              <h2 className="font-display font-bold text-base text-[#17211C]">
                {t('سجل التدقيق الإداري (Audit Logs)', 'Administrative Audit Logs')}
              </h2>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-stone-500">{t('لا توجد عمليات مسجلة بعد.', 'No audit logs yet.')}</p>
              ) : (
                <div className="divide-y divide-[#E2E6E1] max-h-72 overflow-y-auto">
                  {auditLogs.slice(0, 25).map((log) => (
                    <div key={log.id} className="py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-semibold text-[#14532D]">{log.action}</span>
                        <span className="mx-2 text-stone-400">·</span>
                        <span className="text-[#17211C]">{log.summary}</span>
                      </div>
                      <span className="font-mono text-stone-500 tabular-nums">
                        {log.actorEmail || log.actorUid} · {formatDateTime(log.createdAt, lang)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
