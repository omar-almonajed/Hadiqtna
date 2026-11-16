import { z } from 'zod';

const safeIdRegex = /^[a-zA-Z0-9_-]+$/;

export const safeIdSchema = z.string().min(2).max(128).regex(safeIdRegex, 'Invalid identifier format');

export const iotReadingSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    return {
      deviceId: obj.deviceId ?? obj.d,
      sequenceNumber: obj.sequenceNumber ?? obj.s,
      distanceCm: obj.distanceCm ?? obj.cm,
      signalStrength: obj.signalStrength ?? obj.r,
      measuredAt: obj.measuredAt ?? obj.t,
      queuedReadingsCount: obj.queuedReadingsCount ?? obj.q,
      overflowDroppedCount: obj.overflowDroppedCount ?? obj.ov,
      lastPowerResetReason: obj.lastPowerResetReason ?? obj.rst,
      networkType: obj.networkType ?? obj.net,
    };
  },
  z.object({
    deviceId: safeIdSchema,
    sequenceNumber: z.number().int().min(0).max(1_000_000_000),
    distanceCm: z.number().finite(),
    signalStrength: z.number().finite().min(-130).max(0),
    measuredAt: z.string().min(10).max(64).refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'measuredAt must be a valid ISO-8601 timestamp',
    }),
    queuedReadingsCount: z.number().int().min(0).max(10000).optional(),
    overflowDroppedCount: z.number().int().min(0).max(1_000_000).optional(),
    lastPowerResetReason: z.string().trim().max(64).optional(),
    networkType: z.string().trim().max(64).optional(),
  })
);

const batchItemSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    return {
      sequenceNumber: obj.sequenceNumber ?? obj.s,
      distanceCm: obj.distanceCm ?? obj.cm,
      signalStrength: obj.signalStrength ?? obj.r,
      measuredAt: obj.measuredAt ?? obj.t,
    };
  },
  z.object({
    sequenceNumber: z.number().int().min(0).max(1_000_000_000),
    distanceCm: z.number().finite(),
    signalStrength: z.number().finite().min(-130).max(0),
    measuredAt: z.string().min(10).max(64).refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'measuredAt must be a valid ISO-8601 timestamp',
    }),
  })
);

export const iotBatchReadingSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const obj = raw as Record<string, unknown>;
    return {
      deviceId: obj.deviceId ?? obj.d,
      readings: obj.readings ?? obj.b,
      queuedReadingsCount: obj.queuedReadingsCount ?? obj.q,
      overflowDroppedCount: obj.overflowDroppedCount ?? obj.ov,
      lastPowerResetReason: obj.lastPowerResetReason ?? obj.rst,
      networkType: obj.networkType ?? obj.net,
    };
  },
  z.object({
    deviceId: safeIdSchema,
    readings: z.array(batchItemSchema).min(1).max(50),
    queuedReadingsCount: z.number().int().min(0).max(10000).optional(),
    overflowDroppedCount: z.number().int().min(0).max(1_000_000).optional(),
    lastPowerResetReason: z.string().trim().max(64).optional(),
    networkType: z.string().trim().max(64).optional(),
  })
);

export const registerDeviceSchema = z.object({
  id: safeIdSchema.optional(),
  name: z.string().trim().min(2).max(160),
  deviceType: z.string().trim().min(2).max(80).default('ESP32-WROOM-32'),
  sensorModel: z.string().trim().min(2).max(80).default('CONFIGURABLE_ULTRASONIC'),
  binId: safeIdSchema,
  parkId: safeIdSchema,
  firmwareVersion: z.string().trim().min(1).max(40).default('1.0.0'),
  reportingIntervalSeconds: z.number().int().min(5).max(86400).default(30),
});

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  binId: safeIdSchema.optional(),
  parkId: safeIdSchema.optional(),
  sensorModel: z.string().trim().min(2).max(80).optional(),
  firmwareVersion: z.string().trim().min(1).max(40).optional(),
  reportingIntervalSeconds: z.number().int().min(5).max(86400).optional(),
  isActive: z.boolean().optional(),
});

export const createParkSchema = z.object({
  id: safeIdSchema.optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(''),
  location: z.string().trim().min(2).max(240),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).default('ACTIVE'),
});

export const updateParkSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().min(2).max(240).optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export const createBinSchema = z.object({
  id: safeIdSchema.optional(),
  parkId: safeIdSchema,
  name: z.string().trim().min(2).max(160),
  binType: z.enum(['GENERAL', 'RECYCLABLE', 'ORGANIC']).default('GENERAL'),
  capacityLiters: z.number().positive().max(5000).default(120),
  emptyDistanceCm: z.number().positive().max(500).default(90),
  fullDistanceCm: z.number().min(0).max(400).default(15),
  locationDescription: z.string().trim().min(2).max(300),
});

export const updateBinSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  binType: z.enum(['GENERAL', 'RECYCLABLE', 'ORGANIC']).optional(),
  capacityLiters: z.number().positive().max(5000).optional(),
  emptyDistanceCm: z.number().positive().max(500).optional(),
  fullDistanceCm: z.number().min(0).max(400).optional(),
  locationDescription: z.string().trim().min(2).max(300).optional(),
  status: z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'FULL', 'OFFLINE', 'MAINTENANCE']).optional(),
});

export const citizenReportSchema = z.object({
  parkId: safeIdSchema,
  reportType: z.enum([
    'FULL_BIN',
    'PLAYGROUND_DAMAGE',
    'RESTROOM_ISSUE',
    'BROKEN_EQUIPMENT',
    'PARK_CLEANLINESS',
    'DAMAGED_BENCH',
    'LIGHTING_PROBLEM',
    'OTHER',
  ]),
  title: z.string().trim().max(160).optional(),
  description: z.string().trim().min(5).max(2000),
  locationDescription: z.string().trim().max(300).optional(),
  reporterName: z.string().trim().max(120).optional(),
  reporterContact: z.string().trim().max(160).optional(),
});

export const updateReportSchema = z.object({
  status: z
    .enum([
      'NEW',
      'UNDER_REVIEW',
      'ACCEPTED',
      'REJECTED',
      'CONVERTED_TO_TASK',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
    ])
    .optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedTo: safeIdSchema.optional(),
  assignedTeam: z.string().trim().max(120).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
  statusNote: z.string().trim().max(500).optional(),
});

export const convertReportSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedTo: safeIdSchema.optional(),
  assignedTeam: z.string().trim().max(120).optional(),
  scheduledFor: z
    .string()
    .trim()
    .max(64)
    .refine((val) => val === '' || !Number.isNaN(Date.parse(val)), {
      message: 'scheduledFor must be a valid ISO-8601 date',
    })
    .optional(),
});

export const createTaskSchema = z.object({
  reportId: safeIdSchema.optional(),
  parkId: safeIdSchema,
  binId: safeIdSchema.optional(),
  assignedTo: safeIdSchema.optional(),
  assignedTeam: z.string().trim().max(120).optional(),
  locationDescription: z.string().trim().max(300).optional(),
  scheduledFor: z
    .string()
    .trim()
    .max(64)
    .refine((val) => val === '' || !Number.isNaN(Date.parse(val)), {
      message: 'scheduledFor must be a valid ISO-8601 date',
    })
    .optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

export const updateTaskSchema = z.object({
  assignedTo: safeIdSchema.optional(),
  assignedTeam: z.string().trim().max(120).optional(),
  locationDescription: z.string().trim().max(300).optional(),
  scheduledFor: z
    .string()
    .trim()
    .max(64)
    .refine((val) => val === '' || !Number.isNaN(Date.parse(val)), {
      message: 'scheduledFor must be a valid ISO-8601 date',
    })
    .optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  description: z.string().trim().max(2000).optional(),
  completionNotes: z.string().trim().max(1000).optional(),
});

export const systemConfigSchema = z.object({
  operatingMode: z.enum(['DEMO', 'HARDWARE']).optional(),
  warningThresholdPercent: z.number().min(50).max(95).optional(),
  criticalThresholdPercent: z.number().min(60).max(100).optional(),
  defaultReportingIntervalSeconds: z.number().int().min(5).max(86400).optional(),
  offlineTimeoutSeconds: z.number().int().min(15).max(86400).optional(),
  defaultEmptyDistanceCm: z.number().positive().max(500).optional(),
  defaultFullDistanceCm: z.number().min(0).max(400).optional(),
});

export const demoSimulateSchema = z.object({
  binId: safeIdSchema.default('bin-nakheel-01'),
  fillPercentage: z.number().min(0).max(100),
  signalStrength: z.number().min(-120).max(-20).default(-62),
});

export const demoDeviceStatusSchema = z.object({
  deviceId: safeIdSchema.default('BIN-ESP32-001'),
  connectionStatus: z.enum(['ONLINE', 'OFFLINE']),
});

export const userRoleUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'WORKER', 'PENDING']).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
});

export const localLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
});

export const setLocalCredentialSchema = z.object({
  password: z.string().min(8).max(128),
});
