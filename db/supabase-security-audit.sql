-- Read-only Supabase/PostgreSQL audit. Run in the Supabase SQL editor after migrations.
-- No statement in this file changes schema, data, privileges, or indexes.

-- 1. RLS coverage and whether the client roles have any table privilege.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COALESCE(string_agg(DISTINCT p.policyname, ', ' ORDER BY p.policyname), '') AS policies,
  (has_table_privilege('anon', c.oid, 'SELECT')
   OR has_table_privilege('anon', c.oid, 'INSERT')
   OR has_table_privilege('anon', c.oid, 'UPDATE')
   OR has_table_privilege('anon', c.oid, 'DELETE')) AS anon_table_privilege,
  (has_table_privilege('authenticated', c.oid, 'SELECT')
   OR has_table_privilege('authenticated', c.oid, 'INSERT')
   OR has_table_privilege('authenticated', c.oid, 'UPDATE')
   OR has_table_privilege('authenticated', c.oid, 'DELETE')) AS authenticated_table_privilege
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.oid
ORDER BY c.relname;

-- 2. SECURITY DEFINER routines: every row should have a pinned search_path and least-privilege
-- EXECUTE grants. This catches dashboard-created functions not present in the repository.
SELECT
  n.nspname AS schema_name,
  p.oid::regprocedure AS function_name,
  p.prosecdef AS security_definer,
  COALESCE(array_to_string(p.proconfig, ', '), '') AS function_config,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.oid::regprocedure::text;

-- 3. Views and security_invoker state. A SECURITY DEFINER view needs an explicit business reason;
-- org_hierarchy_v should be security_invoker when it is expected to honor caller RLS.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) AS definition
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- 4. Index evidence. `idx_scan = 0` is not enough to justify dropping an index: inspect after a
-- representative production window and compare each candidate with deployed query plans.
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  i.indisunique,
  i.indisprimary,
  pg_get_indexdef(s.indexrelid) AS index_definition
FROM pg_stat_user_indexes AS s
JOIN pg_index AS i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan ASC, pg_relation_size(s.indexrelid) DESC;
