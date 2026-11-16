import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Globe,
  Leaf,
  MapPin,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  Smartphone,
  LayoutDashboard,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest } from '../services/apiClient';

interface PublicParkSummary {
  id: string;
  name: string;
  location: string;
  description?: string;
  status: string;
  binCount?: number;
}

const FALLBACK_DAMASCUS_PARKS: PublicParkSummary[] = [
  {
    id: 'park-alnakheel',
    name: 'حديقة تشرين العامة (دمشق)',
    location: 'دمشق — حي المهاجرين / ساحة الأمويين',
    description: 'أكبر حدائق دمشق العامة، مجهزة بمراقبة امتلاء الحاويات وبوابة حديقتي لبلاغات المرافق.',
    status: 'ACTIVE',
    binCount: 2,
  },
  {
    id: 'park-damascus-sabki',
    name: 'حديقة السبكي (دمشق)',
    location: 'دمشق — حي الشعلان / شارع السبكي',
    description: 'حديقة حيوية وسط دمشق، مجهزة بحساسات امتلاء الحاويات ومتابعة الصيانة.',
    status: 'ACTIVE',
    binCount: 2,
  },
  {
    id: 'park-damascus-jahiz',
    name: 'حديقة الجاحظ (دمشق)',
    location: 'دمشق — حي أبو رمانة / ساحة الجاحظ',
    description: 'حديقة في أبو رمانة بدمشق مرتبطة بمراقبة الحاويات وبوابة حديقتي.',
    status: 'ACTIVE',
    binCount: 1,
  },
  {
    id: 'park-damascus-madfaa',
    name: 'حديقة المدفع (دمشق)',
    location: 'دمشق — حي المالكي / أبو رمانة',
    description: 'متنزه عائلي في المالكي بدمشق مزود بعقدة مراقبة مع تخزين مؤقت عند انقطاع الشبكة.',
    status: 'ACTIVE',
    binCount: 1,
  },
  {
    id: 'park-damascus-tijara',
    name: 'حديقة التجارة (دمشق)',
    location: 'دمشق — حي التجارة / القصور',
    description: 'حديقة تخدم أحياء التجارة والقصور والعباسيين بدمشق ومرتبطة بأولويات التفريغ.',
    status: 'ACTIVE',
    binCount: 1,
  },
  {
    id: 'park-damascus-soufaniyeh',
    name: 'حديقة الصوفانية (دمشق)',
    location: 'دمشق — حي باب توما / القصاع',
    description: 'حديقة خضراء في باب توما والقصاع بدمشق مجهزة لمتابعة الحاويات وصيانة المرافق.',
    status: 'ACTIVE',
    binCount: 1,
  },
  {
    id: 'park-damascus-mezzeh',
    name: 'حديقة الطلائع والمزة (دمشق)',
    location: 'دمشق — حي المزة فيلات غربية',
    description: 'متنزه في المزة بدمشق مزود بمراقبة امتلاء الحاويات وبلاغات الزوار.',
    status: 'ACTIVE',
    binCount: 1,
  },
];

function isDamascusEntry(park: PublicParkSummary): boolean {
  return (
    park.id === 'park-alnakheel' ||
    park.id.startsWith('park-damascus-') ||
    park.location.includes('دمشق') ||
    park.name.includes('دمشق')
  );
}

export function LandingPage() {
  const { profile } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [heroImgOk, setHeroImgOk] = useState(true);
  const [parks, setParks] = useState<PublicParkSummary[]>(FALLBACK_DAMASCUS_PARKS);
  const [parkSearch, setParkSearch] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<{ parks: PublicParkSummary[] }>('/api/parks/public', { authenticated: false })
      .then((res) => {
        if (!active || !res.parks || res.parks.length === 0) return;
        setParks(res.parks.filter(isDamascusEntry));
      })
      .catch(() => {
        // Retain Damascus fallback list if API is temporarily unavailable
      });
    return () => {
      active = false;
    };
  }, []);

  const damascusParks = parks.filter(isDamascusEntry);
  const normalizedQuery = parkSearch.trim().toLowerCase();
  const displayedParks = damascusParks.filter((park) => {
    if (!normalizedQuery) return true;
    return (
      park.name.toLowerCase().includes(normalizedQuery) ||
      park.location.toLowerCase().includes(normalizedQuery) ||
      (park.description || '').toLowerCase().includes(normalizedQuery)
    );
  });

  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;
  const staffDestination = profile?.isActive ? '/staff' : '/login';

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col">
      {/* Top Bar: Clean 3-zone header */}
      <header className="bg-white/95 backdrop-blur border-b border-[#E2E6E1] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-[#14532D] whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-lg bg-[#14532D] text-white text-sm font-bold flex items-center justify-center">
              ح
            </span>
            <span>{t('حديقتنا', 'Hadiqtna')}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-700">
            <a href="#portals" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('البوابتان', 'Portals')}
            </a>
            <a href="#how-it-works" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('كيف تعمل', 'How It Works')}
            </a>
            <Link to="/guide" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('دليل الاستخدام', 'Usage Guide')}
            </Link>
            <a href="#damascus-parks" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('حدائق دمشق', 'Damascus Parks')}
            </a>
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 text-stone-600 hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0"
            >
              <Globe className="w-4 h-4" aria-hidden="true" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              className="md:hidden p-2 text-stone-600 hover:text-[#14532D]"
              aria-label={t('تبديل اللغة', 'Switch language')}
            >
              <Globe className="w-4 h-4" />
            </button>
            <Link
              to={staffDestination}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#14532D] rounded-lg hover:bg-[#0F3F22] transition-colors whitespace-nowrap shrink-0"
            >
              {t('لوحة الموظف', 'Staff Dashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 1. Hero Split */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-semibold tracking-wide text-[#15803D]">
                {t('إدارة حدائق دمشق العامة · خدمات ذكية متكاملة', 'Damascus Public Parks · Civic Care & Operations')}
              </p>
              <h1
                className="font-display font-bold text-[#141E18] leading-[1.2] tracking-tight"
                style={{ fontSize: 'clamp(1.95rem, 3.6vw, 3rem)', textWrap: 'balance' }}
              >
                {t(
                  'حدائق دمشق أنظف وأكثر أماناً عبر بوابة للمواطن ولوحة تشغيل للموظف',
                  'Cleaner, Safer Damascus Parks via Dedicated Citizen & Staff Portals'
                )}
              </h1>
              <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                {t(
                  'تجمع منصة «حديقتنا» بين تجربة إبلاغ فورية وبسيطة للزوار عبر بوابة «حديقتي»، ولوحة قيادة متخصصة لفرق النظافة والصيانة لمتابعة الحاويات الذكية والبلاغات حتى الإغلاق.',
                  'Hadiqtna connects effortless citizen reporting on the Hadiqti portal with a dedicated municipal operations console for smart bins and field maintenance.'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/citizen"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm sm:text-base font-bold text-white bg-[#14532D] rounded-xl hover:bg-[#0F3F22] transition-colors whitespace-nowrap min-h-[48px]"
                >
                  <span>{t('دخول بوابة المواطن «حديقتي»', 'Open Citizen Portal')}</span>
                  <ArrowIcon className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link
                  to={staffDestination}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#141E18] bg-white border border-[#D4DAD3] rounded-xl hover:bg-stone-50 transition-colors whitespace-nowrap min-h-[48px]"
                >
                  <span>{t('لوحة الموظف', 'Staff Dashboard')}</span>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-[270px] sm:h-[340px] lg:h-[390px] rounded-2xl overflow-hidden border border-[#E2E6E1] bg-stone-200">
                {heroImgOk ? (
                  <img
                    src="/src/assets/images/hero_smart_park_1794680260992.jpg"
                    alt={t('حديقة عامة في دمشق مجهزة بحاوية ذكية', 'Damascus public park with a smart waste bin')}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgOk(false)}
                  />
                ) : (
                  <div className="w-full h-full bg-[#14532D] text-white flex flex-col items-center justify-center p-8 text-center gap-3">
                    <Leaf className="w-10 h-10 text-emerald-300" />
                    <p className="font-display text-lg font-semibold">{t('حديقتنا | حدائق دمشق', 'Hadiqtna | Damascus Parks')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Two Separate Purpose-Built Portals */}
        <section id="portals" className="bg-white border-y border-[#E2E6E1] py-12 lg:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="max-w-2xl space-y-1.5">
              <p className="text-xs font-semibold text-[#15803D]">
                {t('تجربتان منفصلتان ومصممتان لكل مستخدم', 'Two Distinct Experiences, One Shared System')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#141E18]">
                {t('اختر الواجهة المناسبة لدورك', 'Choose Your Portal')}
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Citizen Portal Card */}
              <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-[#14532D] flex items-center justify-center">
                    <Smartphone className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display text-xl font-bold text-[#141E18]">
                      {t('بوابة المواطن «حديقتي»', 'Citizen Portal — Hadiqti')}
                    </h3>
                    <p className="text-sm text-stone-600 leading-relaxed">
                      {t(
                        'واجهة شديدة البساطة مصممة للهاتف لتقديم البلاغات خلال 4 خطوات سريعة دون تسجيل حساب، ومتابعة مراحل الإصلاح بوضوح.',
                        'Mobile-first civic interface to submit park issues in 4 guided steps without an account and track resolution live.'
                      )}
                    </p>
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm text-stone-700 pt-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      <span>{t('إرسال بلاغ سريع: المشكلة ← الموقع ← الصورة والوصف ← التأكيد', '4-step flow: Issue → Location → Photo & Notes → Submit')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      <span>{t('متابعة حالة البلاغ بالرقم المرجعي ورمز المتابعة', 'Track report status with reference number & 6-digit code')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      <span>{t('معلومات حدائق دمشق وإرشادات المحافظة على النظافة', 'Damascus park info and simple stewardship guidelines')}</span>
                    </li>
                  </ul>
                </div>

                <Link
                  to="/citizen"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-[#14532D] rounded-xl hover:bg-[#0F3F22] transition-colors min-h-[46px]"
                >
                  <span>{t('فتح بوابة المواطن', 'Open Citizen Portal')}</span>
                  <ArrowIcon className="w-4 h-4" />
                </Link>
              </div>

              {/* Staff Dashboard Card */}
              <div className="bg-white border border-[#E2E6E1] rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-stone-100 text-[#141E18] flex items-center justify-center">
                    <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display text-xl font-bold text-[#141E18]">
                      {t('لوحة الموظف والتشغيل البلدي', 'Municipal Staff Dashboard')}
                    </h3>
                    <p className="text-sm text-stone-600 leading-relaxed">
                      {t(
                        'منصة تشغيل احترافية لمتابعة الحاويات الذكية وحساسات ESP32، مراجعة بلاغات المواطنين، جدولة فرق الصيانة، وقراءة التحليلات.',
                        'Professional desktop command center for smart bins, ESP32 telemetry, citizen case management, work-order scheduling, and analytics.'
                      )}
                    </p>
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm text-stone-700 pt-1">
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#14532D] shrink-0" />
                      <span>{t('مراقبة الحاويات الذكية والتنبيهات اللحظية لتجاوز العتبة', 'Real-time smart bin monitoring & threshold alerts')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#14532D] shrink-0" />
                      <span>{t('تحويل البلاغات إلى مهام صيانة وتوثيق الإصلاح بالصور', 'Convert citizen reports into tasks with after-repair photo proof')}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#14532D] shrink-0" />
                      <span>{t('تحليلات تشغيلية حقيقية مبنية على السجلات الفعلية', 'Operational analytics built strictly from live persisted data')}</span>
                    </li>
                  </ul>
                </div>

                <Link
                  to={staffDestination}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-[#141E18] bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl hover:bg-stone-100 transition-colors min-h-[46px]"
                >
                  <span>{t('الدخول إلى لوحة الموظف', 'Sign In to Staff Dashboard')}</span>
                  <ArrowIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 3. How It Works (Concise 3 Mechanisms) */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-14 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-1.5">
              <p className="text-xs font-semibold text-[#15803D]">
                {t('آلية العمل الميداني', 'How It Works')}
              </p>
              <h2 className="font-display text-2xl font-bold text-[#141E18]">
                {t('دورة متكاملة من الحساس والبلاغ حتى الإنجاز', 'From Sensor & Citizen Report to Field Resolution')}
              </h2>
            </div>
            <Link
              to="/guide"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#14532D] hover:underline whitespace-nowrap shrink-0"
            >
              <span>{t('عرض دليل الاستخدام المصوّر', 'View Visual Usage Guide')}</span>
              <ArrowIcon className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white border border-[#E2E6E1] rounded-2xl p-5 space-y-2.5">
              <Cpu className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
              <h3 className="font-display font-bold text-base text-[#141E18]">
                {t('01. حساسات الحاويات القائمة', '01. Smart Bin Sensors')}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                {t(
                  'حساسات تُركّب على الحاويات الحالية لقياس مستوى الامتلاء وإرسال تنبيه عند الحاجة للتفريغ مع تخزين مؤقت عند انقطاع الشبكة.',
                  'Sensors mount onto existing park bins to track fill levels, trigger emptying alerts, and buffer readings offline.'
                )}
              </p>
            </div>

            <div className="bg-white border border-[#E2E6E1] rounded-2xl p-5 space-y-2.5">
              <MessageSquareWarning className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
              <h3 className="font-display font-bold text-base text-[#141E18]">
                {t('02. بلاغات «حديقتي» السريعة', '02. Instant Hadiqti Reports')}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                {t(
                  'يرسل الزوار بلاغات الأعطال أو تراكم النفايات بالصورة والموقع من الهاتف ويحصلون على رقم مرجعي لمتابعة الحالة.',
                  'Visitors submit facility or overflow issues with photos and location from mobile, receiving a trackable reference ID.'
                )}
              </p>
            </div>

            <div className="bg-white border border-[#E2E6E1] rounded-2xl p-5 space-y-2.5">
              <ClipboardCheck className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
              <h3 className="font-display font-bold text-base text-[#141E18]">
                {t('03. فرق الصيانة والتنفيذ', '03. Coordinated Field Action')}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                {t(
                  'تتلقى فرق دمشق الإشعارات وتنفذ التفريغ والإصلاح مع توثيق صورة بعد الصيانة، ليصل التحديث تلقائياً للمبلّغ.',
                  'Municipal teams receive instant alerts, complete repairs with photo verification, and update citizen timelines automatically.'
                )}
              </p>
            </div>
          </div>
        </section>

        {/* 4. Searchable Damascus Parks Directory */}
        <section id="damascus-parks" className="bg-white border-t border-[#E2E6E1] py-12 lg:py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#15803D]">
                  {t('دليل حدائق محافظة دمشق', 'Damascus Governorate Park Directory')}
                </p>
                <h2 className="font-display text-2xl font-bold text-[#141E18]">
                  {t(`الحدائق المشمولة (${damascusParks.length})`, `Covered Damascus Parks (${damascusParks.length})`)}
                </h2>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={parkSearch}
                  onChange={(e) => setParkSearch(e.target.value)}
                  placeholder={t('ابحث عن الحديقة بالاسم أو الحي...', 'Search Damascus park by name or area...')}
                  aria-label={t('ابحث عن الحديقة', 'Search for a park')}
                  className="w-full ps-9 pe-8 py-2.5 text-xs sm:text-sm bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl focus:outline-none focus:border-[#14532D]"
                />
                {parkSearch && (
                  <button
                    type="button"
                    onClick={() => setParkSearch('')}
                    aria-label={t('مسح البحث', 'Clear search')}
                    className="absolute top-1/2 -translate-y-1/2 end-2.5 text-stone-400 hover:text-stone-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {displayedParks.length === 0 ? (
              <div className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-[#141E18]">
                  {t(`لا توجد حديقة مطابقة للبحث "${parkSearch}"`, `No Damascus park matched "${parkSearch}"`)}
                </p>
                <button
                  type="button"
                  onClick={() => setParkSearch('')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg hover:bg-[#0F3F22]"
                >
                  {t('عرض جميع حدائق دمشق', 'Show all Damascus parks')}
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedParks.map((park) => (
                  <div
                    key={park.id}
                    className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#14532D]/40 transition-colors"
                  >
                    <div className="space-y-2">
                      <h3 className="font-display font-bold text-base text-[#141E18]">{park.name}</h3>
                      <p className="flex items-start gap-1.5 text-xs font-medium text-stone-700 leading-relaxed">
                        <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{park.location}</span>
                      </p>
                      {park.description && (
                        <p className="text-xs text-stone-600 leading-relaxed">{park.description}</p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[#E2E6E1] flex items-center justify-between gap-2">
                      <span className="text-xs text-stone-500">
                        {t('بلاغات الزوار متاحة', 'Citizen reporting open')}
                      </span>
                      <Link
                        to={`/citizen?park=${encodeURIComponent(park.id)}&tab=report`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#14532D] hover:underline"
                      >
                        <span>{t('إرسال بلاغ', 'Report Issue')}</span>
                        <ArrowIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="bg-[#F7F8F6] border-t border-[#E2E6E1] py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>{t('حديقتنا ومنصة حديقتي — خدمة حدائق دمشق العامة', 'Hadiqtna & Hadiqti — Damascus Public Park Services')}</p>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hover:text-[#14532D] transition-colors">
              {t('دليل الاستخدام', 'Usage Guide')}
            </Link>
            <Link to="/citizen" className="hover:text-[#14532D] transition-colors">
              {t('بوابة المواطن «حديقتي»', 'Citizen Portal')}
            </Link>
            <Link to={staffDestination} className="hover:text-[#14532D] transition-colors">
              {t('لوحة الموظف', 'Staff Dashboard')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
