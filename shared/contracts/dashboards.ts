import { z } from 'zod';
import { WorkflowStatus } from './common';

export interface DashboardSummary {
  totalFindings: number;
  activeFindings: number;
  pendingRemediation: number;
  submittedBranch: number;
  submittedInternal: number;
  rejected: number;
  waivedResolved: number;
  
  // SLA metrics
  onTrackCount: number;
  dueSoonCount: number;
  overdueCount: number;

  totalExposureAmount: number;
  resolvedExposureAmount: number;
  remediationRatePercent: number;
}

export interface ClusterBranchPerformance {
  clusterName: string;
  branchCode: string;
  branchName: string;
  totalFindings: number;
  resolvedFindings: number;
  overdueFindings: number;
  remediationRatePercent: number;
}

export interface ReportBreakdownRow {
  key: string;
  label: string;
  branchCode?: string;
  department?: string;
  workflowStatus?: string;
  customerCount: number;
  findingCount: number;
  exposureAmount: number;
}

export interface ReportSummary {
  generatedAt: string;
  totalCustomers: number;
  totalFindings: number;
  totalExposure: number;
  byBranch: ReportBreakdownRow[];
  byDepartment: ReportBreakdownRow[];
  byStatus: ReportBreakdownRow[];
}

export interface ReportFilterQuery {
  branchCode?: string;
  department?: string;
  workflowStatus?: WorkflowStatus;
  errorCode?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const ReportFilterSchema = z.object({
  branchCode: z.string().trim().min(1).max(50).optional(),
  department: z.string().trim().min(1).max(255).optional(),
  workflowStatus: z.enum(['PENDING', 'SUBMITTED_BRANCH', 'SUBMITTED_BRANCH_LEADER', 'SUBMITTED_INTERNAL', 'REJECTED', 'WAIVED_RESOLVED']).optional(),
  errorCode: z.string().trim().min(2).max(50).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'dateTo phải lớn hơn hoặc bằng dateFrom' });
  }
});

export const ReportColumnSchema = z.enum([
  'cif', 'customerName', 'clusterName', 'branchCode', 'branchName', 'department',
  'officerName', 'errorCode', 'errorTitle', 'description', 'workflowStatus',
  'creditBalance', 'exposureAmount', 'deadlineDate',
]);

export const REPORT_FIELD_KEYS = [
  'dimension.channel',
  'dimension.campaign',
  'dimension.campaign_decision',
  'dimension.cluster',
  'dimension.branch',
  'dimension.department',
  'dimension.cif',
  'dimension.customer',
  'dimension.officer',
  'dimension.error_code',
  'dimension.error_group',
  'dimension.workflow_status',
  'dimension.sla_status',
  // Carried over from the CoPlus inspection record so its Report Builder columns are reproducible.
  'dimension.inspection_team',
  'dimension.source_record',
  'dimension.business_line',
  'dimension.risk_level',
  'dimension.penalty_proposal',
  'date.audit',
  'date.deadline',
  'measure.credit_balance',
  'measure.collateral_value',
  'measure.exposure',
  'measure.quantity',
  'flag.overdue',
] as const;
export const ReportFieldKeySchema = z.enum(REPORT_FIELD_KEYS);
export type ReportFieldKey = z.infer<typeof ReportFieldKeySchema>;

export const REPORT_OPERATOR_KEYS = [
  'op.eq', 'op.neq', 'op.contains', 'op.in', 'op.gte', 'op.lte', 'op.between', 'op.is_true', 'op.is_false',
] as const;
export const ReportOperatorKeySchema = z.enum(REPORT_OPERATOR_KEYS);
export type ReportOperatorKey = z.infer<typeof ReportOperatorKeySchema>;

export const REPORT_METRIC_KEYS = [
  'metric.customer_count',
  'metric.finding_count',
  'metric.exposure_sum',
  'metric.credit_balance_sum',
  'metric.collateral_value_sum',
  'metric.quantity_sum',
  'metric.overdue_count',
  'metric.resolved_count',
  'metric.remediation_rate',
] as const;
export const ReportMetricKeySchema = z.enum(REPORT_METRIC_KEYS);
export type ReportMetricKey = z.infer<typeof ReportMetricKeySchema>;

export type ReportFieldCategory = 'DIMENSION' | 'DATE' | 'MEASURE' | 'FLAG';
export type ReportValueType = 'TEXT' | 'ENUM' | 'DATE' | 'NUMBER' | 'BOOLEAN';

export interface ReportFieldOption {
  value: string;
  label: string;
}

export interface ReportFieldDefinition {
  key: ReportFieldKey;
  label: string;
  category: ReportFieldCategory;
  valueType: ReportValueType;
  operators: ReportOperatorKey[];
  groupable: boolean;
  exportable: boolean;
  /** Present on the runtime catalog; omitted only by an older server during a rolling upgrade. */
  filterable?: boolean;
  defaultExport?: boolean;
  options?: ReportFieldOption[];
}

const TEXT_OPERATORS: ReportOperatorKey[] = ['op.eq', 'op.neq', 'op.contains', 'op.in'];
const ENUM_OPERATORS: ReportOperatorKey[] = ['op.eq', 'op.neq', 'op.in'];
const RANGE_OPERATORS: ReportOperatorKey[] = ['op.eq', 'op.neq', 'op.gte', 'op.lte', 'op.between'];

export const REPORT_FIELD_CATALOG: ReportFieldDefinition[] = [
  { key: 'dimension.channel', label: 'Kênh dữ liệu', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.campaign', label: 'Chuyên đề', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.campaign_decision', label: 'Quyết định chuyên đề', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.cluster', label: 'Cụm địa bàn', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.branch', label: 'Chi nhánh', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.department', label: 'Phòng / PGD', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.cif', label: 'CIF', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.customer', label: 'Tên khách hàng', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.officer', label: 'Cán bộ QLKH', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.error_code', label: 'Mã lỗi', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.error_group', label: 'Nhóm lỗi', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.workflow_status', label: 'Trạng thái xử lý', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.sla_status', label: 'Trạng thái SLA', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.inspection_team', label: 'Mã đoàn kiểm tra', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.source_record', label: 'Mã tiểu biên bản', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.business_line', label: 'Loại nghiệp vụ', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.risk_level', label: 'Mức độ rủi ro', category: 'DIMENSION', valueType: 'ENUM', operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: 'dimension.penalty_proposal', label: 'Đề xuất xử phạt', category: 'DIMENSION', valueType: 'TEXT', operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: 'date.audit', label: 'Ngày kiểm tra', category: 'DATE', valueType: 'DATE', operators: RANGE_OPERATORS, groupable: true, exportable: true },
  { key: 'date.deadline', label: 'Hạn xử lý', category: 'DATE', valueType: 'DATE', operators: RANGE_OPERATORS, groupable: true, exportable: true },
  { key: 'measure.credit_balance', label: 'Dư nợ', category: 'MEASURE', valueType: 'NUMBER', operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: 'measure.collateral_value', label: 'Giá trị TSBĐ', category: 'MEASURE', valueType: 'NUMBER', operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: 'measure.exposure', label: 'Giá trị ảnh hưởng', category: 'MEASURE', valueType: 'NUMBER', operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: 'measure.quantity', label: 'Số lượng sai sót', category: 'MEASURE', valueType: 'NUMBER', operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: 'flag.overdue', label: 'Quá hạn', category: 'FLAG', valueType: 'BOOLEAN', operators: ['op.is_true', 'op.is_false'], groupable: true, exportable: true },
];

export interface ReportOperatorDefinition {
  key: ReportOperatorKey;
  label: string;
  requires: 'NONE' | 'VALUE' | 'VALUES' | 'RANGE';
}

export const REPORT_OPERATOR_CATALOG: ReportOperatorDefinition[] = [
  { key: 'op.eq', label: 'Bằng', requires: 'VALUE' },
  { key: 'op.neq', label: 'Khác', requires: 'VALUE' },
  { key: 'op.contains', label: 'Có chứa', requires: 'VALUE' },
  { key: 'op.in', label: 'Thuộc danh sách', requires: 'VALUES' },
  { key: 'op.gte', label: 'Lớn hơn hoặc bằng', requires: 'VALUE' },
  { key: 'op.lte', label: 'Nhỏ hơn hoặc bằng', requires: 'VALUE' },
  { key: 'op.between', label: 'Trong khoảng', requires: 'RANGE' },
  { key: 'op.is_true', label: 'Đúng', requires: 'NONE' },
  { key: 'op.is_false', label: 'Sai', requires: 'NONE' },
];

export interface ReportMetricDefinition {
  key: ReportMetricKey;
  label: string;
  unit: 'COUNT' | 'MILLION_VND' | 'PERCENT';
}

export interface ReportCatalogFieldConfiguration extends ReportFieldDefinition {
  isActive: boolean;
  /** Whether this field is offered in the report filter builder. */
  filterable: boolean;
  defaultExport: boolean;
  sortOrder: number;
}

export interface ReportCatalogMetricConfiguration extends ReportMetricDefinition {
  isActive: boolean;
  sortOrder: number;
}

export interface ReportCatalogConfiguration {
  version: number;
  updatedAt: string;
  updatedByUserId?: string;
  fields: ReportCatalogFieldConfiguration[];
  metrics: ReportCatalogMetricConfiguration[];
}

export const REPORT_METRIC_CATALOG: ReportMetricDefinition[] = [
  { key: 'metric.customer_count', label: 'Khách hàng', unit: 'COUNT' },
  { key: 'metric.finding_count', label: 'Mã lỗi', unit: 'COUNT' },
  { key: 'metric.exposure_sum', label: 'Tổng giá trị ảnh hưởng', unit: 'MILLION_VND' },
  { key: 'metric.credit_balance_sum', label: 'Tổng dư nợ khách hàng', unit: 'MILLION_VND' },
  { key: 'metric.collateral_value_sum', label: 'Tổng giá trị TSBĐ', unit: 'MILLION_VND' },
  { key: 'metric.quantity_sum', label: 'Tổng số lượng sai sót', unit: 'COUNT' },
  { key: 'metric.overdue_count', label: 'Sai sót quá hạn', unit: 'COUNT' },
  { key: 'metric.resolved_count', label: 'Sai sót đã đóng', unit: 'COUNT' },
  { key: 'metric.remediation_rate', label: 'Tỷ lệ khắc phục', unit: 'PERCENT' },
];

/** Case- and whitespace-insensitive: Excel treats "Chi nhánh" and "chi nhánh " as the same name. */
export const firstDuplicateLabel = (labels: string[]): string | undefined => {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = label.trim().toLocaleLowerCase('vi-VN');
    if (seen.has(key)) return label;
    seen.add(key);
  }
  return undefined;
};

const ReportCatalogFieldConfigurationInputSchema = z.object({
  key: ReportFieldKeySchema,
  label: z.string().trim().min(1).max(100),
  isActive: z.boolean(),
  filterable: z.boolean(),
  groupable: z.boolean(),
  exportable: z.boolean(),
  defaultExport: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

const ReportCatalogMetricConfigurationInputSchema = z.object({
  key: ReportMetricKeySchema,
  label: z.string().trim().min(1).max(100),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export const UpdateReportCatalogConfigurationSchema = z.object({
  expectedVersion: z.number().int().min(1),
  fields: z.array(ReportCatalogFieldConfigurationInputSchema).length(REPORT_FIELD_KEYS.length),
  metrics: z.array(ReportCatalogMetricConfigurationInputSchema).length(REPORT_METRIC_KEYS.length),
}).superRefine((configuration, context) => {
  const fieldKeys = new Set(configuration.fields.map(field => field.key));
  const metricKeys = new Set(configuration.metrics.map(metric => metric.key));
  if (fieldKeys.size !== REPORT_FIELD_KEYS.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Danh sách trường báo cáo phải đầy đủ và không được lặp' });
  }
  if (metricKeys.size !== REPORT_METRIC_KEYS.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'Danh sách chỉ số báo cáo phải đầy đủ và không được lặp' });
  }
  configuration.fields.forEach((field, index) => {
    const base = REPORT_FIELD_CATALOG.find(item => item.key === field.key)!;
    if (field.groupable && !base.groupable) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'groupable'], message: 'Trường này không hỗ trợ phân nhóm' });
    }
    if (field.exportable && !base.exportable) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'exportable'], message: 'Trường này không hỗ trợ xuất dữ liệu' });
    }
    if (field.defaultExport && (!field.isActive || !field.exportable)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'defaultExport'], message: 'Cột xuất mặc định phải đang bật và được phép xuất' });
    }
    if (field.filterable && !field.isActive) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', index, 'filterable'], message: 'Trường dùng để lọc phải đang hiển thị' });
    }
  });
  if (!configuration.fields.some(field => field.isActive && field.groupable)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Cần ít nhất một trường dùng để xem theo nhóm' });
  }
  if (!configuration.fields.some(field => field.isActive && field.defaultExport)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: 'Cần ít nhất một cột xuất mặc định' });
  }
  if (!configuration.metrics.some(metric => metric.isActive)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'Cần ít nhất một chỉ số đang bật' });
  }
  // Excel table columns must be uniquely named; two report fields sharing a label produce a
  // workbook Excel refuses to open and repairs by dropping the table.
  const duplicateFieldLabel = firstDuplicateLabel(configuration.fields.filter(field => field.isActive).map(field => field.label));
  if (duplicateFieldLabel) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields'], message: `Tên hiển thị “${duplicateFieldLabel}” bị trùng; mỗi trường cần một tên riêng để xuất Excel.` });
  }
  const duplicateMetricLabel = firstDuplicateLabel(configuration.metrics.filter(metric => metric.isActive).map(metric => metric.label));
  if (duplicateMetricLabel) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: `Tên hiển thị “${duplicateMetricLabel}” bị trùng; mỗi chỉ số cần một tên riêng để xuất Excel.` });
  }
});
export type UpdateReportCatalogConfigurationDTO = z.input<typeof UpdateReportCatalogConfigurationSchema>;

const ReportRuleValueSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
export const ReportFilterRuleSchema = z.object({
  key: ReportFieldKeySchema,
  operator: ReportOperatorKeySchema,
  value: ReportRuleValueSchema.optional(),
  values: z.array(ReportRuleValueSchema).min(1).max(100).optional(),
  from: z.union([z.string().max(50), z.number().finite()]).optional(),
  to: z.union([z.string().max(50), z.number().finite()]).optional(),
}).superRefine((rule, context) => {
  const field = REPORT_FIELD_CATALOG.find(item => item.key === rule.key)!;
  if (!field.operators.includes(rule.operator)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['operator'], message: `Toán tử ${rule.operator} không dùng được cho ${rule.key}` });
    return;
  }
  const operator = REPORT_OPERATOR_CATALOG.find(item => item.key === rule.operator)!;
  if (operator.requires === 'VALUE' && (rule.value === undefined || rule.value === '')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Bộ lọc cần một giá trị' });
  }
  if (operator.requires === 'VALUES' && !rule.values?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['values'], message: 'Bộ lọc cần danh sách giá trị' });
  }
  if (operator.requires === 'RANGE' && (rule.from === undefined || rule.to === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Bộ lọc cần đủ giá trị từ và đến' });
  }
  const supplied = [rule.value, ...(rule.values || []), rule.from, rule.to].filter(value => value !== undefined);
  if (field.valueType === 'NUMBER' && supplied.some(value => typeof value !== 'number')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Key kiểu NUMBER chỉ nhận giá trị số' });
  }
  if (field.valueType === 'DATE' && supplied.some(value => typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Key kiểu DATE chỉ nhận YYYY-MM-DD' });
  }
  if (rule.operator === 'op.between' && rule.from !== undefined && rule.to !== undefined && rule.from > rule.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Giá trị đến phải lớn hơn hoặc bằng giá trị từ' });
  }
});
export type ReportFilterRule = z.infer<typeof ReportFilterRuleSchema>;

export const ReportRunRequestSchema = z.object({
  rules: z.array(ReportFilterRuleSchema).max(20).default([]),
  match: z.enum(['ALL', 'ANY']).default('ALL'),
  groupBy: ReportFieldKeySchema.default('dimension.branch'),
  metrics: z.array(ReportMetricKeySchema).min(1).max(REPORT_METRIC_KEYS.length).default([
    'metric.customer_count', 'metric.finding_count', 'metric.exposure_sum',
  ]),
  sort: z.object({ key: ReportMetricKeySchema, direction: z.enum(['asc', 'desc']).default('desc') }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
}).superRefine((query, context) => {
  const groupField = REPORT_FIELD_CATALOG.find(item => item.key === query.groupBy)!;
  if (!groupField.groupable) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupBy'], message: `${query.groupBy} không phải key phân nhóm` });
  }
  if (new Set(query.metrics).size !== query.metrics.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics'], message: 'Key chỉ số không được lặp' });
  }
});
export type ReportRunRequest = z.infer<typeof ReportRunRequestSchema>;

export const ReportExportRequestSchema = z.object({
  query: ReportRunRequestSchema,
  columns: z.array(ReportFieldKeySchema).min(1).max(REPORT_FIELD_KEYS.length),
  format: z.enum(['csv', 'html', 'xlsx']).default('csv'),
}).superRefine((request, context) => {
  request.columns.forEach((key, index) => {
    if (!REPORT_FIELD_CATALOG.find(item => item.key === key)?.exportable) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['columns', index], message: `${key} không thể xuất dữ liệu` });
    }
  });
  if (new Set(request.columns).size !== request.columns.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columns'], message: 'Key cột xuất không được lặp' });
  }
});
export type ReportExportRequest = z.infer<typeof ReportExportRequestSchema>;

export interface ReportCatalog {
  version: 'report-keys.v1';
  fields: ReportFieldDefinition[];
  operators: ReportOperatorDefinition[];
  metrics: ReportMetricDefinition[];
}

export interface ReportGroupRow {
  key: string;
  label: string;
  metricValues: Partial<Record<ReportMetricKey, number>>;
}

export interface ReportRunResult {
  generatedAt: string;
  query: ReportRunRequest;
  matchedFindingCount: number;
  metricValues: Partial<Record<ReportMetricKey, number>>;
  groups: ReportGroupRow[];
}

export interface ReportDefinition {
  id: string;
  name: string;
  description?: string;
  filters: ReportFilterQuery;
  columns: Array<z.infer<typeof ReportColumnSchema>>;
  query?: ReportRunRequest;
  exportColumns?: ReportFieldKey[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const CreateReportDefinitionSchema = z.object({
  name: z.string().trim().min(3).max(150),
  description: z.string().trim().max(500).optional(),
  filters: ReportFilterSchema.default({}),
  columns: z.array(ReportColumnSchema).max(15).default([]),
  query: ReportRunRequestSchema.optional(),
  exportColumns: z.array(ReportFieldKeySchema).max(REPORT_FIELD_KEYS.length).default([]),
}).superRefine((definition, context) => {
  if (definition.columns.length === 0 && definition.exportColumns.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['exportColumns'], message: 'Phải chọn ít nhất một cột xuất báo cáo' });
  }
});
export type CreateReportDefinitionDTO = z.input<typeof CreateReportDefinitionSchema>;
