import { useEffect, useState } from 'react';
import { ArrowUpRight, Camera, CheckCircle, Lock, Save, Search, XCircle } from 'lucide-react';
import { StaffAuthImage } from '../components/common/StaffAuthImage';
import { EmptyState } from '../components/common/StateViews';
import { PriorityLabel, ReportStatusLabel } from '../components/common/StatusText';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { CitizenReport, PriorityLevel, ReportStatus, ReportType } from '../types/domain';
import {
  formatDateTime,
  MAINTENANCE_TEAMS,
  PRIORITY_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
} from '../utils/i18n';

export function ReportsPage() {
  const { lang, t } = useLanguage();
  const { reports, parks, staff, refreshAll } = useRealtime();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReportStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ReportType>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | PriorityLevel>('ALL');

  const [selectedReport, setSelectedReport] = useState<CitizenReport | null>(null);
  const [assignWorkerUid, setAssignWorkerUid] = useState('');
  const [assignTeam, setAssignTeam] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [internalNotesDraft, setInternalNotesDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedReport) return;
    const latest = reports.find((r) => r.id === selectedReport.id);
    if (latest) {
      setSelectedReport(latest);
    }
  }, [reports, selectedReport?.id]);

  useEffect(() => {
    if (selectedReport) {
      setInternalNotesDraft(selectedReport.internalNotes ?? '');
      setAssignWorkerUid(selectedReport.assignedTo ?? '');
      setAssignTeam(selectedReport.assignedTeam ?? '');
    }
  }, [selectedReport?.id]);

  const fieldWorkers = staff.filter((s) =>
    ['MAINTENANCE', 'WORKER', 'SUPERVISOR', 'ADMIN'].includes(s.role)
  );

  const filtered = reports.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && r.reportType !== typeFilter) return false;
    if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const park = parks.find((p) => p.id === r.parkId);
    return (
      r.id.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.locationDescription.toLowerCase().includes(q) ||
      (park?.name.toLowerCase().includes(q) ?? false)
    );
  });

  const updateReport = async (
    id: string,
    patch: {
      status?: ReportStatus;
      priority?: PriorityLevel;
      assignedTo?: string;
      assignedTeam?: string;
      internalNotes?: string;
    }
  ) => {
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await apiRequest<{ report: CitizenReport }>(`/api/reports/${id}`, {
        method: 'PATCH',
        body: patch,
      });
      if (selectedReport?.id === id) setSelectedReport(res.report);
      setFeedback(t('تم تحديث بيانات البلاغ بنجاح.', 'Report updated successfully.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحديث البلاغ.', 'Update failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConvertToTask = async (rep: CitizenReport) => {
    setBusyId(rep.id);
    setFeedback(null);
    try {
      await apiRequest(`/api/reports/${rep.id}/convert`, {
        method: 'POST',
        body: {
          priority: rep.priority,
          ...(assignWorkerUid ? { assignedTo: assignWorkerUid } : {}),
          ...(assignTeam ? { assignedTeam: assignTeam } : {}),
          ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
        },
      });
      setFeedback(
        t(
          `تم تحويل البلاغ (${rep.id}) إلى مهمة صيانة مجدولة بنجاح.`,
          `Converted report ${rep.id} to maintenance task.`
        )
      );
      setScheduledFor('');
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحويل البلاغ.', 'Conversion failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const selectedImages = selectedReport
    ? selectedReport.imageUrls && selectedReport.imageUrls.length > 0
      ? selectedReport.imageUrls
      : selectedReport.imageUrl
        ? [selectedReport.imageUrl]
        : []
    : [];

  const newCount = reports.filter((r) => r.status === 'NEW').length;
  const activeCount = reports.filter((r) =>
    ['UNDER_REVIEW', 'ACCEPTED', 'CONVERTED_TO_TASK', 'IN_PROGRESS'].includes(r.status)
  ).length;
  const closedCount = reports.filter((r) => ['RESOLVED', 'CLOSED', 'REJECTED'].includes(r.status)).length;

  return (
    <DashboardLayout
      title={t('إدارة بلاغات المواطنين', 'Citizen Reports Console')}
      subtitle={t(
        'مراجعة البلاغات، تعديل الحالة والأولوية، إضافة الملاحظات الداخلية، وإسناد فرق الصيانة',
        'OpenGov-style municipal case management, lifecycle controls, and maintenance dispatch'
      )}
    >
      <div className="space-y-6">
        {feedback && (
          <div className="bg-white border border-[#E2E6E1] rounded-xl px-4 py-3 text-sm text-[#141E18]">
            {feedback}
          </div>
        )}

        {/* Case Queue Summary Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('إجمالي البلاغات', 'Total Cases')}</span>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#141E18]">{reports.length}</p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('بلاغات جديدة', 'New')}</span>
            <p className={`font-mono text-2xl font-bold tabular-nums ${newCount > 0 ? 'text-amber-700' : 'text-[#141E18]'}`}>
              {newCount}
            </p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('قيد المراجعة والتنفيذ', 'Active Processing')}</span>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#14532D]">{activeCount}</p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('مغلقة / منجزة', 'Closed / Resolved')}</span>
            <p className="font-mono text-2xl font-bold tabular-nums text-emerald-800">{closedCount}</p>
          </div>
        </section>

        {/* Search & Multi-Filters */}
        <div className="bg-white border border-[#E2E6E1] rounded-xl p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('بحث برقم البلاغ أو الحديقة...', 'Search by ID, title, or park...')}
                className="w-full ps-9 pe-3 py-2 text-xs border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | ReportType)}
              className="px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
            >
              <option value="ALL">{t('كل أنواع المشاكل', 'All Issue Types')}</option>
              {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((rt) => (
                <option key={rt} value={rt}>
                  {REPORT_TYPE_LABELS[rt][lang]}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | PriorityLevel)}
              className="px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
            >
              <option value="ALL">{t('كل الأولويات', 'All Priorities')}</option>
              {(Object.keys(PRIORITY_LABELS) as PriorityLevel[]).map((pr) => (
                <option key={pr} value={pr}>
                  {PRIORITY_LABELS[pr][lang]}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ReportStatus)}
              className="px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
            >
              <option value="ALL">{t('كل الحالات', 'All Statuses')}</option>
              {(Object.keys(REPORT_STATUS_LABELS) as ReportStatus[]).map((st) => (
                <option key={st} value={st}>
                  {REPORT_STATUS_LABELS[st][lang]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('لا توجد بلاغات مطابقة', 'No Reports Found')}
            description={t(
              'ستظهر هنا البلاغات الواردة من بوابة حديقتي (/citizen).',
              'Reports submitted via /citizen appear here.'
            )}
          />
        ) : (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Reports Queue Table */}
            <div className="lg:col-span-7 bg-white border border-[#E2E6E1] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8F6] border-b border-[#E2E6E1] text-stone-600">
                    <tr>
                      <th className="py-3 px-3 text-start font-semibold">{t('رقم البلاغ', 'ID')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('المشكلة والحديقة', 'Issue & Park')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('الصور', 'Photos')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('الأولوية', 'Priority')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('الحالة', 'Status')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('المسؤول', 'Assignee')}</th>
                      <th className="py-3 px-3 text-start font-semibold">{t('التاريخ', 'Date')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E6E1]">
                    {filtered.map((rep) => {
                      const park = parks.find((p) => p.id === rep.parkId);
                      const assignee = staff.find((s) => s.uid === rep.assignedTo);
                      const photoCount = rep.imageUrls?.length || (rep.imageUrl ? 1 : 0);
                      const isSelected = selectedReport?.id === rep.id;
                      return (
                        <tr
                          key={rep.id}
                          onClick={() => setSelectedReport(rep)}
                          className={`cursor-pointer transition-colors hover:bg-stone-50/70 ${
                            isSelected ? 'bg-emerald-50/50' : ''
                          }`}
                        >
                          <td className="py-3 px-3 font-mono text-[11px] font-semibold text-[#14532D] whitespace-nowrap">
                            {rep.id}
                          </td>
                          <td className="py-3 px-3 min-w-[160px]">
                            <p className="font-semibold text-[#141E18]">{rep.title}</p>
                            <p className="text-[11px] text-stone-500">
                              {REPORT_TYPE_LABELS[rep.reportType]?.[lang] || rep.reportType} · {park?.name || rep.parkId}
                            </p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {photoCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-800 font-mono">
                                <Camera className="w-3.5 h-3.5" />
                                {photoCount}
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <PriorityLabel priority={rep.priority} />
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <ReportStatusLabel status={rep.status} />
                          </td>
                          <td className="py-3 px-3 text-[11px] text-stone-700 whitespace-nowrap">
                            {assignee?.fullName || rep.assignedTeam || '—'}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-stone-500 whitespace-nowrap tabular-nums">
                            {formatDateTime(rep.createdAt, lang)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Report Inspector Panel */}
            <div className="lg:col-span-5">
              {selectedReport ? (
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4 sticky top-20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-stone-500">{selectedReport.id}</span>
                      <h2 className="font-display font-bold text-base text-[#141E18] mt-0.5">
                        {selectedReport.title}
                      </h2>
                    </div>
                    <ReportStatusLabel status={selectedReport.status} />
                  </div>

                  <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                    {selectedReport.description}
                  </p>

                  {selectedImages.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-stone-500 block">
                        {t('الصور المرفقة من المواطن', 'Attached Photos')} ({selectedImages.length})
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedImages.map((url) => (
                          <div
                            key={url}
                            className="rounded-lg overflow-hidden border border-[#E2E6E1] bg-stone-100"
                          >
                            <StaffAuthImage src={url} alt={selectedReport.title} className="w-full h-36 object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs space-y-1.5 pt-3 border-t border-[#E2E6E1]">
                    <p>
                      <span className="text-stone-500">{t('الحديقة:', 'Park:')}</span>{' '}
                      <span className="font-medium text-[#141E18]">
                        {parks.find((p) => p.id === selectedReport.parkId)?.name || selectedReport.parkId}
                      </span>
                    </p>
                    <p>
                      <span className="text-stone-500">{t('الموقع:', 'Location:')}</span>{' '}
                      <span className="font-medium text-[#141E18]">{selectedReport.locationDescription}</span>
                    </p>
                    {selectedReport.reporterName && (
                      <p>
                        <span className="text-stone-500">{t('المبلّغ:', 'Reporter:')}</span>{' '}
                        <span className="font-medium text-[#141E18]">{selectedReport.reporterName}</span>
                      </p>
                    )}
                    {selectedReport.reporterContact && (
                      <p>
                        <span className="text-stone-500">{t('التواصل:', 'Contact:')}</span>{' '}
                        <span className="font-mono text-[#141E18]">{selectedReport.reporterContact}</span>
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#E2E6E1] space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          {t('تغيير الحالة', 'Status')}
                        </label>
                        <select
                          value={selectedReport.status}
                          disabled={busyId === selectedReport.id}
                          onChange={(e) =>
                            void updateReport(selectedReport.id, {
                              status: e.target.value as ReportStatus,
                            })
                          }
                          className="w-full px-2.5 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
                        >
                          {(Object.keys(REPORT_STATUS_LABELS) as ReportStatus[]).map((st) => (
                            <option key={st} value={st}>
                              {REPORT_STATUS_LABELS[st][lang]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          {t('الأولوية', 'Priority')}
                        </label>
                        <select
                          value={selectedReport.priority}
                          disabled={busyId === selectedReport.id}
                          onChange={(e) =>
                            void updateReport(selectedReport.id, {
                              priority: e.target.value as PriorityLevel,
                            })
                          }
                          className="w-full px-2.5 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
                        >
                          {(Object.keys(PRIORITY_LABELS) as PriorityLevel[]).map((p) => (
                            <option key={p} value={p}>
                              {PRIORITY_LABELS[p][lang]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-stone-600">
                        {t('ملاحظات داخلية للطاقم', 'Internal Staff Notes')}
                      </label>
                      <textarea
                        rows={2}
                        value={internalNotesDraft}
                        onChange={(e) => setInternalNotesDraft(e.target.value)}
                        placeholder={t('أضف ملاحظة داخلية لفريق المتابعة والصيانة...', 'Internal note for team...')}
                        className="w-full px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={busyId === selectedReport.id}
                        onClick={() =>
                          void updateReport(selectedReport.id, {
                            internalNotes: internalNotesDraft.trim(),
                            ...(assignWorkerUid ? { assignedTo: assignWorkerUid } : {}),
                            ...(assignTeam ? { assignedTeam: assignTeam } : {}),
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{t('حفظ الملاحظات والإسناد', 'Save Notes & Assignment')}</span>
                      </button>
                    </div>

                    {selectedReport.status === 'RESOLVED' && (
                      <button
                        type="button"
                        disabled={busyId === selectedReport.id}
                        onClick={() => void updateReport(selectedReport.id, { status: 'CLOSED' })}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{t('إغلاق البلاغ نهائياً', 'Close Report')}</span>
                      </button>
                    )}

                    {!['CONVERTED_TO_TASK', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'].includes(
                      selectedReport.status
                    ) && (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId === selectedReport.id}
                            onClick={() => void updateReport(selectedReport.id, { status: 'ACCEPTED' })}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-emerald-300 text-emerald-900 rounded-lg hover:bg-emerald-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{t('قبول البلاغ', 'Accept')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId === selectedReport.id}
                            onClick={() => void updateReport(selectedReport.id, { status: 'REJECTED' })}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t('رفض', 'Reject')}</span>
                          </button>
                        </div>

                        <div className="pt-3 border-t border-[#E2E6E1] space-y-2.5">
                          <p className="text-xs font-semibold text-[#141E18]">
                            {t('تحويل وإسناد مهمة الصيانة', 'Convert & Assign Maintenance Task')}
                          </p>
                          <select
                            value={assignTeam}
                            onChange={(e) => setAssignTeam(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
                          >
                            <option value="">{t('اختر الفريق المختص (اختياري)', 'Select Specialized Team (Optional)')}</option>
                            {MAINTENANCE_TEAMS.map((tm) => (
                              <option key={tm.id} value={tm.id}>
                                {lang === 'ar' ? tm.labelAr : tm.labelEn}
                              </option>
                            ))}
                          </select>

                          <select
                            value={assignWorkerUid}
                            onChange={(e) => setAssignWorkerUid(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-[#D4DAD3] rounded-lg bg-white"
                          >
                            <option value="">{t('إسناد إلى موظف صيانة (اختياري)', 'Assign Staff Member (Optional)')}</option>
                            {fieldWorkers.map((w) => (
                              <option key={w.uid} value={w.uid}>
                                {w.fullName}
                              </option>
                            ))}
                          </select>

                          <div>
                            <label className="block text-[11px] text-stone-500 mb-1">
                              {t('تاريخ التنفيذ المجدول (اختياري)', 'Scheduled Date (Optional)')}
                            </label>
                            <input
                              type="datetime-local"
                              value={scheduledFor}
                              onChange={(e) => setScheduledFor(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs font-mono border border-[#D4DAD3] rounded-lg"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={busyId === selectedReport.id}
                            onClick={() => void handleConvertToTask(selectedReport)}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                            <span>{t('تحويل إلى مهمة صيانة', 'Convert to Maintenance Task')}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E2E6E1] rounded-xl p-8 text-center text-xs text-stone-500">
                  {t('اختر بلاغاً من الجدول لعرض الصور والتفاصيل واتخاذ إجراء.', 'Select a report from the queue to inspect and act.')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
