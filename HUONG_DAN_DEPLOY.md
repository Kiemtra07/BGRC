# Hướng dẫn triển khai AuditBGS

> Cập nhật: 25/08/2026. Kiến trúc mục tiêu đã chốt; source hiện tại **chưa đủ điều kiện production** vì runtime vẫn dùng JSON local, đăng nhập chưa phải OIDC và binary minh chứng chưa chạy qua Google Drive API thật.

## 1. Nên deploy ở đâu?

Khuyến nghị chính: **Google Cloud, vùng `asia-southeast1` (Singapore)**.

| Thành phần | Dịch vụ | Mục đích |
|---|---|---|
| Web/API | Cloud Run | Chạy container Node/Fastify, tự scale, rollback theo revision |
| Database | Cloud SQL for PostgreSQL 16 | Dữ liệu giao dịch, RBAC/RLS, audit, idempotency, outbox |
| SLA 08:30 | Cloud Scheduler + Cloud Run Job | Chạy đúng lịch, không phụ thuộc một web instance |
| Secret | Secret Manager | DB password, OIDC secret, Apps Script HMAC, SMTP/API key |
| Chứng từ | Google Drive riêng tư | Folder theo chuyên đề/CIF/mã lỗi và ACL theo email |
| Identity | Google Workspace OIDC | Đăng nhập tổ chức, ánh xạ user/role/scope phía server |
| Log/alert | Cloud Logging + Monitoring | Log tập trung, cảnh báo lỗi và latency |

Không khuyến nghị dùng Vercel làm toàn bộ backend vì AuditBGS cần PostgreSQL transaction, job SLA và lưu trữ ngoài filesystem. Render/Railway chỉ nên dùng cho UAT nhanh nếu tổ chức chưa cấp GCP.

## 2. Chọn database nào?

Chọn **PostgreSQL 16**, không dùng MongoDB, Firestore, SQLite hay `local-state.json` cho production.

Lý do:

- 11 migration hiện tại đã viết cho PostgreSQL.
- Luồng phê duyệt cần transaction, optimistic locking, idempotency và audit append-only.
- Phân quyền dữ liệu cần RLS theo người dùng/đơn vị.
- Báo cáo cần join, tổng hợp và filter nhiều chiều.
- Cloud SQL hỗ trợ backup, PITR và HA.

Môi trường đề xuất:

| Môi trường | Database | Cấu hình ban đầu |
|---|---|---|
| Local | PostgreSQL 16 bằng Docker hoặc máy dev | Dữ liệu giả, không chứa chứng từ thật |
| UAT | Cloud SQL single-zone | DB riêng, Drive root riêng, user thử nghiệm |
| Production | Cloud SQL HA regional | PITR, backup tự động, maintenance window, alert |

Tuyệt đối không dùng chung database, Drive root, OAuth client hoặc secret giữa UAT và production.

## 3. Cổng bắt buộc trước production

Hiện tại `server/src/app.ts` chủ động chặn `NODE_ENV=production`. Chỉ gỡ chặn khi đủ toàn bộ:

- [ ] API dùng repository PostgreSQL cho user, session, chuyên đề, loại báo cáo, finding, evidence metadata, workflow event, SLA, idempotency và audit.
- [ ] Mỗi transaction đặt `app.current_user_id` và `app.current_org_scope`; test RLS chặn truy cập chéo chi nhánh.
- [ ] Đăng nhập Google Workspace OIDC server flow; kiểm tra `iss`, `aud`, `exp`, `email_verified` và domain `hd`.
- [ ] Không còn tài khoản/mật khẩu mẫu trong production.
- [ ] Binary minh chứng upload/stream qua Google Drive thật; không fallback local.
- [ ] Transactional outbox và worker email có retry/idempotency/delivery log.
- [ ] SLA worker đọc/ghi PostgreSQL, không đọc `data/local-state.json`.
- [ ] Có Dockerfile production, health/readiness đúng và test container.
- [ ] Migration rehearsal trên bản sao dữ liệu, backup và restore test đạt.
- [ ] CI, security scan và E2E theo 5 nhóm quyền đạt trên UAT.

## 4. Chuẩn bị Google Cloud

Các lệnh dưới đây chạy trong Cloud Shell hoặc máy đã cài `gcloud`. Thay toàn bộ giá trị viết hoa.

```bash
gcloud config set project PROJECT_ID
gcloud config set run/region asia-southeast1

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com

gcloud artifacts repositories create audit-bgs \
  --repository-format=docker \
  --location=asia-southeast1
```

Tạo ba service account riêng:

- `audit-bgs-runtime`: chạy web/API, chỉ được đọc secret cần thiết và kết nối Cloud SQL.
- `audit-bgs-scheduler`: chỉ được invoke SLA job/endpoint.
- `audit-bgs-deployer`: build/deploy; không dùng làm runtime identity.

Không dùng tài khoản Owner cá nhân làm runtime service account.

## 5. Tạo Cloud SQL PostgreSQL

Trong Google Cloud Console:

1. Tạo Cloud SQL for PostgreSQL 16 tại `asia-southeast1`.
2. UAT chọn single-zone; production chọn regional HA.
3. Bật automated backups, PITR và deletion protection.
4. Tạo database `audit_bgs` và user ứng dụng riêng; không cho ứng dụng dùng user `postgres`.
5. Cấp `roles/cloudsql.client` cho `audit-bgs-runtime` và migration job.
6. Lưu connection string trong Secret Manager với tên `audit-bgs-database-url`.

Chuỗi kết nối khi dùng Unix socket của Cloud Run có dạng:

```text
postgresql://APP_USER:URL_ENCODED_PASSWORD@/audit_bgs?host=/cloudsql/PROJECT:REGION:INSTANCE
```

Giới hạn `max-instances` của Cloud Run và pool database cùng nhau. Không giữ mặc định `pool.max=20` nếu số instance có thể làm vượt giới hạn kết nối Cloud SQL.

## 6. Secret và biến môi trường

Secret Manager:

- `audit-bgs-database-url`
- `audit-bgs-oidc-client-secret`
- `audit-bgs-session-secret`
- `audit-bgs-apps-script-secret`
- `audit-bgs-smtp-password` hoặc email provider key

Biến thường:

```text
NODE_ENV=production
PORT=8080
AUTH_MODE=oidc
DATA_STORE_MODE=postgres
EVIDENCE_STORAGE_MODE=google-drive
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_AUDIENCE=<GOOGLE_OAUTH_CLIENT_ID>
CORS_ALLOWED_ORIGINS=https://audit.example.vn
GOOGLE_APPS_SCRIPT_URL=<APPS_SCRIPT_WEB_APP_URL>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<ROOT_FOLDER_ID>
EMAIL_FROM=<NO_REPLY_ADDRESS>
TZ=Asia/Ho_Chi_Minh
```

Không đưa secret vào `VITE_*`, `.env` commit, Docker image, lệnh shell history hoặc log.

## 7. Cấu hình Google Drive

Thực hiện theo `integrations/google-apps-script/README.md` với hai thư mục gốc tách biệt: UAT và production.

Quy tắc bắt buộc:

- Folder gốc do tài khoản quản trị tổ chức sở hữu.
- Không bật `anyone` hoặc chia sẻ toàn domain.
- Folder chuyên đề chỉ cấp cho email nằm trong phân công.
- URL Apps Script không được gọi trực tiếp từ frontend; backend ký HMAC.
- Khi thay đổi thành viên chuyên đề phải đồng bộ và thu hồi ACL thừa.
- Tệp chỉ được xem qua route có RBAC hoặc Drive ACL hợp lệ.

## 8. Build, migration và deploy

Phần này chỉ chạy sau khi các cổng ở mục 3 đã đạt và source có Dockerfile production.

### 8.1. Kiểm tra trước deploy

```bash
npm ci
npm run ci
npm audit --omit=dev
npm run db:migrate:dry-run
```

### 8.2. Build image bất biến

```bash
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/PROJECT_ID/audit-bgs/web-api:RELEASE_SHA
```

Không dùng duy nhất tag `latest`; giữ `RELEASE_SHA` để rollback.

### 8.3. Chạy migration một lần

Tạo Cloud Run Job dùng cùng image, command `npm run db:migrate`, gắn Cloud SQL và secret `DATABASE_URL`. Chạy job, kiểm tra `schema_release_log`, sau đó mới deploy web/API. Không chạy migration trong startup của mọi instance.

### 8.4. Deploy revision không nhận traffic

```bash
gcloud run deploy audit-bgs \
  --image asia-southeast1-docker.pkg.dev/PROJECT_ID/audit-bgs/web-api:RELEASE_SHA \
  --region asia-southeast1 \
  --service-account audit-bgs-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --add-cloudsql-instances PROJECT_ID:asia-southeast1:INSTANCE \
  --no-traffic \
  --min 1 \
  --max 5 \
  --concurrency 40
```

Gắn secret/biến môi trường bằng Cloud Run Console hoặc cờ `--set-secrets`/`--set-env-vars`; không chép secret vào tài liệu này.

### 8.5. Smoke revision và chuyển traffic

1. Gắn revision tag để UAT nội bộ gọi được.
2. Kiểm tra `/api/v1/health` và `/api/v1/ready`.
3. Đăng nhập OIDC và chạy 5 persona: Admin, Trưởng đoàn/giám sát, Cán bộ kiểm tra, Cán bộ chi nhánh, Kiểm soát chi nhánh.
4. Kiểm tra tạo chuyên đề → tạo hồ sơ → nộp → kiểm soát → phê duyệt HT → xuất HTML/XLSX.
5. Kiểm tra upload/xem/thu hồi tệp và ACL người ngoài.
6. Chuyển 5% traffic, theo dõi lỗi; sau đó 25%, 50%, 100%.

Cloud Run hỗ trợ chia traffic và đưa 100% traffic về revision cũ khi rollback.

## 9. Scheduler SLA

Tạo Cloud Scheduler lúc 08:30 múi giờ Việt Nam, dùng OIDC service account `audit-bgs-scheduler` để gọi Cloud Run Job hoặc endpoint nội bộ:

```text
Schedule: 30 8 * * *
Timezone: Asia/Ho_Chi_Minh
Authentication: OIDC
```

Job phải có khóa chống chạy trùng theo ngày, chỉ cập nhật `slaStatus`, không đổi `workflowStatus`, và ghi audit/outbox trong cùng transaction.

## 10. Backup, giám sát và rollback

### Backup

- Automated backup hằng ngày và PITR trên Cloud SQL.
- Kiểm tra restore sang instance mới ít nhất mỗi quý.
- Export off-platform theo chính sách tổ chức; backup database không thay thế backup/retention của Drive.
- Lưu migration log, release SHA và thời điểm backup trước mỗi release.

### Alert tối thiểu

- Cloud Run 5xx, latency p95, instance restart và request timeout.
- Cloud SQL CPU, storage, connections, lock/deadlock và failed backup.
- SLA job thất bại hoặc không chạy đúng ngày.
- Outbox backlog, email failure, Apps Script/Drive 429/5xx.
- Nhiều lần đăng nhập thất bại hoặc truy cập bị từ chối bất thường.

### Rollback

1. Nếu lỗi ứng dụng: chuyển 100% traffic về revision trước.
2. Nếu migration tương thích ngược: giữ database, rollback code.
3. Nếu migration phá dữ liệu: dừng ghi, restore PITR sang instance mới rồi đổi kết nối.
4. Không sửa nóng nhiều thứ cùng lúc; ghi incident và bằng chứng sau khi hệ thống ổn định.

## 11. Tiêu chí nghiệm thu production

- `/ready` trả `ready: true`, data store là PostgreSQL, auth là OIDC và evidence là Google Drive.
- Không còn đọc/ghi `data/local-state.json` hoặc `data/drive_storage` trong production.
- RLS/BOLA test chéo chi nhánh bị từ chối.
- Restore Cloud SQL và thu hồi quyền Drive đã được thử thật.
- 5 luồng người dùng, một cấp và hai cấp, SLA, báo cáo HTML/XLSX đều đạt trên domain production.
- Có dashboard, alert, người trực sự cố và lệnh rollback đã thử.

