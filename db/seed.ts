import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from '../server/src/adapters/postgres';

const seedSummary = [
  'Khối Nội bộ → Nhóm → Thành viên/Trưởng nhóm kiểm soát duyệt',
  'Cơ cấu Hội sở → Cụm địa bàn → Chi nhánh 635 → Phòng/PGD → Cán bộ',
  'Cụm chỉ dùng để nhóm địa bàn; tài khoản Kiểm soát chi nhánh có BRANCH scope và chuyển phê duyệt HT tại Chi nhánh',
  'Tài khoản admin local PostgreSQL và quyền ADMIN/ALL',
  'Kênh AUDIT_BGS bản published v1',
];

export async function seed(options: { dryRun?: boolean } = {}): Promise<void> {
  if (options.dryRun) {
    console.log('Seed dry-run (không ghi database):');
    for (const item of seedSummary) console.log(`- ${item}`);
    return;
  }

  await withTransaction(async client => {
    await client.query(`
      INSERT INTO org_units(id, code, name, type, parent_id)
      VALUES
        ('00000000-0000-4000-8000-000000000001', 'HO_AUDIT', 'Ban Kiểm Toán Nội Bộ & Hội Sở', 'HEAD_OFFICE', NULL),
        ('00000000-0000-4000-8000-000000000002', 'CUM_TAY_NGUYEN', 'Cụm Tây Nguyên', 'CLUSTER', '00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000003', '635', 'Chi nhánh Nam Buôn Hồ', 'BRANCH', '00000000-0000-4000-8000-000000000002'),
        ('00000000-0000-4000-8000-000000000004', '635-QLKH1', 'Phòng QLKH 1', 'DEPARTMENT', '00000000-0000-4000-8000-000000000003'),
        ('00000000-0000-4000-8000-000000000005', '635-PGD-NBH1', 'PGD Nam Buôn Hồ 1', 'DEPARTMENT', '00000000-0000-4000-8000-000000000003'),
        ('00000000-0000-4000-8000-000000000006', '635-KSCN', 'Phòng Kiểm soát chi nhánh', 'DEPARTMENT', '00000000-0000-4000-8000-000000000003'),
        ('00000000-0000-4000-8000-000000000007', 'TEAM_CREDIT_AUDIT_01', 'Nhóm Kiểm toán Tín dụng 01', 'INTERNAL_TEAM', '00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000008', 'TEAM_COMPLIANCE_01', 'Nhóm Giám sát Tuân thủ 01', 'INTERNAL_TEAM', '00000000-0000-4000-8000-000000000001')
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        parent_id = EXCLUDED.parent_id,
        updated_at = NOW()
    `);

    await client.query(`
      INSERT INTO app_users(id, username, email, full_name, portal, primary_role, org_unit_id, is_active)
      VALUES (
        '10000000-0000-4000-8000-000000000001',
        'admin.hethong',
        'admin@bank.com.vn',
        'Nguyễn Quản Trị',
        'INTERNAL',
        'ADMIN',
        '00000000-0000-4000-8000-000000000001',
        TRUE
      )
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        is_active = TRUE,
        updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO user_role_assignments(user_id, role)
      VALUES ('10000000-0000-4000-8000-000000000001', 'ADMIN')
      ON CONFLICT (user_id, role) DO NOTHING
    `);
    await client.query(`
      INSERT INTO app_users(id, username, email, full_name, portal, primary_role, org_unit_id, is_active)
      VALUES (
        '10000000-0000-4000-8000-000000000002',
        'kiemsoat.cn635',
        'kiemsoat.635@bank.com.vn',
        'Kiểm soát Chi nhánh Nam Buôn Hồ',
        'BRANCH',
        'BRANCH_CONTROLLER',
        '00000000-0000-4000-8000-000000000006',
        TRUE
      )
      ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, org_unit_id = EXCLUDED.org_unit_id, is_active = TRUE, updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO user_role_assignments(user_id, role)
      VALUES ('10000000-0000-4000-8000-000000000002', 'BRANCH_CONTROLLER')
      ON CONFLICT (user_id, role) DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_data_scopes(user_id, scope_type, org_unit_id)
      VALUES ('10000000-0000-4000-8000-000000000002', 'BRANCH', '00000000-0000-4000-8000-000000000003')
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_data_scopes(user_id, scope_type, org_unit_id)
      VALUES ('10000000-0000-4000-8000-000000000001', 'ALL', NULL)
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      INSERT INTO app_users(id, username, email, full_name, portal, primary_role, org_unit_id, team_role, is_active)
      VALUES
        (
          '10000000-0000-4000-8000-000000000003',
          'kiemtoan.truong',
          'supervisor.audit@bank.com.vn',
          'Trần Lãnh Đạo (Giám Đốc Ban Kiểm Toán)',
          'INTERNAL',
          'SUPERVISOR',
          '00000000-0000-4000-8000-000000000007',
          'LEAD',
          TRUE
        ),
        (
          '10000000-0000-4000-8000-000000000004',
          'kiemtoan.vien1',
          'auditor1@bank.com.vn',
          'Lê Cán Bộ Kiểm Tra',
          'INTERNAL',
          'INTERNAL_OFFICER',
          '00000000-0000-4000-8000-000000000007',
          'MEMBER',
          TRUE
        )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        primary_role = EXCLUDED.primary_role,
        org_unit_id = EXCLUDED.org_unit_id,
        team_role = EXCLUDED.team_role,
        is_active = TRUE,
        updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO user_role_assignments(user_id, role)
      VALUES
        ('10000000-0000-4000-8000-000000000003', 'SUPERVISOR'),
        ('10000000-0000-4000-8000-000000000003', 'INTERNAL_APPROVER'),
        ('10000000-0000-4000-8000-000000000004', 'INTERNAL_OFFICER')
      ON CONFLICT (user_id, role) DO NOTHING
    `);
    await client.query(`
      INSERT INTO user_data_scopes(user_id, scope_type, org_unit_id)
      VALUES
        ('10000000-0000-4000-8000-000000000003', 'ALL', NULL),
        ('10000000-0000-4000-8000-000000000004', 'ALL', NULL)
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      UPDATE org_units
      SET leader_user_id = '10000000-0000-4000-8000-000000000003', updated_at = NOW()
      WHERE id = '00000000-0000-4000-8000-000000000007'
    `);

    await client.query(`
      INSERT INTO report_channels(
        id, code, name, description, category, issuing_department, input_methods, is_active
      ) VALUES (
        '20000000-0000-4000-8000-000000000001',
        'AUDIT_BGS',
        'Kiểm toán Tín dụng & Sai sót BGS Thường xuyên',
        'Kênh P0 Audit BGS',
        'REGULAR_AUDIT',
        'Ban Kiểm toán Nội bộ',
        ARRAY['EXCEL_IMPORT', 'WEB_FORM'],
        TRUE
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO channel_versions(
        id, channel_id, version_number, status, schema_config, workflow_config, sla_config,
        published_by, published_at
      ) VALUES (
        '21000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        1,
        'PUBLISHED',
        '{"coreFields":["cif","branchCode","errorCode"]}'::jsonb,
        '{"type":"TWO_TIER"}'::jsonb,
        '{"timezone":"Asia/Ho_Chi_Minh","defaultDays":15}'::jsonb,
        '10000000-0000-4000-8000-000000000001',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      UPDATE report_channels
      SET current_version_id = '21000000-0000-4000-8000-000000000001', updated_at = NOW()
      WHERE id = '20000000-0000-4000-8000-000000000001'
    `);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  seed({ dryRun })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
