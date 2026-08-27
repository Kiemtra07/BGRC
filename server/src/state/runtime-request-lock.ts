const livenessPaths = new Set(['/api/v1/health', '/api/v1/ready']);

// Paths that must never trigger a read-through re-hydration: liveness probes carry no
// business state, and the internal SLA cron endpoint (reachable by GET from Vercel Cron)
// runs its own transactional state update — re-hydrating module state ahead of it is
// pointless work and must not interleave with that write.
const nonHydratedPaths = new Set([...livenessPaths, '/api/v1/internal/sla/run']);

// Only safe, side-effect-free reads pull the latest snapshot from Postgres. Writes are
// already correct on any instance: PostgresStateRepository.update re-reads the latest row
// inside the transaction under pg_advisory_xact_lock and three-way merges the local delta.
const readMethods = new Set(['GET', 'HEAD']);

export function shouldHydrateRuntimeStatePerRequest(
  env: NodeJS.ProcessEnv,
  requestPath: string,
  method = 'GET',
): boolean {
  if (env.DATA_STORE_MODE !== 'postgres') return false;
  if (!readMethods.has(method.toUpperCase())) return false;
  return !nonHydratedPaths.has(requestPath.split('?')[0]);
}

export class RuntimeRequestLock {
  private tail: Promise<void> = Promise.resolve();

  public async acquire(): Promise<() => void> {
    let releaseTicket!: () => void;
    const ticket = new Promise<void>(resolve => { releaseTicket = resolve; });
    const turn = this.tail;
    this.tail = turn.then(() => ticket);
    await turn;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      releaseTicket();
    };
  }
}
