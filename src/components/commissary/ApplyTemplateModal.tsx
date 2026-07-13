import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';

export function ApplyTemplateModal() {
  const { templates, activeSession, weeksInSession, applyTemplate, closeModal } = useCommissaryStore();
  const session = activeSession();
  const weeks = weeksInSession();

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [startWeek, setStartWeek] = useState('1');

  const template = templates.find((t) => t.id === templateId);
  const start = Math.max(1, Math.min(weeks, Number(startWeek) || 1));
  const affected = weeks - start + 1;

  function handleApply() {
    if (!templateId) return;
    if (confirm(`Replace the menu for weeks ${start}–${weeks} of ${session?.name} with "${template?.name}"? Existing meals in those weeks are overwritten.`)) {
      applyTemplate(templateId, start);
      closeModal();
    }
  }

  if (!session) return null;

  return (
    <Modal title="Apply menu template" onClose={closeModal} width="460px">
      <div className="space-y-4">
        {templates.length === 0 ? (
          <p className="text-[13px] text-forest/55">No templates yet. Build one in the Templates view first.</p>
        ) : (
          <>
            <div>
              <label className="block text-secondary font-medium text-forest/70 mb-1">Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                      className="w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.lengthWeeks}-week cycle)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-secondary font-medium text-forest/70 mb-1">Start at week</label>
              <input type="number" min="1" max={weeks} value={startWeek} onChange={(e) => setStartWeek(e.target.value)}
                     className="w-full text-body bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage" />
            </div>
            <p className="text-[12px] text-forest/55 leading-relaxed">
              The {template?.lengthWeeks}-week cycle repeats across weeks {start}–{weeks} ({affected} week{affected === 1 ? '' : 's'}).
              Meals already in those weeks are replaced; earlier weeks are untouched. You can tweak
              any meal afterward without changing the template.
            </p>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 justify-center" onClick={handleApply}>Apply template</Button>
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            </div>
          </>
        )}
        {templates.length === 0 && (
          <div className="flex justify-end"><Button variant="ghost" onClick={closeModal}>Close</Button></div>
        )}
      </div>
    </Modal>
  );
}
