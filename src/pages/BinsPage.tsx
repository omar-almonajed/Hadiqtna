import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { EmptyState, FillProgressBar } from '../components/common/StateViews';
import {
  DeviceStatusLabel,
  OperationalBinLabel,
  SourceTag,
} from '../components/common/StatusText';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import type { BinType } from '../types/domain';
import {
  BIN_TYPE_LABELS,
  formatDateTime,
  getOperationalBinCategory,
  OPERATIONAL_BIN_CATEGORY_LABELS,
  type OperationalBinCategory,
} from '../utils/i18n';

export function BinsPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { bins, parks, devices, alerts, config, refreshAll } = useRealtime();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | OperationalBinCategory>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [parkId, setParkId] = useState(parks[0]?.id || 'park-alnakheel');
  const [binType, setBinType] = useState<BinType>('GENERAL');
  const [capacityLiters, setCapacityLiters] = useState(120);
  const [emptyDistanceCm, setEmptyDistanceCm] = useState(90);
  const [fullDistanceCm, setFullDistanceCm] = useState(15);
  const [locationDescription, setLocationDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isAdmin = profile?.role === 'ADMIN';
  const warningThreshold = config?.warningThresholdPercent ?? 80;

  const filtered = bins.filter((bin) => {
    const dev = devices.find((d) => d.id === bin.deviceId);
    const opCategory = getOperationalBinCategory(bin, dev?.connectionStatus, warningThreshold);
    const matchesCategory = categoryFilter === 'ALL' || opCategory === categoryFilter;
    const park = parks.find((p) => p.id === bin.parkId);
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      bin.name.toLowerCase().includes(q) ||
      bin.id.toLowerCase().includes(q) ||
      bin.locationDescription.toLowerCase().includes(q) ||
      (park?.name.toLowerCase().includes(q) ?? false);
    return matchesCategory && matchesQuery;
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest('/api/iot/bins', {
        method: 'POST',
        body: {
          parkId: parkId || parks[0]?.id || 'park-alnakheel',
          name,
          binType,
          capacityLiters: Number(capacityLiters),
          emptyDistanceCm: Number(emptyDistanceCm),
          fullDistanceCm: Number(fullDistanceCm),
          locationDescription,
        },
      });
      setName('');
      setLocationDescription('');
      setShowCreate(false);
      setMsg(t('تمت إضافة الحاوية الذكية بنجاح.', 'Smart bin created successfully.'));
      await refreshAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('تعذر إنشاء الحاوية.', 'Failed to create bin.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEmptyBin = async (binId: string) => {
    setMsg(null);
    try {
      await apiRequest(`/api/iot/bins/${binId}/empty`, { method: 'POST' });
      setMsg(t('تم تسجيل تفريغ الحاوية وإعادة ضبط مستوى الامتلاء إلى 0%.', 'Bin emptying recorded.'));
      await refreshAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('فشل تسجيل التفريغ.', 'Failed to empty bin.'));
    }
  };

  const filterKeys: Array<'ALL' | OperationalBinCategory> = [
    'ALL',
    'EMPTY',
    'PARTIAL',
    'NEEDS_EMPTYING',
    'FULL',
    'OFFLINE',
    'NO_DATA',
  ];

  const countByCat = (cat: OperationalBinCategory) =>
    bins.filter((b) => {
      const dev = devices.find((d) => d.id === b.deviceId);
      return getOperationalBinCategory(b, dev?.connectionStatus, warningThreshold) === cat;
    }).length;

  return (
    <DashboardLayout
      title={t('إدارة الحاويات الذكية', 'Smart Bin Fleet Management')}
      subtitle={t(
        'مراقبة مستويات الامتلاء، قراءات الحساسات، حالة الاتصال، وتسجيل التفريغ',
        'Sensoneo-grade fleet view of fill levels, ultrasonic telemetry, connectivity, and emptying'
      )}
      actions={
        isAdmin ? (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('إضافة حاوية', 'Add Bin')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {msg && (
          <div className="bg-white border border-[#E2E6E1] rounded-xl px-4 py-3 text-sm text-[#141E18]">
            {msg}
          </div>
        )}

        {/* Fleet Summary Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('إجمالي الحاويات', 'Total Bins')}</span>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#141E18]">{bins.length}</p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('ممتلئة بالكامل', 'Full (100%)')}</span>
            <p className={`font-mono text-2xl font-bold tabular-nums ${countByCat('FULL') > 0 ? 'text-red-700' : 'text-[#141E18]'}`}>
              {countByCat('FULL')}
            </p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t(`تحتاج تفريغ (≥ ${warningThreshold}%)`, `Needs Empty (≥ ${warningThreshold}%)`)}</span>
            <p className={`font-mono text-2xl font-bold tabular-nums ${countByCat('NEEDS_EMPTYING') > 0 ? 'text-amber-700' : 'text-[#141E18]'}`}>
              {countByCat('NEEDS_EMPTYING')}
            </p>
          </div>
          <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 space-y-1">
            <span className="text-xs text-stone-500">{t('بانتظار أول قراءة', 'No Data Yet')}</span>
            <p className="font-mono text-2xl font-bold tabular-nums text-stone-600">{countByCat('NO_DATA')}</p>
          </div>
        </section>

        {showCreate && isAdmin && (
          <form
            onSubmit={handleCreate}
            className="bg-white border border-[#E2E6E1] rounded-xl p-5 space-y-4"
          >
            <h2 className="font-display font-bold text-sm text-[#141E18]">
              {t('تسجيل حاوية ذكية جديدة', 'Register New Smart Bin')}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('اسم الحاوية', 'Bin Name')}</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الحديقة', 'Park')}</label>
                <select
                  value={parkId}
                  onChange={(e) => setParkId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  {parks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('النوع', 'Bin Type')}</label>
                <select
                  value={binType}
                  onChange={(e) => setBinType(e.target.value as BinType)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg bg-white"
                >
                  {(Object.keys(BIN_TYPE_LABELS) as BinType[]).map((bt) => (
                    <option key={bt} value={bt}>
                      {BIN_TYPE_LABELS[bt][lang]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('السعة (لتر)', 'Capacity (L)')}</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={capacityLiters}
                  onChange={(e) => setCapacityLiters(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('مسافة الفراغ (سم)', 'Empty Distance (cm)')}</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={emptyDistanceCm}
                  onChange={(e) => setEmptyDistanceCm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('مسافة الامتلاء (سم)', 'Full Distance (cm)')}</label>
                <input
                  type="number"
                  min={0}
                  max={400}
                  value={fullDistanceCm}
                  onChange={(e) => setFullDistanceCm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('وصف الموقع داخل الحديقة', 'Location Description')}</label>
                <input
                  required
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-medium border border-[#E2E6E1] rounded-lg"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg"
              >
                {saving ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ الحاوية', 'Save Bin')}
              </button>
            </div>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div className="bg-white border border-[#E2E6E1] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('ابحث برقم الحاوية أو الاسم أو الحديقة...', 'Search bins by ID, name, or park...')}
              className="w-full ps-9 pe-3 py-2 text-sm border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F7F8F6] rounded-lg border border-[#E2E6E1]">
            {filterKeys.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-[#14532D] text-white'
                    : 'text-stone-600 hover:text-[#141E18]'
                }`}
              >
                {cat === 'ALL' ? t('الكل', 'All') : OPERATIONAL_BIN_CATEGORY_LABELS[cat][lang]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('لا توجد نتائج مطابقة', 'No Matching Bins')}
            description={t('لم يتم العثور على حاويات تطابق معايير البحث أو الفلترة.', 'Try clearing search or filter criteria.')}
          />
        ) : (
          <div className="bg-white border border-[#E2E6E1] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F8F6] border-b border-[#E2E6E1] text-stone-600">
                  <tr>
                    <th className="py-3 px-4 text-start font-semibold">{t('رقم الحاوية', 'Bin ID')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('الحاوية والموقع', 'Bin & Location')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('نسبة الامتلاء', 'Fill Level')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('قراءة الحساس', 'Sensor Reading')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('آخر اتصال', 'Last Contact')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('الاتصال', 'Connection')}</th>
                    <th className="py-3 px-4 text-start font-semibold">{t('الحالة', 'Status')}</th>
                    <th className="py-3 px-4 text-end font-semibold">{t('إجراء', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E6E1]">
                  {filtered.map((bin) => {
                    const dev = devices.find((d) => d.id === bin.deviceId);
                    const park = parks.find((p) => p.id === bin.parkId);
                    const binAlerts = alerts.filter((a) => a.binId === bin.id && a.status !== 'RESOLVED');
                    const hasData = Boolean(bin.lastReadingAt);
                    return (
                      <tr key={bin.id} className="hover:bg-stone-50/70 align-middle">
                        <td className="py-3.5 px-4 font-mono text-stone-700 whitespace-nowrap">
                          <Link to={`/bins/${bin.id}`} className="hover:text-[#14532D] hover:underline font-semibold">
                            {bin.id}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 min-w-[200px]">
                          <Link
                            to={`/bins/${bin.id}`}
                            className="font-semibold text-[#141E18] hover:text-[#14532D] hover:underline block"
                          >
                            {bin.name}
                          </Link>
                          <span className="text-stone-500 block">
                            {park?.name ? `${park.name} · ` : ''}
                            {bin.locationDescription}
                          </span>
                          {binAlerts.length > 0 && (
                            <span className="text-[11px] font-semibold text-red-700">
                              {t(`${binAlerts.length} تنبيه نشط`, `${binAlerts.length} active alert(s)`)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 min-w-[140px]">
                          {hasData ? (
                            <div className="space-y-1">
                              <span className="font-mono font-bold tabular-nums text-[#141E18]">
                                {bin.currentFillPercentage}%
                              </span>
                              <FillProgressBar
                                percentage={bin.currentFillPercentage}
                                warningThreshold={warningThreshold}
                                criticalThreshold={config?.criticalThresholdPercent}
                              />
                            </div>
                          ) : (
                            <span className="text-stone-400">{t('لا توجد بيانات حالية', 'No current data')}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {hasData && bin.lastDistanceCm !== undefined ? (
                            <div className="space-y-1">
                              <span className="font-mono tabular-nums font-semibold text-[#141E18] block">
                                {bin.lastDistanceCm} cm
                              </span>
                              <SourceTag source={bin.lastReadingSource} />
                            </div>
                          ) : (
                            <span className="text-stone-400">{t('لا توجد بيانات حالية', 'No current data')}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-stone-600 whitespace-nowrap">
                          {hasData ? formatDateTime(bin.lastReadingAt, lang) : t('لا توجد بيانات حالية', 'No current data')}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {dev ? (
                            <DeviceStatusLabel status={dev.connectionStatus} />
                          ) : (
                            <span className="text-stone-400">{t('غير مرتبط', 'Unassigned')}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <OperationalBinLabel bin={bin} />
                        </td>
                        <td className="py-3.5 px-4 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              to={`/bins/${bin.id}`}
                              className="px-2.5 py-1.5 border border-[#E2E6E1] rounded-lg font-medium text-[#14532D] hover:bg-emerald-50"
                            >
                              {t('التفاصيل', 'Details')}
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleEmptyBin(bin.id)}
                              className="px-2.5 py-1.5 border border-[#D4DAD3] rounded-lg font-medium hover:bg-stone-50"
                            >
                              {t('تفريغ', 'Empty')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
