import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileWarning,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DemoControlPanel } from '../components/dashboard/DemoControlPanel';
import { EmptyState, ErrorState, FillProgressBar, LoadingState } from '../components/common/StateViews';
import {
  AlertSeverityLabel,
  DeviceStatusLabel,
  OperationalBinLabel,
  ReportStatusLabel,
  SourceTag,
} from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { AnalyticsSummary } from '../types/domain';
import {
  formatDateTime,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
} from '../utils/i18n';

const PIE_COLORS = ['#14532D', '#15803D', '#0EA5E9', '#D97706', '#DC2626', '#7C3AED', '#475569', '#059669'];

export function DashboardPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const {
    bins,
    devices,
    readings,
    alerts,
    reports,
    tasks,
    config,
    loading,
    error,
    refreshAll,
  } = useRealtime();

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  const isSupervisorOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';
  const isIoTOperatorOrAbove =
    profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR' || profile?.role === 'OPERATOR';

  useEffect(() => {
    if (!isIoTOperatorOrAbove) return;
    apiRequest<{ analytics: AnalyticsSummary }>('/api/analytics?source=ALL')
      .then((res) => setAnalytics(res.analytics))
      .catch(() => {
        // Fallback to live collections when analytics request is unavailable
      });
  }, [isIoTOperatorOrAbove, bins.length, reports.length, readings.length]);

  const warningThreshold = config?.warningThresholdPercent ?? 80;

  const fullBinsCount = bins.filter(
    (b) => b.lastReadingAt && b.status !== 'OFFLINE' && b.currentFillPercentage >= 100
  ).length;
  const needsEmptyBinsCount = bins.filter(
    (b) =>
      b.lastReadingAt &&
      b.status !== 'OFFLINE' &&
      b.currentFillPercentage >= warningThreshold &&
      b.currentFillPercentage < 100
  ).length;
  const normalBinsCount = bins.filter(
    (b) =>
      b.lastReadingAt &&
      b.status !== 'OFFLINE' &&
      b.currentFillPercentage < warningThreshold
  ).length;

  const totalReportsCount = isSupervisorOrAdmin ? reports.length : (analytics?.totalReports ?? 0);
  const newReportsCount = isSupervisorOrAdmin
    ? reports.filter((r) => r.status === 'NEW').length
    : (analytics?.reportsByStatus.find((x) => x.status === 'NEW')?.count ?? 0);
  const inProgressStatuses = ['UNDER_REVIEW', 'ACCEPTED', 'CONVERTED_TO_TASK', 'IN_PROGRESS'];
  const inProgressReportsCount = isSupervisorOrAdmin
    ? reports.filter((r) => inProgressStatuses.includes(r.status)).length
    : (analytics?.reportsByStatus
        .filter((x) => inProgressStatuses.includes(x.status))
        .reduce((sum, x) => sum + x.count, 0) ?? 0);
  const closedStatuses = ['RESOLVED', 'CLOSED', 'REJECTED'];
  const closedReportsCount = isSupervisorOrAdmin
    ? reports.filter((r) => closedStatuses.includes(r.status)).length
    : (analytics?.reportsByStatus
        .filter((x) => closedStatuses.includes(x.status))
        .reduce((sum, x) => sum + x.count, 0) ?? 0);

  const activeAlerts = alerts.filter((a) => a.status !== 'RESOLVED');
  const pendingTasks = tasks.filter((tk) => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(tk.status));

  const kpis = [
    { label: t('إجمالي الحاويات', 'Total Smart Bins'), value: bins.length, icon: Trash2, accent: 'text-[#141E18]' },
    { label: t('الحاويات الممتلئة', 'Full Bins'), value: fullBinsCount, icon: AlertCircle, accent: fullBinsCount > 0 ? 'text-red-700' : 'text-[#141E18]' },
    { label: t('تحتاج تفريغاً', 'Needs Emptying'), value: needsEmptyBinsCount, icon: AlertTriangle, accent: needsEmptyBinsCount > 0 ? 'text-amber-700' : 'text-[#141E18]' },
    { label: t('الحاويات الطبيعية', 'Normal Bins'), value: normalBinsCount, icon: CheckCircle2, accent: 'text-[#14532D]' },
    { label: t('إجمالي البلاغات', 'Total Reports'), value: totalReportsCount, icon: ClipboardList, accent: 'text-[#141E18]' },
    { label: t('البلاغات الجديدة', 'New Reports'), value: newReportsCount, icon: FileWarning, accent: newReportsCount > 0 ? 'text-amber-800' : 'text-[#141E18]' },
    { label: t('قيد المعالجة', 'In Processing'), value: inProgressReportsCount, icon: Clock, accent: 'text-[#141E18]' },
    { label: t('البلاغات المغلقة', 'Closed / Resolved'), value: closedReportsCount, icon: CheckCircle2, accent: 'text-emerald-800' },
  ];

  const binFillChartData = bins
    .filter((b) => Boolean(b.lastReadingAt))
    .map((b) => ({
      name: b.name.length > 18 ? `${b.name.slice(0, 16)}…` : b.name,
      fill: b.currentFillPercentage,
    }));

  const reportsByTypeChartData = (analytics?.reportsByType ?? []).map((item) => ({
    name: REPORT_TYPE_LABELS[item.type]?.[lang] || item.type,
    value: item.count,
  }));

  const reportsByStatusChartData = (analytics?.reportsByStatus ?? []).map((item) => ({
    name: REPORT_STATUS_LABELS[item.status]?.[lang] || item.status,
    count: item.count,
  }));

  const reportsOverTimeChartData = (analytics?.reportsOverTime ?? []).map((item) => ({
    date: item.date,
    count: item.count,
  }));

  return (
    <DashboardLayout
      title={t('لوحة القيادة الرئيسية', 'Operations Command Dashboard')}
      subtitle={t(
        'متابعة حالة الحاويات الذكية وبلاغات المواطنين والتنبيهات التشغيلية في حدائق دمشق',
        'Real-time overview of Damascus smart bins, citizen reports, alerts, and maintenance'
      )}
      actions={
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-[#E2E6E1] rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t('تحديث', 'Refresh')}</span>
        </button>
      }
    >
      <div className="space-y-6">
        {error && <ErrorState message={error} onRetry={() => void refreshAll()} />}

        {isSupervisorOrAdmin && <DemoControlPanel />}

        {loading && bins.length === 0 ? (
          <LoadingState />
        ) : (
          <>
            {/* 8 KPI Cards */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    className="bg-white border border-[#E2E6E1] rounded-xl p-4 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-stone-500">{kpi.label}</p>
                      <p className={`font-mono text-2xl font-bold tabular-nums ${kpi.accent}`}>
                        {kpi.value}
                      </p>
                    </div>
                    <Icon className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" aria-hidden="true" />
                  </div>
                );
              })}
            </section>

            {/* 4 Analytics Charts */}
            {isIoTOperatorOrAbove && (
              <section className="grid lg:grid-cols-2 gap-6">
                {/* Chart 1 */}
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold text-[#141E18]">
                      {t('مستويات امتلاء الحاويات', 'Smart Bin Fill Levels')}
                    </h2>
                    <Link to="/bins" className="text-xs font-semibold text-[#14532D] hover:underline">
                      {t('جدول الحاويات', 'Fleet Table')}
                    </Link>
                  </div>
                  {binFillChartData.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد بيانات حالية', 'No Current Data')}
                      description={t(
                        'لم تُسجل أي قراءة من الحساسات بعد. ستظهر الأعمدة البيانية فور وصول أول قراءة.',
                        'Waiting for first sensor reading to render fill level chart.'
                      )}
                    />
                  ) : (
                    <div className="h-56 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={binFillChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EEF1ED" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="fill" fill="#14532D" radius={[4, 4, 0, 0]} name={t('الامتلاء %', 'Fill %')} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 2 */}
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-3">
                  <h2 className="font-display text-sm font-bold text-[#141E18]">
                    {t('توزيع البلاغات حسب النوع', 'Citizen Reports by Category')}
                  </h2>
                  {reportsByTypeChartData.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد بلاغات مسجلة بعد', 'No Reports Yet')}
                      description={t('يظهر توزيع البلاغات تلقائياً بعد استقبال بلاغات المواطنين.', 'Report breakdown appears once citizen reports are filed.')}
                    />
                  ) : (
                    <div className="h-56 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reportsByTypeChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={72}
                            label
                          >
                            {reportsByTypeChartData.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 3 */}
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-3">
                  <h2 className="font-display text-sm font-bold text-[#141E18]">
                    {t('عدد البلاغات حسب الحالة', 'Reports by Status')}
                  </h2>
                  {reportsByStatusChartData.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد بيانات حالية', 'No Current Data')}
                      description={t('تظهر حالات البلاغات عند ورود بلاغات للمنصة.', 'Status breakdown renders when reports exist.')}
                    />
                  ) : (
                    <div className="h-56 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reportsByStatusChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EEF1ED" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#15803D" radius={[4, 4, 0, 0]} name={t('العدد', 'Count')} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 4 */}
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-3">
                  <h2 className="font-display text-sm font-bold text-[#141E18]">
                    {t('تطور البلاغات خلال الفترة الزمنية', 'Reports Over Time')}
                  </h2>
                  {reportsOverTimeChartData.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد بيانات حالية', 'No Current Data')}
                      description={t('يظهر التسلسل الزمني للبلاغات فور تسجيل بلاغات.', 'Time trend populates as reports arrive.')}
                    />
                  ) : (
                    <div className="h-56 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={reportsOverTimeChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EEF1ED" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#14532D"
                            fill="#15803D"
                            fillOpacity={0.16}
                            strokeWidth={2}
                            name={t('البلاغات', 'Reports')}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Sensoneo Smart Bins & Alerts Row */}
            <div className="grid lg:grid-cols-12 gap-6">
              <section className="lg:col-span-7 bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-[#141E18]">
                    {t('حالة الحاويات الذكية', 'Smart Bin Fleet Status')}
                  </h2>
                  <Link to="/bins" className="text-xs font-semibold text-[#14532D] hover:underline">
                    {t('عرض الكل', 'View all')}
                  </Link>
                </div>

                {bins.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد حاويات مسجلة', 'No Smart Bins')}
                    description={t('قم بإضافة حاوية ذكية من صفحة الحاويات للبدء.', 'Add a smart bin to begin monitoring.')}
                  />
                ) : (
                  <div className="divide-y divide-[#E2E6E1]">
                    {bins.map((bin) => {
                      const dev = devices.find((d) => d.id === bin.deviceId);
                      const hasData = Boolean(bin.lastReadingAt);
                      return (
                        <div key={bin.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                to={`/bins/${bin.id}`}
                                className="text-sm font-semibold text-[#141E18] hover:text-[#14532D] hover:underline"
                              >
                                {bin.name}
                              </Link>
                              <p className="text-xs text-stone-500">
                                {bin.locationDescription}
                                {dev && (
                                  <>
                                    {' · '}
                                    <span className="font-mono">{dev.id}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <SourceTag source={bin.lastReadingSource} />
                              <OperationalBinLabel bin={bin} />
                              <span className="font-mono text-sm font-bold tabular-nums text-[#141E18]">
                                {hasData ? `${bin.currentFillPercentage}%` : t('لا توجد بيانات حالية', 'No current data')}
                              </span>
                            </div>
                          </div>
                          {hasData && (
                            <FillProgressBar
                              percentage={bin.currentFillPercentage}
                              warningThreshold={warningThreshold}
                              criticalThreshold={config?.criticalThresholdPercent}
                            />
                          )}
                          {dev && (
                            <div className="flex items-center justify-between text-xs text-stone-500">
                              <DeviceStatusLabel status={dev.connectionStatus} />
                              <span className="font-mono tabular-nums">
                                {t('آخر قراءة:', 'Last reading:')}{' '}
                                {hasData ? formatDateTime(bin.lastReadingAt, lang) : t('لا توجد بيانات حالية', 'No current data')}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="lg:col-span-5 bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-[#141E18]">
                    {isIoTOperatorOrAbove
                      ? t('التنبيهات النشطة', 'Active Alerts')
                      : t('مهام الصيانة المسندة', 'Assigned Tasks')}
                  </h2>
                  <Link
                    to={isIoTOperatorOrAbove ? '/alerts' : '/maintenance'}
                    className="text-xs font-semibold text-[#14532D] hover:underline"
                  >
                    {t('إدارة', 'Manage')}
                  </Link>
                </div>

                {isIoTOperatorOrAbove ? (
                  activeAlerts.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد تنبيهات نشطة', 'No Active Alerts')}
                      description={t('جميع الحاويات والأجهزة تعمل ضمن الحدود الطبيعية حالياً.', 'All bins and devices are operating normally.')}
                    />
                  ) : (
                    <div className="divide-y divide-[#E2E6E1]">
                      {activeAlerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <AlertSeverityLabel severity={alert.severity} />
                            <SourceTag source={alert.source} />
                          </div>
                          <p className="text-sm text-[#141E18]">{alert.message}</p>
                          <p className="text-xs font-mono text-stone-500 tabular-nums">
                            {formatDateTime(alert.createdAt, lang)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                ) : pendingTasks.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد مهام جارية', 'No Pending Tasks')}
                    description={t('ستظهر هنا أي مهام صيانة تُسند إليك.', 'Assigned maintenance tasks will appear here.')}
                  />
                ) : (
                  <div className="divide-y divide-[#E2E6E1]">
                    {pendingTasks.slice(0, 5).map((task) => (
                      <div key={task.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <p className="text-sm font-semibold text-[#141E18]">{task.title}</p>
                        <p className="text-xs text-stone-500 line-clamp-2">{task.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Recent Telemetry & Citizen Reports */}
            {isIoTOperatorOrAbove && (
              <div className="grid lg:grid-cols-12 gap-6">
                <section className={`${isSupervisorOrAdmin ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#141E18]">
                      {t('أحدث قراءات الحساسات', 'Recent Sensor Readings')}
                    </h2>
                    <Link to="/monitoring" className="text-xs font-semibold text-[#14532D] hover:underline">
                      {t('المراقبة الحية', 'Live Monitor')}
                    </Link>
                  </div>

                  {readings.length === 0 ? (
                    <EmptyState
                      title={t('لا توجد قراءات مسجلة بعد', 'No Sensor Readings Yet')}
                      description={
                        config?.operatingMode === 'DEMO'
                          ? t('استخدم لوحة المحاكاة أعلاه لإرسال قراءات DEMO واختبار العتبات.', 'Use the DEMO simulator above to generate test readings.')
                          : t('بانتظار استقبال أول قراءة مصادق عليها من جهاز ESP32 / ESP8266.', 'Waiting for the first authenticated ESP reading.')
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E6E1] text-stone-500 text-start">
                            <th className="py-2 font-medium text-start">{t('الجهاز', 'Device')}</th>
                            <th className="py-2 font-medium text-start">{t('الامتلاء', 'Fill')}</th>
                            <th className="py-2 font-medium text-start">{t('المسافة', 'Distance')}</th>
                            <th className="py-2 font-medium text-start">{t('المصدر', 'Source')}</th>
                            <th className="py-2 font-medium text-start">{t('الوقت', 'Received')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E6E1]">
                          {readings.slice(0, 8).map((r) => (
                            <tr key={r.id} className="hover:bg-stone-50/70">
                              <td className="py-2.5 font-mono text-stone-700">{r.deviceId}</td>
                              <td className="py-2.5 font-mono font-semibold tabular-nums">{r.fillPercentage}%</td>
                              <td className="py-2.5 font-mono tabular-nums text-stone-600">{r.distanceCm} cm</td>
                              <td className="py-2.5">
                                <SourceTag source={r.source} />
                              </td>
                              <td className="py-2.5 font-mono tabular-nums text-stone-500">
                                {formatDateTime(r.receivedAt, lang)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {isSupervisorOrAdmin && (
                  <section className="lg:col-span-5 bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-bold text-[#141E18]">
                        {t('أحدث بلاغات المواطنين', 'Recent Citizen Reports')}
                      </h2>
                      <Link to="/reports" className="text-xs font-semibold text-[#14532D] hover:underline">
                        {t('عرض الكل', 'View all')}
                      </Link>
                    </div>

                    {reports.length === 0 ? (
                      <EmptyState
                        title={t('لا توجد بلاغات مسجلة', 'No Citizen Reports')}
                        description={t('ستظهر البلاغات الواردة من بوابة حديقتي هنا فوراً.', 'Reports submitted via /citizen appear here.')}
                      />
                    ) : (
                      <div className="divide-y divide-[#E2E6E1]">
                        {reports.slice(0, 5).map((rep) => (
                          <div key={rep.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-stone-500">{REPORT_TYPE_LABELS[rep.reportType]?.[lang] || rep.reportType}</span>
                              <ReportStatusLabel status={rep.status} />
                            </div>
                            <p className="text-sm font-medium text-[#141E18]">{rep.title}</p>
                            <p className="text-xs text-stone-500">{rep.locationDescription}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
