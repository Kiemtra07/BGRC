import { assertDatabaseConfigured, pool } from '../adapters/postgres';
import { createLocalStateRepository, LocalStateRepository } from './local-state';
import {
  PostgresPoolLike,
  PostgresStateStatus,
  PostgresStateRepository,
} from './postgres-state';

export type StateRepository<T> = LocalStateRepository<T> | PostgresStateRepository<T>;
export type StateRepositoryStatus = ReturnType<LocalStateRepository<unknown>['getStatus']> | PostgresStateStatus;

export interface ConfiguredStateRepositoryOptions {
  filePath: string;
  dataStoreMode?: string;
  persistenceEnabled?: boolean;
  postgresPool?: PostgresPoolLike;
  snapshotId?: string;
}

export function createStateRepository<T>(options: ConfiguredStateRepositoryOptions): StateRepository<T> {
  const dataStoreMode = options.dataStoreMode ?? 'local-json';
  if (dataStoreMode === 'postgres') {
    if (!options.postgresPool) assertDatabaseConfigured();
    return new PostgresStateRepository<T>({
      pool: options.postgresPool ?? pool as unknown as PostgresPoolLike,
      snapshotId: options.snapshotId,
    });
  }
  if (dataStoreMode === 'local-json' || dataStoreMode === 'memory') {
    return createLocalStateRepository<T>({
      filePath: options.filePath,
      dataStoreMode,
      persistenceEnabled: options.persistenceEnabled,
    });
  }
  throw new Error(
    `INVALID_DATA_STORE_MODE: DATA_STORE_MODE must be postgres, local-json or memory; received ${dataStoreMode}.`,
  );
}
