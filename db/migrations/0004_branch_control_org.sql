-- 0004_branch_control_org.sql
-- Cụm chỉ là lớp địa bàn. Quyền kiểm soát/phê duyệt hồ sơ thuộc từng Chi nhánh.

UPDATE app_users
SET primary_role = 'BRANCH_CONTROLLER', updated_at = NOW()
WHERE primary_role = 'CLUSTER_APPROVER';

UPDATE user_role_assignments
SET role = 'BRANCH_CONTROLLER'
WHERE role = 'CLUSTER_APPROVER';

CREATE INDEX IF NOT EXISTS idx_org_units_active_parent_type
  ON org_units(parent_id, type)
  WHERE is_active = TRUE;

CREATE OR REPLACE VIEW org_hierarchy_v AS
SELECT
  cluster.id AS cluster_id,
  cluster.code AS cluster_code,
  cluster.name AS cluster_name,
  branch.id AS branch_id,
  branch.code AS branch_code,
  branch.name AS branch_name,
  department.id AS department_id,
  department.code AS department_code,
  department.name AS department_name
FROM org_units cluster
JOIN org_units branch
  ON branch.parent_id = cluster.id AND branch.type = 'BRANCH'
LEFT JOIN org_units department
  ON department.parent_id = branch.id AND department.type = 'DEPARTMENT'
WHERE cluster.type = 'CLUSTER';
