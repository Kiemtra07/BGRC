import fs from 'node:fs';
import path from 'node:path';
import { Finding, SlaStatus } from '../../../shared/contracts';
import { LocalStateRepository } from '../repositories/local-state';

const DAY_MS = 24 * 60 * 60 * 1000;

export function calendarDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`INVALID_SLA_DATE: ${value}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const result = new Date(year, month - 1, day);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) throw new Error(`INVALID_SLA_DATE: ${value}`);
  return result;
}

export function toCalendarDateString(value: Date): string {
  const date = calendarDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(baseDate: string | Date, days: number): string {
  const result = calendarDate(baseDate);
  result.setDate(result.getDate() + days);
  return toCalendarDateString(result);
}

export class SlaEvaluationWorker {
  public evaluateFindingSla(finding: Finding, asOfDate: Date = new Date()): { slaStatus: SlaStatus; isOverdue: boolean; daysRemaining: number } {
    // P0-06: Resolved finding is closed in SLA
    if (finding.workflowStatus === 'WAIVED_RESOLVED') {
      return { slaStatus: 'CLOSED', isOverdue: false, daysRemaining: 0 };
    }

    const deadline = calendarDate(finding.deadlineDate);
    const diffTime = deadline.getTime() - calendarDate(asOfDate).getTime();
    const daysRemaining = Math.round(diffTime / DAY_MS);

    let slaStatus: SlaStatus = 'ON_TRACK';
    let isOverdue = false;

    if (daysRemaining < 0) {
      slaStatus = 'OVERDUE';
      isOverdue = true;
    } else if (daysRemaining <= 3) {
      slaStatus = 'DUE_SOON';
      isOverdue = false;
    } else {
      slaStatus = 'ON_TRACK';
      isOverdue = false;
    }

    return { slaStatus, isOverdue, daysRemaining };
  }

  public runDailyEvaluation(findings: Finding[], asOfDate: Date = new Date()): { updatedCount: number; overdueCount: number; dueSoonCount: number } {
    let updatedCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    for (const finding of findings) {
      const evaluation = this.evaluateFindingSla(finding, asOfDate);
      
      // P0-06 Invariant: SLA worker updates slaStatus ONLY. It NEVER changes workflowStatus!
      if (finding.slaStatus !== evaluation.slaStatus || finding.isOverdue !== evaluation.isOverdue) {
        finding.slaStatus = evaluation.slaStatus;
        finding.isOverdue = evaluation.isOverdue;
        updatedCount++;
      }

      if (evaluation.slaStatus === 'OVERDUE') overdueCount++;
      if (evaluation.slaStatus === 'DUE_SOON') dueSoonCount++;
    }

    console.log(`[SLA Worker 08:30] Evaluated ${findings.length} findings. Overdue: ${overdueCount}, Due Soon: ${dueSoonCount}, Updated: ${updatedCount}`);
    return { updatedCount, overdueCount, dueSoonCount };
  }
}

export const slaWorker = new SlaEvaluationWorker();

export function runSlaEvaluation(findings: Finding[], asOfDate: Date = new Date()): { updatedCount: number; overdueCount: number; dueSoonCount: number } {
  return slaWorker.runDailyEvaluation(findings, asOfDate);
}

export function evaluateAndPersistSla(findings: Finding[], persist: () => void, asOfDate: Date = new Date()): { updatedCount: number; overdueCount: number; dueSoonCount: number } {
  const result = runSlaEvaluation(findings, asOfDate);
  if (result.updatedCount > 0) persist();
  return result;
}

interface StandaloneSlaState {
  findings: Finding[];
  [key: string]: unknown;
}

export function runStandaloneSlaEvaluation(filePath = process.env.LOCAL_STATE_FILE ?? path.join(process.cwd(), 'data', 'local-state.json')): { skipped: boolean; updatedCount: number; overdueCount: number; dueSoonCount: number } {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[SLA Worker] Không tìm thấy local state tại ${resolvedPath}; không tạo state rỗng.`);
    return { skipped: true, updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  }
  const repository = new LocalStateRepository<StandaloneSlaState>({ filePath: resolvedPath, enabled: true });
  let result = { updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  repository.update({ findings: [] }, latest => {
    result = runSlaEvaluation(latest.findings);
  });
  return { skipped: false, ...result };
}

if (process.argv[1] && process.argv[1].includes('sla-worker.ts')) {
  console.log('⚡ Starting standalone SLA & Escalation Worker...');
  runStandaloneSlaEvaluation();
}
