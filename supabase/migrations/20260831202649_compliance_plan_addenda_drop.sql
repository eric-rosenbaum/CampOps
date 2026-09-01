-- The addenda list moved into planTemplate.ts alongside the questions, for the same reason: it is
-- eleven static rows that change only when the state reissues them. Leaving an empty table behind
-- would just be a place for the two lists to drift apart.
drop table if exists compliance_plan_addenda;
