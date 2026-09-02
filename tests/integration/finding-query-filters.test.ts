import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

/**
 * Bộ lọc hồ sơ từng chạy trên trình duyệt trong `QueueFilterPanel`. Nó đã được gộp vào khung tìm
 * kiếm duy nhất và chuyển hẳn xuống máy chủ, nên bài kiểm tra cũng đi theo: gọi thẳng endpoint để
 * đo đúng thứ đang chạy, kể cả phần minh chứng — thứ nằm ở kho riêng chứ không gắn trên hồ sơ và
 * vì thế bộ lọc cũ trên trình duyệt không bao giờ đọc đúng.
 *
 * Mỗi điều kiện được kiểm bằng một cặp: một giá trị phải khớp và một giá trị phải loại sạch. Chỉ
 * kiểm chiều khớp thì một bộ lọc bị bỏ quên hoàn toàn vẫn qua bài.
 */
const adminHeaders = { 'x-user-id': 'user-admin' };

async function query(params: Record<string, string>): Promise<{ total: number; codes: string[] }> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/findings?${new URLSearchParams({ ...params, limit: '100' })}`,
    headers: adminHeaders,
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as { total: number; items: Array<{ errorCode: string }> };
  return { total: body.total, codes: body.items.map(item => item.errorCode) };
}

describe('Bộ lọc danh sách hồ sơ phía máy chủ', () => {
  afterAll(async () => {
    await app.close();
  });

  it('trả về toàn bộ phạm vi khi không kèm điều kiện nào', async () => {
    const all = await query({});
    expect(all.total).toBeGreaterThan(0);
  });

  it('lọc theo chi nhánh, phòng và cụm', async () => {
    const all = await query({});
    for (const field of ['branchCode', 'department', 'clusterName'] as const) {
      const sample = await app.inject({ method: 'GET', url: '/api/v1/findings?limit=100', headers: adminHeaders });
      const items = (sample.json() as { items: Array<Record<string, string | undefined>> }).items;
      const present = items.map(item => item[field]).find(Boolean);
      if (!present) continue;

      const matching = await query({ [field]: present });
      expect(matching.total).toBeGreaterThan(0);
      expect(matching.total).toBeLessThanOrEqual(all.total);

      const impossible = await query({ [field]: `${present}-khong-ton-tai` });
      expect(impossible.total).toBe(0);
    }
  });

  it('lọc theo mã lỗi và loại sạch khi mã không tồn tại', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/v1/findings?limit=100', headers: adminHeaders });
    const firstCode = (all.json() as { items: Array<{ errorCode: string }> }).items[0].errorCode;

    const matching = await query({ errorCode: firstCode });
    expect(matching.total).toBeGreaterThan(0);
    expect(matching.codes.every(code => code === firstCode)).toBe(true);

    expect((await query({ errorCode: 'KHONG-CO-MA-NAY' })).total).toBe(0);
  });

  it('coi cờ isOverdue là quá hạn kể cả khi slaStatus chưa kịp cập nhật', async () => {
    const overdue = await app.inject({ method: 'GET', url: '/api/v1/findings?slaStatus=OVERDUE&limit=100', headers: adminHeaders });
    const items = (overdue.json() as { items: Array<{ isOverdue?: boolean; slaStatus: string }> }).items;
    expect(items.every(item => item.isOverdue || item.slaStatus === 'OVERDUE')).toBe(true);

    // Chiều ngược lại: "trong hạn" không được lẫn hồ sơ đã bật cờ trễ.
    const onTrack = await app.inject({ method: 'GET', url: '/api/v1/findings?slaStatus=ON_TRACK&limit=100', headers: adminHeaders });
    const onTrackItems = (onTrack.json() as { items: Array<{ isOverdue?: boolean }> }).items;
    expect(onTrackItems.some(item => item.isOverdue)).toBe(false);
  });

  it('giữ lại đúng hồ sơ chưa đóng khi bật "chỉ chưa xử lý"', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/findings?unresolvedOnly=true&limit=100', headers: adminHeaders });
    const items = (response.json() as { items: Array<{ workflowStatus: string }> }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(item => item.workflowStatus === 'WAIVED_RESOLVED')).toBe(false);
  });

  it('chia đúng hai nửa theo tình trạng minh chứng', async () => {
    const all = await query({});
    const withEvidence = await query({ hasEvidence: 'YES' });
    const withoutEvidence = await query({ hasEvidence: 'NO' });

    // Hai nửa phải phủ kín và không chồng lấn — đây là điều bộ lọc cũ trên trình duyệt làm sai:
    // nó đọc `finding.evidences`, trường mà endpoint danh sách không trả về, nên nhánh "YES" luôn rỗng.
    expect(withEvidence.total + withoutEvidence.total).toBe(all.total);
    expect(withEvidence.total).toBeGreaterThan(0);
  });

  it('áp dụng khoảng ngày kiểm tra theo cả hai đầu mút', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/v1/findings?limit=100', headers: adminHeaders });
    const items = (all.json() as { items: Array<{ auditDate?: string; createdAt: string }> }).items;
    const day = items.map(item => item.auditDate || item.createdAt.slice(0, 10)).sort()[0];

    expect((await query({ dateFrom: day, dateTo: day })).total).toBeGreaterThan(0);
    expect((await query({ dateTo: '1999-01-01' })).total).toBe(0);
    expect((await query({ dateFrom: '2999-01-01' })).total).toBe(0);
  });

  it('cộng dồn nhiều điều kiện thay vì để điều kiện sau ghi đè điều kiện trước', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/v1/findings?limit=100', headers: adminHeaders });
    const first = (all.json() as { items: Array<{ branchCode: string; errorCode: string }> }).items[0];

    const combined = await query({ branchCode: first.branchCode, errorCode: first.errorCode });
    const byBranch = await query({ branchCode: first.branchCode });
    expect(combined.total).toBeGreaterThan(0);
    expect(combined.total).toBeLessThanOrEqual(byBranch.total);

    // Hai điều kiện loại trừ nhau phải cho tập rỗng, chứ không phải kết quả của điều kiện cuối.
    expect((await query({ branchCode: first.branchCode, errorCode: 'KHONG-CO-MA-NAY' })).total).toBe(0);
  });

  it('thẻ số tổng quan đọc cùng bộ lọc với danh sách', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/v1/findings?limit=100', headers: adminHeaders });
    const branchCode = (all.json() as { items: Array<{ branchCode: string }> }).items[0].branchCode;

    const list = await query({ branchCode });
    const summary = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboards/summary?branchCode=${encodeURIComponent(branchCode)}`,
      headers: adminHeaders,
    });
    expect((summary.json() as { totalFindings: number }).totalFindings).toBe(list.total);
  });
});
