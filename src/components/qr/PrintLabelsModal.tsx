/**
 * Print the stickers.
 *
 * This is the step that turns the software into property. A camp that puts a code on forty doors
 * has installed the product on its land, and every one of those doors is a place where somebody
 * who would never open an app can hand the maintenance director a work order with the right
 * location already on it.
 *
 * Which is why the whole flow is: pick, look at one, print. No wizard, no export, no file to
 * find in Downloads.
 */
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronRight, Printer, RefreshCw, Search, X, AlertTriangle, Check,
} from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore, ASSET_CATEGORY_LABELS } from '@/store/assetStore';
import { useCampStore } from '@/store/campStore';
import { useAuth } from '@/lib/auth';
import { dbRotateQrToken } from '@/lib/campgroundDb';
import type { CampAsset, CampLocation } from '@/lib/types';
import { QrLabelSheet } from './QrLabelSheet';
import {
  LAYOUTS, QrPreview, perSheet, stickerText,
  type LabelLayout, type LabelSpec,
} from './QrPreview';

type Source = 'locations' | 'assets';

interface Props {
  open: boolean;
  onClose: () => void;
}

const keyFor = (kind: 'location' | 'asset', id: string) => `${kind}:${id}`;

export function PrintLabelsModal({ open, onClose }: Props) {
  // Raw slices only. A selector that built an array here would allocate a new one every render
  // and spin React 19 + zustand v5 into an infinite loop.
  const locations = useLocationStore((s) => s.locations);
  const categories = useLocationStore((s) => s.categories);
  const setLocations = useLocationStore((s) => s.setLocations);
  const assets = useAssetStore((s) => s.assets);
  const setAssets = useAssetStore((s) => s.setAssets);
  const currentCamp = useCampStore((s) => s.currentCamp);
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  // Only opened from Camp Info, which is translated. The sticker's printed words follow the same
  // language — see QrLabel.
  const { t } = useTranslation('staff');

  const [source, setSource] = useState<Source>('locations');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<LabelLayout>('avery5163');
  const [single, setSingle] = useState(false);
  const [slot, setSlot] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [confirmRotate, setConfirmRotate] = useState<LabelSpec | null>(null);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [printJob, setPrintJob] = useState<{ specs: LabelSpec[]; layout: LabelLayout; startSlot: number } | null>(null);

  // ── Derived structure ───────────────────────────────────────────────────────

  const activeLocations = useMemo(() => locations.filter((l) => l.isActive), [locations]);
  const activeAssets = useMemo(() => assets.filter((a) => a.isActive), [assets]);

  const childrenBy = useMemo(() => {
    const map = new Map<string, CampLocation[]>();
    for (const l of activeLocations) {
      const k = l.parentId ?? '';
      const list = map.get(k);
      if (list) list.push(l); else map.set(k, [l]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [activeLocations]);

  const locById = useMemo(
    () => new Map(activeLocations.map((l) => [l.id, l] as const)),
    [activeLocations],
  );

  const categoryName = useCallback(
    (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? null : null),
    [categories],
  );

  /** Ancestor names, root first, EXCLUDING the node itself — that is what a label's small type shows. */
  const ancestorPath = useCallback((l: CampLocation): string | null => {
    const parts: string[] = [];
    let cur = l.parentId ? locById.get(l.parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parentId ? locById.get(cur.parentId) : undefined;
    }
    if (parts.length > 0) return parts.join(' › ');
    // A top-level place has no parent, so its category is the most useful second line.
    return categoryName(l.categoryId);
  }, [locById, categoryName]);

  const specForLocation = useCallback((l: CampLocation): LabelSpec | null => {
    if (!l.qrToken) return null; // minted server-side; absent only on a row not yet round-tripped
    return {
      kind: 'location', id: l.id, token: l.qrToken, name: l.name,
      path: ancestorPath(l), logoUrl: currentCamp?.logoUrl ?? null,
    };
  }, [ancestorPath, currentCamp]);

  const specForAsset = useCallback((a: CampAsset): LabelSpec | null => {
    if (!a.qrToken) return null;
    return {
      kind: 'asset', id: a.id, token: a.qrToken, name: a.name,
      path: a.storageLocation?.trim() || ASSET_CATEGORY_LABELS[a.category] || null,
      logoUrl: currentCamp?.logoUrl ?? null,
    };
  }, [currentCamp]);

  /** The selected labels, in tree order for locations then asset order. */
  const specs = useMemo(() => {
    const out: LabelSpec[] = [];
    const walk = (parentId: string | null) => {
      for (const l of childrenBy.get(parentId ?? '') ?? []) {
        if (selected.has(keyFor('location', l.id))) {
          const s = specForLocation(l);
          if (s) out.push(s);
        }
        walk(l.id);
      }
    };
    walk(null);
    for (const a of activeAssets) {
      if (selected.has(keyFor('asset', a.id))) {
        const s = specForAsset(a);
        if (s) out.push(s);
      }
    }
    return out;
  }, [childrenBy, activeAssets, selected, specForLocation, specForAsset]);

  // Clamped on read rather than corrected in an effect, so the cursor stays inside the selection
  // as it shrinks without a second render pass.
  const cursor = Math.min(previewIndex, Math.max(0, specs.length - 1));
  const previewSpec = specs[cursor] ?? null;

  // ── Selection ───────────────────────────────────────────────────────────────

  const descendantIds = useCallback((id: string): string[] => {
    const out: string[] = [];
    const stack = [...(childrenBy.get(id) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      out.push(node.id);
      stack.push(...(childrenBy.get(node.id) ?? []));
    }
    return out;
  }, [childrenBy]);

  function toggleLocation(l: CampLocation, withChildren: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = withChildren ? [l.id, ...descendantIds(l.id)] : [l.id];
      // A parent's checkbox means "this door and every door inside it", which is how somebody
      // actually thinks about printing "the whole Boys Village".
      const turningOn = !prev.has(keyFor('location', l.id));
      for (const id of ids) {
        const k = keyFor('location', id);
        if (turningOn) next.add(k); else next.delete(k);
      }
      return next;
    });
  }

  function toggleAsset(a: CampAsset) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyFor('asset', a.id);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function selectAllLocations() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const l of activeLocations) next.add(keyFor('location', l.id));
      return next;
    });
  }

  function selectCategory(categoryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const l of activeLocations) if (l.categoryId === categoryId) next.add(keyFor('location', l.id));
      return next;
    });
  }

  function selectAllAssets() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of activeAssets) next.add(keyFor('asset', a.id));
      return next;
    });
  }

  const clearAll = () => setSelected(new Set());

  // ── Search ──────────────────────────────────────────────────────────────────

  /** Ids that match the query, plus every ancestor, so a hit deep in the tree is reachable. */
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const l of activeLocations) {
      if (!l.name.toLowerCase().includes(q)) continue;
      keep.add(l.id);
      let cur = l.parentId ? locById.get(l.parentId) : undefined;
      let guard = 0;
      while (cur && guard++ < 20) { keep.add(cur.id); cur = cur.parentId ? locById.get(cur.parentId) : undefined; }
    }
    return keep;
  }, [query, activeLocations, locById]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? activeAssets.filter((a) => a.name.toLowerCase().includes(q)) : activeAssets;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeAssets, query]);

  // ── Rotate ──────────────────────────────────────────────────────────────────

  async function doRotate(spec: LabelSpec) {
    setRotating(true);
    setRotateError(null);
    const token = await dbRotateQrToken(spec.kind, spec.id);
    setRotating(false);
    if (!token) {
      setRotateError(t('labels.rotateError'));
      return;
    }
    // Write the new token straight into the store. There is no DB write to make — rotate_qr_token
    // already did it — and going through updateLocation()/updateAsset() would push a full row back
    // over the top of it.
    if (spec.kind === 'location') {
      setLocations(locations.map((l) => (l.id === spec.id ? { ...l, qrToken: token } : l)));
    } else {
      setAssets(assets.map((a) => (a.id === spec.id ? { ...a, qrToken: token } : a)));
    }
    setConfirmRotate(null);
  }

  // ── Print ───────────────────────────────────────────────────────────────────

  const toPrint = single && previewSpec ? [previewSpec] : specs;
  const sheets = Math.max(1, Math.ceil(((single ? slot : 0) + toPrint.length) / perSheet(layout)));

  const handleSheetReady = useCallback(() => {
    let cleared = false;
    const done = () => {
      if (cleared) return;
      cleared = true;
      window.removeEventListener('afterprint', done);
      setPrintJob(null);
    };
    window.addEventListener('afterprint', done);
    window.print();
    // Safari does not always fire afterprint. The sheet is display:none on screen, so leaving it
    // a while costs nothing, but it must not live forever.
    window.setTimeout(done, 30000);
  }, []);

  if (!open) return null;

  const sourceTab = (id: Source, label: string, count: number) => (
    <button
      key={id}
      onClick={() => setSource(id)}
      className={`px-3 py-1.5 text-[12.5px] font-bold rounded-btn transition-colors ${
        source === id ? 'bg-forest text-paper' : 'text-ink-soft hover:text-forest'
      }`}
    >
      {label} <span className="opacity-60 font-normal">{count}</span>
    </button>
  );

  return (
    <>
      <Modal title={t('labels.title')} onClose={onClose} width="min(940px, 96vw)">
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── Pick ─────────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-3">
              {sourceTab('locations', t('labels.locations'), activeLocations.length)}
              {sourceTab('assets', t('labels.assets'), activeAssets.length)}
            </div>

            <div className="relative mb-2.5">
              <Search className="w-3.5 h-3.5 text-ink-faint absolute start-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={source === 'locations' ? t('labels.findLocation') : t('labels.findAsset')}
                className="w-full bg-white border border-border rounded-btn ps-8 pe-3 py-2 text-[13px] focus:outline-none focus:border-sage"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-[11.5px]">
              {source === 'locations' ? (
                <>
                  <QuickPick onClick={selectAllLocations}>{t('labels.allLocations')}</QuickPick>
                  {categories.map((c) => (
                    <QuickPick key={c.id} onClick={() => selectCategory(c.id)}>{c.name}</QuickPick>
                  ))}
                </>
              ) : (
                <QuickPick onClick={selectAllAssets}>{t('labels.wholeFleet')}</QuickPick>
              )}
              <QuickPick onClick={clearAll}>{t('labels.clear')}</QuickPick>
            </div>

            <div className="border border-border rounded-card bg-white max-h-[46vh] overflow-y-auto">
              {source === 'locations' ? (
                (childrenBy.get('') ?? []).length === 0 ? (
                  <Empty>{t('labels.noLocations')}</Empty>
                ) : (
                  <LocationTree
                    parentId={null}
                    depth={0}
                    childrenBy={childrenBy}
                    visibleIds={visibleIds}
                    selected={selected}
                    expanded={expanded}
                    forceOpen={visibleIds !== null}
                    onToggleExpand={(id) => setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    })}
                    onToggle={toggleLocation}
                  />
                )
              ) : filteredAssets.length === 0 ? (
                <Empty>{t('labels.noAssets')}</Empty>
              ) : (
                filteredAssets.map((a) => (
                  <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/60 last:border-0 cursor-pointer hover:bg-paper">
                    <input
                      type="checkbox"
                      checked={selected.has(keyFor('asset', a.id))}
                      onChange={() => toggleAsset(a)}
                      className="w-4 h-4 accent-forest flex-none"
                    />
                    <span className="text-[13px] text-ink truncate">{a.name}</span>
                    <span className="text-[11px] text-ink-faint truncate ms-auto">
                      {a.storageLocation || ASSET_CATEGORY_LABELS[a.category]}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* ── Look at one, then print ──────────────────────────────────── */}
          <div className="lg:w-[340px] flex-none">
            <div className="mb-3">
              <p className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1.5">{t('labels.sheet')}</p>
              <div className="space-y-1.5">
                {(Object.keys(LAYOUTS) as LabelLayout[]).map((id) => (
                  <label key={id} className={`flex items-start gap-2.5 border rounded-card px-3 py-2 cursor-pointer transition-colors ${
                    layout === id ? 'border-forest bg-paper' : 'border-border bg-white hover:border-sage'
                  }`}>
                    <input
                      type="radio"
                      name="qr-layout"
                      checked={layout === id}
                      onChange={() => { setLayout(id); setSlot(0); }}
                      className="mt-0.5 accent-forest flex-none"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-ink">
                        {id === 'avery5163' ? t('labels.layoutAvery') : t('labels.layoutLarge')}
                      </span>
                      <span className="block text-[11.5px] text-ink-faint">
                        {/* The dimensions are pinned left-to-right: in a Hebrew line "4″ × 2″"
                            reordered itself into "2″ × 4″", which is a different label. */}
                        <bdi dir="ltr">{LAYOUTS[id].w}″ × {LAYOUTS[id].h}″</bdi>
                        {' · '}
                        {id === 'avery5163'
                          ? t('labels.hintAvery', { count: perSheet(id) })
                          : t('labels.hintLarge', { count: perSheet(id) })}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={single}
                onChange={(e) => setSingle(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-forest flex-none"
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-ink">{t('labels.reprintSingle')}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  {t('labels.reprintHint')}
                </span>
              </span>
            </label>

            {single && (
              <div className="mb-3">
                <p className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1.5">
                  {t('labels.whichSlot')}
                </p>
                {/* Left-to-right in every language: these are the positions on the physical sheet, as
                    QrLabelSheet prints them. */}
                <div dir="ltr" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${LAYOUTS[layout].cols}, minmax(0, 1fr))` }}>
                  {Array.from({ length: perSheet(layout) }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlot(i)}
                      className={`h-8 rounded-btn border text-[11.5px] font-bold transition-colors ${
                        slot === i ? 'border-forest bg-forest text-paper' : 'border-border bg-white text-ink-soft hover:border-sage'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] font-bold text-ink-faint uppercase tracking-widest mb-1.5">{t('labels.preview')}</p>
            {previewSpec ? (
              <div>
                <QrPreview
                  spec={previewSpec}
                  layout={layout}
                  widthPx={layout === 'avery5163' ? 316 : 236}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setPreviewIndex(Math.max(0, cursor - 1))}
                    disabled={cursor <= 0}
                    className="text-[12px] text-ink-soft disabled:opacity-30 hover:text-forest"
                  >
                    ‹ {t('labels.prev')}
                  </button>
                  <span className="text-[11.5px] text-ink-faint">
                    {t('labels.position', { current: Math.min(cursor + 1, specs.length), total: specs.length })}
                  </span>
                  <button
                    onClick={() => setPreviewIndex(Math.min(specs.length - 1, cursor + 1))}
                    disabled={cursor >= specs.length - 1}
                    className="text-[12px] text-ink-soft disabled:opacity-30 hover:text-forest"
                  >
                    {t('labels.next')} ›
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => { setRotateError(null); setConfirmRotate(previewSpec); }}
                      className="ms-auto inline-flex items-center gap-1 text-[11.5px] text-ink-soft hover:text-red"
                      title={t('labels.reissueTitle')}
                    >
                      <RefreshCw className="w-3 h-3" /> {t('labels.reissue')}
                    </button>
                  )}
                </div>
                <p dir="ltr" className="mt-2 text-[11px] text-ink-faint font-mono break-all text-start">
                  {stickerText(previewSpec.token)}
                </p>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-card px-4 py-8 text-center text-[12.5px] text-ink-faint">
                {t('labels.tickToPreview')}
              </div>
            )}

            {rotateError && (
              <p className="mt-2 text-[12px] text-red">{rotateError}</p>
            )}

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-[12.5px] text-ink-soft mb-2.5">
                <span>{t('labels.labelCount', { count: toPrint.length })}</span>
                <span>{t('labels.sheetCount', { count: sheets })}</span>
              </div>
              <Button
                onClick={() => setPrintJob({ specs: toPrint, layout, startSlot: single ? slot : 0 })}
                disabled={toPrint.length === 0 || printJob !== null}
                className="w-full justify-center"
              >
                <Printer className="w-4 h-4" />
                {printJob ? t('labels.preparing') : t('labels.print')}
              </Button>
              <p className="mt-2 text-[11px] text-ink-faint leading-snug">
                <Trans t={t} i18nKey={layout === 'avery5163' ? 'labels.printTipAvery' : 'labels.printTipLetter'}
                  components={{ b: <span className="font-semibold" /> }} />
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {confirmRotate && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-modal shadow-xl max-w-sm w-full p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red flex-none mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-ink mb-1.5">
                  {t('labels.confirmTitle', { name: confirmRotate.name })}
                </h3>
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  {t('labels.confirmBody')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={() => setConfirmRotate(null)} disabled={rotating}>
                {t('labels.keepOld')}
              </Button>
              <Button variant="danger" onClick={() => void doRotate(confirmRotate)} disabled={rotating}>
                {rotating ? t('labels.reissuing') : t('labels.reissue')}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {printJob && (
        <QrLabelSheet
          specs={printJob.specs}
          layout={printJob.layout}
          startSlot={printJob.startSlot}
          onReady={handleSheetReady}
        />
      )}
    </>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function QuickPick({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-pill border border-border bg-white px-2.5 py-1 text-ink-soft hover:border-sage hover:text-forest transition-colors"
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-[12.5px] text-ink-faint">{children}</div>;
}

interface TreeProps {
  parentId: string | null;
  depth: number;
  childrenBy: Map<string, CampLocation[]>;
  visibleIds: Set<string> | null;
  selected: Set<string>;
  expanded: Set<string>;
  forceOpen: boolean;
  onToggleExpand: (id: string) => void;
  onToggle: (l: CampLocation, withChildren: boolean) => void;
}

function LocationTree(props: TreeProps) {
  const { parentId, depth, childrenBy, visibleIds, selected, expanded, forceOpen, onToggleExpand, onToggle } = props;
  const rows = (childrenBy.get(parentId ?? '') ?? []).filter((l) => !visibleIds || visibleIds.has(l.id));
  const { t } = useTranslation('staff');

  return (
    <>
      {rows.map((l) => {
        const kids = childrenBy.get(l.id) ?? [];
        const hasKids = kids.length > 0;
        const isOpen = forceOpen || expanded.has(l.id);
        const checked = selected.has(keyFor('location', l.id));
        return (
          <div key={l.id}>
            <div
              className="flex items-center gap-1.5 border-b border-border/60 px-2 py-2 hover:bg-paper"
              style={{ paddingInlineStart: 8 + depth * 16 }}
            >
              <button
                onClick={() => hasKids && onToggleExpand(l.id)}
                className={`w-4 h-4 flex-none grid place-items-center text-ink-faint ${hasKids ? 'hover:text-forest' : 'opacity-0 pointer-events-none'}`}
                aria-label={isOpen ? t('labels.collapse') : t('labels.expand')}
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 rtl:-scale-x-100" />}
              </button>
              <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(l, true)}
                  className="w-4 h-4 accent-forest flex-none"
                />
                <span className="text-[13px] text-ink truncate">{l.name}</span>
                {hasKids && (
                  <span className="text-[11px] text-ink-faint flex-none">{kids.length}</span>
                )}
                {!l.qrToken && (
                  <span className="text-[10.5px] text-amber-text flex-none">{t('labels.noCodeYet')}</span>
                )}
                {l.serviceStatus !== 'in_service' && (
                  <span className="inline-flex items-center gap-0.5 text-[10.5px] text-red flex-none">
                    <X className="w-3 h-3" /> {t('labels.outOfService')}
                  </span>
                )}
                {checked && <Check className="w-3.5 h-3.5 text-forest flex-none ms-auto" />}
              </label>
            </div>
            {hasKids && isOpen && (
              <LocationTree {...props} parentId={l.id} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}
