export interface SlaTimerDriver {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SlaRuntimeOptions {
  now?: () => Date;
  timers?: SlaTimerDriver;
  onError?: (error: unknown) => void;
}

const systemTimers: SlaTimerDriver = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function millisecondsUntilNextSlaRun(now: Date): number {
  const nextRun = new Date(now);
  nextRun.setHours(8, 30, 0, 0);
  if (nextRun.getTime() <= now.getTime()) nextRun.setDate(nextRun.getDate() + 1);
  return nextRun.getTime() - now.getTime();
}

export function shouldStartEmbeddedSlaRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'test' && env.NODE_ENV !== 'production';
}

export function startDailySlaRuntime(runEvaluation: () => void | Promise<void>, options: SlaRuntimeOptions = {}): () => void {
  const now = options.now ?? (() => new Date());
  const timers = options.timers ?? systemTimers;
  const onError = options.onError ?? (error => console.error('[SLA Scheduler] Evaluation failed; the next run remains scheduled.', error));
  let timer: unknown;
  let stopped = false;

  const schedule = (delay: number) => {
    timer = timers.setTimeout(() => {
      if (stopped) return;
      executeAndSchedule();
    }, delay);
  };

  const reportError = (error: unknown) => {
    try {
      onError(error);
    } catch (reportingError) {
      console.error('[SLA Scheduler] Error reporter failed.', reportingError);
    }
  };

  const scheduleNext = () => {
    if (!stopped) schedule(millisecondsUntilNextSlaRun(now()));
  };

  const executeAndSchedule = () => {
    try {
      const result = runEvaluation();
      if (result && typeof (result as Promise<void>).then === 'function') {
        void Promise.resolve(result)
          .catch(reportError)
          .finally(scheduleNext);
        return;
      }
    } catch (error) {
      reportError(error);
    }
    scheduleNext();
  };

  executeAndSchedule();
  return () => {
    stopped = true;
    if (timer !== undefined) timers.clearTimeout(timer);
  };
}
