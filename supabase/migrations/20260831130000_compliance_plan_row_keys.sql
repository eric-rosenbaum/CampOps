-- Pin each plan component to the row it fills on DOH-2040, and drop one we invented.
--
-- TWO BUGS, ONE CAUSE: a fuzzy join between two curated data sets.
--
-- 1. planChecklistValues() matched a component to its checklist row by slugifying the title.
--    The slugifier collapses "&" to a single underscore; the coordinate map spells it out. So
--    seven components never matched, and a camp that had WRITTEN those sections printed blank
--    rows on the checklist it files:
--
--      Alarm System & Smoke Detectors        Exits & Exit Signs
--      Illness, Injury & Abuse Reporting     Off-Site & Wilderness Swimming
--      Child Abuse Recognition & Reporting   Reporting of Illness & Injury Incidents
--      Fire Drills & Evacuation
--
--    Under-reporting a camp's own work on a government form is about the worst failure this
--    module has. Fixing the slugifier would have fixed these seven and left the next mismatch
--    to be discovered by a camp. The link is explicit data now, and the code no longer guesses.
--
-- 2. ACT-18 "Waterfront Swimming Supervision" is not a DOH-2040 component. The state form's
--    activities list has Swimming, Off-Site & Wilderness Swimming, and Waterfront Facility
--    Maintenance, and stops there. We added a row New York does not ask for, which means a camp
--    would have written a section no reviewer has a place for. Its subject is already covered by
--    ACT-07 and FAC-08, so it is removed rather than remapped.

alter table compliance_plan_templates
  add column if not exists form_row_key text;

comment on column compliance_plan_templates.form_row_key is
  'The checklist row this component fills, as spelled in the coordinate map. Explicit because deriving it from the title silently lost seven components.';

update compliance_plan_templates set form_row_key = 'row_personnel_chain_of_command' where code = 'PERS-01';
update compliance_plan_templates set form_row_key = 'row_personnel_job_description' where code = 'PERS-02';
update compliance_plan_templates set form_row_key = 'row_personnel_qualification_reference_verification' where code = 'PERS-03';
update compliance_plan_templates set form_row_key = 'row_facility_operation_water_supply' where code = 'FAC-01';
update compliance_plan_templates set form_row_key = 'row_facility_operation_on_site_sewage_treatment_system_s' where code = 'FAC-02';
update compliance_plan_templates set form_row_key = 'row_facility_operation_lightning_risk_assessment' where code = 'FAC-03';
update compliance_plan_templates set form_row_key = 'row_facility_operation_transportation' where code = 'FAC-04';
update compliance_plan_templates set form_row_key = 'row_facility_operation_housing' where code = 'FAC-05';
update compliance_plan_templates set form_row_key = 'row_facility_operation_food_protection' where code = 'FAC-06';
update compliance_plan_templates set form_row_key = 'row_facility_operation_general_operation_maintenance' where code = 'FAC-07';
update compliance_plan_templates set form_row_key = 'row_facility_operation_waterfront_facility_maintenance' where code = 'FAC-08';
update compliance_plan_templates set form_row_key = 'row_fire_safety_evacuation_plans_assembly_area' where code = 'FIRE-01';
update compliance_plan_templates set form_row_key = 'row_fire_safety_fire_prevention' where code = 'FIRE-02';
update compliance_plan_templates set form_row_key = 'row_fire_safety_electrical_safety' where code = 'FIRE-03';
update compliance_plan_templates set form_row_key = 'row_fire_safety_alarm_system_and_smoke_detectors' where code = 'FIRE-04';
update compliance_plan_templates set form_row_key = 'row_fire_safety_fire_extinguishers' where code = 'FIRE-05';
update compliance_plan_templates set form_row_key = 'row_fire_safety_exits_and_exit_signs' where code = 'FIRE-06';
update compliance_plan_templates set form_row_key = 'row_fire_safety_fire_drills_and_log' where code = 'FIRE-07';
update compliance_plan_templates set form_row_key = 'row_fire_safety_submitted_to_local_fire_department' where code = 'FIRE-08';
update compliance_plan_templates set form_row_key = 'row_medical_plan_duties_of_health_director_personnel' where code = 'MED-01';
update compliance_plan_templates set form_row_key = 'row_medical_plan_camp_infirmary_description' where code = 'MED-02';
update compliance_plan_templates set form_row_key = 'row_medical_plan_medication_storage_administration' where code = 'MED-03';
update compliance_plan_templates set form_row_key = 'row_medical_plan_universal_precautions' where code = 'MED-04';
update compliance_plan_templates set form_row_key = 'row_medical_plan_routine_health_care_surveillance' where code = 'MED-05';
update compliance_plan_templates set form_row_key = 'row_medical_plan_emergency_outbreak_procedures' where code = 'MED-06';
update compliance_plan_templates set form_row_key = 'row_medical_plan_camper_medical_history_screening' where code = 'MED-07';
update compliance_plan_templates set form_row_key = 'row_medical_plan_existing_health_conditions_restrictions' where code = 'MED-08';
update compliance_plan_templates set form_row_key = 'row_medical_plan_medical_log' where code = 'MED-09';
update compliance_plan_templates set form_row_key = 'row_medical_plan_illness_injury_and_abuse_reporting' where code = 'MED-10';
update compliance_plan_templates set form_row_key = 'row_medical_plan_camp_sanitation' where code = 'MED-11';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_general_supervision_discipline' where code = 'ACT-01';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_passive_activity_supervision' where code = 'ACT-02';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_supervision_during_rest_sleep_time' where code = 'ACT-03';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_between_activity_supervision' where code = 'ACT-04';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_supervision_during_transportation' where code = 'ACT-05';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_supervision_in_emergencies' where code = 'ACT-06';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_swimming' where code = 'ACT-07';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_buddy_system' where code = 'ACT-08';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_off_site_and_wilderness_swimming' where code = 'ACT-09';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_stream_crossing_incidental_immersion' where code = 'ACT-10';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_boating' where code = 'ACT-11';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_horseback_riding' where code = 'ACT-12';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_rope_challenge_course' where code = 'ACT-13';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_archery' where code = 'ACT-14';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_riflery' where code = 'ACT-15';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_out_of_camp_trips' where code = 'ACT-16';
update compliance_plan_templates set form_row_key = 'row_activities_supervision_other_activity_plans' where code = 'ACT-17';
update compliance_plan_templates set form_row_key = 'row_staff_training_outline_of_curriculum' where code = 'TRN-01';
update compliance_plan_templates set form_row_key = 'row_staff_training_tour_of_camp' where code = 'TRN-02';
update compliance_plan_templates set form_row_key = 'row_staff_training_description_of_camp_hazards' where code = 'TRN-03';
update compliance_plan_templates set form_row_key = 'row_staff_training_chain_of_command' where code = 'TRN-04';
update compliance_plan_templates set form_row_key = 'row_staff_training_supervision_and_discipline' where code = 'TRN-05';
update compliance_plan_templates set form_row_key = 'row_staff_training_child_abuse_recognition_and_reporting' where code = 'TRN-06';
update compliance_plan_templates set form_row_key = 'row_staff_training_first_aid_emergency_medical_response' where code = 'TRN-07';
update compliance_plan_templates set form_row_key = 'row_staff_training_injury_and_illness_reporting' where code = 'TRN-08';
update compliance_plan_templates set form_row_key = 'row_staff_training_buddy_system' where code = 'TRN-09';
update compliance_plan_templates set form_row_key = 'row_staff_training_lost_swimmer_plan' where code = 'TRN-10';
update compliance_plan_templates set form_row_key = 'row_staff_training_lost_camper_plan' where code = 'TRN-11';
update compliance_plan_templates set form_row_key = 'row_staff_training_out_of_camp_trips' where code = 'TRN-12';
update compliance_plan_templates set form_row_key = 'row_staff_training_lightning_plan' where code = 'TRN-13';
update compliance_plan_templates set form_row_key = 'row_staff_training_fire_safety_fire_drill_procedures' where code = 'TRN-14';
update compliance_plan_templates set form_row_key = 'row_staff_training_camp_evacuation_procedures' where code = 'TRN-15';
update compliance_plan_templates set form_row_key = 'row_staff_training_activity_specific_training' where code = 'TRN-16';
update compliance_plan_templates set form_row_key = 'row_staff_training_training_attendance_documentation' where code = 'TRN-17';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_outline_of_curriculum' where code = 'ORI-01';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_tour_of_camp' where code = 'ORI-02';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_description_of_camp_hazards' where code = 'ORI-03';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_reporting_of_illness_and_injury_incidents' where code = 'ORI-04';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_buddy_system' where code = 'ORI-05';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_lost_camper_plan' where code = 'ORI-06';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_fire_drills_and_evacuation' where code = 'ORI-07';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_out_of_camp_trips' where code = 'ORI-08';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_lightning_plan' where code = 'ORI-09';
update compliance_plan_templates set form_row_key = 'row_camper_orientation_orientation_attendance_documentation' where code = 'ORI-10';
update compliance_plan_templates set form_row_key = 'row_table_of_contents' where code = 'TOC';
-- Not a component of DOH-2040. Removed from the catalog and from any camp that had it laid
-- down; no camp has written into it.
delete from compliance_plan_sections where section_code = 'ACT-18';
delete from compliance_plan_templates where code = 'ACT-18';
