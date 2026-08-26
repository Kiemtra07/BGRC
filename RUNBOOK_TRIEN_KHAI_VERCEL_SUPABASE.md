# RUNBOOK TRIỂN KHAI — AuditBGS lên Vercel + Supabase

> Phiên bản: 1.0 · Ngày lập: 26/08/2026
> Phạm vi: đưa hệ thống `audit-bgs-system` (Fastify API + worker SLA + React/Vite frontend) từ chế độ chạy local (state `local-json`, evidence ổ đĩa) lên production trên **Vercel + Supabase**, lưu file minh chứng trên **Google Drive**.
> Nguyên tắc: **giữ nguyên code Fastify + logic nghiệp vụ**, chỉ đổi lớp hạ tầng (state, storage, cách kích hoạt worker, cách deploy).

---

## 0. Kiến trúc đích

```
[ Trình duyệt / React (Vite build) ]
        │  (upload file THẲNG lên Google Drive, chỉ gửi driveFileId về API)
        ▼
[ Vercel ]
  ├── Static frontend (dist/ của Vite)
  ├── Serverless Function  = Fastify app (bọc làm 1 handler)  →  /api/*
  └── Vercel Cron 08:30    →  POST /api/v1/internal/sla/run
        │
        ▼
[ Supabase ]
  ├── Postgres  (toàn bộ state, findings, workflow, outbox, campaigns…)  + RLS
  └── (tùy chọn) Supabase Auth/Storage nếu sau này cần
        │
        ▼
[ Google Drive ]  (API v3 + Service Account)  — lưu PDF/Excel minh chứng
```

Ba thay đổi hạ tầng bắt buộc so với hiện tại:
1. `LocalStateRepository` (đọc/ghi `data/local-state.json`) → **repository Postgres**.
2. Worker SLA chạy tiến trình nền (scheduler 08:30) → **endpoint + Vercel Cron**.
3. Evidence adapter ghi ổ local → **Google Drive thật**, upload client-side.

---

## 1. Chuẩn bị trước khi bắt đầu (prerequisites)

Người vận hành cần chuẩn bị các tài khoản/khóa sau. **Không commit bất kỳ khóa bí mật nào vào git.**

| Hạng mục | Cần làm | Ghi chú |
|---|---|---|
| Tài khoản Vercel | Tạo team/project, liên kết repo (sau khi đưa vào git) | Gói Pro nếu là app thương mại/nội bộ doanh nghiệp |
| Project Supabase | Tạo project (chọn region gần VN, vd Singapore) | Lấy `DATABASE_URL` (connection string, dùng **connection pooler** cho serverless), `SUPABASE_URL`, service key |
| Google Cloud | Tạo project + **Service Account** + bật **Google Drive API v3** | Tải khóa JSON của service account; chia sẻ thư mục Drive đích cho email service account |
| Thư mục Drive đích | Tạo folder gốc lưu minh chứng, chia sẻ quyền Editor cho service account | Lưu `GOOGLE_DRIVE_ROOT_FOLDER_ID` |
| SMTP | Chọn nhà cung cấp gửi email (Resend/SES/SMTP) | Cần cho thông báo/nhắc SLA nếu dùng |
| Domain | Domain/subdomain trỏ về Vercel | Tùy chọn |
| Đưa repo vào Git | **Bắt buộc**: `git init`, commit mốc hiện tại, đẩy lên GitHub | Vercel deploy theo git; hiện workspace CHƯA có git |

Biến môi trường sẽ dùng (đặt trong Vercel Project Settings → Environment Variables, và `.env.local` khi chạy local):

```
# Runtime
NODE_ENV=production
DATA_STORE_MODE=postgres          # thay cho local-json/memory
DATABASE_URL=postgres://...pooler.supabase.com:6543/postgres?sslmode=require
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...     # chỉ dùng phía server, KHÔNG lộ ra client

# Evidence / Google Drive
EVIDENCE_STORAGE_MODE=google-drive
GOOGLE_SERVICE_ACCOUNT_JSON=...   # nội dung JSON (hoặc base64) — secret
GOOGLE_DRIVE_ROOT_FOLDER_ID=...

# SLA cron bảo vệ
CRON_SECRET=...                   # để endpoint /internal/sla/run chỉ nhận từ Vercel Cron

# Email (nếu dùng)
SMTP_URL=... / RESEND_API_KEY=...
```

---

## 2. Bước 1 — Chuyển state `local-json` → Supabase Postgres  🔴 (chặn lớn nhất)

**Mục tiêu:** loại bỏ mọi phụ thuộc vào filesystem cho state, vì serverless không có ổ đĩa bền.

Công việc:
- [ ] Rà soát `server/src/repositories/local-state.ts` và `server/src/state/durable-state-coordinator.ts`: liệt kê tất cả thực thể đang lưu trong `local-state.json` (findings, workflow status, campaigns, users, channels/report types, outbox…).
- [ ] Đối chiếu với các migration `db/migrations/0001…0070` — phần lớn bảng đã có schema. Bổ sung migration mới cho thực thể nào còn thiếu (đặt tên `0080_*.sql` theo quy ước).
- [ ] Viết một **`PostgresStateRepository`** cài cùng interface với `LocalStateRepository` (giữ nguyên chữ ký hàm để không phải sửa service). Dùng `pg` Pool.
- [ ] Thêm nhánh chọn repo theo `DATA_STORE_MODE`: `postgres` → PostgresStateRepository; `local-json` → giữ nguyên cho dev.
- [ ] Cập nhật `/api/v1/ready` để báo `durable:true` chỉ khi Postgres kết nối được (đã có logic runtime-truth ở Task 06, chỉ mở rộng cho mode postgres).
- [ ] Viết script **backfill**: nạp `data/local-state.json` hiện có vào Postgres (một lần) để không mất dữ liệu demo.

Kiểm thử (RED→GREEN):
- [ ] Viết test cho PostgresStateRepository (dùng Postgres test/nhánh Supabase riêng hoặc container tạm).
- [ ] `npm run ci` phải PASS với `DATA_STORE_MODE=postgres`.
- [ ] Chạy thử worker SLA đọc state từ Postgres, số liệu ON_TRACK/DUE_SOON khớp bản local.

**Gate bước 1:** app chạy được hoàn toàn không cần `local-state.json`; restart không mất dữ liệu.

---

## 3. Bước 2 — Cron-hóa worker SLA

**Mục tiêu:** thay scheduler chạy nền (08:30 trong tiến trình) bằng endpoint được Vercel Cron gọi.

Công việc:
- [ ] Tách logic đánh giá SLA trong `server/src/worker/sla-worker.ts` + `sla-scheduler.ts` thành một hàm thuần `runSlaEvaluation()` không phụ thuộc timer.
- [ ] Thêm route **`POST /api/v1/internal/sla/run`**: xác thực bằng header `Authorization: Bearer $CRON_SECRET` (từ chối nếu sai), gọi `runSlaEvaluation()`, trả số bản ghi đã cập nhật.
- [ ] Bỏ/không khởi động timer nội bộ khi `NODE_ENV=production` trên serverless (giữ timer cho dev local nếu muốn).
- [ ] Khai báo Vercel Cron trong `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/v1/internal/sla/run", "schedule": "30 1 * * *" }
  ]
}
```
> Lưu ý múi giờ: Vercel Cron chạy theo **UTC**. 08:30 giờ VN (UTC+7) = **01:30 UTC** → `30 1 * * *`.

Kiểm thử:
- [ ] Gọi endpoint thủ công với CRON_SECRET đúng/sai (200 vs 401).
- [ ] Xác nhận đánh giá SLA cập nhật đúng như worker cũ.

**Gate bước 2:** SLA được đánh giá đúng qua endpoint; không còn phụ thuộc tiến trình luôn-chạy.

---

## 4. Bước 3 — Bọc Fastify thành serverless function cho Vercel

**Mục tiêu:** chạy nguyên app Fastify như một hàm serverless, không viết lại route.

Công việc:
- [ ] Tách phần **khởi tạo app** (đăng ký routes, plugin) khỏi phần `listen()` trong `server/src/app.ts` → export một `buildApp()` trả về Fastify instance.
- [ ] Tạo `api/index.ts` (entry Vercel) chuyển request/response của Vercel vào Fastify (`app.ready()` + `app.server.emit('request', req, res)` hoặc dùng `@fastify/aws-lambda`/adapter tương đương cho Node serverless).
- [ ] Cấu hình `vercel.json`:
  - `rewrites`: mọi `/api/*` → serverless function; phần còn lại → static `dist/`.
  - `functions`: chỉnh `maxDuration` (Pro cho tới 300s) nếu cần biên an toàn.
- [ ] Build frontend: `vite build` → `dist/`; cấu hình Vercel output cho SPA (fallback `index.html`).
- [ ] Đặt biến `VITE_API_BASE_URL` cho frontend trỏ về `/api`.

Lưu ý serverless:
- Cold start: chấp nhận được cho app nội bộ.
- Không lưu state trong biến toàn cục giữa các request (đã chuyển sang Postgres ở bước 1).
- `@fastify/multipart`: xem bước 4 — không nhận file lớn qua đây nữa.

**Gate bước 3:** truy cập app trên domain Vercel; `/api/v1/ready` xanh; các luồng chính chạy.

---

## 5. Bước 4 — Google Drive thật + upload client-side

**Mục tiêu:** file PDF/Excel minh chứng lưu trên Google Drive; tránh giới hạn request ~4.5MB của Vercel.

Công việc:
- [ ] Hoàn thiện adapter Drive thật trong `server/src/adapters/google-drive.ts` bằng **Google Drive API v3** + Service Account (thay/hoàn thiện adapter Apps Script nếu chọn hướng đó). Đặt `EVIDENCE_STORAGE_MODE=google-drive`.
- [ ] **Đổi luồng upload sang client-side:**
  - Frontend xin **URL upload tạm** (resumable upload session) qua một endpoint nhỏ của API (API tạo session với service account, trả URL cho client).
  - Trình duyệt **PUT file thẳng lên Google Drive** qua URL đó — không đi qua Vercel function.
  - Sau khi xong, client gửi `driveFileId` về API; API lưu tham chiếu vào Postgres (giữ đúng model `driveFileId`/`driveUrl` hiện có).
- [ ] Giữ cơ chế **fail-closed** đã có ở Task 06: nếu Drive chưa cấu hình → 503, không âm thầm ghi local.
- [ ] Rà soát lại tên gọi "Drive" trong biến/cột/tài liệu cho khớp thực tế (nợ ngữ nghĩa đã ghi trong PLANUPDATE).

Kiểm thử:
- [ ] Upload file lớn (>5MB, >10MB) chạy thẳng lên Drive OK, không dính giới hạn Vercel.
- [ ] Quyền truy cập file đúng; đọc lại `driveUrl` mở được.
- [ ] Trường hợp Drive lỗi/thiếu cấu hình → 503 rõ ràng.

**Gate bước 4:** upload/đọc minh chứng qua Drive hoạt động ở production, không phụ thuộc ổ đĩa server.

---

## 6. Bước 5 — Secrets, migration, deploy

Công việc:
- [ ] Đưa repo vào **Git** và đẩy lên GitHub (nếu chưa): `git init` → commit → push. Liên kết repo với Vercel.
- [ ] Nạp toàn bộ **Environment Variables** (mục 1) vào Vercel cho cả 3 môi trường: Production / Preview / Development. Đánh dấu secret cho các khóa nhạy cảm.
- [ ] Chạy **migration lên Supabase**: `npm run db:migrate` trỏ `DATABASE_URL` Supabase (chạy `db:migrate:dry-run` trước để đối chiếu). Bật **RLS** cho các bảng nhạy cảm; kiểm tra policy theo vai trò.
- [ ] Deploy: push lên nhánh chính → Vercel tự build; hoặc `vercel --prod`.
- [ ] Cấu hình domain, HTTPS.
- [ ] Bật **SMTP** thật cho email nếu dùng.

**Gate bước 5:** bản production chạy trên domain, dữ liệu ở Supabase, file ở Drive, cron SLA đã lên lịch.

---

## 7. Nghiệm thu production (gate tổng)

- [ ] `npm run ci` PASS trên nhánh chính (migration dry-run, TypeScript, unit/integration/contract, build).
- [ ] `/api/v1/ready` trả `durable:true` chỉ khi Postgres + Drive sẵn sàng; báo DEGRADED trung thực khi thiếu.
- [ ] Đăng nhập thật (scrypt/session) hoạt động; không còn cơ chế "chuyển user" của prototype.
- [ ] Tạo hồ sơ → nộp → duyệt (1 cấp và 2 cấp) chạy đúng máy trạng thái; RLS chặn truy cập chéo vai trò.
- [ ] Upload minh chứng lớn qua Drive OK; SLA đánh giá qua cron 01:30 UTC (08:30 VN).
- [ ] Kiểm thử responsive 375/768/1440 px, không lỗi console.
- [ ] Rà soát bảo mật: service key/Drive JSON chỉ ở server; không lộ ra client bundle.

---

## 8. Kế hoạch rollback

- Giữ nhánh/tag của bản local đang chạy được trước khi migrate.
- Trước khi chạy migration Supabase production, **backup** (Supabase Pro có backup hằng ngày; cân nhắc snapshot thủ công trước bước lớn).
- Nếu deploy lỗi: Vercel cho phép **rollback về deployment trước** ngay trên dashboard.
- Nếu migration lỗi: mỗi migration nên idempotent/có bước hoàn tác; giữ `db:migrate:dry-run` làm cổng kiểm tra.

---

## 9. Thứ tự thực thi khuyến nghị

1. Đưa repo vào Git (chặn kỹ thuật cho Vercel).
2. **Bước 1** — State → Postgres (lớn nhất, làm trước).
3. **Bước 2** — Cron-hóa SLA (nhỏ, làm nhanh sau bước 1).
4. **Bước 3** — Bọc Fastify serverless + deploy Preview để kiểm tra sớm.
5. **Bước 4** — Google Drive thật + upload client-side.
6. **Bước 5** — Secrets/migration/deploy production + nghiệm thu.

> Ước tính chi phí vận hành: ~$25–50/tháng (Supabase Pro $25 là khoản chính; Vercel gần như free ở mức nội bộ, Pro $20 nếu tính thương mại; Google Drive dùng dung lượng Workspace sẵn có). Xem chi tiết trong trao đổi định hướng hạ tầng.

---

## 10. Việc người dùng cần cung cấp cho các bước code

- Project Supabase + `DATABASE_URL` (connection pooler) → cho Bước 1 & 5.
- Google Service Account JSON + Drive root folder ID → cho Bước 4.
- Quyết định nhà cung cấp SMTP (nếu bật email).
- Quyền tạo repo GitHub + kết nối Vercel.
