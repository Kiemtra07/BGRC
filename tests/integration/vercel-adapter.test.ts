import http from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import handler, { getServerlessApp } from '../../server/src/vercel-handler';

vi.hoisted(() => {
  process.env.DATA_STORE_MODE = 'memory';
  process.env.EVIDENCE_STORAGE_MODE = 'local';
});

const server = http.createServer((request, response) => {
  void handler(request, response);
});

let origin = '';

describe('Vercel Fastify adapter', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await (await getServerlessApp()).close();
    delete process.env.DATA_STORE_MODE;
    delete process.env.EVIDENCE_STORAGE_MODE;
  });

  it('forwards a real Node request/response pair into Fastify without listen()', async () => {
    const response = await fetch(`${origin}/api/v1/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'UP' });
  });

  it('initializes the Fastify instance once and exposes readiness', async () => {
    const first = await getServerlessApp();
    const second = await getServerlessApp();
    const response = await fetch(`${origin}/api/v1/ready`);

    expect(first).toBe(second);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ checks: { dataStore: { mode: 'memory' } } });
  });
});
