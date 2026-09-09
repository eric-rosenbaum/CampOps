import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Modal } from './Modal';
import { Button } from './Button';
import { useUIStore } from '@/store/uiStore';
import { useIssuesStore } from '@/store/issuesStore';
import { useCampStore } from '@/store/campStore';
import { useLocationStore } from '@/store/locationStore';
import { useAssetStore } from '@/store/assetStore';
import { useCampgroundStore } from '@/store/campgroundStore';
import { LocationPicker } from '@/components/shared/LocationPicker';
import { CaptureSheet } from '@/components/campground/CaptureSheet';
import { useAuth } from '@/lib/auth';
import { dbUploadPhoto, dbDeletePhoto } from '@/lib/db';
import { useTradeLabel } from '@/lib/useTrades';
import type { ActivityEntry, Priority, Trade, WorkOrderDraft } from '@/lib/types';
import { newWorkOrder } from '@/lib/workOrder';
import { generateId } from '@/lib/utils';
import { Camera, ChevronRight, Repeat, Sparkles, X } from 'lucide-react';
import { useTradeKeys } from '@/lib/useTrades';


/**
 * Where the routine editor lives. The module is Campground in the product and `issues` in the
 * database; the route follows the product, so this is the path the sidebar links to.
 */
const ROUTINES_PATH = '/campground?tab=routines';

interface FormValues {
  title: string;
  priority: Priority;
  description: string;
  assigneeId: string;
  dueDate: string;
  /** Which crew. A filter default and a colour, never a permission. */
  trade: Trade;
  /** Work against a *thing*, so cost and days-out roll up to the vehicle or the mower. */
  assetId: string;
  /** Who outside the camp is doing it. Independent of assignee and of status. */
  vendorId: string;
}

export function LogIssueModal() {
  const tradeKeys = useTradeKeys();
  const labelOf = useTradeLabel();
  const navigate = useNavigate();
  const { isLogIssueModalOpen, editingIssueId, closeAllModals } = useUIStore();
  const { addIssue, updateIssue, addActivityEntry, selectIssue, issues } = useIssuesStore();
  const { currentUser, can } = useAuth();
  const members = useCampStore((s) => s.members);
  const assets = useAssetStore((s) => s.assets);
  const vendors = useCampgroundStore((s) => s.vendors);
  const templates = useCampgroundStore((s) => s.templates);
  const applyTemplate = useCampgroundStore((s) => s.applyTemplate);
  const editingIssue = editingIssueId ? issues.find((i) => i.id === editingIssueId) : null;

  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [templateId, setTemplateId] = useState('');
  /**
   * Asset and vendor are blank on most jobs — a torn screen door belongs to no vehicle and no
   * contractor — so they sit behind a disclosure rather than making everyone scroll past two
   * "not applicable" selects to reach the description.
   */
  const [showExtras, setShowExtras] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  /** What the capture actually saw and heard, kept on screen beside the fields it filled in. */
  const [draftReading, setDraftReading] = useState<
    { questions: string[] } | null
  >(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      defaultValues: {
        priority: 'normal',
        trade: 'maintenance',
        assetId: '',
        vendorId: '',
      },
    });

  const trade = watch('trade');

  useEffect(() => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemoveExistingPhoto(false);
    setCaptureOpen(false);
    setDraftReading(null);

    if (editingIssue) {
      setLocationIds(editingIssue.locationIds ?? []);
      reset({
        title: editingIssue.title,
        priority: editingIssue.priority,
        description: editingIssue.description,
        assigneeId: editingIssue.assigneeId ?? '',
        dueDate: editingIssue.dueDate ?? '',
        trade: editingIssue.trade,
        assetId: editingIssue.assetId ?? '',
        vendorId: editingIssue.vendorId ?? '',
      });
    } else {
      setLocationIds([]);
      reset({
        priority: 'normal',
        title: '',
        description: '',
        assigneeId: '',
        dueDate: '',
        trade: 'maintenance',
        assetId: '',
        vendorId: '',
      });
    }
  }, [editingIssue, reset, isLogIssueModalOpen]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setRemoveExistingPhoto(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemoveExistingPhoto(true);
  }

  /** A capture never files anything. It fills this form in, and a person reads it. */
  function applyDraft(draft: WorkOrderDraft) {
    setValue('title', draft.title);
    setValue('description', draft.description);
    // Only a trade this camp actually has. The database has a CHECK constraint on this column, so
    // an unrecognised value is not a cosmetic problem — it is a row that draws optimistically and
    // is then rejected on the wire, which the user sees as "a change didn't save". Guarded here as
    // well as in the function because the two deploy independently.
    if (draft.trade && tradeKeys.includes(draft.trade)) setValue('trade', draft.trade);
    if (draft.priority) setValue('priority', draft.priority);
    if (draft.assigneeId) setValue('assigneeId', draft.assigneeId);
    if (draft.assetId) setValue('assetId', draft.assetId);
    if (draft.locationId) setLocationIds([draft.locationId]);
    setDraftReading({
      questions: draft.questions,
    });
  }

  async function onSubmit(data: FormValues) {
    const now = new Date().toISOString();
    const assigneeId = data.assigneeId || null;
    const assigneeName = assigneeId ? (members.find((m) => m.userId === assigneeId)?.fullName ?? null) : null;
    const locations = useLocationStore.getState().namesFor(locationIds);

    if (editingIssue) {
      // Resolve photo for edit
      let photoUrl: string | null = editingIssue.photoUrl;
      if (photoFile) {
        const url = await dbUploadPhoto(photoFile, editingIssue.id);
        if (url) {
          if (editingIssue.photoUrl) void dbDeletePhoto(editingIssue.photoUrl);
          photoUrl = url;
        }
      } else if (removeExistingPhoto && editingIssue.photoUrl) {
        await dbDeletePhoto(editingIssue.photoUrl);
        photoUrl = null;
      }

      // The deprecated estimate and recurrence columns are deliberately absent from this patch
      // rather than nulled: nothing writes them any more, and an old row's value is history
      // that an edit to the title has no business erasing.
      updateIssue(editingIssue.id, {
        title: data.title,
        locationIds,
        locations,
        priority: data.priority,
        description: data.description,
        assigneeId,
        status: assigneeId
          ? (editingIssue.status === 'unassigned' ? 'assigned' : editingIssue.status)
          : editingIssue.status,
        dueDate: data.dueDate || null,
        trade: data.trade,
        assetId: data.assetId || null,
        vendorId: data.vendorId || null,
        photoUrl,
      });
      addActivityEntry(editingIssue.id, {
        id: generateId(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: `Edited by ${currentUser.name}`,
        timestamp: now,
      });
    } else {
      const activityLog: ActivityEntry[] = [{
        id: generateId(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: `Logged by ${currentUser.name}`,
        timestamp: now,
      }];
      if (assigneeId && assigneeName) {
        activityLog.push({
          id: generateId(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: `Assigned to ${assigneeName} by ${currentUser.name}`,
          timestamp: now,
        });
      }

      // Built by the shared factory rather than as a literal here, so a new column is one edit
      // in workOrder.ts instead of ten call sites that each have to remember it.
      const workOrder = newWorkOrder({
        title: data.title,
        description: data.description,
        locationIds,
        locations,
        priority: data.priority,
        assigneeId,
        reportedById: currentUser.id,
        trade: data.trade,
        assetId: data.assetId || null,
        vendorId: data.vendorId || null,
        dueDate: data.dueDate || null,
        activityLog,
      });

      if (photoFile) {
        const url = await dbUploadPhoto(photoFile, workOrder.id);
        if (url) workOrder.photoUrl = url;
      }

      const outcome = await addIssue(workOrder);
      // The steps are half the job: a turnover logged without its checklist is a title and a
      // hope. The template is applied by an RPC against the saved row, so it has to wait for
      // the parent write — firing it alongside the optimistic insert is a foreign-key race the
      // RPC loses silently.
      if (templateId && outcome === 'saved') await applyTemplate(workOrder.id, templateId);
      selectIssue(workOrder.id);
    }

    closeAllModals();
  }

  if (!isLogIssueModalOpen) return null;

  const displayPhoto = photoPreview ?? (editingIssue?.photoUrl && !removeExistingPhoto ? editingIssue.photoUrl : null);
  const activeAssets = assets.filter((a) => a.isActive || a.id === editingIssue?.assetId);
  const activeVendors = vendors.filter((v) => v.isActive || v.id === editingIssue?.vendorId);
  // Only the checklists for the trade being logged; a housekeeping turnover list on a plumbing
  // job is noise in a dropdown someone is scanning quickly.
  const tradeTemplates = templates.filter((t) => t.isActive && t.trade === trade);
  const extrasCount = (watch('assetId') ? 1 : 0) + (watch('vendorId') ? 1 : 0);

  const inputClass = 'w-full text-[13px] bg-white border border-border rounded-btn px-3 py-2 focus:outline-none focus:border-sage';
  const labelClass = 'block text-[12px] font-medium text-ink mb-1';
  const errorClass = 'text-[11px] text-red mt-0.5';

  return (
    <Modal title={editingIssue ? 'Edit work order' : 'Log work'} onClose={closeAllModals}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Capture first, because the fastest way to fill this form in is to not type. */}
        {!editingIssue && (
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="flex w-full items-center gap-2 rounded-card border border-dashed border-border
                       bg-cream px-3 py-2.5 text-left transition-colors hover:border-sage"
          >
            <Sparkles className="h-4 w-4 flex-none text-sage" />
            <span className="text-[12.5px] font-semibold text-forest">Capture</span>
            <span className="text-[11.5px] text-ink-soft">Photo or voice — you edit what comes back</span>
          </button>
        )}

        {draftReading && (
          <div className="rounded-card border border-border bg-paper px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-ink-soft">Filled in from your capture.</p>
            {/* The open questions stay: they are what to check on site. The reasoning blob and the
                confidence score do not — the fields below are all editable, so the review is
                editing them, not reading a second account of them. */}
            {draftReading.questions.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {draftReading.questions.map((q) => (
                  <li key={q} className="text-[11.5px] text-ink-soft">• {q}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <label className={labelClass}>Title *</label>
          <input
            {...register('title', { required: 'Title is required' })}
            className={inputClass}
            placeholder="What is wrong, in a few words"
          />
          {errors.title && <p className={errorClass}>{errors.title.message}</p>}
        </div>

        {/* Trade decides which lane this lands in and who it routes to by default. Never a
            permission: everyone can see and take everything. */}
        <div>
          <label className={labelClass}>Crew</label>
          <div className="flex flex-wrap gap-1">
            {tradeKeys.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('trade', t, { shouldDirty: true })}
                aria-pressed={trade === t}
                className={`rounded-btn border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  trade === t
                    ? 'border-forest bg-forest text-paper'
                    : 'border-border bg-white text-ink hover:border-sage'
                }`}
              >
                {labelOf(t)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Location</label>
          <LocationPicker value={locationIds} onChange={setLocationIds} />
        </div>

        {/* A checklist turns a title into the steps somebody can actually work through, and the
            moment of logging is when the person knows which one applies. */}
        {!editingIssue && tradeTemplates.length > 0 && (
          <div>
            <label className={labelClass}>Checklist</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={inputClass}
            >
              <option value="">No checklist</option>
              {tradeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.items.length} step{t.items.length === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
        )}

        {(activeAssets.length > 0 || activeVendors.length > 0) && (
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowExtras((v) => !v)}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-forest transition-colors"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${showExtras ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
              Equipment and contractors
              {extrasCount > 0 && (
                <span className="font-mono text-[11.5px] text-forest">{extrasCount} set</span>
              )}
            </button>

            {showExtras && (
              <div className="space-y-3 pt-3">
                {/* Work against a *thing*, so cost and days-out roll up to the vehicle or the mower. */}
                {activeAssets.length > 0 && (
                  <div>
                    <label className={labelClass}>Vehicle or equipment</label>
                    <select {...register('assetId')} className={inputClass}>
                      <option value="">Not about a specific one</option>
                      {activeAssets.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {activeVendors.length > 0 && (
                  <div>
                    <label className={labelClass}>Outside vendor</label>
                    <select {...register('vendorId')} className={inputClass}>
                      <option value="">Nobody outside</option>
                      {activeVendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}{v.trade ? ` · ${v.trade}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Priority *</label>
            <select {...register('priority', { required: true })} className={inputClass}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            {...register('description')}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Anything else worth knowing"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {can('assign') && (
            <div>
              <label className={labelClass}>Assign to</label>
              <select {...register('assigneeId')} className={inputClass}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.fullName}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Due date</label>
            <input type="date" {...register('dueDate')} className={inputClass} />
          </div>
        </div>

        {/* Photo */}
        <div>
          <label className={labelClass}>Photo</label>
          {displayPhoto ? (
            <div className="space-y-1.5">
              <div className="relative">
                <img
                  src={displayPhoto}
                  alt="Issue"
                  className="w-full rounded-card border border-border object-cover max-h-48"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer hover:text-ink transition-colors w-fit">
                <Camera className="w-3 h-3" />
                <span>Change photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-2 py-3 px-3 bg-cream rounded-card border border-dashed border-border text-ink-faint cursor-pointer hover:border-sage hover:text-ink-soft transition-colors">
              <Camera className="w-4 h-4" />
              <span className="text-[12px]">Click to attach photo</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </label>
          )}
        </div>

        {/*
          Recurrence is not a checkbox on an event any more.
          An issue is something that HAPPENED; a recurrence is a TEMPLATE, and the old boolean
          could not say "every third Tuesday, housekeeping, only between June and August, with
          these eleven steps" — which is why it generated nothing for its entire life. It lives
          in Routines now, and this points there rather than pretending otherwise.
        */}
        <button
          type="button"
          onClick={() => { closeAllModals(); navigate(ROUTINES_PATH); }}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-forest"
        >
          <Repeat className="h-3.5 w-3.5" />
          This happens on a schedule — make it a routine
        </button>

        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1 justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : (editingIssue ? 'Save changes' : 'Log it')}
          </Button>
          <Button type="button" variant="ghost" onClick={closeAllModals} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>

      {captureOpen && (
        <CaptureSheet onClose={() => setCaptureOpen(false)} onDraft={applyDraft} />
      )}
    </Modal>
  );
}
