import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Baby,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Copy,
  Droplets,
  Globe,
  Home,
  ImagePlus,
  Lightbulb,
  MapPin,
  MessageSquarePlus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trees,
  X,
} from 'lucide-react';
import { ReportStatusLabel } from '../components/common/StatusText';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest } from '../services/apiClient';
import type {
  Park,
  ReportStatus,
  ReportStatusHistoryEntry,
  ReportType,
  TaskStatus,
} from '../types/domain';
import {
  CITIZEN_REPORT_TYPES,
  formatDateTime,
  REPORT_TYPE_LABELS,
} from '../utils/i18n';
import {
  loadSavedCitizenReports,
  saveCitizenReportToDevice,
  updateSavedReportStatus,
  type SavedCitizenReport,
} from '../utils/citizenStorage';

interface PublicPark {
  id: string;
  name: string;
  location: string;
  description?: string;
  status: string;
}

interface TrackedReportSummary {
  referenceNumber: string;
  parkId: string;
  parkName: string;
  parkLocation: string;
  reportType: ReportType;
  title: string;
  status: ReportStatus;
  taskStatus: TaskStatus | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  verified?: boolean;
  imageUrls?: string[];
  afterImageUrl?: string | null;
  statusHistory?: ReportStatusHistoryEntry[];
}

interface PhotoPreview {
  file: File;
  url: string;
}

type CitizenTab = 'home' | 'report' | 'track' | 'parks';
type WizardStep = 1 | 2 | 3 | 4;

const FALLBACK_PARKS: PublicPark[] = [
  {
    id: 'park-alnakheel',
    name: 'حديقة تشرين العامة (دمشق)',
    location: 'دمشق — حي المهاجرين / ساحة الأمويين',
    description: 'أكبر حدائق دمشق العامة، مساحات خضراء ومناطق ألعاب للعائلات.',
    status: 'ACTIVE',
  },
  {
    id: 'park-damascus-sabki',
    name: 'حديقة السبكي (دمشق)',
    location: 'دمشق — حي الشعلان / شارع السبكي',
    description: 'حديقة حيوية وسط دمشق تخدم العائلات والزوار.',
    status: 'ACTIVE',
  },
];

function getCitizenStageIndex(status: ReportStatus): number {
  if (status === 'RESOLVED' || status === 'CLOSED') return 3;
  if (status === 'CONVERTED_TO_TASK' || status === 'IN_PROGRESS') return 2;
  if (status === 'UNDER_REVIEW' || status === 'ACCEPTED') return 1;
  return 0;
}

const REPORT_TYPE_ICONS: Record<ReportType, typeof Trash2> = {
  FULL_BIN: Trash2,
  PARK_CLEANLINESS: AlertTriangle,
  PLAYGROUND_DAMAGE: Baby,
  DAMAGED_BENCH: Armchair,
  RESTROOM_ISSUE: Droplets,
  LIGHTING_PROBLEM: Lightbulb,
  BROKEN_EQUIPMENT: Sparkles,
  OTHER: MessageSquarePlus,
};

export function CitizenPortalPage() {
  const { lang, toggleLang, t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedParkId = searchParams.get('park');
  const requestedTab = searchParams.get('tab') as CitizenTab | null;

  const [activeTab, setActiveTab] = useState<CitizenTab>(
    requestedTab && ['home', 'report', 'track', 'parks'].includes(requestedTab)
      ? requestedTab
      : requestedParkId
        ? 'report'
        : 'home'
  );
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  const [parks, setParks] = useState<PublicPark[]>(FALLBACK_PARKS);
  const [parkSearch, setParkSearch] = useState('');
  const [parkId, setParkId] = useState(requestedParkId || 'park-alnakheel');
  const [reportType, setReportType] = useState<ReportType>('FULL_BIN');
  const [locationDescription, setLocationDescription] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    referenceNumber: string;
    trackingCode: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [savedReports, setSavedReports] = useState<SavedCitizenReport[]>(() => loadSavedCitizenReports());
  const [trackedMap, setTrackedMap] = useState<Record<string, TrackedReportSummary>>({});
  const [statusUpdatesBanner, setStatusUpdatesBanner] = useState<
    Array<{ referenceNumber: string; title: string; status: ReportStatus }>
  >([]);

  const [trackQuery, setTrackQuery] = useState('');
  const [trackCodeQuery, setTrackCodeQuery] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackedReport, setTrackedReport] = useState<TrackedReportSummary | null>(null);

  useEffect(() => {
    apiRequest<{ parks: Park[] }>('/api/parks/public', { authenticated: false })
      .then((res) => {
        if (res.parks.length > 0) {
          setParks(res.parks);
          const matched = requestedParkId ? res.parks.find((p) => p.id === requestedParkId) : undefined;
          setParkId(matched ? matched.id : res.parks[0].id);
        }
      })
      .catch(() => {
        // Retain fallback list if public parks endpoint is temporarily unreachable
      });
  }, [requestedParkId]);

  const refreshSavedReports = useCallback(async (items: SavedCitizenReport[]) => {
    if (items.length === 0) return;
    const updates: Array<{ referenceNumber: string; title: string; status: ReportStatus }> = [];
    const entries = await Promise.all(
      items.slice(0, 10).map(async (item) => {
        try {
          const qs = item.trackingCode ? `?code=${encodeURIComponent(item.trackingCode)}` : '';
          const res = await apiRequest<{ tracking: TrackedReportSummary }>(
            `/api/reports/track/${encodeURIComponent(item.referenceNumber)}${qs}`,
            { authenticated: false }
          );
          if (res.tracking.status !== item.lastKnownStatus) {
            updates.push({
              referenceNumber: item.referenceNumber,
              title: res.tracking.title,
              status: res.tracking.status,
            });
            updateSavedReportStatus(item.referenceNumber, res.tracking.status);
          }
          return [item.referenceNumber, res.tracking] as const;
        } catch {
          return null;
        }
      })
    );
    const nextMap: Record<string, TrackedReportSummary> = {};
    for (const pair of entries) {
      if (pair) nextMap[pair[0]] = pair[1];
    }
    setTrackedMap(nextMap);
    if (updates.length > 0) {
      setStatusUpdatesBanner(updates);
      setSavedReports(loadSavedCitizenReports());
    }
  }, []);

  useEffect(() => {
    void refreshSavedReports(savedReports);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTab = (nextTab: CitizenTab) => {
    setActiveTab(nextTab);
    setError(null);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.set('tab', nextTab);
      return updated;
    }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startNewReport = (preselectedParkId?: string) => {
    if (preselectedParkId) setParkId(preselectedParkId);
    setSubmittedReceipt(null);
    setError(null);
    setWizardStep(1);
    switchTab('report');
  };

  const filteredParks = useMemo(() => {
    const q = parkSearch.trim().toLowerCase();
    if (!q) return parks;
    return parks.filter(
      (p) => p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q)
    );
  }, [parks, parkSearch]);

  const selectedPark = parks.find((p) => p.id === parkId) || parks[0];

  const handlePhotosChange = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    setError(null);
    if (chosen.length === 0) return;

    const nextPreviews: PhotoPreview[] = [...photos];
    for (const file of chosen) {
      if (nextPreviews.length >= 4) {
        setError(t('الحد الأقصى هو 4 صور لكل بلاغ.', 'Maximum 4 photos per report.'));
        break;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setError(t('يرجى اختيار صور بصيغة PNG أو JPEG أو WebP فقط.', 'Only PNG, JPEG, or WebP images are allowed.'));
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        setError(t('الحد الأقصى لحجم كل صورة هو 2 ميجابايت.', 'Each photo must be 2 MB or less.'));
        continue;
      }
      nextPreviews.push({ file, url: URL.createObjectURL(file) });
    }
    e.target.value = '';
    setPhotos(nextPreviews);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError(t('المتصفح لا يدعم تحديد الموقع الجغرافي.', 'Geolocation is not supported in this browser.'));
      return;
    }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coordsText = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setLocationDescription((prev) =>
          prev.trim() ? `${prev.trim()} (${coordsText})` : `${t('إحداثيات الموقع:', 'GPS:')} ${coordsText}`
        );
        setGeoLoading(false);
      },
      () => {
        setError(t('تعذر تحديد الموقع تلقائياً، يمكنك اختيار مكان من القائمة أو كتابته.', 'Could not detect GPS location; please pick or type a spot.'));
        setGeoLoading(false);
      },
      { timeout: 6000 }
    );
  };

  const handleNextStep = () => {
    setError(null);
    if (wizardStep === 3 && description.trim().length < 5) {
      setError(t('يرجى كتابة وصف واضح للمشكلة (5 أحرف على الأقل).', 'Please enter a short description (at least 5 characters).'));
      return;
    }
    if (wizardStep < 4) {
      setWizardStep((s) => (s + 1) as WizardStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setError(null);
    if (wizardStep > 1) {
      setWizardStep((s) => (s - 1) as WizardStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 5) {
      setError(t('يرجى كتابة وصف واضح للمشكلة (5 محارف على الأقل).', 'Please enter a clear problem description.'));
      setWizardStep(3);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('parkId', parkId);
      formData.append('reportType', reportType);
      formData.append('title', REPORT_TYPE_LABELS[reportType].ar);
      formData.append('locationDescription', locationDescription.trim() || 'داخل الحديقة');
      formData.append('description', description.trim());
      if (reporterName.trim()) formData.append('reporterName', reporterName.trim());
      if (reporterContact.trim()) formData.append('reporterContact', reporterContact.trim());
      for (const item of photos) {
        formData.append('photos', item.file);
      }

      const res = await apiRequest<{
        success: boolean;
        referenceNumber: string;
        trackingCode: string;
        report: { title: string; createdAt: string; status: ReportStatus };
      }>('/api/reports', {
        method: 'POST',
        body: formData,
        authenticated: false,
        isFormData: true,
      });

      const updatedSaved = saveCitizenReportToDevice({
        referenceNumber: res.referenceNumber,
        trackingCode: res.trackingCode || '',
        parkId,
        reportType,
        title: res.report?.title || REPORT_TYPE_LABELS[reportType].ar,
        createdAt: res.report?.createdAt || new Date().toISOString(),
        lastKnownStatus: 'NEW',
      });
      setSavedReports(updatedSaved);
      void refreshSavedReports(updatedSaved);

      setSubmittedReceipt({
        referenceNumber: res.referenceNumber,
        trackingCode: res.trackingCode || '',
      });
      setTrackQuery(res.referenceNumber);
      setTrackCodeQuery(res.trackingCode || '');
      setLocationDescription('');
      setDescription('');
      setReporterName('');
      setReporterContact('');
      for (const p of photos) URL.revokeObjectURL(p.url);
      setPhotos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذر إرسال البلاغ، حاول مجدداً.', 'Failed to submit report.'));
    } finally {
      setSubmitting(false);
    }
  };

  const lookupReportStatus = async (refToLookup: string, codeToUse?: string) => {
    const cleanRef = refToLookup.trim();
    if (!cleanRef) return;
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackedReport(null);
    try {
      const cleanCode = (codeToUse ?? trackCodeQuery).trim();
      const qs = cleanCode ? `?code=${encodeURIComponent(cleanCode)}` : '';
      const res = await apiRequest<{ success: boolean; tracking: TrackedReportSummary }>(
        `/api/reports/track/${encodeURIComponent(cleanRef)}${qs}`,
        { authenticated: false }
      );
      setTrackedReport(res.tracking);
    } catch (err) {
      setTrackingError(err instanceof Error ? err.message : t('لم يتم العثور على البلاغ.', 'Report not found.'));
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTrackSubmit = (e: FormEvent) => {
    e.preventDefault();
    void lookupReportStatus(trackQuery, trackCodeQuery);
  };

  const copyValue = async (key: string, val: string) => {
    await navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const guidelines = [
    {
      icon: Trash2,
      title: t('رمي النفايات في السلال المخصصة', 'Use Designated Waste Bins'),
      text: t('ساهم في بقاء المسطحات الخضراء نظيفة بوضع النفايات في أقرب سلة.', 'Keep lawns clean by placing waste in the nearest bin.'),
    },
    {
      icon: Sparkles,
      title: t('الإبلاغ فور امتلاء الحاوية', 'Report Full Bins Immediately'),
      text: t('أرسل بلاغاً بسيطاً بالصورة ليتم تفريغ الحاوية قبل تراكم النفايات.', 'Send a quick photo report if a bin is full so crews respond fast.'),
    },
    {
      icon: ShieldCheck,
      title: t('سلامة ألعاب الأطفال والمقاعد', 'Protect Playgrounds & Benches'),
      text: t('حافظ على المرافق وأبلغنا عن أي كسر أو تلف لحماية سلامة الأطفال.', 'Report damaged swings or benches promptly to protect children.'),
    },
    {
      icon: Lightbulb,
      title: t('الإنارة والمرافق الصحية', 'Lighting & Restrooms'),
      text: t('ملاحظاتك حول الإنارة والحمامات توصل فرق الصيانة للمكان الصحيح بسرعة.', 'Reporting lighting or restroom issues helps teams fix them quickly.'),
    },
  ];

  const navTabs: Array<{ id: CitizenTab; label: string; icon: typeof Home; count?: number }> = [
    { id: 'home', label: t('الرئيسية', 'Home'), icon: Home },
    { id: 'report', label: t('بلاغ جديد', 'Report'), icon: Send },
    { id: 'track', label: t('متابعاتي', 'Track'), icon: ClipboardCheck, count: savedReports.length },
    { id: 'parks', label: t('الحدائق', 'Parks'), icon: Trees },
  ];

  const stepLabels = [
    t('المشكلة', 'Issue'),
    t('الموقع', 'Location'),
    t('الصورة والوصف', 'Photo & Notes'),
    t('المراجعة', 'Review'),
  ];

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
  const NextChevron = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col pb-20 md:pb-8">
      {/* Compact Mobile-First Header (52px–56px) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E6E1] h-14 px-4 sm:px-6 flex items-center">
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0 min-h-[44px]">
            <span className="w-8 h-8 rounded-xl bg-[#14532D] text-white font-bold flex items-center justify-center text-sm">
              ح
            </span>
            <span className="font-display font-bold text-lg text-[#14532D]">
              {t('حديقتي', 'Hadiqti')}
            </span>
          </Link>

          {/* Desktop Navigation Switcher */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-[#F7F8F6] rounded-xl border border-[#E2E6E1]">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => (tab.id === 'report' ? startNewReport() : switchTab(tab.id))}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active ? 'bg-[#14532D] text-white' : 'text-stone-700 hover:bg-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                  {tab.count ? (
                    <span className={`font-mono tabular-nums ${active ? 'text-emerald-200' : 'text-[#14532D]'}`}>
                      ({tab.count})
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs sm:text-sm font-medium text-stone-700 hover:text-[#14532D] shrink-0"
          >
            <Globe className="w-4 h-4" aria-hidden="true" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6">
        {/* Live Update Banner if a saved report advanced */}
        {statusUpdatesBanner.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm">
                <p className="font-bold text-[#14532D]">
                  {t('تحديث جديد على بلاغاتك', 'Update on Your Reports')}
                </p>
                {statusUpdatesBanner.map((u) => (
                  <p key={u.referenceNumber} className="text-emerald-950">
                    {u.title} (<span className="font-mono">{u.referenceNumber}</span>) ·{' '}
                    <ReportStatusLabel status={u.status} />
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusUpdatesBanner([])}
              className="min-h-[44px] px-3 text-xs font-bold text-[#14532D] hover:underline"
            >
              {t('حسناً', 'Dismiss')}
            </button>
          </div>
        )}

        {/* TAB 1: HOME SCREEN */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Hero Action Card — Mobile-First Focal Point */}
            <section className="bg-white border border-[#E2E6E1] rounded-3xl p-6 sm:p-10 space-y-6">
              <div className="max-w-xl space-y-2.5">
                <p className="text-xs font-semibold text-[#15803D]">
                  {t('بوابة زوار حدائق دمشق العامة', 'Damascus Public Parks Citizen App')}
                </p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#141E18] leading-tight">
                  {t('حديقتك مسؤوليتنا جميعاً', 'Your Park Is Our Shared Responsibility')}
                </h1>
                <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                  {t(
                    'هل لاحظت سلة ممتلئة أو لعبة تالفة أو عطل إنارة؟ أبلغ في 4 خطوات بسيطة دون تسجيل، وتابع المعالجة من هاتفك.',
                    'Spotted a full bin, broken swing, or lighting issue? Report in 4 quick steps with no account required.'
                  )}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => startNewReport()}
                  className="w-full min-h-[54px] inline-flex items-center justify-center gap-2.5 px-6 py-4 bg-[#14532D] hover:bg-[#0F3F22] active:scale-[0.99] text-white text-base font-bold rounded-2xl transition-all"
                >
                  <Send className="w-5 h-5" aria-hidden="true" />
                  <span>{t('إرسال بلاغ جديد', 'Submit New Report')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => switchTab('track')}
                  className="w-full min-h-[54px] inline-flex items-center justify-center gap-2.5 px-6 py-4 bg-[#F7F8F6] hover:bg-stone-200/70 border border-[#D4DAD3] text-[#141E18] text-base font-semibold rounded-2xl transition-colors"
                >
                  <ClipboardCheck className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
                  <span>
                    {t('متابعة بلاغاتي', 'My Reports')}
                    {savedReports.length > 0 ? ` (${savedReports.length})` : ''}
                  </span>
                </button>
              </div>
            </section>

            {/* Quick Previews: Recent Reports + Quick Parks/Guidelines */}
            <div className="grid lg:grid-cols-12 gap-6">
              <section className="lg:col-span-7 bg-white border border-[#E2E6E1] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                    {t('بلاغاتك الأخيرة على هذا الجهاز', 'Recent Reports on This Device')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => switchTab('track')}
                    className="min-h-[44px] inline-flex items-center text-xs font-bold text-[#14532D] hover:underline"
                  >
                    {t('عرض الكل أو البحث برقم', 'View all / Search')}
                  </button>
                </div>

                {savedReports.length === 0 ? (
                  <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-6 text-center space-y-2">
                    <p className="text-sm font-semibold text-[#141E18]">
                      {t('لم ترسل أي بلاغ من هذا الجهاز بعد', 'No reports submitted from this device yet')}
                    </p>
                    <p className="text-xs text-stone-600">
                      {t(
                        'كل بلاغ ترسله يُحفظ تلقائياً هنا لمتابعة خطوات المعالجة بسهولة.',
                        'Reports you submit are saved here automatically so you can follow progress anytime.'
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedReports.slice(0, 2).map((item) => {
                      const live = trackedMap[item.referenceNumber];
                      const currentStatus = live?.status || item.lastKnownStatus;
                      const stageIdx = getCitizenStageIndex(currentStatus);
                      return (
                        <Link
                          key={item.referenceNumber}
                          to={`/citizen/reports/${item.referenceNumber}`}
                          className="block p-4 rounded-2xl border border-[#E2E6E1] bg-[#F7F8F6] hover:border-[#14532D] transition-colors space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-[#14532D]">
                              {item.referenceNumber}
                            </span>
                            <ReportStatusLabel status={currentStatus} />
                          </div>
                          <div>
                            <p className="font-display text-sm font-bold text-[#141E18]">
                              {live?.title || item.title}
                            </p>
                            <p className="text-xs text-stone-500 mt-0.5">
                              {live?.parkName || parks.find((p) => p.id === item.parkId)?.name || item.parkId}
                            </p>
                          </div>
                          {/* FixMyStreet Simple Progress Bar */}
                          <div className="grid grid-cols-4 gap-1.5 pt-1">
                            {[0, 1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={`h-1.5 rounded-full ${
                                  step <= stageIdx ? 'bg-[#15803D]' : 'bg-stone-200'
                                }`}
                              />
                            ))}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="lg:col-span-5 bg-white border border-[#E2E6E1] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                    {t('معلومات الحدائق والإرشادات', 'Parks & Guidelines')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => switchTab('parks')}
                    className="min-h-[44px] inline-flex items-center text-xs font-bold text-[#14532D] hover:underline"
                  >
                    {t('كل الحدائق', 'All Parks')}
                  </button>
                </div>

                <div className="space-y-3">
                  {guidelines.slice(0, 3).map((g) => {
                    const Icon = g.icon;
                    return (
                      <div key={g.title} className="flex items-start gap-3 p-3 rounded-xl bg-[#F7F8F6]">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#14532D] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="text-xs sm:text-sm font-bold text-[#141E18]">{g.title}</h3>
                          <p className="text-xs text-stone-600 leading-relaxed">{g.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link
                  to="/guide"
                  className="min-h-[44px] w-full inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#F7F8F6] border border-[#E2E6E1] text-xs sm:text-sm font-bold text-[#14532D] hover:border-[#14532D] transition-colors"
                >
                  <span>{t('دليل الاستخدام: كيف ترسل بلاغاً وتتابعه؟', 'Usage Guide: How to Submit & Track')}</span>
                  <NextChevron className="w-4 h-4 shrink-0" aria-hidden="true" />
                </Link>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: GUIDED 4-STEP REPORT WIZARD (SeeClickFix Style) */}
        {activeTab === 'report' && (
          <section className="max-w-2xl mx-auto bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-8 space-y-6">
            {submittedReceipt ? (
              <div className="space-y-6 py-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#15803D] flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#141E18]">
                    {t('شكراً لك، وصل بلاغك بنجاح', 'Thank You — Report Received')}
                  </h1>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {t(
                      'تم حفظ البلاغ في «متابعاتي» على هذا الجهاز. احتفظ بالرقم المرجعي ورمز المتابعة لمتابعة البلاغ وصوره من أي جهاز.',
                      'Saved under My Reports on this device. Keep these codes to track status and photos from any device.'
                    )}
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-4 flex items-center justify-between gap-2">
                    <div>
                      <span className="block text-[11px] text-stone-500">{t('الرقم المرجعي للبلاغ', 'Reference Number')}</span>
                      <span className="font-mono text-sm font-bold text-[#14532D]">{submittedReceipt.referenceNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyValue('ref', submittedReceipt.referenceNumber)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-xs text-stone-600 hover:text-[#14532D] bg-white border border-[#E2E6E1] rounded-xl"
                      aria-label={t('نسخ الرقم المرجعي', 'Copy reference number')}
                    >
                      {copiedKey === 'ref' ? t('تم', 'OK') : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {submittedReceipt.trackingCode && (
                    <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-4 flex items-center justify-between gap-2">
                      <div>
                        <span className="block text-[11px] text-stone-500">{t('رمز المتابعة السري (للصور)', '6-Digit Tracking Code')}</span>
                        <span className="font-mono text-sm font-bold text-[#141E18]">{submittedReceipt.trackingCode}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyValue('code', submittedReceipt.trackingCode)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-xs text-stone-600 hover:text-[#14532D] bg-white border border-[#E2E6E1] rounded-xl"
                        aria-label={t('نسخ رمز المتابعة', 'Copy tracking code')}
                      >
                        {copiedKey === 'code' ? t('تم', 'OK') : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to={`/citizen/reports/${submittedReceipt.referenceNumber}`}
                    className="flex-1 min-h-[48px] inline-flex items-center justify-center px-5 py-3 text-sm font-bold text-white bg-[#14532D] rounded-2xl hover:bg-[#0F3F22]"
                  >
                    {t('متابعة حالة البلاغ الآن', 'View Report Timeline')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => startNewReport()}
                    className="min-h-[48px] px-5 py-3 text-sm font-semibold border border-[#D4DAD3] rounded-2xl hover:bg-stone-50"
                  >
                    {t('إرسال بلاغ آخر', 'Submit Another')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Wizard Header + Progress Stepper */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141E18]">
                      {t('تقديم بلاغ جديد', 'Submit a Report')}
                    </h1>
                    <span className="font-mono text-xs font-bold text-[#14532D] tabular-nums">
                      {wizardStep} / 4
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {stepLabels.map((lbl, idx) => {
                      const stepNum = (idx + 1) as WizardStep;
                      const reached = stepNum <= wizardStep;
                      const current = stepNum === wizardStep;
                      return (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => {
                            if (stepNum < wizardStep) setWizardStep(stepNum);
                          }}
                          className="text-start space-y-1.5"
                        >
                          <div
                            className={`h-2 rounded-full transition-colors ${
                              reached ? 'bg-[#14532D]' : 'bg-stone-200'
                            }`}
                          />
                          <span
                            className={`block text-[11px] truncate ${
                              current ? 'font-bold text-[#14532D]' : 'text-stone-500'
                            }`}
                          >
                            {stepNum}. {lbl}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs sm:text-sm text-red-800">
                    {error}
                  </div>
                )}

                {/* STEP 1: Choose Issue Type */}
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                        {t('ما هي المشكلة التي لاحظتها؟', 'What issue did you spot?')}
                      </h2>
                      <p className="text-xs text-stone-500">
                        {t('اختر نوع المشكلة الأقرب مما يلي:', 'Tap the closest issue category:')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {CITIZEN_REPORT_TYPES.map((typeKey) => {
                        const active = reportType === typeKey;
                        const Icon = REPORT_TYPE_ICONS[typeKey];
                        return (
                          <button
                            key={typeKey}
                            type="button"
                            onClick={() => setReportType(typeKey)}
                            className={`min-h-[60px] px-4 py-3.5 rounded-2xl border flex items-center gap-3 text-start transition-colors ${
                              active
                                ? 'bg-[#14532D] text-white border-[#14532D]'
                                : 'bg-[#F7F8F6] text-[#141E18] border-[#E2E6E1] hover:border-[#14532D]/50'
                            }`}
                          >
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                active ? 'bg-white/15 text-white' : 'bg-white text-[#14532D] border border-[#E2E6E1]'
                              }`}
                            >
                              <Icon className="w-5 h-5" aria-hidden="true" />
                            </div>
                            <span className="text-sm font-semibold">{REPORT_TYPE_LABELS[typeKey][lang]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 2: Select Park & Location */}
                {wizardStep === 2 && (
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                        {t('أين تقع المشكلة؟', 'Where is the issue located?')}
                      </h2>
                      <p className="text-xs text-stone-500">
                        {t('حدّد الحديقة والمكان التقريبي لتصل فرقنا بسرعة.', 'Select the park and approximate spot.')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        {t('اختر الحديقة *', 'Select Damascus Park *')}
                      </label>
                      <select
                        value={parkId}
                        onChange={(e) => setParkId(e.target.value)}
                        className="w-full min-h-[48px] px-3.5 py-2.5 text-sm bg-white border border-[#D4DAD3] rounded-2xl focus:outline-none focus:border-[#14532D]"
                      >
                        {parks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.location}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-stone-700">
                          {t('المكان داخل الحديقة (اختياري)', 'Spot Inside Park (Optional)')}
                        </label>
                        <button
                          type="button"
                          disabled={geoLoading}
                          onClick={handleDetectLocation}
                          className="min-h-[44px] inline-flex items-center gap-1.5 px-3 text-xs font-bold text-[#14532D] bg-emerald-50 rounded-xl hover:bg-emerald-100"
                        >
                          <Compass className="w-4 h-4" />
                          <span>{geoLoading ? t('جارٍ التحديد...', 'Detecting...') : t('استخدام موقعي (GPS)', 'Use my GPS')}</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        maxLength={300}
                        value={locationDescription}
                        onChange={(e) => setLocationDescription(e.target.value)}
                        placeholder={t('مثال: قرب المدخل الرئيسي أو بجانب الألعاب', 'e.g. Near main gate or playground')}
                        className="w-full min-h-[48px] px-3.5 py-2.5 text-sm bg-white border border-[#D4DAD3] rounded-2xl focus:outline-none focus:border-[#14532D]"
                      />

                      <div className="flex flex-wrap gap-2">
                        {[
                          t('عند المدخل الرئيسي', 'Main Gate'),
                          t('قرب منطقة ألعاب الأطفال', 'Kids Playground'),
                          t('الممر الوسطي', 'Central Walkway'),
                          t('قرب المقاعد العائلية', 'Family Seating'),
                          t('بجانب المرافق الصحية', 'Near Restrooms'),
                        ].map((chip) => {
                          const selected = locationDescription === chip;
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setLocationDescription(chip)}
                              className={`min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors ${
                                selected
                                  ? 'bg-[#14532D] text-white border-[#14532D]'
                                  : 'bg-[#F7F8F6] border-[#E2E6E1] text-stone-700 hover:border-[#14532D]'
                              }`}
                            >
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: Add Photos & Description */}
                {wizardStep === 3 && (
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                        {t('أضف صورة ووصفاً واضحاً', 'Add Photos & Description')}
                      </h2>
                      <p className="text-xs text-stone-500">
                        {t('تساعد الصورة فرق الصيانة في فهم المشكلة وإصلاحها أسرع.', 'Photos help field crews assess and fix the issue faster.')}
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 min-h-[112px] border-2 border-dashed border-[#C7CFC6] bg-[#F7F8F6] rounded-2xl cursor-pointer hover:bg-stone-100 text-center">
                        <ImagePlus className="w-7 h-7 text-[#14532D]" />
                        <span className="text-sm font-semibold text-[#141E18]">
                          {photos.length > 0
                            ? t(`تم اختيار ${photos.length} من 4 صور — اضغط لإضافة المزيد`, `${photos.length}/4 selected — tap to add more`)
                            : t('التقط صورة أو اختر من الهاتف (اختياري · حتى 4 صور)', 'Take or upload up to 4 photos (optional)')}
                        </span>
                        <span className="text-[11px] text-stone-500">PNG / JPG / WebP</span>
                        <input
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handlePhotosChange}
                          className="hidden"
                        />
                      </label>

                      {photos.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {photos.map((p, idx) => (
                            <div key={p.url} className="relative rounded-xl overflow-hidden border border-[#E2E6E1] bg-stone-100 aspect-square">
                              <img src={p.url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removePhoto(idx)}
                                className="absolute top-1.5 end-1.5 min-w-[32px] min-h-[32px] rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-red-700"
                                aria-label={t('إزالة الصورة', 'Remove photo')}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">
                        {t('وصف المشكلة *', 'Problem Description *')}
                      </label>
                      <textarea
                        required
                        minLength={5}
                        maxLength={2000}
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t(
                          'اشرح المشكلة باختصار (مثال: الأرجوحة مكسورة في الجهة الشمالية أو السلة ممتلئة)...',
                          'Briefly describe what needs attention...'
                        )}
                        className="w-full px-3.5 py-3 text-sm bg-white border border-[#D4DAD3] rounded-2xl focus:outline-none focus:border-[#14532D]"
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[#E2E6E1]">
                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          {t('الاسم (اختياري)', 'Your Name (Optional)')}
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          value={reporterName}
                          onChange={(e) => setReporterName(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          {t('رقم الجوال للتواصل (اختياري)', 'Contact Phone (Optional)')}
                        </label>
                        <input
                          type="text"
                          maxLength={160}
                          value={reporterContact}
                          onChange={(e) => setReporterContact(e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: Review & Submit */}
                {wizardStep === 4 && (
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#141E18]">
                        {t('راجع بيانات بلاغك قبل الإرسال', 'Review Before Sending')}
                      </h2>
                      <p className="text-xs text-stone-500">
                        {t('تأكد من صحة الحديقة ونوع المشكلة ثم اضغط إرسال.', 'Confirm park and issue details below.')}
                      </p>
                    </div>

                    <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-5 space-y-3 text-sm">
                      <div className="flex justify-between gap-3 border-b border-[#E2E6E1] pb-2.5">
                        <span className="text-stone-500">{t('نوع المشكلة', 'Issue Type')}</span>
                        <span className="font-bold text-[#14532D]">{REPORT_TYPE_LABELS[reportType][lang]}</span>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-[#E2E6E1] pb-2.5">
                        <span className="text-stone-500">{t('الحديقة', 'Park')}</span>
                        <span className="font-semibold text-[#141E18] text-end">{selectedPark?.name || parkId}</span>
                      </div>
                      <div className="flex justify-between gap-3 border-b border-[#E2E6E1] pb-2.5">
                        <span className="text-stone-500">{t('الموقع التقريبي', 'Location')}</span>
                        <span className="font-medium text-[#141E18] text-end">
                          {locationDescription.trim() || t('داخل الحديقة', 'Inside park')}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-stone-500 block">{t('الوصف', 'Description')}</span>
                        <p className="text-[#141E18] whitespace-pre-line">{description}</p>
                      </div>
                      <div className="flex justify-between gap-3 pt-2 border-t border-[#E2E6E1]">
                        <span className="text-stone-500">{t('الصور المرفقة', 'Photos')}</span>
                        <span className="font-mono font-bold tabular-nums text-[#141E18]">{photos.length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Controls */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E2E6E1]">
                  {wizardStep > 1 ? (
                    <button
                      type="button"
                      onClick={handlePrevStep}
                      className="min-h-[48px] inline-flex items-center gap-1.5 px-5 py-3 text-sm font-semibold border border-[#D4DAD3] rounded-2xl hover:bg-stone-50"
                    >
                      <BackIcon className="w-4 h-4" />
                      <span>{t('السابق', 'Back')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchTab('home')}
                      className="min-h-[48px] px-4 py-3 text-sm font-medium text-stone-600 hover:text-[#141E18]"
                    >
                      {t('إلغاء', 'Cancel')}
                    </button>
                  )}

                  {wizardStep < 4 ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="min-h-[48px] inline-flex items-center gap-1.5 px-6 py-3 text-sm font-bold bg-[#14532D] hover:bg-[#0F3F22] text-white rounded-2xl transition-colors"
                    >
                      <span>{t('التالي', 'Next')}</span>
                      <NextChevron className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 px-7 py-3 bg-[#14532D] hover:bg-[#0F3F22] disabled:opacity-60 text-white text-sm sm:text-base font-bold rounded-2xl transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      <span>{submitting ? t('جارٍ الإرسال...', 'Submitting...') : t('إرسال البلاغ الآن', 'Submit Report Now')}</span>
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        )}

        {/* TAB 3: TRACK REPORTS (FixMyStreet Style) */}
        {activeTab === 'track' && (
          <div className="space-y-6">
            <section className="bg-white border border-[#E2E6E1] rounded-3xl p-5 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141E18]">
                    {t('متابعة البلاغات', 'Track Reports')}
                  </h1>
                  <p className="text-xs sm:text-sm text-stone-600">
                    {t(
                      'تابع حالة بلاغاتك المحفوظة أو ابحث باستخدام الرقم المرجعي.',
                      'Check your saved reports or look up any report by reference number.'
                    )}
                  </p>
                </div>
                {savedReports.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void refreshSavedReports(savedReports)}
                    className="min-h-[44px] px-4 text-xs font-bold text-[#14532D] bg-emerald-50 rounded-xl hover:bg-emerald-100"
                  >
                    {t('تحديث الحالات', 'Refresh Status')}
                  </button>
                )}
              </div>

              {/* Manual Search */}
              <form onSubmit={handleTrackSubmit} className="grid sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={trackQuery}
                  onChange={(e) => setTrackQuery(e.target.value)}
                  placeholder={t('رقم البلاغ (مثال: rep-...)', 'Reference ID (rep-...)')}
                  className="min-h-[46px] px-3.5 py-2.5 text-sm font-mono bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                />
                <input
                  type="text"
                  value={trackCodeQuery}
                  onChange={(e) => setTrackCodeQuery(e.target.value)}
                  placeholder={t('رمز المتابعة للصور (اختياري)', '6-digit code (optional)')}
                  className="min-h-[46px] px-3.5 py-2.5 text-sm font-mono bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                />
                <button
                  type="submit"
                  disabled={trackingLoading || !trackQuery.trim()}
                  className="min-h-[46px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold bg-[#14532D] text-white rounded-xl hover:bg-[#0F3F22] disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  <span>{trackingLoading ? t('جارٍ البحث...', 'Searching...') : t('بحث عن البلاغ', 'Search Report')}</span>
                </button>
              </form>

              {trackingError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800">
                  {trackingError}
                </div>
              )}

              {trackedReport && (
                <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-mono text-xs text-[#14532D] font-bold">{trackedReport.referenceNumber}</p>
                      <h3 className="font-display font-bold text-base text-[#141E18]">{trackedReport.title}</h3>
                      <p className="text-xs text-stone-600">
                        {trackedReport.parkName}
                        {trackedReport.parkLocation ? ` · ${trackedReport.parkLocation}` : ''}
                      </p>
                    </div>
                    <ReportStatusLabel status={trackedReport.status} />
                  </div>

                  {trackedReport.verified && trackedReport.imageUrls && trackedReport.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {trackedReport.imageUrls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt={trackedReport.title}
                          className="w-20 h-20 rounded-xl object-cover border border-[#E2E6E1]"
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E2E6E1] text-xs text-stone-500">
                    <span className="font-mono tabular-nums">
                      {t('التحديث:', 'Updated:')} {formatDateTime(trackedReport.updatedAt, lang)}
                    </span>
                    <Link
                      to={`/citizen/reports/${trackedReport.referenceNumber}`}
                      className="min-h-[44px] inline-flex items-center font-bold text-[#14532D] hover:underline"
                    >
                      {t('عرض التفاصيل والمراحل كاملة ←', 'View Full Timeline →')}
                    </Link>
                  </div>
                </div>
              )}

              {/* Saved Device Reports List */}
              {savedReports.length > 0 ? (
                <div className="space-y-3 pt-2 border-t border-[#E2E6E1]">
                  <h2 className="text-xs font-bold text-stone-500">
                    {t('البلاغات المرسلة من هذا الجهاز', 'Reports Submitted from This Device')}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {savedReports.map((item) => {
                      const live = trackedMap[item.referenceNumber];
                      const currentStatus = live?.status || item.lastKnownStatus;
                      const stageIdx = getCitizenStageIndex(currentStatus);
                      const thumb = live?.imageUrls?.[0];
                      return (
                        <Link
                          key={item.referenceNumber}
                          to={`/citizen/reports/${item.referenceNumber}`}
                          className="flex flex-col justify-between gap-3 p-4 rounded-2xl border border-[#E2E6E1] bg-[#F7F8F6] hover:border-[#14532D] transition-colors"
                        >
                          <div className="flex gap-3">
                            {thumb && (
                              <img
                                src={thumb}
                                alt={item.title}
                                className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#E2E6E1]"
                              />
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] font-bold text-[#14532D] truncate">
                                  {item.referenceNumber}
                                </span>
                                <ReportStatusLabel status={currentStatus} />
                              </div>
                              <p className="text-sm font-bold text-[#141E18] truncate">
                                {live?.title || item.title}
                              </p>
                              <p className="text-xs text-stone-500 truncate">
                                {live?.parkName || parks.find((p) => p.id === item.parkId)?.name || item.parkId}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="grid grid-cols-4 gap-1.5">
                              {[0, 1, 2, 3].map((step) => (
                                <div
                                  key={step}
                                  className={`h-1.5 rounded-full ${
                                    step <= stageIdx ? 'bg-[#15803D]' : 'bg-stone-200'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500">
                              <span className="font-mono tabular-nums">
                                {formatDateTime(live?.updatedAt || item.createdAt, lang)}
                              </span>
                              <span className="font-semibold text-[#14532D]">
                                {t('التفاصيل', 'Details')}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-6 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#141E18]">
                    {t('لا توجد بلاغات محفوظة على هذا الجهاز حالياً', 'No saved reports on this device yet')}
                  </p>
                  <button
                    type="button"
                    onClick={() => startNewReport()}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-[#14532D] text-white rounded-xl hover:bg-[#0F3F22]"
                  >
                    <Send className="w-4 h-4" />
                    <span>{t('إرسال أول بلاغ', 'Submit First Report')}</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: PARK INFORMATION & GUIDELINES */}
        {activeTab === 'parks' && (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141E18]">
                    {t('معلومات حدائق دمشق', 'Damascus Parks Information')}
                  </h1>
                  <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                    {t('تعرّف على الحدائق المشمولة واضغط «إرسال بلاغ» في أي حديقة مباشرة.', 'Browse covered parks and tap Report Issue for quick submission.')}
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="search"
                    value={parkSearch}
                    onChange={(e) => setParkSearch(e.target.value)}
                    placeholder={t('ابحث بالاسم أو الحي...', 'Search by name or area...')}
                    className="w-full min-h-[44px] ps-9 pe-3 py-2 text-sm bg-white border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredParks.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-[#E2E6E1] rounded-2xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <h2 className="font-display font-bold text-base text-[#141E18]">{p.name}</h2>
                      <p className="text-xs text-stone-600 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                        <span>{p.location}</span>
                      </p>
                      {p.description && (
                        <p className="text-xs text-stone-500 leading-relaxed">{p.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startNewReport(p.id)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold bg-[#F7F8F6] hover:bg-[#14532D] text-[#14532D] hover:text-white border border-[#D4DAD3] rounded-xl transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{t('إرسال بلاغ في هذه الحديقة', 'Report Issue Here')}</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Simple Guidelines */}
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#141E18]">
                  {t('إرشادات بسيطة لنظافة حديقتنا وسلامتها', 'Simple Park Care Guidelines')}
                </h2>
                <p className="text-xs sm:text-sm text-stone-600">
                  {t('تعاون الزوار مع فرق الحديقة يحفظ جمال المكان لجميع العائلات.', 'Visitor cooperation keeps our shared green spaces welcoming for everyone.')}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {guidelines.map((g) => {
                  const Icon = g.icon;
                  return (
                    <div key={g.title} className="bg-white border border-[#E2E6E1] rounded-2xl p-5 space-y-2.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#14532D] flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-display font-bold text-sm text-[#141E18]">{g.title}</h3>
                      <p className="text-xs text-stone-600 leading-relaxed">{g.text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (62px height, well inside 15% cap) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E6E1]"
        aria-label={t('تنقل بوابة المواطن', 'Citizen navigation')}
      >
        <div className="grid grid-cols-4 h-16">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => (tab.id === 'report' ? startNewReport() : switchTab(tab.id))}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors relative ${
                  active ? 'text-[#14532D] font-bold' : 'text-stone-500'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] leading-none">{tab.label}</span>
                {tab.count ? (
                  <span className="absolute top-1.5 end-4 font-mono text-[10px] font-bold text-[#14532D] tabular-nums">
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
