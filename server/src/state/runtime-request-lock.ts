const livenessPaths = new Set(['/api/v1/health', '/api/v1/ready']);

export function shouldHydrateRuntimeStatePerRequest(env: NodeJS.ProcessEnv, requestPath: string): boolean {
  if (env.DATA_STORE_MODE !== 'postgres') return false;
  return !livenessPaths.has(requestPath.split('?')[0]);
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
