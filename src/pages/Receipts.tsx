import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Loader2, Upload, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/shared/Button';
import { useReceiptsStore } from '@/store/receiptsStore';
import { ReceiptsList } from '@/components/receipts/ReceiptsList';
import { ReceiptReview } from '@/components/receipts/ReceiptReview';
import { DuplicateCompare } from '@/components/receipts/DuplicateCompare';
import { ReconcileView } from '@/components/receipts/ReconcileView';
import { SummaryView } from '@/components/receipts/SummaryView';
import { ExportView } from '@/components/receipts/ExportView';
import { SettingsView } from '@/components/receipts/SettingsView';
import { useReceiptCapture } from '@/components/receipts/useReceiptCapture';
import { ReceiptsToastHost, useReceiptsRole } from '@/components/receipts/receiptsUi';

type Tab = 'receipts' | 'reconcile' | 'summary' | 'export' | 'settings';

const FINANCE_TABS: { id: Tab; label: string }[] = [
  { id: 'receipts', label: 'Receipts' },
  { id: 'reconcile', label: 'Reconcile' },
  { id: 'summary', label: 'Summary' },
  { id: 'export', label: 'Export' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Receipts: snap → check → code → match to the statement → summarise → export.
 *
 * Two audiences on one route. A card holder gets a list of their own receipts and a big Snap
 * button, because on a phone at a till that is the whole job. Finance gets the tabs.
 *
 * Deep links a guide or an email can point at:
 *   /receipts?tab=summary|settings
 *   /receipts?tab=export&card=<id>&month=YYYY-MM  the export for one card-month
 *   /receipts?receipt=<id>                        opens one receipt
 *   /receipts/reconcile?card=<id>&month=YYYY-MM   one card-month
 */
export function Receipts() {
  const { isFinance, myCards } = useReceiptsRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const onReconcilePath = location.pathname.startsWith('/receipts/reconcile');
  const rawTab = params.get('tab');
  const tab: Tab = !isFinance ? 'receipts'
    : onReconcilePath ? 'reconcile'
      : FINANCE_TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : 'receipts';

  const setTab = (next: Tab) => {
    if (next === 'reconcile') { navigate('/receipts/reconcile', { replace: true }); return; }
    navigate(next === 'receipts' ? '/receipts' : `/receipts?tab=${next}`, { replace: true });
  };

  const receipts = useReceiptsStore((s) => s.receipts);
  const { items, addFiles, dismiss } = useReceiptCapture();
  const fileRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);

  // What is open: a capture in flight (by key) or a stored receipt (by id, in the URL).
  const [openCapture, setOpenCapture] = useState<string | null>(null);
  const openReceiptId = params.get('receipt');
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null);

  const openReceipt = useCallback((id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('receipt', id); else p.delete('receipt');
    setParams(p, { replace: false });
  }, [params, setParams]);

  const capture = items.find((i) => i.key === openCapture) ?? null;

  function onFiles(list: FileList | null, single: boolean) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const keys = addFiles(files);
    // One photo goes straight to its review. A batch goes to the queue and is reviewed from the list.
    if (single || files.length === 1) setOpenCapture(keys[0]);
  }

  const inFlight = items.filter((i) => i.stage !== 'done' && i.stage !== 'failed');
  const failed = items.filter((i) => i.stage === 'failed');
  const doneBatch = items.filter((i) => i.stage === 'done' && i.key !== openCapture);

  const subtitle = isFinance
    ? 'Company cards, matched to the statement'
    : myCards.length ? `Snap receipts for ${myCards.map((c) => c.label).join(', ')}` : 'Snap a receipt right after you pay';

  const snapButton = (
    <Button onClick={() => fileRef.current?.click()} className="px-3 sm:px-4" data-testid="snap-button">
      <Camera className="h-4 w-4" /> <span className="hidden min-[380px]:inline">Snap receipt</span><span className="min-[380px]:hidden">Snap</span>
    </Button>
  );
  // The receipt inputs sit at the END of the page, labelled. They were inside the top bar, so they
  // were the first file inputs in the document, and a CSV meant for the statement import on
  // Reconcile went to the receipt reader instead ("That file is not a photo or a PDF").
  const receiptInputs = (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" data-testid="snap-input"
             aria-label="Receipt photo or PDF" name="receipt-photo"
             onChange={(e) => { onFiles(e.target.files, true); e.target.value = ''; }} />
      <input ref={batchRef} type="file" accept="image/*,application/pdf" multiple className="hidden" data-testid="batch-input"
             aria-label="Several receipt photos or PDFs" name="receipt-photos"
             onChange={(e) => { onFiles(e.target.files, false); e.target.value = ''; }} />
    </>
  );

  const visibleTabs = useMemo(() => (isFinance ? FINANCE_TABS : []), [isFinance]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Receipts" subtitle={subtitle} actions={snapButton} />

      {visibleTabs.length > 0 && (
        <div className="no-scrollbar flex flex-shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-paper-raised px-4 sm:px-7">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} data-tab={t.id}
                    className={`-mb-px whitespace-nowrap border-b-[3px] px-3 pb-2.5 pt-3 text-[13px] font-semibold transition-colors sm:px-4 ${
                      tab === t.id ? 'border-red text-forest' : 'border-transparent text-ink-soft hover:text-forest'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-7 sm:pb-10"
        onDragOver={(e) => { if (tab === 'receipts' && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { if (tab !== 'receipts') return; e.preventDefault(); onFiles(e.dataTransfer.files, false); }}
      >
        {/* The queue: batch uploads, and anything that failed. */}
        {(inFlight.length > 0 || failed.length > 0 || doneBatch.length > 0) && (
          <div className="mb-4 rounded-card border border-border bg-white p-3" data-testid="capture-queue">
            <div className="flex items-center gap-2">
              {inFlight.length > 0 && <Loader2 className="h-4 w-4 animate-spin text-sage" />}
              <p className="flex-1 text-[13px] font-semibold text-forest">
                {inFlight.length > 0 ? `Reading ${items.length - inFlight.length + 1} of ${items.length}…` : `${doneBatch.length} read — check them below`}
              </p>
              {inFlight.length === 0 && <button className="text-[12.5px] underline text-ink-soft" onClick={() => items.forEach((i) => dismiss(i.key))}>Done</button>}
            </div>
            {failed.map((f) => (
              <div key={f.key} className="mt-2 flex items-start gap-2 rounded-btn bg-red-bg px-2.5 py-2 text-[12.5px] text-red-text">
                <span className="min-w-0 flex-1"><b>{f.fileName}</b>: {f.error}</span>
                <button onClick={() => dismiss(f.key)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}

        {tab === 'receipts' && (
          <>
            <ReceiptsList onOpen={(id) => openReceipt(id)} onCompare={(a, b) => setCompare({ a, b })} />
            <div className="mt-4 hidden items-center justify-center gap-2 rounded-card border border-dashed border-border py-4 text-[13px] text-ink-soft sm:flex">
              <Upload className="h-4 w-4" /> Drop receipt photos or PDFs anywhere here, or
              <button className="font-semibold text-forest underline" onClick={() => batchRef.current?.click()}>upload several</button>
            </div>
          </>
        )}
        {tab === 'reconcile' && (
          <ReconcileView onOpen={(id) => openReceipt(id)} onCompare={(a, b) => setCompare({ a, b })}
                         onUploadForLine={(line, card, file) => { const [key] = addFiles([file], { cardId: card.id, lineId: line.id }); setOpenCapture(key); }} />
        )}
        {tab === 'summary' && <SummaryView />}
        {tab === 'export' && <ExportView />}
        {tab === 'settings' && <SettingsView />}
      </div>

      {/* On a phone the thumb reaches the bottom of the screen, not the top bar. */}
      {tab === 'receipts' && !capture && !openReceiptId && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-paper-raised/95 px-4 pt-2 backdrop-blur sm:hidden"
             style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <Button onClick={() => fileRef.current?.click()} className="w-full justify-center py-3 text-[15px]" data-testid="snap-button-bottom">
            <Camera className="h-5 w-5" /> Snap a receipt
          </Button>
        </div>
      )}

      {capture && (
        <ReceiptReview
          key={capture.key}
          receiptId={capture.receiptId}
          capture={capture}
          onClose={() => { if (capture.stage === 'done' || capture.stage === 'failed') dismiss(capture.key); setOpenCapture(null); }}
          onCompare={(a, b) => setCompare({ a, b })}
        />
      )}
      {!capture && openReceiptId && receipts.some((r) => r.id === openReceiptId) && (
        <ReceiptReview key={openReceiptId} receiptId={openReceiptId} onClose={() => openReceipt(null)} onCompare={(a, b) => { openReceipt(null); setCompare({ a, b }); }} />
      )}
      {compare && <DuplicateCompare originalId={compare.a} duplicateId={compare.b} onClose={() => setCompare(null)} />}
      <ReceiptsToastHost />
      {receiptInputs}
    </div>
  );
}
