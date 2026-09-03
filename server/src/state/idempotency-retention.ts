/**
 * Idempotency-Key chỉ có tác dụng trong lúc client còn đang thử lại một lệnh.
 *
 * Quá ngưỡng này, giữ bản ghi lại không chống thêm được lần lặp nào — nó chỉ làm phình snapshot mà
 * *mọi* request đều phải đọc và ghi. Trước khi có hạn này, bộ nhớ chống lặp không bao giờ được dọn:
 * 500 người dùng × 20 thao tác/ngày là khoảng 10.000 bản ghi mỗi ngày, cộng dồn vĩnh viễn. Đó là
 * nguồn phình nhanh nhất của snapshot — nhanh hơn cả việc thêm hồ sơ nghiệp vụ.
 */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60_000;

export interface RetainableIdempotencyEntry {
  /** Thời điểm ghi, dạng ISO. Bản ghi từ phiên bản trước khi có hạn lưu không mang trường này. */
  storedAt?: string;
}

/**
 * Bỏ những bản ghi chống lặp đã quá hạn, sửa trực tiếp trên `records`. Trả về số bản ghi đã bỏ, để
 * phía gọi biết có gì thay đổi cần ghi xuống hay không.
 */
export function pruneExpiredIdempotencyRecords(
  records: Record<string, RetainableIdempotencyEntry>,
  nowMs: number = Date.now(),
  retentionMs: number = IDEMPOTENCY_RETENTION_MS,
): number {
  let removed = 0;
  for (const [key, entry] of Object.entries(records)) {
    const storedAtMs = entry.storedAt ? Date.parse(entry.storedAt) : Number.NaN;
    if (Number.isFinite(storedAtMs) && nowMs - storedAtMs < retentionMs) continue;
    // Bản ghi cũ không có `storedAt` thì không thể biết nó bao nhiêu tuổi. Coi như hết hạn: giữ mãi
    // một bản ghi không rõ tuổi chính là cái đã làm snapshot phình lên không giới hạn.
    delete records[key];
    removed += 1;
  }
  return removed;
}
