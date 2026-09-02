-- Clear actionable Supabase Advisor findings while preserving the backend-only access model.

-- InitPlan warnings: evaluate the transaction-local setting once per statement.
DROP POLICY IF EXISTS backend_app_state_access ON public.app_state_snapshots;
CREATE POLICY backend_app_state_snapshots_access ON public.app_state_snapshots
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');

DROP POLICY IF EXISTS backend_report_catalog_access ON public.report_catalog_configurations;
CREATE POLICY backend_report_catalog_configurations_access ON public.report_catalog_configurations
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');

DROP POLICY IF EXISTS backend_finding_follows_access ON public.finding_follows;
CREATE POLICY backend_finding_follows_access ON public.finding_follows
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');

DROP POLICY IF EXISTS backend_workspace_accepted_access ON public.workspace_accepted_targets;
CREATE POLICY backend_workspace_accepted_targets_access ON public.workspace_accepted_targets
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');

-- Pin search_path on trigger and helper functions so SECURITY DEFINER resolution cannot be
-- influenced by a caller-created object. rls_auto_enable is a migration helper only; the app does
-- not call it, so its execution privilege is removed from every public client role.
DO $$
DECLARE
  function_name TEXT;
  function_signature REGPROCEDURE;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.prevent_audit_modification()',
    'public.audit_modification()',
    'public.prevent_workflow_events_modification()',
    'public.prevent_workflow_event_ledger_modification()',
    'public.rls_auto_enable()'
  ] LOOP
    function_signature := to_regprocedure(function_name);
    IF function_signature IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', function_signature);
      IF function_name = 'public.rls_auto_enable()' THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_signature);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_signature);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_signature);
        END IF;
      END IF;
    END IF;
  END LOOP;
END
$$;

-- Every public table is intentionally inaccessible to Supabase client roles. Explicit deny
-- policies make that contract visible to the advisor while leaving the backend transaction policy
-- above as the only allow path for the application connection.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    FOR table_name IN
      SELECT c.relname
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
      EXECUTE format('DROP POLICY IF EXISTS client_deny_all ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY client_deny_all ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        table_name
      );
    END LOOP;
  END IF;
END
$$;

-- PostgreSQL 15+ supports security_invoker views. Apply it only when the legacy view exists;
-- its definition is managed outside this repository, so do not replace its columns blindly.
DO $$
BEGIN
  IF current_setting('server_version_num')::INTEGER >= 150000
     AND EXISTS (
       SELECT 1
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'org_hierarchy_v' AND c.relkind = 'v'
     ) THEN
    EXECUTE 'ALTER VIEW public.org_hierarchy_v SET (security_invoker = true)';
  END IF;
END
$$;
