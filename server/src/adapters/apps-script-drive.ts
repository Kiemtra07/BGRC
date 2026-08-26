import crypto from 'node:crypto';
import { HttpProblem } from '../http/problem';

export type DriveCommand =
  | 'PING'
  | 'PROVISION_CAMPAIGN'
  | 'ENSURE_CUSTOMER_FOLDER'
  | 'ENSURE_ERROR_FOLDER'
  | 'SYNC_CAMPAIGN_ACL'
  | 'REVOKE_CAMPAIGN_ACCESS';

interface UnsignedDriveRequest {
  action: DriveCommand;
  payload: Record<string, unknown>;
  timestamp: number;
  nonce: string;
}

interface SignedDriveRequest extends UnsignedDriveRequest {
  signature: string;
}

interface AppsScriptResponse<T> {
  ok: boolean;
  requestId?: string;
  data: T;
  error?: { code?: string; message?: string };
}

interface AppsScriptDriveGatewayOptions {
  endpointUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function signDriveRequest(request: UnsignedDriveRequest, secret: string): SignedDriveRequest {
  const canonicalPayload = canonicalJson(request.payload);
  const message = `${request.timestamp}.${request.nonce}.${request.action}.${canonicalPayload}`;
  return {
    ...request,
    signature: crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex'),
  };
}

export class AppsScriptDriveGateway {
  private readonly endpointUrl: string;
  private readonly secret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly nonce: () => string;
  private readonly timeoutMs: number;

  constructor(options: AppsScriptDriveGatewayOptions = {}) {
    this.endpointUrl = options.endpointUrl ?? process.env.GOOGLE_APPS_SCRIPT_URL ?? '';
    this.secret = options.secret ?? process.env.GOOGLE_APPS_SCRIPT_SECRET ?? '';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.nonce = options.nonce ?? crypto.randomUUID;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  public isConfigured(): boolean {
    return Boolean(this.endpointUrl && this.secret);
  }

  public async execute<T extends Record<string, unknown> = Record<string, unknown>>(
    action: DriveCommand,
    payload: Record<string, unknown>,
  ): Promise<AppsScriptResponse<T>> {
    if (!this.isConfigured()) {
      throw new HttpProblem(
        503,
        'DRIVE_NOT_CONFIGURED',
        'Google Drive chưa được cấu hình',
        'Quản trị viên cần khai báo URL Apps Script và khóa bí mật trước khi tạo kho dữ liệu.',
      );
    }

    const request = signDriveRequest({
      action,
      payload,
      timestamp: this.now(),
      nonce: this.nonce(),
    }, this.secret);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpointUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(request),
        redirect: 'follow',
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as AppsScriptResponse<T> | null;
      if (!response.ok || !result?.ok || !result.data) {
        throw new HttpProblem(
          502,
          result?.error?.code ?? 'DRIVE_GATEWAY_FAILED',
          'Không thể cập nhật Google Drive',
          result?.error?.message ?? 'Apps Script không trả về kết quả hợp lệ.',
        );
      }
      return result;
    } catch (error) {
      if (error instanceof HttpProblem) throw error;
      const timedOut = error instanceof Error && error.name === 'AbortError';
      throw new HttpProblem(
        503,
        timedOut ? 'DRIVE_GATEWAY_TIMEOUT' : 'DRIVE_GATEWAY_UNAVAILABLE',
        'Google Drive tạm thời không khả dụng',
        timedOut ? 'Apps Script không phản hồi trong thời gian cho phép.' : 'Không thể kết nối tới Apps Script.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export const appsScriptDriveGateway = new AppsScriptDriveGateway();
