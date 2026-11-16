import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  BinStatus,
  BinType,
  DeviceConnectionStatus,
  NotificationType,
  ParkStatus,
  PriorityLevel,
  ReportStatus,
  ReportType,
  TaskStatus,
  UserRole,
} from '../types/domain';

export type Language = 'ar' | 'en';

export function formatDateTime(iso: string | undefined, lang: Language = 'ar'): string {
  if (!iso) return lang === 'ar' ? 'لا توجد بيانات حالية' : 'No current data';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortTime(iso: string | undefined, lang: Language = 'ar'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export const ROLE_LABELS: Record<UserRole, { ar: string; en: string }> = {
  ADMIN: { ar: 'مدير النظام', en: 'System Admin' },
  SUPERVISOR: { ar: 'مشرف الحديقة', en: 'Park Supervisor' },
  OPERATOR: { ar: 'موظف التشغيل', en: 'Operations Staff' },
  MAINTENANCE: { ar: 'موظف الصيانة', en: 'Maintenance Staff' },
  WORKER: { ar: 'موظف الصيانة', en: 'Maintenance Staff' },
  PENDING: { ar: 'بانتظار التفعيل', en: 'Pending Approval' },
};

export const PARK_STATUS_LABELS: Record<ParkStatus, { ar: string; en: string }> = {
  ACTIVE: { ar: 'نشطة', en: 'Active' },
  MAINTENANCE: { ar: 'تحت الصيانة', en: 'Maintenance' },
  INACTIVE: { ar: 'متوقفة', en: 'Inactive' },
};

export const BIN_TYPE_LABELS: Record<BinType, { ar: string; en: string }> = {
  GENERAL: { ar: 'نفايات عامة', en: 'General Waste' },
  RECYCLABLE: { ar: 'قابلة للتدوير', en: 'Recyclable' },
  ORGANIC: { ar: 'عضوية', en: 'Organic' },
};

export const BIN_STATUS_LABELS: Record<BinStatus, { ar: string; en: string }> = {
  NORMAL: { ar: 'طبيعي', en: 'Normal' },
  WARNING: { ar: 'تحتاج إلى تفريغ (≥ 80%)', en: 'Needs Emptying (≥ 80%)' },
  CRITICAL: { ar: 'شبه ممتلئة (حرج)', en: 'Critical' },
  FULL: { ar: 'ممتلئة بالكامل', en: 'Full (100%)' },
  OFFLINE: { ar: 'غير متصلة', en: 'Offline' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance' },
};

export type OperationalBinCategory =
  | 'EMPTY'
  | 'PARTIAL'
  | 'NEEDS_EMPTYING'
  | 'FULL'
  | 'OFFLINE'
  | 'NO_DATA';

export function getOperationalBinCategory(
  bin: { status: BinStatus; currentFillPercentage: number; lastReadingAt?: string },
  connectionStatus?: DeviceConnectionStatus,
  warningThreshold = 80
): OperationalBinCategory {
  if (bin.status === 'OFFLINE' || connectionStatus === 'OFFLINE') return 'OFFLINE';
  if (!bin.lastReadingAt) return 'NO_DATA';
  if (bin.status === 'FULL' || bin.currentFillPercentage >= 100) return 'FULL';
  if (
    bin.status === 'WARNING' ||
    bin.status === 'CRITICAL' ||
    bin.currentFillPercentage >= warningThreshold
  ) {
    return 'NEEDS_EMPTYING';
  }
  if (bin.currentFillPercentage <= 19) return 'EMPTY';
  return 'PARTIAL';
}

export const OPERATIONAL_BIN_CATEGORY_LABELS: Record<
  OperationalBinCategory,
  { ar: string; en: string; colorClass: string }
> = {
  EMPTY: {
    ar: 'فارغة',
    en: 'Empty',
    colorClass: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  },
  PARTIAL: {
    ar: 'ممتلئة جزئياً',
    en: 'Partially Full',
    colorClass: 'text-teal-800 bg-teal-50 border-teal-200',
  },
  NEEDS_EMPTYING: {
    ar: 'تحتاج إلى تفريغ',
    en: 'Needs Emptying',
    colorClass: 'text-amber-800 bg-amber-50 border-amber-200',
  },
  FULL: {
    ar: 'ممتلئة بالكامل',
    en: 'Completely Full',
    colorClass: 'text-red-800 bg-red-50 border-red-200',
  },
  OFFLINE: {
    ar: 'غير متصلة',
    en: 'Offline',
    colorClass: 'text-stone-700 bg-stone-100 border-stone-300',
  },
  NO_DATA: {
    ar: 'لا توجد بيانات حالية',
    en: 'No Current Data',
    colorClass: 'text-stone-600 bg-stone-50 border-stone-200',
  },
};

export const DEVICE_STATUS_LABELS: Record<DeviceConnectionStatus, { ar: string; en: string }> = {
  ONLINE: { ar: 'متصل', en: 'Online' },
  OFFLINE: { ar: 'غير متصل', en: 'Offline' },
  NEVER_CONNECTED: { ar: 'لم يتصل بعد', en: 'Never Connected' },
};

export const ALERT_TYPE_LABELS: Record<AlertType, { ar: string; en: string }> = {
  BIN_80_PERCENT: { ar: 'تجاوز حد 80% امتلاء', en: 'Bin 80% Threshold' },
  BIN_FULL: { ar: 'الحاوية ممتلئة بالكامل', en: 'Bin Full (100%)' },
  DEVICE_OFFLINE: { ar: 'انقطاع اتصال الجهاز', en: 'Device Offline' },
  SENSOR_ERROR: { ar: 'عطل في حساس المسافة', en: 'Sensor Error' },
  SENSOR_READING_INVALID: { ar: 'قراءة حساس غير صالحة', en: 'Invalid Sensor Reading' },
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, { ar: string; en: string }> = {
  INFO: { ar: 'معلومة', en: 'Info' },
  WARNING: { ar: 'تحذير', en: 'Warning' },
  CRITICAL: { ar: 'حرج', en: 'Critical' },
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, { ar: string; en: string }> = {
  ACTIVE: { ar: 'نشط', en: 'Active' },
  ACKNOWLEDGED: { ar: 'تم الإقرار', en: 'Acknowledged' },
  RESOLVED: { ar: 'تم الحل', en: 'Resolved' },
};

export const REPORT_TYPE_LABELS: Record<ReportType, { ar: string; en: string }> = {
  FULL_BIN: { ar: 'سلة نفايات ممتلئة', en: 'Full Waste Bin' },
  PARK_CLEANLINESS: { ar: 'تراكم النفايات', en: 'Waste Accumulation' },
  PLAYGROUND_DAMAGE: { ar: 'تلف ألعاب الأطفال', en: 'Playground Damage' },
  DAMAGED_BENCH: { ar: 'تلف المقاعد', en: 'Damaged Bench' },
  RESTROOM_ISSUE: { ar: 'مشكلة في الحمامات', en: 'Restroom Issue' },
  LIGHTING_PROBLEM: { ar: 'مشكلة إنارة', en: 'Lighting Problem' },
  BROKEN_EQUIPMENT: { ar: 'تلف مرافق الحديقة', en: 'Broken Equipment' },
  OTHER: { ar: 'مشكلة أخرى', en: 'Other Issue' },
};

export const CITIZEN_REPORT_TYPES: ReportType[] = [
  'FULL_BIN',
  'PARK_CLEANLINESS',
  'PLAYGROUND_DAMAGE',
  'DAMAGED_BENCH',
  'RESTROOM_ISSUE',
  'LIGHTING_PROBLEM',
  'OTHER',
];

export const REPORT_STATUS_LABELS: Record<ReportStatus, { ar: string; en: string }> = {
  NEW: { ar: 'تم استلام البلاغ', en: 'Received' },
  UNDER_REVIEW: { ar: 'قيد المراجعة', en: 'Under Review' },
  ACCEPTED: { ar: 'تمت الموافقة عليه', en: 'Approved' },
  CONVERTED_TO_TASK: { ar: 'تمت جدولة الصيانة', en: 'Maintenance Scheduled' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In Progress' },
  RESOLVED: { ar: 'تم حل المشكلة', en: 'Issue Resolved' },
  CLOSED: { ar: 'تم إغلاق البلاغ', en: 'Closed' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected' },
};

export const CITIZEN_WORKFLOW_STAGES: ReportStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'ACCEPTED',
  'CONVERTED_TO_TASK',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const PRIORITY_LABELS: Record<PriorityLevel, { ar: string; en: string }> = {
  LOW: { ar: 'منخفضة', en: 'Low' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium' },
  HIGH: { ar: 'عالية', en: 'High' },
  URGENT: { ar: 'عاجلة', en: 'Urgent' },
};

export const TASK_STATUS_LABELS: Record<TaskStatus, { ar: string; en: string }> = {
  PENDING: { ar: 'مهمة جديدة', en: 'New Task' },
  ASSIGNED: { ar: 'مجدولة / مسندة', en: 'Scheduled' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In Progress' },
  COMPLETED: { ar: 'منجزة', en: 'Completed' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled' },
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { ar: string; en: string }> = {
  NEW_REPORT: { ar: 'بلاغ مواطن جديد', en: 'New Citizen Report' },
  BIN_HIGH_FILL: { ar: 'ارتفاع امتلاء حاوية', en: 'High Bin Fill Level' },
  SENSOR_OFFLINE: { ar: 'انقطاع اتصال حساس', en: 'Sensor Disconnected' },
  TASK_ASSIGNED: { ar: 'إسناد مهمة صيانة', en: 'Maintenance Task Assigned' },
  REPORT_STATUS_UPDATED: { ar: 'تحديث حالة بلاغ', en: 'Report Status Updated' },
};

export const MAINTENANCE_TEAMS = [
  { id: 'فريق الصيانة الميكانيكية والألعاب', labelAr: 'فريق الصيانة الميكانيكية والألعاب', labelEn: 'Mechanical & Playgrounds Team' },
  { id: 'فريق النظافة والتفريغ', labelAr: 'فريق النظافة والتفريغ', labelEn: 'Cleaning & Waste Team' },
  { id: 'فريق الكهرباء والإنارة', labelAr: 'فريق الكهرباء والإنارة', labelEn: 'Electrical & Lighting Team' },
  { id: 'فريق السباكة والحمامات', labelAr: 'فريق السباكة والحمامات', labelEn: 'Plumbing & Restrooms Team' },
  { id: 'فريق النجارة والمقاعد', labelAr: 'فريق النجارة والمقاعد', labelEn: 'Carpentry & Benches Team' },
];
