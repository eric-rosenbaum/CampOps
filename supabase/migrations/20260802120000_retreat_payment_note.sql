-- Camp-level default payment/banking instructions for retreat invoices, so the camp fills it in
-- once (e.g. "Zelle billing@camp.org or ACH acct 12345") and every invoice note prefills with it.
ALTER TABLE camps ADD COLUMN IF NOT EXISTS retreat_payment_note text;
