export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  actorName: string;
  actorRole: string;
  targetEntity: string;
  details: string;
  findingId: string;
  cif: string;
  errorCode: string;
  branchCode: string;
}
