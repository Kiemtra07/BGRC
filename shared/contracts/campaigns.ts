import { z } from 'zod';

export type AuditCampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type CampaignDriveProvisionStatus = 'NOT_CONFIGURED' | 'PROVISIONING' | 'READY' | 'FAILED';

export interface AuditCampaignMember {
  userId: string;
  memberRole: 'LEAD' | 'MEMBER';
  assignedBranchCodes: string[];
}

export interface AuditCampaign {
  id: string;
  code: string;
  name: string;
  description?: string;
  decisionNo: string;
  startDate: string;
  endDate: string;
  status: AuditCampaignStatus;
  leadUserId: string;
  members: AuditCampaignMember[];
  branchCodes: string[];
  reportChannelIds: string[];
  driveRootFolderId?: string;
  driveRootUrl?: string;
  driveProvisionStatus: CampaignDriveProvisionStatus;
  driveLastError?: string;
  version: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

const CampaignMemberSchema = z.object({
  userId: z.string().trim().min(1),
  memberRole: z.enum(['LEAD', 'MEMBER']),
  assignedBranchCodes: z.array(z.string().trim().min(1)).default([]),
});

const CampaignInputSchema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().max(1000).optional(),
  decisionNo: z.string().trim().min(2).max(150),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadUserId: z.string().trim().min(1),
  members: z.array(CampaignMemberSchema).min(1),
  branchCodes: z.array(z.string().trim().min(1)).min(1),
  reportChannelIds: z.array(z.string().trim().min(1)).min(1),
});

function validateCampaignInput(value: z.infer<typeof CampaignInputSchema>, context: z.RefinementCtx): void {
  if (value.endDate < value.startDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' });
  const userIds = value.members.map(member => member.userId);
  if (new Set(userIds).size !== userIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['members'], message: 'Thành viên không được trùng.' });
  const lead = value.members.find(member => member.userId === value.leadUserId && member.memberRole === 'LEAD');
  if (!lead) context.addIssue({ code: z.ZodIssueCode.custom, path: ['leadUserId'], message: 'Trưởng đoàn phải có trong danh sách với vai trò LEAD.' });
  const branches = new Set(value.branchCodes);
  if (value.members.some(member => member.assignedBranchCodes.some(code => !branches.has(code)))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['members'], message: 'Chi nhánh phân công phải thuộc phạm vi chuyên đề.' });
}

export const CreateAuditCampaignSchema = CampaignInputSchema.superRefine(validateCampaignInput);
export type CreateAuditCampaignDTO = z.infer<typeof CreateAuditCampaignSchema>;

export const UpdateAuditCampaignSchema = CampaignInputSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']).optional(),
});
export type UpdateAuditCampaignDTO = z.infer<typeof UpdateAuditCampaignSchema>;
