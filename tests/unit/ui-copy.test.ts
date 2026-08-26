import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

const activeUiFiles = [
  'src/App.tsx',
  'src/components/portal/FindingDetailPage.tsx',
  'src/components/portal/WorkspaceSidebar.tsx',
  'src/components/evidence/EvidenceViewer.tsx',
  'src/components/ingestion/WebFormFindingModal.tsx',
  'src/components/internal/FastDataIngestion.tsx',
  'src/components/reports/ReportsWorkspace.tsx',
  'src/components/admin/AdminPortal.tsx',
  'src/components/admin/DynamicChannelManager.tsx',
  'src/components/admin/ExcelTemplateImporterModal.tsx',
  'src/components/admin/OrganizationManager.tsx',
  'src/components/admin/UserManager.tsx',
  'src/components/admin/WorkflowBuilder.tsx',
  'src/components/admin/ButtonPermissionMatrix.tsx',
  'src/components/admin/SlaEscalationConfig.tsx',
  'src/components/admin/AuditTrailViewer.tsx',
] as const;

describe('AuditBGS UI copy', () => {
  it('khóa tên trạng thái và nút chuyển cấp trong một từ điển dùng chung', () => {
    const copyPath = resolve(root, 'src/content/ui-copy.ts');
    if (!existsSync(copyPath)) {
      expect.fail('Thiếu src/content/ui-copy.ts');
    }

    const copySource = readFileSync(copyPath, 'utf8');
    expect(copySource).toContain("branchApprove: 'Chuyển phê duyệt HT'");
    expect(copySource).toContain("returnToBranch: 'Trả chi nhánh bổ sung'");
    expect(copySource).toContain("internalApprove: 'Đóng lỗi'");
    expect(copySource).toContain("REJECTED: 'Chi nhánh cần bổ sung'");
  });

  it('hiển thị đúng hành động của từng cấp trên trang hồ sơ', () => {
    const findingDetail = source('src/components/portal/FindingDetailPage.tsx');
    expect(findingDetail).toContain('workflowActionLabels.branchApprove');
    expect(findingDetail).toContain('workflowActionLabels.returnToBranch');
    expect(findingDetail).toContain('workflowActionLabels.internalApprove');
    expect(findingDetail).toContain('workflowEventLabels[event.command]');
    expect(findingDetail).not.toContain('{event.command} ·');
    expect(findingDetail).not.toContain('Đồng ý xử lý lỗi');
    expect(findingDetail).not.toContain('Chuyển trả về');
    expect(findingDetail).not.toContain('Chuyển Khối Nội bộ');
  });

  it('loại chữ kỹ thuật và khẩu hiệu dư thừa khỏi các màn hình đang hoạt động', () => {
    const combinedSource = activeUiFiles
      .filter(relativePath => existsSync(resolve(root, relativePath)))
      .map(source)
      .join('\n');
    const bannedCopy = [
      'Web Form Ingestion',
      'Fast Ingestion Hub',
      'Multi-Excel Batch',
      'WebWorker',
      'Xuất CSV theo key',
      'Từ điển key chuẩn',
      'Admin Control Center',
      'Backend enforced',
      'authoritative local',
      'workflow_events',
      'Local header mock',
      'Nạp Ngay Vào Hệ Thống',
      'Siêu Tốc',
      'Duyệt đẩy',
      'tài khoản local',
      'Tạo và gắn đơn vị',
      'Sinh Kênh Báo Cáo Tự Động',
      'Hệ thống tự nhận diện',
      'Mã Kênh (Channel Code)',
      'Khởi Tạo Kênh Báo Cáo Ngay',
      'Hủy Bỏ',
      'Khối Nội bộ → Nhóm',
      'Mỗi nhóm có Thành viên',
    ];

    for (const copy of bannedCopy) {
      expect(combinedSource, `Không được hiển thị: ${copy}`).not.toContain(copy);
    }
  });

  it('không hiển thị mã kỹ thuật trong trình tạo báo cáo', () => {
    const reports = source('src/components/reports/ReportsWorkspace.tsx');
    expect(reports).not.toContain('>{rule.key}</code>');
    expect(reports).not.toContain('>{metric?.key}</code>');
    expect(reports).not.toContain('title={code}');
    expect(reports).not.toContain('Nhóm ${definition.query.groupBy}');
  });

  it('không hiển thị mã vai trò và sự kiện nội bộ', () => {
    const app = source('src/App.tsx');
    const auditTrail = source('src/components/admin/AuditTrailViewer.tsx');
    expect(app).not.toContain('{user.primaryRole}</option>');
    expect(auditTrail).not.toContain('>{log.eventType}</span>');
    expect(auditTrail).not.toContain('{log.actorRole}</span>');
    expect(auditTrail).not.toContain('>{log.actorRole}</div>');
  });
});
