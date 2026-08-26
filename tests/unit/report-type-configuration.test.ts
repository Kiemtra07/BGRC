import { describe, expect, it } from 'vitest';
import { CreateReportChannelSchema } from '../../shared/contracts';
import { buildReportTemplateFromExcelRows, extractExcelColumnRules } from '../../src/lib/report-template';

const validConfig = {
  code: 'BAO_CAO_MOI',
  name: 'Báo cáo kiểm thử',
  description: '',
  category: 'THEMATIC_AUDIT',
  icon: 'FileSpreadsheet',
  badgeColor: 'teal',
  inputMethods: ['WEB_FORM'],
  issuingDepartment: 'Ban Kiểm toán Nội bộ',
  isActive: true,
  schemaConfig: {
    tableName: 'bao_cao_moi',
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    fields: [],
  },
  workflowConfig: {
    id: 'wf-new',
    channelId: '',
    workflowType: 'ONE_TIER',
    stages: [
      { stageId: 'branch', stageName: 'Chi nhánh khắc phục', statusCode: 'PENDING', allowedRoles: ['BRANCH_INPUT'], availableButtons: [] },
      { stageId: 'head-office', stageName: 'Phê duyệt HT', statusCode: 'SUBMITTED_INTERNAL', allowedRoles: ['INTERNAL_APPROVER'], availableButtons: [] },
    ],
  },
  slaConfig: { defaultDays: 15, highRiskDays: 7, mediumRiskDays: 15, lowRiskDays: 30, escalationAfterDaysOverdue: 1, reminderDaysBefore: [3, 1] },
  integrationConfig: {
    googleSheets: { enabled: false, sheetName: 'AuditBGS', syncMode: 'APPEND' },
    email: { enabled: false, sendOnSubmission: true, sendBeforeDeadline: true, sendWhenOverdue: true, sendTime: '08:00', recipientRoles: ['INTERNAL_APPROVER'], additionalRecipients: [], subjectTemplate: '[Audit BGS] {{reportName}} - {{status}}' },
  },
};

describe('report type configuration contract', () => {
  it('accepts a complete form, workflow, SLA and integration configuration', () => {
    expect(CreateReportChannelSchema.safeParse(validConfig).success).toBe(true);
  });

  it('rejects duplicate dynamic field keys and invalid select fields', () => {
    const field = { fieldKey: 'ghi_chu', label: 'Ghi chú', dataType: 'select', isRequired: false, excelHeaderAliases: [], displayOrder: 1, showInTableGrid: true };
    const result = CreateReportChannelSchema.safeParse({ ...validConfig, schemaConfig: { ...validConfig.schemaConfig, fields: [field, field] } });
    expect(result.success).toBe(false);
  });

  it('keeps evidence upload outside the initial form', () => {
    const result = CreateReportChannelSchema.safeParse({
      ...validConfig,
      schemaConfig: { ...validConfig.schemaConfig, fields: [{ fieldKey: 'minh_chung', label: 'Minh chứng', dataType: 'file', isRequired: true, excelHeaderAliases: [], displayOrder: 1, showInTableGrid: false }] },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a CMS page template and rejects blocks bound to unknown fields', () => {
    const field = { fieldKey: 'ghi_chu', label: 'Ghi chú', dataType: 'string', isRequired: false, excelHeaderAliases: ['Ghi chú'], displayOrder: 1, showInTableGrid: true };
    const formTemplate = {
      name: 'Mẫu nhập báo cáo', source: 'MANUAL',
      blocks: [
        { id: 'campaign_1', type: 'CAMPAIGN_CONTEXT', title: 'Chuyên đề áp dụng', width: 'FULL' },
        { id: 'section_1', type: 'SECTION', title: 'Thông tin chung', width: 'FULL' },
        { id: 'field_1', type: 'FIELD', fieldKey: 'ghi_chu', width: 'HALF' },
      ],
    };
    expect(CreateReportChannelSchema.safeParse({ ...validConfig, schemaConfig: { ...validConfig.schemaConfig, fields: [field], formTemplate } }).success).toBe(true);
    expect(CreateReportChannelSchema.safeParse({
      ...validConfig,
      schemaConfig: { ...validConfig.schemaConfig, fields: [field], formTemplate: { ...formTemplate, blocks: [{ id: 'field_bad', type: 'FIELD', fieldKey: 'khong_ton_tai', width: 'FULL' }] } },
    }).success).toBe(false);
  });

  it('creates fields, Excel mappings and layout blocks from a workbook sample', () => {
    const result = buildReportTemplateFromExcelRows([
      ['BÁO CÁO KIỂM TRA TÍN DỤNG'],
      ['CIF', 'Tên khách hàng', 'Dư nợ', 'Ngày kiểm tra'],
      ['10482910', 'Công ty Cà Phê', 14500, new Date('2026-08-20')],
    ], 'Mau bao cao tin dung.xlsx');

    expect(result.excelHeaderRowIndex).toBe(2);
    expect(result.dataStartRowIndex).toBe(3);
    expect(result.fields.map(field => field.fieldKey)).toEqual(['cif', 'ten_khach_hang', 'du_no', 'ngay_kiem_tra']);
    expect(result.fields[2]).toMatchObject({ dataType: 'number', excelColumnIndex: 3 });
    expect(result.formTemplate).toMatchObject({ source: 'EXCEL', sourceFileName: 'Mau bao cao tin dung.xlsx' });
    expect(result.formTemplate.blocks.filter(block => block.type === 'FIELD')).toHaveLength(4);
  });

  it('accepts an end-user presentation mode and attachment policy', () => {
    const schemaConfig = { ...validConfig.schemaConfig, formTemplate: {
      name: 'Mẫu giải trình', source: 'MANUAL', presentationMode: 'EXCEL_GRID', allowEvidenceAttachments: false,
      blocks: [],
    } };
    expect(CreateReportChannelSchema.safeParse({ ...validConfig, schemaConfig }).success).toBe(true);
  });

  it('extracts Excel dropdown values and bold header columns', () => {
    const sheetXml = '<worksheet><sheetData><row r="2"><c r="A2" s="1"/><c r="B2" s="0"/></row></sheetData><dataValidations><dataValidation sqref="B3:B99"><formula1>"Đạt,Không đạt,Cần bổ sung"</formula1></dataValidation></dataValidations></worksheet>';
    const stylesXml = '<styleSheet><fonts><font/><font><b/></font></fonts><cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>';
    expect(extractExcelColumnRules(sheetXml, stylesXml, 2)).toEqual({
      1: { emphasized: true, dropdownOptions: undefined },
      2: { emphasized: false, dropdownOptions: ['Đạt', 'Không đạt', 'Cần bổ sung'] },
    });
  });
});
