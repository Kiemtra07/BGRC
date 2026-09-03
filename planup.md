# AuditBGS — PLANUP: Đánh giá đã / chưa triển khai

> Ngày lập: 03/09/2026
> Phạm vi: rà soát mã nguồn, git (nhánh `main` + `perf/scale-step-01-02`) và migration `0001…0122`.
> Ký hiệu: ✅ đã triển khai · 🟡 đã code nhưng chưa bật/chưa gộp · 🔴 chưa triển khai.

---

## 0. Tóm tắt nhanh

Lõi nghiệp vụ và bảo mật đã hoàn chỉnh và nằm trên `main`. Mảng **mở rộng quy mô (nhiều tệp / nhiều KH / nhiều user)** đã có 2 bước lõi, được kiểm thử, gộp và push lên `main`; hiện **chưa bật cờ SQL**. Việc còn lại chủ yếu là: migration/backfill và kiểm thử scale ở quy mô thật, các cổng nghiệm thu production, và dọn dẹp kỹ thuật.

| Nhóm | Trạng thái |
|---|---|
| Quy trình nghiệp vụ + tuyến duyệt + dấu sao | ✅ trên main |
| Xác thực (OIDC + nội bộ) | ✅ |
| Nhập dữ liệu đa nguồn (nhiều tệp) | ✅ |
| Minh chứng (Drive / local) | ✅ |
| SLA, báo cáo, cấu hình admin | ✅ |
| Bảo mật (RLS, ledger, read-through) | ✅ |
| Scale: chống blob phình + đọc SQL theo phạm vi | 🟡 code + test xong, đã gộp/push, sau cờ |
| Bật scale ở production + backfill | 🔴 |
| Nghiệm thu production (backup/RLS/MFA) | 🔴 |
| Dọn diff CRLF, merge/push nhánh scale | ✅ |

---

## 1. ĐÃ TRIỂN KHAI (✅)

### 1.1 Quy trình nghiệp vụ
- Vòng đời phát hiện 6 trạng thái: Chờ chi nhánh khắc phục → Chờ kiểm soát chi nhánh → (Chờ lãnh đạo chi nhánh) → Chờ phê duyệt HT → Đã đóng lỗi; nhánh Chi nhánh cần bổ sung.
- Luồng cấu hình theo loại báo cáo: một cấp / hai cấp / ba cấp (`ONE_TIER`/`TWO_TIER`/`THREE_TIER`).
- **Tuyến duyệt tự suy** theo loại báo cáo + vai trò + chi nhánh; người xử lý không chọn tay người/tuyến.
- **Dấu sao trường hợp đặc biệt** (`isSpecialCase`): chèn bắt buộc bước Lãnh đạo chi nhánh trước khi lên Hội sở; khóa sau khi gửi kiểm soát; tách bạch với "Ưu tiên giám sát" (ghim cá nhân).
- Ý sai sót (sub-items): thêm ý, chấp nhận từng ý; điều kiện chuyển bước (đủ ý + minh chứng khả dụng; đóng lỗi cần số quyết định).

### 1.2 Xác thực & phân quyền
- Google OIDC (bản cloud) và tài khoản/mật khẩu nội bộ (`AUTH_MODE=credentials`, scrypt); bootstrap admin.
- 8 vai trò với nhãn hiển thị; phạm vi dữ liệu theo nhóm nội bộ / cụm / chi nhánh / phòng.
- RLS toàn bộ bảng public (migration `0090`), hardening Supabase (`0111`).

### 1.3 Nhập dữ liệu (nhiều tệp)
- Nhiều tệp Excel `.xlsx/.xls/.csv` cùng lúc; ZIP; DOCX (bảng sai sót); dán từ Excel; biểu mẫu web; dữ liệu mẫu.
- Vá nhận CSV phân tách bằng dấu chấm phẩy; ghi nhận nguồn nhập (provenance, migration `0100`).
- Luồng chuẩn: staging → kiểm tra lỗi → lưu hồ sơ; idempotency theo lô.

### 1.4 Minh chứng
- Upload resumable **thẳng lên Google Drive** (né giới hạn ~4,5MB của Vercel) hoặc lưu **đĩa nội bộ**; kiểm checksum/metadata; fail-closed khi Drive chưa sẵn sàng; gắn thư mục Drive theo chuyên đề.

### 1.5 SLA & Báo cáo
- Worker SLA đánh giá tự động (cron 08:30 cloud / worker nền on-prem); badge + KPI Quá hạn.
- Báo cáo: bảng / bảng chéo / biểu đồ (cột/đường/tròn); mẫu lưu; dashboard; xuất CSV/XLSX/HTML; có giới hạn export.

### 1.6 Cấu hình quản trị
- Đơn vị (cơ cấu tổ chức), người dùng (+ import Excel theo lô), chuyên đề (+ bóc tách DOCX/PDF/Excel, kho Drive), loại báo cáo/form/luồng/SLA, trường báo cáo, nhật ký kiểm toán (xuất CSV, production không xóa).

### 1.7 Bảo mật & độ tin cậy
- Workflow event ledger (`0110`), security event ledger (`0120`), readiness trung thực (`/ready`).
- **Sửa đọc stale trên serverless** (re-hydrate read-through, đã trên `main`).

---

## 2. ĐÃ CODE NHƯNG CHƯA BẬT / CHƯA GỘP (🟡) — mảng mở rộng quy mô

Nhánh `perf/scale-step-01-02` đã được fast-forward vào `main` và push lên `origin/main`:

- **Chống snapshot phình** (`9a4a85c`): tách các nguồn tích tụ (idempotency, security event…) ra bảng riêng thay vì để trong blob JSON. Lý do đo được: 20.000 hồ sơ, 500 user × 10 ghi/ngày → sau 30 ngày blob 268MB, ~10,2 giây mỗi lượt ghi. Có migration `0120`/`0122` hỗ trợ.
- **Đọc danh sách hồ sơ bằng SQL theo phạm vi** (`298954a`): đẩy phạm vi + bộ lọc xuống `WHERE` thay vì nạp toàn bộ ~200 đơn vị vào RAM. `scope-predicate.ts` là **một nguồn sự thật** cho cả JS (`matchesScopeClauses` = `hasFindingAccess`) và SQL (`renderScopeSql`); test vi phân **1.296 tổ hợp** phạm vi × hồ sơ. Migration `0121` (cột phạm vi + index).
- **Trạng thái:** đường đọc SQL **sau cờ `FINDINGS_READ_PATH`**, mặc định `memory` (chưa bật). Typecheck và test PASS.

Cần làm để đưa vào dùng: xem mục 3.1.

---

## 3. CHƯA TRIỂN KHAI / CÒN LẠI (🔴)

### 3.1 Hoàn tất & kích hoạt mảng scale (ưu tiên cao)
- [x] **Dọn diff CRLF** cho các file đã chạm; Git index giữ LF, working tree Windows giữ CRLF, không còn diff line-ending rác.
- [x] Chạy **full `npm run ci`** trên máy: migration dry-run, typecheck, 53 unit file/309 test, 21 integration file/127 test, 3 contract test và Vite build đều đạt.
- [x] **Gộp `perf/scale-step-01-02` vào `main`** và **push** lên origin; scale ở `298954a`, guard/backfill ở `7919974`, bundle/test isolation ở `9cc5479`.
- [x] Thêm backfill `finding_records`, dry-run và startup **fail-closed** theo ID/content hash; thêm runbook rollout.
- [x] Chạy migration `0120/0121/0122` trên database production; preflight xác nhận đủ bảng nền và `security_event_ledger` có 45 dòng. **Backfill bảng `finding_records`** từ dữ liệu hiện có vẫn còn pending.
- [ ] **Bật `FINDINGS_READ_PATH=sql`** (bật dần: staging → production), theo dõi hiệu năng.
- [ ] Tiếp các bước scale sau (03+): phân trang/đếm bằng SQL, tối ưu index theo truy vấn thực, cân nhắc tách thêm entity nóng khỏi blob.

### 3.2 Nghiệm thu production
- [ ] Kiểm **backup/restore thật** trên Supabase (không chỉ đồng bộ Sheets).
- [ ] Kiểm **RLS theo từng vai trò** trên project production bằng token thật.
- [ ] Bật **MFA/leaked-password protection** cho Auth; cân nhắc **2FA cho admin**.
- [ ] Kiểm **Vercel Cron** thực chạy endpoint SLA; xác nhận biến môi trường đủ.

### 3.3 Triển khai on-prem nội bộ đầy đủ
- [ ] Guard production hiện ép OIDC + Google Drive; cần **hồ sơ profile on-prem chính thức** (credentials + storage local + Postgres nội bộ) để guard không chặn nhầm.
- [ ] Kịch bản chạy dịch vụ (pm2/Windows Service) + reverse proxy nội bộ + sao lưu đĩa storage.

### 3.4 Chất lượng & dọn nợ
- [ ] Dọn phần **mã chết frontend** thuộc prototype cũ (nếu còn) — PLANUPDATE cũ nêu ~40%.
- [ ] Đồng bộ **tài liệu**: hiện có nhiều bản (sổ tay người dùng, vận hành, lưu đồ, .drawio) song song — cần chốt một bộ chuẩn.
- [ ] Hỗ trợ **.doc** (nhị phân cũ) nếu cần — hiện mới nhận `.docx`.

### 3.5 Vận hành nâng cao
- [ ] **Load test** ở quy mô mục tiêu (vài chục nghìn hồ sơ, hàng trăm user đồng thời) sau khi bật SQL path.
- [ ] **Rate limiting**, security headers (CSP/HSTS), monitoring/alerting cho hành vi đặc quyền và đăng nhập bất thường.
- [ ] Cân nhắc **pentest độc lập** cho luồng thanh toán/phân quyền trước khi mở rộng.

---

## 4. Rủi ro cần lưu ý
- Nếu bật `FINDINGS_READ_PATH=sql` mà `finding_records` chưa backfill đủ → danh sách thiếu hồ sơ. Phải backfill + đối chiếu số lượng trước khi bật production.
- Chừng nào chưa bật SQL path + chưa chạy migration de-bloat trên production, rủi ro chậm/ghi nặng khi dữ liệu lớn vẫn còn (đã đo ~10s/ghi sau 30 ngày ở quy mô lớn).
- Diff CRLF chưa dọn có thể che lấp thay đổi thật trong lần commit sau.

## 5. Đề xuất thứ tự làm tiếp
1. Migration + backup/restore kiểm chứng → dry-run/backfill `finding_records` trên production.
2. Đối chiếu hash → staging smoke theo scope → bật `FINDINGS_READ_PATH=sql` dần.
3. Nghiệm thu production (RLS theo role, MFA, cron, load test).
4. Bước scale kế tiếp (phân trang/đếm SQL) và monitoring.
5. Dọn mã chết + chốt bộ tài liệu chuẩn.

> Ghi chú: file này là ảnh chụp trạng thái tại 03/09/2026; cập nhật lại sau mỗi mốc ở mục 5.

---

## 6. Cập nhật thực thi ngày 03/09/2026

- ✅ `npm run ci` chạy trên nhánh scale và sau phần bổ sung: 20 migration dry-run, typecheck, 53
  unit file/309 test, 21 integration file/127 test, 3 contract test và Vite build đều đạt.
- ✅ Fast-forward `perf/scale-step-01-02` vào `main`; các commit `298954a`, `7919974` và `9cc5479`
  đã push thành công lên `origin/main`.
- ✅ `npm test` được chỉnh chạy unit/integration/contract theo tiến trình cô lập; chạy lại đạt tổng 439/439
  test. `npm run build` cũng đạt typecheck + bundle Vercel + Vite build.
- ✅ Bổ sung `db/backfill-finding-records.ts` cùng hai script dry-run/apply; startup khi
  `FINDINGS_READ_PATH=sql` nay fail-closed nếu ID/content hash của `finding_records` thiếu, thừa hoặc
  lệch snapshot. Runbook chuẩn nằm tại `docs/SCALE_ROLLOUT_RUNBOOK.md`.
- ✅ Migration `0120/0121/0122` đã được chạy trên database production qua SQL Editor; `security_event_ledger`
  đã có 45 dòng. Deployment `dpl_3HQrFhm623NT1VHM1ZUVc1swY4AV` từ commit `54ac78a` đã Ready, health UP,
  readiness HTTP 200 và alias `bgrc.vercel.app` đã trỏ sang bản mới.
- 🔴 Chưa backfill production: cần đồng bộ đầy đủ `finding_records`, dry-run, đối chiếu số lượng/hash rồi mới
  bật `FINDINGS_READ_PATH=sql`.
- 🔴 Chưa bật `FINDINGS_READ_PATH=sql` production; phải migration → backup → dry-run/backfill → đối
  chiếu hash → staging smoke theo scope → mới promote.
- 🔴 Backup/restore thật, RLS token thật, MFA/leaked-password protection, cron thực chạy và load test
  vẫn chưa có bằng chứng trong phiên này.
