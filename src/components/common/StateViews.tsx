import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export function LoadingState({ message }: { message?: string }) {
  const { t } = useLanguage();
  return (
    <div className="bg-white border border-[#E2E6E1] rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
      <Loader2 className="w-6 h-6 text-[#14532D] animate-spin" aria-hidden="true" />
      <p className="text-sm text-stone-600">{message || t('جارٍ تحميل البيانات...', 'Loading data...')}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E2E6E1] rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-2.5">
      <div className="w-10 h-10 rounded-xl bg-[#F7F8F6] border border-[#E2E6E1] flex items-center justify-center text-stone-500">
        <Inbox className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-base font-bold text-[#141E18]">{title}</h3>
      <p className="text-xs sm:text-sm text-stone-600 max-w-md leading-relaxed">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="bg-red-50/70 border border-red-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-red-900">
            {t('تعذر إتمام العملية', 'Operation Failed')}
          </h3>
          <p className="text-xs sm:text-sm text-red-800 mt-0.5">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-semibold bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
        >
          {t('إعادة المحاولة', 'Retry')}
        </button>
      )}
    </div>
  );
}

export function FillProgressBar({
  percentage,
  warningThreshold = 80,
  criticalThreshold = 95,
}: {
  percentage: number;
  warningThreshold?: number;
  criticalThreshold?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const barColor =
    clamped >= criticalThreshold
      ? 'bg-red-600'
      : clamped >= warningThreshold
        ? 'bg-amber-500'
        : 'bg-[#15803D]';

  return (
    <div
      className="w-full h-2 bg-stone-200/80 rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
