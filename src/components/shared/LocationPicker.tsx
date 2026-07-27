import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, ChevronRight, MapPin, X } from 'lucide-react';
import { useLocationStore } from '@/store/locationStore';
import type { CampLocation } from '@/lib/types';

interface Props {
  value: string[];                    // selected location ids
  onChange: (ids: string[]) => void;
  multiple?: boolean;                 // default true
  filter?: (l: CampLocation) => boolean;   // e.g. dorms-only for retreats
  placeholder?: string;
  emptyHint?: string;                 // shown when the camp has no locations yet
}

/**
 * Shared location picker. Searchable, grouped by category, tree-expandable — scales to 150+.
 * Reads the unified location tree from the location store. Multi-select by default;
 * pass multiple={false} for a single-select (assets, building link).
 */
export function LocationPicker({ value, onChange, multiple = true, filter, placeholder = 'Select location…', emptyHint }: Props) {
  const { locations, categories } = useLocationStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = useMemo(() => locations.filter((l) => l.isActive && (!filter || filter(l))), [locations, filter]);
  const byId = useMemo(() => new Map(active.map((l) => [l.id, l])), [active]);
  const selected = value.map((id) => byId.get(id) ?? locations.find((l) => l.id === id)).filter(Boolean) as CampLocation[];

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return active.filter((l) => l.name.toLowerCase().includes(q));
  }, [active, q]);

  function toggle(id: string) {
    if (multiple) onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    else { onChange([id]); setOpen(false); }
  }
  function fullPath(l: CampLocation): string {
    const parts: string[] = [l.name]; let cur = l.parentId ? byId.get(l.parentId) : undefined; let g = 0;
    while (cur && g++ < 10) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return parts.join(' › ');
  }

  // Group top-level nodes by category for the tree view
  const grouped = useMemo(() => {
    const cats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const tops = active.filter((l) => l.parentId == null);
    const out: { key: string; label: string; items: CampLocation[] }[] = [];
    for (const c of cats) {
      const items = tops.filter((l) => l.categoryId === c.id);
      if (items.length) out.push({ key: c.id, label: c.name, items });
    }
    const uncategorized = tops.filter((l) => !l.categoryId || !categories.some((c) => c.id === l.categoryId));
    if (uncategorized.length) out.push({ key: '_none', label: 'Uncategorized', items: uncategorized });
    return out;
  }, [active, categories]);

  function childrenOf(id: string) { return active.filter((l) => l.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder); }

  function Node({ l, depth }: { l: CampLocation; depth: number }) {
    const kids = childrenOf(l.id);
    const isSel = value.includes(l.id);
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(l.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-btn text-left text-[13px] hover:bg-cream/60 transition-colors ${isSel ? 'text-forest font-medium' : 'text-forest/75'}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <span className={`w-4 h-4 rounded ${multiple ? '' : 'rounded-full'} border flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-sage border-sage text-white' : 'border-border'}`}>
            {isSel && <Check className="w-3 h-3" />}
          </span>
          <span className="flex-1 truncate">{l.name}</span>
          {l.isDorm && <span className="text-[10px] font-semibold uppercase tracking-wide text-sage flex-shrink-0">Dorm</span>}
        </button>
        {kids.map((k) => <Node key={k.id} l={k} depth={depth + 1} />)}
      </div>
    );
  }

  const label = selected.length === 0 ? placeholder
    : multiple ? `${selected.length} selected` : selected[0].name;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-body bg-white border border-border rounded-btn px-3 py-2 text-left focus:outline-none focus:border-sage"
      >
        <MapPin className="w-4 h-4 text-forest/40 flex-shrink-0" />
        <span className={`flex-1 truncate ${selected.length ? 'text-forest' : 'text-forest/40'}`}>{label}</span>
        <ChevronDown className={`w-4 h-4 text-forest/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* selected chips (multi) */}
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-tag bg-sage-pale text-forest text-[12px]">
              {fullPath(l)}
              <button type="button" onClick={() => toggle(l.id)} className="text-forest/50 hover:text-forest"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-border rounded-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-cream-dark">
            <div className="flex items-center gap-2 bg-cream rounded-btn px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-forest/40" />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search locations…"
                className="flex-1 bg-transparent text-[13px] text-forest focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {active.length === 0 ? (
              <p className="text-[12px] text-forest/40 italic px-3 py-4 text-center">{emptyHint ?? 'No locations yet — add them in Camp Info.'}</p>
            ) : matches ? (
              matches.length === 0
                ? <p className="text-[12px] text-forest/40 italic px-3 py-4 text-center">No match for “{query}”.</p>
                : matches.map((l) => {
                    const isSel = value.includes(l.id);
                    return (
                      <button key={l.id} type="button" onClick={() => toggle(l.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-cream/60 ${isSel ? 'text-forest font-medium' : 'text-forest/75'}`}>
                        <span className={`w-4 h-4 rounded ${multiple ? '' : 'rounded-full'} border flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-sage border-sage text-white' : 'border-border'}`}>{isSel && <Check className="w-3 h-3" />}</span>
                        <span className="flex-1 truncate">{fullPath(l)}</span>
                      </button>
                    );
                  })
            ) : (
              grouped.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <div key={g.key}>
                    <button type="button"
                      onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-forest/45 hover:text-forest/70">
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {g.label}
                    </button>
                    {!isCollapsed && g.items.map((l) => <Node key={l.id} l={l} depth={0} />)}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
