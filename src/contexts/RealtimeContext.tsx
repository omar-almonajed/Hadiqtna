import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { apiRequest, getActiveSessionToken, getStoredLocalToken } from '../services/apiClient';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import type {
  AlertItem,
  Bin,
  CitizenReport,
  Device,
  MaintenanceTask,
  Park,
  SensorReading,
  StaffDirectoryEntry,
  StaffNotification,
  SystemConfig,
} from '../types/domain';
import { useAuth } from './AuthContext';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

interface RealtimeContextValue {
  parks: Park[];
  bins: Bin[];
  devices: Device[];
  readings: SensorReading[];
  alerts: AlertItem[];
  reports: CitizenReport[];
  tasks: MaintenanceTask[];
  staff: StaffDirectoryEntry[];
  notifications: StaffNotification[];
  unreadNotificationsCount: number;
  config: SystemConfig | null;
  firestoreAdminConnected: boolean;
  loading: boolean;
  connectionState: ConnectionState;
  lastUpdatedAt: string | null;
  error: string | null;
  refreshAll: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { profile, firebaseUser, authMode, loading: authLoading } = useAuth();
  const [parks, setParks] = useState<Park[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [firestoreAdminConnected, setFirestoreAdminConnected] = useState(false);

  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isActiveStaff = Boolean(profile && profile.isActive && profile.role !== 'PENDING');
  const isSupervisorOrAdmin = Boolean(
    profile && profile.isActive && (profile.role === 'ADMIN' || profile.role === 'SUPERVISOR')
  );
  const isIoTOperatorOrAbove = Boolean(
    profile &&
      profile.isActive &&
      (profile.role === 'ADMIN' || profile.role === 'SUPERVISOR' || profile.role === 'OPERATOR')
  );

  const unreadNotificationsCount = notifications.filter(
    (n) => !n.isRead && !(profile?.uid && (n.readBy ?? []).includes(profile.uid))
  ).length;

  const refreshAll = useCallback(async () => {
    const hasToken = Boolean(firebaseUser || getStoredLocalToken());
    if (!isActiveStaff || !hasToken) return;
    setLoading(true);
    setError(null);
    try {
      const healthRes = await apiRequest<{ firestoreAdminConnected?: boolean }>('/api/health', {
        authenticated: false,
      });
      setFirestoreAdminConnected(Boolean(healthRes.firestoreAdminConnected));

      const basePromises: Promise<unknown>[] = [
        apiRequest<{ parks: Park[] }>('/api/parks'),
        apiRequest<{ bins: Bin[] }>('/api/iot/bins'),
        apiRequest<{ tasks: MaintenanceTask[] }>('/api/maintenance'),
        apiRequest<{ staff: StaffDirectoryEntry[] }>('/api/staff'),
        apiRequest<{ config: SystemConfig }>('/api/settings'),
        apiRequest<{ notifications: StaffNotification[] }>('/api/notifications'),
      ];

      if (isIoTOperatorOrAbove) {
        basePromises.push(
          apiRequest<{ devices: Device[] }>('/api/iot/devices'),
          apiRequest<{ readings: SensorReading[] }>('/api/iot/readings?limit=100'),
          apiRequest<{ alerts: AlertItem[] }>('/api/iot/alerts')
        );
      }
      if (isSupervisorOrAdmin) {
        basePromises.push(apiRequest<{ reports: CitizenReport[] }>('/api/reports'));
      }

      const results = await Promise.all(basePromises);
      setParks((results[0] as { parks: Park[] }).parks);
      setBins((results[1] as { bins: Bin[] }).bins);
      setTasks((results[2] as { tasks: MaintenanceTask[] }).tasks);
      setStaff((results[3] as { staff: StaffDirectoryEntry[] }).staff);
      setConfig((results[4] as { config: SystemConfig }).config);
      setNotifications((results[5] as { notifications: StaffNotification[] }).notifications);

      let cursor = 6;
      if (isIoTOperatorOrAbove) {
        setDevices((results[cursor] as { devices: Device[] }).devices);
        setReadings((results[cursor + 1] as { readings: SensorReading[] }).readings);
        setAlerts((results[cursor + 2] as { alerts: AlertItem[] }).alerts);
        cursor += 3;
      }
      if (isSupervisorOrAdmin) {
        setReports((results[cursor] as { reports: CitizenReport[] }).reports);
      }
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المنصة.');
      setConnectionState('ERROR');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isActiveStaff, isIoTOperatorOrAbove, isSupervisorOrAdmin]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        const res = await apiRequest<{ notification: StaffNotification }>(
          `/api/notifications/${notificationId}/read`,
          { method: 'POST' }
        );
        if (res.notification) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notificationId ? res.notification : n))
          );
        }
      } catch {
        // Non-fatal
      }
    },
    []
  );

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt ?? now,
          readBy: profile?.uid ? Array.from(new Set([...(n.readBy ?? []), profile.uid])) : n.readBy,
        }))
      );
    } catch {
      // Non-fatal
    }
  }, [profile?.uid]);

  useEffect(() => {
    const hasToken = Boolean(firebaseUser || getStoredLocalToken());
    if (authLoading || !isActiveStaff || !hasToken) {
      return;
    }
    void refreshAll();
  }, [authLoading, authMode, firebaseUser, isActiveStaff, refreshAll]);

  // Real-time Server-Sent Events subscription
  useEffect(() => {
    const localToken = getStoredLocalToken();
    if (authLoading || !isActiveStaff || (!auth.currentUser && !localToken)) {
      return;
    }

    let cancelled = false;
    setConnectionState('CONNECTING');

    getActiveSessionToken()
      .then((token) => {
        if (cancelled || !token) return;
        const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
        eventSourceRef.current = es;

        es.addEventListener('connected', () => {
          setConnectionState('CONNECTED');
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('bin:updated', (e) => {
          const updated = JSON.parse((e as MessageEvent).data) as Bin;
          setBins((prev) => {
            const idx = prev.findIndex((b) => b.id === updated.id);
            if (idx === -1) return [updated, ...prev];
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          });
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('device:updated', (e) => {
          const updated = JSON.parse((e as MessageEvent).data) as Device;
          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.id === updated.id);
            if (idx === -1) return [updated, ...prev];
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          });
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('reading:created', (e) => {
          const reading = JSON.parse((e as MessageEvent).data) as SensorReading;
          setReadings((prev) => [reading, ...prev.filter((r) => r.id !== reading.id)].slice(0, 100));
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('alert:created', (e) => {
          const alert = JSON.parse((e as MessageEvent).data) as AlertItem;
          setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('alert:updated', (e) => {
          const alert = JSON.parse((e as MessageEvent).data) as AlertItem;
          setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('report:created', (e) => {
          const rep = JSON.parse((e as MessageEvent).data) as CitizenReport;
          setReports((prev) => [rep, ...prev.filter((r) => r.id !== rep.id)]);
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('report:updated', (e) => {
          const rep = JSON.parse((e as MessageEvent).data) as CitizenReport;
          setReports((prev) => prev.map((r) => (r.id === rep.id ? rep : r)));
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('task:created', (e) => {
          const task = JSON.parse((e as MessageEvent).data) as MaintenanceTask;
          setTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('task:updated', (e) => {
          const task = JSON.parse((e as MessageEvent).data) as MaintenanceTask;
          setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('notification:created', (e) => {
          const notif = JSON.parse((e as MessageEvent).data) as StaffNotification;
          setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)].slice(0, 100));
          setLastUpdatedAt(new Date().toISOString());
        });

        es.addEventListener('config:updated', (e) => {
          const nextCfg = JSON.parse((e as MessageEvent).data) as SystemConfig;
          setConfig(nextCfg);
          setLastUpdatedAt(new Date().toISOString());
        });

        es.onerror = () => {
          setConnectionState('RECONNECTING');
        };
      })
      .catch(() => {
        setConnectionState('ERROR');
      });

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [authLoading, authMode, isActiveStaff]);

  // Bounded Firestore listeners when Admin Firestore is connected & Firebase Auth active
  useEffect(() => {
    if (
      authLoading ||
      !isActiveStaff ||
      !firestoreAdminConnected ||
      !profile ||
      authMode !== 'FIREBASE' ||
      !auth.currentUser
    ) {
      return;
    }

    const unsubs: Array<() => void> = [];

    const binsUnsub = onSnapshot(
      query(collection(db, 'bins'), limit(25)),
      (snap) => {
        if (!snap.empty) {
          setBins(snap.docs.map((d) => d.data() as Bin));
          setLastUpdatedAt(new Date().toISOString());
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bins')
    );
    unsubs.push(binsUnsub);

    if (isIoTOperatorOrAbove) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'alerts'), limit(25)),
          (snap) => {
            if (!snap.empty) {
              setAlerts(snap.docs.map((d) => d.data() as AlertItem));
              setLastUpdatedAt(new Date().toISOString());
            }
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'alerts')
        )
      );
    }

    const isFieldTech = profile.role === 'WORKER' || profile.role === 'MAINTENANCE';
    const tasksRef = isFieldTech
      ? query(collection(db, 'maintenanceTasks'), where('assignedTo', '==', profile.uid), limit(25))
      : query(collection(db, 'maintenanceTasks'), limit(25));
    unsubs.push(
      onSnapshot(
        tasksRef,
        (snap) => {
          if (!snap.empty) {
            setTasks(snap.docs.map((d) => d.data() as MaintenanceTask));
            setLastUpdatedAt(new Date().toISOString());
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'maintenanceTasks')
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [authLoading, authMode, firestoreAdminConnected, isActiveStaff, isIoTOperatorOrAbove, profile]);

  return (
    <RealtimeContext.Provider
      value={{
        parks,
        bins,
        devices,
        readings,
        alerts,
        reports,
        tasks,
        staff,
        notifications,
        unreadNotificationsCount,
        config,
        firestoreAdminConnected,
        loading,
        connectionState,
        lastUpdatedAt,
        error,
        refreshAll,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
