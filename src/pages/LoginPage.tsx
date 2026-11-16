import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest } from '../services/apiClient';
import { ROLE_LABELS } from '../utils/i18n';

interface AuthMethodsInfo {
  googleSignIn: boolean;
  emailPasswordFirebase: boolean;
  localStaffAuthEnabled: boolean;
  phoneAuth963Supported: boolean;
  phoneAuthWarning?: string;
}

export function LoginPage() {
  const {
    profile,
    loading,
    authError,
    signInWithGoogle,
    signInWithEmailPassword,
    signInWithLocalStaff,
    logout,
  } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [methods, setMethods] = useState<AuthMethodsInfo | null>(null);
  const [showAltLogin, setShowAltLogin] = useState(false);
  const [altMode, setAltMode] = useState<'LOCAL_STAFF' | 'FIREBASE_EMAIL'>('FIREBASE_EMAIL');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    apiRequest<AuthMethodsInfo>('/api/auth/methods', { authenticated: false })
      .then((res) => {
        setMethods(res);
        if (res.localStaffAuthEnabled) {
          setAltMode('LOCAL_STAFF');
        }
      })
      .catch(() => {
        // Ignore non-critical discovery failure
      });
  }, []);

  useEffect(() => {
    if (!loading && profile?.isActive && profile.role !== 'PENDING') {
      const goStaff =
        profile.role === 'WORKER' || profile.role === 'MAINTENANCE' || profile.role === 'OPERATOR';
      navigate(goStaff ? '/staff' : '/dashboard', { replace: true });
    }
  }, [loading, profile, navigate]);

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t('تعذر إتمام تسجيل الدخول عبر Google.', 'Google Sign-In failed.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAltSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      if (altMode === 'LOCAL_STAFF') {
        await signInWithLocalStaff(email, password);
      } else {
        await signInWithEmailPassword(email, password);
      }
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t('تعذر تسجيل الدخول بالبريد وكلمة المرور.', 'Sign-in failed.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#141E18] flex flex-col">
      <header className="bg-white border-b border-[#E2E6E1] px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="font-display text-lg font-bold text-[#14532D]">
          {t('حديقتنا', 'Hadiqtna')}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 text-stone-600 hover:text-[#14532D]"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          <Link to="/" className="inline-flex items-center gap-1 text-stone-600 hover:text-[#14532D]">
            <ArrowRight className="w-4 h-4" />
            <span>{t('الرئيسية', 'Home')}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white border border-[#E2E6E1] rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#14532D]/10 text-[#14532D] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#141E18]">
              {t('دخول لوحة الموظف والفرق الميدانية', 'Staff & Field Crew Portal')}
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              {t(
                'سجّل الدخول لفتح لوحة الموظف ومتابعة مهام الصيانة وحاويات حدائق دمشق (عبر Google أو البريد المعتمد).',
                'Sign in via Google or authorized email credentials to open your Damascus parks staff dashboard.'
              )}
            </p>
          </div>

          {loading ? (
            <div className="bg-[#F6F5F1] border border-[#E2E6E1] rounded-lg p-4 text-xs text-stone-600 flex items-center justify-center">
              {t('جارٍ التحقق من الجلسة الحالية...', 'Checking active session...')}
            </div>
          ) : (
            (localError || authError) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-xs text-red-800">
                {localError || authError}
              </div>
            )
          )}

          {!loading && profile && (!profile.isActive || profile.role === 'PENDING') ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-950">
                {t('الحساب مسجل وبانتظار التفعيل', 'Account Registered · Pending Activation')}
              </p>
              <p className="text-xs text-amber-900 leading-relaxed">
                {t(
                  `البريد الإلكتروني: ${profile.email} · الحالة الحالية: ${ROLE_LABELS[profile.role][lang]}. يرجى مراجعة مدير النظام لتفعيل الصلاحية.`,
                  `Email: ${profile.email} · Role: ${ROLE_LABELS[profile.role][lang]}. Contact your administrator to activate access.`
                )}
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full py-2.5 px-4 text-sm font-medium border border-amber-300 bg-white text-amber-900 rounded-lg hover:bg-amber-100/50 transition-colors"
              >
                {t('تسجيل الخروج وتبديل الحساب', 'Sign Out & Switch Account')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                disabled={loading || submitting}
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-[#14532D] hover:bg-[#0F3F22] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {submitting
                    ? t('جارٍ تسجيل الدخول...', 'Signing in...')
                    : t('تسجيل الدخول عبر Google', 'Sign in with Google')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowAltLogin((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-stone-600 hover:text-[#14532D]"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {showAltLogin
                    ? t('إخفاء الدخول البديل بالبريد وكلمة المرور', 'Hide Email/Local Login')
                    : t('خيار بديل: الدخول بالبريد وكلمة المرور / الخادم المحلي', 'Alternative: Email or Local Server Login')}
                </span>
              </button>

              {showAltLogin && (
                <form onSubmit={handleAltSubmit} className="pt-3 border-t border-[#E2E6E1] space-y-3">
                  <div className="flex gap-1 p-1 bg-[#F6F5F1] rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setAltMode('FIREBASE_EMAIL')}
                      className={`flex-1 py-1.5 rounded font-medium ${
                        altMode === 'FIREBASE_EMAIL' ? 'bg-white text-[#17211C] shadow-xs' : 'text-stone-600'
                      }`}
                    >
                      Firebase Email
                    </button>
                    {methods?.localStaffAuthEnabled && (
                      <button
                        type="button"
                        onClick={() => setAltMode('LOCAL_STAFF')}
                        className={`flex-1 py-1.5 rounded font-medium ${
                          altMode === 'LOCAL_STAFF' ? 'bg-white text-[#17211C] shadow-xs' : 'text-stone-600'
                        }`}
                      >
                        {t('مصادقة محلية (LAN)', 'Local Server Auth')}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      {t('البريد الإلكتروني', 'Email')}
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">
                      {t('كلمة المرور', 'Password')}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      dir="ltr"
                      className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 text-xs font-semibold bg-stone-800 hover:bg-stone-900 text-white rounded-lg"
                  >
                    {t('تسجيل الدخول', 'Sign In')}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[#E2E6E1] flex items-center justify-between text-xs text-stone-500">
            <span>{t('زائر للحديقة؟', 'Park visitor?')}</span>
            <Link to="/citizen" className="text-[#14532D] font-semibold hover:underline">
              {t('تقديم بلاغ صيانة بدون تسجيل', 'Submit a Citizen Report')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
