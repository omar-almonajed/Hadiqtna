import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  FlaskConical,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type {
  AlertSeverity,
  AlertStatus,
  Bin,
  BinStatus,
  DeviceConnectionStatus,
  PriorityLevel,
  ReadingSource,
  ReportStatus,
  TaskStatus,
} from '../../types/domain';
import {
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  BIN_STATUS_LABELS,
  DEVICE_STATUS_LABELS,
  getOperationalBinCategory,
  OPERATIONAL_BIN_CATEGORY_LABELS,
  PRIORITY_LABELS,
  REPORT_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '../../utils/i18n';

export function OperationalBinLabel({ bin }: { bin: Pick<Bin, 'status' | 'currentFillPercentage' | 'lastReadingAt'> }) {
  const { lang } = useLanguage();
  const cat = getOperationalBinCategory(bin);
  const label = OPERATIONAL_BIN_CATEGORY_LABELS[cat][lang];
  const colorMap: Record<typeof cat, string> = {
    NO_DATA: 'text-stone-500',
    EMPTY: 'text-emerald-800',
    PARTIAL: 'text-slate-700',
    NEEDS_EMPTYING: 'text-amber-700 font-semibold',
    FULL: 'text-red-700 font-semibold',
    OFFLINE: 'text-stone-600',
  };
  const Icon =
    cat === 'EMPTY'
      ? CheckCircle2
      : cat === 'PARTIAL'
        ? Clock
        : cat === 'NEEDS_EMPTYING'
          ? AlertTriangle
          : cat === 'FULL'
            ? AlertCircle
            : cat === 'OFFLINE'
              ? WifiOff
              : Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorMap[cat]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function BinStatusLabel({ status }: { status: BinStatus }) {
  const { lang } = useLanguage();
  const label = BIN_STATUS_LABELS[status][lang];
  const colorMap: Record<BinStatus, string> = {
    NORMAL: 'text-emerald-800',
    WARNING: 'text-amber-700',
    CRITICAL: 'text-red-700',
    FULL: 'text-red-800 font-semibold',
    OFFLINE: 'text-stone-600',
    MAINTENANCE: 'text-slate-700',
  };
  const Icon =
    status === 'NORMAL'
      ? CheckCircle2
      : status === 'WARNING'
        ? AlertTriangle
        : status === 'CRITICAL' || status === 'FULL'
          ? AlertCircle
          : status === 'OFFLINE'
            ? WifiOff
            : Wrench;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorMap[status]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function DeviceStatusLabel({ status }: { status: DeviceConnectionStatus }) {
  const { lang } = useLanguage();
  const label = DEVICE_STATUS_LABELS[status][lang];
  if (status === 'ONLINE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 whitespace-nowrap">
        <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'OFFLINE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function SourceTag({ source }: { source: ReadingSource | undefined }) {
  const { t } = useLanguage();
  if (!source) return <span className="text-xs text-stone-400">—</span>;
  if (source === 'DEMO') {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-wide text-amber-800 whitespace-nowrap">
        <FlaskConical className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>DEMO · {t('تجريبي', 'Simulated')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-wide text-emerald-900 whitespace-nowrap">
      <Cpu className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>HARDWARE · {t('حقيقي', 'ESP32')}</span>
    </span>
  );
}

export function AlertSeverityLabel({ severity }: { severity: AlertSeverity }) {
  const { lang } = useLanguage();
  const color =
    severity === 'CRITICAL'
      ? 'text-red-700 font-semibold'
      : severity === 'WARNING'
        ? 'text-amber-700 font-medium'
        : 'text-slate-700';
  return <span className={`text-xs whitespace-nowrap ${color}`}>{ALERT_SEVERITY_LABELS[severity][lang]}</span>;
}

export function AlertStatusLabel({ status }: { status: AlertStatus }) {
  const { lang } = useLanguage();
  const color =
    status === 'ACTIVE'
      ? 'text-red-700 font-semibold'
      : status === 'ACKNOWLEDGED'
        ? 'text-amber-700 font-medium'
        : 'text-emerald-800';
  return <span className={`text-xs whitespace-nowrap ${color}`}>{ALERT_STATUS_LABELS[status][lang]}</span>;
}

export function ReportStatusLabel({ status }: { status: ReportStatus }) {
  const { lang } = useLanguage();
  const color =
    status === 'NEW'
      ? 'text-amber-800 font-semibold'
      : status === 'REJECTED'
        ? 'text-stone-500'
        : status === 'RESOLVED' || status === 'CLOSED'
          ? 'text-emerald-800 font-semibold'
          : status === 'IN_PROGRESS' || status === 'CONVERTED_TO_TASK'
            ? 'text-[#14532D] font-medium'
            : 'text-slate-800 font-medium';
  const Icon =
    status === 'RESOLVED' || status === 'CLOSED'
      ? CheckCircle2
      : status === 'NEW'
        ? AlertCircle
        : status === 'IN_PROGRESS' || status === 'CONVERTED_TO_TASK'
          ? Wrench
          : Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{REPORT_STATUS_LABELS[status]?.[lang] || status}</span>
    </span>
  );
}

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  const { lang } = useLanguage();
  const color =
    status === 'COMPLETED'
      ? 'text-emerald-800 font-semibold'
      : status === 'IN_PROGRESS'
        ? 'text-amber-700 font-medium'
        : status === 'CANCELLED'
          ? 'text-stone-500'
          : 'text-slate-800';
  return <span className={`text-xs whitespace-nowrap ${color}`}>{TASK_STATUS_LABELS[status][lang]}</span>;
}

export function PriorityLabel({ priority }: { priority: PriorityLevel }) {
  const { lang } = useLanguage();
  const color =
    priority === 'URGENT'
      ? 'text-red-700 font-semibold'
      : priority === 'HIGH'
        ? 'text-amber-700 font-medium'
        : 'text-stone-600';
  return <span className={`text-xs whitespace-nowrap ${color}`}>{PRIORITY_LABELS[priority][lang]}</span>;
}
