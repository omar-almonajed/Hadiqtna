import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { EmptyState } from '../components/common/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import type { NotificationType, StaffNotification } from '../types/domain';
import { formatDateTime, NOTIFICATION_TYPE_LABELS } from '../utils/i18n';

function getNotificationTargetRoute(n: StaffNotification): string | null {
  if (n.relatedCollection === 'citizenReports') return '/reports';
  if (n.relatedCollection === 'maintenanceTasks') return '/maintenance';
  if (n.relatedCollection === 'bins' && n.relatedId) return `/bins/${n.relatedId}`;
  if (n.relatedCollection === 'devices') return '/devices';
  return null;
}

export function NotificationsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useRealtime();

  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | NotificationType>('ALL');

  const isUnread = (n: StaffNotification) =>
    !n.isRead && !(profile?.uid && (n.readBy ?? []).includes(profile.uid));

  const filtered = notifications.filter((n) => {
    if (filter === 'ALL') return true;
    if (filter === 'UNREAD') return isUnread(n);
    return n.type === filter;
  });

  const filterTabs: Array<{ key: 'ALL' | 'UNREAD' | NotificationType; label: string }> = [
    { key: 'ALL', label: t('الكل', 'All') },
    { key: 'UNREAD', label: `${t('غير مقروءة', 'Unread')} (${unreadNotificationsCount})` },
    { key: 'NEW_REPORT', label: NOTIFICATION_TYPE_LABELS.NEW_REPORT[lang] },
    { key: 'BIN_HIGH_FILL', label: NOTIFICATION_TYPE_LABELS.BIN_HIGH_FILL[lang] },
    { key: 'SENSOR_OFFLINE', label: NOTIFICATION_TYPE_LABELS.SENSOR_OFFLINE[lang] },
    { key: 'TASK_ASSIGNED', label: NOTIFICATION_TYPE_LABELS.TASK_ASSIGNED[lang] },
    { key: 'REPORT_STATUS_UPDATED', label: NOTIFICATION_TYPE_LABELS.REPORT_STATUS_UPDATED[lang] },
  ];

  return (
    <DashboardLayout
      title={t('مركز الإشعارات الفورية', 'Notifications Center')}
      subtitle={t(
        'تنبيهات البلاغات الجديدة وامتلاء الحاويات وانقطاع الحساسات وإسناد المهام',
        'Live alerts for citizen reports, high bin levels, offline sensors, and task assignments'
      )}
      actions={
        unreadNotificationsCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllNotificationsRead()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4" />
            <span>{t('تحديد الكل كمقروء', 'Mark all read')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="bg-white border border-[#E2E6E1] rounded-xl p-2.5 flex flex-wrap items-center gap-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                filter === tab.key
                  ? 'bg-[#14532D] text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('لا توجد إشعارات ضمن هذا التصنيف', 'No Notifications Found')}
            description={t(
              'ستصل الإشعارات تلقائياً فور وصول بلاغ جديد أو قراءة حساس مرتفعة أو إسناد مهمة.',
              'Notifications appear automatically on new reports, high fill readings, or task assignments.'
            )}
          />
        ) : (
          <div className="bg-white border border-[#E2E6E1] rounded-xl divide-y divide-[#E2E6E1]">
            {filtered.map((n) => {
              const unread = isUnread(n);
              const targetRoute = getNotificationTargetRoute(n);
              return (
                <div
                  key={n.id}
                  className={`p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4 transition-colors ${
                    unread ? 'bg-emerald-50/40' : 'bg-white'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Bell
                        className={`w-3.5 h-3.5 shrink-0 ${
                          unread ? 'text-[#14532D]' : 'text-stone-400'
                        }`}
                      />
                      <span className="font-semibold text-[#14532D]">
                        {NOTIFICATION_TYPE_LABELS[n.type]?.[lang] || n.type}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-stone-500 tabular-nums">
                        {formatDateTime(n.createdAt, lang)}
                      </span>
                      {unread && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[11px] font-semibold text-emerald-800">
                            {t('جديد', 'Unread')}
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="font-display text-sm sm:text-base font-bold text-[#17211C]">
                      {n.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-600">{n.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {unread && (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(n.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('تمت القراءة', 'Mark Read')}</span>
                      </button>
                    )}
                    {targetRoute && (
                      <button
                        type="button"
                        onClick={() => {
                          if (unread) void markNotificationRead(n.id);
                          navigate(targetRoute);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                      >
                        <span>{t('فتح', 'Open')}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
