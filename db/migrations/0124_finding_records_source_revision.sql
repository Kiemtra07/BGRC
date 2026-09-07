-- Projection có thể hoàn tất sau một snapshot mới hơn. Revision nguồn bảo đảm lượt chiếu cũ
-- không ghi lùi hoặc xoá dòng mà snapshot mới đã thay thế/tạo ra.
ALTER TABLE finding_records
  ADD COLUMN IF NOT EXISTS source_revision BIGINT NOT NULL DEFAULT 0;
