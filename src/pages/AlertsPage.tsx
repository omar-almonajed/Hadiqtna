import { useState } from 'react';
import { Check, CheckCheck, Search } from 'lucide-react';
import { EmptyState } from '../components/common/StateViews';
import {
  AlertSeverityLabel,
  AlertStatusLabel,
  SourceTag,
} from '../components/common/StatusText';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { AlertStatus } from '../types/domain';
import { ALERT_TYPE_LABELS, formatDateTime } from '../utils/i18n';

export function AlertsPage() {
  const { lang, t } = useLanguage();
  const { alerts, refreshAll } = useRealtime();

  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = alerts.filter((a) => {
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      a.message.toLowerCase().includes(q) ||
      a.binId.toLowerCase().includes(q) ||
      a.deviceId.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleAcknowledge = async (id: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/alerts/${id}/acknowledge`, { method: 'POST' });
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر الإقرار بالتنبيه.', 'Acknowledge failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResolve = async (id: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/alerts/${id}/resolve`, { method: 'POST' });
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر إغلاق التنبيه.', 'Resolve failed.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout
      title={t('التنبيهات وسجل الإنذار', 'Alerts & Threshold Engine')}
      subtitle={t('متابعة تنبيهات الامتلاء (≥ 80%) وانقطاع الأجهزة والإقرار بمعالجتها', 'Manage 80%/95%/100% capacity warnings and device offline alerts')}
    >
      <div className="space-y-6">
        {feedback && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            {feedback}
          </div>
        )}

        <div className="bg-white border border-[#E2E6E1] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('ابحث في التنبيهات أو معرّف الحاوية...', 'Search alerts, bin ID, or device ID...')}
              className="w-full ps-9 pe-3 py-2 text-sm border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F5F1] rounded-lg">
            {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st ? 'bg-white text-[#17211C] shadow-xs' : 'text-stone-600'
                }`}
              >
                {st === 'ALL'
                  ? t('الكل', 'All')
                  : st === 'ACTIVE'
                    ? t('نشط', 'Active')
                    : st === 'ACKNOWLEDGED'
                      ? t('تم الإقرار', 'Acknowledged')
                      : t('محلول', 'Resolved')}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('لا توجد تنبيهات مطابقة', 'No Alerts Found')}
            description={t('لم يتم تسجيل تنبيهات ضمن هذا التصنيف حتى الآن.', 'No alerts match your current filter.')}
          />
        ) : (
          <div className="bg-white border border-[#E2E6E1] rounded-lg divide-y divide-[#E2E6E1]">
            {filtered.map((alert) => (
              <div key={alert.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <AlertSeverityLabel severity={alert.severity} />
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-stone-700">{ALERT_TYPE_LABELS[alert.type][lang]}</span>
                    <span aria-hidden="true">·</span>
                    <AlertStatusLabel status={alert.status} />
                    <SourceTag source={alert.source} />
                  </div>
                  <p className="text-sm font-medium text-[#17211C]">{alert.message}</p>
                  <p className="text-xs text-stone-500 font-mono tabular-nums">
                    {alert.binId} · {alert.deviceId} · {formatDateTime(alert.createdAt, lang)}
                    {alert.acknowledgedBy && ` · ${t('أقرّ به:', 'Ack by:')} ${alert.acknowledgedBy}`}
                    {alert.resolvedAt && ` · ${t('حُلّ في:', 'Resolved:')} ${formatDateTime(alert.resolvedAt, lang)}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'ACTIVE' && (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => void handleAcknowledge(alert.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('إقرار', 'Acknowledge')}</span>
                    </button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={() => void handleResolve(alert.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{t('إغلاق وحل', 'Resolve')}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
