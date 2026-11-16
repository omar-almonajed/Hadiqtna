import { useState, type FormEvent } from 'react';
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react';
import { EmptyState } from '../components/common/StateViews';
import { DeviceStatusLabel } from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { Device } from '../types/domain';
import { formatDateTime } from '../utils/i18n';

interface DeviceWithCredInfo extends Device {
  hasCredential?: boolean;
  tokenPrefix?: string | null;
  tokenRotatedAt?: string | null;
  isTokenRevoked?: boolean;
}

export function DevicesPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { devices, bins, parks, refreshAll } = useRealtime();

  const isAdmin = profile?.role === 'ADMIN';
  const [showRegister, setShowRegister] = useState(false);
  const [devId, setDevId] = useState('');
  const [name, setName] = useState('');
  const [deviceType, setDeviceType] = useState('ESP32-WROOM-32');
  const [sensorModel, setSensorModel] = useState('CONFIGURABLE_ULTRASONIC');
  const [binId, setBinId] = useState(bins[0]?.id || 'bin-nakheel-01');
  const [parkId, setParkId] = useState(parks[0]?.id || 'park-alnakheel');
  const [intervalSec, setIntervalSec] = useState(300);

  const [oneTimeSecret, setOneTimeSecret] = useState<{ deviceId: string; token: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        device: Device;
        provisionedToken: string;
      }>('/api/iot/devices', {
        method: 'POST',
        body: {
          ...(devId.trim() ? { id: devId.trim() } : {}),
          name,
          deviceType,
          sensorModel,
          binId: binId || bins[0]?.id,
          parkId: parkId || parks[0]?.id,
          reportingIntervalSeconds: Number(intervalSec),
        },
      });
      setOneTimeSecret({ deviceId: res.device.id, token: res.provisionedToken });
      setDevId('');
      setName('');
      setShowRegister(false);
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تسجيل الجهاز.', 'Failed to register device.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRotateToken = async (deviceId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ deviceId: string; provisionedToken: string }>(
        `/api/iot/devices/${deviceId}/rotate-token`,
        { method: 'POST' }
      );
      setOneTimeSecret({ deviceId: res.deviceId, token: res.provisionedToken });
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('فشل تدوير الرمز.', 'Failed to rotate token.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/devices/${deviceId}/revoke`, { method: 'POST' });
      setFeedback(t(`تم إلغاء اعتماد الجهاز (${deviceId}) وتعطيله فوراً.`, `Revoked credentials for ${deviceId}.`));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('فشل إلغاء الاعتماد.', 'Revocation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (device: Device) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/devices/${device.id}`, {
        method: 'PATCH',
        body: { isActive: !device.isActive },
      });
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('فشل تغيير الحالة.', 'Update failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReassignBin = async (deviceId: string, nextBinId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/iot/devices/${deviceId}`, {
        method: 'PATCH',
        body: { binId: nextBinId },
      });
      setFeedback(t('تم تحديث ربط الجهاز بالحاوية.', 'Updated bin association.'));
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر الربط.', 'Association failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout
      title={t('إدارة أجهزة إنترنت الأشياء (ESP32)', 'IoT Device Management')}
      subtitle={t('تسجيل العقد وتدوير وإلغاء رموز المصادقة ومراقبة التشخيص والاتصال', 'Manage ESP32 nodes, credential hashes, bin associations, and diagnostics')}
      actions={
        isAdmin ? (
          <button
            type="button"
            onClick={() => setShowRegister((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('تسجيل جهاز ESP32', 'Register Device')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {feedback && (
          <div className="bg-white border border-[#E2E6E1] rounded-lg px-4 py-3 text-sm text-[#17211C]">
            {feedback}
          </div>
        )}

        {/* One-time secret token display */}
        {oneTimeSecret && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-sm text-emerald-950">
                  {t(`رمز المصادقة السري للجهاز (${oneTimeSecret.deviceId})`, `One-Time Device Token (${oneTimeSecret.deviceId})`)}
                </h2>
                <p className="text-xs text-emerald-900 mt-0.5">
                  {t(
                    'انسخ هذا الرمز وأدخله في ملف include/secrets.h للـ ESP32 الآن. يُحفظ في قاعدة البيانات كقيمة مهشّرة (SHA-256) فقط ولن يظهر مجدداً.',
                    'Copy this token into ESP32 secrets.h now. Only its SHA-256 hash is stored and it will never be shown again.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOneTimeSecret(null)}
                className="text-xs font-semibold text-emerald-900 underline"
              >
                {t('إغلاق', 'Dismiss')}
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded px-3 py-2">
              <code className="font-mono text-xs text-[#17211C] break-all flex-1" dir="ltr">
                {oneTimeSecret.token}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(oneTimeSecret.token)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-950 rounded hover:bg-emerald-200"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('نسخ', 'Copy')}</span>
              </button>
            </div>
          </div>
        )}

        {showRegister && isAdmin && (
          <form
            onSubmit={handleRegister}
            className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4"
          >
            <h2 className="font-display font-bold text-sm text-[#17211C]">
              {t('تسجيل عقدة استشعار ESP32 جديدة', 'Register New ESP32 Device')}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  {t('معرّف الجهاز (اختياري)', 'Device ID (optional)')}
                </label>
                <input
                  value={devId}
                  onChange={(e) => setDevId(e.target.value)}
                  placeholder="BIN-ESP32-002"
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('اسم الجهاز', 'Device Name')}</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('نوع اللوحة', 'Board Type')}</label>
                <input
                  required
                  list="board-type-options"
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
                <datalist id="board-type-options">
                  <option value="ESP32-WROOM-32" />
                  <option value="ESP8266-NodeMCU" />
                  <option value="ESP32-S3" />
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('طراز حساس المسافة', 'Sensor Model')}</label>
                <select
                  value={sensorModel}
                  onChange={(e) => setSensorModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  <option value="CONFIGURABLE_ULTRASONIC">{t('قابل للتهيئة (غير محدد نهائياً)', 'Configurable Ultrasonic')}</option>
                  <option value="HC-SR04">HC-SR04</option>
                  <option value="JSN-SR04T">JSN-SR04T (Waterproof)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الحاوية المرتبطة', 'Associated Bin')}</label>
                <select
                  value={binId}
                  onChange={(e) => setBinId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('فاصل الإرسال (ثانية)', 'Interval (s)')}</label>
                <input
                  type="number"
                  min={5}
                  max={86400}
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="px-4 py-2 text-xs font-medium border border-[#E2E6E1] rounded-lg"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg"
              >
                {t('تسجيل وإصدار رمز', 'Register & Provision Token')}
              </button>
            </div>
          </form>
        )}

        {devices.length === 0 ? (
          <EmptyState
            title={t('لا توجد أجهزة مسجلة', 'No Registered Devices')}
            description={t('سجّل أول وحدة ESP32 لإصدار رمز مصادقة وربطها بالحاوية.', 'Register an ESP32 node to generate credentials.')}
          />
        ) : (
          <div className="space-y-4">
            {(devices as DeviceWithCredInfo[]).map((dev) => {
              const linkedBin = bins.find((b) => b.id === dev.binId);
              return (
                <div
                  key={dev.id}
                  className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-display font-bold text-base text-[#17211C]">{dev.name}</h3>
                        <span className="font-mono text-xs text-stone-500">{dev.id}</span>
                      </div>
                      <p className="text-xs text-stone-500">
                        {dev.deviceType} · {dev.sensorModel || 'CONFIGURABLE_ULTRASONIC'} · v{dev.firmwareVersion}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <DeviceStatusLabel status={dev.connectionStatus} />
                      <span className={`text-xs font-medium ${dev.isActive ? 'text-emerald-800' : 'text-red-700'}`}>
                        {dev.isActive ? t('مفعّل', 'Active') : t('معطّل', 'Inactive')}
                      </span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs pt-3 border-t border-[#E2E6E1]">
                    <div>
                      <span className="text-stone-500 block mb-1">{t('الحاوية المرتبطة', 'Associated Bin')}</span>
                      {isAdmin ? (
                        <select
                          value={dev.binId}
                          disabled={busy}
                          onChange={(e) => void handleReassignBin(dev.id, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-[#D4DAD3] rounded bg-white"
                        >
                          {bins.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium text-[#17211C]">{linkedBin?.name || dev.binId}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-stone-500 block">{t('آخر اتصال', 'Last Seen')}</span>
                      <span className="font-mono tabular-nums text-[#17211C]">
                        {formatDateTime(dev.lastSeenAt, lang)}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">{t('قوة إشارة Wi-Fi', 'Signal (RSSI)')}</span>
                      <span className="font-mono tabular-nums text-[#17211C]">
                        {dev.lastSignalStrength !== undefined ? `${dev.lastSignalStrength} dBm` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">{t('آخر تسلسل', 'Last Sequence')}</span>
                      <span className="font-mono tabular-nums text-[#17211C]">
                        {dev.lastSequenceNumber !== undefined ? dev.lastSequenceNumber : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">{t('حالة الرمز السري', 'Credential')}</span>
                      <span className="font-mono text-[#17211C]">
                        {dev.isTokenRevoked
                          ? t('ملغى (Revoked)', 'Revoked')
                          : dev.tokenPrefix
                            ? `${dev.tokenPrefix}...`
                            : t('غير مُصدر بعد', 'Not provisioned')}
                      </span>
                    </div>
                  </div>

                  {(dev.queuedReadingsCount !== undefined ||
                    dev.overflowDroppedCount !== undefined ||
                    dev.networkType ||
                    dev.lastPowerResetReason) && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-2 border-t border-dashed border-[#E2E6E1]">
                      <div>
                        <span className="text-stone-500 block">{t('القراءات المخزنة مؤقتاً (ESP32)', 'Buffered Queue')}</span>
                        <span className="font-mono tabular-nums text-[#17211C]">
                          {dev.queuedReadingsCount ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-stone-500 block">{t('قراءات محذوفة بالفيض (DROP_OLDEST)', 'Queue Overflow Dropped')}</span>
                        <span className="font-mono tabular-nums text-[#17211C]">
                          {dev.overflowDroppedCount ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-stone-500 block">{t('الشبكة النشطة', 'Active Network')}</span>
                        <span className="font-mono text-[#17211C]">{dev.networkType || '—'}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block">{t('سبب آخر إعادة تشغيل', 'Last Power Reset')}</span>
                        <span className="font-mono text-[#17211C]">{dev.lastPowerResetReason || '—'}</span>
                      </div>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#E2E6E1]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleActive(dev)}
                        className="px-3 py-1.5 text-xs font-medium border border-[#D4DAD3] rounded-lg hover:bg-stone-50"
                      >
                        {dev.isActive ? t('تعطيل الجهاز', 'Deactivate') : t('تفعيل الجهاز', 'Activate')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRotateToken(dev.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{dev.hasCredential ? t('تدوير الرمز السري', 'Rotate Token') : t('إصدار رمز مصادقة', 'Provision Token')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRevoke(dev.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        <span>{t('إلغاء الاعتماد', 'Revoke')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
