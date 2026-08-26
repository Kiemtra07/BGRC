-- 0050_user_team_branch_assignments.sql
-- Cụm chỉ là lớp nhóm địa bàn để hiển thị. Không phát sinh vai trò hay bước duyệt cấp Cụm.

ALTER TABLE org_units
  DROP CONSTRAINT IF EXISTS org_units_type_check;

ALTER TABLE org_units
  ADD CONSTRAINT org_units_type_check
  CHECK (type IN ('HEAD_OFFICE', 'INTERNAL_TEAM', 'CLUSTER', 'BRANCH', 'DEPARTMENT'));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS team_role VARCHAR(20);

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_team_role_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_team_role_check
  CHECK (team_role IS NULL OR team_role IN ('MEMBER', 'LEAD'));

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_team_role_portal_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_team_role_portal_check
  CHECK (team_role IS NULL OR portal = 'INTERNAL');

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_internal_team_leader
  ON app_users(org_unit_id)
  WHERE is_active = TRUE AND team_role = 'LEAD';

CREATE INDEX IF NOT EXISTS idx_app_users_portal_org_active
  ON app_users(portal, org_unit_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_data_scopes_user_scope_org
  ON user_data_scopes(user_id, scope_type, org_unit_id);

COMMENT ON COLUMN app_users.team_role IS
  'MEMBER hoặc LEAD khi org_unit_id trỏ tới INTERNAL_TEAM; LEAD là Trưởng nhóm kiểm soát nội bộ.';

COMMENT ON TABLE org_units IS
  'Cây tổ chức: Hội sở → Nhóm nội bộ, hoặc Hội sở → Cụm địa bàn → Chi nhánh → Phòng/PGD. Cụm không có quyền duyệt.';
