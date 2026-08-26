import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/src/app';

const serverlessApp = buildApp();

export function getServerlessApp() {
  return serverlessApp;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const app = await serverlessApp;
    app.server.emit('request', request, response);
  } catch (error) {
    appInitializationFailure(response, error);
  }
}

function appInitializationFailure(response: ServerResponse, error: unknown): void {
  console.error('[Vercel] Fastify initialization failed.', error);
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  response.statusCode = 500;
  response.setHeader('content-type', 'application/problem+json; charset=utf-8');
  response.end(JSON.stringify({
    type: 'about:blank',
    title: 'Không thể khởi tạo API',
    status: 500,
    code: 'API_INITIALIZATION_FAILED',
  }));
}
