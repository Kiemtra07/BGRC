import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app';

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

/**
 * Chi tiết lỗi chỉ đi vào log của hàm, không đi vào phản hồi. Lỗi khởi tạo hay gặp nhất ở đây là
 * `UNSAFE_PRODUCTION_CONFIGURATION` — nó liệt kê đúng những biến môi trường còn thiếu, và
 * `assertSafeRuntimeConfiguration` chạy trước khi có bất kỳ xác thực nào, nên trả nguyên văn ra
 * ngoài đồng nghĩa với việc công bố bản đồ cấu hình cho người gọi ẩn danh. Lỗi kết nối database
 * cũng rơi vào đây và mang theo host/user.
 */
function appInitializationFailure(response: ServerResponse, error: unknown): void {
  console.error('[Vercel] Fastify initialization failed.', error);
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  response.statusCode = 500;
  response.setHeader('content-type', 'application/problem+json; charset=utf-8');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify({
    type: 'about:blank',
    title: 'Không thể khởi tạo API',
    status: 500,
    code: 'API_INITIALIZATION_FAILED',
    detail: 'Máy chủ chưa khởi tạo được. Quản trị viên hãy kiểm tra log triển khai để biết chi tiết.',
  }));
}
