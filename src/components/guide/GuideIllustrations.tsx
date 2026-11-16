type Language = 'ar' | 'en';

interface IllustrationProps {
  lang: Language;
  className?: string;
}

/**
 * Lightweight inline civic SVG illustrations tailored to Hadiqtna & Hadiqti.
 * Crisp at all DPIs, zero external asset requests, bilingual labels.
 */

export function HeroGuideIllustration({ lang, className = '' }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg
      viewBox="0 0 520 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`w-full h-auto ${className}`}
      role="img"
      aria-label={isAr ? 'رسم توضيحي لدورة العمل بين المواطن والحديقة وفريق الصيانة' : 'Illustration of the cycle between citizen, park, and maintenance crew'}
    >
      <rect x="1" y="1" width="518" height="338" rx="20" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="2" />

      {/* Subtle Park Horizon & Trees */}
      <path d="M24 272H496" stroke="#D4DAD3" strokeWidth="2" strokeLinecap="round" />
      <circle cx="84" cy="186" r="28" fill="#DCFCE7" stroke="#15803D" strokeWidth="2" />
      <rect x="81" y="214" width="6" height="58" rx="3" fill="#14532D" />
      <circle cx="436" cy="196" r="24" fill="#DCFCE7" stroke="#15803D" strokeWidth="2" />
      <rect x="433" y="220" width="6" height="52" rx="3" fill="#14532D" />

      {/* Connecting Flow Line */}
      <path
        d="M156 154H208M312 154H364"
        stroke="#15803D"
        strokeWidth="2.5"
        strokeDasharray="6 5"
        strokeLinecap="round"
      />
      <circle cx="182" cy="154" r="4" fill="#15803D" />
      <circle cx="338" cy="154" r="4" fill="#15803D" />

      {/* Card 1: Citizen Phone Report */}
      <rect x="38" y="64" width="118" height="176" rx="16" fill="#FFFFFF" stroke="#14532D" strokeWidth="2.5" />
      <rect x="76" y="74" width="42" height="5" rx="2.5" fill="#D4DAD3" />
      <rect x="52" y="92" width="90" height="48" rx="10" fill="#DCFCE7" />
      <path d="M97 104C91.5 104 87 108.5 87 114C87 121.5 97 131 97 131C97 131 107 121.5 107 114C107 108.5 102.5 104 97 104Z" fill="#14532D" />
      <circle cx="97" cy="114" r="3.5" fill="#FFFFFF" />
      <rect x="52" y="152" width="66" height="8" rx="4" fill="#141E18" />
      <rect x="52" y="168" width="84" height="6" rx="3" fill="#CBD5CE" />
      <rect x="52" y="180" width="56" height="6" rx="3" fill="#CBD5CE" />
      <rect x="52" y="200" width="90" height="24" rx="8" fill="#14532D" />
      <text x="97" y="216" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'إرسال بلاغ' : 'Report'}
      </text>

      {/* Card 2: Smart Park Bin & Sensor */}
      <rect x="208" y="88" width="104" height="148" rx="14" fill="#FFFFFF" stroke="#E2E6E1" strokeWidth="2" />
      <rect x="228" y="114" width="64" height="86" rx="8" fill="#F7F8F6" stroke="#14532D" strokeWidth="2" />
      <rect x="222" y="106" width="76" height="10" rx="5" fill="#14532D" />
      <rect x="236" y="148" width="48" height="44" rx="4" fill="#FEF3C7" />
      <rect x="236" y="166" width="48" height="26" rx="4" fill="#D97706" />
      <path d="M250 96C255 90 265 90 270 96" stroke="#15803D" strokeWidth="2" strokeLinecap="round" />
      <path d="M244 89C253 81 267 81 276 89" stroke="#15803D" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <text x="260" y="220" textAnchor="middle" fill="#141E18" fontSize="10" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'متابعة فورية' : 'Live Monitor'}
      </text>

      {/* Card 3: Field Resolution & Proof */}
      <rect x="364" y="64" width="118" height="176" rx="16" fill="#FFFFFF" stroke="#E2E6E1" strokeWidth="2" />
      <circle cx="423" cy="112" r="24" fill="#DCFCE7" />
      <path d="M412 112L420 120L435 104" stroke="#14532D" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="382" y="150" width="82" height="8" rx="4" fill="#141E18" />
      <rect x="392" y="166" width="62" height="6" rx="3" fill="#CBD5CE" />
      <rect x="382" y="186" width="82" height="36" rx="8" fill="#F7F8F6" stroke="#D4DAD3" strokeWidth="1.5" />
      <text x="423" y="208" textAnchor="middle" fill="#14532D" fontSize="10" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'تم الإصلاح ✓' : 'Resolved ✓'}
      </text>

      {/* Caption strip inside bottom */}
      <text x="260" y="306" textAnchor="middle" fill="#5A665E" fontSize="11" fontWeight="600" fontFamily="sans-serif">
        {isAr
          ? 'المواطن يبلّغ ← المشرف يوجّه ← الفريق يوثّق الإصلاح'
          : 'Citizen reports → Supervisor dispatches → Crew verifies'}
      </text>
    </svg>
  );
}

export function StepIssueIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" aria-hidden="true">
      <rect x="1" y="1" width="258" height="148" rx="14" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <rect x="18" y="18" width="224" height="28" rx="8" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <circle cx="34" cy="32" r="5" fill="#15803D" />
      <rect x="48" y="29" width="110" height="6" rx="3" fill="#141E18" />

      {/* 3 Category tiles, one active */}
      <rect x="18" y="58" width="68" height="72" rx="10" fill="#14532D" />
      <rect x="36" y="72" width="32" height="24" rx="4" fill="#DCFCE7" />
      <rect x="28" y="108" width="48" height="6" rx="3" fill="#FFFFFF" />

      <rect x="96" y="58" width="68" height="72" rx="10" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <circle cx="130" cy="84" r="12" fill="#FEF3C7" />
      <rect x="108" y="108" width="44" height="6" rx="3" fill="#94A3B8" />

      <rect x="174" y="58" width="68" height="72" rx="10" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <circle cx="208" cy="84" r="12" fill="#E0F2FE" />
      <rect x="186" y="108" width="44" height="6" rx="3" fill="#94A3B8" />
      <text x="52" y="122" textAnchor="middle" fill="#A7F3D0" fontSize="8" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'مختار' : 'Selected'}
      </text>
    </svg>
  );
}

export function StepLocationIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" aria-hidden="true">
      <rect x="1" y="1" width="258" height="148" rx="14" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      {/* Park map paths */}
      <path d="M20 112C70 86 110 96 156 64C190 42 216 42 242 54" stroke="#D4DAD3" strokeWidth="10" strokeLinecap="round" />
      <path d="M40 34C72 58 102 82 132 126" stroke="#E2E6E1" strokeWidth="8" strokeLinecap="round" />
      {/* Park patches */}
      <circle cx="52" cy="82" r="14" fill="#DCFCE7" />
      <circle cx="204" cy="108" r="18" fill="#DCFCE7" />
      {/* GPS Pulse & Pin */}
      <circle cx="136" cy="70" r="24" fill="#15803D" fillOpacity="0.12" />
      <circle cx="136" cy="70" r="14" fill="#15803D" fillOpacity="0.22" />
      <path
        d="M136 42C127.7 42 121 48.7 121 57C121 68.3 136 84 136 84C136 84 151 68.3 151 57C151 48.7 144.3 42 136 42Z"
        fill="#14532D"
      />
      <circle cx="136" cy="57" r="5" fill="#FFFFFF" />
      <rect x="64" y="114" width="132" height="22" rx="8" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <text x="130" y="129" textAnchor="middle" fill="#141E18" fontSize="9" fontWeight="600" fontFamily="sans-serif">
        {isAr ? 'قرب المدخل أو GPS' : 'Entrance / GPS Pin'}
      </text>
    </svg>
  );
}

export function StepPhotoIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" aria-hidden="true">
      <rect x="1" y="1" width="258" height="148" rx="14" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      {/* Camera / Upload Box */}
      <rect x="20" y="22" width="102" height="78" rx="12" fill="#FFFFFF" stroke="#15803D" strokeWidth="1.5" strokeDasharray="5 4" />
      <rect x="52" y="42" width="38" height="28" rx="6" fill="#DCFCE7" stroke="#14532D" strokeWidth="1.5" />
      <circle cx="71" cy="56" r="6" fill="#14532D" />
      <text x="71" y="88" textAnchor="middle" fill="#14532D" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'حتى 4 صور' : 'Up to 4 photos'}
      </text>

      {/* Uploaded Thumbnail + Notes */}
      <rect x="136" y="22" width="104" height="44" rx="10" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <rect x="144" y="30" width="28" height="28" rx="6" fill="#DCFCE7" />
      <path d="M148 52L155 44L162 50L168 45" stroke="#14532D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="180" y="36" width="48" height="6" rx="3" fill="#141E18" />
      <rect x="180" y="47" width="32" height="5" rx="2.5" fill="#94A3B8" />

      <rect x="136" y="76" width="104" height="52" rx="10" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <rect x="146" y="88" width="84" height="6" rx="3" fill="#CBD5CE" />
      <rect x="146" y="100" width="70" height="6" rx="3" fill="#CBD5CE" />
      <rect x="146" y="112" width="48" height="6" rx="3" fill="#CBD5CE" />

      <rect x="20" y="110" width="102" height="18" rx="6" fill="#E2E6E1" />
      <text x="71" y="122" textAnchor="middle" fill="#5A665E" fontSize="8" fontWeight="600" fontFamily="sans-serif">
        {isAr ? 'وصف مختصر واضح' : 'Short clear note'}
      </text>
    </svg>
  );
}

export function StepReceiptIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" aria-hidden="true">
      <rect x="1" y="1" width="258" height="148" rx="14" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <rect x="22" y="16" width="216" height="118" rx="14" fill="#FFFFFF" stroke="#14532D" strokeWidth="1.5" />
      <circle cx="48" cy="42" r="13" fill="#DCFCE7" />
      <path d="M42 42L46 46L54 38" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="70" y="34" width="104" height="7" rx="3.5" fill="#141E18" />
      <rect x="70" y="46" width="76" height="5" rx="2.5" fill="#94A3B8" />

      {/* Reference & 6-digit code */}
      <rect x="34" y="68" width="92" height="52" rx="10" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="80" y="85" textAnchor="middle" fill="#5A665E" fontSize="8" fontFamily="sans-serif">
        {isAr ? 'الرقم المرجعي' : 'Reference ID'}
      </text>
      <text x="80" y="105" textAnchor="middle" fill="#14532D" fontSize="11" fontWeight="700" fontFamily="monospace">
        rep-1042
      </text>

      <rect x="134" y="68" width="92" height="52" rx="10" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="180" y="85" textAnchor="middle" fill="#5A665E" fontSize="8" fontFamily="sans-serif">
        {isAr ? 'رمز المتابعة' : '6-Digit Code'}
      </text>
      <text x="180" y="105" textAnchor="middle" fill="#141E18" fontSize="12" fontWeight="700" fontFamily="monospace">
        482910
      </text>
    </svg>
  );
}

export function TrackingTimelineIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  const stages = isAr
    ? ['استلام البلاغ', 'قيد المراجعة', 'جاري التنفيذ', 'تم الإصلاح']
    : ['Received', 'Under Review', 'In Progress', 'Resolved'];

  return (
    <svg
      viewBox="0 0 560 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label={isAr ? 'مراحل متابعة البلاغ الأربع' : 'Four stages of citizen report tracking'}
    >
      <rect x="1" y="1" width="558" height="178" rx="18" fill="#FFFFFF" stroke="#E2E6E1" strokeWidth="2" />

      {/* Progress Track */}
      <line x1="78" y1="68" x2="482" y2="68" stroke="#E2E6E1" strokeWidth="6" strokeLinecap="round" />
      <line x1="78" y1="68" x2="482" y2="68" stroke="#15803D" strokeWidth="6" strokeLinecap="round" />

      {[78, 212, 346, 482].map((cx, idx) => (
        <g key={cx}>
          <circle cx={cx} cy="68" r="18" fill={idx === 3 ? '#14532D' : '#DCFCE7'} stroke="#15803D" strokeWidth="2.5" />
          {idx === 3 ? (
            <path d={`M${cx - 6} 68L${cx - 1} 73L${cx + 7} 63`} stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <text
              x={cx}
              y="72"
              textAnchor="middle"
              fill="#14532D"
              fontSize="12"
              fontWeight="700"
              fontFamily="monospace"
            >
              {idx + 1}
            </text>
          )}
          <text
            x={cx}
            y="108"
            textAnchor="middle"
            fill="#141E18"
            fontSize="11"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            {stages[idx]}
          </text>
        </g>
      ))}

      {/* Bottom Proof Note */}
      <rect x="44" y="128" width="472" height="32" rx="10" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="280" y="148" textAnchor="middle" fill="#14532D" fontSize="11" fontWeight="600" fontFamily="sans-serif">
        {isAr
          ? 'بعد إغلاق المهمة تظهر صورة الإصلاح الموثقة مباشرة في صفحة متابعة البلاغ'
          : 'Once completed, verified after-repair photo proof appears inside the report timeline'}
      </text>
    </svg>
  );
}

export function StaffWorkflowIllustration({ lang }: IllustrationProps) {
  const isAr = lang === 'ar';
  return (
    <svg
      viewBox="0 0 460 270"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label={isAr ? 'مخطط لوحة الموظف ومعالجة البلاغات والحاويات' : 'Staff dashboard workflow for bins and citizen reports'}
    >
      <rect x="1" y="1" width="458" height="268" rx="18" fill="#FFFFFF" stroke="#E2E6E1" strokeWidth="2" />

      {/* Sidebar schematic */}
      <rect x="14" y="14" width="96" height="242" rx="12" fill="#0F291E" />
      <rect x="28" y="32" width="68" height="10" rx="5" fill="#15803D" />
      <rect x="28" y="58" width="56" height="7" rx="3.5" fill="#7E9B89" />
      <rect x="28" y="76" width="64" height="7" rx="3.5" fill="#7E9B89" />
      <rect x="28" y="94" width="52" height="7" rx="3.5" fill="#1B4A34" />
      <rect x="28" y="112" width="60" height="7" rx="3.5" fill="#7E9B89" />

      {/* Main cards inside dashboard schematic */}
      <rect x="126" y="20" width="150" height="96" rx="12" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="201" y="44" textAnchor="middle" fill="#141E18" fontSize="10" fontWeight="700" fontFamily="sans-serif">
        {isAr ? '1. تنبيهات الحاويات' : '1. Smart Bin Alerts'}
      </text>
      <rect x="142" y="60" width="118" height="12" rx="6" fill="#E2E6E1" />
      <rect x="142" y="60" width="96" height="12" rx="6" fill="#D97706" />
      <text x="201" y="96" textAnchor="middle" fill="#5A665E" fontSize="9" fontFamily="sans-serif">
        {isAr ? 'تفريغ عند تجاوز العتبة' : 'Empty when threshold exceeded'}
      </text>

      <rect x="290" y="20" width="154" height="96" rx="12" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="367" y="44" textAnchor="middle" fill="#141E18" fontSize="10" fontWeight="700" fontFamily="sans-serif">
        {isAr ? '2. فرز البلاغات' : '2. Triage Reports'}
      </text>
      <rect x="308" y="60" width="118" height="14" rx="5" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1" />
      <rect x="308" y="82" width="118" height="20" rx="6" fill="#14532D" />
      <text x="367" y="95" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'تحويل لمهمة صيانة' : 'Convert to Work Order'}
      </text>

      {/* Bottom Work Order Proof Bar */}
      <rect x="126" y="132" width="318" height="118" rx="12" fill="#F7F8F6" stroke="#E2E6E1" strokeWidth="1.5" />
      <text x="285" y="158" textAnchor="middle" fill="#141E18" fontSize="11" fontWeight="700" fontFamily="sans-serif">
        {isAr ? '3. التنفيذ الميداني وتوثيق الصورة' : '3. Field Execution & Photo Verification'}
      </text>

      <rect x="146" y="176" width="84" height="52" rx="8" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <text x="188" y="206" textAnchor="middle" fill="#14532D" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'قيد التنفيذ' : 'In Progress'}
      </text>

      <path d="M236 202H252" stroke="#15803D" strokeWidth="2" strokeLinecap="round" />

      <rect x="256" y="176" width="84" height="52" rx="8" fill="#FFFFFF" stroke="#D4DAD3" strokeWidth="1.5" />
      <text x="298" y="206" textAnchor="middle" fill="#141E18" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'رفع صورة الإنجاز' : 'Upload Photo'}
      </text>

      <path d="M346 202H362" stroke="#15803D" strokeWidth="2" strokeLinecap="round" />

      <rect x="366" y="176" width="62" height="52" rx="8" fill="#14532D" />
      <text x="397" y="206" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        {isAr ? 'مكتمل ✓' : 'Done ✓'}
      </text>
    </svg>
  );
}
