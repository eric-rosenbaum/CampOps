import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { GuardedSave, Req } from '@/components/shared/RequiredFields';
import { Button } from '@/components/shared/Button';
import { useRetreatStore } from '@/store/retreatStore';
import { useAuth } from '@/lib/auth';
import { generateId, todayStr } from '@/lib/utils';
import type { RetreatScheduleItem } from '@/lib/types';
import { inputClass, labelClass } from './retreatUi';

export function ScheduleItemModal({ retreatId, itemId }: { retreatId: string; itemId?: string }) {
  const { scheduleFor, addScheduleItem, updateScheduleItem, deleteScheduleItem, closeModal } = useRetreatStore();
  const { can } = useAuth();
  const canManage = can('manageRetreats');

  const existing = itemId ? scheduleFor(retreatId).find((s) => s.id === itemId) ?? null : null;
  const editing = !!existing;

  const [dayDate, setDayDate] = useState(existing?.dayDate ?? todayStr());
  const [timeLabel, setTimeLabel] = useState(existing?.timeLabel ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || !canManage) return;
    const now = new Date().toISOString();

    if (editing && existing) {
      updateScheduleItem({
        ...existing,
        dayDate: dayDate || null,
        timeLabel: timeLabel.trim() || null,
        title: title.trim(),
        location: location.trim() || null,
        updatedAt: now,
      });
    } else {
      const item: RetreatScheduleItem = {
        id: generateId(),
        campId: '',
        retreatId,
        dayDate: dayDate || null,
        timeLabel: timeLabel.trim() || null,
        title: title.trim(),
        location: location.trim() || null,
        sortOrder: scheduleFor(retreatId).length,
        createdAt: now,
        updatedAt: now,
      };
      addScheduleItem(item);
    }
    closeModal();
  }

  function handleDelete() {
    if (!existing || !canManage) return;
    deleteScheduleItem(existing.id);
    closeModal();
  }

  // Named rather than boolean: the save button says what it is waiting for.
  const missing = [
    !title.trim() ? 'a title' : null,
  ].filter(Boolean) as string[];

  return (
    <Modal title={editing ? 'Edit schedule item' : 'Add schedule item'} onClose={closeModal} width="460px">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Day</label>
            <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Time</label>
            <input value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} className={inputClass} placeholder="e.g. 7:30am" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Title<Req /></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Breakfast" autoFocus />
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="e.g. Dining hall" />
        </div>
        <div className="flex gap-2 pt-1">
          <GuardedSave
            className="flex-1 items-stretch"
            missing={canManage ? missing : ['permission to change this']}
            onSave={() => handleSubmit()}
            label={editing ? 'Save' : 'Add'}
          />
          {editing ? (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={!canManage}>Delete</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
