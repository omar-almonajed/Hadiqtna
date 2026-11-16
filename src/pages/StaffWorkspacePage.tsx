import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, Play, RefreshCw, Search, Trash2, Wrench, X } from 'lucide-react';
import { StaffAuthImage } from '../components/common/StaffAuthImage';
import { EmptyState, ErrorState, FillProgressBar, LoadingState } from '../components/common/StateViews';
import { OperationalBinLabel, PriorityLabel, TaskStatusLabel } from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { TaskStatus } from '../types/domain';
import { formatDateTime, ROLE_LABELS } from '../utils/i18n';

export function StaffWorkspacePage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { parks, bins, tasks, reports, config, unreadNotificationsCount, loading, error, refreshAll } =
    useRealtime();

  const [binSearch, setBinSearch] = useState('');
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [afterPhotosMap, setAfterPhotosMap] = useState<Record<string, File | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isFieldTech = profile?.role === 'WORKER' || profile?.role === 'MAINTENANCE';
  const isOperator = profile?.role === 'OPERATOR';

  const myTasks = tasks.filter((tk) =>
    isFieldTech ? tk.assignedTo === profile?.uid || !tk.assignedTo : true
  );
  const openTasks = myTasks.filter((tk) => !['COMPLETED', 'CANCELLED'].includes(tk.status));
  const completedTasksCount = myTasks.filter((tk) => tk.status === 'COMPLETED').length;

  const warningThreshold = config?.warningThresholdPercent ?? 80;
  const sortedBins = [...bins].sort((a, b) => {
    const aHas = a.lastReadingAt ? 1 : 0;
    const bHas = b.lastReadingAt ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.currentFillPercentage - a.currentFillPercentage;
  });
  const binsNeedingEmpty = sortedBins.filter(
    (b) => b.lastReadingAt && b.status !== 'OFFLINE' && b.currentFillPercentage >= warningThreshold
  );

  const query = binSearch.trim().toLowerCase();
  const visibleBins = sortedBins.filter((b) => {
    if (!query) return true;
    const park = parks.find((p) => p.id === b.parkId);
    return (
      b.name.toLowerCase().includes(query) ||
      b.id.toLowerCase().includes(query) ||
      b.locationDescription.toLowerCase().includes(query) ||
      (park?.name.toLowerCase().includes(query) ?? false) ||
      (park?.location.toLowerCase().includes(query) ?? false)
    );
  });

  const handleTaskStart = async (taskId: string, status: TaskStatus) => {
    setBusyId(taskId);
    setFeedback(null);
    try {
      await apiRequest(`/api/maintenance/${taskId}`, {
        method: 'PATCH',
        body: { status },
      });
      setFeedback(t('تم تحديث حالة المهمة إلى قيد التنفيذ.', 'Task marked as in progress.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحديث المهمة.', 'Failed to update task.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setBusyId(taskId);
    setFeedback(null);
    try {
      const formData = new FormData();
      const note = notesMap[taskId]?.trim();
      if (note) formData.append('completionNotes', note);
      const photo = afterPhotosMap[taskId];
      if (photo) formData.append('afterPhoto', photo);

      await apiRequest(`/api/maintenance/${taskId}/complete`, {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
      setAfterPhotosMap((prev) => ({ ...prev, [taskId]: null }));
      setFeedback(t('تم تأكيد إكمال المهمة الميدانية وإرفاق التوثيق بنجاح.', 'Task marked as completed.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر إتمام المهمة.', 'Failed to complete task.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleEmptyBin = async (binId: string, binName: string) => {
    setBusyId(binId);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/bins/${binId}/empty`, { method: 'POST' });
      setFeedback(t(`تم تسجيل تفريغ الحاوية (${binName}) بنجاح.`, `Emptying recorded for ${binName}.`));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تسجيل التفريغ.', 'Failed to record emptying.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout
      title={t('واجهة الموظف الميداني', 'Staff Daily Workbench')}
      subtitle={
        profile
          ? `${profile.fullName} · ${ROLE_LABELS[profile.role][lang]} — ${t('مهامك اليومية وحاويات حدائق دمشق', 'Your daily tasks and Damascus park bins')}`
          : t('مهام الصيانة ومتابعة حاويات حدائق دمشق', 'Maintenance tasks and Damascus park bins')
      }
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

        {feedback && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-950">
            {feedback}
          </div>
        )}

        {loading && bins.length === 0 ? (
          <LoadingState />
        ) : (
          <>
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('مهام تحتاج تنفيذاً', 'Open Tasks')}</span>
                <p className="font-mono text-2xl font-bold text-[#141E18] tabular-nums">{openTasks.length}</p>
              </div>
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t(`حاويات ≥ ${warningThreshold}%`, `Bins ≥ ${warningThreshold}%`)}</span>
                <p className={`font-mono text-2xl font-bold tabular-nums ${binsNeedingEmpty.length > 0 ? 'text-amber-700' : 'text-[#14532D]'}`}>
                  {binsNeedingEmpty.length}
                </p>
              </div>
              <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
                <span className="text-xs text-stone-500">{t('مهام منجزة', 'Completed Tasks')}</span>
                <p className="font-mono text-2xl font-bold text-[#14532D] tabular-nums">{completedTasksCount}</p>
              </div>
              <Link
                to="/notifications"
                className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1 hover:border-[#14532D] transition-colors"
              >
                <span className="text-xs text-stone-500">{t('إشعارات غير مقروءة', 'Unread Notifications')}</span>
                <p className={`font-mono text-2xl font-bold tabular-nums ${unreadNotificationsCount > 0 ? 'text-red-700' : 'text-[#141E18]'}`}>
                  {unreadNotificationsCount}
                </p>
              </Link>
            </section>

            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <section className="lg:col-span-6 bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E6E1]">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
                    <h2 className="font-display text-base font-bold text-[#141E18]">
                      {isFieldTech ? t('مهامي الميدانية', 'My Field Tasks') : t('مهام الصيانة النشطة', 'Active Maintenance Tasks')}
                    </h2>
                  </div>
                  <Link to="/maintenance" className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap">
                    {t('كل المهام', 'All Tasks')}
                  </Link>
                </div>

                {openTasks.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد مهام مفتوحة حالياً', 'No Open Tasks Right Now')}
                    description={t('جميع مهام الصيانة المسندة منجزة أو بانتظار مهام جديدة من المشرف.', 'All assigned tasks are completed or awaiting supervisor dispatch.')}
                  />
                ) : (
                  <div className="divide-y divide-[#E2E6E1]">
                    {openTasks.map((task) => {
                      const park = parks.find((p) => p.id === task.parkId);
                      const linkedReport = task.reportId ? reports.find((r) => r.id === task.reportId) : undefined;
                      const beforePhotos = linkedReport?.imageUrls?.length
                        ? linkedReport.imageUrls
                        : linkedReport?.imageUrl
                          ? [linkedReport.imageUrl]
                          : [];
                      const selectedPhoto = afterPhotosMap[task.id] ?? null;

                      return (
                        <div key={task.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <PriorityLabel priority={task.priority} />
                                <span aria-hidden="true">·</span>
                                <TaskStatusLabel status={task.status} />
                                {task.assignedTeam && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-stone-600">{task.assignedTeam}</span>
                                  </>
                                )}
                              </div>
                              <h3 className="text-sm font-bold text-[#141E18]">{task.title}</h3>
                              <p className="text-xs text-stone-500">
                                {park?.name || task.parkId}
                                {task.locationDescription ? ` · ${task.locationDescription}` : ''} · {formatDateTime(task.createdAt, lang)}
                              </p>
                            </div>
                          </div>

                          {task.description && (
                            <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                              {task.description}
                            </p>
                          )}

                          {beforePhotos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {beforePhotos.map((url) => (
                                <div key={url} className="w-24 h-16 rounded-lg overflow-hidden border border-[#E2E6E1]">
                                  <StaffAuthImage src={url} alt={task.title} className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}

                          {!isOperator && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={notesMap[task.id] ?? ''}
                                onChange={(e) =>
                                  setNotesMap((prev) => ({ ...prev, [task.id]: e.target.value }))
                                }
                                placeholder={t('ملاحظة الإنجاز (اختياري)...', 'Completion note (optional)...')}
                                className="flex-1 min-w-[150px] px-2.5 py-1.5 text-xs border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
                              />
                              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg cursor-pointer hover:bg-stone-50">
                                <Camera className="w-3.5 h-3.5 text-[#14532D]" />
                                <span>
                                  {selectedPhoto ? selectedPhoto.name.slice(0, 12) : t('صورة الإصلاح', 'Photo')}
                                </span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="sr-only"
                                  onChange={(e) =>
                                    setAfterPhotosMap((prev) => ({
                                      ...prev,
                                      [task.id]: e.target.files?.[0] ?? null,
                                    }))
                                  }
                                />
                              </label>
                              {task.status !== 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  disabled={busyId === task.id}
                                  onClick={() => void handleTaskStart(task.id, 'IN_PROGRESS')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50 disabled:opacity-50 whitespace-nowrap"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>{t('بدء التنفيذ', 'Start')}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === task.id}
                                onClick={() => void handleCompleteTask(task.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] disabled:opacity-50 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t('تم الإنجاز', 'Mark Done')}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="lg:col-span-6 bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E6E1]">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
                    <h2 className="font-display text-base font-bold text-[#141E18]">
                      {t('حاويات حدائق دمشق (أولوية التفريغ)', 'Damascus Park Bins (Emptying Priority)')}
                    </h2>
                  </div>
                  <Link to="/bins" className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap">
                    {t('كل الحاويات', 'All Bins')}
                  </Link>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="search"
                    value={binSearch}
                    onChange={(e) => setBinSearch(e.target.value)}
                    placeholder={t('ابحث بالحديقة أو موقع الحاوية في دمشق...', 'Search Damascus park or bin location...')}
                    className="w-full ps-9 pe-8 py-2 text-xs border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                  {binSearch && (
                    <button
                      type="button"
                      onClick={() => setBinSearch('')}
                      aria-label={t('مسح البحث', 'Clear search')}
                      className="absolute top-1/2 -translate-y-1/2 end-2.5 text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {visibleBins.length === 0 ? (
                  <EmptyState
                    title={t('لا توجد حاويات مطابقة للبحث', 'No Matching Bins')}
                    description={t('جرّب اسم حديقة أخرى في دمشق أو امسح البحث.', 'Try another Damascus park name or clear search.')}
                  />
                ) : (
                  <div className="divide-y divide-[#E2E6E1]">
                    {visibleBins.map((bin) => {
                      const park = parks.find((p) => p.id === bin.parkId);
                      const hasData = Boolean(bin.lastReadingAt);
                      return (
                        <div key={bin.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Link
                                to={`/bins/${bin.id}`}
                                className="text-sm font-semibold text-[#141E18] hover:text-[#14532D] hover:underline block"
                              >
                                {bin.name}
                              </Link>
                              <p className="text-xs text-stone-500">
                                {park ? `${park.name} · ` : ''}
                                {bin.locationDescription}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
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

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-[11px] font-mono text-stone-400 tabular-nums">
                              {t('آخر قراءة:', 'Last:')}{' '}
                              {hasData ? formatDateTime(bin.lastReadingAt, lang) : t('لا توجد بيانات حالية', 'No current data')}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === bin.id}
                              onClick={() => void handleEmptyBin(bin.id, bin.name)}
                              className="px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {t('تسجيل تفريغ الحاوية', 'Record Emptying')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
