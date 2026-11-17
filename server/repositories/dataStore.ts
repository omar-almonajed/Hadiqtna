import fs from 'node:fs';
import path from 'node:path';
import { Timestamp } from 'firebase-admin/firestore';
import { env, isTmpDirectory } from '../config/env.ts';
import { hashPassword } from '../utils/crypto.ts';
import {
  checkAdminFirestoreAvailability,
  getAdminFirestore,
  getLastFirestoreError,
} from '../config/firebaseAdmin.ts';
import type {
  AlertItem,
  AuditLog,
  Bin,
  CitizenReport,
  Device,
  MaintenanceTask,
  Park,
  PersistenceMode,
  SensorReading,
  StaffDirectoryEntry,
  StaffNotification,
  SyncOutboxItem,
  SystemConfig,
  UserProfile,
} from '../../src/types/domain.ts';

export interface DeviceCredentialRecord {
  deviceId: string;
  tokenHash: string;
  tokenPrefix: string;
  isRevoked: boolean;
  rotatedAt: string;
  revokedAt?: string;
}

export interface LocalStaffCredential {
  uid: string;
  email: string;
  passwordHash: string;
  updatedAt: string;
}

export interface StoreState {
  users: Record<string, UserProfile>;
  staffDirectory: Record<string, StaffDirectoryEntry>;
  parks: Record<string, Park>;
  bins: Record<string, Bin>;
  devices: Record<string, Device>;
  deviceCredentials: Record<string, DeviceCredentialRecord>;
  sensorReadings: Record<string, SensorReading>;
  alerts: Record<string, AlertItem>;
  citizenReports: Record<string, CitizenReport>;
  maintenanceTasks: Record<string, MaintenanceTask>;
  systemConfig: Record<string, SystemConfig>;
  auditLogs: Record<string, AuditLog>;
  syncOutbox: Record<string, SyncOutboxItem>;
  localStaffCredentials: Record<string, LocalStaffCredential>;
  notifications: Record<string, StaffNotification>;
}

function createInitialSeed(): StoreState {
  const now = new Date().toISOString();
  const demoAdminEmail = 'admin@hadiqtna.local';
  const demoAdminUid = 'local-admin';
  const demoAdminPasswordHash = hashPassword('admin123');

  return {
    users: {
      [demoAdminUid]: {
        uid: demoAdminUid,
        fullName: 'مدير التشغيل التجريبي',
        email: demoAdminEmail,
        role: 'ADMIN',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    staffDirectory: {},
    parks: {
      'park-alnakheel': {
        id: 'park-alnakheel',
        name: 'حديقة تشرين العامة (دمشق)',
        description:
          'أكبر الحدائق العامة في قلب دمشق، تضم مساحات خضراء واسعة وممرات مشاة ومناطق ألعاب مجهزة بنظام مراقبة الحاويات وتنسيق الصيانة.',
        location: 'دمشق — حي المهاجرين / ساحة الأمويين',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-sabki': {
        id: 'park-damascus-sabki',
        name: 'حديقة السبكي (دمشق)',
        description:
          'حديقة حيوية وسط العاصمة دمشق في منطقة الشعلان، تشهد كثافة زوار يومية ومجهزة بمراقبة ذكية لنقاط التجمع والنظافة.',
        location: 'دمشق — حي الشعلان / شارع السبكي',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-jahiz': {
        id: 'park-damascus-jahiz',
        name: 'حديقة الجاحظ (دمشق)',
        description:
          'حديقة هادئة في حي أبو رمانة بدمشق، مزودة بحساسات مسافة منخفضة استهلاك الطاقة ومرتبطة ببوابة بلاغات المواطنين.',
        location: 'دمشق — حي أبو رمانة / ساحة الجاحظ',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-madfaa': {
        id: 'park-damascus-madfaa',
        name: 'حديقة المدفع (دمشق)',
        description:
          'متنزه عائلي معروف في حي المالكي وأبو رمانة بدمشق، مهيأ بعقدة استشعار ESP32 مع تخزين مؤقت أثناء انقطاع الكهرباء.',
        location: 'دمشق — حي المالكي / أبو رمانة',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-tijara': {
        id: 'park-damascus-tijara',
        name: 'حديقة التجارة (دمشق)',
        description:
          'حديقة مركزية تخدم أحياء التجارة والقصور والعباسيين في دمشق، مرتبطة بنظام متابعة تفريغ الحاويات ومهام الفنيين.',
        location: 'دمشق — حي التجارة / القصور',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-soufaniyeh': {
        id: 'park-damascus-soufaniyeh',
        name: 'حديقة الصوفانية (دمشق)',
        description:
          'حديقة تاريخية خضراء في حي باب توما والقصاع بدمشق القديمة، مجهزة بمراقبة ذكية للحاويات وبلاغات الصيانة الميدانية.',
        location: 'دمشق — حي باب توما / القصاع',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      'park-damascus-mezzeh': {
        id: 'park-damascus-mezzeh',
        name: 'حديقة الطلائع والمزة (دمشق)',
        description:
          'متنزه واسع في المزة فيلات غربية بدمشق، يضم مساراً للمشي ومناطق عائلية مزودة بمراقبة مستوى امتلاء الحاويات.',
        location: 'دمشق — حي المزة فيلات غربية',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    },
    bins: {
      'bin-nakheel-01': {
        id: 'bin-nakheel-01',
        parkId: 'park-alnakheel',
        name: 'حاوية المدخل الشرقي (الأمويين) — ذكية 01',
        binType: 'GENERAL',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-001',
        locationDescription: 'دمشق · حديقة تشرين — المدخل الشرقي بجوار ساحة الأمويين',
        createdAt: now,
        updatedAt: now,
      },
      'bin-tishreen-02': {
        id: 'bin-tishreen-02',
        parkId: 'park-alnakheel',
        name: 'حاوية منطقة ألعاب الأطفال — ذكية 02',
        binType: 'RECYCLABLE',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-02',
        locationDescription: 'دمشق · حديقة تشرين — الساحة الغربية قرب ألعاب الأطفال',
        createdAt: now,
        updatedAt: now,
      },
      'bin-sabki-01': {
        id: 'bin-sabki-01',
        parkId: 'park-damascus-sabki',
        name: 'حاوية مدخل شارع السبكي — ذكية 03',
        binType: 'GENERAL',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-03',
        locationDescription: 'دمشق · حديقة السبكي — المدخل الجنوبي جهة شارع السبكي',
        createdAt: now,
        updatedAt: now,
      },
      'bin-sabki-02': {
        id: 'bin-sabki-02',
        parkId: 'park-damascus-sabki',
        name: 'حاوية فرز البلاستيك (الشعلان) — ذكية 04',
        binType: 'RECYCLABLE',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-04',
        locationDescription: 'دمشق · حديقة السبكي — الركن الشمالي باتجاه الشعلان',
        createdAt: now,
        updatedAt: now,
      },
      'bin-jahiz-01': {
        id: 'bin-jahiz-01',
        parkId: 'park-damascus-jahiz',
        name: 'حاوية ساحة الجاحظ الوسطى — ذكية 05',
        binType: 'GENERAL',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-05',
        locationDescription: 'دمشق · حديقة الجاحظ — الممر الرئيسي في أبو رمانة',
        createdAt: now,
        updatedAt: now,
      },
      'bin-madfaa-01': {
        id: 'bin-madfaa-01',
        parkId: 'park-damascus-madfaa',
        name: 'حاوية ممر حديقة المدفع (المالكي) — ذكية 06',
        binType: 'GENERAL',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-06',
        locationDescription: 'دمشق · حديقة المدفع — المدخل الشرقي جهة المالكي',
        createdAt: now,
        updatedAt: now,
      },
      'bin-tijara-01': {
        id: 'bin-tijara-01',
        parkId: 'park-damascus-tijara',
        name: 'حاوية وسط حديقة التجارة — ذكية 07',
        binType: 'GENERAL',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-07',
        locationDescription: 'دمشق · حديقة التجارة — الباحة الوسطى قرب المقاعد العائلية',
        createdAt: now,
        updatedAt: now,
      },
      'bin-soufaniyeh-01': {
        id: 'bin-soufaniyeh-01',
        parkId: 'park-damascus-soufaniyeh',
        name: 'حاوية باب توما والصوفانية — ذكية 08',
        binType: 'ORGANIC',
        capacityLiters: 120,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 90,
        fullDistanceCm: 15,
        deviceId: 'BIN-ESP32-DAM-08',
        locationDescription: 'دمشق · حديقة الصوفانية — البوابة الجنوبية جهة القصاع',
        createdAt: now,
        updatedAt: now,
      },
      'bin-mezzeh-01': {
        id: 'bin-mezzeh-01',
        parkId: 'park-damascus-mezzeh',
        name: 'حاوية مسار المشي (المزة غربية) — ذكية 09',
        binType: 'GENERAL',
        capacityLiters: 240,
        status: 'NORMAL',
        currentFillPercentage: 0,
        emptyDistanceCm: 105,
        fullDistanceCm: 18,
        deviceId: 'BIN-ESP32-DAM-09',
        locationDescription: 'دمشق · حديقة الطلائع — الممر الغربي في المزة فيلات غربية',
        createdAt: now,
        updatedAt: now,
      },
    },
    devices: {
      'BIN-ESP32-001': {
        id: 'BIN-ESP32-001',
        name: 'عقدة استشعار دمشق - تشرين 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-nakheel-01',
        parkId: 'park-alnakheel',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-02': {
        id: 'BIN-ESP32-DAM-02',
        name: 'عقدة استشعار دمشق - تشرين 02',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-tishreen-02',
        parkId: 'park-alnakheel',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-03': {
        id: 'BIN-ESP32-DAM-03',
        name: 'عقدة استشعار دمشق - السبكي 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-sabki-01',
        parkId: 'park-damascus-sabki',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-04': {
        id: 'BIN-ESP32-DAM-04',
        name: 'عقدة استشعار دمشق - السبكي 02',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-sabki-02',
        parkId: 'park-damascus-sabki',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-05': {
        id: 'BIN-ESP32-DAM-05',
        name: 'عقدة استشعار دمشق - الجاحظ 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-jahiz-01',
        parkId: 'park-damascus-jahiz',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-06': {
        id: 'BIN-ESP32-DAM-06',
        name: 'عقدة استشعار دمشق - المدفع 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-madfaa-01',
        parkId: 'park-damascus-madfaa',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-07': {
        id: 'BIN-ESP32-DAM-07',
        name: 'عقدة استشعار دمشق - التجارة 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-tijara-01',
        parkId: 'park-damascus-tijara',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-08': {
        id: 'BIN-ESP32-DAM-08',
        name: 'عقدة استشعار دمشق - الصوفانية 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-soufaniyeh-01',
        parkId: 'park-damascus-soufaniyeh',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      'BIN-ESP32-DAM-09': {
        id: 'BIN-ESP32-DAM-09',
        name: 'عقدة استشعار دمشق - المزة 01',
        deviceType: 'ESP32-WROOM-32',
        sensorModel: 'CONFIGURABLE_ULTRASONIC',
        binId: 'bin-mezzeh-01',
        parkId: 'park-damascus-mezzeh',
        connectionStatus: 'NEVER_CONNECTED',
        firmwareVersion: '1.1.0-syria',
        reportingIntervalSeconds: 300,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    deviceCredentials: {},
    sensorReadings: {},
    alerts: {},
    citizenReports: {},
    maintenanceTasks: {},
    systemConfig: {
      global: {
        id: 'global',
        operatingMode: 'DEMO',
        warningThresholdPercent: 80,
        criticalThresholdPercent: 95,
        defaultReportingIntervalSeconds: 300,
        offlineTimeoutSeconds: 900,
        defaultEmptyDistanceCm: 90,
        defaultFullDistanceCm: 15,
        updatedAt: now,
        updatedBy: 'system',
      },
    },
    auditLogs: {},
    syncOutbox: {},
    localStaffCredentials: {
      [demoAdminUid]: {
        uid: demoAdminUid,
        email: demoAdminEmail,
        passwordHash: demoAdminPasswordHash,
        updatedAt: now,
      },
    },
    notifications: {},
  };
}

const LEGACY_NON_DAMASCUS_PARK_IDS = [
  'park-aleppo-public',
  'park-latakia-corniche',
  'park-homs-main',
  'park-hama-noria',
];
const LEGACY_NON_DAMASCUS_BIN_IDS = [
  'bin-aleppo-01',
  'bin-aleppo-02',
  'bin-latakia-01',
  'bin-homs-01',
  'bin-hama-01',
];
const LEGACY_NON_DAMASCUS_DEVICE_IDS = [
  'BIN-ESP32-ALP-01',
  'BIN-ESP32-ALP-02',
  'BIN-ESP32-LAT-01',
  'BIN-ESP32-HMS-01',
  'BIN-ESP32-HAM-01',
];

function mergeDamascusCatalog(state: StoreState): { state: StoreState; changed: boolean } {
  const seed = createInitialSeed();
  let changed = false;

  // Upgrade legacy placeholder title on park-alnakheel if untouched
  const legacyPark = state.parks['park-alnakheel'];
  if (legacyPark && legacyPark.name === 'حديقة النخيل العامة') {
    state.parks['park-alnakheel'] = {
      ...legacyPark,
      name: seed.parks['park-alnakheel'].name,
      location: seed.parks['park-alnakheel'].location,
      description: seed.parks['park-alnakheel'].description,
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }

  for (const id of LEGACY_NON_DAMASCUS_PARK_IDS) {
    if (state.parks[id]) {
      delete state.parks[id];
      changed = true;
    }
  }
  for (const id of LEGACY_NON_DAMASCUS_BIN_IDS) {
    if (state.bins[id]) {
      delete state.bins[id];
      changed = true;
    }
  }
  for (const id of LEGACY_NON_DAMASCUS_DEVICE_IDS) {
    if (state.devices[id]) {
      delete state.devices[id];
      changed = true;
    }
  }

  for (const [id, park] of Object.entries(seed.parks)) {
    if (!state.parks[id]) {
      state.parks[id] = park;
      changed = true;
    }
  }
  for (const [id, bin] of Object.entries(seed.bins)) {
    if (!state.bins[id]) {
      state.bins[id] = bin;
      changed = true;
    }
  }
  for (const [id, device] of Object.entries(seed.devices)) {
    if (!state.devices[id]) {
      state.devices[id] = device;
      changed = true;
    }
  }

  return { state, changed };
}

let inMemoryFallback: StoreState | null = null;
let initialized = false;
let activeDataDir = env.dataDir;
let activePersistenceMode: PersistenceMode = 'DEV_LOCAL_PREVIEW';
let activeProductionReady = false;

function getStoreFilePath(): string {
  return path.join(activeDataDir, 'store.json');
}

function ensureStoreShape(parsed: Partial<StoreState>): StoreState {
  const seed = createInitialSeed();
  return {
    users: parsed.users ?? seed.users,
    staffDirectory: parsed.staffDirectory ?? seed.staffDirectory,
    parks: parsed.parks ?? seed.parks,
    bins: parsed.bins ?? seed.bins,
    devices: parsed.devices ?? seed.devices,
    deviceCredentials: parsed.deviceCredentials ?? seed.deviceCredentials,
    sensorReadings: parsed.sensorReadings ?? seed.sensorReadings,
    alerts: parsed.alerts ?? seed.alerts,
    citizenReports: parsed.citizenReports ?? seed.citizenReports,
    maintenanceTasks: parsed.maintenanceTasks ?? seed.maintenanceTasks,
    systemConfig: parsed.systemConfig ?? seed.systemConfig,
    auditLogs: parsed.auditLogs ?? seed.auditLogs,
    syncOutbox: parsed.syncOutbox ?? seed.syncOutbox,
    localStaffCredentials: parsed.localStaffCredentials ?? seed.localStaffCredentials,
    notifications: parsed.notifications ?? seed.notifications,
  };
}

function loadLocalStore(): StoreState {
  if (inMemoryFallback) return inMemoryFallback;
  const filePath = getStoreFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const shaped = ensureStoreShape(JSON.parse(raw) as Partial<StoreState>);
      const { state, changed } = mergeDamascusCatalog(shaped);
      inMemoryFallback = state;
      if (changed) {
        saveLocalStore(inMemoryFallback);
      }
      return inMemoryFallback;
    } catch {
      // Corrupt store file fallback
    }
  }
  inMemoryFallback = createInitialSeed();
  saveLocalStore(inMemoryFallback);
  return inMemoryFallback;
}

function saveLocalStore(state: StoreState): void {
  inMemoryFallback = state;
  const filePath = getStoreFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'lastReadingAt',
  'lastSeenAt',
  'measuredAt',
  'receivedAt',
  'acknowledgedAt',
  'resolvedAt',
  'closedAt',
  'scheduledFor',
  'completedAt',
  'rotatedAt',
  'revokedAt',
  'readAt',
]);

function toFirestoreDoc(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) continue;
    if (TIMESTAMP_FIELDS.has(k) && typeof v === 'string') {
      const d = new Date(v);
      out[k] = Number.isNaN(d.getTime()) ? v : Timestamp.fromDate(d);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function fromFirestoreDoc<T>(data: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) {
      out[k] = v.toDate().toISOString();
    } else if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export async function initDataStore(): Promise<{
  firestoreAdminConnected: boolean;
  persistenceMode: PersistenceMode;
  productionPersistenceReady: boolean;
}> {
  if (initialized) {
    return {
      firestoreAdminConnected: Boolean(getAdminFirestore()),
      persistenceMode: activePersistenceMode,
      productionPersistenceReady: activeProductionReady,
    };
  }
  const hasFirestore = await checkAdminFirestoreAvailability();
  const db = getAdminFirestore();
  const isProd = (process.env.NODE_ENV || env.nodeEnv) === 'production';
  const localMode = process.env.LOCAL_SERVER_MODE === 'true' || env.localServerMode;
  const allowEphemeral = process.env.ALLOW_EPHEMERAL_LOCAL_STORE === 'true' || env.allowEphemeralLocalStore;

  if (hasFirestore && db) {
    activePersistenceMode = 'CLOUD_FIRESTORE';
    activeProductionReady = true;
    const seed = createInitialSeed();
    const [cfgSnap, parksSnap, binsSnap, devsSnap] = await Promise.all([
      db.collection('systemConfig').doc('global').get(),
      db.collection('parks').get(),
      db.collection('bins').get(),
      db.collection('devices').get(),
    ]);

    const existingParkIds = new Set(parksSnap.docs.map((d) => d.id));
    const existingBinIds = new Set(binsSnap.docs.map((d) => d.id));
    const existingDevIds = new Set(devsSnap.docs.map((d) => d.id));

    const batch = db.batch();
    let hasWrites = false;

    if (!cfgSnap.exists) {
      for (const [id, cfg] of Object.entries(seed.systemConfig)) {
        batch.set(db.collection('systemConfig').doc(id), toFirestoreDoc(cfg as unknown as Record<string, unknown>));
        hasWrites = true;
      }
    }

    const legacyParkDoc = parksSnap.docs.find((d) => d.id === 'park-alnakheel')?.data();
    if (legacyParkDoc && legacyParkDoc.name === 'حديقة النخيل العامة') {
      batch.set(
        db.collection('parks').doc('park-alnakheel'),
        toFirestoreDoc({
          ...legacyParkDoc,
          name: seed.parks['park-alnakheel'].name,
          location: seed.parks['park-alnakheel'].location,
          description: seed.parks['park-alnakheel'].description,
          updatedAt: new Date().toISOString(),
        })
      );
      hasWrites = true;
    }

    for (const id of LEGACY_NON_DAMASCUS_PARK_IDS) {
      if (existingParkIds.has(id)) {
        batch.delete(db.collection('parks').doc(id));
        hasWrites = true;
      }
    }
    for (const id of LEGACY_NON_DAMASCUS_BIN_IDS) {
      if (existingBinIds.has(id)) {
        batch.delete(db.collection('bins').doc(id));
        hasWrites = true;
      }
    }
    for (const id of LEGACY_NON_DAMASCUS_DEVICE_IDS) {
      if (existingDevIds.has(id)) {
        batch.delete(db.collection('devices').doc(id));
        hasWrites = true;
      }
    }

    for (const [id, park] of Object.entries(seed.parks)) {
      if (!existingParkIds.has(id)) {
        batch.set(db.collection('parks').doc(id), toFirestoreDoc(park as unknown as Record<string, unknown>));
        hasWrites = true;
      }
    }
    for (const [id, bin] of Object.entries(seed.bins)) {
      if (!existingBinIds.has(id)) {
        batch.set(db.collection('bins').doc(id), toFirestoreDoc(bin as unknown as Record<string, unknown>));
        hasWrites = true;
      }
    }
    for (const [id, dev] of Object.entries(seed.devices)) {
      if (!existingDevIds.has(id)) {
        batch.set(db.collection('devices').doc(id), toFirestoreDoc(dev as unknown as Record<string, unknown>));
        hasWrites = true;
      }
    }

    if (hasWrites) {
      await batch.commit();
    }
  } else if (localMode && !isTmpDirectory(activeDataDir)) {
    activePersistenceMode = 'LOCAL_PERSISTENT_SERVER';
    activeProductionReady = true;
    loadLocalStore();
  } else if (isProd && !allowEphemeral) {
    activePersistenceMode = 'MISCONFIGURED_NO_PERSISTENT_DB';
    activeProductionReady = false;
    console.error(
      `[CRITICAL_PERSISTENCE_ERROR] Running in NODE_ENV=production without Cloud Firestore Admin access (${getLastFirestoreError()}) and without a non-/tmp LOCAL_SERVER_MODE persistent directory.`
    );
  } else {
    activePersistenceMode = 'DEV_LOCAL_PREVIEW';
    activeProductionReady = false;
    loadLocalStore();
  }
  initialized = true;
  return {
    firestoreAdminConnected: hasFirestore,
    persistenceMode: activePersistenceMode,
    productionPersistenceReady: activeProductionReady,
  };
}

export function getPersistenceDiagnostics() {
  return {
    firestoreAdminConnected: Boolean(getAdminFirestore()),
    firestoreError: getLastFirestoreError(),
    persistenceMode: activePersistenceMode,
    productionPersistenceReady: activeProductionReady,
    dataDirIsTmp: isTmpDirectory(activeDataDir),
    localServerMode: env.localServerMode,
  };
}

export function resetDataStoreForTest(customDataDir?: string): void {
  initialized = false;
  if (customDataDir) {
    activeDataDir = customDataDir;
  } else {
    activeDataDir = env.dataDir;
  }
  inMemoryFallback = createInitialSeed();
  saveLocalStore(inMemoryFallback);
}

export function simulateRestartReloadForTest(customDataDir?: string): void {
  initialized = false;
  if (customDataDir) {
    activeDataDir = customDataDir;
  }
  inMemoryFallback = null;
}

type CollectionName = keyof StoreState;

function assertWritableStore(): void {
  if (activePersistenceMode === 'MISCONFIGURED_NO_PERSISTENT_DB') {
    throw new Error(
      'PERSISTENCE_NOT_CONFIGURED: Refusing to persist production data to /tmp. Configure FIREBASE_SERVICE_ACCOUNT_KEY or LOCAL_SERVER_MODE=true with a non-/tmp HADIQTNA_DATA_DIR.'
    );
  }
}

export async function listCollection<T>(name: CollectionName): Promise<T[]> {
  await initDataStore();
  const db = getAdminFirestore();
  if (db) {
    const snap = await db.collection(name).get();
    return snap.docs.map((doc) => fromFirestoreDoc<T>(doc.data()));
  }
  if (activePersistenceMode === 'MISCONFIGURED_NO_PERSISTENT_DB') {
    return Object.values((createInitialSeed() as StoreState)[name]) as T[];
  }
  const store = loadLocalStore();
  return Object.values(store[name]) as T[];
}

export async function getDocument<T>(name: CollectionName, id: string): Promise<T | null> {
  await initDataStore();
  const db = getAdminFirestore();
  if (db) {
    const snap = await db.collection(name).doc(id).get();
    if (!snap.exists) return null;
    return fromFirestoreDoc<T>(snap.data() as Record<string, unknown>);
  }
  if (activePersistenceMode === 'MISCONFIGURED_NO_PERSISTENT_DB') {
    return null;
  }
  const store = loadLocalStore();
  const doc = (store[name] as unknown as Record<string, T>)[id];
  return doc ?? null;
}

export async function setDocument<T extends Record<string, unknown>>(
  name: CollectionName,
  id: string,
  data: T
): Promise<T> {
  await initDataStore();
  assertWritableStore();
  const db = getAdminFirestore();
  if (db) {
    await db.collection(name).doc(id).set(toFirestoreDoc(data));
    return data;
  }
  const store = loadLocalStore();
  (store[name] as unknown as Record<string, T>)[id] = data;
  saveLocalStore(store);
  return data;
}

export async function updateDocument<T extends Record<string, unknown>>(
  name: CollectionName,
  id: string,
  patch: Partial<T>
): Promise<T | null> {
  await initDataStore();
  assertWritableStore();
  const existing = await getDocument<T>(name, id);
  if (!existing) return null;
  const merged = { ...existing, ...patch } as T;
  // Clean undefined keys
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  await setDocument(name, id, merged);
  return merged;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const existing = await getDocument<SystemConfig>('systemConfig', 'global');
  if (existing) return existing;
  const seed = createInitialSeed().systemConfig.global;
  await setDocument('systemConfig', 'global', seed as unknown as Record<string, unknown>);
  return seed;
}

export async function recordAuditLog(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
  const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const log: AuditLog = {
    id,
    ...entry,
    createdAt: new Date().toISOString(),
  };
  await setDocument('auditLogs', id, log as unknown as Record<string, unknown>);
  return log;
}
