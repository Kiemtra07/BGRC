import { z } from 'zod';
import { EvidenceStatus, WorkflowStatus } from './common';

export interface EvidenceObject {
  id: string;
  findingId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  driveFileId: string;
  driveUrl: string;
  sha256Checksum: string;
  status: EvidenceStatus;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedByRole: string;
  versionNumber: number;
  notes?: string;
  revokedAt?: string;
  revokedReason?: string;
  revokedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export const RevokeEvidenceSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export type RevokeEvidenceDTO = z.infer<typeof RevokeEvidenceSchema>;

export const canManageEvidenceAtBranch = (status: WorkflowStatus): boolean => (
  status === 'PENDING' || status === 'REJECTED'
);
