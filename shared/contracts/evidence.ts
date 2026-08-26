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

const EvidenceUploadMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  fileSize: z.number().int().positive().max(25 * 1024 * 1024),
  sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const CreateEvidenceUploadSessionSchema = EvidenceUploadMetadataSchema;
export const CompleteEvidenceDirectUploadSchema = EvidenceUploadMetadataSchema.extend({
  driveFileId: z.string().trim().min(1).max(255),
});

export type CreateEvidenceUploadSessionDTO = z.infer<typeof CreateEvidenceUploadSessionSchema>;
export type CompleteEvidenceDirectUploadDTO = z.infer<typeof CompleteEvidenceDirectUploadSchema>;

export const canManageEvidenceAtBranch = (status: WorkflowStatus): boolean => (
  status === 'PENDING' || status === 'REJECTED'
);
