import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, ErrorState, FillProgressBar, LoadingState } from '../components/common/StateViews';
import {
  AlertSeverityLabel,
  AlertStatusLabel,
  DeviceStatusLabel,
  OperationalBinLabel,
  SourceTag,
  TaskStatusLabel,
} from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { SensorReading } from '../types/domain';
import { formatDateTime, formatShortTime } from '../utils/i18n';

export function BinDetailsPage() {
  const { binId } = useParams<{ binId: string }>();
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { bins, devices, alerts, tasks, config, refreshAll } = useRealtime();

  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const isIoTOperatorOrAbove =
    profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR' || profile?.role === 'OPERATOR';
  const bin = bins.find((b) => b.id === binId);
  const device = devices.find((d) => d.id === bin?.deviceId);
  const binAlerts = alerts.filter((a) => a.binId === binId);
  const binTasks = tasks.filter((tk) => tk.binId === binId);

  useEffect(() => {
    if (!binId || !isIoTOperatorOrAbove) {
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    apiRequest<{ readings: SensorReading[] }>(`/api/iot/bins/${binId}/readings?limit=60`)
      .then((res) => setHistory(res.readings))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [binId, isIoTOperatorOrAbove, bin?.lastReadingAt]);

  const handleEmptyBin = async () => {
    if (!bin) return;
    setActionMsg(null);
    try {
      await apiRequest(`/api/iot/bins/${bin.id}/empty`, { method: 'POST' });
      setActionMsg(t('تم تسجيل تفريغ الحاوية بنجاح.', 'Bin emptied successfully.'));
      await refreshAll();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : t('تعذر تسجيل التفريغ.', 'Failed.'));
    }
  };

  if (!bin) {
    return (
      <DashboardLayout title={t('تفاصيل الحاوية', 'Bin Details')}>
        <ErrorState
          message={t('الحاوية المطلوبة غير موجودة أو لم يتم تحميلها بعد.', 'Requested bin not found.')}
          onRetry={() => void refreshAll()}
        />
      </DashboardLayout>
    );
  }

  const hasData = Boolean(bin.lastReadingAt);
  const chartData = [...history]
    .reverse()
    .map((r) => ({
      time: formatShortTime(r.receivedAt, lang),
      fill: r.fillPercentage,
      distance: r.distanceCm,
    }));

  return (
    <DashboardLayout
      title={bin.name}
      subtitle={`${bin.id} · ${bin.locationDescription}`}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEmptyBin}
            className="px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
          >
            {t('تسجيل تفريغ الحاوية', 'Record Emptying')}
          </button>
          <Link
            to="/bins"
            className="px-3 py-2 text-xs font-medium bg-white border border-[#E2E6E1] rounded-lg hover:bg-stone-50"
          >
            {t('كل الحاويات', 'All Bins')}
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {actionMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
            {actionMsg}
          </div>
        )}

        {/* Top Summary Metrics */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-2">
            <p className="text-xs text-stone-500">{t('نسبة الامتلاء الحالية', 'Current Fill')}</p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-[#17211C]">
                {hasData ? `${bin.currentFillPercentage}%` : t('لا توجد بيانات حالية', 'No current data')}
              </span>
              <OperationalBinLabel bin={bin} />
            </div>
            {hasData && (
              <FillProgressBar
                percentage={bin.currentFillPercentage}
                warningThreshold={config?.warningThresholdPercent}
                criticalThreshold={config?.criticalThresholdPercent}
              />
            )}
          </div>

          <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-1.5">
            <p className="text-xs text-stone-500">{t('قياس المسافة المقروء', 'Measured Distance')}</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#17211C]">
              {hasData && bin.lastDistanceCm !== undefined
                ? `${bin.lastDistanceCm} cm`
                : t('لا توجد بيانات حالية', 'No current data')}
            </p>
            <p className="text-xs text-stone-500 font-mono tabular-nums">
              {t('معايرة:', 'Calib:')} {bin.emptyDistanceCm}cm → {bin.fullDistanceCm}cm
            </p>
          </div>

          <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-1.5">
            <p className="text-xs text-stone-500">{t('الجهاز والحساس المرتبط', 'Assigned Node & Sensor')}</p>
            <p className="font-mono text-base font-bold text-[#17211C]">{device?.id || '—'}</p>
            {device && (
              <div className="space-y-1">
                <DeviceStatusLabel status={device.connectionStatus} />
                <p className="text-[11px] font-mono text-stone-500">
                  {device.deviceType} · {device.sensorModel || 'HC-SR04'}
                  {device.lastSignalStrength !== undefined ? ` · ${device.lastSignalStrength} dBm` : ''}
                </p>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-1.5">
            <p className="text-xs text-stone-500">{t('آخر اتصال وتواصل', 'Last Communication')}</p>
            <p className="font-mono text-xs font-semibold tabular-nums text-[#17211C]">
              {hasData ? formatDateTime(bin.lastReadingAt, lang) : t('لا توجد بيانات حالية', 'No current data')}
            </p>
            <SourceTag source={bin.lastReadingSource} />
          </div>
        </section>

        {/* Chart */}
        {isIoTOperatorOrAbove && (
          <section className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#17211C]">
              {t('السجل التاريخي لنسبة الامتلاء', 'Historical Fill Level Chart')}
            </h2>
            {loadingHistory ? (
              <LoadingState />
            ) : chartData.length === 0 ? (
              <EmptyState
                title={t('لا توجد قراءات تاريخية بعد', 'No Reading History Yet')}
                description={t('ستظهر المنحنيات البيانية تلقائياً عند وصول قراءات جديدة من الجهاز أو المحاكي.', 'Charts populate as sensor readings arrive.')}
              />
            ) : (
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6E1" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="fill"
                      stroke="#14532D"
                      fill="#15803D"
                      fillOpacity={0.18}
                      strokeWidth={2}
                      name={t('الامتلاء %', 'Fill %')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        {/* Reading History & Alerts */}
        <div className="grid lg:grid-cols-12 gap-6">
          {isIoTOperatorOrAbove && (
            <section className="lg:col-span-7 bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
              <h2 className="font-display text-base font-bold text-[#17211C]">
                {t('سجل القراءات التفصيلي', 'Reading History')}
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-stone-500">{t('لا توجد قراءات مسجلة.', 'No readings recorded.')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E6E1] text-stone-500">
                        <th className="py-2 text-start font-medium">#</th>
                        <th className="py-2 text-start font-medium">{t('الامتلاء', 'Fill')}</th>
                        <th className="py-2 text-start font-medium">{t('المسافة', 'Distance')}</th>
                        <th className="py-2 text-start font-medium">{t('الإشارة', 'RSSI')}</th>
                        <th className="py-2 text-start font-medium">{t('المصدر', 'Source')}</th>
                        <th className="py-2 text-start font-medium">{t('الوقت', 'Time')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E6E1]">
                      {history.slice(0, 15).map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 font-mono tabular-nums text-stone-500">{r.sequenceNumber}</td>
                          <td className="py-2 font-mono font-bold tabular-nums">{r.fillPercentage}%</td>
                          <td className="py-2 font-mono tabular-nums">{r.distanceCm} cm</td>
                          <td className="py-2 font-mono tabular-nums">{r.signalStrength} dBm</td>
                          <td className="py-2"><SourceTag source={r.source} /></td>
                          <td className="py-2 font-mono tabular-nums text-stone-500">{formatDateTime(r.receivedAt, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className={`${isIoTOperatorOrAbove ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-6`}>
            {isIoTOperatorOrAbove && (
              <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-3">
                <h2 className="font-display text-base font-bold text-[#17211C]">
                  {t('سجل تنبيهات الحاوية', 'Bin Alerts')}
                </h2>
                {binAlerts.length === 0 ? (
                  <p className="text-xs text-stone-500">{t('لا توجد تنبيهات مسجلة لهذه الحاوية.', 'No alerts for this bin.')}</p>
                ) : (
                  <div className="divide-y divide-[#E2E6E1]">
                    {binAlerts.slice(0, 6).map((a) => (
                      <div key={a.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <AlertSeverityLabel severity={a.severity} />
                          <AlertStatusLabel status={a.status} />
                        </div>
                        <p className="text-xs text-[#17211C]">{a.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-[#17211C]">
                {t('سجل مهام الصيانة المرتبطة', 'Maintenance History')}
              </h2>
              {binTasks.length === 0 ? (
                <p className="text-xs text-stone-500">{t('لا توجد مهام صيانة مسجلة لهذه الحاوية.', 'No maintenance tasks for this bin.')}</p>
              ) : (
                <div className="divide-y divide-[#E2E6E1]">
                  {binTasks.map((tk) => (
                    <div key={tk.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#17211C]">{tk.title}</span>
                        <TaskStatusLabel status={tk.status} />
                      </div>
                      <p className="text-xs text-stone-500">{formatDateTime(tk.createdAt, lang)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
