import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe,
  KeyRound,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { LoadingState } from '../components/common/StateViews';
import { ReportStatusLabel } from '../components/common/StatusText';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest } from '../services/apiClient';
import type {
  PriorityLevel,
  ReportStatus,
  ReportStatusHistoryEntry,
  ReportType,
  TaskStatus,
} from '../types/domain';
import { getSavedTrackingCode, updateSavedReportStatus } from '../utils/citizenStorage';
import {
  CITIZEN_WORKFLOW_STAGES,
  formatDateTime,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  TASK_STATUS_LABELS,
} from '../utils/i18n';

interface DetailedTrackedReport {
  referenceNumber: string;
  parkId: string;
  parkName: string;
  parkLocation: string;
  reportType: ReportType;
  title: string;
  status: ReportStatus;
  priority?: PriorityLevel;
  taskStatus: TaskStatus | null;
  assignedTeam?: string | null;
  scheduledFor?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  completedAt: string | null;
  statusHistory: ReportStatusHistoryEntry[];
  verified: boolean;
  description?: string;
  locationDescription?: string;
  imageUrls?: string[];
  afterImageUrl?: string | null;
  completionNotes?: string | null;
}

export function CitizenReportDetailsPage() {
  const { reportId = '' } = useParams();
  const { lang, toggleLang, t } = useLanguage();

  const [code, setCode] = useState(() => getSavedTrackingCode(reportId));
  const [inputCode, setInputCode] = useState('');
  const [report, setReport] = useState<DetailedTrackedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    async (verifyCode: string) => {
      if (!reportId) return;
      setLoading(true);
      setError(null);
      try {
        const qs = verifyCode ? `?code=${encodeURIComponent(verifyCode.trim())}` : '';
        const res = await apiRequest<{ tracking: DetailedTrackedReport }>(
          `/api/reports/track/${encodeURIComponent(reportId)}${qs}`,
          { authenticated: false }
        );
        setReport(res.tracking);
        updateSavedReportStatus(reportId, res.tracking.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('لم يتم العثور على البلاغ.', 'Report not found.'));
      } finally {
        setLoading(false);
      }
    },
    [reportId, t]
  );

  useEffect(() => {
    void loadReport(code);
  }, [code, loadReport]);

  const handleVerifySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setCode(inputCode.trim());
  };

  const activeStageIdx = report
    ? CITIZEN_WORKFLOW_STAGES.indexOf(
        CITIZEN_WORKFLOW_STAGES.includes(report.status) ? report.status : 'NEW'
      )
    : 0;

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E6E1] h-14 px-4 sm:px-6 flex items-center">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
          <Link
            to="/citizen?tab=track"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#14532D] hover:underline min-h-[44px]"
          >
            <BackIcon className="w-4 h-4" />
            <span>{t('العودة إلى متابعة البلاغات', 'Back to My Reports')}</span>
          </Link>
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-[#14532D] min-h-[44px]"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {loading ? (
          <LoadingState message={t('جارٍ تحميل تفاصيل البلاغ...', 'Loading report details...')} />
        ) : error || !report ? (
          <div className="bg-white border border-red-200 rounded-2xl p-7 space-y-4">
            <h1 className="font-display text-xl font-bold text-red-800">
              {t('تعذر عرض البلاغ', 'Could Not Load Report')}
            </h1>
            <p className="text-sm text-stone-600">{error}</p>
            <Link
              to="/citizen?tab=track"
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-[#14532D] text-white rounded-xl"
            >
              {t('العودة لبوابة حديقتي', 'Back to Citizen Portal')}
            </Link>
          </div>
        ) : (
          <>
            {/* Summary Header */}
            <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-7 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-mono text-xs font-bold text-[#14532D]">{report.referenceNumber}</p>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141E18]">{report.title}</h1>
                  <p className="text-xs sm:text-sm text-stone-600 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#14532D] shrink-0" />
                    <span>
                      {report.parkName}
                      {report.parkLocation ? ` · ${report.parkLocation}` : ''}
                    </span>
                  </p>
                </div>
                <ReportStatusLabel status={report.status} />
              </div>

              <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-[#E2E6E1] text-xs">
                <div>
                  <span className="block text-stone-500">{t('نوع المشكلة', 'Issue Category')}</span>
                  <span className="font-semibold text-[#141E18]">
                    {REPORT_TYPE_LABELS[report.reportType]?.[lang] || report.reportType}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-500">{t('تاريخ الإرسال', 'Submitted At')}</span>
                  <span className="font-mono tabular-nums text-[#141E18]">
                    {formatDateTime(report.createdAt, lang)}
                  </span>
                </div>
                <div>
                  <span className="block text-stone-500">{t('آخر تحديث', 'Last Updated')}</span>
                  <span className="font-mono tabular-nums text-[#141E18]">
                    {formatDateTime(report.updatedAt, lang)}
                  </span>
                </div>
              </div>

              {(report.assignedTeam || report.scheduledFor || report.taskStatus) && (
                <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-3.5 flex flex-wrap gap-4 text-xs text-stone-700">
                  {report.assignedTeam && (
                    <span>
                      {t('الجهة المكلفة:', 'Team:')} <strong>{report.assignedTeam}</strong>
                    </span>
                  )}
                  {report.taskStatus && (
                    <span>
                      {t('حالة المعالجة:', 'Work Status:')}{' '}
                      <strong>{TASK_STATUS_LABELS[report.taskStatus]?.[lang]}</strong>
                    </span>
                  )}
                  {report.scheduledFor && (
                    <span>
                      {t('الموعد المجدول:', 'Scheduled:')}{' '}
                      <strong className="font-mono tabular-nums">{formatDateTime(report.scheduledFor, lang)}</strong>
                    </span>
                  )}
                </div>
              )}
            </section>

            {/* Resolution Stages */}
            <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-7 space-y-4">
              <h2 className="font-display font-bold text-base text-[#141E18]">
                {t('مراحل معالجة البلاغ', 'Resolution Progress')}
              </h2>
              {report.status === 'REJECTED' ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
                  {t('تم إغلاق هذا البلاغ بعد المراجعة.', 'This report was closed after review.')}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {CITIZEN_WORKFLOW_STAGES.map((stage, idx) => {
                    const reached = idx <= activeStageIdx;
                    return (
                      <div
                        key={stage}
                        className={`rounded-2xl border p-2.5 text-[11px] font-medium flex flex-col justify-between gap-1 ${
                          reached
                            ? 'bg-emerald-50 border-emerald-300 text-[#14532D]'
                            : 'bg-[#F7F8F6] border-[#E2E6E1] text-stone-400'
                        }`}
                      >
                        <span className="font-mono font-bold tabular-nums">0{idx + 1}</span>
                        <span>{REPORT_STATUS_LABELS[stage][lang]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Timeline */}
            <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-7 space-y-4">
              <h2 className="font-display font-bold text-base text-[#141E18] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#14532D]" />
                <span>{t('سجل التحديثات', 'Update Timeline')}</span>
              </h2>
              <ol className="space-y-3 border-s-2 border-emerald-200 ps-4">
                {report.statusHistory.map((entry, idx) => (
                  <li key={`${entry.status}-${idx}`} className="relative space-y-0.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#14532D] absolute -start-[21px] top-1.5" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#141E18]">
                        {REPORT_STATUS_LABELS[entry.status]?.[lang] || entry.label}
                      </span>
                      <span className="font-mono text-[11px] text-stone-500 tabular-nums">
                        {formatDateTime(entry.changedAt, lang)}
                      </span>
                    </div>
                    {entry.note && <p className="text-xs text-stone-600">{entry.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            {/* Verified Photos & Repair Proof */}
            {report.verified ? (
              <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-7 space-y-5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#14532D]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('تفاصيل وصور البلاغ', 'Report Details & Photos')}</span>
                </div>

                {report.locationDescription && (
                  <div>
                    <h3 className="text-xs font-bold text-stone-500 mb-1">{t('الموقع داخل الحديقة', 'Location')}</h3>
                    <p className="text-sm text-[#141E18]">{report.locationDescription}</p>
                  </div>
                )}

                {report.description && (
                  <div>
                    <h3 className="text-xs font-bold text-stone-500 mb-1">{t('وصف المشكلة', 'Description')}</h3>
                    <p className="text-sm text-[#141E18] whitespace-pre-line">{report.description}</p>
                  </div>
                )}

                {report.imageUrls && report.imageUrls.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-stone-500">{t('الصور المرفقة', 'Attached Photos')}</h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {report.imageUrls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt={report.title}
                          className="w-full max-h-72 object-cover rounded-2xl border border-[#E2E6E1]"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(report.completionNotes || report.afterImageUrl) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#14532D]">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('تم الإصلاح بنجاح', 'Completed & Verified')}</span>
                    </div>
                    {report.completionNotes && (
                      <p className="text-xs sm:text-sm text-emerald-950">{report.completionNotes}</p>
                    )}
                    {report.afterImageUrl && (
                      <div>
                        <span className="block text-[11px] font-semibold text-emerald-900 mb-1.5">
                          {t('صورة بعد الإصلاح:', 'Photo After Repair:')}
                        </span>
                        <img
                          src={report.afterImageUrl}
                          alt="After maintenance"
                          className="w-full max-h-72 object-cover rounded-2xl border border-emerald-300"
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : (
              <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-7 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#141E18]">
                  <KeyRound className="w-4 h-4 text-[#14532D]" />
                  <span>{t('أدخل رمز المتابعة لعرض الصور والوصف', 'Enter 6-Digit Code to View Photos')}</span>
                </div>
                <p className="text-xs text-stone-600">
                  {t(
                    'لخصوصية المبلّغين، أدخل رمز المتابعة المكون من 6 أرقام لعرض الصور المرفقة وإثبات الإصلاح.',
                    'Enter your 6-digit tracking code to view attached photos and repair proof.'
                  )}
                </p>
                <form onSubmit={handleVerifySubmit} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="123456"
                    className="w-40 min-h-[44px] px-3 py-2 text-sm font-mono border border-[#D4DAD3] rounded-xl"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 py-2 text-xs font-bold bg-[#14532D] text-white rounded-xl hover:bg-[#0F3F22]"
                  >
                    {t('تحقق وعرض', 'Verify')}
                  </button>
                </form>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
