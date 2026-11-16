import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, ErrorState, LoadingState } from '../components/common/StateViews';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { AnalyticsSummary } from '../types/domain';
import { formatShortTime, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from '../utils/i18n';

export function AnalyticsPage() {
  const { lang, t } = useLanguage();
  const { config } = useRealtime();
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'HARDWARE' | 'DEMO'>('ALL');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async (src: 'ALL' | 'HARDWARE' | 'DEMO') => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ analytics: AnalyticsSummary }>(
        `/api/analytics?source=${src}`
      );
      setData(res.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذر تحميل التحليلات.', 'Failed to load analytics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics(sourceFilter);
  }, [sourceFilter]);

  const fillChartData = (data?.fillTrend ?? []).map((item) => ({
    time: formatShortTime(item.timestamp, lang),
    fill: item.fillPercentage,
  }));

  const reportChartData = (data?.reportsByType ?? []).map((item) => ({
    name: REPORT_TYPE_LABELS[item.type]?.[lang] || item.type,
    count: item.count,
  }));

  const reportStatusChartData = (data?.reportsByStatus ?? []).map((item) => ({
    name: REPORT_STATUS_LABELS[item.status]?.[lang] || item.status,
    count: item.count,
  }));

  const reportTimeChartData = (data?.reportsOverTime ?? []).map((item) => ({
    date: item.date,
    count: item.count,
  }));

  return (
    <DashboardLayout
      title={t('التحليلات والتقارير التشغيلية', 'Operational Analytics')}
      subtitle={t('إحصاءات حقيقية مبنية على السجلات المخزنة فقط دون أي أرقام مفتعلة', 'Real metrics derived strictly from persisted database records')}
      actions={
        <div className="flex items-center gap-1 p-1 bg-[#F6F5F1] rounded-lg">
          {(['ALL', 'HARDWARE', 'DEMO'] as const).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setSourceFilter(src)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors ${
                sourceFilter === src ? 'bg-white text-[#17211C] shadow-xs' : 'text-stone-600'
              }`}
            >
              {src === 'ALL' ? t('الكل', 'ALL') : src}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-6">
        {error && <ErrorState message={error} onRetry={() => void loadAnalytics(sourceFilter)} />}
        {loading && !data ? (
          <LoadingState />
        ) : data ? (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('إجمالي القراءات الصالحة', 'Valid Readings')}</span>
                <p className="font-mono text-2xl font-bold tabular-nums">{data.totalReadings}</p>
                <p className="text-[11px] font-mono text-stone-500">
                  HARDWARE: {data.hardwareReadingsCount} · DEMO: {data.demoReadingsCount}
                </p>
              </div>
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('توفر الأجهزة المتصلة', 'Device Uptime')}</span>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {data.deviceUptimeEstimatePercent !== null ? `${data.deviceUptimeEstimatePercent}%` : '—'}
                </p>
                <p className="text-[11px] text-stone-500">
                  {data.deviceUptimeEstimatePercent === null
                    ? t('لا توجد قراءات أجهزة كافية', 'Insufficient device telemetry')
                    : t(`الوضع النشط: ${config?.operatingMode || 'DEMO'}`, `Active mode: ${config?.operatingMode || 'DEMO'}`)}
                </p>
              </div>
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('معدل إكمال الصيانة', 'Maintenance Completion')}</span>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {data.maintenanceCompletionRatePercent !== null
                    ? `${data.maintenanceCompletionRatePercent}%`
                    : '—'}
                </p>
                <p className="text-[11px] font-mono text-stone-500">
                  {data.completedTasksCount}/{data.totalTasks} {t('مهام', 'tasks')}
                </p>
              </div>
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('متوسط زمن الاستجابة', 'Avg Response Time')}</span>
                <p className="font-mono text-2xl font-bold tabular-nums">
                  {data.averageResponseTimeMinutes !== null
                    ? `${data.averageResponseTimeMinutes} ${t('دقيقة', 'min')}`
                    : '—'}
                </p>
                <p className="text-[11px] text-stone-500">
                  {data.averageResponseTimeMinutes === null
                    ? t('يتطلب إكمال مهمة واحدة على الأقل', 'Requires completed tasks with timestamps')
                    : t('محسوب من الطوابع الزمنية الفعلية', 'Computed from task timestamps')}
                </p>
              </div>
            </section>

            <div className="grid lg:grid-cols-2 gap-6">
              <section className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                <h2 className="font-display font-bold text-base text-[#141E18]">
                  {t('اتجاهات مستويات الامتلاء', 'Fill Level Trends')}
                </h2>
                {fillChartData.length === 0 ? (
                  <EmptyState
                    title={t('بيانات غير كافية للرسم البياني', 'Insufficient Trend Data')}
                    description={t('لم تُسجل قراءات في قاعدة البيانات ضمن هذا المصدر بعد.', 'No readings stored for this source yet.')}
                  />
                ) : (
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fillChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF1ED" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="fill"
                          stroke="#14532D"
                          fill="#15803D"
                          fillOpacity={0.18}
                          name={t('الامتلاء %', 'Fill %')}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
                <h2 className="font-display font-bold text-base text-[#17211C]">
                  {t('توزيع بلاغات المواطنين حسب النوع', 'Citizen Reports by Category')}
                </h2>
                {reportChartData.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد بلاغات مسجلة بعد', 'No Citizen Reports Yet')}
                    description={t('سيظهر توزيع البلاغات هنا فور استقبال أول بلاغ.', 'Category distribution appears once reports are submitted.')}
                  />
                ) : (
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E6E1" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#14532D" radius={[4, 4, 0, 0]} name={t('العدد', 'Count')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
                <h2 className="font-display font-bold text-base text-[#17211C]">
                  {t('البلاغات حسب الحالة', 'Reports by Status')}
                </h2>
                {reportStatusChartData.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد بيانات حالية', 'No Current Data')}
                    description={t('تظهر حالات البلاغات فور تسجيل بلاغات.', 'Status counts appear once reports exist.')}
                  />
                ) : (
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportStatusChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E6E1" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#15803D" radius={[4, 4, 0, 0]} name={t('العدد', 'Count')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
                <h2 className="font-display font-bold text-base text-[#17211C]">
                  {t('تطور البلاغات عبر الأيام', 'Reports Over Time')}
                </h2>
                {reportTimeChartData.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد بيانات حالية', 'No Current Data')}
                    description={t('يظهر التسلسل الزمني للبلاغات فور تسجيل بلاغات.', 'Time trend appears once reports exist.')}
                  />
                ) : (
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportTimeChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E6E1" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#14532D"
                          fill="#15803D"
                          fillOpacity={0.18}
                          name={t('البلاغات', 'Reports')}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
