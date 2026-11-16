import { useEffect, useState } from 'react';
import { Sliders, Wifi, WifiOff } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useRealtime } from '../../contexts/RealtimeContext';
import { apiRequest } from '../../services/apiClient';
import { classifyLedState } from '../../utils/calibration';

const DEMO_FILL_PRESETS = [28, 54, 84, 42, 96, 67, 35];

export function DemoControlPanel() {
  const { parks, bins, devices, config, refreshAll } = useRealtime();
  const { t } = useLanguage();

  const [selectedBinId, setSelectedBinId] = useState<string>('');
  const targetBin = bins.find((b) => b.id === selectedBinId) || bins[0];
  const targetDevice = targetBin
    ? devices.find((d) => d.binId === targetBin.id) || devices[0]
    : undefined;

  const [fillInput, setFillInput] = useState<number>(targetBin?.currentFillPercentage ?? 45);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (targetBin) {
      setFillInput(targetBin.currentFillPercentage);
    }
  }, [targetBin?.id]);

  if (!config || config.operatingMode !== 'DEMO' || !targetBin) {
    return null;
  }

  const ledState = classifyLedState(fillInput);

  const sendSimulatedFill = async (value: number) => {
    setBusy(true);
    setFeedback(null);
    setFillInput(value);
    try {
      const res = await apiRequest<{
        success: boolean;
        alertTriggered: boolean;
        reading: { fillPercentage: number; distanceCm: number };
      }>('/api/iot/demo/simulate', {
        method: 'POST',
        body: {
          binId: targetBin.id,
          fillPercentage: value,
          signalStrength: -62,
        },
      });
      setFeedback(
        res.alertTriggered
          ? t(
              `[DEMO] تم إرسال قراءة تجريبية للحاوية (${targetBin.name}: ${res.reading.fillPercentage}% · ${res.reading.distanceCm} سم) وتوليد تنبيه تجاوز العتبة.`,
              `[DEMO] Simulated ${res.reading.fillPercentage}% (${res.reading.distanceCm} cm) for ${targetBin.name} and triggered alert.`
            )
          : t(
              `[DEMO] تم إرسال قراءة تجريبية للحاوية (${targetBin.name}: ${res.reading.fillPercentage}% · ${res.reading.distanceCm} سم).`,
              `[DEMO] Simulated ${res.reading.fillPercentage}% (${res.reading.distanceCm} cm) for ${targetBin.name}.`
            )
      );
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('فشل تشغيل المحاكاة.', 'Simulation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const simulateDamascusBins = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const targetBins = bins.filter((b) => {
        const p = parks.find((pk) => pk.id === b.parkId);
        return (
          b.parkId === 'park-alnakheel' ||
          b.parkId.startsWith('park-damascus-') ||
          Boolean(p?.location.includes('دمشق'))
        );
      });

      let alertsTriggered = 0;
      for (let i = 0; i < targetBins.length; i++) {
        const bin = targetBins[i];
        const preset = DEMO_FILL_PRESETS[i % DEMO_FILL_PRESETS.length];
        const res = await apiRequest<{
          success: boolean;
          alertTriggered: boolean;
        }>('/api/iot/demo/simulate', {
          method: 'POST',
          body: {
            binId: bin.id,
            fillPercentage: preset,
            signalStrength: -58 - (i % 4) * 4,
          },
        });
        if (res.alertTriggered) alertsTriggered += 1;
      }
      setFeedback(
        t(
          `[DEMO] تم توليد قراءات تجريبية لعدد ${targetBins.length} حاويات في حدائق دمشق (مع توليد ${alertsTriggered} تنبيه عتبة تجريبي).`,
          `[DEMO] Simulated readings across ${targetBins.length} Damascus bins (${alertsTriggered} threshold alerts triggered).`
        )
      );
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تشغيل محاكاة الحدائق.', 'Batch simulation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDeviceConnection = async (status: 'ONLINE' | 'OFFLINE') => {
    if (!targetDevice) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiRequest('/api/iot/demo/device-status', {
        method: 'POST',
        body: { deviceId: targetDevice.id, connectionStatus: status },
      });
      setFeedback(
        t(
          `[DEMO] تم ضبط حالة اتصال الجهاز (${targetDevice.id}) التجريبية إلى ${status}.`,
          `[DEMO] Simulated device status (${targetDevice.id}) set to ${status}.`
        )
      );
      await refreshAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('تعذر تحديث الحالة.', 'Failed to update status.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-amber-50/60 border border-amber-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-5 h-5 text-amber-800" aria-hidden="true" />
          <div>
            <h2 className="font-display font-bold text-sm text-amber-950">
              {t('لوحة اختبار وضع المحاكاة (DEMO Simulator)', 'DEMO Mode Simulator')}
            </h2>
            <p className="text-xs text-amber-800">
              {t(
                'اختر أي حاوية في حدائق دمشق لإرسال قراءة تجريبية بوسم DEMO دون المساس ببيانات العتاد الحقيقي.',
                'Select any Damascus park bin to send DEMO readings without mixing with HARDWARE telemetry.'
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void simulateDamascusBins()}
            className="px-3 py-1.5 text-xs font-semibold bg-[#14532D] text-white rounded hover:bg-[#0F3F22] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {t('محاكاة بيانات حدائق دمشق (DEMO)', 'Simulate Damascus Bins (DEMO)')}
          </button>
          <span className="font-mono text-xs font-semibold text-amber-900 bg-white border border-amber-300 px-2.5 py-1 rounded">
            LED: {ledState}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4 items-end">
        <div className="lg:col-span-4">
          <label className="block text-xs font-medium text-amber-950 mb-1">
            {t('الحاوية المستهدفة (حدائق دمشق):', 'Target Bin (Damascus Parks):')}
          </label>
          <select
            value={targetBin.id}
            onChange={(e) => setSelectedBinId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:border-[#14532D]"
          >
            {bins.map((bin) => {
              const park = parks.find((p) => p.id === bin.parkId);
              return (
                <option key={bin.id} value={bin.id}>
                  {park ? `${park.name} — ${bin.name}` : bin.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="lg:col-span-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-amber-950">
            <span>{t('نسبة الامتلاء التجريبية:', 'Simulated Fill Level:')}</span>
            <span className="font-mono font-bold text-sm tabular-nums">{fillInput}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={fillInput}
            onChange={(e) => setFillInput(Number(e.target.value))}
            className="w-full accent-[#14532D] cursor-pointer"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[0, 45, 79, 80, 95, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                onClick={() => void sendSimulatedFill(preset)}
                className="px-2 py-1 text-xs font-mono font-medium bg-white border border-amber-300 text-amber-950 rounded hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendSimulatedFill(fillInput)}
            className="px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? t('جارٍ الإرسال...', 'Sending...') : t('إرسال القراءة التجريبية', 'Send Simulated Reading')}
          </button>
          {targetDevice && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleDeviceConnection('ONLINE')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-white border border-emerald-300 text-emerald-900 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>{t('متصل', 'Online')}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleDeviceConnection('OFFLINE')}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>{t('منقطع', 'Offline')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {feedback && <p className="text-xs font-medium text-amber-950 bg-white/80 border border-amber-200 rounded px-3 py-2">{feedback}</p>}
    </section>
  );
}
