export class DurableStateCoordinator<T> {
  private lastDurableState: T;

  public constructor(hydratedState: T) {
    this.lastDurableState = structuredClone(hydratedState);
  }

  public snapshot(): T {
    return structuredClone(this.lastDurableState);
  }

  public hydrate(state: T): void {
    this.lastDurableState = structuredClone(state);
  }

  public persist(write: () => T, restore: (state: T) => void): T {
    try {
      const savedState = write();
      this.lastDurableState = structuredClone(savedState);
      return savedState;
    } catch (error) {
      restore(structuredClone(this.lastDurableState));
      throw error;
    }
  }

  public async persistAsync(write: () => Promise<T>, restore: (state: T) => void): Promise<T> {
    try {
      const savedState = await write();
      this.lastDurableState = structuredClone(savedState);
      return savedState;
    } catch (error) {
      restore(structuredClone(this.lastDurableState));
      throw error;
    }
  }
}
