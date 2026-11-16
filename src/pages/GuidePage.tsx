import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Globe,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  HeroGuideIllustration,
  StaffWorkflowIllustration,
  StepIssueIllustration,
  StepLocationIllustration,
  StepPhotoIllustration,
  StepReceiptIllustration,
  TrackingTimelineIllustration,
} from '../components/guide/GuideIllustrations';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

type AudienceFilter = 'ALL' | 'CITIZEN' | 'STAFF';

export function GuidePage() {
  const { profile } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [audience, setAudience] = useState<AudienceFilter>('ALL');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;
  const staffDestination = profile?.isActive ? '/staff' : '/login';

  const citizenReportSteps = [
    {
      num: '01',
      title: t('اختر الحديقة ونوع المشكلة', 'Select the Park & Issue Type'),
      summary: t(
        'افتح تبويب «بلاغ جديد» في بوابة المواطن «حديقتي»، واختر إحدى حدائق دمشق ثم حدد نوع المشكلة بضغطة واحدة (سلة ممتلئة، تراكم نفايات، ألعاب أطفال، مقاعد، حمامات، إنارة).',
        'Open the Report tab in Hadiqti, pick the Damascus park, and tap the issue category (full bin, cleanliness, playground, bench, restroom, lighting).'
      ),
      tip: t('لا يلزم إنشاء حساب أو تسجيل دخول لإرسال البلاغ.', 'No account or login is required to submit a report.'),
      Illustration: StepIssueIllustration,
    },
    {
      num: '02',
      title: t('حدد الموقع داخل الحديقة', 'Pin the Location Inside the Park'),
      summary: t(
        'اختر موقعاً جاهزاً مثل «قرب البوابة الرئيسية» أو «منطقة ألعاب الأطفال»، أو اكتب وصفاً واضحاً، كما يمكنك الضغط على «تحديد موقعي الحالي» لتعبئة الإحداثيات تلقائياً.',
        'Pick a quick preset like Main Gate or Playground Area, write a short landmark note, or tap Use My Current Location to attach GPS coordinates.'
      ),
      tip: t('الوصف الدقيق يوصل فريق الصيانة مباشرة إلى مكان المشكلة.', 'A clear landmark guides maintenance crews directly to the spot.'),
      Illustration: StepLocationIllustration,
    },
    {
      num: '03',
      title: t('أرفق صورة ووصفاً مختصراً', 'Attach Photos & Short Notes'),
      summary: t(
        'يمكنك إرفاق حتى 4 صور واضحة للمشكلة مع وصف مختصر في سطرين. إضافة اسمك أو رقم هاتفك اختياري تماماً إذا رغبت بالتواصل.',
        'Attach up to 4 clear photos and add a brief note. Adding your name or contact info is completely optional.'
      ),
      tip: t('الصورة الواضحة تساعد المشرف على تحديد الأدوات والطاقم المناسب.', 'A clear photo helps supervisors assign the right crew and tools.'),
      Illustration: StepPhotoIllustration,
    },
    {
      num: '04',
      title: t('راجع وأرسل واحتفظ برمزي المتابعة', 'Review, Submit & Save Your Codes'),
      summary: t(
        'راجع تفاصيل البلاغ واضغط «إرسال البلاغ الآن». سيظهر لك فوراً الرقم المرجعي (مثل rep-1042) ورمز متابعة من 6 أرقام، كما يُحفظ البلاغ تلقائياً على جهازك.',
        'Confirm your summary and tap Submit Report. You immediately get a reference ID and a 6-digit tracking code, plus automatic saving on your device.'
      ),
      tip: t('استخدم زر النسخ للاحتفاظ بالرقمين إذا أردت المتابعة من هاتف آخر.', 'Use the copy buttons if you plan to track from another device later.'),
      Illustration: StepReceiptIllustration,
    },
  ];

  const trackingMethods = [
    {
      icon: Smartphone,
      title: t('المتابعة التلقائية من نفس الجهاز', 'Automatic Tracking on This Device'),
      desc: t(
        'افتح تبويب «متابعاتي» في بوابة المواطن لتشاهد قائمة بلاغاتك محفوظة تلقائياً مع شريط المراحل الأربع وتنبيه فوري عند تغير الحالة.',
        'Open the My Reports tab in Hadiqti to see your saved reports with a 4-stage progress bar and instant status update alerts.'
      ),
    },
    {
      icon: Search,
      title: t('البحث اليدوي من أي جهاز بالرقم المرجعي', 'Manual Lookup From Any Device'),
      desc: t(
        'أدخل الرقم المرجعي في خانة البحث داخل «متابعاتي». وإذا أضفت رمز المتابعة المكوّن من 6 أرقام، ستظهر لك الصور المرفقة وسجل التحديثات الكامل وصورة الإصلاح.',
        'Enter the Reference ID in My Reports search. Adding your 6-digit tracking code unlocks uploaded photos, full history, and after-repair proof.'
      ),
    },
  ];

  const staffSteps = [
    {
      num: '01',
      icon: KeyRound,
      title: t('تسجيل الدخول المعتمد', 'Authorized Staff Sign-In'),
      desc: t(
        'يدخل الموظف من زر «لوحة الموظف» عبر حساب Google المعتمد أو البريد الإلكتروني وكلمة المرور، وتُفتح له الواجهة المناسبة لصلاحيته.',
        'Staff sign in via Google or authorized email credentials to open their role-appropriate operational workspace.'
      ),
    },
    {
      num: '02',
      icon: Trash2,
      title: t('مراقبة الحاويات الذكية والتنبيهات', 'Monitor Smart Bins & Threshold Alerts'),
      desc: t(
        'في أقسام «الحاويات الذكية» و«تنبيهات العتبة» تظهر نسب الامتلاء الفعلية. وإذا لم تصل قراءة من الحساس بعد تُعرض عبارة «لا توجد بيانات حالية» دون أرقام وهمية.',
        'Review real fill percentages in Smart Bins and Alerts. Unread bins explicitly display "No current data" instead of fabricated numbers.'
      ),
    },
    {
      num: '03',
      icon: ClipboardCheck,
      title: t('مراجعة بلاغات المواطنين وتحويلها لمهام', 'Triage Citizen Reports into Work Orders'),
      desc: t(
        'في شاشة «بلاغات المواطنين» يراجع المشرف البلاغ والصور، ثم يقبله أو يحوّله مباشرة إلى مهمة صيانة بأولوية محددة مع تعيين فني أو عامل.',
        'Supervisors inspect incoming citizen reports and photos in Citizen Reports, then convert valid cases into prioritized work orders.'
      ),
    },
    {
      num: '04',
      icon: Wrench,
      title: t('التنفيذ الميداني وتوثيق الإصلاح بالصورة', 'Complete Field Task & Upload Proof'),
      desc: t(
        'يستلم العامل المهمة من «واجهة الموظف» أو «الصيانة والمهام»، ويحوّلها إلى قيد التنفيذ، وعند الانتهاء يرفع صورة بعد الإصلاح ويغلق المهمة ليُبلّغ المواطن تلقائياً.',
        'Field crew opens Staff Workspace or Maintenance, moves the task to In Progress, uploads after-repair photo proof, and closes the case.'
      ),
    },
  ];

  const faqs = [
    {
      q: t('هل أحتاج إلى إنشاء حساب لإرسال بلاغ في بوابة «حديقتي»؟', 'Do citizens need an account to submit a park report?'),
      a: t(
        'لا، بوابة المواطن مفتوحة للجميع دون أي تسجيل دخول لتسهيل الإبلاغ السريع من داخل الحديقة في أقل من دقيقة.',
        'No. The Citizen Portal requires zero sign-in so park visitors can report issues in under a minute.'
      ),
    },
    {
      q: t('ما فائدة رمز المتابعة المكوّن من 6 أرقام؟', 'Why is there a 6-digit tracking code alongside the reference number?'),
      a: t(
        'الرقم المرجعي يكفي لمعرفة الحالة العامة للبلاغ، بينما يحمي رمز الـ 6 أرقام خصوصية الصور المرفقة وسجل التفاصيل بحيث لا يطلع عليها إلا صاحب البلاغ.',
        'The reference number shows general status, while the 6-digit code protects attached photos and detailed verification proof for the reporter.'
      ),
    },
    {
      q: t('كيف أتأكد أن المشكلة قد حُلّت بالفعل؟', 'How do I verify a reported issue was actually fixed?'),
      a: t(
        'عند إغلاق المهمة من قبل طاقم الصيانة، يرفع الموظف صورة توثيقية بعد الإصلاح وتظهر تلقائياً في صفحة تفاصيل البلاغ تحت بند «صورة بعد الإصلاح».',
        'When field staff close a work order, they upload an after-repair photo that appears inside your report timeline.'
      ),
    },
    {
      q: t('ما الفرق بين «الحاويات الذكية» و«بلاغات المواطنين» في لوحة الموظف؟', 'What is the difference between Smart Bins and Citizen Reports?'),
      a: t(
        'الحاويات الذكية تراقب امتلاء السلال آلياً عبر الحساسات، أما بلاغات المواطنين فتنقل ملاحظات الزوار حول النظافة أو تلف الألعاب والمقاعد والإنارة والحمامات.',
        'Smart Bins track automated fill-level readings from sensors, while Citizen Reports capture visitor reports about overflow, playgrounds, benches, lighting, and restrooms.'
      ),
    },
  ];

  const showCitizen = audience === 'ALL' || audience === 'CITIZEN';
  const showStaff = audience === 'ALL' || audience === 'STAFF';

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col">
      {/* Top Bar: Clean 3-Zone Contract */}
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
            <a href="#citizen-submit" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('تقديم البلاغ', 'Submit Report')}
            </a>
            <a href="#citizen-track" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('متابعة البلاغ', 'Track Report')}
            </a>
            <a href="#staff-guide" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('دليل الموظف', 'Staff Guide')}
            </a>
            <a href="#faq" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              {t('أسئلة شائعة', 'FAQ')}
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
              className="md:hidden p-2 text-stone-600 hover:text-[#14532D] min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={t('تبديل اللغة', 'Switch language')}
            >
              <Globe className="w-4 h-4" />
            </button>
            <Link
              to="/citizen"
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#14532D] rounded-lg hover:bg-[#0F3F22] transition-colors whitespace-nowrap shrink-0"
            >
              {t('بوابة المواطن', 'Citizen Portal')}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10 lg:pt-12 lg:pb-14">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-semibold text-[#15803D]">
                {t('دليل الاستخدام المبسط · للمواطنين والموظفين', 'Quick Usage Guide · For Citizens & Staff')}
              </p>
              <h1
                className="font-display font-bold text-[#141E18] leading-[1.2] tracking-tight"
                style={{ fontSize: 'clamp(1.85rem, 3.3vw, 2.75rem)', textWrap: 'balance' }}
              >
                {t(
                  'كيف تستخدم منصة «حديقتنا» خطوة بخطوة',
                  'How to Use Hadiqtna Step by Step'
                )}
              </h1>
              <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                {t(
                  'شرح عملي ومصور يوضح كيفية إرسال بلاغ عن أي مشكلة في حدائق دمشق ومتابعته حتى الحل، وكيف يتعامل الموظف مع البلاغات والحاويات الذكية.',
                  'A visual, step-by-step walkthrough showing how visitors report and track Damascus park issues, and how municipal crews resolve and verify them.'
                )}
              </p>

              {/* Audience Filter Control */}
              <div className="space-y-2 pt-1">
                <span className="block text-xs font-semibold text-stone-500">
                  {t('اعرض الدليل حسب دورك:', 'Filter guide by role:')}
                </span>
                <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E2E6E1] rounded-xl">
                  {(
                    [
                      { id: 'ALL', label: t('الدليل الكامل', 'Full Guide') },
                      { id: 'CITIZEN', label: t('للمواطن والزائر', 'Citizens & Visitors') },
                      { id: 'STAFF', label: t('للموظف والمشرف', 'Staff & Crew') },
                    ] as const
                  ).map((item) => {
                    const active = audience === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAudience(item.id)}
                        className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#14532D] text-white'
                            : 'text-stone-700 hover:bg-[#F7F8F6]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <HeroGuideIllustration lang={lang} />
            </div>
          </div>
        </section>

        {/* SECTION 1: CITIZEN REPORT SUBMISSION (4 ILLUSTRATED STEPS) */}
        {showCitizen && (
          <section id="citizen-submit" className="bg-white border-y border-[#E2E6E1] py-12 lg:py-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="max-w-2xl space-y-2">
                  <p className="text-xs font-semibold text-[#15803D]">
                    {t('القسم الأول · بوابة المواطن «حديقتي»', 'Part 01 · Hadiqti Citizen Portal')}
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#141E18]">
                    {t('تقديم البلاغ في 4 خطوات بسيطة', 'Submitting a Report in 4 Simple Steps')}
                  </h2>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {t(
                      'صُممت الخطوات الأربع للهاتف بحيث يستغرق إرسال البلاغ أقل من دقيقة واحدة دون الحاجة لتسجيل حساب.',
                      'Designed mobile-first so anyone in the park can report an issue in under a minute without registering.'
                    )}
                  </p>
                </div>

                <Link
                  to="/citizen?tab=report"
                  className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#14532D] rounded-xl hover:bg-[#0F3F22] transition-colors whitespace-nowrap shrink-0"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span>{t('ابدأ بلاغاً الآن', 'Start a Report Now')}</span>
                </Link>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {citizenReportSteps.map((step) => {
                  const Illustration = step.Illustration;
                  return (
                    <article
                      key={step.num}
                      className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#14532D]">
                          <span className="font-mono tabular-nums text-sm font-bold">{step.num}</span>
                          <span className="text-stone-500">{t('خطوة سريعة', 'Quick step')}</span>
                        </div>

                        <Illustration lang={lang} />

                        <div className="space-y-2">
                          <h3 className="font-display text-base font-bold text-[#141E18]">{step.title}</h3>
                          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">{step.summary}</p>
                        </div>
                      </div>

                      <p className="pt-3 border-t border-[#E2E6E1] text-xs font-medium text-[#14532D] flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{step.tip}</span>
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 2: CITIZEN REPORT TRACKING */}
        {showCitizen && (
          <section id="citizen-track" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold text-[#15803D]">
                {t('القسم الثاني · الشفافية والمتابعة', 'Part 02 · Live Progress Tracking')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#141E18]">
                {t('كيف تتابع بلاغك حتى يتم الإصلاح؟', 'How to Track Your Report Until Resolution')}
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                {t(
                  'بمجرد إرسال البلاغ، يمكنك متابعة انتقاله من مرحلة الاستلام وحتى التوثيق بصورة الإصلاح النهائية بطريقتين بسيطتين.',
                  'Follow your report transparently from submission through maintenance photo proof in two effortless ways.'
                )}
              </p>
            </div>

            <TrackingTimelineIllustration lang={lang} />

            <div className="grid md:grid-cols-2 gap-5">
              {trackingMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <div
                    key={method.title}
                    className="bg-white border border-[#E2E6E1] rounded-2xl p-6 space-y-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#14532D] flex items-center justify-center">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#141E18]">{method.title}</h3>
                    <p className="text-sm text-stone-600 leading-relaxed">{method.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Quiet privacy & quick park tip */}
            <div className="bg-white border border-[#E2E6E1] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#141E18]">
                    {t('ملاحظة مهمة حول رمز المتابعة والخصوصية', 'Privacy Note About Your 6-Digit Tracking Code')}
                  </p>
                  <p className="text-xs sm:text-sm text-stone-600">
                    {t(
                      'الرقم المرجعي يظهر حالة البلاغ العامة لأي شخص، أما إدخال رمز الـ 6 أرقام فيفتح الصور المرفقة وصورة الإصلاح الميداني.',
                      'The reference number displays general progress, while your 6-digit code unlocks the original and after-repair verification photos.'
                    )}
                  </p>
                </div>
              </div>
              <Link
                to="/citizen?tab=track"
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-bold text-[#14532D] bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl hover:bg-stone-100 whitespace-nowrap shrink-0"
              >
                <span>{t('فتح صفحة متابعة البلاغات', 'Open Tracking Tab')}</span>
                <ArrowIcon className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        {/* SECTION 3: STAFF & CREW WORKFLOW */}
        {showStaff && (
          <section id="staff-guide" className="bg-white border-y border-[#E2E6E1] py-12 lg:py-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
              <div className="grid lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-6 space-y-3">
                  <p className="text-xs font-semibold text-[#15803D]">
                    {t('القسم الثالث · لوحة الموظف والتشغيل', 'Part 03 · Municipal Staff Console')}
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#141E18]">
                    {t('كيف يتعامل الموظف والمشرف مع المنصة؟', 'How Staff & Supervisors Operate the Platform')}
                  </h2>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {t(
                      'توفر لوحة الموظف شاشة موحدة لمتابعة حساسات الحاويات في حدائق دمشق، وفرز بلاغات المواطنين، وتوجيه فرق الصيانة حتى التوثيق.',
                      'The staff dashboard unites smart bin sensor telemetry, citizen report triage, and field maintenance execution with visual proof.'
                    )}
                  </p>
                  <div className="pt-2">
                    <Link
                      to={staffDestination}
                      className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-[#141E18] bg-[#F7F8F6] border border-[#D4DAD3] rounded-xl hover:bg-stone-100 transition-colors whitespace-nowrap"
                    >
                      <LayoutDashboard className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
                      <span>{t('الانتقال إلى لوحة الموظف', 'Go to Staff Dashboard')}</span>
                    </Link>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <StaffWorkflowIllustration lang={lang} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {staffSteps.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.num}
                      className="bg-[#F7F8F6] border border-[#E2E6E1] rounded-2xl p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="w-9 h-9 rounded-xl bg-white border border-[#E2E6E1] text-[#14532D] flex items-center justify-center">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="font-mono tabular-nums text-xs font-bold text-stone-500">
                          {item.num}
                        </span>
                      </div>
                      <h3 className="font-display text-base font-bold text-[#141E18]">{item.title}</h3>
                      <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 4: QUICK FAQ ACCORDION */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-6">
          <div className="space-y-1.5 text-center">
            <p className="text-xs font-semibold text-[#15803D]">
              {t('إجابات سريعة', 'Quick Answers')}
            </p>
            <h2 className="font-display text-2xl font-bold text-[#141E18]">
              {t('أسئلة متكررة حول استخدام المنصة', 'Frequently Asked Questions')}
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.q}
                  className="bg-white border border-[#E2E6E1] rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full min-h-[54px] px-5 py-4 flex items-center justify-between gap-4 text-start hover:bg-[#F7F8F6] transition-colors"
                  >
                    <span className="font-display text-sm sm:text-base font-bold text-[#141E18]">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-stone-500 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#14532D]' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 text-xs sm:text-sm text-stone-600 leading-relaxed border-t border-[#EEF1ED]">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Action Strip */}
          <div className="bg-[#14532D] text-white rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-lg sm:text-xl font-bold">
                {t('جاهز للبدء في حدائق دمشق؟', 'Ready to Start?')}
              </h3>
              <p className="text-xs sm:text-sm text-emerald-100">
                {t(
                  'أبلغ عن مشكلة في الحديقة خلال ثوانٍ أو ادخل إلى لوحة التشغيل الميداني.',
                  'Report a park issue in seconds or sign in to the operations console.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/citizen?tab=report"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-[#14532D] bg-white rounded-xl hover:bg-emerald-50 transition-colors whitespace-nowrap"
              >
                <MapPin className="w-4 h-4" aria-hidden="true" />
                <span>{t('تقديم بلاغ الآن', 'Submit a Report')}</span>
              </Link>
              <Link
                to={staffDestination}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1B4A34] border border-emerald-400/30 rounded-xl hover:bg-[#235C41] transition-colors whitespace-nowrap"
              >
                <span>{t('لوحة الموظف', 'Staff Login')}</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-[#E2E6E1] py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <p>{t('حديقتنا ومنصة حديقتي — دليل استخدام حدائق دمشق', 'Hadiqtna & Hadiqti — Usage Guide')}</p>
          <div className="flex items-center gap-5">
            <Link to="/" className="hover:text-[#14532D] transition-colors">
              {t('الرئيسية', 'Home')}
            </Link>
            <Link to="/citizen" className="hover:text-[#14532D] transition-colors">
              {t('بوابة المواطن', 'Citizen Portal')}
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
