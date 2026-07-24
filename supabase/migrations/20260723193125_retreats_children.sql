-- Retreat child tables: documents, menu, change requests, costs/charges/payments,
-- issues, checklist, schedule, feedback, reminders. RLS + realtime applied in a loop.
CREATE TABLE IF NOT EXISTS retreat_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other', name text NOT NULL,
  status text NOT NULL DEFAULT 'missing', file_path text, signed_by text, signed_at timestamptz,
  due_date date, meta jsonb, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  day_date date NOT NULL, meal_period text NOT NULL DEFAULT 'breakfast',
  name text, items text, allergens text[] NOT NULL DEFAULT '{}', alternatives text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other', submitted_by text, submitted_at timestamptz DEFAULT now(),
  body text NOT NULL, status text NOT NULL DEFAULT 'pending',
  response_message text, internal_note text, responded_by text, responded_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  category text NOT NULL, budgeted numeric NOT NULL DEFAULT 0, actual numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  description text NOT NULL, qty numeric NOT NULL DEFAULT 1, unit_rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  paid_on date NOT NULL, amount numeric NOT NULL DEFAULT 0, method text,
  kind text NOT NULL DEFAULT 'payment', note text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  title text NOT NULL, reported_by text, priority text NOT NULL DEFAULT 'normal',
  assigned_to text, status text NOT NULL DEFAULT 'open', notes text,
  created_at timestamptz DEFAULT now(), resolved_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'setup', title text NOT NULL, is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  day_date date, time_label text, title text NOT NULL, location text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  overall numeric, accommodations numeric, food numeric, communication numeric,
  comment text, returning_status text, received_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retreat_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  retreat_id uuid NOT NULL REFERENCES retreats(id) ON DELETE CASCADE,
  reminder_type text, message text, sent_by text, sent_at timestamptz DEFAULT now()
);

DO $$
DECLARE t text;
DECLARE tabs text[] := ARRAY['retreat_documents','retreat_meals','retreat_change_requests','retreat_costs','retreat_charges','retreat_payments','retreat_issues','retreat_checklist','retreat_schedule_items','retreat_feedback','retreat_reminders'];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(retreat_id)', t||'_retreat_id_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(camp_id)', t||'_camp_id_idx', t);
    EXECUTE format('CREATE POLICY "members_select_%s" ON %I FOR SELECT USING (is_camp_member(camp_id))', t, t);
    EXECUTE format('CREATE POLICY "staff_manage_%s" ON %I FOR ALL USING (is_camp_member(camp_id) AND get_camp_role(camp_id) IN (''admin'',''staff'')) WITH CHECK (is_camp_member(camp_id) AND get_camp_role(camp_id) IN (''admin'',''staff''))', t, t);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=t AND column_name='updated_at') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', 'trg_'||t||'_updated_at', t);
    END IF;
  END LOOP;
END $$;
