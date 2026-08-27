import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const headers = { 'x-user-id': 'user-admin' };
let createdId = '';

const payload = {
  code: 'REPORT_CONFIG_TEST',
  name: 'Loại báo cáo cấu hình kiểm thử',
  description: 'Kiểm thử vòng đời cấu hình.',
  category: 'THEMATIC_AUDIT',
  icon: 'FileSpreadsheet',
  badgeColor: 'teal',
  inputMethods: ['WEB_FORM'],
  issuingDepartment: 'Ban Kiểm toán Nội bộ',
  isActive: true,
  schemaConfig: { tableName: 'report_config_test', excelHeaderRowIndex: 1, dataStartRowIndex: 2, fields: [
    { fieldKey: 'noi_dung_rieng', label: 'Nội dung riêng', dataType: 'string', isRequired: true, excelHeaderAliases: [], displayOrder: 1, showInTableGrid: true },
  ], formTemplate: { name: 'Mẫu kiểm thử', source: 'MANUAL', blocks: [
    { id: 'section-test', type: 'SECTION', title: 'Thông tin kiểm thử', width: 'FULL' },
    { id: 'field-test', type: 'FIELD', fieldKey: 'noi_dung_rieng', width: 'HALF' },
  ] } },
  workflowConfig: {
    id: 'wf-report-config-test', channelId: '', workflowType: 'ONE_TIER',
    stages: [
      { stageId: 'branch', stageName: 'Chi nhánh khắc phục', statusCode: 'PENDING', allowedRoles: ['BRANCH_INPUT'], availableButtons: [] },
      { stageId: 'head-office', stageName: 'Phê duyệt HT', statusCode: 'SUBMITTED_INTERNAL', allowedRoles: ['INTERNAL_APPROVER'], availableButtons: [] },
    ],
  },
  slaConfig: { defaultDays: 12, highRiskDays: 5, mediumRiskDays: 12, lowRiskDays: 20, escalationAfterDaysOverdue: 2, reminderDaysBefore: [3, 1] },
  integrationConfig: {
    googleSheets: { enabled: true, spreadsheetId: 'sheet-test', sheetName: 'AuditBGS', syncMode: 'UPSERT' },
    email: { enabled: true, sendOnSubmission: true, sendBeforeDeadline: true, sendWhenOverdue: true, sendTime: '08:30', recipientRoles: ['INTERNAL_APPROVER'], additionalRecipients: ['audit@example.com'], subjectTemplate: '[Audit BGS] {{reportName}}' },
  },
};

describe('report type configuration API', () => {
  afterAll(async () => { await app.close(); });

  it('creates, versions and deletes an unused report type', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/v1/admin/channels', headers, payload });
    expect(created.statusCode).toBe(200);
    createdId = created.json().id;
    expect(created.json()).toMatchObject({ code: payload.code, configVersion: 1, slaConfig: { defaultDays: 12 }, schemaConfig: { formTemplate: { name: 'Mẫu kiểm thử', blocks: [{ type: 'SECTION' }, { type: 'FIELD', fieldKey: 'noi_dung_rieng' }] } } });

    const updated = await app.inject({ method: 'PATCH', url: `/api/v1/admin/channels/${createdId}`, headers, payload: { slaConfig: { ...payload.slaConfig, defaultDays: 9 } } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ configVersion: 2, slaConfig: { defaultDays: 9 } });

    const versions = await app.inject({ method: 'GET', url: `/api/v1/admin/channels/${createdId}/versions`, headers });
    expect(versions.statusCode).toBe(200);
    expect(versions.json()).toHaveLength(2);
    expect(versions.json()[0].snapshot.schemaConfig.formTemplate.name).toBe('Mẫu kiểm thử');

    const readiness = await app.inject({ method: 'GET', url: `/api/v1/admin/channels/${createdId}/integration-readiness`, headers });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({ googleSheets: { configured: expect.any(Boolean) }, email: { configured: expect.any(Boolean) } });

    const spreadsheet = await app.inject({
      method: 'POST', url: '/api/v1/admin/report-spreadsheets', headers,
      payload: { reportName: payload.name, sheetName: 'AuditBGS', columns: [{ key: 'noi_dung_rieng', label: 'Nội dung riêng' }] },
    });
    expect(spreadsheet.statusCode).toBe(503);
    expect(spreadsheet.json()).toMatchObject({ code: 'GOOGLE_DRIVE_ADAPTER_NOT_READY' });

    const invalidForm = await app.inject({ method: 'POST', url: '/api/v1/findings', headers, payload: {
      channelId: createdId,
      cif: 'CFG-001', customerName: 'Khách hàng cấu hình', clusterName: 'Cụm Tây Nguyên',
      branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', errorCode: 'CFG.01',
      errorTitle: 'Thiếu trường động', description: 'Hồ sơ không nhập trường bắt buộc.', exposureAmount: 0,
    } });
    expect(invalidForm.statusCode).toBe(422);
    expect(invalidForm.json()).toMatchObject({ code: 'DYNAMIC_FORM_INVALID' });

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/admin/channels/${createdId}`, headers });
    expect(removed.statusCode).toBe(204);
  });

  it('rejects invalid creation and protects report types referenced by findings', async () => {
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/admin/channels', headers, payload: { code: 'X' } });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const protectedDelete = await app.inject({ method: 'DELETE', url: '/api/v1/admin/channels/chan-audit-bgs', headers });
    expect(protectedDelete.statusCode).toBe(409);
    expect(protectedDelete.json()).toMatchObject({ code: 'REPORT_TYPE_IN_USE' });
  });

  it('allows a Hội sở officer to create and remove an unused report type', async () => {
    const officerHeaders = { 'x-user-id': 'user-internal-officer' };
    const created = await app.inject({
      method: 'POST', url: '/api/v1/admin/channels', headers: officerHeaders,
      payload: { ...payload, code: 'REPORT_HO_PERMISSION_TEST', name: 'Loại báo cáo do Hội sở cấu hình' },
    });
    expect(created.statusCode, created.body).toBe(200);
    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/admin/channels/${created.json().id}`, headers: officerHeaders });
    expect(removed.statusCode, removed.body).toBe(204);
  });

  it('uses the pinned report version to allow a form-only workflow without evidence', async () => {
    const noEvidencePayload = {
      ...payload,
      code: 'REPORT_FORM_ONLY_TEST',
      name: 'Báo cáo giải trình trên form',
      schemaConfig: {
        ...payload.schemaConfig,
        tableName: 'report_form_only_test',
        formTemplate: {
          ...payload.schemaConfig.formTemplate,
          presentationMode: 'EXCEL_GRID',
          allowEvidenceAttachments: false,
        },
      },
    };
    const channel = await app.inject({ method: 'POST', url: '/api/v1/admin/channels', headers, payload: noEvidencePayload });
    expect(channel.statusCode).toBe(200);

    const created = await app.inject({ method: 'POST', url: '/api/v1/findings', headers, payload: {
      channelId: channel.json().id,
      cif: 'FORM-ONLY-001', customerName: 'Khách hàng giải trình form', clusterName: 'Cụm Tây Nguyên',
      branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', errorCode: 'FORM.01',
      errorTitle: 'Giải trình không dùng tệp', description: 'Nhập toàn bộ căn cứ trên bảng dữ liệu.', exposureAmount: 0,
      customPayload: { noi_dung_rieng: 'Đã giải trình trực tiếp trên form.' },
    } });
    expect(created.statusCode).toBe(200);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/findings/${created.json().id}/actions/submit-branch`,
      headers: { 'x-user-id': 'user-branch-635', 'idempotency-key': 'form-only-submit-01' },
      payload: { expectedVersion: 1, resolutionNotes: 'Đã hoàn tất nội dung giải trình trực tiếp.' },
    });
    expect(submitted.statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/api/v1/findings/${created.json().id}`, headers: { 'x-user-id': 'user-branch-635' } });
    expect(detail.json()).toMatchObject({ evidenceRequired: false, presentationMode: 'EXCEL_GRID' });
  });
});
