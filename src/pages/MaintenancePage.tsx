import { useState, type FormEvent } from 'react';
import { CalendarClock, Camera, CheckCircle2, Play, Plus } from 'lucide-react';
import { StaffAuthImage } from '../components/common/StaffAuthImage';
import { EmptyState } from '../components/common/StateViews';
import { PriorityLabel, TaskStatusLabel } from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { PriorityLevel, TaskStatus } from '../types/domain';
import { formatDateTime, MAINTENANCE_TEAMS, PRIORITY_LABELS } from '../utils/i18n';

export function MaintenancePage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { tasks, parks, bins, staff, reports, refreshAll } = useRealtime();

  const isSupervisorOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';
  const isOperator = profile?.role === 'OPERATOR';
  const canMutateTasks = profile?.role !== 'OPERATOR';

  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parkId, setParkId] = useState(parks[0]?.id || 'park-alnakheel');
  const [binId, setBinId] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIUM');

  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [afterPhotosMap, setAfterPhotosMap] = useState<Record<string, File | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = tasks.filter((tk) => statusFilter === 'ALL' || tk.status === statusFilter);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusyId('create');
    setFeedback(null);
    try {
      await apiRequest('/api/maintenance', {
        method: 'POST',
        body: {
          parkId: parkId || parks[0]?.id || 'park-alnakheel',
          ...(binId ? { binId } : {}),
          ...(locationDescription.trim() ? { locationDescription: locationDescription.trim() } : {}),
          ...(assignedTo ? { assignedTo } : {}),
          ...(assignedTeam ? { assignedTeam } : {}),
          ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
          title,
          description,
          priority,
        },
      });
      setTitle('');
      setDescription('');
      setLocationDescription('');
      setAssignedTo('');
      setAssignedTeam('');
      setScheduledFor('');
      setShowCreate(false);
      setFeedback(t('تم إنشاء مهمة الصيانة بنجاح.', 'Maintenance task created.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر إنشاء المهمة.', 'Creation failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    patch: {
      status?: TaskStatus;
      assignedTo?: string;
      assignedTeam?: string;
      scheduledFor?: string;
      completionNotes?: string;
    }
  ) => {
    setBusyId(taskId);
    setFeedback(null);
    try {
      await apiRequest(`/api/maintenance/${taskId}`, {
        method: 'PATCH',
        body: patch,
      });
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحديث المهمة.', 'Update failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCompleteWithPhoto = async (taskId: string) => {
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
      setFeedback(t('تم توثيق إنجاز الصيانة وتحديث حالة البلاغ المرتبط تلقائياً.', 'Task completed and synced.'));
      setAfterPhotosMap((prev) => ({ ...prev, [taskId]: null }));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تأكيد إكمال المهمة.', 'Completion failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const tabs: Array<{ key: 'ALL' | TaskStatus; label: string; count: number }> = [
    { key: 'ALL', label: t('الكل', 'All'), count: tasks.length },
    { key: 'PENDING', label: t('مهام جديدة', 'New'), count: tasks.filter((x) => x.status === 'PENDING').length },
    { key: 'ASSIGNED', label: t('مهام مجدولة', 'Scheduled'), count: tasks.filter((x) => x.status === 'ASSIGNED').length },
    { key: 'IN_PROGRESS', label: t('قيد التنفيذ', 'In Progress'), count: tasks.filter((x) => x.status === 'IN_PROGRESS').length },
    { key: 'COMPLETED', label: t('منجزة', 'Completed'), count: tasks.filter((x) => x.status === 'COMPLETED').length },
    { key: 'CANCELLED', label: t('ملغاة', 'Cancelled'), count: tasks.filter((x) => x.status === 'CANCELLED').length },
  ];

  return (
    <DashboardLayout
      title={t('إدارة الصيانة والمهام', 'Maintenance & Field Work Orders')}
      subtitle={
        isSupervisorOrAdmin
          ? t('تنظيم مهام الصيانة الجديدة والمجدولة وإسناد الفرق وتوثيق الإصلاح بالصور', 'Organize work orders, assign field crews, and verify completion photos')
          : isOperator
            ? t('متابعة جدول مهام الصيانة الجارية والمنجزة في حدائق دمشق', 'View scheduled and completed maintenance tasks across Damascus parks')
            : t('تنفيذ المهام المسندة إليك وإرفاق ملاحظات وصورة بعد الإصلاح', 'Execute assigned tasks and attach completion notes and after-repair photos')
      }
      actions={
        isSupervisorOrAdmin ? (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('مهمة صيانة جديدة', 'New Task')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {feedback && (
          <div className="bg-white border border-[#E2E6E1] rounded-xl px-4 py-3 text-sm text-[#141E18]">
            {feedback}
          </div>
        )}

        {showCreate && isSupervisorOrAdmin && (
          <form onSubmit={handleCreate} className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4">
            <h2 className="font-display font-bold text-sm text-[#141E18]">
              {t('إنشاء مهمة صيانة', 'Create Maintenance Task')}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('عنوان المهمة', 'Task Title')}</label>
                <input
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الأولوية', 'Priority')}</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  {(Object.keys(PRIORITY_LABELS) as PriorityLevel[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p][lang]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الحديقة', 'Park')}</label>
                <select
                  value={parkId}
                  onChange={(e) => setParkId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  {parks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الموقع داخل الحديقة', 'Location Details')}</label>
                <input
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder={t('بجانب منطقة الألعاب / المدخل الشمالي', 'Near playground / North gate')}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('حاوية مرتبطة (اختياري)', 'Related Bin (Optional)')}</label>
                <select
                  value={binId}
                  onChange={(e) => setBinId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  <option value="">{t('لا يوجد', 'None')}</option>
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الفريق المختص', 'Specialized Team')}</label>
                <select
                  value={assignedTeam}
                  onChange={(e) => setAssignedTeam(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  <option value="">{t('بدون تحديد فريق', 'No Team Selected')}</option>
                  {MAINTENANCE_TEAMS.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {lang === 'ar' ? tm.labelAr : tm.labelEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('تعيين إلى موظف صيانة', 'Assign Technician')}</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  <option value="">{t('غير معيّنة بعد', 'Unassigned')}</option>
                  {staff.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('موعد التنفيذ المجدول', 'Scheduled For')}</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('التفاصيل', 'Description')}</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-medium border border-[#E2E6E1] rounded-lg"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={busyId === 'create'}
                className="px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg"
              >
                {t('حفظ المهمة', 'Save Task')}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-[#E2E6E1] rounded-xl p-2 flex flex-wrap items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                statusFilter === tab.key ? 'bg-[#14532D] text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`font-mono text-[11px] tabular-nums ${statusFilter === tab.key ? 'text-emerald-200' : 'text-stone-400'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('لا توجد مهام صيانة', 'No Maintenance Tasks')}
            description={t('لم يتم إنشاء أو إسناد مهام صيانة ضمن هذا التصنيف بعد.', 'No tasks match the current filter.')}
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((task) => {
              const assignee = staff.find((s) => s.uid === task.assignedTo);
              const park = parks.find((p) => p.id === task.parkId);
              const linkedReport = task.reportId ? reports.find((r) => r.id === task.reportId) : undefined;
              const beforePhotos = linkedReport?.imageUrls?.length
                ? linkedReport.imageUrls
                : linkedReport?.imageUrl
                  ? [linkedReport.imageUrl]
                  : [];
              const isTerminal = task.status === 'COMPLETED' || task.status === 'CANCELLED';
              const selectedPhoto = afterPhotosMap[task.id] ?? null;

              return (
                <div
                  key={task.id}
                  className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-stone-400">{task.id}</span>
                        <span aria-hidden="true">·</span>
                        <PriorityLabel priority={task.priority} />
                        <span aria-hidden="true">·</span>
                        <TaskStatusLabel status={task.status} />
                        {task.reportId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[#14532D]">{task.reportId}</span>
                          </>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-base text-[#141E18]">{task.title}</h3>
                      <p className="text-xs text-stone-500">
                        {park?.name || task.parkId}
                        {task.locationDescription ? ` · ${task.locationDescription}` : ''}
                      </p>
                    </div>
                    <div className="text-end text-xs text-stone-500 space-y-1">
                      <span className="font-mono tabular-nums block">
                        {formatDateTime(task.createdAt, lang)}
                      </span>
                      {task.scheduledFor && (
                        <span className="inline-flex items-center gap-1 font-mono text-[#14532D] tabular-nums">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {t('مجدولة:', 'Scheduled:')} {formatDateTime(task.scheduledFor, lang)}
                        </span>
                      )}
                    </div>
                  </div>

                  {task.description && (
                    <p className="text-sm text-stone-600 whitespace-pre-line">{task.description}</p>
                  )}

                  {beforePhotos.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-stone-500 block">
                        {t('صور البلاغ قبل الإصلاح:', 'Before-Maintenance Photos:')}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {beforePhotos.map((url) => (
                          <div key={url} className="w-28 h-20 rounded-lg overflow-hidden border border-[#E2E6E1]">
                            <StaffAuthImage src={url} alt={task.title} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(task.completionNotes || task.afterImageUrl) && (
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2 text-xs text-emerald-950">
                      {task.completionNotes && (
                        <div>
                          <strong className="block mb-0.5">{t('ملاحظات الإنجاز:', 'Completion Notes:')}</strong>
                          <span>{task.completionNotes}</span>
                        </div>
                      )}
                      {task.afterImageUrl && (
                        <div>
                          <strong className="block mb-1">{t('صورة التوثيق بعد الإصلاح:', 'After-Maintenance Photo:')}</strong>
                          <div className="max-w-xs rounded-lg overflow-hidden border border-emerald-300">
                            <StaffAuthImage
                              src={task.afterImageUrl}
                              alt={`${task.title} after`}
                              className="w-full max-h-44 object-cover"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E2E6E1]">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-stone-500">{t('الموظف المسؤول:', 'Assignee:')}</span>
                        {isSupervisorOrAdmin && !isTerminal ? (
                          <select
                            value={task.assignedTo || ''}
                            disabled={busyId === task.id}
                            onChange={(e) =>
                              void handleUpdateTask(task.id, {
                                assignedTo: e.target.value || undefined,
                                status: e.target.value ? 'ASSIGNED' : 'PENDING',
                              })
                            }
                            className="px-2.5 py-1 text-xs border border-[#D4DAD3] rounded bg-white"
                          >
                            <option value="">{t('غير معيّن', 'Unassigned')}</option>
                            {staff.map((s) => (
                              <option key={s.uid} value={s.uid}>
                                {s.fullName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-[#141E18]">
                            {assignee?.fullName || task.assignedTo || t('غير معيّن', 'Unassigned')}
                          </span>
                        )}
                      </div>

                      {task.assignedTeam && (
                        <span className="text-stone-600">
                          · {t('الفريق:', 'Team:')} <strong>{task.assignedTeam}</strong>
                        </span>
                      )}
                    </div>

                    {!isTerminal && canMutateTasks && (
                      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                        <input
                          type="text"
                          placeholder={t('ملاحظات الإنجاز...', 'Completion notes...')}
                          value={notesMap[task.id] ?? ''}
                          onChange={(e) =>
                            setNotesMap((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
                          className="px-2.5 py-1.5 text-xs border border-[#D4DAD3] rounded-lg min-w-[180px]"
                        />

                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg cursor-pointer hover:bg-stone-50">
                          <Camera className="w-3.5 h-3.5 text-[#14532D]" />
                          <span>
                            {selectedPhoto
                              ? selectedPhoto.name.slice(0, 14)
                              : t('صورة بعد الإصلاح', 'After Photo')}
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
                            onClick={() =>
                              void handleUpdateTask(task.id, { status: 'IN_PROGRESS' })
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{t('بدء التنفيذ', 'Start')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          onClick={() => void handleCompleteWithPhoto(task.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('تأكيد الإكمال', 'Complete')}</span>
                        </button>
                      </div>
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
