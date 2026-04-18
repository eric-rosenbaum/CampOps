import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAssetStore, FUEL_LEVEL_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { generateId } from '@/lib/utils';
import { useIssuesStore } from '@/store/issuesStore';
import { useAuth } from '@/lib/auth';
import type { FuelLevel, CheckoutCondition } from '@/lib/types';

const FUEL_LEVELS: FuelLevel[] = ['empty', 'quarter', 'half', 'three_quarter', 'full'];
const FUEL_SHOWS_FOR = new Set(['vehicle', 'golf_cart', 'watercraft']);

const CONDITIONS: { value: CheckoutCondition; label: string; hint: string }[] = [
  { value: 'no_issues', label: 'No issues', hint: 'Returned in the same condition' },
  { value: 'minor_note', label: 'Minor note', hint: 'Small item to be aware of' },
  { value: 'needs_attention', label: 'Needs attention', hint: 'Requires service or repair' },
];

export function ReturnModal() {
  const { assets, checkouts, returnAsset } = useAssetStore();
  const { isReturnModalOpen, returnCheckoutId, returnAssetId, closeAllModals } = useUIStore();
  const { addIssue } = useIssuesStore();
  const { currentUser } = useAuth();

  const checkout = returnCheckoutId ? checkouts.find((c) => c.id === returnCheckoutId) : null;
  const asset = returnAssetId ? assets.find((a) => a.id === returnAssetId) : null;

  const [endOdometer, setEndOdometer] = useState('');
  const [endHours, setEndHours] = useState('');
  const [fuelLevelIn, setFuelLevelIn] = useState<FuelLevel>('full');
  const [condition, setCondition] = useState<CheckoutCondition>('no_issues');
  const [returnNotes, setReturnNotes] = useState('');
  const [createIssue, setCreateIssue] = useState(false);

  useEffect(() => {
    if (asset) {
      setEndOdometer(asset.currentOdometer?.toString() ?? '');
      setEndHours(asset.currentHours?.toString() ?? '');
      setFuelLevelIn(checkout?.fuelLevelOut ?? 'full');
    }
    setCondition('no_issues');
    setReturnNotes('');
    setCreateIssue(false);
  }, [returnCheckoutId]);

  if (!isReturnModalOpen || !checkout || !asset) return null;

  const showFuel = FUEL_SHOWS_FOR.has(asset.category);

  function handleReturn() {
    if (!checkout || !asset) return;
    let issueId: string | null = null;

    if (createIssue && returnNotes.trim()) {
      issueId = generateId();
      addIssue({
        id: issueId,
        title: `${asset.name} — returned with damage/issue noted`,
        description: returnNotes.trim(),
        locations: [],
        priority: 'high',
        status: 'unassigned',
        assigneeId: null,
        reportedById: currentUser.id,
        estimatedCostDisplay: null,
        estimatedCostValue: null,
        actualCost: null,
        photoUrl: null,
        dueDate: null,
        isRecurring: false,
        recurringInterval: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activityLog: [],
      });
    }

    returnAsset(checkout.id, asset.id, {
      returnedAt: new Date().toISOString(),
      endOdometer: asset.tracksOdometer && endOdometer ? parseFloat(endOdometer) : null,
      endHours: asset.tracksHours && endHours ? parseFloat(endHours) : null,
      fuelLevelIn: showFuel ? fuelLevelIn : null,
      returnNotes: returnNotes.trim() || null,
      returnCondition: condition,
      createdIssueId: issueId,
    });
    closeAllModals();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-modal shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-panel-title font-semibold text-forest">Return asset</h2>
            <p className="text-meta text-forest/50 mt-0.5">{asset.name} · checked out by {checkout.checkedOutBy}</p>
          </div>
          <button onClick={closeAllModals} className="text-forest/40 hover:text-forest transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {(asset.tracksOdometer || asset.tracksHours) && (
            <div className="grid grid-cols-2 gap-3">
              {asset.tracksOdometer && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Ending odometer</label>
                  <input type="number" value={endOdometer} onChange={(e) => setEndOdometer(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
              {asset.tracksHours && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Ending hours</label>
                  <input type="number" value={endHours} onChange={(e) => setEndHours(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
            </div>
          )}

          {showFuel && (
            <div>
              <label className="text-body font-medium text-forest mb-2 block">Fuel level at return</label>
              <div className="flex gap-1">
                {FUEL_LEVELS.map((lvl) => (
                  <button key={lvl} onClick={() => setFuelLevelIn(lvl)}
                    className={`flex-1 py-2 text-label font-medium rounded-btn border transition-colors ${fuelLevelIn === lvl ? 'bg-sage border-sage text-white' : 'border-border text-forest/60 hover:border-sage/60'}`}>
                    {FUEL_LEVEL_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-body font-medium text-forest mb-2 block">Condition</label>
            <div className="space-y-2">
              {CONDITIONS.map(({ value, label, hint }) => (
                <label key={value} className={`flex items-start gap-3 p-3 rounded-btn border cursor-pointer transition-colors ${condition === value ? 'border-sage bg-sage/5' : 'border-border hover:border-sage/40'}`}>
                  <input type="radio" name="condition" value={value} checked={condition === value} onChange={() => setCondition(value)} className="mt-0.5" />
                  <div>
                    <p className="text-body font-medium text-forest">{label}</p>
                    <p className="text-meta text-forest/50">{hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {condition !== 'no_issues' && (
            <div>
              <label className="text-body font-medium text-forest mb-1 block">Notes</label>
              <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} placeholder="Describe the issue or note…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage resize-none" />
            </div>
          )}

          {condition === 'needs_attention' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createIssue} onChange={(e) => setCreateIssue(e.target.checked)} className="rounded" />
              <span className="text-body text-forest">Create issue in Issues & Repairs</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={closeAllModals}>Cancel</Button>
          <Button onClick={handleReturn}>Mark returned</Button>
        </div>
      </div>
    </div>
  );
}
