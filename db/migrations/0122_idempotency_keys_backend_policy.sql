-- Cho backend runtime quyền dùng idempotency_keys, và chỉ backend.
--
-- Bảng này dựng từ 0003 nhưng ứng dụng chưa bao giờ chạm tới: bộ nhớ chống xử lý lặp vẫn nằm
-- trong snapshot JSON. Khi runtime bắt đầu đọc/ghi bảng thật, nó cần một policy tường minh.
--
-- 0090 chỉ ENABLE ROW LEVEL SECURITY (không FORCE) rồi REVOKE, tức là dựa vào việc chủ sở hữu bảng
-- đi vòng qua RLS. Đó là giả định về vai trò kết nối của runtime, và giả định thì không nên nằm
-- giữa dữ liệu với quyền truy cập. Ở đây khai báo thẳng theo đúng khuôn app_state_snapshots ở 0080:
-- FORCE cộng một policy chỉ mở cho `app.runtime_role = 'backend'`, nên bảng hoạt động đúng dù
-- runtime có phải chủ sở hữu hay không.

SELECT set_config('app.runtime_role', 'backend', true);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_idempotency_keys_access ON public.idempotency_keys;
CREATE POLICY backend_idempotency_keys_access
  ON public.idempotency_keys
  FOR ALL
  USING ((SELECT current_setting('app.runtime_role', true)) = 'backend')
  WITH CHECK ((SELECT current_setting('app.runtime_role', true)) = 'backend');

REVOKE ALL ON public.idempotency_keys FROM PUBLIC;

-- Dọn phần rác đã hết hạn còn sót từ trước, nếu có.
DELETE FROM idempotency_keys WHERE expires_at < NOW();
