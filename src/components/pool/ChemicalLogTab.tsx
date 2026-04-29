import { usePoolStore, getChemicalStatus, CHEMICAL_RANGES, type ChemicalField } from '@/store/poolStore';
import { useUIStore } from '@/store/uiStore';
import { AlertBanner } from '@/components/shared/AlertBanner';
import { format } from 'date-fns';
import type { ChemicalReading } from '@/lib/types';

// ─── Status color helpers ─────────────────────────────────────────────────────

function statusColor(status: 'ok' | 'warn' | 'alert') {
  if (status === 'alert') return 'text-red';
  if (status === 'warn') return 'text-amber';
  return 'text-green-muted-text';
}

function statusHintColor(status: 'ok' | 'warn' | 'alert') {
  if (status === 'alert') return 'text-red/70';
  if (status === 'warn') return 'text-amber-text';
  return 'text-forest/40';
}

function statusCardBorder(status: 'ok' | 'warn' | 'alert') {
  if (status === 'alert') return 'border-red/30';
  if (status === 'warn') return 'border-amber/30';
  return 'border-border';
}

// ─── Reading row helpers ──────────────────────────────────────────────────────

function ValCell({ field, value }: { field: ChemicalField; value: number }) {
  const status = getChemicalStatus(field, value);
  const range = CHEMICAL_RANGES[field];
  const isOutOfRange = value < range.min || value > range.max;
  const label = value < range.min ? 'Low' : 'High';

  return (
    <div className={`font-mono text-body font-medium ${statusColor(status)}`}>
      {field === 'waterTemp' ? `${Math.round(value)}°` : field === 'freeChlorine' || field === 'ph' ? value.toFixed(1) : Math.round(value)}
      {isOutOfRange && (
        <span
          className={`ml-1.5 text-label font-semibold px-1.5 py-0.5 rounded-tag uppercase tracking-wide ${
            status === 'alert'
              ? 'bg-red-bg text-red'
              : 'bg-amber-bg text-amber-text'
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function formatReadingDate(row: ChemicalReading) {
  const d = new Date(row.readingTime);
  return `${format(d, 'MMM d')} · ${format(d, 'h:mm a')}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChemicalLogTab() {
  const { activeReadings, outOfRangeAlerts, latestReading, deleteChemicalReading } = usePoolStore();
  const { openLogReadingModal } = useUIStore();

  const latest = latestReading();
  const alerts = outOfRangeAlerts();
  const readings = activeReadings();

  const sorted = [...readings].sort(
    (a, b) => new Date(b.readingTime).getTime() - new Date(a.readingTime).getTime()
  );

  // Status card for each key reading from the latest entry
  const statusCards: { field: ChemicalField; displayVal: string; hint: string }[] = latest
    ? [
        {
          field: 'freeChlorine',
          displayVal: `${latest.freeChlorine.toFixed(1)} ppm`,
          hint: getChemicalStatus('freeChlorine', latest.freeChlorine) === 'alert'
            ? 'Below range — action needed'
            : getChemicalStatus('freeChlorine', latest.freeChlorine) === 'warn'
            ? 'Near limit — monitor'
            : 'Within range',
        },
        {
          field: 'ph',
          displayVal: `${latest.ph}`,
          hint: getChemicalStatus('ph', latest.ph) === 'ok' ? 'Within range' : 'Out of range — adjust',
        },
        {
          field: 'alkalinity',
          displayVal: `${latest.alkalinity} ppm`,
          hint: getChemicalStatus('alkalinity', latest.alkalinity) === 'warn'
            ? 'Slightly low — monitor'
            : getChemicalStatus('alkalinity', latest.alkalinity) === 'alert'
            ? 'Out of range — adjust'
            : 'Within range',
        },
        {
          field: 'waterTemp',
          displayVal: `${latest.waterTemp}°F`,
          hint: getChemicalStatus('waterTemp', latest.waterTemp) === 'ok' ? 'Normal range' : 'Outside range',
        },
      ]
    : [];

  function handleDelete(id: string) {
    if (window.confirm('Delete this reading? This cannot be undone.')) {
      deleteChemicalReading(id);
    }
  }

  const colStyle = { gridTemplateColumns: '110px 1fr 1fr 1fr 1fr 1fr 100px 80px' };

  return (
    <div>
      {/* Status cards */}
      {latest && (
        <div className="grid grid-cols-4 gap-3.5 mb-6">
          {statusCards.map(({ field, displayVal, hint }) => {
            const fieldMap: Record<ChemicalField, number> = {
              freeChlorine: latest.freeChlorine,
              ph: latest.ph,
              alkalinity: latest.alkalinity,
              cyanuricAcid: latest.cyanuricAcid,
              waterTemp: latest.waterTemp,
            };
            const status = getChemicalStatus(field, fieldMap[field]);
            return (
              <div
                key={field}
                className={`bg-white border rounded-card px-4 py-4 ${statusCardBorder(status)}`}
              >
                <p className="text-meta font-semibold uppercase tracking-wide text-forest/40">
                  {CHEMICAL_RANGES[field].label}
                </p>
                <p className={`font-mono text-[26px] font-semibold mt-1 ${statusColor(status)}`}>
                  {displayVal}
                </p>
                <p className={`text-meta mt-0.5 ${statusHintColor(status)}`}>{hint}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert banners */}
      {alerts.map((msg, i) => (
        <AlertBanner
          key={i}
          variant="alert"
          message={msg}
          action={{ label: 'Log corrective action', onClick: openLogReadingModal }}
        />
      ))}

      {/* Low alkalinity warn */}
      {latest && getChemicalStatus('alkalinity', latest.alkalinity) === 'warn' && (
        <AlertBanner
          variant="warn"
          message={`Total alkalinity at ${latest.alkalinity} ppm is slightly below the ideal range of 90–110 ppm. Monitor and consider adding alkalinity increaser.`}
        />
      )}

      {/* Range reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-card px-4 py-3.5 mb-6">
        <p className="text-meta font-semibold uppercase tracking-wide text-blue-700 mb-2.5">
          Acceptable ranges — health dept. & ACA standards
        </p>
        <div className="grid grid-cols-5 gap-4">
          {(Object.keys(CHEMICAL_RANGES) as ChemicalField[]).map((field) => (
            <div key={field}>
              <p className="text-meta text-blue-600 font-medium mb-0.5">
                {CHEMICAL_RANGES[field].label}
              </p>
              <p className="text-secondary font-mono font-semibold text-blue-700">
                {field === 'freeChlorine' && '1.0 – 3.0 ppm'}
                {field === 'ph' && '7.2 – 7.8'}
                {field === 'alkalinity' && '80 – 120 ppm'}
                {field === 'cyanuricAcid' && '30 – 50 ppm'}
                {field === 'waterTemp' && '68°F – 82°F'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Readings table */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-card-title font-semibold text-forest">Chemical readings — last 7 days</h3>
      </div>

      <div className="bg-white border border-border rounded-card overflow-hidden">
        {/* Header */}
        <div
          className="grid px-4 py-2.5 bg-cream-dark border-b border-border"
          style={colStyle}
        >
          {['Date / time', 'Free Cl (ppm)', 'pH', 'Alkalinity', 'Cyanuric', 'Temp (°F)', 'Logged by', ''].map((h) => (
            <span key={h} className="text-meta font-semibold uppercase tracking-wide text-forest/40">
              {h}
            </span>
          ))}
        </div>

        {sorted.length === 0 ? (
          <p className="text-body text-forest/40 text-center py-10">No readings logged yet.</p>
        ) : (
          sorted.map((row, idx) => (
            <div
              key={row.id}
              className={`grid px-4 py-3 items-center ${
                idx < sorted.length - 1 ? 'border-b border-cream-dark' : ''
              }`}
              style={colStyle}
            >
              <span className="font-mono text-secondary text-forest/50">
                {formatReadingDate(row)}
              </span>
              <ValCell field="freeChlorine" value={row.freeChlorine} />
              <ValCell field="ph" value={row.ph} />
              <ValCell field="alkalinity" value={row.alkalinity} />
              <ValCell field="cyanuricAcid" value={row.cyanuricAcid} />
              <ValCell field="waterTemp" value={row.waterTemp} />
              <span className="text-secondary text-forest/50">{row.loggedByName}</span>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => openLogReadingModal(row.id)}
                  className="text-meta text-sage hover:text-forest transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  className="text-meta text-red/60 hover:text-red transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
