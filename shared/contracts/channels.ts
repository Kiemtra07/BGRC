import { z } from 'zod';
import { UserRole, WorkflowStatus } from './common';

export type ChannelCategory = 
  | 'REGULAR_AUDIT'
  | 'THEMATIC_AUDIT'
  | 'COMPLIANCE_AML'
  | 'OPERATIONAL_RISK'
  | 'CREDIT_INSPECTION'
  | 'BRANCH_REPORT';

export type FieldDataType = 'string' | 'number' | 'currency' | 'date' | 'select' | 'file' | 'textarea';

export type CoreFieldRole = 
  | 'CUSTOMER_IDENTIFIER'
  | 'ERROR_CODE'
  | 'ERROR_TITLE'
  | 'BRANCH_CODE'
  | 'CLUSTER_NAME'
  | 'EXPOSURE_AMOUNT'
  | 'DEADLINE';

export interface DynamicFieldDefinition {
  fieldKey: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  isSystemCoreField?: boolean;
  coreFieldRole?: CoreFieldRole;
  dropdownOptions?: { label: string; value: string }[];
  excelHeaderAliases: string[];
  displayOrder: number;
  showInTableGrid: boolean;
  helpText?: string;
  excelColumnIndex?: number;
  isEmphasized?: boolean;
}

/**
 * SECTION and SUBSECTION mirror the two heading levels used by the CoPlus inspection records:
 * SECTION renders as a collapsible "A. THÀNH PHẦN" bar, SUBSECTION as "I. THÔNG TIN CHUNG..".
 */
export type ReportFormBlockType = 'CAMPAIGN_CONTEXT' | 'SECTION' | 'SUBSECTION' | 'TEXT' | 'FIELD' | 'FIELD_GROUP' | 'DIVIDER';
export type ReportFormBlockWidth = 'FULL' | 'HALF' | 'THIRD';

export interface ReportFormBlock {
  id: string;
  type: ReportFormBlockType;
  title?: string;
  content?: string;
  fieldKey?: string;
  fieldKeys?: string[];
  width: ReportFormBlockWidth;
}

export interface ReportFormTemplate {
  name: string;
  source: 'MANUAL' | 'EXCEL';
  sourceFileName?: string;
  sheetName?: string;
  presentationMode: 'CASE_REVIEW' | 'EXCEL_GRID' | 'FORM_ONLY';
  allowEvidenceAttachments: boolean;
  blocks: ReportFormBlock[];
}

export interface DynamicSchemaConfig {
  tableName: string;
  fields: DynamicFieldDefinition[];
  excelHeaderRowIndex: number;
  dataStartRowIndex: number;
  formTemplate?: ReportFormTemplate;
}

export interface ButtonActionConfig {
  buttonId: string;
  buttonLabel: string;
  buttonColor: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'slate';
  targetStatusCode: WorkflowStatus;
  allowedRoles: UserRole[];
  requireReasonNotes: boolean;
  requireFileAttachment?: boolean;
  sendEmailNotification: boolean;
  emailRecipientRoles: UserRole[];
}

export interface DynamicWorkflowStage {
  stageId: string;
  stageName: string;
  statusCode: WorkflowStatus;
  allowedRoles: UserRole[];
  availableButtons: ButtonActionConfig[];
  maxExecutionHours?: number;
}

export interface DynamicWorkflowConfig {
  id: string;
  channelId: string;
  workflowType: 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER';
  stages: DynamicWorkflowStage[];
}

export interface DynamicSlaConfig {
  defaultDays: number;
  highRiskDays: number;
  mediumRiskDays: number;
  lowRiskDays: number;
  escalationAfterDaysOverdue: number;
  reminderDaysBefore: number[];
}

export interface GoogleSheetsConfig {
  enabled: boolean;
  spreadsheetId?: string;
  sheetName: string;
  syncMode: 'APPEND' | 'UPSERT';
}

export interface EmailAutomationConfig {
  enabled: boolean;
  sendOnSubmission: boolean;
  sendBeforeDeadline: boolean;
  sendWhenOverdue: boolean;
  sendTime: string;
  recipientRoles: UserRole[];
  additionalRecipients: string[];
  subjectTemplate: string;
}

export interface ReportChannelIntegrationConfig {
  googleSheets: GoogleSheetsConfig;
  email: EmailAutomationConfig;
}

export interface IntegrationReadinessItem {
  configured: boolean;
  message: string;
}

export interface ReportChannelIntegrationReadiness {
  googleSheets: IntegrationReadinessItem;
  email: IntegrationReadinessItem;
}

export interface ReportChannel {
  id: string;
  code: string;
  name: string;
  description: string;
  category: ChannelCategory;
  icon: string;
  badgeColor: string;
  inputMethods: ('EXCEL_IMPORT' | 'WEB_FORM' | 'API')[];
  issuingDepartment: string;
  isActive: boolean;
  configVersion: number;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  
  schemaConfig?: DynamicSchemaConfig;
  workflowConfig?: DynamicWorkflowConfig;
  slaConfig?: DynamicSlaConfig;
  integrationConfig?: ReportChannelIntegrationConfig;
}

export interface ReportChannelVersion {
  id: string;
  channelId: string;
  versionNumber: number;
  snapshot: ReportChannel;
  createdByUserId: string;
  createdAt: string;
}

const UserRoleSchema = z.enum([
  'ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER',
  'BRANCH_CONTROLLER', 'BRANCH_LEADER', 'BRANCH_INPUT', 'VIEWER',
]);

const WorkflowStatusSchema = z.enum([
  'PENDING', 'SUBMITTED_BRANCH', 'SUBMITTED_BRANCH_LEADER', 'SUBMITTED_INTERNAL', 'REJECTED', 'WAIVED_RESOLVED',
]);

export const DynamicFieldDefinitionSchema = z.object({
  fieldKey: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/, 'Mã trường chỉ gồm chữ thường, số và dấu gạch dưới.'),
  label: z.string().trim().min(2).max(150),
  dataType: z.enum(['string', 'number', 'currency', 'date', 'select', 'file', 'textarea']),
  isRequired: z.boolean(),
  isSystemCoreField: z.boolean().optional(),
  coreFieldRole: z.enum([
    'CUSTOMER_IDENTIFIER', 'ERROR_CODE', 'ERROR_TITLE', 'BRANCH_CODE',
    'CLUSTER_NAME', 'EXPOSURE_AMOUNT', 'DEADLINE',
  ]).optional(),
  dropdownOptions: z.array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) })).optional(),
  excelHeaderAliases: z.array(z.string().trim().min(1)).default([]),
  displayOrder: z.number().int().nonnegative(),
  showInTableGrid: z.boolean(),
  helpText: z.string().trim().max(500).optional(),
  excelColumnIndex: z.number().int().min(1).max(1000).optional(),
  isEmphasized: z.boolean().optional(),
}).superRefine((field, context) => {
  if (field.dataType === 'select' && !field.dropdownOptions?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dropdownOptions'], message: 'Trường lựa chọn cần ít nhất một phương án.' });
  }
  if (field.dataType === 'file' && field.isRequired) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['isRequired'], message: 'Tệp minh chứng được tải sau khi tạo hồ sơ nên không thể đặt bắt buộc trong form.' });
  }
});

const ReportFormBlockSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(['CAMPAIGN_CONTEXT', 'SECTION', 'SUBSECTION', 'TEXT', 'FIELD', 'FIELD_GROUP', 'DIVIDER']),
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().max(2000).optional(),
  fieldKey: z.string().trim().optional(),
  fieldKeys: z.array(z.string().trim().min(1)).max(30).optional(),
  width: z.enum(['FULL', 'HALF', 'THIRD']),
}).superRefine((block, context) => {
  if (block.type === 'FIELD' && !block.fieldKey) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldKey'], message: 'Block trường nhập phải gắn với một trường.' });
  if (block.type === 'FIELD_GROUP' && !block.fieldKeys?.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldKeys'], message: 'Nhóm trường phải có ít nhất một trường.' });
});

const ReportFormTemplateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  source: z.enum(['MANUAL', 'EXCEL']),
  sourceFileName: z.string().trim().max(255).optional(),
  sheetName: z.string().trim().max(100).optional(),
  presentationMode: z.enum(['CASE_REVIEW', 'EXCEL_GRID', 'FORM_ONLY']).default('CASE_REVIEW'),
  allowEvidenceAttachments: z.boolean().default(true),
  blocks: z.array(ReportFormBlockSchema).max(150),
});

export const DynamicSchemaConfigSchema = z.object({
  tableName: z.string().trim().min(1).max(100),
  fields: z.array(DynamicFieldDefinitionSchema).max(100),
  excelHeaderRowIndex: z.number().int().min(1).max(100),
  dataStartRowIndex: z.number().int().min(2).max(1000),
  formTemplate: ReportFormTemplateSchema.optional(),
}).superRefine((schema, context) => {
  const keys = schema.fields.map(field => field.fieldKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Mã trường không được trùng nhau.' });
  }
  const coreRoles = schema.fields.flatMap(field => field.coreFieldRole ? [field.coreFieldRole] : []);
  if (new Set(coreRoles).size !== coreRoles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Mỗi trường hệ thống chỉ được ánh xạ một lần.' });
  }
  const blockIds = schema.formTemplate?.blocks.map(block => block.id) ?? [];
  if (new Set(blockIds).size !== blockIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formTemplate', 'blocks'], message: 'Mã block không được trùng nhau.' });
  }
  const knownFields = new Set(keys);
  schema.formTemplate?.blocks.forEach((block, index) => {
    const references = block.type === 'FIELD' ? [block.fieldKey] : block.type === 'FIELD_GROUP' ? block.fieldKeys : [];
    references?.filter(Boolean).forEach(fieldKey => {
      if (!knownFields.has(fieldKey!)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['formTemplate', 'blocks', index], message: 'Block đang gắn với trường không tồn tại.' });
    });
  });
});

const ButtonActionConfigSchema = z.object({
  buttonId: z.string().trim().min(1),
  buttonLabel: z.string().trim().min(2).max(100),
  buttonColor: z.enum(['green', 'red', 'blue', 'amber', 'purple', 'slate']),
  targetStatusCode: WorkflowStatusSchema,
  allowedRoles: z.array(UserRoleSchema).min(1),
  requireReasonNotes: z.boolean(),
  requireFileAttachment: z.boolean().optional(),
  sendEmailNotification: z.boolean(),
  emailRecipientRoles: z.array(UserRoleSchema),
});

const DynamicWorkflowStageSchema = z.object({
  stageId: z.string().trim().min(1),
  stageName: z.string().trim().min(2).max(150),
  statusCode: WorkflowStatusSchema,
  allowedRoles: z.array(UserRoleSchema).min(1),
  availableButtons: z.array(ButtonActionConfigSchema),
  maxExecutionHours: z.number().int().positive().max(8760).optional(),
});

export const DynamicWorkflowConfigSchema = z.object({
  id: z.string().trim().min(1),
  channelId: z.string(),
  workflowType: z.enum(['ONE_TIER', 'TWO_TIER', 'THREE_TIER']),
  stages: z.array(DynamicWorkflowStageSchema).min(2).max(4),
});

export const DynamicSlaConfigSchema = z.object({
  defaultDays: z.number().int().min(1).max(365),
  highRiskDays: z.number().int().min(1).max(365),
  mediumRiskDays: z.number().int().min(1).max(365),
  lowRiskDays: z.number().int().min(1).max(365),
  escalationAfterDaysOverdue: z.number().int().min(0).max(90),
  reminderDaysBefore: z.array(z.number().int().min(0).max(365)).max(20),
});

export const ReportChannelIntegrationConfigSchema = z.object({
  googleSheets: z.object({
    enabled: z.boolean(),
    spreadsheetId: z.string().trim().max(300).optional(),
    sheetName: z.string().trim().min(1).max(100),
    syncMode: z.enum(['APPEND', 'UPSERT']),
  }),
  email: z.object({
    enabled: z.boolean(),
    sendOnSubmission: z.boolean(),
    sendBeforeDeadline: z.boolean(),
    sendWhenOverdue: z.boolean(),
    sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recipientRoles: z.array(UserRoleSchema),
    additionalRecipients: z.array(z.string().email()).max(50),
    subjectTemplate: z.string().trim().min(3).max(250),
  }),
});

const ReportChannelWritableFieldsSchema = z.object({
  code: z.string().trim().min(2).max(100).regex(/^[A-Z0-9_]+$/, 'Mã loại báo cáo chỉ gồm chữ in hoa, số và dấu gạch dưới.'),
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).default(''),
  category: z.enum(['REGULAR_AUDIT', 'THEMATIC_AUDIT', 'COMPLIANCE_AML', 'OPERATIONAL_RISK', 'CREDIT_INSPECTION', 'BRANCH_REPORT']),
  icon: z.string().trim().min(1).max(50).default('FileSpreadsheet'),
  badgeColor: z.string().trim().min(1).max(50).default('teal'),
  inputMethods: z.array(z.enum(['EXCEL_IMPORT', 'WEB_FORM', 'API'])).min(1),
  issuingDepartment: z.string().trim().min(2).max(255),
  isActive: z.boolean().default(true),
  schemaConfig: DynamicSchemaConfigSchema,
  workflowConfig: DynamicWorkflowConfigSchema,
  slaConfig: DynamicSlaConfigSchema,
  integrationConfig: ReportChannelIntegrationConfigSchema,
});

export const CreateReportChannelSchema = ReportChannelWritableFieldsSchema;
export const UpdateReportChannelSchema = ReportChannelWritableFieldsSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'Cần ít nhất một nội dung cập nhật.',
);

export type CreateReportChannelDTO = z.infer<typeof CreateReportChannelSchema>;
export type UpdateReportChannelDTO = z.infer<typeof UpdateReportChannelSchema>;
