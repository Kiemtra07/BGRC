-- Bảng hồ sơ mà runtime thật sự đọc/ghi được, kèm chỉ mục theo phạm vi người dùng.
--
-- Vì sao không dùng thẳng bảng `findings` của 0020: bảng đó khai `id UUID` và
-- `channel_id UUID REFERENCES report_channels(id)`, trong khi ứng dụng dùng định danh dạng chữ
-- (`find-001`, `chan-audit-bgs-v1`, `batch-<uuid>`). Bốn bảng khác lại có khoá ngoại UUID trỏ vào
-- `findings(id)`, nên đổi kiểu cột đó là kéo theo cả cụm. Đây đúng tình huống mà 0110 đã gặp với
-- workflow_events và đã chọn cách giải: dựng bảng riêng giữ nguyên định danh dạng chữ. Làm lại
-- đúng cách đó ở đây, thay vì bẻ một cụm khoá ngoại chỉ để nhét định danh vào cho vừa.
--
-- `payload` giữ nguyên vẹn bản ghi hồ sơ, nên đường đọc bằng SQL trả về đúng cùng một đối tượng
-- mà đường đọc trong bộ nhớ trả về — điều kiện bắt buộc để bật/tắt được giữa hai đường bằng cờ mà
-- người dùng không thấy khác biệt nào. Các cột phẳng bên cạnh chỉ để lọc, sắp xếp và đánh chỉ mục.
--
-- Chỉ mục tạo bằng CREATE INDEX thường, không phải CONCURRENTLY: db/migrate.ts bọc mỗi migration
-- trong một transaction, mà CONCURRENTLY không chạy được trong transaction block. Bảng mới nên
-- rỗng, tạo tức thì. Khi bảng đã có dữ liệu thật, chỉ mục thêm sau phải chạy CONCURRENTLY ngoài
-- migration runner.

SELECT set_config('app.runtime_role', 'backend', true);

CREATE TABLE IF NOT EXISTS finding_records (
  finding_id      VARCHAR(255) PRIMARY KEY,
  campaign_id     VARCHAR(255),
  channel_id      VARCHAR(255) NOT NULL,
  channel_code    VARCHAR(100),
  cif             VARCHAR(50)  NOT NULL,
  customer_name   VARCHAR(255) NOT NULL,
  cluster_name    VARCHAR(255),
  branch_code     VARCHAR(50),
  branch_name     VARCHAR(255),
  department      VARCHAR(255),
  officer_name    VARCHAR(255),
  error_code      VARCHAR(50)  NOT NULL,
  error_group     VARCHAR(50),
  error_title     VARCHAR(255),
  business_line   VARCHAR(50),
  risk_level      VARCHAR(20),
  workflow_status VARCHAR(50)  NOT NULL,
  sla_status      VARCHAR(50)  NOT NULL,
  is_overdue      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_special_case BOOLEAN      NOT NULL DEFAULT FALSE,
  audit_date      DATE,
  deadline_date   DATE,
  exposure_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit_balance  NUMERIC(20,2) NOT NULL DEFAULT 0,
  version         INT          NOT NULL DEFAULT 1,
  -- Minh chứng nằm ở kho riêng, nhưng bộ lọc "đã có minh chứng" thì chạy trên danh sách hồ sơ.
  -- Đếm sẵn ở đây để bộ lọc đó không phải join sang kho minh chứng ở mỗi lần mở màn hình.
  evidence_count  INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Bản ghi hồ sơ nguyên vẹn. Đường đọc SQL trả thẳng cột này ra.
  payload         JSONB        NOT NULL,
  -- Vân tay nội dung, để lượt đồng bộ bỏ qua những dòng không đổi thay vì ghi lại tất cả.
  content_hash    VARCHAR(64)  NOT NULL,
  CONSTRAINT chk_finding_records_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

-- Ba chỉ mục phủ đúng ba mức phạm vi của hasFindingAccess (CLUSTER, BRANCH, DEPARTMENT).
-- Cột sắp xếp đi kèm là workflow_status/deadline_date vì mọi hàng đợi công việc đều lọc theo trạng
-- thái rồi sắp theo hạn xử lý; gộp vào một chỉ mục thì lọc và sắp xếp dùng chung một lần quét.
CREATE INDEX IF NOT EXISTS idx_finding_records_branch_queue
  ON finding_records (branch_code, workflow_status, deadline_date);

CREATE INDEX IF NOT EXISTS idx_finding_records_cluster_queue
  ON finding_records (cluster_name, workflow_status, deadline_date);

CREATE INDEX IF NOT EXISTS idx_finding_records_dept_queue
  ON finding_records (branch_code, department, workflow_status);

-- Chuyên đề là bộ lọc mặc định của màn hình Báo cáo; chỉ mục một phần vì hồ sơ cũ chưa gắn chuyên đề.
CREATE INDEX IF NOT EXISTS idx_finding_records_campaign
  ON finding_records (campaign_id, workflow_status)
  WHERE campaign_id IS NOT NULL;

-- Thứ tự trả về mặc định của danh sách hồ sơ.
--
-- Đường đọc trong bộ nhớ trả theo thứ tự mảng, tức thứ tự chèn. Đó không phải một thứ tự dùng
-- được cho phân trang: mỗi lần có hồ sơ mới chèn vào đầu mảng là mọi dòng dịch đi một chỗ, nên
-- người đang xem trang 2 thấy lại dòng đã xem ở trang 1. Đường SQL sắp theo ngày tạo giảm dần và
-- phá hoà bằng khoá chính, tức là một thứ tự xác định và ổn định.
CREATE INDEX IF NOT EXISTS idx_finding_records_created
  ON finding_records (created_at DESC, finding_id DESC);

-- Tìm kiếm tự do. Cột dẫn xuất thay vì chỉ mục biểu thức trực tiếp: lower() và || là IMMUTABLE nên
-- GENERATED ... STORED hợp lệ, còn unaccent() thì không và sẽ bị Postgres từ chối. Nếu sau này cần
-- tìm không dấu, phải bọc unaccent trong một hàm IMMUTABLE riêng rồi mới dựng chỉ mục trên nó.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE finding_records
  ADD COLUMN IF NOT EXISTS search_text TEXT
  GENERATED ALWAYS AS (
    lower(
      coalesce(cif, '') || ' ' || coalesce(customer_name, '') || ' ' ||
      coalesce(branch_name, '') || ' ' || coalesce(cluster_name, '') || ' ' ||
      coalesce(error_code, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_finding_records_search
  ON finding_records USING GIN (search_text gin_trgm_ops);

ALTER TABLE public.finding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_finding_records_access ON public.finding_records;
CREATE POLICY backend_finding_records_access
  ON public.finding_records
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.finding_records FROM PUBLIC;
