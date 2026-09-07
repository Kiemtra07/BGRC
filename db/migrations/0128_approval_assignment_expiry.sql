-- A delegated approval can be temporary. Expiry is enforced by the workflow guard and retained
-- in the append-only history, so an expired assignee cannot silently approve an in-flight finding.
ALTER TABLE public.approval_assignment_history
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

ALTER TABLE public.approval_assignment_history
  DROP CONSTRAINT IF EXISTS approval_assignment_history_valid_until_after_assigned;
ALTER TABLE public.approval_assignment_history
  ADD CONSTRAINT approval_assignment_history_valid_until_after_assigned
  CHECK (valid_until IS NULL OR valid_until > assigned_at);

CREATE INDEX IF NOT EXISTS approval_assignment_history_active_expiry_idx
  ON public.approval_assignment_history(valid_until)
  WHERE valid_until IS NOT NULL;
