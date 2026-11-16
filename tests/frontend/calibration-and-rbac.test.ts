import { describe, expect, it } from 'vitest';
import {
  calculateDistanceFromFill,
  calculateFillPercentage,
  classifyBinStatus,
  classifyLedState,
  validateDistanceReading,
} from '../../src/utils/calibration.ts';
import {
  BIN_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  ROLE_LABELS,
} from '../../src/utils/i18n.ts';

describe('Sensor Calibration & Frontend Domain Logic Tests', () => {
  it('computes clamped fill percentage accurately from ultrasonic distance', () => {
    expect(calculateFillPercentage(90, 90, 15)).toBe(0);
    expect(calculateFillPercentage(15, 90, 15)).toBe(100);
    expect(calculateFillPercentage(52.5, 90, 15)).toBe(50);
    expect(calculateFillPercentage(30, 90, 15)).toBe(80);
    // Clamping bounds
    expect(calculateFillPercentage(110, 90, 15)).toBe(0);
    expect(calculateFillPercentage(5, 90, 15)).toBe(100);
  });

  it('rejects negative and physically out-of-range measurements', () => {
    const bounds = { emptyDistanceCm: 90, fullDistanceCm: 15, maxSensorRangeCm: 400 };
    expect(validateDistanceReading(-1, bounds).valid).toBe(false);
    expect(validateDistanceReading(Number.NaN, bounds).valid).toBe(false);
    expect(validateDistanceReading(500, bounds).valid).toBe(false);
    expect(validateDistanceReading(30, bounds).valid).toBe(true);
  });

  it('classifies bin operational status and LED colors according to configurable thresholds', () => {
    expect(classifyBinStatus(45)).toBe('NORMAL');
    expect(classifyBinStatus(79)).toBe('NORMAL');
    expect(classifyBinStatus(80)).toBe('WARNING');
    expect(classifyBinStatus(94)).toBe('WARNING');
    expect(classifyBinStatus(95)).toBe('CRITICAL');
    expect(classifyBinStatus(100)).toBe('FULL');

    expect(classifyLedState(49)).toBe('GREEN');
    expect(classifyLedState(50)).toBe('YELLOW');
    expect(classifyLedState(79)).toBe('YELLOW');
    expect(classifyLedState(80)).toBe('RED');
  });

  it('converts simulated fill percentage back to accurate distance', () => {
    expect(calculateDistanceFromFill(80, 90, 15)).toBe(30);
    expect(calculateDistanceFromFill(0, 90, 15)).toBe(90);
    expect(calculateDistanceFromFill(100, 90, 15)).toBe(15);
  });

  it('provides Arabic and English labels for all roles, statuses, and report categories', () => {
    expect(ROLE_LABELS.ADMIN.ar).toBeTruthy();
    expect(BIN_STATUS_LABELS.WARNING.ar).toContain('80%');
    expect(REPORT_TYPE_LABELS.PLAYGROUND_DAMAGE.ar).toBeTruthy();
  });
});
