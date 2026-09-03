-- Chuẩn bị bảng findings cho luồng đọc bằng SQL theo phạm vi người dùng.
--
-- Bảng findings dựng ở 0020, trước hợp đồng Finding hiện tại. Hai bộ lọc mà màn hình đang cho
-- người dùng chọn — riskLevel và businessLine — chưa có cột tương ứng, nên nếu chuyển luồng đọc
-- sang SQL trước khi có chúng thì mỗi lần lọc là một lần quét tuần tự toàn bảng.
--
-- Chỉ mục ở đây tạo bằng CREATE INDEX thường, không phải CONCURRENTLY: db/migrate.ts bọc mỗi
-- migration trong một transaction, mà CONCURRENTLY không chạy được trong transaction block. Điều
-- này an toàn ở thời điểm hiện tại vì ứng dụng chưa từng ghi vào bảng findings — bảng đang rỗng.
-- Khi bảng đã có dữ liệu thật, mọi chỉ mục thêm sau phải chạy CONCURRENTLY ngoài migration runner.

-- 1. Cột còn thiếu so với hợp đồng Finding
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS risk_level            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS business_line         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS inspection_team_code  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_record_code    VARCHAR(60),
  ADD COLUMN IF NOT EXISTS penalty_proposal_code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS reference_document    VARCHAR(500),
  ADD COLUMN IF NOT EXISTS is_special_case       BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ba chỉ mục phủ ba mức phạm vi trong hasFindingAccess.
--    Cột sắp xếp đi kèm là deadline_date/workflow_status vì mọi hàng đợi công việc đều đọc theo
--    trạng thái rồi tới hạn xử lý; gộp vào một chỉ mục thì lọc và sắp xếp dùng chung một lần quét.
CREATE INDEX IF NOT EXISTS idx_findings_branch_queue
  ON findings (branch_code, workflow_status, deadline_date);

CREATE INDEX IF NOT EXISTS idx_findings_cluster_queue
  ON findings (cluster_name, workflow_status, deadline_date);

CREATE INDEX IF NOT EXISTS idx_findings_dept_queue
  ON findings (branch_code, department, workflow_status);

-- Chuyên đề là bộ lọc mặc định của màn hình Báo cáo; chỉ mục một phần vì hồ sơ cũ chưa gắn chuyên đề.
CREATE INDEX IF NOT EXISTS idx_findings_campaign_status
  ON findings (campaign_id, workflow_status)
  WHERE campaign_id IS NOT NULL;

-- 3. Tìm kiếm tự do.
--    Cột dẫn xuất thay vì đánh chỉ mục biểu thức trực tiếp: lower() và || là IMMUTABLE nên
--    GENERATED ... STORED hợp lệ, còn unaccent() thì không và sẽ bị Postgres từ chối. Nếu sau này
--    cần tìm không dấu, phải bọc unaccent trong một hàm IMMUTABLE riêng rồi mới dựng chỉ mục.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS search_text TEXT
  GENERATED ALWAYS AS (
    lower(
      COALESCE(cif, '') || ' ' || COALESCE(customer_name, '') || ' ' ||
      COALESCE(branch_name, '') || ' ' || COALESCE(error_code, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_findings_search
  ON findings USING GIN (search_text gin_trgm_ops);

-- 4. Chỉ mục phục vụ khoá lạc quan khi luồng ghi chuyển sang UPDATE một dòng.
--    (id, version) cho phép UPDATE ... WHERE id = $1 AND version = $2 kết thúc bằng một lần tra
--    chỉ mục, thay vì đọc dòng rồi mới so version.
CREATE INDEX IF NOT EXISTS idx_findings_id_version
  ON findings (id, version);
