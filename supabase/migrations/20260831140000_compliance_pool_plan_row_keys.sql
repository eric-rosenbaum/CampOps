-- Pin each bathing-facility plan component to its row on DOH-2286.
--
-- Same reason as the camp plan: explicit rather than derived. Three of these twenty-four do not
-- slugify to their own row -- the form spells them "weather_water_quality",
-- "first_aid_room_area" and "clearing_water_emergency" while the component titles read "Weather
-- and Water Quality", "First Aid Room or Area" and "Clearing the Water in an Emergency". A
-- title-derived join would have dropped those three silently, exactly as it dropped seven
-- components on DOH-2040.
--
-- Every key below was checked against doh-2286.map.json for an operator-owned yes or N/A cell.

update compliance_plan_templates set form_row_key = 'row_chain_of_command_outlined' where code = 'BF-ORG-01';
update compliance_plan_templates set form_row_key = 'row_job_duties_and_descriptions' where code = 'BF-ORG-02';
update compliance_plan_templates set form_row_key = 'row_daily_inspection' where code = 'BF-INJ-01';
update compliance_plan_templates set form_row_key = 'row_rules_and_regulations' where code = 'BF-INJ-02';
update compliance_plan_templates set form_row_key = 'row_diving_safety' where code = 'BF-INJ-03';
update compliance_plan_templates set form_row_key = 'row_deck_slides' where code = 'BF-INJ-04';
update compliance_plan_templates set form_row_key = 'row_weather_water_quality' where code = 'BF-INJ-05';
update compliance_plan_templates set form_row_key = 'row_bather_capacity' where code = 'BF-INJ-06';
update compliance_plan_templates set form_row_key = 'row_supervision' where code = 'BF-INJ-07';
update compliance_plan_templates set form_row_key = 'row_chemical_storage_and_handling' where code = 'BF-INJ-08';
update compliance_plan_templates set form_row_key = 'row_chain_of_command_flow_chart' where code = 'BF-EMG-01';
update compliance_plan_templates set form_row_key = 'row_emergency_phone_numbers' where code = 'BF-EMG-02';
update compliance_plan_templates set form_row_key = 'row_rescue_squad_consulted' where code = 'BF-EMG-03';
update compliance_plan_templates set form_row_key = 'row_emergency_access' where code = 'BF-EMG-04';
update compliance_plan_templates set form_row_key = 'row_evacuation_route' where code = 'BF-EMG-05';
update compliance_plan_templates set form_row_key = 'row_first_aid_equipment' where code = 'BF-EMG-06';
update compliance_plan_templates set form_row_key = 'row_first_aid_room_area' where code = 'BF-EMG-07';
update compliance_plan_templates set form_row_key = 'row_clearing_water_emergency' where code = 'BF-EMG-08';
update compliance_plan_templates set form_row_key = 'row_communication_systems' where code = 'BF-EMG-09';
update compliance_plan_templates set form_row_key = 'row_search_procedures' where code = 'BF-EMG-10';
update compliance_plan_templates set form_row_key = 'row_epileptic_seizures' where code = 'BF-EMG-11';
update compliance_plan_templates set form_row_key = 'row_chlorine_gas_leaks' where code = 'BF-EMG-12';
update compliance_plan_templates set form_row_key = 'row_practice_drills' where code = 'BF-EMG-13';
update compliance_plan_templates set form_row_key = 'row_incident_log' where code = 'BF-EMG-14';