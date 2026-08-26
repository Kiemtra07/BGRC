# PLANUPDATE — Rà soát thiết kế, đặt tên và lớp lưu trữ file

> Ngày rà soát: **2026-08-25**
> Phạm vi: toàn bộ `src/`, `server/`, `shared/`, `db/`, `tests/`, tài liệu nghiệp vụ `*.md`.
> Trạng thái build khi rà soát: `tsc -b` **PASS** · `vite build` **PASS** · `vitest run` **FAIL (5/87)**.
> Tài liệu này bổ sung cho `IMPLEMENTATION_PLAN.md`, không thay thế. Các quyết định khóa P0-01…P0-15 vẫn giữ nguyên.

## Cập nhật thực thi 2026-08-25 — Loại báo cáo cấu hình động

Phần dưới của tài liệu là ảnh chụp tại thời điểm rà soát ban đầu. Trạng thái mới nhất:

- “Kênh báo cáo” đã đổi thành **Loại báo cáo** và trở thành cấu hình trung tâm cho thông tin, form động, luồng phê duyệt, SLA, Google Sheets và email.
- API đã có tạo, sửa, danh sách phiên bản và xóa an toàn. Loại đã có hồ sơ không được xóa; quản trị viên phải chuyển sang tạm ngừng.
- Mỗi lần sửa tạo `configVersion` và `currentVersionId` mới. Hồ sơ mới ghim phiên bản loại báo cáo, luồng và SLA; hồ sơ cũ không đổi luật theo cấu hình hiện hành.
- Luồng hỗ trợ hai mẫu được kiểm soát: **1 cấp** (Chi nhánh → Phê duyệt HT) và **2 cấp** (Chi nhánh → Kiểm soát chi nhánh → Phê duyệt HT). Luồng 1 cấp đã được nối vào máy trạng thái thật.
- SLA gắn trực tiếp với từng loại báo cáo và tiếp tục được dùng để tính hạn cho hồ sơ mới.
- Google Sheets/email chỉ lưu cấu hình không chứa bí mật; API readiness đọc biến môi trường máy chủ và báo thiếu credential, không mô phỏng kết nối thành công.
- Form riêng của loại báo cáo được render trên màn tạo hồ sơ; trường bắt buộc, số, ngày và danh sách chọn được kiểm tra lại ở server.
- Migration `0060_report_type_integrations.sql` bổ sung cấu hình tích hợp theo phiên bản.
- Localhost đang chạy tại `http://127.0.0.1:3000` (web) và cổng `3001` (API). Đã kiểm tra desktop và viewport 375px, không tràn ngang và không có console error.
- `npm run ci` **PASS**: migration dry-run 10 file, 94 unit tests, 39 integration tests, 3 contract tests và production build.

Việc còn phụ thuộc hạ tầng ngoài phạm vi local: cấp Google service account/Spreadsheet, SMTP và adapter gửi thật; PostgreSQL/OIDC/RLS/outbox vẫn là cổng chặn production như kế hoạch P0.

## Cập nhật thực thi 2026-08-25 — Tách màn Báo cáo và cấu hình trường quản trị

- Màn **Báo cáo** của người xem đã bỏ khối “Trường dữ liệu” và “Thiết lập báo cáo”. Luồng còn: chọn mẫu, chọn “Xem theo”, thêm điều kiện, xem kết quả và xuất Excel/HTML.
- Mẫu đã lưu được đưa vào một danh sách chọn gọn; form lưu mẫu chỉ mở khi người dùng chọn **Lưu cách xem**.
- Cột xuất và chỉ số không còn do người xem tự cấu hình. Hệ thống lấy cấu hình hiện hành do quản trị viên đặt.
- Quản trị có thêm mục **Trường báo cáo** để đổi tên hiển thị, bật/tắt, cho phép phân nhóm, cho phép xuất, chọn cột xuất mặc định và sắp xếp thứ tự. Chỉ số có thể đổi tên, bật/tắt và sắp xếp.
- Mã trường, kiểu dữ liệu và toán tử vẫn là whitelist kỹ thuật, không cho sửa trên giao diện để tránh phá truy vấn và quyền dữ liệu.
- API quản trị `GET/PUT /api/v1/admin/report-catalog` dùng kiểm soát phiên bản; người không có quyền Admin nhận 403. Cấu hình được lưu trong local state và được áp dụng vào chạy báo cáo, mẫu lưu và file xuất.
- Server chặn cấu hình làm mất toàn bộ trường nhóm, chỉ số hoặc cột xuất mặc định; đồng thời từ chối truy vấn đang dùng trường/chỉ số đã bị tắt.
- Smoke trình duyệt đã kiểm tra màn báo cáo tại 320, 375, 414, 768 và 1440 px; màn quản trị trường tại 375 và 1440 px; không tràn ngang. Xuất XLSX/HTML từ nút giao diện và nội dung file đều được kiểm tra.
- `npm run ci` **PASS**: migration dry-run 10 file, 94 unit tests, 40 integration tests, 3 contract tests và production build.

## Cập nhật thực thi 2026-08-25 — CMS mẫu form và tạo mẫu từ Excel

- Cấu hình Form đã chuyển từ danh sách trường sang **CMS mẫu trang** theo block: tiêu đề phần, đoạn hướng dẫn, trường nhập, nhóm trường và đường phân cách.
- Mỗi block có thứ tự, độ rộng và ánh xạ trường; block tham chiếu trường không tồn tại bị server từ chối. Cấu hình được lưu cùng phiên bản loại báo cáo nên hồ sơ cũ không đổi bố cục theo bản mới.
- Quản trị viên có thể tải Excel mẫu ngay trong tab Mẫu form. Hệ thống tìm dòng tiêu đề, giữ vị trí cột, suy luận kiểu số/ngày/văn bản, sinh trường và dựng khung form ban đầu để chỉnh tiếp.
- Luồng “Tạo từ Excel” độc lập cũng dùng chung bộ sinh mẫu, không còn tạo schema và form theo hai cách khác nhau.
- Màn tạo hồ sơ render đúng block đã cấu hình; loại báo cáo cũ chưa có mẫu block tiếp tục dùng bố cục trường hiện hành để tương thích ngược.
- Kiểm thử gồm contract block/field, bộ phân tích Excel, API lưu phiên bản và Playwright localhost desktop/mobile cho thư viện block, nhập Excel và canvas responsive.

## Cập nhật thực thi 2026-08-25 — Chế độ trình bày báo cáo và thanh mã lỗi

- Mẫu báo cáo có ba chế độ người dùng rõ ràng: **Dạng hồ sơ kiểm soát**, **Dạng bảng Excel** và **Dạng form nhập liệu**; quản trị viên xem trước ngay trong CMS trước khi lưu.
- Chính sách **Cho phép đính kèm** được lưu cùng phiên bản loại báo cáo. Hồ sơ ghim phiên bản không cho đính kèm sẽ bỏ khu vực tài liệu và được chuyển luồng bằng dữ liệu form, không bị chặn bởi điều kiện bằng chứng của loại khác.
- Trình nhập dạng bảng hiển thị các trường thành cột như Excel; dropdown và nhãn in đậm lấy từ data validation/style của file `.xlsx`, sau đó vẫn cho quản trị viên sửa lại.
- Loại báo cáo mới mặc định có luồng đầy đủ hai cấp: Chi nhánh khắc phục → Kiểm soát chi nhánh → Phê duyệt HT, kèm SLA và cấu hình tích hợp ban đầu.
- Header hồ sơ khách hàng đã giảm cỡ tên, tăng diện tích thanh mã lỗi, giảm chiều rộng từng mã, giữ scrollbar ngang ổn định và đưa **Tiếp nhận công việc**, **Theo dõi**, ẩn/hiện thông tin vào cùng thanh thao tác.
- Khối thông tin nhanh trùng lặp đã bỏ; dữ liệu form được hiển thị trong chi tiết hồ sơ khi loại báo cáo không dùng tài liệu.

---

## 0. Tóm tắt điều hành

| Câu hỏi | Trả lời ngắn |
|---|---|
| Thiết kế app đã chuẩn chưa? | Lõi backend (workflow, RBAC, idempotency, optimistic locking, Problem Details) **chuẩn**. Tầng frontend còn **~40% mã chết** thuộc thế hệ prototype cũ, chạy song song với hệ thống mới. |
| Đặt tên các bước quy trình đã chuẩn chưa? | Trong code **nhất quán** (5 status × 5 command). Nhưng **3/4 tài liệu nghiệp vụ vẫn mô tả quy trình cũ có `CLUSTER_APPROVER` / "Lãnh đạo Cụm duyệt"** — trái với P0-03 và trái với code. |
| Đặt tên các key đã chuẩn chưa? | Key báo cáo (`dimension.*`, `measure.*`, `metric.*`, `op.*`) **rất chuẩn**. Key evidence (`driveFileId`, `driveUrl`) **sai ngữ nghĩa**. Key `.env` **lệch giữa file mẫu và code**. |
| Hiển thị đã chuẩn chưa? | **Chưa.** Enum thô lọt ra màn hình người dùng, hai bộ nhãn trạng thái trùng lặp, SLA không hiển thị ở đâu cả, còn `alert()` và chữ kỹ thuật tiếng Anh. |
| Hệ thống kết nối lưu trữ file Google ở đâu? | **Không có.** Không có kết nối Google Drive nào. File nằm trên **ổ đĩa local** tại `E:\AuditBGS\data\drive_storage\`. Chi tiết ở mục 1. |

**5 lỗi nghiêm trọng nhất phát hiện được:**

1. **SLA hoàn toàn không chạy** — `slaWorker` không được gọi từ bất kỳ đâu trong `server/src/app.ts`. Dữ liệu SLA hiện tại đã sai (mục 5.3).
2. **`deadlineDate` bị hardcode +15 ngày** cho mọi finding, bỏ qua `slaConfig` của kênh và bỏ qua hạn xử lý trong file Excel nguồn (`server/src/app.ts:800`).
3. **Hai bộ test tự mâu thuẫn** — `ui-architecture.test.ts` *bắt buộc* chuỗi `'Từ điển key chuẩn'`, `ui-copy.test.ts` *cấm* chính chuỗi đó. Không bao giờ xanh được cả hai.
4. **`.env.example` khai `DATA_STORE_MODE=memory`** nhưng code chỉ bật lưu bền khi giá trị là `local-json` → làm đúng theo file mẫu sẽ **mất toàn bộ dữ liệu khi restart**, trong khi `/api/v1/ready` vẫn báo `durable: true` (hardcode).
5. **Không có Google Drive** nhưng tên biến, tên cột DB và tên tài liệu đều gọi là "Drive" → hiểu nhầm mức thiết kế.

---

## 1. HỆ THỐNG LƯU TRỮ FILE GOOGLE ĐANG Ở ĐÂU?

### 1.1 Trả lời trực tiếp

**Chưa có kết nối Google Drive.** Không có SDK, không có credential, không có gọi API nào tới Google.

Bằng chứng:

| Kiểm tra | Kết quả |
|---|---|
| `googleapis` / `google-auth-library` trong `package.json` | **Không có** (0 kết quả) |
| Lời gọi HTTP tới `googleapis.com` | **Không có** |
| `GOOGLE_SERVICE_ACCOUNT_KEY` được dùng để ký JWT | **Không** — chỉ dùng làm cờ boolean tại `server/src/adapters/google-drive.ts:50` |
| Nơi file thật sự nằm | `E:\AuditBGS\data\drive_storage\` (ổ đĩa local) |

### 1.2 Đường đi thật của một file minh chứng

```
Người dùng chọn file (BRANCH_INPUT)
  → src/components/portal/FindingDetailPage.tsx  handleUpload()
  → src/services/api.ts  uploadEvidence()   POST multipart /api/v1/findings/:id/evidence
  → server/src/app.ts:1660  requireRoles(user, ['BRANCH_INPUT'])
  → googleDriveService.validateUploadMetadata()   kiểm MIME + đuôi + size ≤ 25MB + double-extension
  → googleDriveService.generateFolderPath()       sinh đường dẫn logic
  → googleDriveService.uploadEvidenceFile()
        ├─ nếu CÓ biến Google  → ném 503 GOOGLE_DRIVE_ADAPTER_NOT_READY  (KHÔNG upload)
        └─ nếu KHÔNG có biến   → fs.writeFileSync() xuống ổ đĩa local
  → lưu metadata vào mảng in-memory `evidences[]`
  → LocalStateRepository.save()  →  data/local-state.json
```

Đọc lại file: `GET /api/v1/evidence/:driveFileId/content` → `getFileContentStream()` → `fs.createReadStream()` → stream về trình duyệt → `EvidenceViewer` render PDF/ảnh/XLSX.

### 1.3 Cấu trúc thư mục đang dùng

`generateFolderPath()` tại `server/src/adapters/google-drive.ts:108`:

```
/{channelCode}/{year}/{clusterName}/CN_{branchCode}/{cif}_{errorCode}
```

Thực tế trên đĩa:

```
data/drive_storage/
└── AUDIT_BGS/2026/Cụm_Tây_Nguyên/CN_635/10482910_TD01_01/
    ├── drive_09780d3e-…_crm-template-customers.xlsx
    └── drive_56dac205-…_DANH SÁCH HÓA ĐƠN (3).xlsx
```

Cấu trúc phân cấp này **đúng và dùng lại được** khi chuyển sang Drive thật — chỉ cần thay `fs.writeFileSync` bằng `files.create` + cây folder Drive.

### 1.4 Có **hai** lớp "Drive" song song — một lớp là hàng giả

| Lớp | File | Trạng thái | Ghi chú |
|---|---|---|---|
| **A — Server (đang chạy)** | `server/src/adapters/google-drive.ts` | Ghi file thật xuống ổ đĩa local. **Trung thực**: có config Google thì ném 503 chứ không âm thầm fallback. | Giữ lại, mở rộng thành Drive thật. |
| **B — Client (mã chết)** | `src/lib/google-drive.ts` | **Không ghi gì cả.** Chỉ sinh chuỗi `https://drive.google.com/file/d/gdrive_<random>/view` giả và trả về object. | Chỉ được import bởi `CustomerDetailModal` + `GoogleDriveViewerModal` — **cả hai đều là mã chết**. **Phải xóa.** |

Lớp B nguy hiểm ở chỗ nó tạo cảm giác hệ thống "đã có Google Drive": nó sinh URL trông y như thật, có cả `canDeleteFile()` với thông báo RBAC bằng tiếng Việt. Nếu lớp B bị nối lại vào UI, người dùng sẽ thấy link Drive bấm vào thì 404.

### 1.5 Cổng chặn production đang hoạt động đúng

`server/src/app.ts:1864` `assertSafeRuntimeConfiguration()` **luôn** đẩy vào danh sách vi phạm dòng:

```
'backend hiện vẫn dùng local JSON repository và chưa có Google Drive API v3 adapter'
```

→ `NODE_ENV=production` **luôn fail-fast**, kể cả khi đã khai đủ OIDC + PostgreSQL + Google. Đây là thiết kế **đúng** và cần giữ cho tới khi adapter thật xong.

### 1.6 Tên gọi ≠ thực tế (nợ kỹ thuật ngữ nghĩa)

| Tên trong contract/DB | Giá trị thật hiện tại | Vấn đề |
|---|---|---|
| `driveFileId` | `drive_<uuid>` — id local tự sinh | Không phải Drive file id |
| `driveUrl` | `/api/v1/evidence/<id>/content` — đường dẫn API nội bộ | Không phải URL Drive |
| `evidence_objects.drive_file_id` (`db/migrations/0030`) | như trên | Cột DB gắn cứng vào một nhà cung cấp |
| `data/drive_storage/` | thư mục local | Tên thư mục gợi sai |

Đề xuất đổi (mục 7, Đợt 3): `storageProvider` (`LOCAL` | `GOOGLE_DRIVE`) + `storageObjectId` + `contentUrl`.

---

## 2. RÀ SOÁT THIẾT KẾ APP

### 2.1 Kiến trúc thực tế

```
React 18 + Vite + Tailwind (port 3000)
        │ proxy /api → 127.0.0.1:3001
        ▼
Fastify 5 (port 3001)  ── shared/contracts (zod + TypeScript, dùng chung 2 đầu)
        │
        ├── modules/workflow/workflow-service.ts   (máy trạng thái)
        ├── security/access-control.ts             (RBAC + data scope)
        ├── adapters/google-drive.ts               (lưu file → local)
        ├── adapters/postgres.ts                   (CHƯA ĐƯỢC NỐI VÀO ROUTE NÀO)
        ├── worker/sla-worker.ts                   (CHƯA ĐƯỢC GỌI TỪ ĐÂU)
        └── repositories/local-state.ts            (JSON ghi nguyên tử)
                    ▼
        data/local-state.json  +  data/drive_storage/
```

### 2.2 Những điểm thiết kế **đã chuẩn** (giữ nguyên)

- **`shared/contracts/` dùng chung frontend + backend.** Một nguồn sự thật cho type và zod schema. Đây là điểm mạnh nhất của codebase.
- **Máy trạng thái tách riêng** (`workflow-service.ts`): `validateTransition()` kiểm tra trạng thái nguồn + vai trò trước, `execute*()` kiểm `expectedVersion` sau. Sạch, test được độc lập.
- **Optimistic locking** qua `expectedVersion` → `409 VERSION_CONFLICT`.
- **Idempotency bền vững**: `Idempotency-Key` bắt buộc cho mọi lệnh đổi trạng thái, hash body để phát hiện replay sai, sống sót qua restart.
- **RFC 7807 Problem Details** thống nhất qua `server/src/http/problem.ts`.
- **Data scope cưỡng chế ở server** (`hasFindingAccess`), không phụ thuộc ẩn nút trên UI.
- **Ghi JSON nguyên tử** (`.tmp` → rename, có phục hồi khi crash giữa chừng).
- **Kiểm tra upload chặt**: whitelist MIME theo đuôi, chặn double-extension (`abc.exe.pdf`), chặn path traversal, giới hạn 25 MB, checksum SHA-256.
- **`ADMIN` bị khóa khỏi quyết định nghiệp vụ** — đúng nguyên tắc tách quản trị cấu hình khỏi phê duyệt.
- **Code-splitting** theo vendor (pdf, excel, charts, icons) — chunk chính 179 kB.

### 2.3 Những điểm thiết kế **chưa chuẩn**

#### 2.3.1 Hai thế hệ frontend chạy song song — 7 component chết

| Component | Trạng thái | Phụ thuộc kéo theo |
|---|---|---|
| `src/components/auth/LoginPortal.tsx` | chết | `lib/mock-data.ts` |
| `src/components/common/Header.tsx` | chết | `lib/mock-data.ts` |
| `src/components/common/CustomerDetailModal.tsx` (700 dòng) | chết | `GoogleDriveViewerModal`, `lib/google-drive.ts` |
| `src/components/common/GoogleDriveViewerModal.tsx` | chết | `lib/google-drive.ts` (Drive giả) |
| `src/components/branch/BranchDashboard.tsx` | chết | `KpiCard` |
| `src/components/internal/InternalDashboard.tsx` | chết | `KpiCard`, `lib/mock-data.ts` |
| `src/components/internal/ErrorCatalogModal.tsx` | chết | `lib/mock-data.ts` |
| `src/components/admin/EmailSchedulerConfig.tsx` | chết | `types.ts` legacy |
| `src/types/dynamic-channel.ts` | chết | bản sao 1:1 của `shared/contracts/channels.ts` |

Tổng ≈ **2.100 dòng mã chết**, tất cả đều bám vào `src/types.ts` (legacy) thay vì `shared/contracts`.

Hệ quả cụ thể: `ui-architecture.test.ts:16` vẫn đọc `src/components/common/Header.tsx` (file chết) như một "active source" để kiểm thuật ngữ nghiệp vụ. Test đang bảo vệ mã không chạy.

#### 2.3.2 Hai hệ thống type song song

| Khái niệm | `shared/contracts` (mới, đúng) | `src/types.ts` (cũ, còn dùng) |
|---|---|---|
| Đơn vị nghiệp vụ | `Finding` (phẳng, 1 lỗi = 1 record) | `AuditError` lồng trong `CustomerRecord` |
| Trạng thái | `WorkflowStatus` | `ErrorStatus` (cùng 5 giá trị, khác tên type) |
| Vai trò người dùng | `roles: UserRole[]` + `primaryRole` | `role: UserRole` (một vai trò) |
| Danh sách vai trò | 7 vai trò (có `VIEWER`) | 6 vai trò (thiếu `VIEWER`) |
| Nhật ký | `WorkflowEvent.command` | `ApprovalLog.action` |

`src/App.tsx:150-160` phải giữ một hàm adapter `legacyUser` để dịch `UserProfile` mới → `LegacyUserProfile` cũ, chỉ để nuôi `FastDataIngestion`. Đây là điểm nối duy nhất còn sống giữa hai thế hệ.

Tên hành động cũng lệch giữa hai hệ:

| Hành động | Command mới (server) | `ApprovalLog.action` cũ |
|---|---|---|
| Chi nhánh nộp | `SUBMIT_BRANCH` | `SUBMIT_BRANCH_CONTROL` |
| Kiểm soát CN duyệt | `BRANCH_CONTROL_APPROVE` | `BRANCH_CONTROL_APPROVE` |
| Từ chối | `BRANCH_CONTROL_REJECT` / `INTERNAL_REJECT` | `REJECT` (gộp, mất thông tin cấp) |

#### 2.3.3 Ingestion chưa đi qua staging (trái P0-07)

`FastDataIngestion` parse Excel **trong trình duyệt**, rồi `POST /api/v1/imports/findings` với dữ liệu đã chuẩn hóa sẵn. Server tại `server/src/app.ts:1535` ghi ngay `status: 'COMMITTED'`.

- Bảng `staging_rows` (`db/migrations/0020`) và type `StagingRow` / `StagingValidationError` **có nhưng chưa dùng**.
- `sourceType` bị hardcode `'API_BULK'` kể cả khi nguồn là file Excel → sai enum, mất khả năng truy vết nguồn.
- Không có bước xem trước lỗi validate trước khi commit.

#### 2.3.4 Version binding là chuỗi cố định (trái P0-14)

`server/src/app.ts:772-774`:

```ts
channelVersionId: 'v1',
workflowVersionId: 'wf-v1',
slaPolicyVersionId: 'sla-v1',
```

Ba trường này tồn tại đúng để hồ sơ đang chạy không bị đổi luật khi publish cấu hình mới. Hardcode chuỗi làm chúng vô nghĩa.

#### 2.3.5 PostgreSQL và SLA worker là mã mồ côi

- `server/src/adapters/postgres.ts` — viết xong `withTransaction`, `set_config('app.current_user_id')` cho RLS — **không route nào import**.
- `server/src/worker/sla-worker.ts` — **không nơi nào gọi** `slaWorker.runDailyEvaluation()`. Script `dev:worker` chạy file này thì nó gọi `runDailyEvaluation([])` với mảng rỗng rồi thoát.
- 9 file migration SQL viết đầy đủ, có `db:migrate:dry-run` + checksum guard, nhưng **chưa từng chạy trên database thật**.

---

## 3. RÀ SOÁT TÊN CÁC BƯỚC QUY TRÌNH

### 3.1 Bảng đối chiếu đầy đủ

| # | Bước nghiệp vụ | `WorkflowStatus` | Command | API route | Vai trò | Nhãn UI (`FindingDetailPage`) | Nhãn UI (`App.tsx`) | Nhãn nút |
|---|---|---|---|---|---|---|---|---|
| 0 | Khởi tạo | `PENDING` | — | `POST /findings`, `POST /imports/findings` | `ADMIN`, `INTERNAL_OFFICER`, `SUPERVISOR` | "Chờ chi nhánh khắc phục" | "Chờ khắc phục" | — |
| 1 | Chi nhánh nộp | → `SUBMITTED_BRANCH` | `SUBMIT_BRANCH` | `/actions/submit-branch` | `BRANCH_INPUT` | "Chờ Kiểm soát chi nhánh" | "Kiểm soát CN" | "Gửi Kiểm soát chi nhánh" |
| 2a | Kiểm soát CN duyệt | → `SUBMITTED_INTERNAL` | `BRANCH_CONTROL_APPROVE` | `/actions/branch-control-approve` | `BRANCH_CONTROLLER` | "Chờ Khối Nội Bộ" | "Khối nội bộ" | "Đồng ý xử lý lỗi" |
| 2b | Kiểm soát CN trả về | → `REJECTED` | `BRANCH_CONTROL_REJECT` | `/actions/branch-control-reject` | `BRANCH_CONTROLLER` | "Đã chuyển trả" | "Chuyển trả" | "Chuyển trả về" |
| 3a | Khối Nội Bộ đóng lỗi | → `WAIVED_RESOLVED` | `INTERNAL_WAIVE` | `/actions/internal-waive` | `INTERNAL_APPROVER`, `SUPERVISOR` | "Đã đóng lỗi" | "Đã đóng" | "Đồng ý đóng lỗi" |
| 3b | Khối Nội Bộ trả về | → `REJECTED` | `INTERNAL_REJECT` | `/actions/internal-reject` | `INTERNAL_APPROVER`, `SUPERVISOR` | "Đã chuyển trả" | "Chuyển trả" | "Chuyển trả về" |

**Kết luận phần code: nhất quán.** Status ↔ command ↔ route ↔ vai trò khớp 100% giữa `common.ts`, `workflow.ts`, `workflow-service.ts`, `app.ts` và ràng buộc `CHECK` trong `db/migrations/0020:66`.

### 3.2 Lệch #1 (nghiêm trọng): tài liệu nghiệp vụ mô tả quy trình đã bị bãi bỏ

P0-03 khóa: *Chi nhánh → **Kiểm soát chi nhánh** → Khối Nội Bộ*. Cụm chỉ để nhóm địa bàn, **không có quyền duyệt**.

Nhưng:

| Tài liệu | Nội dung sai | Vị trí |
|---|---|---|
| `LUU_DO_VAN_HANH_CHI_TIET.md` | "BƯỚC 3: **CỤM THẨM TRA SƠ BỘ (CẤP 1)**" | dòng 98 |
| `LUU_DO_VAN_HANH_CHI_TIET.md` | B4.1/B4.2a/B4.2b đều ghi vai trò `CLUSTER_APPROVER` — **role này không tồn tại trong code** | dòng 157-159 |
| `HUONG_DAN_VAN_HANH_CHI_TIET.md` | "Bước 5 (Dành cho **Lãnh đạo Cụm**): Thẩm Tra Sơ Bộ" · "đăng nhập tài khoản có quyền `CLUSTER_APPROVER`" | dòng 137-139 |
| `HUONG_DAN_VAN_HANH_CHI_TIET.md` | "`SUBMITTED_BRANCH` (**Chờ Cụm Duyệt**)" | dòng 133 |
| `HUONG_DAN_VAN_HANH_CHI_TIET.md` | "Mô hình 2 Cấp (Chuẩn Audit BGS): Chi nhánh nộp → **Lãnh đạo Cụm duyệt** → Khối Nội Bộ" | dòng 285 |
| `THIET_KE_ADMIN_PORTAL.md` | Ma trận phân quyền có cột `CLUSTER_APPROVER`; mô tả `CLUSTER_SCOPE` "duyệt hồ sơ thuộc Cụm" | dòng 108, 122 |
| `LUU_DO_VAN_HANH_CHI_TIET.drawio` + 2 file `.png` + `luu_do_diagram.html` | sơ đồ vẽ theo luồng cũ | toàn bộ |

Nghịch lý đáng chú ý: `tests/unit/ui-architecture.test.ts:24` **cấm** chuỗi `CLUSTER_APPROVER` xuất hiện trong source code — nhưng không ai kiểm tài liệu, nên tài liệu vẫn dạy sai.

**Rủi ro thực tế:** người vận hành đọc `HUONG_DAN_VAN_HANH_CHI_TIET.md`, đi tìm tab "Hồ sơ Chờ Cụm Duyệt" và tài khoản `CLUSTER_APPROVER` — cả hai đều không tồn tại.

### 3.3 Lệch #2: hai bộ nhãn trạng thái trùng lặp, khác chữ

Cùng một `WorkflowStatus` được đặt tên ở **hai nơi độc lập**:

| Status | `src/App.tsx:19` | `FindingDetailPage.tsx:21` | Tab lọc `App.tsx:220` |
|---|---|---|---|
| `PENDING` | "Chờ khắc phục" | "Chờ chi nhánh khắc phục" | "Chờ khắc phục" |
| `SUBMITTED_BRANCH` | "Chờ Kiểm soát chi nhánh" | "Chờ Kiểm soát chi nhánh" | "Kiểm soát CN" |
| `SUBMITTED_INTERNAL` | "Chờ Khối Nội Bộ" | "Chờ Khối Nội Bộ" | "Khối nội bộ" |
| `REJECTED` | "Đã chuyển trả" | "Đã chuyển trả" | "Chuyển trả" |
| `WAIVED_RESOLVED` | "Đã đóng lỗi" | "Đã đóng lỗi" | "Đã đóng" |

Ba biến thể cho cùng một trạng thái trên ba màn hình. Server còn có bộ thứ tư (`slaStatusLabels`, `app.ts:858`) chỉ dùng cho báo cáo.

`tests/unit/ui-copy.test.ts` **đã đặc tả sẵn lời giải**: một từ điển dùng chung tại `src/content/ui-copy.ts`. File này **chưa được tạo** → 3 test đỏ.

### 3.4 Lệch #3: `rejectedFromStage` lưu nhưng không hiển thị; `returnToStage` chưa có

P0-09 yêu cầu khi `REJECTED` phải có: `rejectedFromStage`, **`returnToStage=BRANCH_REMEDIATION`**, người/lúc/lý do.

| Trường | Lưu? | Hiển thị? |
|---|---|---|
| `rejectionReason` | có | có (`FindingDetailPage.tsx:306`) |
| `rejectedFromStage` (`BRANCH_CONTROL_REVIEW` \| `INTERNAL_REVIEW`) | có | **không** |
| `rejectedByUserName` | có | **không** |
| `rejectedAt` | có | **không** |
| `returnToStage` | **không tồn tại trong code** (0 kết quả toàn repo) | — |

Hệ quả: cán bộ chi nhánh nhìn hồ sơ bị trả về **không biết bị trả từ cấp nào** — Kiểm soát chi nhánh hay Khối Nội Bộ. Hai trường hợp này khác nhau hoàn toàn về mức độ và cách xử lý.

### 3.5 Lệch #4: tên bước trong Admin ≠ tên bước trong tài liệu

`src/components/admin/WorkflowBuilder.tsx` hiển thị:

```
Bước 1                  → "Chi nhánh khắc phục"
Bước 2 · Cấp kiểm soát  → "Kiểm soát chi nhánh"
Bước 3 · Quyết định cuối → "Khối Kiểm toán Nội bộ"
```

Trong khi `LUU_DO_VAN_HANH_CHI_TIET.md` đánh số Bước 1-5 và `HUONG_DAN_VAN_HANH_CHI_TIET.md` đánh số riêng cho từng cổng (Chi nhánh: Bước 1-5, Nội bộ: Bước 1-4). **Ba hệ đánh số khác nhau** cho cùng một quy trình → không thể trích dẫn chéo.

---

## 4. RÀ SOÁT ĐẶT TÊN KEY

### 4.1 Key báo cáo — **chuẩn, giữ nguyên làm hình mẫu**

`shared/contracts/dashboards.ts` định nghĩa 4 không gian tên tách bạch:

```
dimension.*  (11 key)  — chiều phân tích:  dimension.cluster, dimension.workflow_status …
date.*       (2 key)   — trục thời gian:   date.audit, date.deadline
measure.*    (4 key)   — số liệu thô:      measure.exposure, measure.credit_balance …
flag.*       (1 key)   — cờ boolean:       flag.overdue
op.*         (9 key)   — toán tử:          op.eq, op.between, op.is_true …
metric.*     (9 key)   — số liệu tổng hợp: metric.exposure_sum, metric.remediation_rate …
```

Mỗi key có `label` tiếng Việt, `valueType`, danh sách `operators` hợp lệ, cờ `groupable`/`exportable`. Catalog được version hóa (`version: 'report-keys.v1'`). **Đây là chuẩn đặt tên tốt nhất trong toàn bộ codebase** — nên dùng làm khuôn mẫu cho các miền còn lại.

Một cảnh báo: `dimension.sla_status`, `flag.overdue`, `metric.overdue_count` đọc từ `finding.slaStatus` / `finding.isOverdue` — **hai trường này không bao giờ được cập nhật** (mục 5.3). Báo cáo SLA hiện tại **luôn sai**.

### 4.2 Key evidence — sai ngữ nghĩa (đã phân tích ở mục 1.6)

### 4.3 Key môi trường — lệch giữa `.env.example` và code

| Key | `.env.example` | Code đọc ở đâu | Vấn đề |
|---|---|---|---|
| `DATA_STORE_MODE` | `memory` | `app.ts:509` — chỉ bật lưu bền khi `=== 'local-json'` | **Làm theo file mẫu → mất dữ liệu mỗi lần restart** |
| `EVIDENCE_STORAGE_MODE` | `local` | chỉ đọc trong `assertSafeRuntimeConfiguration` (cổng production) | Runtime **bỏ qua hoàn toàn**; adapter tự quyết theo `GOOGLE_*` |
| `AUTH_MODE` | `mock-header` | chỉ đọc trong cổng production | Runtime bỏ qua |
| `LOCAL_STATE_FILE` | **không khai** | `app.ts:508` | Key thật nhưng không có trong file mẫu |
| `OIDC_ISSUER_URL` / `OIDC_AUDIENCE` | comment | chỉ đọc trong cổng production | OK (chưa triển khai) |

Đồng thời `/api/v1/ready` (`app.ts:1042`) trả **hardcode**:

```ts
dataStore: { mode: 'local-json', durable: true },
auth:      { mode: 'mock-header', productionSafe: false },
```

Không gọi `localStateRepository.getStatus()`. Nếu chạy với `DATA_STORE_MODE=memory` thật, `/ready` vẫn báo `durable: true` — **endpoint readiness nói dối**, đúng thứ mà `IMPLEMENTATION_PLAN.md` khẳng định đã sửa xong ("readiness trung thực").

### 4.4 Key trùng lặp giữa hai nơi

`src/types/dynamic-channel.ts` là **bản sao 1:1** của `shared/contracts/channels.ts` (cùng `ChannelCategory`, `FieldDataType`, `CoreFieldRole`, `DynamicFieldDefinition`, `ButtonActionConfig`, `DynamicWorkflowStage`…), chỉ khác `targetStatusCode` dùng `ErrorStatus` thay vì `WorkflowStatus`. File **không được import ở đâu** → xóa.

### 4.5 Key nghiệp vụ tự do, chưa có từ điển

Các giá trị sau đang là chuỗi tự do rải rác trong code, chưa có enum/catalog:

- `rejectedFromStage`: `'BRANCH_CONTROL_REVIEW'` \| `'INTERNAL_REVIEW'` — khai bằng string literal ở 2 chỗ trong `workflow-service.ts`, không có type.
- `loanGroup`: `'Nhóm 1'`, `'Nhóm 2'`, mặc định `'Chưa xác định'` — chuỗi tiếng Việt làm khóa.
- `errorGroup`: suy ra bằng `errorCode.split('.')[0]` — quy ước ngầm, không có catalog.
- `channelId`: `'chan-audit-bgs'` hardcode ở `src/App.tsx:33` và `FastDataIngestion` (payload commit).

---

## 5. RÀ SOÁT HIỂN THỊ

### 5.1 Enum thô lọt ra màn hình người dùng cuối

| Vị trí | Đang hiển thị | Nên hiển thị |
|---|---|---|
| `FindingDetailPage.tsx:346` — Lịch sử xử lý | `SUBMIT_BRANCH`, `BRANCH_CONTROL_APPROVE`, `INTERNAL_WAIVE` | "Chi nhánh nộp hồ sơ", "Kiểm soát chi nhánh đồng ý", "Khối Nội Bộ đóng lỗi" |
| `AuditTrailViewer.tsx:117,147` — cột loại sự kiện | `event.command` thô | nhãn tiếng Việt |
| `app.ts:1240` — trường `details` | `"PENDING → SUBMITTED_BRANCH"` | "Chờ khắc phục → Chờ Kiểm soát chi nhánh" |
| `App.tsx` — dropdown chọn user | `user.primaryRole` thô (`BRANCH_CONTROLLER`) | "Kiểm soát chi nhánh" |

### 5.2 Chữ kỹ thuật / khẩu hiệu tiếng Anh trên màn hình nghiệp vụ

`tests/unit/ui-copy.test.ts:54-67` liệt kê 13 chuỗi bị cấm. Hiện **tất cả 13 chuỗi đều còn trong code**:

| Chuỗi | File |
|---|---|
| `Web Form Ingestion` | `ingestion/WebFormFindingModal.tsx` |
| `Fast Ingestion Hub`, `Multi-Excel Batch`, `WebWorker`, `Nạp Ngay Vào Hệ Thống`, `Siêu Tốc` | `internal/FastDataIngestion.tsx` |
| `Xuất CSV theo key`, `Từ điển key chuẩn` | `reports/ReportsWorkspace.tsx` |
| `Admin Control Center` | `admin/AdminPortal.tsx` |
| `Backend enforced` | `admin/ButtonPermissionMatrix.tsx` |
| `authoritative local`, `workflow_events` | `admin/AuditTrailViewer.tsx` |
| `Local header mock` | `admin/UserManager.tsx` |
| `Siêu Tốc` | `common/Header.tsx` (mã chết), `internal/InternalDashboard.tsx` (mã chết) |

"Backend enforced", "workflow_events", "authoritative local" là thuật ngữ dành cho lập trình viên, không phải cho cán bộ ngân hàng.

### 5.3 SLA không hiển thị ở đâu — và dữ liệu SLA đang sai

**Không hiển thị:**

`DashboardSummary` trả về `onTrackCount`, `dueSoonCount`, `overdueCount` (`app.ts:1753-1755`). `src/App.tsx` chỉ render 4 KPI: *Khách hàng hiển thị · Tổng mã lỗi · Chờ Kiểm soát CN · Đã đóng lỗi*. **Không có KPI quá hạn.**

`FindingDetailPage.tsx:338` chỉ hiển thị ngày `"Hạn xử lý"`. Không có badge `slaStatus`, không có cảnh báo quá hạn, không đếm ngược ngày.

Với một hệ thống kiểm toán mà SLA là trục vận hành chính, đây là thiếu sót lớn nhất về hiển thị.

**Dữ liệu sai — kiểm chứng bằng `data/local-state.json` (hôm nay 2026-08-25):**

| Finding | `deadlineDate` | Còn lại | `slaStatus` đang lưu | Đúng phải là |
|---|---|---|---|---|
| `find-001` | 2026-08-30 | 5 ngày | `DUE_SOON` | `ON_TRACK` |
| `find-003` | 2026-08-28 | **3 ngày** | `ON_TRACK` | **`DUE_SOON`** |
| `find-002` | 2026-09-10 | 16 ngày | `ON_TRACK` | `ON_TRACK` ✓ |
| `find-004` | 2026-09-05 | 11 ngày | `ON_TRACK` | `ON_TRACK` ✓ |

Nguyên nhân gốc: **`slaWorker` không được gọi từ bất kỳ đâu.** `grep "slaWorker" server/src/app.ts` → 0 kết quả. `slaStatus` được gán một lần lúc tạo finding (`app.ts:798`, luôn `'ON_TRACK'`) rồi đóng băng vĩnh viễn.

Kéo theo: `metric.overdue_count` luôn = 0, `flag.overdue` luôn = false, bộ lọc `?slaStatus=OVERDUE` không bao giờ trả kết quả.

### 5.4 `deadlineDate` hardcode +15 ngày

`server/src/app.ts:800`:

```ts
deadlineDate: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().split('T')[0],
```

- Bỏ qua `DynamicSlaConfig` của kênh (`defaultDays`, `highRiskDays`, `mediumRiskDays`, `lowRiskDays`) — cấu hình có đủ nhưng không ai đọc.
- `WebFormFindingSchema` (`shared/contracts/ingestion.ts`) **không có trường `deadlineDate`** → hạn xử lý trong biên bản kiểm tra gốc bị vứt bỏ.
- Mọi finding import cùng lô đều có cùng hạn, bất kể mức độ rủi ro.

### 5.5 Thiếu nhất quán về phản hồi cho người dùng

| Cách phản hồi | Nơi dùng |
|---|---|
| Banner inline (`role="alert"` / `role="status"`) | `App.tsx`, `FindingDetailPage.tsx` — **đúng** |
| `alert()` / `window.confirm()` của trình duyệt | `FastDataIngestion.tsx` (3 chỗ), `GoogleDriveViewerModal.tsx` — **không nhất quán, không a11y, chặn luồng** |

### 5.6 Điểm hiển thị **đã tốt**

- Màu thương hiệu `#006b68` thống nhất; font Roboto đóng gói offline.
- Responsive nghiêm túc: bảng trên desktop ↔ card trên mobile (`data-testid="customer-card"`), sidebar trượt, breakpoint 375px có ảnh chụp kiểm chứng trong `tests/e2e/artifacts/`.
- Vùng chạm ≥ 44px (`min-h-11`) nhất quán.
- `aria-label` / `focus-visible:ring` đầy đủ trên các control chính.
- Trình xem PDF/Excel/ảnh nhúng thật (pdf.js + read-excel-file), có zoom, xoay, kéo-thả, "vừa trang giấy" / "vừa chiều rộng" — chất lượng cao.
- Định dạng ngày `toLocaleDateString('vi-VN')`, sắp xếp chuỗi `localeCompare(…, 'vi-VN')` — xử lý tiếng Việt đúng.

---

## 6. TRẠNG THÁI KIỂM THỬ HIỆN TẠI

```
Test Files  3 failed | 12 passed (15)
Tests       5 failed | 82 passed (87)
```

| Test đỏ | Nguyên nhân | Loại |
|---|---|---|
| `ui-copy` › từ điển dùng chung | `src/content/ui-copy.ts` chưa tồn tại | **Tính năng chưa làm** |
| `ui-copy` › nhãn hành động từng cấp | `FindingDetailPage` chưa dùng `workflowActionLabels.*` | **Tính năng chưa làm** |
| `ui-copy` › loại chữ kỹ thuật | 13/13 chuỗi cấm còn nguyên | **Tính năng chưa làm** |
| `ui-architecture` › nhóm user theo team/cụm | `UserManager.tsx` đã viết lại, mất các tiêu đề mà test yêu cầu | **Test lạc hậu** |
| `api-security` › không fallback theo tên chi nhánh | Server nay bắt buộc `branchCode` phải tồn tại trong cây org → trả `422` thay vì `200` | **Test lạc hậu** (hành vi mới chặt hơn, đúng hơn) |

### Mâu thuẫn trực tiếp giữa hai file test

| | `ui-architecture.test.ts:59` | `ui-copy.test.ts:61` |
|---|---|---|
| `'Từ điển key chuẩn'` trong `ReportsWorkspace.tsx` | **BẮT BUỘC phải có** | **CẤM có** |

Hai điều kiện loại trừ nhau. Phải chọn một chuẩn và sửa file test còn lại — nếu không, suite **không bao giờ xanh được**.

Ngoài ra `ui-architecture.test.ts:17` đọc `src/components/common/Header.tsx` — file mã chết — như nguồn kiểm thuật ngữ.

---

## 7. KẾ HOẠCH CẬP NHẬT

Nguyên tắc: **không mở rộng phạm vi P0**. Các đợt dưới đây sửa đúng những gì đã phát hiện, theo thứ tự "làm cho hệ thống nói thật" → "làm cho hệ thống nhất quán" → "làm cho hệ thống đầy đủ".

### Đợt 1 — Trả lại màu xanh cho test và gỡ mâu thuẫn *(1-2 ngày)*

Không sửa được gì khác cho tới khi CI trung thực.

| # | Việc | File |
|---|---|---|
| 1.1 | **Chốt một chuẩn cho `'Từ điển key chuẩn'`.** Đề xuất: theo `ui-copy` (bỏ chữ kỹ thuật) → đổi tên hiển thị thành **"Danh mục trường báo cáo"**; xóa dòng `expect` tương ứng trong `ui-architecture.test.ts:59` | `tests/unit/ui-architecture.test.ts`, `src/components/reports/ReportsWorkspace.tsx` |
| 1.2 | Tạo `src/content/ui-copy.ts` theo đúng đặc tả `ui-copy.test.ts:34-37`: `branchApprove: 'Chuyển phê duyệt HT'`, `returnToBranch: 'Trả chi nhánh bổ sung'`, `internalApprove: 'Đóng lỗi'`, `REJECTED: 'Chi nhánh cần bổ sung'` | **file mới** |
| 1.3 | Thay 13 chuỗi bị cấm bằng tiếng Việt nghiệp vụ | 7 file trong `src/components/` |
| 1.4 | Cập nhật `ui-architecture.test.ts` › nhóm user: bỏ `Header.tsx` khỏi danh sách active source; sửa kỳ vọng theo `UserManager.tsx` hiện tại | `tests/unit/ui-architecture.test.ts` |
| 1.5 | Sửa `api-security.test.ts` › fallback branch name: dùng `branchCode` có thật trong cây org, hoặc đổi kỳ vọng thành `422 BRANCH_ASSIGNMENT_INVALID` | `tests/integration/api-security.test.ts:209` |

**Nghiệm thu:** `npm run ci` xanh hoàn toàn.

---

### Đợt 2 — Một từ điển nhãn duy nhất *(2-3 ngày)*

| # | Việc | File |
|---|---|---|
| 2.1 | Mở rộng `src/content/ui-copy.ts` thành từ điển đầy đủ: `workflowStatusLabels`, `workflowActionLabels`, `workflowCommandLabels`, `slaStatusLabels`, `userRoleLabels`, `rejectedFromStageLabels` | `src/content/ui-copy.ts` |
| 2.2 | Xóa `statusLabels` (`App.tsx:19`) và `statusMeta` (`FindingDetailPage.tsx:21`); trỏ cả hai về từ điển chung. Giữ `tone` (màu) riêng, tách khỏi `label` | `src/App.tsx`, `src/components/portal/FindingDetailPage.tsx` |
| 2.3 | Hiển thị `workflowCommandLabels[event.command]` thay cho enum thô ở Lịch sử xử lý và Audit Trail | `FindingDetailPage.tsx:346`, `AuditTrailViewer.tsx` |
| 2.4 | Server: `details` trong `/admin/audit-events` dùng nhãn tiếng Việt thay cho `"PENDING → SUBMITTED_BRANCH"` | `server/src/app.ts:1240` |
| 2.5 | Hiển thị đầy đủ khối chuyển trả: **cấp trả về** (`rejectedFromStage`) + người + thời điểm + lý do | `FindingDetailPage.tsx:306` |
| 2.6 | Bổ sung `returnToStage: 'BRANCH_REMEDIATION'` vào `Finding` + gán khi reject (hoàn tất P0-09) | `shared/contracts/findings.ts`, `workflow-service.ts` |
| 2.7 | Thay 3 `alert()` + 1 `window.confirm()` bằng banner inline | `FastDataIngestion.tsx` |
| 2.8 | Thêm test: mọi `WorkflowStatus` / `WorkflowEvent.command` phải có nhãn trong từ điển (khóa exhaustive) | `tests/unit/ui-copy.test.ts` |

**Nghiệm thu:** grep toàn bộ `src/components/` không còn `statusLabels`/`statusMeta` cục bộ; không enum thô nào lọt ra JSX.

---

### Đợt 3 — Kích hoạt SLA và sửa dữ liệu sai *(3-4 ngày)*

Đây là đợt sửa **lỗi đúng-sai nghiệp vụ**, không phải cải thiện giao diện.

| # | Việc | File |
|---|---|---|
| 3.1 | Thêm `deadlineDate` (optional, `YYYY-MM-DD`) vào `WebFormFindingSchema`; parser Excel trích cột hạn xử lý nếu có | `shared/contracts/ingestion.ts`, `src/lib/excel-parser.ts` |
| 3.2 | `createFindingFromDto`: `deadlineDate = dto.deadlineDate ?? auditDate + channel.slaConfig.defaultDays`. **Xóa hardcode 15 ngày** | `server/src/app.ts:800` |
| 3.3 | Tính `slaStatus` lúc tạo bằng `slaWorker.evaluateFindingSla()` thay vì gán cứng `'ON_TRACK'` | `server/src/app.ts:798` |
| 3.4 | Nối `slaWorker` vào vòng đời API: chạy `runDailyEvaluation(findings)` khi khởi động + hẹn giờ 08:30 hằng ngày + `persistLocalState()` sau mỗi lần chạy | `server/src/app.ts`, `server/src/worker/sla-worker.ts` |
| 3.5 | Sửa `dev:worker` để worker standalone đọc state thật thay vì gọi `runDailyEvaluation([])` | `server/src/worker/sla-worker.ts:57` |
| 3.6 | Chạy lại đánh giá SLA trên `data/local-state.json` để nắn 4 finding về đúng trạng thái | `data/local-state.json` |
| 3.7 | **Hiển thị SLA**: badge `slaStatus` có màu + số ngày còn lại trên header hồ sơ và trên thẻ mã lỗi | `FindingDetailPage.tsx` |
| 3.8 | Thêm KPI **"Quá hạn"** vào dashboard (dữ liệu `dashboard.overdueCount` đã có sẵn, chỉ chưa render) | `src/App.tsx` |
| 3.9 | Test: finding hạn 3 ngày → `DUE_SOON`; hạn hôm qua → `OVERDUE`; `WAIVED_RESOLVED` → `CLOSED`; worker **không bao giờ** đổi `workflowStatus` (P0-06) | `tests/unit/sla.test.ts` |

**Nghiệm thu:** `metric.overdue_count` và `flag.overdue` trả số liệu thật; lọc `?slaStatus=OVERDUE` hoạt động.

---

### Đợt 4 — Dọn mã chết và hợp nhất type *(2-3 ngày)*

| # | Việc | File |
|---|---|---|
| 4.1 | Xóa 8 file mã chết: `LoginPortal`, `Header`, `CustomerDetailModal`, `GoogleDriveViewerModal`, `BranchDashboard`, `InternalDashboard`, `ErrorCatalogModal`, `EmailSchedulerConfig` | `src/components/` |
| 4.2 | **Xóa `src/lib/google-drive.ts`** — lớp Drive giả sinh URL `drive.google.com` không tồn tại | `src/lib/google-drive.ts` |
| 4.3 | Xóa `src/types/dynamic-channel.ts` (bản sao 1:1 của `shared/contracts/channels.ts`) | `src/types/` |
| 4.4 | Chuyển `FastDataIngestion` + `excel-parser` sang `shared/contracts`; xóa hàm adapter `legacyUser` (`App.tsx:150-160`) | `src/components/internal/`, `src/lib/`, `src/App.tsx` |
| 4.5 | Thu gọn `src/types.ts` còn đúng phần `INITIAL_ERROR_MASTER` cần dùng; xóa `ErrorStatus`, `AuditError`, `ApprovalLog`, `AttachmentFile` | `src/types.ts` |
| 4.6 | Xóa `KpiCard` nếu không còn ai dùng sau 4.1 | `src/components/common/KpiCard.tsx` |
| 4.7 | Thêm test kiến trúc: mọi file trong `src/components/` phải có ít nhất một import trỏ tới nó (chặn mã chết tái sinh) | `tests/unit/ui-architecture.test.ts` |

**Nghiệm thu:** `src/types.ts` không còn export `ErrorStatus`; chunk `index.js` giảm; `npm run ci` xanh.

---

### Đợt 5 — Đồng bộ tài liệu nghiệp vụ với code *(2 ngày)*

Đợt này **bắt buộc** — tài liệu sai đang dạy người vận hành quy trình không tồn tại.

| # | Việc | File |
|---|---|---|
| 5.1 | Viết lại toàn bộ phần "Cụm thẩm tra / Lãnh đạo Cụm duyệt / `CLUSTER_APPROVER`" thành "Kiểm soát chi nhánh / `BRANCH_CONTROLLER`" | `LUU_DO_VAN_HANH_CHI_TIET.md` (dòng 97-98, 157-159, 180), `HUONG_DAN_VAN_HANH_CHI_TIET.md` (dòng 25, 37, 79, 133-139, 184, 285), `THIET_KE_ADMIN_PORTAL.md` (dòng 42, 83, 108, 122) |
| 5.2 | **Thống nhất một hệ đánh số bước duy nhất** dùng chung cho tài liệu + `WorkflowBuilder` + nhãn UI. Đề xuất: `B0` khởi tạo · `B1` chi nhánh khắc phục & nộp · `B2` kiểm soát chi nhánh · `B3` khối nội bộ · `B-SLA` chạy nền | 4 file `.md` + `WorkflowBuilder.tsx` |
| 5.3 | Vẽ lại sơ đồ luồng theo quy trình đúng | `LUU_DO_VAN_HANH_CHI_TIET.drawio`, `luu_do_diagram.html`, 2 file `.png`, `public/*.png` |
| 5.4 | Ghi rõ trong tài liệu: lưu trữ file hiện là **local disk**, chưa phải Google Drive | cả 4 file `.md` |
| 5.5 | Thêm test: không file `.md` nào ở thư mục gốc được chứa `CLUSTER_APPROVER` hay "Lãnh đạo Cụm duyệt" | `tests/unit/ui-architecture.test.ts` |

**Nghiệm thu:** `grep -c "CLUSTER_APPROVER" *.md` = 0.

---

### Đợt 6 — Cấu hình trung thực *(1 ngày)*

| # | Việc | File |
|---|---|---|
| 6.1 | Sửa `.env.example`: `DATA_STORE_MODE=local-json` (khớp code); bổ sung `LOCAL_STATE_FILE`; ghi chú rõ `memory` = **không lưu bền** | `.env.example` |
| 6.2 | `/api/v1/ready` gọi `localStateRepository.getStatus()` thật thay vì hardcode `{ mode: 'local-json', durable: true }` | `server/src/app.ts:1042` |
| 6.3 | Adapter đọc `EVIDENCE_STORAGE_MODE` làm nguồn quyết định chính thay vì suy ra từ sự có mặt của `GOOGLE_*` | `server/src/adapters/google-drive.ts:50` |
| 6.4 | Test: đặt `DATA_STORE_MODE=memory` → `/ready` phải trả `durable: false` | `tests/integration/` |

---

### Đợt 7 — Đổi tên lớp lưu trữ, chuẩn bị cho Drive thật *(3-4 ngày)*

Làm **trước** khi viết adapter Drive, để không phải migrate hai lần.

| # | Việc | File |
|---|---|---|
| 7.1 | Đổi tên trong contract: `driveFileId` → `storageObjectId`, `driveUrl` → `contentUrl`; thêm `storageProvider: 'LOCAL' \| 'GOOGLE_DRIVE'` | `shared/contracts/evidence.ts` |
| 7.2 | Migration `0031_rename_evidence_storage_columns.sql`: `drive_file_id` → `storage_object_id`, `drive_url` → `content_url`, thêm `storage_provider` | `db/migrations/` |
| 7.3 | Đổi tên interface `GoogleDriveAdapter` → `EvidenceStorageAdapter`; tách thành `LocalDiskStorage` + `GoogleDriveStorage` cùng implement | `server/src/adapters/` |
| 7.4 | Đổi route `/api/v1/evidence/:driveFileId/content` → `/api/v1/evidence/:objectId/content` | `server/src/app.ts:1712` |
| 7.5 | Đổi tên thư mục `data/drive_storage/` → `data/evidence_storage/`; cập nhật `LOCAL_EVIDENCE_DIR` | `.env.example`, `.gitignore` |
| 7.6 | Migrate `data/local-state.json` sang tên trường mới | script một lần |

---

### Đợt 8 — Google Drive API v3 thật *(5-7 ngày)*

Chỉ bắt đầu sau khi Đợt 7 xong.

| # | Việc |
|---|---|
| 8.1 | Thêm `googleapis` + `google-auth-library`; xác thực bằng Service Account với domain-wide delegation |
| 8.2 | Cài `GoogleDriveStorage` implement `EvidenceStorageAdapter`: `files.create` (resumable upload), `files.get?alt=media` (stream), tạo cây folder theo `generateFolderPath()` **giữ nguyên quy ước hiện tại** |
| 8.3 | Cache id folder (`Map<folderPath, driveFolderId>`) để tránh gọi lại `files.list` mỗi lần upload |
| 8.4 | Không bao giờ trả link Drive công khai về client — luôn stream qua `/api/v1/evidence/:objectId/content` để giữ kiểm soát RBAC (P0-10) |
| 8.5 | Thu hồi logic (P0-11): đổi `status` sang `REVOKED` + ghi lý do; **không** `files.delete` |
| 8.6 | Retry có backoff cho lỗi 429/5xx của Drive; ghi `outbox_events` cho thao tác lưu trữ thất bại |
| 8.7 | Bỏ dòng vi phạm cứng `'…chưa có Google Drive API v3 adapter'` khỏi `assertSafeRuntimeConfiguration` khi adapter đã sẵn sàng |
| 8.8 | Test tích hợp với Drive sandbox: upload → đọc lại → checksum khớp |

---

### Đợt 9 — Các khoản nợ P0 còn lại *(theo `IMPLEMENTATION_PLAN.md`)*

Ngoài phạm vi tài liệu này nhưng cần theo dõi: staging ingestion thật (P0-07), version binding thật (P0-14), nối PostgreSQL + RLS (P0-12), OIDC (P0-15), transactional outbox (P0-13), E2E AC-01…AC-14.

---

## 8. Thứ tự ưu tiên đề xuất

| Ưu tiên | Đợt | Lý do |
|---|---|---|
| **P1 — làm ngay** | Đợt 1, Đợt 3, Đợt 6 | CI đang đỏ; SLA **đang cho ra số liệu sai**; `.env.example` có thể gây mất dữ liệu |
| **P2 — làm sớm** | Đợt 2, Đợt 5 | Nhãn không nhất quán và tài liệu sai gây lỗi vận hành thật |
| **P3 — dọn nợ** | Đợt 4, Đợt 7 | Giảm rủi ro bảo trì, dọn đường cho Drive thật |
| **P4 — mở rộng** | Đợt 8, Đợt 9 | Cần hạ tầng và credential thật |

---

## Phụ lục A — Lệnh kiểm chứng nhanh

```bash
npx vitest run 2>&1 | grep -E "×|Test Files|Tests "
```

```bash
grep -rn "CLUSTER_APPROVER" *.md
```

```bash
grep -n "slaWorker" server/src/app.ts
```

```bash
grep -c "googleapis" package.json
```

## Phụ lục B — Bảng đối chiếu tuyên bố ↔ thực tế

| `IMPLEMENTATION_PLAN.md` tuyên bố | Thực tế đo được |
|---|---|
| "readiness trung thực (`local-json`/`mock-header`/`local`)" | `/ready` **hardcode** `durable: true`, không đọc `getStatus()` |
| "SLA được ghi rõ là bản xem trước chưa kích hoạt" | Đúng về Admin UI. Nhưng `slaStatus` vẫn được **ghi vào dữ liệu và dùng cho báo cáo** với giá trị sai — không chỉ là "xem trước" |
| "CI local chạy typecheck + unit + integration + contract + build" | Có script, nhưng **đang đỏ 5 test** |
| "Đã thay màn hình workflow/permission giả bằng ma trận chỉ đọc" | Đúng — `WorkflowBuilder` và `ButtonPermissionMatrix` phản ánh đúng API |
| "chưa có Google Drive API v3 adapter" | Đúng — và cổng production chặn đúng |

---

## 9. Cập nhật 25/08/2026 — Đăng nhập, chuyên đề, ưu tiên giám sát và kho Drive

### Đã triển khai trên local

- Đăng nhập bằng mật khẩu băm `scrypt`, phiên opaque lưu digest, cookie `HttpOnly + SameSite=Strict`, đăng xuất hủy phiên. Trình duyệt không còn được chọn/giả danh người dùng; header test chỉ tồn tại khi `NODE_ENV=test`.
- Năm tài khoản mẫu cho năm nhóm quyền; danh sách chỉ hiện ở trang đăng nhập trong bản development.
- Quản trị chuyên đề: mã/tên/quyết định, trưởng đoàn, thành viên, chi nhánh, thời gian, loại báo cáo, trạng thái và version.
- Hồ sơ được gắn `campaignId`; danh sách chính và hệ thống báo cáo có thể lọc/phân nhóm/xuất theo chuyên đề và quyết định chuyên đề.
- CMS form có block dùng lại **Thông tin chuyên đề**; form nhập kiểm tra chuyên đề có chứa đúng chi nhánh và loại báo cáo trước khi tạo hồ sơ.
- Theo dõi có cờ **Ưu tiên giám sát** độc lập với “Tiếp nhận công việc”; mục ưu tiên được sắp riêng và có nút ngôi sao tại hồ sơ.
- Cổng Apps Script ký HMAC SHA-256, giới hạn thời gian, nonce chống phát lại, whitelist lệnh và khóa tạo folder. Nút **Tạo kho dữ liệu** chỉ chuyển `READY` sau khi tạo folder + đồng bộ ACL thành công.
- ACL Drive không cấp `anyone`/`domain`, thu hồi email ngoài danh sách và phân quyền reader/writer theo phân công. Cây chuẩn: `CHUYEN_DE/KHACH_HANG/CIF_TEN/LOI_MA_LOI`.
- Migration `0070_auth_campaign_drive_priority.sql` bổ sung credentials/session, chuyên đề/phân công, liên kết finding và ưu tiên theo dõi.

### Cấu hình vận hành Drive

- Mã triển khai: `integrations/google-apps-script/`.
- Server cần `GOOGLE_APPS_SCRIPT_URL` và `GOOGLE_APPS_SCRIPT_SECRET`.
- Apps Script cần `AUDIT_BGS_ROOT_FOLDER_ID`, `AUDIT_BGS_HMAC_SECRET` và Advanced Drive service.
- Chưa có credential thật trong workspace nên chưa thể nghiệm thu trên Google Drive thật. Hệ thống trả `DRIVE_NOT_CONFIGURED`, không giả lập thành công.
- Binary minh chứng trên bản local vẫn lưu ở `LOCAL_EVIDENCE_DIR`; việc chuyển upload/stream binary hoàn toàn sang Drive vẫn thuộc Đợt 7–8 và production guard tiếp tục chặn đúng.

### Bằng chứng kiểm thử

- `npm run ci`: **118 unit + 53 integration + 3 contract**; 11 migration dry-run hợp lệ; TypeScript và Vite build đạt.
- Gateway Apps Script: canonical JSON, HMAC, timeout/fail-closed có unit test.
- Auth, scope chuyên đề, block CMS, ưu tiên giám sát và Drive-not-configured có unit/integration regression test.

---

## 10. Cập nhật 25/08/2026 — Kiến trúc triển khai và đồng bộ vận hành

### Quyết định triển khai

- Nền tảng mục tiêu: Google Cloud `asia-southeast1` (Singapore).
- Web/API: Cloud Run; database: Cloud SQL PostgreSQL 16; SLA: Cloud Scheduler + Cloud Run Job; secret: Secret Manager; identity: Google Workspace OIDC; chứng từ: Google Drive riêng tư.
- UAT có thể dùng Cloud SQL single-zone; production phải dùng HA/PITR theo chính sách. Không dùng `local-state.json`, SQLite, MongoDB hoặc filesystem Cloud Run làm dữ liệu production.
- ADR: `docs/architecture/ADR-001-gcp-cloud-run-cloud-sql.md`.
- Runbook: `HUONG_DAN_DEPLOY.md`.

### Trạng thái readiness trung thực

Source hiện **chưa deploy production được** và production guard đang chặn đúng vì:

1. API runtime vẫn dùng `LocalStateRepository`; adapter PostgreSQL chưa thay repository nghiệp vụ.
2. Đăng nhập hiện là credential/session local; OIDC mới là yêu cầu cấu hình, chưa có flow thật.
3. Apps Script đã tạo folder/ACL chuyên đề nhưng binary minh chứng vẫn lưu local; Google Drive API v3 upload/stream chưa có.
4. Worker SLA standalone vẫn đọc `data/local-state.json`; outbox/email production chưa có.
5. Chưa có Dockerfile production, migration job và UAT Cloud SQL/Drive/OIDC thật.

Thứ tự mở cổng deploy: PostgreSQL repository + RLS → OIDC → Drive binary → outbox/email + SLA job → container/Cloud Run → UAT backup/restore/security/E2E → production rollout.

### Tài liệu vận hành đã đồng bộ

- `LUU_DO_VAN_HANH_CHI_TIET.md` và `HUONG_DAN_VAN_HANH_CHI_TIET.md` đã đổi cấp trung gian từ Cụm sang `BRANCH_CONTROLLER`/Kiểm soát chi nhánh.
- Bổ sung luồng `ONE_TIER` và `TWO_TIER`, chuyên đề, ưu tiên giám sát, form không đính kèm, phiên bản cấu hình và trạng thái lưu trữ local/Drive mục tiêu.
- `luu_do_diagram.html`, `LUU_DO_VAN_HANH_CHI_TIET.drawio`, `THIET_KE_ADMIN_PORTAL.md` và `THIET_KE_DYNAMIC_CHANNEL_VA_WORKFLOW_ENGINE.md` đã cập nhật thuật ngữ/nút thao tác theo code hiện tại.
