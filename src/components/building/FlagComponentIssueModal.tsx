import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useBuildingStore, COMPONENT_TYPE_LABELS } from '@/store/buildingStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useAuth } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import type { ComponentStatus, Issue } from '@/lib/types';

const inputClass = 'w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
const labelClass = 'block text-secondary font-medium text-forest/70 mb-1';

export function FlagComponentIssueModal({ componentId }: { componentId: string }) {
  const { components, buildings, rooms, updateComponent, closeModal } = useBuildingStore();
  const { addIssue, selectIssue } = useIssuesStore();
  const { currentUser } = useAuth();

  const component = components.find((c) => c.id === componentId) ?? null;
  const building = component ? buildings.find((b) => b.id === component.buildingId) ?? null : null;
  const room = component?.roomId ? rooms.find((r) => r.id === component.roomId) ?? null : null;

  const alreadyFlagged = component ? component.status !== 'operational' : false;
  const [severity, setSeverity] = useState<Exclude<ComponentStatus, 'operational'>>(
    component && component.status !== 'operational' ? component.status : 'needs_attention',
  );
  const [detail, setDetail] = useState(component?.statusDetail ?? '');
  const [createIssue, setCreateIssue] = useState(!alreadyFlagged);

  if (!component) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!component) return;
    const now = new Date().toISOString();
    updateComponent({ ...component, status: severity, statusDetail: detail || null, updatedAt: now });

    if (createIssue) {
      const locationName = building?.locationLabel || building?.name || '';
      const where = [building?.name, room?.name].filter(Boolean).join(' · ');
      const id = generateId();
      const newIssue: Issue = {
        id,
        title: `${component.label} — ${COMPONENT_TYPE_LABELS[component.type]}`,
        description: [where, detail].filter(Boolean).join('\n'),
        locations: locationName ? [locationName] : [],
        priority: severity === 'out_of_service' ? 'high' : 'normal',
        status: 'unassigned',
        assigneeId: null,
        reportedById: currentUser.id,
        estimatedCostDisplay: null,
        estimatedCostValue: null,
        actualCost: null,
        photoUrl: component.photoUrl,
        dueDate: null,
        isRecurring: false,
        recurringInterval: null,
        isPublicReport: false,
        reporterName: null,
        reporterContact: null,
        createdAt: now,
        updatedAt: now,
        activityLog: [{
          id: generateId(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: `Flagged from Building Systems by ${currentUser.name}`,
          timestamp: now,
        }],
      };
      addIssue(newIssue);
      selectIssue(id);
    }
    closeModal();
  }

  function handleClear() {
    if (!component) return;
    updateComponent({ ...component, status: 'operational', statusDetail: null, updatedAt: new Date().toISOString() });
    closeModal();
  }

  return (
    <Modal title={`Flag issue — ${component.label}`} onClose={closeModal} width="440px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Severity *</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Exclude<ComponentStatus, 'operational'>)} className={inputClass}>
            <option value="needs_attention">Needs attention — service soon</option>
            <option value="out_of_service">Out of service — needs repair</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>What's wrong? *</label>
          <textarea
            required
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe the problem…"
          />
        </div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={createIssue} onChange={(e) => setCreateIssue(e.target.checked)} className="w-4 h-4 accent-forest rounded mt-0.5" />
          <span className="text-body text-forest/80">
            Also create a ticket in Issues &amp; Repairs
            {building && <span className="text-forest/40"> (location: {building.locationLabel || building.name})</span>}
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1 justify-center">{alreadyFlagged ? 'Update' : 'Flag issue'}</Button>
          {alreadyFlagged && (
            <Button type="button" variant="ghost" className="text-green-muted-text hover:bg-green-muted-bg" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
