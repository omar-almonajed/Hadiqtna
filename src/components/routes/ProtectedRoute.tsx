import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldAlert, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { UserRole } from '../../types/domain';
import { LoadingState } from '../common/StateViews';

export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: ReactNode;
}) {
  const { profile, loading, logout } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F5F1] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <LoadingState message={t('جارٍ التحقق من الجلسة والصلاحيات...', 'Verifying session and permissions...')} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!profile.isActive || profile.role === 'PENDING') {
    return (
      <div className="min-h-screen bg-[#F6F5F1] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E6E1] rounded-lg p-8 max-w-lg w-full space-y-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800">
            <Clock className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-[#17211C]">
            {t('الحساب بانتظار التفعيل الإداري', 'Account Pending Activation')}
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            {t(
              `تم تسجيل دخولك بالبريد (${profile.email}) بنجاح، ولكن هذا الحساب لم يُمنح صلاحية تشغيلية بعد. يرجى التواصل مع مدير النظام لتفعيل حسابك وتعيين الدور المناسب (مشرف أو فني صيانة).`,
              `You signed in as ${profile.email}, but your account is pending administrator activation and role assignment.`
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 text-sm font-medium bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] transition-colors"
            >
              {t('تسجيل الخروج', 'Sign Out')}
            </button>
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium border border-[#E2E6E1] text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
            >
              {t('العودة للرئيسية', 'Back to Home')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen bg-[#F6F5F1] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E6E1] rounded-lg p-8 max-w-lg w-full space-y-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-[#17211C]">
            {t('وصول غير مصرح به', 'Unauthorized Access')}
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            {t(
              'ليست لديك الصلاحية المطلوبة لعرض هذه الصفحة وفق دورك الوظيفي الحالي.',
              'Your current staff role does not have permission to view this page.'
            )}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <Link
              to={
                profile.role === 'WORKER' || profile.role === 'MAINTENANCE' || profile.role === 'OPERATOR'
                  ? '/staff'
                  : '/dashboard'
              }
              className="px-4 py-2 text-sm font-medium bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] transition-colors"
            >
              {t('الانتقال إلى صفحتي المصرحة', 'Go to Permitted View')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
