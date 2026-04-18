import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { useAssetStore, FUEL_LEVEL_LABELS } from '@/store/assetStore';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { FuelLevel } from '@/lib/types';

const FUEL_LEVELS: FuelLevel[] = ['empty', 'quarter', 'half', 'three_quarter', 'full'];
const FUEL_SHOWS_FOR = new Set(['vehicle', 'golf_cart', 'watercraft']);

export function CheckoutModal() {
  const { assets, checkouts, checkOutAsset, updateCheckout, currentCheckoutForAsset, recentCheckoutNames } = useAssetStore();
  const { isCheckoutModalOpen, checkoutAssetId, editingCheckoutId, closeAllModals } = useUIStore();
  const { currentUser } = useAuth();

  const asset = checkoutAssetId ? assets.find((a) => a.id === checkoutAssetId) : null;
  const editing = editingCheckoutId ? checkouts.find((c) => c.id === editingCheckoutId) : null;

  const defaultReturn = (() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  const [checkedOutBy, setCheckedOutBy] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedReturn, setExpectedReturn] = useState(defaultReturn);
  const [startOdometer, setStartOdometer] = useState('');
  const [startHours, setStartHours] = useState('');
  const [fuelLevel, setFuelLevel] = useState<FuelLevel>('full');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const recentNames = recentCheckoutNames();

  useEffect(() => {
    if (editing) {
      setCheckedOutBy(editing.checkedOutBy);
      setPurpose(editing.purpose);
      setExpectedReturn(editing.expectedReturnAt.slice(0, 16));
      setStartOdometer(editing.startOdometer?.toString() ?? '');
      setStartHours(editing.startHours?.toString() ?? '');
      setFuelLevel(editing.fuelLevelOut ?? 'full');
      setCheckoutNotes(editing.checkoutNotes ?? '');
    } else if (asset) {
      setCheckedOutBy('');
      setPurpose('');
      setExpectedReturn(defaultReturn);
      setStartOdometer(asset.currentOdometer?.toString() ?? '');
      setStartHours(asset.currentHours?.toString() ?? '');
      setFuelLevel('full');
      setCheckoutNotes('');
    }
  }, [checkoutAssetId, editingCheckoutId]);

  if (!isCheckoutModalOpen || !asset) return null;
  if (!editing) {
    const alreadyOut = currentCheckoutForAsset(asset.id);
    if (alreadyOut) return null;
  }

  const showFuel = FUEL_SHOWS_FOR.has(asset.category);
  const filteredSuggestions = checkedOutBy.trim()
    ? recentNames.filter((n) => n.toLowerCase().includes(checkedOutBy.toLowerCase()) && n !== checkedOutBy)
    : [];

  function handleSave() {
    if (!asset || !checkedOutBy.trim() || !purpose.trim()) return;
    if (editing) {
      updateCheckout({
        ...editing,
        checkedOutBy: checkedOutBy.trim(),
        purpose: purpose.trim(),
        expectedReturnAt: new Date(expectedReturn).toISOString(),
        startOdometer: asset.tracksOdometer && startOdometer ? parseFloat(startOdometer) : editing.startOdometer,
        startHours: asset.tracksHours && startHours ? parseFloat(startHours) : editing.startHours,
        fuelLevelOut: showFuel ? fuelLevel : editing.fuelLevelOut,
        checkoutNotes: checkoutNotes.trim() || null,
      });
    } else {
      checkOutAsset({
        id: generateId(),
        assetId: asset.id,
        checkedOutBy: checkedOutBy.trim(),
        purpose: purpose.trim(),
        checkedOutAt: new Date().toISOString(),
        expectedReturnAt: new Date(expectedReturn).toISOString(),
        returnedAt: null,
        startOdometer: asset.tracksOdometer && startOdometer ? parseFloat(startOdometer) : null,
        endOdometer: null,
        startHours: asset.tracksHours && startHours ? parseFloat(startHours) : null,
        endHours: null,
        fuelLevelOut: showFuel ? fuelLevel : null,
        fuelLevelIn: null,
        checkoutNotes: checkoutNotes.trim() || null,
        returnNotes: null,
        returnCondition: null,
        createdIssueId: null,
        loggedBy: currentUser.name,
        createdAt: new Date().toISOString(),
      });
    }
    closeAllModals();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-modal shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-panel-title font-semibold text-forest">{editing ? 'Edit checkout' : 'Check out'}</h2>
            <p className="text-meta text-forest/50 mt-0.5">{asset.name}</p>
          </div>
          <button onClick={closeAllModals} className="text-forest/40 hover:text-forest transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="relative">
            <label className="text-body font-medium text-forest mb-1 block">Checked out by <span className="text-red">*</span></label>
            <input
              value={checkedOutBy}
              onChange={(e) => { setCheckedOutBy(e.target.value); setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Staff member name…"
              className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-btn shadow-md z-10">
                {filteredSuggestions.slice(0, 5).map((name) => (
                  <button key={name} onMouseDown={() => { setCheckedOutBy(name); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2 text-body text-forest hover:bg-cream-dark transition-colors">
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-body font-medium text-forest mb-1 block">Purpose / destination <span className="text-red">*</span></label>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Supply run, grounds maintenance…" className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
          </div>

          <div>
            <label className="text-body font-medium text-forest mb-1 block">Expected return</label>
            <input type="datetime-local" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
          </div>

          {(asset.tracksOdometer || asset.tracksHours) && (
            <div className="grid grid-cols-2 gap-3">
              {asset.tracksOdometer && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Starting odometer</label>
                  <input type="number" value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
              {asset.tracksHours && (
                <div>
                  <label className="text-body font-medium text-forest mb-1 block">Starting hours</label>
                  <input type="number" value={startHours} onChange={(e) => setStartHours(e.target.value)} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage" />
                </div>
              )}
            </div>
          )}

          {showFuel && (
            <div>
              <label className="text-body font-medium text-forest mb-2 block">Fuel level</label>
              <div className="flex gap-1">
                {FUEL_LEVELS.map((lvl) => (
                  <button key={lvl} onClick={() => setFuelLevel(lvl)}
                    className={`flex-1 py-2 text-label font-medium rounded-btn border transition-colors ${fuelLevel === lvl ? 'bg-sage border-sage text-white' : 'border-border text-forest/60 hover:border-sage/60'}`}>
                    {FUEL_LEVEL_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-body font-medium text-forest mb-1 block">Notes (optional)</label>
            <textarea value={checkoutNotes} onChange={(e) => setCheckoutNotes(e.target.value)} rows={2} className="w-full border border-border rounded-btn px-3 py-2 text-body text-forest focus:outline-none focus:ring-1 focus:ring-sage resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={closeAllModals}>Cancel</Button>
          <Button onClick={handleSave} disabled={!checkedOutBy.trim() || !purpose.trim()}>{editing ? 'Save changes' : 'Check out'}</Button>
        </div>
      </div>
    </div>
  );
}
