import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Máy chủ chỉ cho duyệt hoặc đóng lỗi khi mọi ý sai sót đã được chấp nhận. Hàm này đánh giá chấp
 * nhận toàn bộ các ý bằng người duyệt đang giữ bước, rồi trả về phiên bản mới của hồ sơ (mỗi lần
 * đánh giá tăng `version` thêm một).
 */
export async function acceptAllSubItems(
  app: Pick<FastifyInstance, 'inject'>,
  findingId: string,
  reviewerUserId: string,
): Promise<number> {
  const detail = await app.inject({ method: 'GET', url: `/api/v1/findings/${findingId}`, headers: { 'x-user-id': reviewerUserId } });
  expect(detail.statusCode, detail.body).toBe(200);
  const subItems = detail.json().subItems as Array<{ id: string }>;
  const review = await app.inject({
    method: 'POST',
    url: `/api/v1/findings/${findingId}/sub-items/review`,
    headers: { 'x-user-id': reviewerUserId },
    payload: {
      decisions: subItems.map(item => ({ subItemId: item.id, decision: 'ACCEPT' })),
      reviewNote: 'Các ý sai sót đã đủ căn cứ.',
    },
  });
  expect(review.statusCode, review.body).toBe(200);
  return review.json().version as number;
}
