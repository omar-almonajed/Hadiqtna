import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DemoControlPanel } from '../components/dashboard/DemoControlPanel';
import { EmptyState, FillProgressBar } from '../components/common/StateViews';
import {
  AlertSeverityLabel,
  BinStatusLabel,
  DeviceStatusLabel,
  SourceTag,
} from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { classifyLedState } from '../utils/calibration';
import { formatDateTime, formatShortTime } from '../utils/i18n';

export function MonitoringPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { bins, devices, readings, alerts, config, connectionState } = useRealtime();
  const isSupervisorOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';

  const primaryBin = bins[0];
  const primaryDevice = devices.find((d) => d.binId === primaryBin?.id) || devices[0];
  const activeMode = config?.operatingMode || 'DEMO';

  // Filter live readings to the active operating mode so HARDWARE mode never shows DEMO ticks
  const modeReadings = readings.filter((r) => r.source === activeMode);
  const latestReading = modeReadings[0];
  const activeAlerts = alerts.filter((a) => a.status !== 'RESOLVED');

  const chartData = [...modeReadings]
    .slice(0, 30)
    .reverse()
    .map((r) => ({
      time: formatShortTime(r.receivedAt, lang),
      fill: r.fillPercentage,
      distance: r.distanceCm,
    }));

  const led = classifyLedState(primaryBin?.currentFillPercentage ?? 0);

  return (
    <DashboardLayout
      title={t('شاشة المراقبة الحية', 'Live Telemetry Monitoring')}
      subtitle={t('تحديث لحظي فوري من الخادم وقواعد Firestore دون محاكاة زائفة في وضع العتاد', 'Real-time updates via Firestore & authenticated SSE stream')}
    >
      <div className="space-y-6">
        {isSupervisorOrAdmin && <DemoControlPanel />}

        {primaryBin && (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Live Gauge & LED Mirror */}
            <section className="lg:col-span-5 bg-white border border-[#E2E6E1] rounded-lg p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-bold text-base text-[#17211C]">{primaryBin.name}</h2>
                  <p className="text-xs text-stone-500">{primaryBin.locationDescription}</p>
                </div>
                <SourceTag source={activeMode} />
              </div>

              <div className="bg-[#F6F5F1] border border-[#E2E6E1] rounded-lg p-5 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-stone-600">{t('نسبة الامتلاء الحالية', 'Live Fill Percentage')}</span>
                  <BinStatusLabel status={primaryBin.status} />
                </div>
                <p className="font-mono text-4xl sm:text-5xl font-bold tabular-nums text-[#17211C]">
                  {primaryBin.lastReadingAt
                    ? `${primaryBin.currentFillPercentage}%`
                    : t('لا توجد بيانات حالية', 'No current data')}
                </p>
                {primaryBin.lastReadingAt && (
                  <FillProgressBar
                    percentage={primaryBin.currentFillPercentage}
                    warningThreshold={config?.warningThresholdPercent}
                    criticalThreshold={config?.criticalThresholdPercent}
                  />
                )}
                <div className="flex items-center justify-between text-xs text-stone-500 font-mono tabular-nums pt-1">
                  <span>
                    {t('المسافة:', 'Distance:')}{' '}
                    {primaryBin.lastReadingAt && primaryBin.lastDistanceCm !== undefined
                      ? `${primaryBin.lastDistanceCm} cm`
                      : t('لا توجد بيانات حالية', 'No current data')}
                  </span>
                  <span>
                    LED:{' '}
                    <strong
                      className={
                        !primaryBin.lastReadingAt
                          ? 'text-stone-500'
                          : led === 'RED'
                            ? 'text-red-700'
                            : led === 'YELLOW'
                              ? 'text-amber-700'
                              : 'text-emerald-800'
                      }
                    >
                      {primaryBin.lastReadingAt ? led : '—'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Device Telemetry Details */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#E2E6E1]">
                <div>
                  <span className="text-stone-500 block">{t('الجهاز', 'Device')}</span>
                  <span className="font-mono font-semibold text-[#17211C]">
                    {primaryDevice?.id || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block">{t('حالة الجهاز', 'Device Status')}</span>
                  {primaryDevice ? <DeviceStatusLabel status={primaryDevice.connectionStatus} /> : '—'}
                </div>
                <div>
                  <span className="text-stone-500 block">{t('حالة البث المباشر', 'Stream')}</span>
                  <span className="font-mono text-[#17211C]">{connectionState}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">{t('آخر قراءة مستلمة', 'Last Reading')}</span>
                  <span className="font-mono tabular-nums text-[#17211C]">
                    {latestReading ? formatDateTime(latestReading.receivedAt, lang) : t('لا توجد قراءة بعد', 'Waiting')}
                  </span>
                </div>
              </div>
            </section>

            {/* Real-time Chart */}
            <section className="lg:col-span-7 bg-white border border-[#E2E6E1] rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-[#17211C]">
                  {t(`المخطط اللحظي للقراءات (${activeMode})`, `Live Fill Telemetry (${activeMode})`)}
                </h2>
                <span className="font-mono text-xs text-stone-500 tabular-nums">
                  {modeReadings.length} {t('قراءة', 'readings')}
                </span>
              </div>

              {chartData.length === 0 ? (
                <EmptyState
                  title={
                    activeMode === 'HARDWARE'
                      ? t('بانتظار قراءات حقيقية من ESP32', 'Waiting for Real ESP32 Hardware Readings')
                      : t('لا توجد قراءات محاكاة بعد', 'No Simulated Readings Yet')
                  }
                  description={
                    activeMode === 'HARDWARE'
                      ? t(
                          'في وضع HARDWARE لا يتم توليد بيانات وهمية. أرسل قراءة عبر POST /api/iot/readings من وحدة ESP32 لتظهر هنا فوراً.',
                          'HARDWARE mode never fabricates readings. Post an authenticated reading from your ESP32 to see live updates.'
                        )
                      : t('حرّك شريط المحاكاة أعلاه لإرسال قراءات تجريبية فورية.', 'Use the DEMO simulator above to push test readings.')
                  }
                />
              ) : (
                <div className="h-72 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E6E1" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="fill"
                        stroke="#14532D"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        name={t('نسبة الامتلاء %', 'Fill %')}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Active Alerts Panel */}
        <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-3">
          <h2 className="font-display font-bold text-base text-[#17211C]">
            {t('لوحة التنبيهات النشطة', 'Active Alert Panel')}
          </h2>
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-stone-500">
              {t('لا توجد تنبيهات نشطة في الوقت الحالي.', 'No active alerts at this moment.')}
            </p>
          ) : (
            <div className="divide-y divide-[#E2E6E1]">
              {activeAlerts.map((alert) => (
                <div key={alert.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <AlertSeverityLabel severity={alert.severity} />
                      <SourceTag source={alert.source} />
                    </div>
                    <p className="text-sm text-[#17211C]">{alert.message}</p>
                  </div>
                  <span className="font-mono text-xs text-stone-500 tabular-nums">
                    {formatDateTime(alert.createdAt, lang)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
