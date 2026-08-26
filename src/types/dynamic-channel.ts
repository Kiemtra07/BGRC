import { UserRole, ErrorStatus } from '../types';

export type ChannelCategory = 
  | 'REGULAR_AUDIT'     // Kiểm tra thường xuyên
  | 'THEMATIC_AUDIT'    // Kiểm tra chuyên đề
  | 'COMPLIANCE_AML'    // Giám sát tuân thủ & Phòng chống rửa tiền
  | 'OPERATIONAL_RISK'  // Rủi ro vận hành & Sự vụ
  | 'CREDIT_INSPECTION' // Kiểm tra tín dụng & Tài sản
  | 'BRANCH_REPORT';    // Báo cáo đột xuất từ Chi nhánh

export type FieldDataType = 
  | 'string' 
  | 'number' 
  | 'currency' 
  | 'date' 
  | 'select' 
  | 'file' 
  | 'textarea';

export type CoreFieldRole = 
  | 'CUSTOMER_IDENTIFIER' // Mã CIF / Khách hàng
  | 'ERROR_CODE'          // Mã lỗi / Loại vi phạm
  | 'ERROR_TITLE'         // Tên lỗi / Mô tả
  | 'BRANCH_CODE'         // Mã Chi nhánh
  | 'CLUSTER_NAME'        // Tên Cụm
  | 'EXPOSURE_AMOUNT'     // Dư nợ / Số tiền rủi ro
  | 'DEADLINE';           // Hạn chót xử lý

export interface DynamicFieldDefinition {
  fieldKey: string;
  label: string;
  dataType: FieldDataType;
  isRequired: boolean;
  isSystemCoreField?: boolean;
  coreFieldRole?: CoreFieldRole;
  dropdownOptions?: { label: string; value: string }[];
  excelHeaderAliases: string[]; // Các alias cột trong Excel: ['Mã CIF', 'CIF', 'So_CIF']
  displayOrder: number;
  showInTableGrid: boolean;
  helpText?: string;
}

export interface DynamicSchemaConfig {
  tableName: string;
  fields: DynamicFieldDefinition[];
  excelHeaderRowIndex: number;
  dataStartRowIndex: number;
}

export interface ButtonActionConfig {
  buttonId: string;
  buttonLabel: string;
  buttonColor: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'slate';
  targetStatusCode: ErrorStatus;
  allowedRoles: UserRole[];
  requireReasonNotes: boolean;
  requireFileAttachment?: boolean;
  sendEmailNotification: boolean;
  emailRecipientRoles: UserRole[];
}

export interface DynamicWorkflowStage {
  stageId: string;
  stageName: string;
  statusCode: ErrorStatus;
  allowedRoles: UserRole[];
  availableButtons: ButtonActionConfig[];
  maxExecutionHours?: number;
}

export interface DynamicWorkflowConfig {
  id: string;
  channelId: string;
  workflowType: 'ONE_TIER' | 'TWO_TIER' | 'THREE_TIER' | 'CUSTOM';
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

export interface DynamicReportChannel {
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
  createdAt: string;
  updatedAt: string;
  
  schemaConfig: DynamicSchemaConfig;
  workflowConfig: DynamicWorkflowConfig;
  slaConfig: DynamicSlaConfig;
}

export interface ExcelTemplateAnalysisResult {
  fileName: string;
  detectedHeaders: string[];
  suggestedFields: DynamicFieldDefinition[];
  sampleRowsCount: number;
  confidenceScore: number;
  inferredCoreRoles: Partial<Record<CoreFieldRole, string>>;
}
