import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('campaign administration UI', () => {
  it('exposes campaign assignment, report types and Drive provisioning', () => {
    const source = fs.readFileSync('src/components/admin/campaigns/CampaignManager.tsx', 'utf8');
    expect(source).toContain('Chuyên đề kiểm tra');
    expect(source).toContain('Trưởng đoàn');
    expect(source).toContain('Thành viên');
    expect(source).toContain('Chi nhánh kiểm tra');
    expect(source).toContain('Loại báo cáo áp dụng');
    expect(source).toContain('Tạo kho dữ liệu');
  });

  it('offers campaign context as a reusable report-form block', () => {
    const source = fs.readFileSync('src/components/admin/report-types/FormSchemaEditor.tsx', 'utf8');
    expect(source).toContain('CAMPAIGN_CONTEXT');
    expect(source).toContain('Thông tin chuyên đề');
  });

  it('offers edit, safe delete and document-draft import controls for administrators', () => {
    const campaignSource = fs.readFileSync('src/components/admin/campaigns/CampaignManager.tsx', 'utf8');
    const organizationSource = fs.readFileSync('src/components/admin/OrganizationManager.tsx', 'utf8');
    expect(campaignSource).toContain('Nhập DOCX, PDF hoặc Excel');
    expect(campaignSource).toContain('Sửa chuyên đề');
    expect(campaignSource).toContain('Xóa chuyên đề');
    expect(organizationSource).toContain('Sửa đơn vị');
    expect(organizationSource).toContain('Xóa đơn vị');
  });
});
