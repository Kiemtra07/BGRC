import type { EvidenceStatus } from '../../../shared/contracts';

export interface InitialEvidenceScanDisposition {
  status: EvidenceStatus;
  notes?: string;
}

/**
 * Production must not treat a signature check as an anti-malware result. Until a configured
 * asynchronous scanner confirms the object, keep it out of the AVAILABLE evidence set. Local and
 * test storage retain the current developer workflow because they never prove a production scan.
 */
export function initialEvidenceScanDisposition(
  runtimeEnv = process.env.NODE_ENV,
  enforceQuarantine = process.env.EVIDENCE_SCAN_ENFORCE_QUARANTINE === 'true',
): InitialEvidenceScanDisposition {
  if (runtimeEnv === 'production' || enforceQuarantine) {
    return {
      status: 'QUARANTINED',
      notes: 'Tệp đang chờ dịch vụ quét minh chứng xác nhận trước khi được dùng trong quy trình.',
    };
  }
  return { status: 'AVAILABLE' };
}
