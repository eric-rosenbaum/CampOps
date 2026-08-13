import { useState } from 'react';
import { Plus, X, Sparkles } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/shared/Button';
import { useCommissaryStore } from '@/store/commissaryStore';
import { inputClass } from './commissaryUi';

/** Manage the camp's customizable menu course buckets (Protein / Carb / Side …). */
export function CoursesModal() {
  const { coursesSorted, addCourse, renameCourse, deleteCourse, seedDefaultCourses, closeModal } = useCommissaryStore();
  const courses = coursesSorted();
  const [newName, setNewName] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    addCourse(newName);
    setNewName('');
  }

  return (
    <Modal title="Menu courses" onClose={closeModal} width="440px">
      <div className="space-y-4">
        <p className="text-[12px] text-forest/55 leading-relaxed">
          Buckets you can assign a menu item to, so a meal can be built as a balanced plate
          (protein + carb + vegetable…). Customize these for how your camp plans meals.
        </p>

        {courses.length === 0 ? (
          <div className="rounded-card border border-dashed border-border px-4 py-4 sm:py-6 text-center">
            <p className="text-[13px] text-forest/50 mb-3">No courses yet.</p>
            <Button size="sm" variant="ghost" onClick={seedDefaultCourses}>
              <Sparkles className="w-3.5 h-3.5" /> Add the common ones
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {courses.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => renameCourse(c.id, e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete the "${c.name}" course? Menu items keep it as plain text.`)) deleteCourse(c.id); }}
                  className="p-2 text-forest/30 hover:text-red transition-colors"
                  aria-label="Delete course"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex gap-2 pt-1">
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            className={inputClass} placeholder="New course name…"
          />
          <Button type="submit" size="sm" variant="ghost" disabled={!newName.trim()} className="whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </form>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={closeModal}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
