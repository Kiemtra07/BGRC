-- 0090_rls_all_public_tables.sql
-- Đóng lại toàn bộ bảng nghiệp vụ trước các role tự động của Supabase.
--
-- Bối cảnh: 0080 mới chỉ khoá 4 bảng (app_state_snapshots, report_catalog_configurations,
-- finding_follows, workspace_accepted_targets). Những bảng còn lại — trong đó có user_credentials
-- (cột password_hash), app_users, auth_sessions, findings, evidence_objects — vẫn nằm trần trong
-- schema `public`. Supabase tự expose mọi bảng `public` qua PostgREST và mặc định cấp quyền cho
-- role `anon`/`authenticated`; anon key không phải bí mật, nên đây là đường đọc thẳng dữ liệu
-- không cần đăng nhập. `db:seed` có ghi thật vào app_users, user_data_scopes,
-- user_role_assignments, org_units, report_channels và channel_versions.
--
-- Cách khoá ở đây khác 0080 một điểm có chủ đích: dùng ENABLE ROW LEVEL SECURITY chứ KHÔNG dùng
-- FORCE. Backend runtime chỉ đọc/ghi app_state_snapshots (đã có policy riêng ở 0080); các bảng
-- dưới đây chỉ được chạm tới bởi db/migrate.ts và db/seed.ts, và hai script đó không set
-- `app.runtime_role`. FORCE sẽ áp RLS lên cả chủ sở hữu bảng và làm hỏng seeding, trong khi
-- ENABLE (không FORCE) + không policy nào đã chặn sạch mọi role không phải chủ sở hữu — đúng
-- những gì cần với anon/authenticated. REVOKE bên dưới mới là lớp kiểm soát chính; RLS là lớp
-- phòng thủ thứ hai phòng khi ai đó cấp lại quyền bằng tay.

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
  END LOOP;
END
$$;

-- PUBLIC là role giả bao trùm mọi role trong cụm; thu hồi ở đây chặn cả các role sinh sau.
DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOR target_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', target_table);
  END LOOP;
END
$$;

-- anon/authenticated chỉ tồn tại trên Supabase. Trên Postgres thuần thì bỏ qua, không coi là lỗi.
DO $$
DECLARE
  supabase_role TEXT;
BEGIN
  FOREACH supabase_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = supabase_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', supabase_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', supabase_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', supabase_role);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', supabase_role);
      -- Bảng tạo về sau cũng không được tự động cấp lại quyền.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', supabase_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', supabase_role);
    END IF;
  END LOOP;
END
$$;
