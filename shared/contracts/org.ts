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
