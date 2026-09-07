# Ma trận quyền, phạm vi và hành động — baseline G0

Tài liệu này là baseline kiểm soát cho AuditBGS. Nó mô tả hành vi hiện có trong mã nguồn, không cấp thêm quyền và không thay thế kiểm thử PostgreSQL/RLS trước phát hành.

## Nguồn sự thật

- Kiểu scope và hồ sơ người dùng: `shared/contracts/auth.ts`.
- Capability UI/API: `shared/contracts/permissions.ts`.
- Quy tắc lọc hồ sơ và projection scope chi nhánh: `server/src/security/access-control.ts` và `server/src/app.ts`.
- Tuyến duyệt, giao lại và event: `server/src/modules/workflow/*` và `server/src/app.ts`.
- Minh chứng: mọi route bắt đầu bằng xác thực hồ sơ trong scope; tệp chỉ phục vụ qua proxy backend.

Mọi quyền nghiệp vụ cần đồng thời thỏa **role/capability**, **scope**, **trạng thái workflow** và, nếu là bước duyệt, **người được ghim trong approval route**. Thiếu một điều kiện phải từ chối.

## Phạm vi dữ liệu

| Scope | Đọc finding/evidence/export | Ghi finding | Điều kiện từ chối cần giữ |
| --- | --- | --- | --- |
| `ALL` | Mọi hồ sơ trong tenant | Chỉ khi có capability tạo/nhập | Không suy diễn `ALL` từ role.
| `CLUSTER` | Hồ sơ có `clusterName` khớp scope | Chỉ trong cụm được gán | Khác cụm trả 404 trên detail để không lộ tồn tại bản ghi.
| `BRANCH` | Mọi phòng/PGD trong `branchCode` được gán | Chỉ trong chi nhánh được gán | Khác chi nhánh không được đọc, tải file hay export.
| `DEPARTMENT` | Chỉ `branchCode` và `department` cùng khớp | Chỉ trong phòng/PGD được gán | Cùng chi nhánh nhưng khác phòng phải bị chặn.
| Không có scope | Không có finding/evidence/export | Không được tạo finding | Trả `USER_ASSIGNMENT_REQUIRED` trước khi tạo.

`BRANCH_INPUT` được project về `DEPARTMENT` nếu đã có phòng/PGD; `BRANCH_CONTROLLER` và `BRANCH_LEADER` giữ `BRANCH` để thực hiện duyệt toàn chi nhánh. Tài khoản chưa phân luồng có thể tồn tại nhưng không được cấp dữ liệu nghiệp vụ.

## Ma trận vai trò × hành động

| Vai trò | Phạm vi mặc định | Tạo/nhập | Khắc phục và nộp | Duyệt | Quản trị |
| --- | --- | --- | --- | --- | --- |
| `ADMIN` | Scope được gán, thường `ALL` | Có | Có trong scope | Không tự duyệt; chỉ theo route nếu mang role phù hợp | Quản lý user, cấu hình bảo mật, danh mục, tuyến và outbox.
| `SUPERVISOR` | Scope được gán | Nhập theo capability | Theo workflow được gán | Chỉ nếu route/capability workflow cho phép | Cấu hình catalog; không thay quyền admin bảo mật.
| `INTERNAL_APPROVER` | Scope được gán | Không qua capability tạo/nhập mặc định | Không thay người khắc phục | Duyệt bước nội bộ khi là người được route ghim | Cấu hình catalog.
| `INTERNAL_OFFICER` | Scope được gán | Tạo và nhập | Có trong scope | Không duyệt thay role khác | Cấu hình catalog.
| `BRANCH_CONTROLLER` | `BRANCH` | Không qua capability tạo/nhập mặc định | Không thay người lập | Duyệt bước kiểm soát chi nhánh khi route ghim | Không.
| `BRANCH_LEADER` | `BRANCH` | Không qua capability tạo/nhập mặc định | Không thay người lập | Duyệt bước lãnh đạo khi route ghim | Không.
| `BRANCH_INPUT` | `DEPARTMENT` hoặc `BRANCH` khi chưa gán phòng | Không qua capability tạo/nhập mặc định | Tạo giải trình, đính kèm và nộp hồ sơ trong scope | Không | Không.
| `VIEWER` | Scope được gán | Không | Không | Không | Không.

Capability hiện hành phải giữ đúng như sau: `CONFIGURE_CATALOG` = ADMIN/SUPERVISOR/INTERNAL_APPROVER/INTERNAL_OFFICER; `IMPORT_FINDINGS` = ADMIN/SUPERVISOR/INTERNAL_OFFICER; `CREATE_FINDING` = ADMIN/INTERNAL_OFFICER. Các capability này không bỏ qua scope.

## Invariant tuyến duyệt và minh chứng

1. Người nộp không thể là approver của chính finding. Nếu không chọn được approver độc lập, route fail-closed.
2. Chỉ admin mới giao lại, chỉ đúng bước đang chờ, phải có `expectedVersion`, lý do, người nhận hoạt động/đúng scope và event audit.
3. `workflowStatus` và `slaStatus` độc lập. Không được dùng SLA để chuyển trạng thái workflow.
4. Evidence phải `AVAILABLE` trước submit, approve hoặc close; `REJECTED`, `SCANNING`, `QUARANTINED`, `FAILED` và `REVOKED` không thỏa điều kiện này.
5. Tệp evidence chỉ qua `GET /api/v1/evidence/:driveFileId/content`; không trả URL Drive riêng tư cho trình duyệt.

## Ma trận nghiệm thu bắt buộc

| Nhóm | Được phép | Phải bị từ chối |
| --- | --- | --- |
| Scope đọc | Người cùng `BRANCH` hoặc `DEPARTMENT` khớp đọc detail/evidence/export | Branch khác; phòng khác cùng branch đối với `DEPARTMENT`; user không scope.
| Tạo/nhập | Role có capability và finding nằm trong scope | Role thiếu capability; target ngoài scope; account chưa phân luồng.
| Workflow | Người được route ghim xử lý đúng trạng thái với version hiện hành | Self-approval; stage sai; version cũ; approver inactive/chuyển đơn vị.
| Reassign | Admin giao lại đúng stage, có reason, recipient hợp lệ | Non-admin; route chưa có; terminal finding; recipient là submitter; stage đã qua.
| Evidence | Người trong scope tải evidence `AVAILABLE` qua proxy | MIME giả, checksum/signature sai, archive nguy hiểm, evidence không AVAILABLE, Drive file đổi/thu hồi.
| Admin/outbox | Admin xem và retry dead-letter | Non-admin; retry delivery không ở dead-letter.

## Điều kiện còn thiếu để chốt G0

### Baseline cục bộ 05/09/2026

Chạy `npm run perf:baseline` tại workspace Windows, runtime `NODE_ENV=test` và memory-only. Script tạo 20.000 finding tổng hợp bằng 40 request 500 dòng, sau đó chạy 50 request list song song. Không ghi snapshot, không dùng PostgreSQL/Drive/network adapter.

| Chỉ số | p50 | p95 |
| --- | ---: | ---: |
| Import batch 500 dòng | 864,11 ms | 1.729,98 ms |
| List trang 1, 100 dòng | 151,53 ms | 164,67 ms |

Cold start đo được 577,61 ms. Đây là baseline ứng dụng memory-only để bắt hồi quy cục bộ; không có query count SQL, kích thước snapshot PostgreSQL hoặc độ trễ adapter.

Ma trận này cần được chạy lại với dữ liệu tổng hợp và PostgreSQL runtime role thật. Chưa có môi trường DB test tách biệt hoặc người chịu trách nhiệm nghiệp vụ ký baseline; vì vậy G0 chưa được xem là hoàn tất.
