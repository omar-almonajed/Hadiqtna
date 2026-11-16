import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Plus, Search, X } from 'lucide-react';
import { EmptyState } from '../components/common/StateViews';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { apiRequest } from '../services/apiClient';
import { formatDateTime, PARK_STATUS_LABELS } from '../utils/i18n';

export function ParksPage() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const { parks, bins, reports, tasks, refreshAll } = useRealtime();

  const isAdmin = profile?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredParks = parks.filter((park) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      park.name.toLowerCase().includes(q) ||
      park.location.toLowerCase().includes(q) ||
      (park.description || '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/parks', {
        method: 'POST',
        body: { name, location, description, status: 'ACTIVE' },
      });
      setName('');
      setLocation('');
      setDescription('');
      setShowCreate(false);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title={t('إدارة حدائق دمشق العامة', 'Damascus Public Parks Management')}
      subtitle={t('بيانات حدائق دمشق والحاويات المرتبطة ونشاط البلاغات والصيانة', 'Damascus park directory, connected smart bins, reports, and maintenance activity')}
      actions={
        isAdmin ? (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg hover:bg-[#0F3F22]"
          >
            <Plus className="w-4 h-4" />
            <span>{t('إضافة حديقة', 'Add Park')}</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {showCreate && isAdmin && (
          <form onSubmit={handleCreate} className="bg-white border border-[#E2E6E1] rounded-lg p-5 space-y-4">
            <h2 className="font-display font-bold text-sm">{t('إضافة حديقة عامة جديدة في دمشق', 'Add New Damascus Park')}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('اسم الحديقة', 'Park Name')}</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الموقع / الحي', 'Location')}</label>
                <input required value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-stone-600 mb-1">{t('الوصف', 'Description')}</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#D4DAD3] rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs border border-[#E2E6E1] rounded-lg">
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold bg-[#14532D] text-white rounded-lg">
                {t('حفظ الحديقة', 'Save Park')}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white border border-[#E2E6E1] rounded-lg p-3.5 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('ابحث عن الحديقة بالاسم أو الحي في دمشق...', 'Search Damascus park by name or neighborhood...')}
              className="w-full ps-9 pe-8 py-2 text-sm border border-[#D4DAD3] rounded-lg focus:outline-none focus:border-[#14532D]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-stone-400 hover:text-stone-700"
                aria-label={t('مسح البحث', 'Clear search')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-stone-500 whitespace-nowrap tabular-nums">
            {filteredParks.length} / {parks.length}
          </span>
        </div>

        {filteredParks.length === 0 ? (
          <EmptyState
            title={search ? t('لا توجد حديقة مطابقة للبحث', 'No Matching Parks') : t('لا توجد حدائق مسجلة', 'No Parks')}
            description={search ? t('جرّب اسم حي آخر أو امسح مربع البحث لعرض جميع حدائق دمشق.', 'Try another search query or clear the filter.') : t('أضف أول حديقة عامة لبدء المراقبة.', 'Add a park to begin.')}
          />
        ) : (
          <div className="space-y-4">
            {filteredParks.map((park) => {
              const parkBins = bins.filter((b) => b.parkId === park.id);
              const parkReports = reports.filter((r) => r.parkId === park.id);
              const parkTasks = tasks.filter((tk) => tk.parkId === park.id);
              return (
                <div key={park.id} className="bg-white border border-[#E2E6E1] rounded-lg p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-[#17211C]">{park.name}</h2>
                        <span className="text-xs font-medium text-emerald-800">
                          {PARK_STATUS_LABELS[park.status][lang]}
                        </span>
                      </div>
                      <p className="inline-flex items-center gap-1.5 text-xs text-stone-500">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{park.location}</span>
                        <span>·</span>
                        <span className="font-mono">{park.id}</span>
                      </p>
                    </div>
                    <span className="font-mono text-xs text-stone-400 tabular-nums">
                      {formatDateTime(park.createdAt, lang)}
                    </span>
                  </div>

                  {park.description && <p className="text-sm text-stone-600">{park.description}</p>}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E2E6E1] text-center sm:text-start">
                    <div>
                      <span className="text-xs text-stone-500 block">{t('الحاويات الذكية', 'Smart Bins')}</span>
                      <Link to="/bins" className="font-mono text-xl font-bold text-[#14532D] hover:underline tabular-nums">
                        {parkBins.length}
                      </Link>
                    </div>
                    <div>
                      <span className="text-xs text-stone-500 block">{t('بلاغات المواطنين', 'Citizen Reports')}</span>
                      <span className="font-mono text-xl font-bold text-[#17211C] tabular-nums">
                        {parkReports.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-stone-500 block">{t('مهام الصيانة', 'Maintenance Tasks')}</span>
                      <Link to="/maintenance" className="font-mono text-xl font-bold text-[#17211C] hover:underline tabular-nums">
                        {parkTasks.length}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
