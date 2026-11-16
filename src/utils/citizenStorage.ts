import type { ReportStatus, ReportType } from '../types/domain';

export interface SavedCitizenReport {
  referenceNumber: string;
  trackingCode: string;
  parkId: string;
  reportType: ReportType;
  title: string;
  createdAt: string;
  lastKnownStatus: ReportStatus;
}

const STORAGE_KEY = 'hadiqtna_citizen_reports_v1';

export function loadSavedCitizenReports(): SavedCitizenReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedCitizenReport =>
        Boolean(item && typeof item.referenceNumber === 'string' && typeof item.trackingCode === 'string')
    );
  } catch {
    return [];
  }
}

export function saveCitizenReportToDevice(entry: SavedCitizenReport): SavedCitizenReport[] {
  const existing = loadSavedCitizenReports().filter(
    (item) => item.referenceNumber !== entry.referenceNumber
  );
  const next = [entry, ...existing].slice(0, 25);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function updateSavedReportStatus(referenceNumber: string, status: ReportStatus): void {
  const existing = loadSavedCitizenReports();
  const idx = existing.findIndex((r) => r.referenceNumber === referenceNumber);
  if (idx === -1) return;
  existing[idx] = { ...existing[idx], lastKnownStatus: status };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Ignore
  }
}

export function getSavedTrackingCode(referenceNumber: string): string {
  const match = loadSavedCitizenReports().find((r) => r.referenceNumber === referenceNumber);
  return match?.trackingCode || '';
}
