import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CheckCheck,
  Cpu,
  FileWarning,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Trash2,
  Trees,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import type { StaffNotification, UserRole } from '../types/domain';
import { formatShortTime, NOTIFICATION_TYPE_LABELS, ROLE_LABELS } from '../utils/i18n';

interface NavItem {
  to: string;
  labelAr: string;
  labelEn: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  group: 'WORKSPACE' | 'IOT' | 'SERVICE' | 'ADMIN';
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/staff',
    labelAr: 'واجهة الموظف',
    labelEn: 'Staff Workspace',
    icon: Briefcase,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'WORKSPACE',
  },
  {
    to: '/dashboard',
    labelAr: 'لوحة القيادة',
    labelEn: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    group: 'WORKSPACE',
  },
  {
    to: '/bins',
    labelAr: 'الحاويات الذكية',
    labelEn: 'Smart Bins',
    icon: Trash2,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'IOT',
  },
  {
    to: '/monitoring',
    labelAr: 'المراقبة الحية',
    labelEn: 'Live Monitor',
    icon: Activity,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    group: 'IOT',
  },
  {
    to: '/devices',
    labelAr: 'أجهزة IoT',
    labelEn: 'IoT Devices',
    icon: Cpu,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    group: 'IOT',
  },
  {
    to: '/alerts',
    labelAr: 'تنبيهات العتبة',
    labelEn: 'Alerts',
    icon: AlertTriangle,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    group: 'IOT',
  },
  {
    to: '/reports',
    labelAr: 'بلاغات المواطنين',
    labelEn: 'Citizen Reports',
    icon: FileWarning,
    roles: ['ADMIN', 'SUPERVISOR'],
    group: 'SERVICE',
  },
  {
    to: '/maintenance',
    labelAr: 'الصيانة والمهام',
    labelEn: 'Maintenance',
    icon: Wrench,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'SERVICE',
  },
  {
    to: '/notifications',
    labelAr: 'الإشعارات',
    labelEn: 'Notifications',
    icon: Bell,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'SERVICE',
  },
  {
    to: '/parks',
    labelAr: 'حدائق دمشق',
    labelEn: 'Damascus Parks',
    icon: Trees,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'ADMIN',
  },
  {
    to: '/analytics',
    labelAr: 'التحليلات',
    labelEn: 'Analytics',
    icon: BarChart3,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    group: 'ADMIN',
  },
  {
    to: '/settings',
    labelAr: 'الإعدادات',
    labelEn: 'Settings',
    icon: Settings,
    roles: ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER'],
    group: 'ADMIN',
  },
];

function getNotificationTargetRoute(n: StaffNotification): string {
  if (n.relatedCollection === 'citizenReports') return '/reports';
  if (n.relatedCollection === 'maintenanceTasks') return '/maintenance';
  if (n.relatedCollection === 'bins' && n.relatedId) return `/bins/${n.relatedId}`;
  return '/notifications';
}

export function DashboardLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { profile, logout } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const {
    config,
    connectionState,
    lastUpdatedAt,
    alerts,
    reports,
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useRealtime();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();

  const visibleNav = NAV_ITEMS.filter((item) => profile && item.roles.includes(profile.role));
  const activeAlertCount = alerts.filter((a) => a.status !== 'RESOLVED').length;
  const newReportsCount = reports.filter((r) => r.status === 'NEW').length;

  const groups: Array<{ key: NavItem['group']; labelAr: string; labelEn: string }> = [
    { key: 'WORKSPACE', labelAr: 'العمليات الرئيسية', labelEn: 'Workspace' },
    { key: 'IOT', labelAr: 'الحاويات الذكية', labelEn: 'Smart Waste IoT' },
    { key: 'SERVICE', labelAr: 'البلاغات والصيانة', labelEn: 'Service & Field' },
    { key: 'ADMIN', labelAr: 'الإدارة والتقارير', labelEn: 'Administration' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col lg:flex-row">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Desktop-First Municipal Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 inset-y-0 start-0 z-50 w-64 h-screen shrink-0 bg-[#0F291E] text-[#E6ECE7] flex flex-col border-e border-[#1C4030] transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen
            ? 'translate-x-0'
            : lang === 'ar'
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 h-16 border-b border-[#1C4030] flex items-center justify-between shrink-0">
          <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="w-8 h-8 rounded-lg bg-[#15803D] flex items-center justify-center text-white font-bold text-sm">
              ح
            </span>
            <span className="font-display font-bold text-lg text-white tracking-tight">
              {t('حديقتنا', 'Hadiqtna')}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-stone-300 hover:text-white"
            aria-label={t('إغلاق القائمة', 'Close navigation')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label={t('القائمة الرئيسية', 'Main Navigation')}>
          {groups.map((grp) => {
            const items = visibleNav.filter((item) => item.group === grp.key);
            if (items.length === 0) return null;
            return (
              <div key={grp.key} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-[#7E9B89]">
                  {lang === 'ar' ? grp.labelAr : grp.labelEn}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-[#1B4A34] text-white'
                            : 'text-[#C2D1C8] hover:bg-[#163A29] hover:text-white'
                        }`
                      }
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{lang === 'ar' ? item.labelAr : item.labelEn}</span>
                      </span>
                      {item.to === '/alerts' && activeAlertCount > 0 && (
                        <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
                          {activeAlertCount}
                        </span>
                      )}
                      {item.to === '/reports' && newReportsCount > 0 && (
                        <span className="font-mono text-xs font-bold text-emerald-300 tabular-nums">
                          {newReportsCount}
                        </span>
                      )}
                      {item.to === '/notifications' && unreadNotificationsCount > 0 && (
                        <span className="font-mono text-xs font-bold text-emerald-300 tabular-nums">
                          {unreadNotificationsCount}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1C4030] space-y-3 shrink-0">
          {profile && (
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-white truncate">{profile.fullName}</p>
              <p className="text-[#9AB0A2] truncate">{ROLE_LABELS[profile.role][lang]}</p>
            </div>
          )}
          <Link
            to="/guide"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium bg-[#163A29] hover:bg-[#1F4F38] text-[#D7E3DC] rounded-lg transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t('دليل استخدام المنصة', 'Platform Usage Guide')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-[#163A29] hover:bg-[#1F4F38] text-[#D7E3DC] rounded-lg transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#163A29] hover:bg-red-900/70 text-[#D7E3DC] hover:text-white rounded-lg transition-colors whitespace-nowrap"
              title={t('تسجيل الخروج', 'Sign out')}
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('خروج', 'Exit')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white border-b border-[#E2E6E1] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ms-2 text-stone-700 hover:bg-stone-100 rounded-lg"
              aria-label={t('فتح القائمة', 'Open menu')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#141E18] truncate">
                {title}
              </h1>
              {subtitle && <p className="text-xs text-stone-500 truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden xl:flex items-center gap-2 text-xs text-stone-500">
              <span className="font-medium text-stone-700">
                {connectionState === 'CONNECTED'
                  ? t('متصل لحظياً', 'Live Connected')
                  : connectionState === 'RECONNECTING'
                    ? t('إعادة الاتصال...', 'Reconnecting...')
                    : t('جارٍ الاتصال', 'Connecting')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatShortTime(lastUpdatedAt ?? undefined, lang)}
              </span>
            </div>

            {/* Notification Bell Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg border border-[#E2E6E1] text-stone-700 hover:bg-stone-50 transition-colors"
                aria-label={t('الإشعارات', 'Notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute end-0 mt-2 w-80 sm:w-96 bg-white border border-[#E2E6E1] rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#E2E6E1] flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-[#141E18]">
                      {t('مركز الإشعارات', 'Notifications')} ({unreadNotificationsCount})
                    </span>
                    {unreadNotificationsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#14532D] hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>{t('تحديد الكل كمقروء', 'Mark all read')}</span>
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#E2E6E1]">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-stone-500">
                        {t('لا توجد إشعارات حالياً.', 'No notifications yet.')}
                      </p>
                    ) : (
                      notifications.slice(0, 6).map((n) => {
                        const isUnread =
                          !n.isRead && !(profile?.uid && (n.readBy ?? []).includes(profile.uid));
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              if (isUnread) void markNotificationRead(n.id);
                              navigate(getNotificationTargetRoute(n));
                            }}
                            className={`w-full text-start p-3.5 hover:bg-stone-50 transition-colors space-y-1 ${
                              isUnread ? 'bg-emerald-50/40' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-[#14532D]">
                                {NOTIFICATION_TYPE_LABELS[n.type]?.[lang] || n.type}
                              </span>
                              <span className="font-mono text-stone-400 tabular-nums">
                                {formatShortTime(n.createdAt, lang)}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-[#141E18]">{n.title}</p>
                            <p className="text-[11px] text-stone-600 line-clamp-2">{n.message}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <Link
                    to="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block px-4 py-2.5 text-center text-xs font-semibold text-[#14532D] bg-[#F7F8F6] border-t border-[#E2E6E1] hover:bg-stone-200/50"
                  >
                    {t('عرض جميع الإشعارات', 'View all notifications')}
                  </Link>
                </div>
              )}
            </div>

            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        </header>

        {/* Operating Mode Disclosure Strip */}
        {config && (
          <div
            className={`px-4 sm:px-6 py-2 text-xs border-b flex flex-wrap items-center justify-between gap-2 ${
              config.operatingMode === 'DEMO'
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <span className="font-mono font-bold">[{config.operatingMode}]</span>
              <span>
                {config.operatingMode === 'DEMO'
                  ? t(
                      'وضع المحاكاة (DEMO) مفعّل — القراءات التجريبية تحمل وسم DEMO ولا تمثل عتاداً فعلياً.',
                      'DEMO mode active — simulated readings carry the DEMO label.'
                    )
                  : t(
                      'وضع العتاد الحقيقي (HARDWARE) مفعّل — تُعرض قراءات ESP32 المصادق عليها فقط.',
                      'HARDWARE mode active — displaying authenticated ESP32 telemetry.'
                    )}
              </span>
            </div>
            {profile?.role === 'ADMIN' && (
              <Link
                to="/settings"
                className="underline font-semibold hover:opacity-80 whitespace-nowrap"
              >
                {t('الإعدادات', 'Settings')}
              </Link>
            )}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
