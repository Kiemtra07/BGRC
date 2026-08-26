import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Finding } from '../../shared/contracts';
import * as workerModule from '../../server/src/worker/sla-worker';
import { LocalStateRepository } from '../../server/src/repositories/local-state';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

const overdueFinding: Finding = {
  id: 'runtime-finding', channelId: 'chan-audit-bgs', channelCode: 'AUDIT_BGS', channelName: 'Kiểm toán',
  channelVersionId: 'v1', workflowVersionId: 'wf-v1', slaPolicyVersionId: 'sla-v1', cif: '12345678',
  customerName: 'Khách hàng runtime', clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
  creditBalance: 0, errorCode: 'TD01.01', errorTitle: 'Sai sót runtime', description: 'Mô tả dùng cho kiểm thử worker SLA.', quantity: 1,
  exposureAmount: 0, workflowStatus: 'SUBMITTED_BRANCH', slaStatus: 'ON_TRACK', version: 9, deadlineDate: '2000-01-01',
  isOverdue: false, evidenceCount: 0, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('SLA runtime behavior', () => {
  it('exposes a timer-independent SLA evaluation function with the established result contract', () => {
    const runSlaEvaluation = (workerModule as typeof workerModule & {
      runSlaEvaluation?: (findings: Finding[], asOfDate: Date) => {
        updatedCount: number;
        overdueCount: number;
        dueSoonCount: number;
      };
    }).runSlaEvaluation;

    expect(runSlaEvaluation).toBeTypeOf('function');
    if (!runSlaEvaluation) return;

    const item = { ...overdueFinding };
    expect(runSlaEvaluation([item], new Date('2026-08-25T08:30:00'))).toEqual({
      updatedCount: 1,
      overdueCount: 1,
      dueSoonCount: 0,
    });
    expect(item).toMatchObject({ workflowStatus: 'SUBMITTED_BRANCH', slaStatus: 'OVERDUE', isOverdue: true });
  });

  it('starts the embedded timer only for non-test, non-production runtimes', async () => {
    const scheduler = await import('../../server/src/worker/sla-scheduler') as typeof import('../../server/src/worker/sla-scheduler') & {
      shouldStartEmbeddedSlaRuntime?: (env: NodeJS.ProcessEnv) => boolean;
    };

    expect(scheduler.shouldStartEmbeddedSlaRuntime).toBeTypeOf('function');
    if (!scheduler.shouldStartEmbeddedSlaRuntime) return;

    expect(scheduler.shouldStartEmbeddedSlaRuntime({ NODE_ENV: 'development' })).toBe(true);
    expect(scheduler.shouldStartEmbeddedSlaRuntime({ NODE_ENV: 'test' })).toBe(false);
    expect(scheduler.shouldStartEmbeddedSlaRuntime({ NODE_ENV: 'production' })).toBe(false);
  });

  it('declares the 08:30 Vietnam cron schedule in Vercel configuration', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: '/api/v1/internal/sla/run',
      schedule: '30 1 * * *',
    });
  });

  it('updates a real local-state envelope atomically without losing unrelated fields and skips missing state', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-sla-runtime-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new LocalStateRepository<{ findings: Finding[]; retained: { marker: string } }>({ filePath, enabled: true });
    repository.save({ findings: [{ ...overdueFinding }], retained: { marker: 'keep-me' } });

    const result = workerModule.runStandaloneSlaEvaluation(filePath);
    const reloaded = repository.load({ findings: [], retained: { marker: 'missing' } });

    expect(result).toMatchObject({ skipped: false, updatedCount: 1, overdueCount: 1 });
    expect(reloaded.retained).toEqual({ marker: 'keep-me' });
    expect(reloaded.findings[0]).toMatchObject({ workflowStatus: 'SUBMITTED_BRANCH', slaStatus: 'OVERDUE', isOverdue: true, version: 9 });
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(workerModule.runStandaloneSlaEvaluation(path.join(directory, 'absent.json')).skipped).toBe(true);
    expect(fs.existsSync(path.join(directory, 'absent.json'))).toBe(false);
  });

  it('runs startup evaluation with persistence and schedules/cleans 08:30 timers through injected runtime helpers', async () => {
    const evaluateAndPersist = (workerModule as typeof workerModule & { evaluateAndPersistSla?: (findings: Finding[], persist: () => void, asOfDate: Date) => { updatedCount: number } }).evaluateAndPersistSla;
    const scheduler = await import('../../server/src/worker/sla-scheduler').catch(() => null);

    expect(evaluateAndPersist).toBeTypeOf('function');
    expect(scheduler).not.toBeNull();
    if (!evaluateAndPersist || !scheduler) return;

    let persistCount = 0;
    const item = { ...overdueFinding };
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const cleared: unknown[] = [];
    const stop = scheduler.startDailySlaRuntime(
      () => evaluateAndPersist([item], () => { persistCount += 1; }, new Date('2026-08-25T08:29:00')),
      {
        now: () => new Date('2026-08-25T08:29:00'),
        timers: {
          setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
          clearTimeout: handle => { cleared.push(handle); },
        },
      },
    );

    expect(item).toMatchObject({ slaStatus: 'OVERDUE', isOverdue: true, workflowStatus: 'SUBMITTED_BRANCH' });
    expect(persistCount).toBe(1);
    expect(timers[0].delay).toBe(60_000);
    timers[0].callback();
    expect(timers[1].delay).toBe(60_000);
    stop();
    expect(cleared).toContain(2);
  });

  it('reports startup and timer evaluation failures while always scheduling the next 08:30 run', async () => {
    const scheduler = await import('../../server/src/worker/sla-scheduler');
    let currentTime = new Date(2026, 7, 25, 8, 29, 0, 0);
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const cleared: unknown[] = [];
    const errors: unknown[] = [];
    let attempts = 0;

    const stop = scheduler.startDailySlaRuntime(
      () => {
        attempts += 1;
        throw new Error(`SLA failure ${attempts}`);
      },
      {
        now: () => currentTime,
        onError: error => { errors.push(error); },
        timers: {
          setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
          clearTimeout: handle => { cleared.push(handle); },
        },
      },
    );

    expect(attempts).toBe(1);
    expect(errors).toHaveLength(1);
    expect(timers[0].delay).toBe(60_000);
    currentTime = new Date(2026, 7, 25, 8, 31, 0, 0);
    expect(() => timers[0].callback()).not.toThrow();
    expect(attempts).toBe(2);
    expect(errors).toHaveLength(2);
    expect(timers[1].delay).toBe((23 * 60 * 60 * 1000) + (59 * 60 * 1000));
    stop();
    expect(cleared).toContain(2);
  });

  it('awaits an asynchronous repository-backed evaluation before scheduling and reports rejection', async () => {
    const scheduler = await import('../../server/src/worker/sla-scheduler');
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const errors: unknown[] = [];
    let releaseEvaluation!: () => void;
    const evaluationGate = new Promise<void>(resolve => { releaseEvaluation = resolve; });

    const stop = scheduler.startDailySlaRuntime(
      async () => {
        await evaluationGate;
        throw new Error('async postgres failure');
      },
      {
        now: () => new Date(2026, 7, 25, 8, 29, 0, 0),
        onError: error => { errors.push(error); },
        timers: {
          setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
          clearTimeout: () => undefined,
        },
      },
    );

    expect(timers).toHaveLength(0);
    releaseEvaluation();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/async postgres failure/);
    expect(timers[0].delay).toBe(60_000);
    stop();
  });

  it('applies standalone SLA changes to the latest local state rather than a stale envelope', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bgs-sla-stale-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'local-state.json');
    const repository = new LocalStateRepository<{ findings: Finding[]; retained: { marker: string }; apiMutation?: string }>({ filePath, enabled: true });
    repository.save({ findings: [{ ...overdueFinding }], retained: { marker: 'initial' } });
    const staleSnapshot = repository.load({ findings: [], retained: { marker: 'fallback' } });
    repository.save({ ...staleSnapshot, retained: { marker: 'written-by-api' }, apiMutation: 'keep-this' });

    workerModule.runStandaloneSlaEvaluation(filePath);
    const reloaded = repository.load({ findings: [], retained: { marker: 'missing' } });

    expect(reloaded).toMatchObject({ retained: { marker: 'written-by-api' }, apiMutation: 'keep-this' });
    expect(reloaded.findings[0]).toMatchObject({ slaStatus: 'OVERDUE', isOverdue: true });
  });
});
