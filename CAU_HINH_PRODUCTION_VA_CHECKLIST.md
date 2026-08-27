# AuditBGS — Cấu hình Production & Checklist thiết lập (Vercel + Supabase + Google Drive)

> Phiên bản 1.0 · 27/08/2026
> Dùng để đưa AuditBGS lên production. Ứng dụng **tự kiểm tra** các biến bắt buộc: nếu thiếu, runtime guard sẽ liệt kê "violations" và từ chối chạy ở chế độ production — nên cứ điền đủ theo bảng dưới là an toàn.
> Domain production giả định: `https://bgrc.vercel.app` (đổi lại nếu bạn dùng domain khác).

---

## PHẦN 1 — BẢNG BIẾN MÔI TRƯỜNG (đặt trong Vercel → Project → Settings → Environment Variables)

Cột **BB** = bắt buộc ở production. Đánh dấu **Secret** cho các biến nhạy cảm (khóa, mật khẩu, token).

### 1.1 Runtime cơ bản

| Biến | BB | Giá trị production | Ghi chú |
|---|:--:|---|---|
| `NODE_ENV` | ✅ | `production` | |
| `DATA_STORE_MODE` | ✅ | `postgres` | Bắt buộc để dùng Supabase, không dùng local-json |
| `STATE_SNAPSHOT_ID` | – | `primary` | Mặc định đã là `primary`; chỉ đổi nếu chạy nhiều môi trường chung DB |
| `CORS_ALLOWED_ORIGINS` | ✅ | `https://bgrc.vercel.app` | Danh sách origin frontend, phẩy ngăn cách |
| `VITE_API_BASE_URL` | ✅ | `/api` | Frontend gọi API cùng domain qua Vercel |
| `REPORT_EXPORT_MAX_ROWS` | – | vd `50000` | Trần dòng khi xuất báo cáo (tùy chọn) |

### 1.2 Database — Supabase (Postgres)

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `DATABASE_URL` | ✅ | `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require` | **Dùng Transaction Pooler cổng 6543** (không dùng cổng 5432 trực tiếp) để tránh cạn kết nối trên serverless. `pg_advisory_xact_lock` tương thích pooler này. |

> Lấy chuỗi tại Supabase → Project → Settings → Database → **Connection string → Transaction pooler**.

### 1.3 Xác thực — Google OIDC (đăng nhập)

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `AUTH_MODE` | ✅ | `oidc` | Production bắt buộc `oidc` (không dùng `mock-header`) |
| `OIDC_ISSUER_URL` | ✅ | `https://accounts.google.com` | |
| `OIDC_AUDIENCE` | ✅ | = `GOOGLE_OIDC_CLIENT_ID` | Client ID của OAuth Web client |
| `GOOGLE_OIDC_CLIENT_ID` | ✅ | `xxxx.apps.googleusercontent.com` | Từ Google Cloud OAuth Web client |
| `GOOGLE_OIDC_CLIENT_SECRET` | ✅ (Secret) | `GOCSPX-...` | |
| `GOOGLE_OIDC_REDIRECT_URI` | ✅ | `https://bgrc.vercel.app/api/v1/auth/google/callback` | Phải khớp đúng trong Google Console |
| `GOOGLE_OIDC_STATE_SECRET` | ✅ (Secret) | ≥32 byte ngẫu nhiên | Chống CSRF cho luồng OIDC |

### 1.4 Tài khoản quản trị khởi tạo (bootstrap)

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `BOOTSTRAP_ADMIN_USERNAME` | ✅ | vd `admin` | |
| `BOOTSTRAP_ADMIN_PASSWORD_HASH` | ✅ (Secret) | hash scrypt | Sinh bằng `npm run auth:hash-password -- "<mật khẩu>"`. **Không đặt mật khẩu thô.** |
| `BOOTSTRAP_ADMIN_EMAIL` | ✅ | email quản trị | Bắt buộc để đăng nhập Google OIDC (khớp email Google của admin) |
| `BOOTSTRAP_ADMIN_FULLNAME` | – | Họ tên | |

### 1.5 Lưu trữ minh chứng — Google Drive

Đặt `EVIDENCE_STORAGE_MODE=google-drive` (bắt buộc production). Chọn **một** trong ba cách kết nối Drive:

**Cách A — Service Account (khuyến nghị cho server, không cần tương tác):**

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `EVIDENCE_STORAGE_MODE` | ✅ | `google-drive` | |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ (Secret) | JSON compact hoặc base64 | Khóa service account. **Không dùng tiền tố VITE_.** (Có thể dùng `GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_APPLICATION_CREDENTIALS` tùy loader.) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ✅ | ID folder Drive | Folder gốc lưu minh chứng; **chia sẻ quyền Editor cho email service account** |

**Cách B — OAuth người dùng (Drive cá nhân, kết nối một lần qua giao diện Admin):**

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `GOOGLE_DRIVE_AUTH_MODE` | ✅ | `oauth-user` | |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | client web | |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ (Secret) | | |
| `GOOGLE_OAUTH_REDIRECT_URI` | ✅ | `https://bgrc.vercel.app/api/v1/integrations/google-drive/callback` | |
| `GOOGLE_OAUTH_STATE_SECRET` | ✅ (Secret) | ≥32 byte | |
| `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` | ✅ (Secret) | 64 ký tự hex (AES-256-GCM) | Mã hóa refresh token trước khi lưu vào state |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | – | | Chỉ nếu nạp sẵn thay vì bấm kết nối |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ✅ | | |

**Cách C — Cầu Google Apps Script (nếu dùng adapter Apps Script):**

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `GOOGLE_APPS_SCRIPT_URL` | ✅ | `https://script.google.com/macros/s/<ID>/exec` | |
| `GOOGLE_APPS_SCRIPT_SECRET` | ✅ (Secret) | ≥32 byte | |

### 1.6 Cron SLA

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `CRON_SECRET` | ✅ (Secret) | ≥32 byte ngẫu nhiên | Vercel Cron gửi `Authorization: Bearer <CRON_SECRET>` tới `/api/v1/internal/sla/run` (đã cấu hình trong `vercel.json`, lịch `30 1 * * *` = 08:30 giờ VN) |

### 1.7 Email (SMTP) — nếu bật thông báo/nhắc SLA

| Biến | BB | Giá trị | Ghi chú |
|---|:--:|---|---|
| `SMTP_HOST` | – | vd `smtp.resend.com` | |
| `SMTP_USER` | – (Secret) | | |
| `SMTP_PASSWORD` | – (Secret) | | |
| `EMAIL_FROM` | – | `AuditBGS <noreply@domain>` | |

### 1.8 Cờ phải TẮT ở production

| Biến | Giá trị production | Ghi chú |
|---|---|---|
| `SEED_DEMO_DATA` | `false` | Guard từ chối chạy nếu `true` |
| `SEED_DEMO_USERS` | `false` | |
| `ALLOW_TEST_USER_HEADER` | (không đặt / `false`) | Chỉ dùng cho test |

---

## PHẦN 2 — CHECKLIST THIẾT LẬP THEO NỀN TẢNG

### 2.1 Supabase
- [ ] Tạo project (region gần VN, vd Singapore).
- [ ] Lấy `DATABASE_URL` từ **Transaction Pooler (cổng 6543)**.
- [ ] Chạy migration: đặt `DATABASE_URL`, chạy `npm run db:migrate:dry-run` (đối chiếu) → `npm run db:migrate` (áp `0001…0080`).
- [ ] Kiểm tra bảng `app_state_snapshots` và các bảng chuẩn hóa (`finding_follows`, `workspace_accepted_targets`, `report_catalog_configurations`…) đã tạo.
- [ ] **Bật RLS** cho các bảng nhạy cảm; kiểm policy theo `app.runtime_role` / `app.current_user_id` (migration 0080 đã có config).
- [ ] (Tùy chọn) Backfill dữ liệu: `db/backfill-local-state.ts` nếu cần nạp state cũ.
- [ ] Bật **backup hằng ngày** (gói Pro) và thử **restore** sang project test.

### 2.2 Google Cloud — OIDC (đăng nhập)
- [ ] Tạo project GCP + **OAuth consent screen** (Internal nếu dùng Google Workspace nội bộ).
- [ ] Tạo **OAuth Web Client** → lấy Client ID/Secret.
- [ ] Thêm **Authorized redirect URI**: `https://bgrc.vercel.app/api/v1/auth/google/callback`.
- [ ] Điền `GOOGLE_OIDC_*`, `OIDC_ISSUER_URL=https://accounts.google.com`, `OIDC_AUDIENCE = client id`.
- [ ] Đảm bảo `BOOTSTRAP_ADMIN_EMAIL` khớp email Google của quản trị viên.

### 2.3 Google Drive (Cách A — Service Account)
- [ ] Bật **Google Drive API v3** trong project.
- [ ] Tạo **Service Account** + tải khóa JSON → nạp vào `GOOGLE_SERVICE_ACCOUNT_JSON` (compact/base64, đánh dấu Secret).
- [ ] Tạo folder Drive gốc, **chia sẻ Editor** cho email service account; lấy `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
- [ ] Đặt `EVIDENCE_STORAGE_MODE=google-drive`.
- [ ] (Nếu chọn Cách B) sau khi deploy, đăng nhập Admin → mục kết nối Drive → hoàn tất OAuth (`/integrations/google-drive/connect`).

### 2.4 Vercel
- [ ] Liên kết repo `Kiemtra07/BGRC` với project Vercel.
- [ ] Nạp **toàn bộ biến ở Phần 1** cho môi trường **Production** (và Preview nếu cần), đánh dấu Secret đúng chỗ.
- [ ] Xác nhận `vercel.json` đã có: function `api/index.mjs` (maxDuration 60), rewrites `/api/*`→function & SPA fallback, cron `30 1 * * *`.
- [ ] Gắn domain (nếu có) + HTTPS.
- [ ] Sinh secrets: dùng `openssl rand -hex 32` cho các `*_SECRET`; `openssl rand -hex 32` (64 hex) cho `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`; hash mật khẩu admin bằng `npm run auth:hash-password`.

---

## PHẦN 3 — TRÌNH TỰ TRIỂN KHAI

1. [ ] Push code lên `origin/main` (4 commit đang chờ) → Vercel tự build.
2. [ ] Chạy migration lên Supabase (`db:migrate`).
3. [ ] Nạp env production trên Vercel, redeploy.
4. [ ] (Cách B Drive) đăng nhập Admin, kết nối Google Drive.
5. [ ] Kiểm nghiệm (Phần 4).

---

## PHẦN 4 — NGHIỆM THU SAU DEPLOY

- [ ] `GET https://bgrc.vercel.app/api/v1/ready` → `ready:true`, `durable:true` (Postgres OK), Drive `available`. Nếu thiếu cấu hình, xem danh sách "violations" trả về và bổ sung.
- [ ] Đăng nhập Google OIDC bằng `BOOTSTRAP_ADMIN_EMAIL` thành công; không còn cơ chế "chuyển user".
- [ ] Tạo hồ sơ → nộp → duyệt (1 cấp & 2 cấp) chạy đúng máy trạng thái.
- [ ] **RLS**: thử token vai trò thấp không đọc được dữ liệu ngoài phạm vi.
- [ ] Upload minh chứng lớn (>5MB) → đi thẳng lên Drive OK, `driveUrl` mở được.
- [ ] **Cron SLA**: kích hoạt thủ công `POST /api/v1/internal/sla/run` với `Authorization: Bearer <CRON_SECRET>` → 200; sai secret → 401; kiểm log Vercel Cron chạy 01:30 UTC.
- [ ] Đọc dữ liệu nhất quán giữa nhiều lần tải (đã vá read-through) — không thấy dữ liệu cũ sau khi ghi.
- [ ] Kiểm tra không có secret nào lọt vào bundle client (`VITE_*` chỉ chứa giá trị công khai).

---

## PHẦN 5 — SINH SECRET NHANH (tham khảo)

```bash
# Chuỗi ngẫu nhiên 32 byte (dùng cho *_SECRET, CRON_SECRET, *_STATE_SECRET)
openssl rand -hex 32

# Khóa AES-256-GCM 64 hex (GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY)
openssl rand -hex 32

# Hash mật khẩu admin (chạy trong repo)
npm run auth:hash-password -- "MatKhauManh#2026"

# Service account JSON -> base64 (nếu muốn nạp dạng 1 dòng)
base64 -w0 service-account.json
```

---

## PHẦN 6 — GHI CHÚ QUAN TRỌNG
- **Không commit** bất kỳ khóa/secret nào vào git; chỉ đặt trong Vercel env (Secret).
- `DATABASE_URL` **phải** là pooler 6543 trên serverless.
- Giữ `EVIDENCE_STORAGE_MODE=google-drive` ở production để không dính giới hạn body ~4.5MB của Vercel (upload đã đi thẳng lên Drive từ trình duyệt).
- Sau khi lộ token/secret ở đâu đó (chat, log), **thu hồi và tạo lại**.
