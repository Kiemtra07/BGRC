import { describe, expect, it } from 'vitest';
import { DurableStateCoordinator } from '../../server/src/state/durable-state-coordinator';

describe('DurableStateCoordinator', () => {
  it('restores the last successful durable state without masking a persistence error', () => {
    const durable = new DurableStateCoordinator({
      findings: [{ id: 'find-1', slaStatus: 'ON_TRACK' }],
      unknownField: { preserved: true },
    });
    let inMemory = {
      findings: [{ id: 'find-1', slaStatus: 'OVERDUE' }],
      unknownField: { preserved: false },
    };
    const persistenceError = new Error('LOCAL_STATE_BUSY');

    expect(() => durable.persist(
      () => { throw persistenceError; },
      restored => { inMemory = restored; },
    )).toThrow(persistenceError);
    expect(inMemory).toEqual({
      findings: [{ id: 'find-1', slaStatus: 'ON_TRACK' }],
      unknownField: { preserved: true },
    });
  });

  it('advances its rollback point only after the persistence operation succeeds', () => {
    const durable = new DurableStateCoordinator({ value: 'hydrated' });
    let restored = { value: 'mutated' };
    durable.persist(() => ({ value: 'saved' }), state => { restored = state; });

    expect(() => durable.persist(
      () => { throw new Error('replacement failed'); },
      state => { restored = state; },
    )).toThrow(/replacement failed/);
    expect(restored).toEqual({ value: 'saved' });
  });

  it('awaits asynchronous Postgres persistence and restores the prior checkpoint on rejection', async () => {
    const durable = new DurableStateCoordinator({ value: 'hydrated' });
    let restored = { value: 'mutated' };

    await expect(durable.persistAsync(
      async () => {
        await Promise.resolve();
        return { value: 'saved-in-postgres' };
      },
      state => { restored = state; },
    )).resolves.toEqual({ value: 'saved-in-postgres' });

    await expect(durable.persistAsync(
      async () => { throw new Error('postgres commit failed'); },
      state => { restored = state; },
    )).rejects.toThrow(/postgres commit failed/);
    expect(restored).toEqual({ value: 'saved-in-postgres' });
  });

  it('returns an isolated checkpoint for three-way serverless merging', () => {
    const durable = new DurableStateCoordinator({ nested: { value: 'base' } });
    const checkpoint = durable.snapshot();
    checkpoint.nested.value = 'mutated-copy';

    expect(durable.snapshot()).toEqual({ nested: { value: 'base' } });
  });

  it('can replace its checkpoint with a freshly hydrated Postgres snapshot', () => {
    const durable = new DurableStateCoordinator({ version: 1, nested: { value: 'cold-start' } });
    const latest = { version: 2, nested: { value: 'database' } };

    durable.hydrate(latest);
    latest.nested.value = 'mutated-caller-copy';

    expect(durable.snapshot()).toEqual({ version: 2, nested: { value: 'database' } });
  });
});
