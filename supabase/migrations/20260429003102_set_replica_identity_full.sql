-- Recovered from the live migration ledger (applied out-of-band, no repo file).
-- Realtime subscriptions filter on camp_id; without FULL, a DELETE's old row carries
-- only the primary key and the filter never matches, so deletes are missed.
ALTER TABLE public.issues                  REPLICA IDENTITY FULL;
ALTER TABLE public.issue_activity          REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_tasks         REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_activity      REPLICA IDENTITY FULL;
ALTER TABLE public.pools                   REPLICA IDENTITY FULL;
ALTER TABLE public.pool_chemical_readings  REPLICA IDENTITY FULL;
ALTER TABLE public.pool_equipment          REPLICA IDENTITY FULL;
ALTER TABLE public.pool_service_log        REPLICA IDENTITY FULL;
ALTER TABLE public.pool_inspections        REPLICA IDENTITY FULL;
ALTER TABLE public.pool_inspection_log     REPLICA IDENTITY FULL;
ALTER TABLE public.pool_seasonal_tasks     REPLICA IDENTITY FULL;
ALTER TABLE public.camp_assets             REPLICA IDENTITY FULL;
ALTER TABLE public.asset_checkouts         REPLICA IDENTITY FULL;
ALTER TABLE public.asset_service_records   REPLICA IDENTITY FULL;
ALTER TABLE public.asset_maintenance_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.safety_items            REPLICA IDENTITY FULL;
ALTER TABLE public.safety_inspection_log   REPLICA IDENTITY FULL;
ALTER TABLE public.safety_drills           REPLICA IDENTITY FULL;
ALTER TABLE public.safety_staff            REPLICA IDENTITY FULL;
ALTER TABLE public.staff_certifications    REPLICA IDENTITY FULL;
ALTER TABLE public.safety_temp_logs        REPLICA IDENTITY FULL;
ALTER TABLE public.safety_licenses         REPLICA IDENTITY FULL;
