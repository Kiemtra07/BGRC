-- Đưa nhật ký an ninh ra khỏi snapshot JSON nóng.
--
-- securityEvents nằm chung một dòng JSONB với toàn bộ dữ liệu nghiệp vụ, nên mỗi lần ghi một sự
-- kiện là một lần đọc + gộp + ghi đè cả snapshot. Hệ quả nhìn thấy được: hai endpoint GET
-- (xem minh chứng, xuất CSV) phải ghi lại toàn bộ state chỉ để lưu một dòng nhật ký.
--
-- Sổ append-only này theo đúng khuôn workflow_event_ledger ở 0110: id giữ nguyên dạng text vì
-- ứng dụng dùng định danh riêng (sec-<uuid>), và trigger chặn UPDATE/DELETE ở tầng database để
-- nhật ký an ninh không thể bị sửa từ phía ứng dụng.

SELECT set_config('app.runtime_role', 'backend', true);

CREATE TABLE IF NOT EXISTS security_event_ledger (
  event_id      VARCHAR(255) PRIMARY KEY,
  event_type    VARCHAR(100) NOT NULL,
  outcome       VARCHAR(20)  NOT NULL,
  detail        TEXT         NOT NULL,
  actor_user_id VARCHAR(255),
  actor_name    VARCHAR(255),
  actor_role    VARCHAR(100),
  subject       VARCHAR(500),
  ip_address    VARCHAR(100),
  occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Màn hình Nhật ký đọc theo thứ tự thời gian giảm dần và phân trang; đây là chỉ mục phục vụ nó.
CREATE INDEX IF NOT EXISTS idx_security_event_ledger_occurred
  ON security_event_ledger(occurred_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS idx_security_event_ledger_actor
  ON security_event_ledger(actor_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_security_event_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'security_event_ledger is immutable. UPDATE or DELETE is forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_security_event_ledger ON public.security_event_ledger;
CREATE TRIGGER trg_immutable_security_event_ledger
BEFORE UPDATE OR DELETE ON public.security_event_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_security_event_ledger_modification();

-- Chuyển nguyên các sự kiện đang nằm trong snapshot sang sổ, giữ đúng id cũ.
INSERT INTO security_event_ledger(
  event_id, event_type, outcome, detail,
  actor_user_id, actor_name, actor_role, subject, ip_address, occurred_at
)
SELECT
  COALESCE(NULLIF(event_data->>'id', ''), 'legacy-' || md5(event_data::text)),
  COALESCE(NULLIF(event_data->>'type', ''), 'UNKNOWN'),
  COALESCE(NULLIF(event_data->>'outcome', ''), 'SUCCESS'),
  COALESCE(event_data->>'detail', ''),
  NULLIF(event_data->>'actorUserId', ''),
  NULLIF(event_data->>'actorName', ''),
  NULLIF(event_data->>'actorRole', ''),
  NULLIF(event_data->>'subject', ''),
  NULLIF(event_data->>'ipAddress', ''),
  CASE
    WHEN event_data->>'occurredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      THEN (event_data->>'occurredAt')::timestamptz
    ELSE NOW()
  END
FROM app_state_snapshots AS snapshot
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(snapshot.payload->'securityEvents') = 'array'
      THEN snapshot.payload->'securityEvents'
    ELSE '[]'::jsonb
  END
) AS event_data
WHERE snapshot.id = 'primary'
ON CONFLICT (event_id) DO NOTHING;

-- Chỉ sau khi backfill thành công mới gỡ mảng khỏi snapshot nóng.
UPDATE app_state_snapshots
SET payload = payload - 'securityEvents',
    version = version + 1,
    updated_at = NOW()
WHERE id = 'primary' AND payload ? 'securityEvents';

ALTER TABLE public.security_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_event_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backend_security_event_ledger_access ON public.security_event_ledger;
CREATE POLICY backend_security_event_ledger_access
  ON public.security_event_ledger
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');
REVOKE ALL ON public.security_event_ledger FROM PUBLIC;
