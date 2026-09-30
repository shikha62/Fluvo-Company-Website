-- ============================================================
-- 20260930_fix_suppression.sql
-- PURPOSE: Remove incorrectly auto-created administrator_suppression
--          records for recipients that were never explicitly suppressed
--          by an admin, and un-stick campaign_recipients rows that are
--          permanently suppressed without a matching suppression_list entry.
--
-- SAFE: Only deletes suppression_list rows that have NO matching
--       explicit admin suppression event in audit_logs.
--       Does NOT delete campaigns, leads, email accounts, or templates.
-- ============================================================

-- Step 1: Remove stale suppression_list entries that have NO corresponding
--         explicit admin suppression audit event. This clears addresses that
--         were auto-inserted by a previous code defect.
--
-- IMPORTANT: Entries explicitly suppressed via the UI (which write a
--            'recipient_suppressed' audit log entry) are preserved.
delete from public.suppression_list sl
where sl.reason = 'administrator_suppression'
  and not exists (
    select 1 from public.audit_logs al
    where al.action = 'recipient_suppressed'
      and al.entity_id = sl.email
  );

-- Step 2: Reset campaign_recipients that are stuck in 'suppressed' status
--         but whose email is no longer in the suppression_list.
--         These recipients will become 'pending' so the next campaign
--         launch can attempt delivery.
update public.campaign_recipients cr
set
  status        = 'pending',
  error_message = null,
  updated_at    = now()
where cr.status = 'suppressed'
  and cr.error_message = 'administrator_suppression'
  and not exists (
    select 1 from public.suppression_list sl
    where lower(sl.email) = lower(cr.recipient_email)
  );
