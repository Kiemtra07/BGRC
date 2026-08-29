import { z } from 'zod';
import { DataScopeType } from './common';

export type OrgUnitType = 'HEAD_OFFICE' | 'INTERNAL_TEAM' | 'CLUSTER' | 'BRANCH' | 'DEPARTMENT';

export interface OrgUnit {
  id: string;
  code: string;
  name: string;
  type: OrgUnitType;
  parentId?: string;
  parentName?: string;
  leaderUserId?: string;
  leaderName?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const CreateOrgUnitSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(['HEAD_OFFICE', 'INTERNAL_TEAM', 'CLUSTER', 'BRANCH', 'DEPARTMENT']),
  // IDs are opaque strings at the HTTP boundary; PostgreSQL uses UUIDs while local mode uses readable seed IDs.
  parentId: z.string().min(1).optional(),
  leaderUserId: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

export type CreateOrgUnitDTO = z.infer<typeof CreateOrgUnitSchema>;

export const UpdateOrgUnitSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  leaderUserId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
}).refine(value => Object.keys(value).some(key => key !== 'expectedUpdatedAt'), {
  message: 'Cần có ít nhất một thay đổi cho đơn vị.',
});

export type UpdateOrgUnitDTO = z.infer<typeof UpdateOrgUnitSchema>;

export const BulkOrgUnitImportSchema = z.object({
  rows: z.array(z.object({ rowNumber: z.number().int().positive(), unit: CreateOrgUnitSchema })).min(1).max(1000),
});
export type BulkOrgUnitImportDTO = z.infer<typeof BulkOrgUnitImportSchema>;

export interface BulkOrgUnitImportResult {
  batchId: string;
  created: Array<{ rowNumber: number; unit: OrgUnit }>;
  failed: Array<{ rowNumber: number; code: string; message: string }>;
}
