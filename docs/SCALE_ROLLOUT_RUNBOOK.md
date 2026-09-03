# Runbook kích hoạt scale AuditBGS

Tài liệu này là đường chạy chuẩn cho hai commit scale `9a4a85c` và `298954a`. Mục tiêu là đưa
`finding_records` từ bảng chiếu tùy chọn thành đường đọc có kiểm soát, không để bảng thiếu dữ liệu
mà API vẫn trả danh sách thành công.

## Trạng thái hiện tại

- Code và test đã nằm trên `main` tại `298954a`.
- `GET /api/v1/findings` có phân trang, lọc theo scope ở SQL và trả `total`/`hasMore`.
- `FINDINGS_READ_PATH=sql` chỉ được bật sau khi startup xác nhận ID và content hash của bảng chiếu
  khớp toàn bộ snapshot.
- Lệnh backfill mới là `db:backfill:finding-records:dry-run` và `db:backfill:finding-records`.
- Database production, backup/restore, RLS theo token thật, Google Drive, MFA và cron vẫn phải có
  bằng chứng vận hành riêng; CI hoặc HTTP 200 không thay thế các bằng chứng đó.

## Trình tự bắt buộc

Chạy từ một checkout đã được review, có backup khôi phục được và không in secret ra log.

```text
npm run ci
npm run db:migrate:dry-run
npm run db:migrate
npm run db:backfill:finding-records:dry-run
npm run db:backfill:finding-records
```

Lệnh ghi backfill đọc `app_state_snapshots/primary`, chỉ lấy minh chứng có trạng thái `AVAILABLE`,
upsert theo `finding_id` và xóa các dòng không còn trong snapshot. Không chạy lệnh ghi nếu chưa có
snapshot nguồn hoặc chưa hoàn tất backup. Dry-run có đọc database để đếm/đối chiếu nhưng không ghi
dữ liệu.

Sau backfill, đối chiếu tối thiểu:

```sql
SELECT COUNT(*) FROM app_state_snapshots WHERE id = 'primary';
SELECT COUNT(*) FROM finding_records;
SELECT COUNT(*) FROM idempotency_keys;
```

Số lượng snapshot ở câu đầu không phải số hồ sơ; số hồ sơ và content hash được lệnh backfill kiểm
tra trong ứng dụng. Nếu có cảnh báo `FINDING_RECORDS_NOT_BACKFILLED`, giữ cờ đọc ở `memory`, sửa
nguồn/bảng chiếu rồi chạy lại dry-run.

## Bật đường đọc theo từng môi trường

1. Staging: chạy migration, backfill, đặt `FINDINGS_READ_PATH=sql`, restart một revision mới.
2. Smoke bằng tài khoản thật ở từng scope: `ALL`, `CLUSTER`, `BRANCH` và `DEPARTMENT`; kiểm tra
   cùng một bộ lọc ở đường `memory` và `sql`, so `items`, `total` và `hasMore`.
3. Theo dõi p95 danh sách, lỗi 5xx, số dòng trả về và log `FINDING_RECORDS_NOT_BACKFILLED` trong
   ít nhất một chu kỳ SLA.
4. Production: chỉ đặt `FINDINGS_READ_PATH=sql` sau khi staging đạt các cổng trên. Không đặt secret
   trong `VITE_*`, không kéo secret production về máy cá nhân.

Rollback của feature flag là đặt lại `FINDINGS_READ_PATH=memory` và deploy/restart revision mới.
Các migration là additive; không tự ý xóa bảng hoặc chạy migration hoàn tác khi chưa có kế hoạch
phục hồi dữ liệu.

## Cổng nghiệm thu production còn thiếu

- Backup và restore thật trên Supabase, ghi thời gian và số dòng trước/sau.
- Token thật cho từng vai trò: chứng minh không đọc được hồ sơ ngoài scope và không vượt RLS.
- MFA/leaked-password protection và tài khoản admin 2FA theo chính sách đã duyệt.
- Vercel Cron gọi được `/api/v1/internal/sla/run` với secret đúng, có log và cảnh báo lỗi.
- Load test vài chục nghìn hồ sơ, hàng trăm user đồng thời; ghi p50/p95/p99 và tỷ lệ lỗi.
- Google Drive evidence read/upload thật qua backend proxy; `/api/v1/ready` phải phản ánh đúng trạng
  thái thay vì suy ra từ việc deploy thành công.
