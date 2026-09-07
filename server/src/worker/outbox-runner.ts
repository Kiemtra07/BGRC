import crypto from 'node:crypto';
import { pool } from '../adapters/postgres';
import { PostgresOutbox, type OutboxEvent } from '../repositories/outbox';
import { OutboxWorker } from './outbox-worker';

function webhookUrl(environmentKey: string): URL {
  const value = process.env[environmentKey];
  if (!value) throw new Error(`${environmentKey}_REQUIRED`);
  const url = new URL(value);
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('NOTIFICATION_WEBHOOK_HTTPS_REQUIRED');
  }
  return url;
}

export function buildEvidenceScannerCallbackUrl(callbackBaseUrl: URL, evidenceId: string): URL {
  const base = new URL(callbackBaseUrl);
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(`${encodeURIComponent(evidenceId)}/complete`, base);
}

async function deliverWebhook(event: OutboxEvent): Promise<void> {
  const url = webhookUrl('NOTIFICATION_WEBHOOK_URL');
  const token = process.env.NOTIFICATION_WEBHOOK_TOKEN;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': event.dedupeKey ?? event.id,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      id: event.id,
      type: event.eventType,
      aggregate: { type: event.aggregateType, id: event.aggregateId },
      payload: event.payload,
    }),
  });
  if (!response.ok) throw new Error(`NOTIFICATION_WEBHOOK_HTTP_${response.status}`);
}

async function deliverEvidenceScanRequest(event: OutboxEvent): Promise<void> {
  const url = webhookUrl('EVIDENCE_SCANNER_WEBHOOK_URL');
  const callbackBaseUrl = webhookUrl('EVIDENCE_SCANNER_CALLBACK_BASE_URL');
  const callbackUrl = buildEvidenceScannerCallbackUrl(callbackBaseUrl, event.aggregateId);
  const token = process.env.EVIDENCE_SCANNER_WEBHOOK_TOKEN;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': event.dedupeKey ?? event.id,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      id: event.id,
      type: event.eventType,
      evidence: event.payload,
      callbackUrl: callbackUrl.toString(),
    }),
  });
  if (!response.ok) throw new Error(`EVIDENCE_SCANNER_WEBHOOK_HTTP_${response.status}`);
}

export async function deliverOutboxEvent(event: OutboxEvent): Promise<void> {
  if (event.eventType === 'EVIDENCE_SCAN_REQUEST') return deliverEvidenceScanRequest(event);
  if (event.eventType === 'STAGED_IMPORT_CHECKPOINT') {
    const { runStagedImportBackgroundCheckpoint } = await import('../app');
    await runStagedImportBackgroundCheckpoint(event.payload);
    return;
  }
  return deliverWebhook(event);
}

export async function runOutboxOnce(): Promise<{ claimed: number; delivered: number; failed: number }> {
  const worker = new OutboxWorker(
    new PostgresOutbox(pool),
    deliverOutboxEvent,
    { workerId: `outbox-${process.env.VERCEL_REGION ?? process.pid}-${crypto.randomUUID()}` },
  );
  return worker.runOnce();
}

if (process.argv[1] && process.argv[1].includes('outbox-runner.ts')) {
  runOutboxOnce()
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error('[Outbox Worker] Delivery run failed.', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
