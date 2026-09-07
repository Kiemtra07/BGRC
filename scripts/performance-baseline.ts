/**
 * Reproducible local baseline for the G0 20k-finding target.
 *
 * This intentionally boots the app in test/memory mode, so it never writes a local snapshot or
 * reaches PostgreSQL, Google Drive, or a remote service. It measures application work only; use
 * the staging runbook for the production acceptance baseline.
 */
process.env.NODE_ENV = 'test';
process.env.DATA_STORE_MODE = 'memory';
process.env.SEED_DEMO_DATA = 'true';

const FINDING_COUNT = 20_000;
// Kept below Fastify's JSON body limit; the API's 5,000-row contract is not a promise that every
// possible wide row fits in one HTTP request.
const BATCH_SIZE = 500;
const LIST_SAMPLES = 50;
const LIST_PAGE_SIZE = 100;

const percentile = (values: number[], percentileValue: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
};

const rowsForBatch = (batchIndex: number) => Array.from({ length: BATCH_SIZE }, (_, index) => {
  const ordinal = batchIndex * BATCH_SIZE + index + 1;
  return {
    channelId: 'chan-audit-bgs',
    cif: `PERF-${String(ordinal).padStart(8, '0')}`,
    customerName: `Khách hàng benchmark ${ordinal}`,
    clusterName: 'Cụm benchmark',
    branchCode: '635',
    branchName: 'Chi nhánh benchmark',
    department: 'Phòng benchmark',
    decisionNo: `QĐ-PERF-${ordinal}`,
    auditDate: '2026-09-05',
    errorCode: 'TD99.99',
    errorTitle: 'Sai sót tổng hợp dùng để đo tải',
    description: 'Dòng dữ liệu tổng hợp chỉ dùng cho baseline hiệu năng cục bộ.',
    exposureAmount: ordinal,
  };
});

const bootStartedAt = performance.now();
const { app } = await import('../server/src/app');
const coldStartMs = performance.now() - bootStartedAt;

try {
  const importDurationsMs: number[] = [];
  for (let batchIndex = 0; batchIndex < FINDING_COUNT / BATCH_SIZE; batchIndex += 1) {
    const startedAt = performance.now();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/findings',
      headers: { 'x-user-id': 'user-internal-officer' },
      payload: {
        sourceFileName: `performance-baseline-${batchIndex + 1}.xlsx`,
        sourceType: 'API_BULK',
        rows: rowsForBatch(batchIndex),
      },
    });
    if (response.statusCode !== 201) throw new Error(`Batch ${batchIndex + 1} failed: ${response.statusCode} ${response.body}`);
    importDurationsMs.push(performance.now() - startedAt);
  }

  const listDurationsMs = await Promise.all(Array.from({ length: LIST_SAMPLES }, async () => {
    const startedAt = performance.now();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/findings?page=1&limit=${LIST_PAGE_SIZE}`,
      headers: { 'x-user-id': 'user-internal-officer' },
    });
    if (response.statusCode !== 200) throw new Error(`List failed: ${response.statusCode} ${response.body}`);
    if (response.json().total < FINDING_COUNT) throw new Error(`Expected at least ${FINDING_COUNT} findings after import.`);
    return performance.now() - startedAt;
  }));

  // Memory mode deliberately has no database adapter. Count that explicitly rather than implying
  // this run measured SQL behavior, then serialize every projected finding page for a reproducible
  // storage-size proxy before the database cutover exists.
  const projectedFindings: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/findings?page=${page}&limit=${LIST_PAGE_SIZE}`,
      headers: { 'x-user-id': 'user-internal-officer' },
    });
    if (response.statusCode !== 200) throw new Error(`Snapshot page ${page} failed: ${response.statusCode} ${response.body}`);
    const result = response.json() as { items: unknown[]; total: number };
    projectedFindings.push(...result.items);
    if (projectedFindings.length >= result.total) break;
  }
  const projectedFindingsBytes = Buffer.byteLength(JSON.stringify(projectedFindings), 'utf8');

  console.log(JSON.stringify({
    mode: 'local test-memory; no PostgreSQL, Drive, or network adapter',
    runState: {
      coldStart: 'fresh Node process before importing the Fastify application',
      warmWorkload: 'imports complete before 50 concurrent list measurements',
    },
    errors: 0,
    generatedFindings: FINDING_COUNT,
    concurrentListRequests: LIST_SAMPLES,
    databaseQueryCount: 0,
    databaseQueryCountNote: 'memory mode has no PostgreSQL adapter; SQL query counts require the staging baseline',
    projectedFindings: {
      count: projectedFindings.length,
      serializedUtf8Bytes: projectedFindingsBytes,
      serializedMiB: Number((projectedFindingsBytes / 1024 / 1024).toFixed(2)),
    },
    coldStartMs: Number(coldStartMs.toFixed(2)),
    importBatchMs: { p50: Number(percentile(importDurationsMs, 0.5).toFixed(2)), p95: Number(percentile(importDurationsMs, 0.95).toFixed(2)) },
    listMs: { p50: Number(percentile(listDurationsMs, 0.5).toFixed(2)), p95: Number(percentile(listDurationsMs, 0.95).toFixed(2)) },
  }, null, 2));
} finally {
  await app.close();
}
