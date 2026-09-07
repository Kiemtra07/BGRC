-- Lịch sử giao lại tuyến duyệt là audit append-only, tách khỏi JSON snapshot để có thể đối soát
-- độc lập khi snapshot được cutover. event_id dùng chung workflow ledger để retry không nhân dòng.
CREATE TABLE IF NOT EXISTS public.approval_assignment_history (
  event_id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('BRANCH_CONTROLLER', 'BRANCH_LEADER', 'INTERNAL_APPROVER')),
  previous_user_id TEXT,
  assigned_user_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) >= 5),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_assignment_history_finding_idx
  ON public.approval_assignment_history(finding_id, assigned_at, event_id);

SELECT set_config('app.runtime_role', 'backend', true);
ALTER TABLE public.approval_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_assignment_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_approval_assignment_history_access ON public.approval_assignment_history;
CREATE POLICY backend_approval_assignment_history_access
  ON public.approval_assignment_history
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.approval_assignment_history FROM PUBLIC;
