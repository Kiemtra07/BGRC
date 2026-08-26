import { describe, expect, it } from 'vitest';
import { assertSafeRuntimeConfiguration, buildReadinessPayload } from '../../server/src/app';
import { createLocalStateRepository } from '../../server/src/repositories/local-state';

describe('runtime safety gate', () => {
  it('allows the explicit local development profile', () => {
    expect(() => assertSafeRuntimeConfiguration({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('accepts configured Postgres and Drive API v3, while retaining the cron-secret gate', () => {
    let message = '';
    try {
      assertSafeRuntimeConfiguration({
      NODE_ENV: 'production',
      AUTH_MODE: 'oidc',
      OIDC_ISSUER_URL: 'https://issuer.example',
      OIDC_AUDIENCE: 'audit-bgs',
      DATA_STORE_MODE: 'postgres',
      DATABASE_URL: 'postgresql://example.invalid/audit_bgs',
      EVIDENCE_STORAGE_MODE: 'google-drive',
      GOOGLE_SERVICE_ACCOUNT_KEY: '{}',
      GOOGLE_DRIVE_ROOT_FOLDER_ID: 'folder-id',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/CRON_SECRET/i);
    expect(message).not.toMatch(/Google Drive API v3/i);
    expect(message).not.toMatch(/local JSON repository/i);
  });

  it('reports the configured memory store as non-durable instead of claiming atomic JSON persistence', () => {
    const repository = createLocalStateRepository<{ ok: boolean }>({
      dataStoreMode: 'memory',
      filePath: './data/runtime-safety-memory.json',
    });

    const readiness = buildReadinessPayload(repository.getStatus(), {
      mode: 'local',
      durable: true,
      ready: true,
    });

    expect(readiness.checks.dataStore).toEqual({ mode: 'memory', durable: false });
    expect(readiness.message).toMatch(/bộ nhớ/i);
    expect(readiness.message).not.toMatch(/JSON nguyên tử/i);
  });

  it('keeps the explicit local-json store durable in readiness', () => {
    const repository = createLocalStateRepository<{ ok: boolean }>({
      dataStoreMode: 'local-json',
      filePath: './data/runtime-safety-local.json',
    });

    const readiness = buildReadinessPayload(repository.getStatus(), {
      mode: 'local',
      durable: true,
      ready: true,
    });

    expect(readiness.checks.dataStore).toEqual({ mode: 'local-json', durable: true });
    expect(readiness.checks.auth).toEqual({ mode: 'local-credential-session', productionSafe: false });
  });

  it('reports live Postgres durability accurately and fails readiness when its probe fails', () => {
    const ready = buildReadinessPayload({ mode: 'postgres', durable: true, ready: true }, {
      mode: 'local',
      durable: true,
      ready: true,
    });
    expect(ready.checks.dataStore).toEqual({ mode: 'postgres', durable: true, ready: true });
    expect(ready.message).toMatch(/Postgres.*kết nối/i);

    const unavailable = buildReadinessPayload({
      mode: 'postgres',
      durable: false,
      ready: false,
      warning: 'POSTGRES_UNAVAILABLE — connection refused',
    }, {
      mode: 'local',
      durable: true,
      ready: true,
    });
    expect(unavailable.ready).toBe(false);
    expect(unavailable.message).toMatch(/Postgres.*không sẵn sàng/i);
  });

  it('reports readiness false when Google Drive is selected but its adapter is unavailable', () => {
    const readiness = buildReadinessPayload({ mode: 'local-json', durable: true }, {
      mode: 'google-drive',
      durable: false,
      ready: false,
      warning: 'Thiếu cấu hình Google Drive; adapter API v3 cũng chưa được cài đặt.',
    });

    expect(readiness).toMatchObject({
      status: 'DEGRADED',
      ready: false,
      checks: { evidenceStorage: { mode: 'google-drive', ready: false } },
    });
    expect(readiness.message).toMatch(/Google Drive.*chưa sẵn sàng/i);
  });

  it('reports readiness false for a misconfigured evidence mode without implying a local fallback', () => {
    const readiness = buildReadinessPayload({ mode: 'memory', durable: false }, {
      mode: 'misconfigured',
      durable: false,
      ready: false,
      warning: 'EVIDENCE_STORAGE_MODE=invalid-mode không hợp lệ; hệ thống không fallback local.',
    });

    expect(readiness).toMatchObject({
      status: 'DEGRADED',
      ready: false,
      checks: { evidenceStorage: { mode: 'misconfigured', ready: false } },
    });
    expect(readiness.message).toMatch(/lưu minh chứng.*không hợp lệ/i);
    expect(readiness.message).not.toMatch(/sẵn sàng/i);
  });
});

describe('demo data must not reach production', () => {
  const productionBase = {
    NODE_ENV: 'production',
    AUTH_MODE: 'oidc',
    OIDC_ISSUER_URL: 'https://issuer.example',
    OIDC_AUDIENCE: 'audit-bgs',
    DATA_STORE_MODE: 'postgres',
    DATABASE_URL: 'postgresql://example.invalid/audit_bgs',
    CRON_SECRET: 'cron-secret-value',
    EVIDENCE_STORAGE_MODE: 'google-drive',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
    GOOGLE_DRIVE_ROOT_FOLDER_ID: 'folder-id',
    BOOTSTRAP_ADMIN_USERNAME: 'quantri',
    BOOTSTRAP_ADMIN_PASSWORD_HASH: 'scrypt$salt$key',
  };

  it('refuses to start production with demo seeding enabled', () => {
    expect(() => assertSafeRuntimeConfiguration({ ...productionBase, SEED_DEMO_DATA: 'true' }))
      .toThrow(/SEED_DEMO_DATA/);
  });

  it('refuses production without a bootstrap administrator, which would lock everyone out', () => {
    const { BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD_HASH, ...withoutAdmin } = productionBase;
    expect(() => assertSafeRuntimeConfiguration(withoutAdmin)).toThrow(/BOOTSTRAP_ADMIN/);
  });

  it('accepts production with seeding off and a bootstrap administrator supplied', () => {
    expect(() => assertSafeRuntimeConfiguration(productionBase)).not.toThrow();
  });
});
