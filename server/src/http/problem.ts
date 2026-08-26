import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { StateMergeConflictError } from '../state/three-way-state-merge';

export class HttpProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    detail: string,
    public readonly invalidParams?: Array<{ name: string; reason: string }>,
  ) {
    super(detail);
    this.name = 'HttpProblem';
  }
}

const titleByCode: Record<string, string> = {
  FINDING_IS_TERMINAL: 'Hồ sơ đã đóng',
  FORBIDDEN: 'Không đủ quyền thực hiện',
  INVALID_TRANSITION: 'Chuyển trạng thái không hợp lệ',
  VERSION_CONFLICT: 'Xung đột phiên bản hồ sơ',
  UNKNOWN_COMMAND: 'Lệnh workflow không hợp lệ',
};

export function workflowErrorToProblem(error: unknown): HttpProblem {
  if (error instanceof HttpProblem) return error;

  const message = error instanceof Error ? error.message : String(error);
  const match = /^(\d{3}):\s*([A-Z0-9_]+)\s*—\s*(.+)$/s.exec(message);
  if (!match) {
    return new HttpProblem(500, 'INTERNAL_ERROR', 'Lỗi xử lý workflow', 'Không thể hoàn tất lệnh workflow.');
  }

  const status = Number(match[1]);
  const code = match[2];
  return new HttpProblem(status, code, titleByCode[code] ?? 'Lỗi workflow', match[3]);
}

export function normalizeProblem(error: unknown): HttpProblem {
  if (error instanceof HttpProblem) return error;
  if (error instanceof StateMergeConflictError) {
    return new HttpProblem(
      409,
      error.code,
      'Xung đột cập nhật đồng thời',
      'Dữ liệu vừa được thay đổi ở một phiên khác. Hãy tải lại dữ liệu mới nhất rồi thử lại.',
      [{ name: error.conflictPath, reason: 'Trường này đã thay đổi sau snapshot của yêu cầu.' }],
    );
  }
  if (error instanceof ZodError) {
    return new HttpProblem(
      422,
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ',
      'Yêu cầu chứa dữ liệu thiếu hoặc sai định dạng.',
      error.issues.map(issue => ({
        name: issue.path.join('.') || 'body',
        reason: issue.message,
      })),
    );
  }
  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number(error.statusCode)
    : NaN;
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return new HttpProblem(
      statusCode,
      'INVALID_REQUEST_BODY',
      'Yêu cầu không hợp lệ',
      'Nội dung hoặc định dạng yêu cầu không hợp lệ.',
    );
  }

  return new HttpProblem(500, 'INTERNAL_ERROR', 'Lỗi máy chủ', 'Đã xảy ra lỗi ngoài dự kiến.');
}

function problemType(code: string): string {
  return `https://audit-bgs.local/problems/${code.toLowerCase().replaceAll('_', '-')}`;
}

export function sendProblem(
  reply: FastifyReply,
  problem: HttpProblem,
  request?: FastifyRequest,
) {
  return reply
    .status(problem.status)
    .type('application/problem+json')
    .send({
      type: problemType(problem.code),
      title: problem.title,
      status: problem.status,
      detail: problem.message,
      instance: request?.url,
      code: problem.code,
      ...(problem.invalidParams ? { invalidParams: problem.invalidParams } : {}),
    });
}
