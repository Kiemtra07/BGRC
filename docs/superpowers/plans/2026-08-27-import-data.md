# Import Data Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện cổng Nhập dữ liệu AuditBGS có chọn đích, xem trước, chống trùng/idempotency, DOCX, provenance và nhập user theo lô an toàn.

**Architecture:** Mọi nguồn được chuyển thành một tập dòng chuẩn, validate và phân loại trước khi commit. API giữ quyền quyết định scope, khóa nghiệp vụ và idempotency; client chỉ hiển thị preview và gửi xác nhận. Nhập user dùng cùng mẫu validate/preview/commit nhưng không lưu mật khẩu thô.

**Tech Stack:** React 18, TypeScript, Fastify, Zod, Vitest, JSZip/XLSX hiện hữu, Mammoth cho DOCX, PostgreSQL migrations và local-state repository.

## Global Constraints

- UTF-8 Vietnamese preflight trước mọi lệnh PowerShell hoặc thao tác văn bản.
- Gọi Graph Memory `get_context_for_file` trước khi sửa từng tệp; `record_edit`, `record_error`, `record_outcome` theo AGENTS.md.
- Giữ nguyên thay đổi không liên quan của người dùng.
- Không lưu/log mật khẩu thô và không tự cấu hình Google OAuth.
- Hoàn tất toàn bộ cổng nghiệm thu Nhập dữ liệu trước Cognos-lite.
- Không deploy/push nếu người dùng chưa yêu cầu phát hành.

---

### Task 1: Hợp đồng preview, provenance và dedupe

**Files:**
- Modify: `shared/contracts/ingestion.ts`
- Modify: `shared/contracts/findings.ts`
- Modify: `src/lib/excel-parser.ts`
- Test: `tests/unit/ingestion-schema.test.ts`
- Test: `tests/unit/excel-parser.test.ts`

**Interfaces:**
- Produces: `FindingImportSourceType`, `FindingImportPreview`, `FindingImportCommitDTO`, `buildFindingBusinessKey()` và provenance trên `Finding`.

- [ ] Viết test chứng minh hai dòng clipboard giống nhau chỉ còn một dòng hợp lệ và một dòng trùng.
- [ ] Chạy `npx vitest run tests/unit/excel-parser.test.ts tests/unit/ingestion-schema.test.ts`; kỳ vọng test mới FAIL.
- [ ] Thêm schema preview/commit, source type, normalized business key và row result codes.
- [ ] Dedupe parser theo khóa chuẩn hóa, không làm mất hai mã lỗi khác nhau của cùng CIF.
- [ ] Chạy lại hai test; kỳ vọng PASS.

### Task 2: API validate/commit idempotent và provenance

**Files:**
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Modify: `db/migrations/0020_ingestion_and_findings.sql` hoặc tạo migration kế tiếp nếu schema production cần bổ sung.
- Test: `tests/integration/customer-case-and-reporting.test.ts`
- Test: `tests/contract/api-contract.test.ts`

**Interfaces:**
- Consumes: hợp đồng Task 1.
- Produces: `POST /api/v1/imports/findings/validate`, `POST /api/v1/imports/findings/commit`; tương thích route bulk cũ trong giai đoạn chuyển tiếp.

- [ ] Viết test route bắt buộc đích hợp lệ, scope hợp lệ, preview không ghi và commit có provenance.
- [ ] Viết test cùng `Idempotency-Key` không tạo thêm dữ liệu và key trùng/payload khác trả 409.
- [ ] Chạy test integration mục tiêu; kỳ vọng FAIL trước triển khai.
- [ ] Thêm preview token TTL gắn user/hash/đích; dùng repository idempotency hiện hữu khi commit.
- [ ] Ghi import batch và provenance finding; chuẩn hóa khóa cả dữ liệu mới và hiện có.
- [ ] Chạy lại integration/contract mục tiêu; kỳ vọng PASS.

### Task 3: UI chọn đích và quy trình preview

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/internal/FastDataIngestion.tsx`
- Modify: `src/services/api.ts`
- Test: `tests/unit/ui-architecture.test.ts`

**Interfaces:**
- Consumes: channels/campaigns từ App và API Task 2.
- Produces: quy trình `chọn loại báo cáo -> chọn chuyên đề -> chọn nguồn -> preview -> xác nhận`.

- [ ] Viết test kiến trúc UI cho nhãn “Nhập dữ liệu”, hai select bắt buộc và không còn `chan-audit-bgs` hard-code.
- [ ] Chạy test; kỳ vọng FAIL.
- [ ] Truyền danh sách loại báo cáo/chuyên đề vào component và lọc chuyên đề theo loại báo cáo/scope.
- [ ] Thay commit trực tiếp bằng validate/preview/commit; hiển thị số mới/trùng/lỗi và khóa nút khi không có dòng hợp lệ.
- [ ] Chạy unit và typecheck mục tiêu; kỳ vọng PASS.

### Task 4: DOCX findings import

**Files:**
- Create: `server/src/modules/ingestion/finding-document-import.ts`
- Modify: `server/src/app.ts`
- Modify: `src/components/internal/FastDataIngestion.tsx`
- Modify: `src/services/api.ts`
- Test: `tests/unit/finding-document-import.test.ts`
- Test: `tests/integration/finding-import.test.ts`

**Interfaces:**
- Produces: `parseFindingDocx(buffer)` trả dòng chuẩn có số dòng/bảng và lỗi có cấu trúc.

- [ ] Tạo fixture DOCX tối thiểu trong test bằng thư viện `docx` hiện hữu.
- [ ] Viết test bảng có header hợp lệ, nhiều mã lỗi và tài liệu không đủ cấu trúc.
- [ ] Chạy test; kỳ vọng FAIL vì module chưa có.
- [ ] Tách text/bảng DOCX, ánh xạ alias header và trả lỗi fail-closed khi không đủ cột.
- [ ] Nối upload DOCX vào pipeline preview chung, không commit riêng.
- [ ] Chạy unit/integration mục tiêu; kỳ vọng PASS.

### Task 5: Nhập user theo lô và mẫu Excel

**Files:**
- Modify: `shared/contracts/auth.ts`
- Create: `server/src/modules/users/user-import.ts`
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/admin/UserManager.tsx`
- Test: `tests/unit/user-import.test.ts`
- Test: `tests/integration/authentication.test.ts`

**Interfaces:**
- Produces: template/download/validate/commit/rejections/one-time-credentials APIs và `UserImportRowSchema`.

- [ ] Viết test alias cột, role/scope, trùng username/email, mật khẩu trống/tự sinh và không lộ mật khẩu trong preview/audit.
- [ ] Viết test chỉ ADMIN truy cập, validate không ghi, commit tạo dòng hợp lệ và idempotent.
- [ ] Chạy test mục tiêu; kỳ vọng FAIL.
- [ ] Tạo workbook template với `NGUOI_DUNG`, `DANH_MUC`, `HUONG_DAN`, dropdown và danh mục sống.
- [ ] Dùng `CreateUserSchema`, hash ngay khi commit, chỉ giữ credential download một lần trong bộ nhớ TTL; không lưu file gốc/mật khẩu thô.
- [ ] Thêm UI bốn bước và file lỗi theo dòng.
- [ ] Kiểm tra workbook: values/formulas, lỗi công thức và render toàn bộ sheet theo Spreadsheet skill.
- [ ] Chạy lại test mục tiêu; kỳ vọng PASS.

### Task 6: Migration, tài liệu và cổng nghiệm thu Nhập dữ liệu

**Files:**
- Create: `db/migrations/0100_import_preview_and_provenance.sql` nếu cần.
- Modify: `docs/HUONG_DAN_CAI_DAT_SU_DUNG_VAN_HANH_AUDITBGS.md`
- Modify: `tests/e2e/local-smoke.mjs` hoặc tạo smoke import chuyên biệt.

**Interfaces:**
- Produces: schema production tương thích, hướng dẫn vận hành và smoke có thể lặp lại.

- [ ] Thêm migration additive, index khóa nghiệp vụ và RLS/policy phù hợp; không phá dữ liệu cũ.
- [ ] Chạy `npm run db:migrate:dry-run`; kỳ vọng tất cả migration được nhận diện.
- [ ] Cập nhật hướng dẫn nhập findings/DOCX/user, quyền ADMIN và ranh giới Google thủ công.
- [ ] Chạy `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run build`.
- [ ] Chạy smoke local cho một lô findings và một lô user; đối chiếu provenance, dedupe và idempotency.
- [ ] Chỉ khi tất cả đạt, đánh dấu cổng Nhập dữ liệu hoàn tất và bắt đầu kế hoạch Cognos-lite riêng.
