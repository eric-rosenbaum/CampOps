-- Separate "what goes in the April envelope" from "what an inspector asks to see".
--
-- Twelve Westchester requirements carried the identical evidence hint "Submit with the permit
-- package". That is a filing instruction, not evidence guidance: it says where the thing goes, not
-- what proves it. On the Inspection screen it rendered twelve times in a row and was also simply
-- untrue there -- a sanitarian walking the property does not ask for your $200 cheque.
--
-- So the fact moves to where it belongs, a flag, and each hint now describes the artifact.
alter table compliance_requirements
  add column if not exists in_permit_package boolean not null default false;

update compliance_requirements
   set in_permit_package = true
 where evidence_hint = 'Submit with the permit package';

update compliance_requirements as r set evidence_hint = v.hint
  from (values
    ('WC-01', 'The signed application, and the permit it produces.'),
    ('WC-02', 'The notarised resolution from your board. Only if a corporation owns the camp.'),
    ('WC-03', 'A cheque or money order to Westchester County Health Department, or the credit-card authorisation. Not cash.'),
    ('WC-04', 'C-105.2, U-26.3, SI-12 or CE-200, plus the disability equivalent. An ACORD certificate is refused.'),
    ('WC-05', 'DOH-2271, signed by the camp director.'),
    ('WC-06', 'That the check was run, and when. Never the response.'),
    ('WC-07', 'DOH-367, which we fill from your camp description.'),
    ('WC-08', 'DOH-367a, which we fill from your staff register.'),
    ('WC-09', 'HD-91, listing every amusement device on the property.'),
    ('WC-10', 'The three signed attestations: director, health director, trip leader.'),
    ('WC-11', 'The O.E.M. contact form from the Department of Emergency Services.'),
    ('WC-13', 'The written plan, plus an activity plan for each activity you run.')
  ) as v(code, hint)
 where r.req_code = v.code;
