# Supabase security review

Migration `0111_supabase_security_hardening.sql` addresses the actionable findings shown in the
Supabase Advisor screenshots:

- the four backend state policies evaluate `current_setting` through a scalar subquery, avoiding
  an init-plan warning while keeping the transaction-local backend gate;
- every existing RLS-enabled public table gets an explicit deny policy for `anon` and
  `authenticated`, so client access remains closed but the dashboard no longer reports “RLS
  Enabled No Policy”;
- known trigger/helper functions get `search_path = pg_catalog, public`; the unused
  `rls_auto_enable()` helper loses public execution;
- the legacy `public.org_hierarchy_v` view is switched to `security_invoker` on PostgreSQL 15+ when
  present, without guessing or replacing its externally managed column definition.

The `0110_workflow_event_ledger.sql` migration backfills `workflowEvents` from the primary snapshot
into an immutable text-ID ledger before removing that growing property from the hot JSON state. It
does not write into the older UUID-only `workflow_events` table, because runtime IDs such as
`evt-001`, `find-001`, and `user-branch-428` would not satisfy its UUID/FK constraints.

## Items that should not be “fixed” by deleting blindly

“Unused Index” is an observation from `pg_stat_user_indexes`, not proof that an index is wrong. A
new table, an infrequently used admin route, a failover, or a reset of statistics can all produce
`idx_scan = 0`. Run [`db/supabase-security-audit.sql`](../db/supabase-security-audit.sql), keep
unique/primary indexes, and only remove a candidate after a representative traffic window and an
`EXPLAIN (ANALYZE, BUFFERS)` comparison.

## Apply and verify

This repository has no `DATABASE_URL` in the local environment, so the migrations are prepared and
tested locally but are not applied to the remote Supabase project by this run. Apply the migrations
through the project’s normal migration pipeline or SQL editor, then run the read-only audit script.
The expected checks are:

1. `workflow_event_ledger` contains the old event count and `app_state_snapshots.payload` no longer
   contains `workflowEvents`.
2. An attempted `UPDATE` or `DELETE` on the ledger fails with the immutable-table exception.
3. Backend requests still work in a transaction; direct `anon`/`authenticated` table access stays
   denied.
4. Re-run Supabase Advisor and review any remaining SECURITY DEFINER function or view by its
   definition rather than suppressing the warning.
