import type { BinStatus } from '../types/domain.ts';

export interface CalibrationBounds {
  emptyDistanceCm: number;
  fullDistanceCm: number;
  maxSensorRangeCm?: number;
}

export interface DistanceValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates raw ultrasonic distance measurement against physical bin and sensor bounds.
 * Rejects negative values, NaN, out-of-range measurements, and physically impossible values.
 */
export function validateDistanceReading(
  distanceCm: number,
  calibration: CalibrationBounds
): DistanceValidationResult {
  if (typeof distanceCm !== 'number' || !Number.isFinite(distanceCm)) {
    return { valid: false, reason: 'INVALID_NUMBER' };
  }
  if (distanceCm < 0) {
    return { valid: false, reason: 'NEGATIVE_DISTANCE' };
  }
  const maxAllowed = Math.max(calibration.maxSensorRangeCm ?? 450, calibration.emptyDistanceCm + 40);
  if (distanceCm > maxAllowed) {
    return { valid: false, reason: 'OUT_OF_SENSOR_RANGE' };
  }
  if (calibration.emptyDistanceCm <= calibration.fullDistanceCm) {
    return { valid: false, reason: 'INVALID_BIN_CALIBRATION' };
  }
  // Ultrasonic blind-zone / physically impossible values far above bin top
  if (distanceCm < Math.max(0, calibration.fullDistanceCm - 15)) {
    return { valid: false, reason: 'BELOW_MIN_PHYSICAL_OFFSET' };
  }
  return { valid: true };
}

/**
 * Calculates clamped fill percentage using:
 * fillPercentage = ((emptyDistance - measuredDistance) / (emptyDistance - fullDistance)) * 100
 */
export function calculateFillPercentage(
  measuredDistanceCm: number,
  emptyDistanceCm: number,
  fullDistanceCm: number
): number {
  if (emptyDistanceCm <= fullDistanceCm) {
    throw new Error('emptyDistanceCm must be greater than fullDistanceCm');
  }
  const raw = ((emptyDistanceCm - measuredDistanceCm) / (emptyDistanceCm - fullDistanceCm)) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round(clamped);
}

/**
 * Inverse helper used by Demo simulator to convert a desired fill percentage into distanceCm.
 */
export function calculateDistanceFromFill(
  fillPercentage: number,
  emptyDistanceCm: number,
  fullDistanceCm: number
): number {
  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const dist = emptyDistanceCm - (clamped / 100) * (emptyDistanceCm - fullDistanceCm);
  return Math.round(dist * 10) / 10;
}

/**
 * Classifies operational bin status from fill percentage and configurable thresholds.
 */
export function classifyBinStatus(
  fillPercentage: number,
  warningThreshold = 80,
  criticalThreshold = 95
): BinStatus {
  if (fillPercentage >= 100) return 'FULL';
  if (fillPercentage >= criticalThreshold) return 'CRITICAL';
  if (fillPercentage >= warningThreshold) return 'WARNING';
  return 'NORMAL';
}

export type LedColor = 'GREEN' | 'YELLOW' | 'RED';

/**
 * LED status indicator logic matching ESP32 firmware:
 * 0-49%: GREEN, 50-79%: YELLOW, 80-100%: RED
 */
export function classifyLedState(
  fillPercentage: number,
  yellowThreshold = 50,
  redThreshold = 80
): LedColor {
  if (fillPercentage >= redThreshold) return 'RED';
  if (fillPercentage >= yellowThreshold) return 'YELLOW';
  return 'GREEN';
}
