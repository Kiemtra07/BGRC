import fs from 'node:fs';
import path from 'node:path';
import { Finding, SlaStatus } from '../../../shared/contracts';
import { LocalStateRepository } from '../repositories/local-state';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SlaBusinessCalendar {
  businessDaysOnly?: boolean;
  holidayDates?: readonly string[];
}

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

function holidaySet(calendar?: SlaBusinessCalendar): Set<string> {
  return new Set(calendar?.holidayDates ?? []);
}

export function isBusinessDay(value: string | Date, calendar?: SlaBusinessCalendar): boolean {
  const date = calendarDate(value);
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6 && !holidaySet(calendar).has(toCalendarDateString(date));
}

export function nextBusinessDay(value: string | Date, calendar?: SlaBusinessCalendar): Date {
  const date = calendarDate(value);
  while (!isBusinessDay(date, calendar)) date.setDate(date.getDate() + 1);
  return date;
}

/** Adds a configured SLA interval. Calendar-day behavior remains the compatibility default. */
export function addSlaDays(baseDate: string | Date, days: number, calendar?: SlaBusinessCalendar): string {
  if (!calendar?.businessDaysOnly) return addCalendarDays(baseDate, days);
  const result = calendarDate(baseDate);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, calendar)) remaining -= 1;
  }
  return toCalendarDateString(result);
}

/** Number of SLA days remaining, accounting for weekends and configured holidays when enabled. */
export function slaDaysRemaining(deadlineDate: string | Date, asOfDate: string | Date, calendar?: SlaBusinessCalendar): number {
  const asOf = calendarDate(asOfDate);
  const deadline = calendar?.businessDaysOnly ? nextBusinessDay(deadlineDate, calendar) : calendarDate(deadlineDate);
  if (!calendar?.businessDaysOnly) return Math.round((deadline.getTime() - asOf.getTime()) / DAY_MS);
  if (deadline.getTime() === asOf.getTime()) return 0;

  const direction = deadline.getTime() > asOf.getTime() ? 1 : -1;
  const cursor = calendarDate(asOf);
  let count = 0;
  while (cursor.getTime() !== deadline.getTime()) {
    cursor.setDate(cursor.getDate() + direction);
    if (isBusinessDay(cursor, calendar)) count += direction;
  }
  return count;
}

export class SlaEvaluationWorker {
  public evaluateFindingSla(
    finding: Finding,
    asOfDate: Date = new Date(),
    dueSoonDays = 3,
    calendar?: SlaBusinessCalendar,
  ): { slaStatus: SlaStatus; isOverdue: boolean; daysRemaining: number } {
    // P0-06: Resolved finding is closed in SLA
    if (finding.workflowStatus === 'WAIVED_RESOLVED') {
      return { slaStatus: 'CLOSED', isOverdue: false, daysRemaining: 0 };
    }

    const daysRemaining = slaDaysRemaining(finding.deadlineDate, asOfDate, calendar);

    let slaStatus: SlaStatus = 'ON_TRACK';
    let isOverdue = false;

    if (daysRemaining < 0) {
      slaStatus = 'OVERDUE';
      isOverdue = true;
    } else if (daysRemaining <= dueSoonDays) {
      slaStatus = 'DUE_SOON';
      isOverdue = false;
    } else {
      slaStatus = 'ON_TRACK';
      isOverdue = false;
    }

    return { slaStatus, isOverdue, daysRemaining };
  }

  public runDailyEvaluation(
    findings: Finding[],
    asOfDate: Date = new Date(),
    dueSoonDaysForFinding: (finding: Finding) => number = () => 3,
    calendarForFinding: (finding: Finding) => SlaBusinessCalendar | undefined = () => undefined,
  ): { updatedCount: number; overdueCount: number; dueSoonCount: number } {
    let updatedCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    for (const finding of findings) {
      const evaluation = this.evaluateFindingSla(finding, asOfDate, dueSoonDaysForFinding(finding), calendarForFinding(finding));
      
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

export function runSlaEvaluation(
  findings: Finding[],
  asOfDate: Date = new Date(),
  dueSoonDaysForFinding?: (finding: Finding) => number,
  calendarForFinding?: (finding: Finding) => SlaBusinessCalendar | undefined,
): { updatedCount: number; overdueCount: number; dueSoonCount: number } {
  return slaWorker.runDailyEvaluation(findings, asOfDate, dueSoonDaysForFinding, calendarForFinding);
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
