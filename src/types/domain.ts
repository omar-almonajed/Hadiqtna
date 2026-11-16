export type UserRole =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'OPERATOR'
  | 'MAINTENANCE'
  | 'WORKER'
  | 'PENDING';

export type OperatingMode = 'DEMO' | 'HARDWARE';

export type ParkStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';

export type BinType = 'GENERAL' | 'RECYCLABLE' | 'ORGANIC';

export type BinStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'FULL' | 'OFFLINE' | 'MAINTENANCE';

export type DeviceConnectionStatus = 'ONLINE' | 'OFFLINE' | 'NEVER_CONNECTED';

export type ReadingSource = 'HARDWARE' | 'DEMO';

export type ReadingQualityStatus = 'VALID' | 'FILTERED' | 'OUT_OF_RANGE' | 'INVALID';

export type AlertType =
  | 'BIN_80_PERCENT'
  | 'BIN_FULL'
  | 'DEVICE_OFFLINE'
  | 'SENSOR_ERROR'
  | 'SENSOR_READING_INVALID';

export type AlertSeverity = 'WARNING' | 'CRITICAL' | 'INFO';

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export type ReportType =
  | 'FULL_BIN'
  | 'PARK_CLEANLINESS'
  | 'PLAYGROUND_DAMAGE'
  | 'DAMAGED_BENCH'
  | 'RESTROOM_ISSUE'
  | 'LIGHTING_PROBLEM'
  | 'BROKEN_EQUIPMENT'
  | 'OTHER';

export type ReportStatus =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'CONVERTED_TO_TASK'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TaskStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type NotificationType =
  | 'NEW_REPORT'
  | 'BIN_HIGH_FILL'
  | 'SENSOR_OFFLINE'
  | 'TASK_ASSIGNED'
  | 'REPORT_STATUS_UPDATED';

export interface ReportStatusHistoryEntry {
  status: ReportStatus;
  label?: string;
  note?: string;
  changedAt: string;
  actorName?: string;
  changedByName?: string;
  changedByRole?: UserRole | 'CITIZEN';
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDirectoryEntry {
  uid: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  updatedAt: string;
}

export interface Park {
  id: string;
  name: string;
  description: string;
  location: string;
  status: ParkStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface Bin {
  id: string;
  parkId: string;
  name: string;
  binType: BinType;
  capacityLiters: number;
  status: BinStatus;
  currentFillPercentage: number;
  lastDistanceCm?: number;
  emptyDistanceCm: number;
  fullDistanceCm: number;
  lastReadingAt?: string;
  lastReadingSource?: ReadingSource;
  deviceId?: string;
  locationDescription: string;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  name: string;
  deviceType: string;
  sensorModel?: string;
  binId: string;
  parkId: string;
  connectionStatus: DeviceConnectionStatus;
  firmwareVersion: string;
  lastSeenAt?: string;
  lastSignalStrength?: number;
  lastSequenceNumber?: number;
  reportingIntervalSeconds?: number;
  queuedReadingsCount?: number;
  overflowDroppedCount?: number;
  lastPowerResetReason?: string;
  networkType?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SensorReading {
  id: string;
  deviceId: string;
  binId: string;
  distanceCm: number;
  fillPercentage: number;
  signalStrength: number;
  sequenceNumber: number;
  measuredAt: string;
  receivedAt: string;
  source: ReadingSource;
  qualityStatus: ReadingQualityStatus;
}

export interface AlertItem {
  id: string;
  binId: string;
  deviceId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  source?: ReadingSource;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export interface CitizenReport {
  id: string;
  parkId: string;
  reportType: ReportType;
  title: string;
  description: string;
  locationDescription: string;
  imageUrl?: string;
  imageUrls?: string[];
  reporterName?: string;
  reporterContact?: string;
  trackingCode?: string;
  assignedTo?: string;
  assignedTeam?: string;
  internalNotes?: string;
  status: ReportStatus;
  priority: PriorityLevel;
  statusHistory?: ReportStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface MaintenanceTask {
  id: string;
  reportId?: string;
  parkId: string;
  binId?: string;
  assignedTo?: string;
  assignedTeam?: string;
  locationDescription?: string;
  title: string;
  description: string;
  completionNotes?: string;
  afterImageUrl?: string;
  priority: PriorityLevel;
  status: TaskStatus;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface StaffNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  targetRoles: UserRole[];
  targetUid?: string;
  relatedId?: string;
  relatedCollection?: string;
  isRead?: boolean;
  readBy?: string[];
  readAt?: string;
  isReadBy?: string[];
  createdAt: string;
}

export interface SystemConfig {
  id: string;
  operatingMode: OperatingMode;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  defaultReportingIntervalSeconds: number;
  offlineTimeoutSeconds: number;
  defaultEmptyDistanceCm: number;
  defaultFullDistanceCm: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalReadings: number;
  hardwareReadingsCount: number;
  demoReadingsCount: number;
  averageFillPercentage: number;
  totalAlerts: number;
  activeAlertsCount: number;
  resolvedAlertsCount: number;
  deviceUptimeEstimatePercent: number | null;
  totalReports: number;
  openReportsCount: number;
  totalTasks: number;
  completedTasksCount: number;
  maintenanceCompletionRatePercent: number | null;
  averageResponseTimeMinutes: number | null;
  fillTrend: Array<{
    timestamp: string;
    fillPercentage: number;
    distanceCm: number;
    source: ReadingSource;
  }>;
  reportsByType: Array<{
    type: ReportType;
    count: number;
  }>;
  reportsByStatus: Array<{
    status: ReportStatus;
    count: number;
  }>;
  reportsOverTime: Array<{
    date: string;
    count: number;
  }>;
  alertsBySeverity: Array<{
    severity: AlertSeverity;
    count: number;
  }>;
}

export type PersistenceMode =
  | 'CLOUD_FIRESTORE'
  | 'LOCAL_PERSISTENT_SERVER'
  | 'DEV_LOCAL_PREVIEW'
  | 'MISCONFIGURED_NO_PERSISTENT_DB';

export interface SyncOutboxItem {
  id: string;
  deviceId: string;
  sequenceNumber: number;
  distanceCm: number;
  signalStrength: number;
  measuredAt: string;
  createdAt: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'CONFLICT_DUPLICATE';
  attempts: number;
  lastError?: string;
}

export interface DeploymentDiagnostics {
  environment: string;
  firestoreAdminConnected: boolean;
  firestoreError: string | null;
  firestoreWriteProbeOk: boolean;
  firestoreProbeError: string | null;
  persistenceMode: PersistenceMode;
  productionPersistenceReady: boolean;
  dataDirIsTmp: boolean;
  localServerMode: boolean;
  centralSyncConfigured: boolean;
  syncPendingCount: number;
  syncSyncedCount: number;
  localStaffAuthEnabled: boolean;
  appUrl: string;
  isPreviewAuthProxyUrl: boolean;
  timestamp: string;
}
