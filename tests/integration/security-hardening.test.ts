import { describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

/**
 * Khoá lại các biện pháp phòng thủ được bổ sung sau đợt rà soát bảo mật. Mỗi test ở đây tương ứng
 * một đường tấn công đã xác minh được, nên nếu một test đổ thì đó là lỗ hổng quay lại chứ không
 * phải chi tiết cài đặt thay đổi.
 */
describe('security hardening', () => {
  describe('chống dò mật khẩu', () => {
    it('khoá tạm tên đăng nhập sau nhiều lần sai và trả 429 thay vì tiếp tục nhận đoán', async () => {
      const username = `khoa.thu.${Date.now()}`;
      const attempt = () => app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username, password: 'mat-khau-sai-hoan-toan' },
      });

      const statuses: number[] = [];
      for (let index = 0; index < 10; index += 1) {
        statuses.push((await attempt()).statusCode);
      }

      expect(statuses.slice(0, 7)).toEqual(Array(7).fill(401));
      expect(statuses.at(-1)).toBe(429);

      const locked = await attempt();
      expect(locked.statusCode).toBe(429);
      expect(locked.json().code).toBe('LOGIN_TEMPORARILY_LOCKED');
    });

    /**
     * Bộ đếm phải chạy cho cả tên đăng nhập không tồn tại. Nếu chỉ khoá tài khoản có thật thì
     * chênh lệch giữa 401 và 429 trở thành máy dò xem username nào đã được cấp.
     */
    it('không để phản hồi khoá tài khoản tiết lộ tài khoản nào tồn tại', async () => {
      const drain = async (username: string) => {
        let last = 0;
        for (let index = 0; index < 9; index += 1) {
          last = (await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { username, password: 'sai-mat-khau' },
          })).statusCode;
        }
        return last;
      };

      const existing = await drain(`admin.hethong.${Date.now()}.a`);
      const missing = await drain(`khong-ton-tai-${Date.now()}-b`);

      expect(existing).toBe(429);
      expect(missing).toBe(429);
    });
  });

  describe('header bảo mật', () => {
    it('gắn CSP, nosniff và chặn nhúng iframe lên mọi phản hồi API', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('phục vụ minh chứng', () => {
    /**
     * Kho Drive được chia sẻ cho người thật, nên metadata nó trả về là dữ liệu không đáng tin.
     * Kiểu nội dung phải lấy từ bản ghi minh chứng đã qua kiểm tra lúc tải lên, kèm nosniff, nếu
     * không một tệp bị thay bằng HTML sẽ chạy như script trên chính origin của ứng dụng.
     */
    it('ghim kiểu nội dung theo bản ghi minh chứng và chặn trình duyệt tự đoán kiểu', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/evidence/drive_mock_001/content',
        headers: { 'x-user-id': 'user-admin' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toContain('inline');
    });
  });

  describe('nhật ký an ninh', () => {
    it('ghi lại việc xuất dữ liệu và tải minh chứng vào nhật ký quản trị', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/reports/findings.csv',
        headers: { 'x-user-id': 'user-admin' },
      });
      await app.inject({
        method: 'GET',
        url: '/api/v1/evidence/drive_mock_001/content',
        headers: { 'x-user-id': 'user-admin' },
      });

      const auditTrail = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { 'x-user-id': 'user-admin' },
      });

      const eventTypes = auditTrail.json().items.map((entry: { eventType: string }) => entry.eventType);
      expect(eventTypes).toContain('DATA_REPORT_EXPORTED');
      expect(eventTypes).toContain('DATA_EVIDENCE_DOWNLOADED');
    });

    it('ghi lại cả lần đăng nhập thất bại kèm tên đăng nhập đã thử', async () => {
      const username = `nhat-ky-${Date.now()}`;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username, password: 'sai-mat-khau' },
      });

      const auditTrail = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-events',
        headers: { 'x-user-id': 'user-admin' },
      });

      const failure = auditTrail.json().items
        .find((entry: { eventType: string; targetEntity: string }) => (
          entry.eventType === 'AUTH_LOGIN_FAILED' && entry.targetEntity === username
        ));
      expect(failure).toBeTruthy();
    });
  });

  describe('rò rỉ thông tin chẩn đoán', () => {
    it('không trả chi tiết lỗi hạ tầng cho người gọi chưa đăng nhập ở /ready', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      // Thông điệp lỗi nguyên bản của pg thường chứa host/cổng/user; không được xuất hiện ở đây.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/postgres(ql)?:\/\//i);
      expect(serialized).not.toMatch(/ENOTFOUND|ECONNREFUSED|password authentication/i);
    });
  });
});
