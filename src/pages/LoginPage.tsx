import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Globe, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ROLE_LABELS } from '../utils/i18n';

export function LoginPage() {
  const { profile, loading, authError, signInWithLocalStaff, logout } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [email, setEmail] = useState('admin@hadiqtna.local');
  const [password, setPassword] = useState('admin123');
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile?.isActive && profile.role !== 'PENDING') {
      const goStaff =
        profile.role === 'WORKER' || profile.role === 'MAINTENANCE' || profile.role === 'OPERATOR';
      navigate(goStaff ? '/staff' : '/dashboard', { replace: true });
    }
  }, [loading, profile, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);

    try {
      await signInWithLocalStaff(email, password);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t('تعذر تسجيل الدخول، يرجى التحقق من البيانات.', 'Sign-in failed. Please verify your credentials.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F3] text-[#111827] flex flex-col">
      <header className="h-16 border-b border-[#E5E7EB] bg-white/90 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between">
        <Link to="/" className="font-display text-lg font-bold text-[#14532D]">
          {t('حديقتنا', 'Hadiqtna')}
        </Link>

        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={toggleLang}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('الرئيسية', 'Home')}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-6 shadow-[0_20px_45px_rgba(17,24,39,0.06)] sm:p-8">
            <div className="flex justify-center mb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#14532D]/10 text-[#14532D]">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
                {t('تسجيل الدخول', 'Sign in')}
              </h1>
              <p className="mt-2 text-sm text-stone-600">
                {t('لوحة موظفي حدائق دمشق', 'Damascus parks staff dashboard')}
              </p>
            </div>

            {loading ? (
              <div className="rounded-xl border border-[#E5E7EB] bg-stone-50 p-3 text-center text-xs text-stone-600">
                {t('جارٍ التحقق من الجلسة...', 'Checking session...')}
              </div>
            ) : (
              (localError || authError) && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {localError || authError}
                </div>
              )
            )}

            {!loading && profile && (!profile.isActive || profile.role === 'PENDING') ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  {t('الحساب مسجل وبانتظار التفعيل', 'Account pending activation')}
                </p>
                <p className="mt-2 text-xs leading-6 text-amber-900">
                  {t(
                    `البريد الإلكتروني: ${profile.email} · الحالة: ${ROLE_LABELS[profile.role][lang]}.`,
                    `Email: ${profile.email} · Status: ${ROLE_LABELS[profile.role][lang]}.`
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="mt-3 w-full rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                >
                  {t('تسجيل الخروج', 'Sign out')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    {t('البريد الإلكتروني', 'Email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    placeholder="admin@hadiqtna.local"
                    className="w-full rounded-xl border border-[#D1D5DB] bg-stone-50 px-3 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[#14532D] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">
                    {t('كلمة المرور', 'Password')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#D1D5DB] bg-stone-50 px-3 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[#14532D] focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#14532D] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0F3F22] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting
                    ? t('جارٍ تسجيل الدخول...', 'Signing in...')
                    : t('دخول', 'Sign in')}
                </button>
              </form>
            )}

            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-medium">
                {t('حساب تجريبي', 'Demo account')}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-emerald-700">Email</span>
                <span className="font-semibold">admin@hadiqtna.local</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-emerald-700">Password</span>
                <span className="font-semibold">admin123</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-stone-500">
              <span>{t('زائر للحديقة؟', 'Park visitor?')}</span>
              <Link to="/citizen" className="font-semibold text-[#14532D] hover:underline">
                {t('تقديم بلاغ', 'Submit a report')}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
