import { z } from 'zod';
import { BUSINESS_LINES, RISK_LEVELS } from './common';

const CalendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, 'Ngày lịch không hợp lệ');

export type ImportBatchStatus = 'STAGING' | 'VALIDATING' | 'VALIDATED_WITH_ERRORS' | 'READY_TO_COMMIT' | 'COMMITTED' | 'FAILED';
export type FindingImportSourceType = 'XLSX' | 'ZIP_XLSX' | 'CLIPBOARD' | 'DOCX' | 'PDF' | 'API_BULK' | 'WEB_FORM';

export interface StagingValidationError {
  rowNumber: number;
  fieldKey: string;
  fieldLabel: string;
  rawValue: any;
  errorCode: string;
  errorMessage: string;
  isBlocking: boolean;
}

export interface StagingRow {
  id: string;
  batchId: string;
  rowNumber: number;
  rawData: Record<string, any>;
  parsedData: Record<string, any>;
  isValid: boolean;
  errors: StagingValidationError[];
}

export interface ImportBatch {
  id: string;
  channelId: string;
  channelName: string;
  campaignId?: string;
  channelVersionId: string;
  fileName: string;
  sourceType: FindingImportSourceType | 'EXCEL_IMPORT';
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  status: ImportBatchStatus;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
  committedAt?: string;
  committedFindingsCount?: number;
}

export const WebFormFindingSchema = z.object({
  campaignId: z.string().min(1).optional(),
  channelId: z.string().min(1),
  cif: z.string().min(3).max(20),
  customerName: z.string().min(2).max(255),
  clusterName: z.string().min(2),
  branchCode: z.string().min(1),
  branchName: z.string().min(2),
  department: z.string().optional(),
  decisionNo: z.string().optional(),
  auditDate: CalendarDateSchema.optional(),
  deadlineDate: CalendarDateSchema.optional(),
  loanGroup: z.string().trim().min(1).optional(),
  collateralValue: z.number().nonnegative().optional(),
  loanPurpose: z.string().trim().min(1).max(2000).optional(),
  errorCode: z.string().min(2),
  errorGroup: z.string().optional(),
  errorTitle: z.string().min(3),
  description: z.string().min(5),
  quantity: z.number().int().positive().optional(),
  exposureAmount: z.number().nonnegative().default(0),
  // Provenance carried over from the upstream CoPlus inspection record.
  inspectionTeamCode: z.string().trim().min(1).max(50).optional(),
  sourceRecordCode: z.string().trim().min(1).max(60).optional(),
  businessLine: z.enum(BUSINESS_LINES).optional(),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  penaltyProposalCode: z.string().trim().min(1).max(30).optional(),
  referenceDocument: z.string().trim().min(1).max(500).optional(),
  creditBalance: z.number().nonnegative().optional(),
  officerName: z.string().optional(),
  deptHeadName: z.string().optional(),
  inspectorName: z.string().optional(),
  customPayload: z.record(z.any()).optional(),
});
export type WebFormFindingDTO = z.infer<typeof WebFormFindingSchema>;

export const BulkFindingImportSchema = z.object({
  sourceFileName: z.string().trim().min(1).max(255),
  sourceType: z.enum(['XLSX', 'ZIP_XLSX', 'CLIPBOARD', 'DOCX', 'PDF', 'API_BULK', 'WEB_FORM']).default('API_BULK'),
  rows: z.array(WebFormFindingSchema).min(1).max(5000),
}).superRefine((value, context) => {
  if (value.sourceType !== 'API_BULK' && value.rows.some(row => !row.campaignId?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'Chuyên đề là bắt buộc đối với dữ liệu nhập từ giao diện.' });
  }
  if (value.sourceType !== 'API_BULK' && value.rows.some(row => row.channelId !== value.rows[0]?.channelId || row.campaignId !== value.rows[0]?.campaignId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'Một lần nhập chỉ được dùng một loại báo cáo và một chuyên đề.' });
  }
});
export type BulkFindingImportDTO = z.infer<typeof BulkFindingImportSchema>;

type FindingBusinessKeyInput = Pick<WebFormFindingDTO, 'channelId' | 'campaignId' | 'branchCode' | 'cif' | 'errorCode' | 'decisionNo'>;

const compactIdentifier = (value: string | undefined): string => (value || '').trim().replace(/\s+/g, ' ');

export const buildFindingBusinessKey = (finding: FindingBusinessKeyInput): string => [
  compactIdentifier(finding.channelId),
  compactIdentifier(finding.campaignId),
  compactIdentifier(finding.branchCode).replace(/^[A-Z](?=\d)/i, ''),
  compactIdentifier(finding.cif).replace(/\s+/g, ''),
  compactIdentifier(finding.errorCode).toUpperCase(),
  compactIdentifier(finding.decisionNo),
].join('|');
