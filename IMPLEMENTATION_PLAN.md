# IMPLEMENTATION PLAN — AUDIT BGS P0

> Trạng thái: **Đang triển khai local — chưa production-ready**  
> Phạm vi: biến prototype React/Vite hiện tại thành hệ thống vận hành có backend, PostgreSQL, RBAC theo phạm vi dữ liệu, luồng phê duyệt hai cấp, Google Drive thật, SLA, thông báo và audit trail.  
> Tài liệu chuẩn nghiệp vụ: `LUU_DO_VAN_HANH_CHI_TIET.md`, `HUONG_DAN_VAN_HANH_CHI_TIET.md`, `THIET_KE_ADMIN_PORTAL.md`, `THIET_KE_DYNAMIC_CHANNEL_VA_WORKFLOW_ENGINE.md`.

## 0. Cập nhật kiểm chứng local ngày 2026-08-24

Phần vertical slice local hiện đã có API Fastify, contract dùng chung, migration SQL bước đầu, workflow hai cấp, SLA projection, evidence local và frontend gọi API. Sau đợt rà soát trực tiếp:

- Đã khóa fail-open auth, Admin RBAC và BOLA/data-scope cho list/detail/workflow/evidence; lỗi API dùng Problem Details và đúng HTTP status.
- Đã thêm validation command, optimistic locking, `Idempotency-Key` bền vững qua restart, phân trang và readiness trung thực (`local-json`/`mock-header`/`local`).
- Đã nối thao tác tạo đơn vị, user và kênh trong Admin Portal vào API; không còn chỉ đổi React state rồi mất khi reload trong cùng phiên server.
- Đã dùng kho JSON local ghi nguyên tử và phục hồi tệp tạm; trạng thái nghiệp vụ, import batch, mẫu báo cáo, workflow event và idempotency record không còn mất khi API restart.
- Đã bắt buộc có evidence `AVAILABLE` trước khi gửi/duyệt/đóng lỗi, chống trùng cả trong cùng batch import, và chiếu `evidenceCount` từ metadata thật.
- Đã khóa `ADMIN` khỏi các quyết định workflow nghiệp vụ; chỉ `BRANCH_INPUT`, `BRANCH_CONTROLLER`, `INTERNAL_APPROVER`/`SUPERVISOR` đúng bước mới được thao tác.
- Đã thay màn hình workflow/permission giả bằng ma trận chỉ đọc phản ánh API; Audit Viewer lấy workflow event thật qua API quản trị. SLA được ghi rõ là bản xem trước chưa kích hoạt.
- Đã bổ sung migration/seed runner có dry-run, checksum drift guard; CI local chạy typecheck + unit + integration + contract + build.
- Đã tách bundle ingestion/vendor; build không còn chunk chính vượt 500 kB.

Các giới hạn còn mở và **không được xem là đã hoàn thành plan**:

- Route/service hiện dùng kho JSON local bền vững, chưa dùng PostgreSQL; migration chưa được nối vào route/service và chưa rehearsal trên database thật.
- Auth hiện là header mock cho local; OIDC chưa triển khai. Runtime production bị chặn chủ động.
- Google Drive API v3, transactional outbox/audit, staging ingestion, config version publish, worker schedule/email, RLS thực thi và E2E AC-01…AC-14 chưa hoàn tất.
- SLA/email trong Admin mới là bản chính sách xem trước; chưa có API cấu hình, scheduler hay email provider. Audit local có nguồn thật nhưng chưa phải append-only/immutable production.

## 1. Mục tiêu và hiện trạng

### Mục tiêu P0

Đưa Audit BGS từ bản mô phỏng giao diện thành một vertical slice có thể nghiệm thu end-to-end:

`Khối Nội Bộ nhập dữ liệu → staging/kiểm tra → tạo finding PENDING → Chi nhánh khắc phục và nộp → Kiểm soát chi nhánh duyệt → Khối Nội Bộ duyệt bỏ lỗi → đóng finding`, trong khi SLA, Drive, thông báo và audit trail chạy song song nhưng không làm sai trạng thái nghiệp vụ. Cụm chỉ phân nhóm địa bàn, không có quyền phê duyệt hồ sơ.

### Baseline gốc và phần còn phải thay thế

- `src/App.tsx` đã gọi API cho dữ liệu nghiệp vụ; `mock-data.ts` vẫn còn phục vụ đăng nhập/header local và danh mục phụ trợ nên chưa được phép đi production.
- `src/lib/excel-parser.ts` vẫn parse/chuẩn hóa trước ở trình duyệt rồi gửi batch lên API; chưa có staging table/commit transaction PostgreSQL.
- `src/lib/google-drive.ts` chỉ sinh metadata và URL giả, chưa tải file lên Google Drive.
- Workflow đã chạy ở server với role/scope, optimistic locking, evidence guard và idempotency local; chưa có transaction PostgreSQL/outbox.
- Fastify API, migration runner và test runner đã có; database thật và OIDC vẫn chưa được kết nối.
- Build đã code-split; tiếp tục theo dõi performance trên dữ liệu lớn và thiết bị thật trước release.

## 2. Các quyết định P0 bị khóa

Những quyết định dưới đây là bất biến của P0. Thay đổi bất kỳ mục nào phải có ADR mới, cập nhật migration/API/test liên quan và được duyệt trước khi coding tiếp.

| ID | Quyết định khóa | Hệ quả bắt buộc khi triển khai |
|---|---|---|
| **P0-01** | Đơn vị chạy workflow là **finding/sai sót**, không phải khách hàng hoặc batch import. | Một khách hàng có thể có nhiều finding, mỗi finding có status, SLA, evidence và lịch sử riêng. |
| **P0-02** | `workflowStatus` chỉ có `PENDING`, `SUBMITTED_BRANCH`, `SUBMITTED_INTERNAL`, `REJECTED`, `WAIVED_RESOLVED`. | Không đưa `OVERDUE` hoặc trạng thái email/Drive vào workflow status. |
| **P0-03** | Kênh Audit BGS dùng luồng **hai cấp bắt buộc**: Chi nhánh → Kiểm soát chi nhánh → Khối Nội Bộ. | Cụm chỉ là lớp địa bàn; cấu hình P0 không được gán quyền duyệt cho Cụm. |
| **P0-04** | Kiểm soát chi nhánh và Khối Nội Bộ khi từ chối đều trả finding về Chi nhánh. | Khi nộp lại sau từ chối Nội Bộ, finding phải quay lại `SUBMITTED_BRANCH` và được Kiểm soát chi nhánh duyệt lại. |
| **P0-05** | `WAIVED_RESOLVED` là trạng thái cuối, không mở lại và không xóa cứng trong P0. | Yêu cầu mở lại phải là quy trình P1 có thẩm quyền riêng; mọi API transition từ trạng thái cuối trả `409`. |
| **P0-06** | `slaStatus` độc lập với `workflowStatus`, gồm `ON_TRACK`, `DUE_SOON`, `OVERDUE`, `CLOSED`. | Worker SLA chỉ đổi `slaStatus`; khi quá hạn finding vẫn giữ nguyên workflow stage. |
| **P0-07** | Nguồn vào P0 là `EXCEL_IMPORT`, `WEB_FORM`, `API`; chỉ vai trò Khối Nội Bộ được khởi tạo. | “Kênh động” là cấu hình nghiệp vụ, không phải một nguồn ingest. Mọi dữ liệu phải qua staging/validation trước commit. |
| **P0-08** | Mọi lệnh thay đổi trạng thái chạy ở server trong transaction, yêu cầu `Idempotency-Key` và `expectedVersion`. | Client không được tự sửa status; bấm lặp không tạo hai sự kiện, cập nhật đồng thời sai version trả `409 VERSION_CONFLICT`. |
| **P0-09** | Lý do từ chối là bắt buộc; current rejection projection và immutable event đều phải lưu nguồn trả về. | Khi `REJECTED`, phải có `rejectedFromStage`, `returnToStage=BRANCH_REMEDIATION`, người/lúc/lý do; khi nộp lại có thể clear projection nhưng event không được sửa/xóa. |
| **P0-10** | Evidence lưu nội dung trên Google Drive, metadata tin cậy lưu trong PostgreSQL. | Không lưu service credential hoặc public Drive URL ở frontend; file phải có checksum, version, MIME, size, uploader và retention state. |
| **P0-11** | Không hard-delete evidence/audit event. “Xóa” là thu hồi logic có lý do và audit. | File đã thu hồi không hiện trong danh sách nghiệp vụ nhưng vẫn giữ theo retention; chỉ vai trò được cấp quyền mới được thu hồi. |
| **P0-12** | RBAC và data scope được cưỡng chế ở API và PostgreSQL RLS. | Ẩn nút trên UI không được coi là bảo mật; truy cập chéo Chi nhánh/Cụm phải bị chặn ở server/DB. |
| **P0-13** | Mọi mutation nghiệp vụ ghi `workflow_events`/`audit_events` và `outbox_events` trong cùng transaction. | Không gửi email trực tiếp trong request transaction; worker đọc outbox, retry an toàn và chống gửi trùng. |
| **P0-14** | Workflow/schema/SLA config có version; bản `PUBLISHED` là bất biến. | Finding giữ `channel_version_id`, `workflow_version_id`, `sla_policy_version_id` tại lúc tạo; publish phiên bản mới không làm đổi hồ sơ đang chạy. |
| **P0-15** | Production không dùng mock user, mock Drive hoặc `localStorage` làm nguồn dữ liệu. | Mock adapter chỉ được phép trong test/local với cờ môi trường rõ ràng; production fail-fast nếu thiếu cấu hình thật. |

## 3. Ma trận chuyển trạng thái chuẩn

| Command | Trạng thái trước | Trạng thái sau | Vai trò | Guard bắt buộc |
|---|---|---|---|---|
| `submit_branch` | `PENDING` hoặc `REJECTED` | `SUBMITTED_BRANCH` | `BRANCH_INPUT` | Đúng scope; có giải trình; có ít nhất một evidence `AVAILABLE`; nếu từ `REJECTED` phải đánh dấu đã xử lý yêu cầu trả về. |
| `branch_control_reject` | `SUBMITTED_BRANCH` | `REJECTED` | `BRANCH_CONTROLLER` | Đúng Chi nhánh; lý do không rỗng; lưu `rejectedFromStage=BRANCH_CONTROL_REVIEW`. |
| `branch_control_approve` | `SUBMITTED_BRANCH` | `SUBMITTED_INTERNAL` | `BRANCH_CONTROLLER` | Đúng Chi nhánh; có ý kiến kiểm soát; evidence vẫn khả dụng. |
| `internal_reject` | `SUBMITTED_INTERNAL` | `REJECTED` | `INTERNAL_APPROVER` hoặc `SUPERVISOR` | Lý do và căn cứ bắt buộc; lưu `rejectedFromStage=INTERNAL_REVIEW`. |
| `internal_waive` | `SUBMITTED_INTERNAL` | `WAIVED_RESOLVED` | `INTERNAL_APPROVER` hoặc `SUPERVISOR` | Căn cứ/số văn bản bắt buộc; evidence khả dụng; đóng SLA. |

Mọi cặp trạng thái khác phải trả `409 INVALID_TRANSITION`. `ADMIN` quản trị cấu hình nhưng không mặc nhiên có quyền phê duyệt nghiệp vụ; muốn duyệt phải có thêm role nghiệp vụ tương ứng.

## 4. Kiến trúc đích và quy ước kỹ thuật

### Stack P0

- Giữ frontend: React 18 + Vite + TypeScript.
- Backend mới: Node.js 22 + TypeScript + Fastify, REST `/api/v1`, OpenAPI 3.1 và validation bằng Zod.
- Database: PostgreSQL 16; migration SQL có thứ tự trong `db/migrations/`.
- Worker: một process TypeScript riêng dùng PostgreSQL làm hàng đợi P0 (`FOR UPDATE SKIP LOCKED`), chưa thêm Redis.
- Auth: corporate OIDC/SSO; API xác minh token và ánh xạ subject vào `app_users`. `AUTH_MODE=mock` chỉ được phép ở local/test.
- File: Google Drive API bằng service account/workload identity phía server.
- Test: Vitest cho unit/integration, PostgreSQL thật qua Testcontainers, Playwright cho E2E.

### Cấu trúc mã dự kiến

```text
E:\AuditBGS
├── src/                         # React frontend hiện tại
├── server/
│   └── src/
│       ├── modules/{auth,org,channels,ingestion,findings,evidence,workflow,sla,notifications,audit}/
│       ├── adapters/{postgres,google-drive,email,oidc}/
│       ├── worker/
│       └── app.ts
├── shared/contracts/            # DTO/Zod schema dùng chung, không chứa DB model
├── db/migrations/
├── db/seeds/
└── tests/{unit,integration,contract,e2e,fixtures}/
```

### Quy ước migration và API

- PK dùng UUID; thời gian dùng `timestamptz`; tiền dùng `numeric(20,2)`, không dùng float.
- Core field (`cif`, branch, error code, status, deadline) là cột chuẩn; `jsonb` chỉ chứa field động đã được schema version xác nhận.
- Migration phải chạy được từ database rỗng và nâng cấp từ bản N-1 trong database tạm; migration đã phát hành không được sửa lại.
- Tất cả list API có cursor pagination, filter scope phía server và giới hạn page size.
- Lỗi API theo `application/problem+json`; chuẩn mã: `401`, `403/404` theo chính sách che giấu scope, `409` cho transition/version conflict, `422` cho dữ liệu không hợp lệ.
- Mutation nghiệp vụ bắt buộc header `Idempotency-Key`; body có `expectedVersion`.
- `requestId`, `actorId`, `correlationId` phải đi xuyên request → audit event → outbox → notification log.

### Scripts phải bổ sung

```text
npm run dev:web
npm run dev:api
npm run dev:worker
npm run db:migrate
npm run db:rollback
npm run db:seed
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:security
npm run test:migrations
npm run ci
```

`npm run ci` phải chạy ít nhất: typecheck, lint, unit, integration, contract, build và migration verification.

## 5. Kế hoạch triển khai theo giai đoạn

## Giai đoạn 0 — Nền tảng backend, identity, tổ chức và data scope

**Mục tiêu:** tạo backend chạy được, auth thật, mô hình Cụm/Chi nhánh/Phòng ban và hàng rào truy cập trước khi đưa dữ liệu nghiệp vụ vào.

### Migration đầu ra

- `0001_platform_baseline.sql`: extension cần thiết, chuẩn UUID/timestamp, helper RLS và bảng `schema_release_log`.
- `0002_org_identity_rbac.sql`: `org_units`, `app_users`, `roles`, `permissions`, `role_permissions`, `user_role_assignments`, `user_data_scopes`.
- `0003_audit_and_idempotency.sql`: `audit_events` append-only, `idempotency_keys`; trigger chặn `UPDATE/DELETE` audit event.
- `0004_org_rls.sql`: RLS policy cho scope `ALL`, `CLUSTER`, `BRANCH`, `DEPARTMENT`; index theo `org_unit_id`, `parent_id`, `external_code`.

### API đầu ra

- `GET /api/v1/health` và `GET /api/v1/ready`.
- `GET /api/v1/me` trả user, roles, permissions và data scopes đã chuẩn hóa.
- `GET/POST/PATCH /api/v1/admin/org-units`.
- `GET/POST/PATCH /api/v1/admin/users`; `PUT /api/v1/admin/users/{id}/roles`; `PUT /api/v1/admin/users/{id}/scopes`.

### Test bắt buộc

- Migration up/down trên PostgreSQL rỗng; unique org code và parent-child constraint.
- Integration auth: token hợp lệ, token hết hạn, subject chưa provision, user bị khóa.
- Security matrix cho sáu role hiện có; test truy cập chéo Chi nhánh/Cụm ở cả API và SQL/RLS.
- Test audit event được tạo khi admin đổi role/scope; test DB từ chối sửa/xóa event.

### Nghiệm thu giai đoạn

- `BRANCH_INPUT` của CN 635 không đọc được dữ liệu seed của CN 428; API trả kết quả không làm lộ sự tồn tại bản ghi ngoài scope.
- `BRANCH_CONTROLLER` đọc và duyệt hồ sơ trong đúng Chi nhánh được phân công; không đọc Chi nhánh khác. Cụm chỉ dùng để lọc/thống kê địa bàn.
- `INTERNAL_OFFICER`, `INTERNAL_APPROVER`, `SUPERVISOR` có scope toàn hàng theo assignment; `ADMIN` chỉ có quyền quản trị đã cấp.
- Production khởi động thất bại nếu `AUTH_MODE=mock` hoặc thiếu OIDC secrets.

## Giai đoạn 1 — Kênh báo cáo, schema động và cấu hình workflow/SLA có version

**Mục tiêu:** thay interface cấu hình tĩnh bằng cấu hình database có draft/publish và khóa luồng Audit BGS hai cấp.

### Migration đầu ra

- `0010_report_channels.sql`: `report_channels`, `channel_versions`, trạng thái `DRAFT/PUBLISHED/RETIRED`.
- `0011_dynamic_schema.sql`: `channel_fields`, `field_aliases`, select options, core-field mapping và display order.
- `0012_workflow_versions.sql`: `workflow_versions`, `workflow_stages`, `workflow_transitions`; constraint/validator cho transition P0.
- `0013_sla_policy_versions.sql`: `sla_policy_versions`, reminder thresholds, escalation rules và timezone.
- `0014_seed_audit_bgs_channel.sql`: seed kênh Audit BGS, schema lõi, workflow hai cấp và SLA mặc định.

### API đầu ra

- `GET/POST/PATCH /api/v1/admin/channels`.
- `POST /api/v1/admin/channels/{id}/versions`; `GET/PATCH .../schema`.
- `GET/PATCH .../workflow`; `GET/PATCH .../sla-policy`.
- `POST /api/v1/admin/channel-versions/{id}/validate`.
- `POST /api/v1/admin/channel-versions/{id}/publish`.
- `GET /api/v1/channels/active` cho màn hình nhập liệu.

### Test bắt buộc

- Unit validator: thiếu core field, alias trùng, stage không nối, vòng lặp không hợp lệ, thiếu reject reason guard.
- Integration: publish draft hợp lệ; cấm sửa bản published; cấm publish Audit BGS nếu thiếu bước Kiểm soát chi nhánh hoặc bỏ đường quay về Chi nhánh.
- Concurrency: hai admin publish cùng lúc chỉ có một active version.
- Contract test OpenAPI cho DTO channel/schema/workflow/SLA.

### Nghiệm thu giai đoạn

- Admin tạo draft, validate và publish được một version mới mà không sửa version đang được finding sử dụng.
- API từ chối cấu hình Audit BGS một cấp/ba cấp/custom với `422 P0_WORKFLOW_INVARIANT`.
- Mỗi version published chứa đủ schema, workflow và SLA version; không có tham chiếu “latest” động trong finding.

## Giai đoạn 2 — Ingestion, staging, kiểm tra và commit finding

**Mục tiêu:** đưa Excel/Web Form/API vào một pipeline server-side có preview, lỗi theo dòng, chống trùng và commit nguyên tử.

### Migration đầu ra

- `0020_audit_engagements_and_subjects.sql`: `audit_engagements`, `audit_subjects` và liên kết đơn vị kiểm tra.
- `0021_import_batches_and_staging.sql`: `import_batches`, `staging_rows`, `staging_validation_errors`, source checksum và trạng thái batch.
- `0022_findings.sql`: `findings`, core columns, `dynamic_payload`, `workflow_status`, `sla_status`, `version`, các config version FK.
- `0023_ingestion_dedup.sql`: unique fingerprint theo channel/version/source/engagement/branch/CIF/error code; index dashboard và queue.

### API đầu ra

- `POST /api/v1/import-batches` nhận Excel/ZIP và tạo batch.
- `GET /api/v1/import-batches/{id}`; `GET .../{id}/rows`; `GET .../{id}/errors`.
- `PATCH /api/v1/import-batches/{id}/rows/{rowId}` sửa dữ liệu staging có kiểm soát.
- `POST /api/v1/import-batches/{id}/validate` và `POST .../{id}/commit`.
- `POST /api/v1/findings` cho Web Form; `POST /api/v1/integrations/findings:bulkUpsert` cho nguồn API.
- `GET /api/v1/findings` và `GET /api/v1/findings/{id}` có filter/pagination/data scope.

### Test bắt buộc

- Parser fixture cho file hợp lệ, header alias, Unicode tiếng Việt, số tiền, ngày Excel, ZIP hỏng và file vượt hạn mức.
- Không được dùng fallback giả như CIF/Chi nhánh/mã lỗi ngẫu nhiên; thiếu core field phải thành validation error.
- Commit batch nguyên tử: một lỗi DB không tạo nửa batch; retry cùng `Idempotency-Key` trả cùng kết quả.
- Dedupe test: cùng file/checksum không tạo finding trùng; batch khác nhưng cùng business fingerprint báo conflict có thể xử lý.
- RLS test: Chi nhánh chỉ nhìn thấy finding được commit vào scope của mình.

### Nghiệm thu giai đoạn

- Người dùng Nội Bộ tải fixture chuẩn, xem preview/tổng lỗi, sửa một row, validate và commit đúng số finding `PENDING`.
- Batch có row lỗi không được commit cho đến khi lỗi blocking bằng 0.
- Mỗi finding pin đúng channel/schema/workflow/SLA version và có audit event `FINDING_CREATED`.
- Không có dữ liệu giả được tự điền để biến row không hợp lệ thành “thành công”.

## Giai đoạn 3 — Evidence và Google Drive thật

**Mục tiêu:** tải, xem, version và thu hồi evidence an toàn; metadata DB luôn phản ánh đúng trạng thái Drive.

### Migration đầu ra

- `0030_evidence_objects.sql`: `evidence_objects` với trạng thái `PENDING_UPLOAD/AVAILABLE/FAILED/REVOKED`, Drive file/folder ID, MIME, size và SHA-256.
- `0031_evidence_versions.sql`: `evidence_versions`, version number, uploader, notes, source request và uniqueness.
- `0032_evidence_retention.sql`: retention policy, revoked metadata, trigger cấm hard-delete và index theo finding/status.

### API đầu ra

- `POST /api/v1/findings/{id}/evidence` dạng multipart, backend stream tối đa 25 MB lên Drive.
- `GET /api/v1/findings/{id}/evidence`.
- `GET /api/v1/evidence/{id}/content` stream/proxy có authorization; không trả public Drive URL.
- `POST /api/v1/evidence/{id}/versions` tải bản thay thế.
- `POST /api/v1/evidence/{id}/revoke` yêu cầu reason và permission; không dùng hard delete.

### Test bắt buộc

- MIME/extension allowlist: PDF, DOCX, XLSX, JPG, PNG; reject executable, double extension, path traversal và file >25 MB.
- Unit folder-path builder: channel/year/cluster/branch/CIF-error code; sanitize Unicode/ký tự cấm ổn định.
- Integration với fake adapter: Drive timeout, upload thất bại, DB commit thất bại và compensating delete.
- Contract test với Google Drive sandbox: upload → read metadata/content → version → revoke.
- Security test: người ngoài scope không xem nội dung; credential không xuất hiện trong bundle/log/API response.

### Nghiệm thu giai đoạn

- `BRANCH_INPUT` đúng scope tải được một PDF thật; DB ghi đúng checksum/size/uploader/folder ID và Viewer đọc được qua API.
- Drive lỗi không để evidence `AVAILABLE` giả; DB lỗi sau upload kích hoạt compensation/reconciliation job.
- Kiểm soát chi nhánh/Nội Bộ xem được evidence theo scope; thao tác revoke tạo audit event và vẫn bảo toàn retention.

## Giai đoạn 4 — Workflow command service và hai cấp phê duyệt

**Mục tiêu:** chuyển toàn bộ mutation trạng thái khỏi React sang command service transactional theo ma trận P0.

### Migration đầu ra

- `0040_workflow_instances.sql`: `workflow_instances`, current stage, expected version và config version pin.
- `0041_workflow_events.sql`: append-only `workflow_events`, from/to status, command, actor, reason, rejection metadata và snapshot evidence.
- `0042_decisions_and_outbox.sql`: `approval_decisions`, `outbox_events`; unique idempotency và trigger chặn sửa/xóa event.
- `0043_workflow_guards.sql`: CHECK cho status/SLA, rejection fields và terminal-state constraints; index queue theo status/scope/deadline.

### API đầu ra

- `POST /api/v1/findings/{id}/actions/submit-branch`.
- `POST /api/v1/findings/{id}/actions/cluster-approve`.
- `POST /api/v1/findings/{id}/actions/cluster-reject`.
- `POST /api/v1/findings/{id}/actions/internal-approve`.
- `POST /api/v1/findings/{id}/actions/internal-reject`.
- `GET /api/v1/findings/{id}/timeline`.
- `GET /api/v1/work-queues/{branch|cluster|internal}`.

### Test bắt buộc

- Table-driven unit test toàn bộ transition hợp lệ và mọi transition bị cấm.
- Guard test: evidence/giải trình/ý kiến/căn cứ/reason bắt buộc đúng command.
- RBAC/BOLA test cho mọi action và scope.
- Idempotency test double-click; concurrency test hai approver cùng dùng một `expectedVersion`.
- Transaction test: finding, workflow event, audit event và outbox cùng commit hoặc cùng rollback.
- E2E rejection loop: Kiểm soát chi nhánh chuyển trả → Chi nhánh sửa/nộp lại → Kiểm soát chi nhánh đồng ý → Nội Bộ chuyển trả → Chi nhánh sửa/nộp lại → **Kiểm soát chi nhánh đồng ý lại** → Nội Bộ đóng lỗi.

### Nghiệm thu giai đoạn

- Scenario E2E trên kết thúc ở `WAIVED_RESOLVED`, timeline có đúng thứ tự, actor, reason và không thiếu vòng Kiểm soát chi nhánh thứ hai.
- Action trái vai trò/trái status trả mã lỗi chuẩn; UI refresh vẫn phản ánh state server, không dựa vào local state.
- Gửi cùng `Idempotency-Key` không tạo thêm event/outbox; sai `expectedVersion` trả `409 VERSION_CONFLICT`.
- `WAIVED_RESOLVED` từ chối mọi mutation workflow tiếp theo.

## Giai đoạn 5 — SLA, gia hạn, thông báo và escalation worker

**Mục tiêu:** chạy SLA 08:30 theo `Asia/Ho_Chi_Minh`, cập nhật SLA projection độc lập và gửi email qua outbox có retry.

### Migration đầu ra

- `0050_sla_instances.sql`: start/due/closed time, current `sla_status`, policy version và last evaluated time.
- `0051_sla_extension_requests.sql`: request, old/new due date, reason, approver, decision và audit linkage.
- `0052_notification_outbox.sql`: notification deliveries, recipient snapshot, template version, attempts, next retry, provider message ID.
- `0053_worker_runs.sql`: job lease, run history, checkpoint và unique daily job key.

### API đầu ra

- `GET /api/v1/findings/{id}/sla`.
- `POST /api/v1/findings/{id}/sla-extension-requests`.
- `POST /api/v1/sla-extension-requests/{id}/approve|reject`.
- `GET/PATCH /api/v1/admin/notification-templates/{id}`.
- `GET/PATCH /api/v1/admin/job-schedules/sla-daily`.
- `GET /api/v1/admin/job-runs` và `GET /api/v1/admin/notification-deliveries`.

### Test bắt buộc

- Fake-clock test các biên `deadline-3`, `deadline-1`, đúng deadline và `deadline+1` theo timezone Việt Nam.
- Khẳng định worker đổi `sla_status` nhưng không đổi `workflow_status`.
- Resolved finding chuyển SLA `CLOSED` và không gửi nhắc mới.
- Worker rerun cùng ngày không tạo email trùng; outbox retry/backoff và dead-letter sau ngưỡng cấu hình.
- Recipient snapshot test cho cán bộ, trưởng phòng, Kiểm soát/Giám đốc Chi nhánh và lãnh đạo Khối.
- Extension test: chỉ người có quyền duyệt; thay đổi deadline có audit event và đánh giá lại SLA.

### Nghiệm thu giai đoạn

- Chạy worker với đồng hồ cố định tạo đúng nhóm `ON_TRACK`, `DUE_SOON`, `OVERDUE`; workflow status của từng finding không đổi.
- Một lần chạy lặp không gửi trùng; lỗi email provider được retry và quan sát được trên Admin.
- Email sandbox nhận đúng subject/body/recipient/correlation ID; không chứa dữ liệu ngoài scope của người nhận.

## Giai đoạn 6 — Frontend cutover, dashboard, quan sát hệ thống và go-live gate

**Mục tiêu:** thay toàn bộ nguồn mock/localStorage bằng API, hoàn thiện màn hình theo vai trò và chứng minh release có thể vận hành.

### Migration đầu ra

- `0060_reporting_views.sql`: view/materialized view cho work queue, SLA summary, branch/cluster/internal dashboard; mọi view mang org scope.
- `0061_query_indexes.sql`: index được xác nhận bằng `EXPLAIN ANALYZE` cho finding list, queue, timeline, SLA worker và audit search.
- `0062_go_live_guards.sql`: NOT NULL/check còn thiếu sau backfill, production seed tối thiểu và release verification queries.

### API đầu ra

- `GET /api/v1/dashboards/branch`, `/cluster`, `/internal`.
- `GET /api/v1/admin/audit-events` và export có filter/phân trang.
- `GET /api/v1/admin/operations/summary` cho Drive, outbox, worker và error rates.
- Frontend API client cho auth, channels, import, findings, evidence, workflow, SLA và admin; không còn mutation dữ liệu nghiệp vụ trong component.

### Test bắt buộc

- Component test cho loading/empty/error/403/409 và refresh sau mutation.
- Playwright theo role: Nội Bộ ingest; Chi nhánh upload/submit; Kiểm soát chi nhánh chuyển trả/đồng ý; Nội Bộ chuyển trả/đóng lỗi; Admin cấu hình và xem audit.
- E2E reload/new browser session chứng minh dữ liệu đến từ server, không từ localStorage.
- Accessibility smoke: keyboard, focus dialog, accessible name cho icon-only button và contrast.
- Performance: list phân trang không tải toàn bộ dataset; kiểm tra query plan; code split Excel/ZIP, chart và Drive Viewer.
- Security: authz regression, file upload abuse, CSP/CORS/rate limit, secret scan và dependency audit.
- Migration rehearsal từ empty DB và snapshot N-1; backup/restore rehearsal trên staging.

### Nghiệm thu giai đoạn

- Sáu role hoàn thành các scenario được phép và bị chặn ở scenario không được phép.
- Xóa `audit_bgs_customers`, `audit_bgs_email_config` khỏi localStorage không làm mất dữ liệu; production bundle không import `mock-data.ts` hoặc mock Drive adapter.
- `npm run ci` xanh; build không còn chunk chính >500 kB hoặc có waiver đo lường được.
- Staging smoke chạy với PostgreSQL, OIDC, Google Drive và email sandbox thật; health/readiness, worker, audit và backup/restore đều có bằng chứng.

## 6. Bộ test nghiệm thu P0 xuyên suốt

| ID | Scenario nghiệm thu | Kết quả bắt buộc |
|---|---|---|
| **AC-01** | Branch A đọc finding của Branch B bằng ID đoán được. | Bị chặn ở API và RLS; không lộ dữ liệu. |
| **AC-02** | Import file thiếu CIF/branch/error code. | Row lỗi ở staging; không tự điền giả; không commit. |
| **AC-03** | Commit/retry cùng batch và idempotency key. | Chỉ tạo một tập finding/event. |
| **AC-04** | Chi nhánh submit khi chưa có evidence hoặc giải trình. | `422` với field/guard cụ thể. |
| **AC-05** | Kiểm soát chi nhánh chuyển trả rồi Chi nhánh nộp lại. | Trở lại `SUBMITTED_BRANCH`; reason/event cũ còn nguyên. |
| **AC-06** | Nội Bộ reject rồi Chi nhánh nộp lại. | Bắt buộc qua Kiểm soát chi nhánh lần nữa trước `SUBMITTED_INTERNAL`. |
| **AC-07** | Approve finding đã `WAIVED_RESOLVED`. | `409 INVALID_TRANSITION`; không tạo event/outbox. |
| **AC-08** | SLA worker đánh dấu quá hạn. | Chỉ `slaStatus=OVERDUE`; workflow status không đổi. |
| **AC-09** | Drive timeout hoặc DB fail trong upload. | Không có evidence `AVAILABLE` giả; có retry/compensation/audit. |
| **AC-10** | Double-click approve và hai approver đồng thời. | Một transition; request còn lại nhận response idempotent hoặc version conflict. |
| **AC-11** | Publish config mới khi có finding đang chạy. | Finding cũ dùng version cũ; finding mới dùng version mới. |
| **AC-12** | Reload trình duyệt/xóa localStorage. | Dữ liệu và phiên nghiệp vụ vẫn đến từ server/auth hợp lệ. |
| **AC-13** | Worker/email chạy lại sau crash. | Không gửi trùng; delivery có correlation và retry history. |
| **AC-14** | Tìm kiếm audit theo finding/request/actor. | Truy xuất đầy đủ chuỗi hành động, không sửa/xóa được event. |

## 7. Traceability từ quyết định đến đầu ra

| Quyết định | Migration chính | API chính | Test nghiệm thu |
|---|---|---|---|
| P0-01, P0-02 | `0022`, `0040`, `0043` | Findings + workflow actions | AC-04 đến AC-08 |
| P0-03, P0-04 | `0012`, `0041` | Cluster/Internal actions | AC-05, AC-06 |
| P0-05 | `0043` | Mọi workflow action | AC-07 |
| P0-06 | `0050` | Finding SLA + worker | AC-08 |
| P0-07 | `0021`–`0023` | Import/Web Form/Bulk API | AC-02, AC-03 |
| P0-08, P0-09 | `0003`, `0041`, `0042` | Mutation commands | AC-05, AC-06, AC-10 |
| P0-10, P0-11 | `0030`–`0032` | Evidence APIs | AC-09 |
| P0-12 | `0002`, `0004` | `/me`, admin và mọi scoped API | AC-01 |
| P0-13 | `0042`, `0052` | Commands + worker | AC-10, AC-13, AC-14 |
| P0-14 | `0010`–`0014` | Channel version/publish | AC-11 |
| P0-15 | `0062` | Toàn bộ frontend API client | AC-12 |

## 8. Thứ tự thực thi và điều kiện bắt đầu coding

Critical path: **G0 → G1 → G2 → G3 → G4 → G5 → G6**.

- G3 có thể bắt đầu adapter Drive sau khi G2 chốt finding ID/permission contract.
- UI cho từng module được làm song song ngay khi OpenAPI của module đó được khóa; không chờ đến G6 mới bắt đầu giao diện.
- Không bắt đầu workflow UI bằng mutation local; mọi màn hình mới phải gọi API thật hoặc fake adapter có cùng OpenAPI contract.
- Mỗi giai đoạn chỉ được đánh dấu hoàn tất khi migration, API, test và evidence nghiệm thu của chính giai đoạn đều có trong CI.

## 9. Definition of Done P0

- [ ] Tất cả migration chạy được từ database rỗng và rehearsal N-1; rollback/restore có bằng chứng.
- [ ] OpenAPI 3.1 được generate/validate và contract test không drift với frontend DTO.
- [ ] AC-01 đến AC-14 chạy tự động hoặc có sandbox evidence rõ ràng; không dùng lời xác nhận thủ công thay test.
- [ ] Không còn nguồn dữ liệu nghiệp vụ authoritative trong `localStorage`/mock data.
- [ ] Không còn client-side status mutation hoặc Google Drive credential/public-link giả.
- [ ] RBAC/data scope được kiểm tra ở API và RLS; security regression xanh.
- [ ] Workflow reject/resubmit qua Kiểm soát chi nhánh đúng P0; SLA không làm đổi workflow status.
- [ ] Audit trail/outbox đầy đủ, append-only, idempotent và truy vết được bằng correlation ID.
- [ ] Build/typecheck/lint/unit/integration/contract/E2E/migration checks đều xanh.
- [ ] Staging smoke dùng OIDC, PostgreSQL, Drive và email sandbox thật; production readiness được phân biệt rõ với code-complete.

## 10. Ngoài phạm vi P0

- Workflow một cấp, ba cấp hoặc custom tùy ý.
- Reopen finding đã `WAIVED_RESOLVED`.
- OCR/AI tự đọc chứng từ hoặc tự phê duyệt.
- Mobile app native, offline sync hoặc realtime collaboration.
- Data warehouse/BI nâng cao ngoài các dashboard vận hành P0.
- Hard-delete evidence/audit history.
