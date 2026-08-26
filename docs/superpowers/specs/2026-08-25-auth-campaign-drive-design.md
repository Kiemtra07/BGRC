# Thiết kế đăng nhập, chuyên đề kiểm tra và kho Google Drive

Ngày chốt thiết kế: 2026-08-25  
Phạm vi: AuditBGS local, có đường nâng cấp rõ ràng lên PostgreSQL/OIDC/Google Drive thật.

## 1. Mục tiêu

- Thay cơ chế giả danh bằng header `x-user-id` và danh sách chuyển người dùng bằng trang đăng nhập username/password có phiên đăng nhập thật.
- Có đúng năm tài khoản mẫu cho năm nhóm vận hành đã chốt.
- Quản trị được chuyên đề/đợt kiểm tra gồm tên, quyết định, thời gian, trưởng đoàn, thành viên, chi nhánh và loại báo cáo áp dụng.
- Hồ sơ, dashboard và báo cáo lọc/nhóm được theo chuyên đề; khối thông tin chuyên đề có thể gắn vào nhiều mẫu báo cáo CMS.
- Một nút tạo kho dữ liệu sinh cây thư mục dưới thư mục Google Drive chung do tài khoản quản trị sở hữu.
- Chỉ người được phân công mới xem đúng phạm vi Drive được giao; người ngoài có URL vẫn không mở hoặc tác động được.
- Theo dõi có thêm dấu sao “Ưu tiên giám sát”, độc lập với “Tiếp nhận công việc”.

## 2. Những điểm không làm sai lệch phạm vi

- Năm tài khoản mẫu chỉ được seed ở môi trường local/test khi `SEED_DEMO_USERS=true`; production không được phép khởi động với mật khẩu mẫu.
- Đăng nhập local là xác thực thật bằng mật khẩu băm và phiên server-side, nhưng không được mô tả là SSO ngân hàng. Production vẫn phải dùng OIDC khi hạ tầng được cấp.
- Không công khai thư mục bằng quyền `anyone` hoặc `domain`.
- Không cho trình duyệt gọi Apps Script bằng secret. Chỉ backend AuditBGS được gọi Apps Script.
- Không cho user tải hồ sơ trực tiếp vào Drive để né workflow; file đi qua API AuditBGS rồi mới được lưu.

## 3. Kiến trúc được chọn

### 3.1. Xác thực

Frontend gọi backend theo chuỗi:

1. `POST /api/v1/auth/login` nhận `username` và `password`.
2. Backend kiểm tra tài khoản đang hoạt động, xác minh mật khẩu băm bằng `crypto.scrypt`, tạo session ngẫu nhiên và trả cookie `HttpOnly`, `SameSite=Strict`.
3. `GET /api/v1/me` đọc session, không còn tin `x-user-id` từ trình duyệt.
4. `POST /api/v1/auth/logout` thu hồi session và xóa cookie.
5. Mọi API nghiệp vụ lấy user từ session. `x-user-id` chỉ được phép trong test harness khi `NODE_ENV=test`.

Session local được lưu trong durable local state, có thời hạn, ngày hoạt động gần nhất và trạng thái thu hồi. Migration PostgreSQL tạo bảng tương ứng để không phải đổi contract khi chuyển kho dữ liệu.

Trang login chỉ có thương hiệu, username, password, nút Đăng nhập, báo lỗi ngắn gọn và tùy chọn hiện mật khẩu. Không còn hai “cổng”, danh sách click-login, mô tả dài hoặc chữ Demo Mode. Header sau đăng nhập bỏ select chuyển user, thay bằng tên, vai trò, menu tài khoản và Đăng xuất.

### 3.2. Năm tài khoản mẫu

| Nhóm | Username | Mật khẩu local mẫu | Vai trò |
|---|---|---|---|
| Quản trị hệ thống | `admin.hethong` | `AuditAdmin@2026` | `ADMIN` |
| Trưởng đoàn/Phê duyệt HT | `linhlbk` (Lê Bá Khánh Linh) | `AuditLead@2026` | `SUPERVISOR`, `INTERNAL_APPROVER` |
| Cán bộ kiểm tra | `bachtd` (Trần Đức Bách) | `AuditOfficer@2026` | `INTERNAL_OFFICER` |
| Cán bộ chi nhánh | `cbht635` | `BranchInput@2026` | `BRANCH_INPUT` |
| Kiểm soát chi nhánh | `lyltk1` (Lê Trần Khánh Ly) | `BranchControl@2026` | `BRANCH_CONTROLLER` |

Mật khẩu không được lưu trong `UserProfile`, local state hoặc response API. Seed chỉ lưu salt và password hash. Tài liệu bàn giao local liệt kê thông tin đăng nhập; production guard từ chối demo seed.

### 3.3. Chuyên đề/đợt kiểm tra

Thực thể `AuditCampaign` là ngữ cảnh nghiệp vụ dùng chung cho mọi loại báo cáo:

- `id`, `code`, `name`, `description`
- `decisionNo`, `decisionFileName`, `decisionDriveFileId`
- `startDate`, `endDate`, `status`: `DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED`
- `leadUserId`
- `reportChannelIds`: một chuyên đề có thể áp dụng cho nhiều loại báo cáo
- `branchCodes`: các chi nhánh thuộc phạm vi kiểm tra
- `driveRootFolderId`, `driveRootUrl`, `driveProvisionStatus`, `driveLastError`
- `version`, `createdByUserId`, `createdAt`, `updatedAt`

Thực thể `AuditCampaignMember` gồm `campaignId`, `userId`, `memberRole` (`LEAD` hoặc `MEMBER`) và `assignedBranchCodes`. Trưởng đoàn luôn thuộc danh sách thành viên và được xem toàn bộ chuyên đề. Thành viên chỉ xem các chi nhánh được phân công.

`Finding` có `campaignId` bắt buộc với hồ sơ mới. Dữ liệu cũ được gắn vào một chuyên đề hệ thống “Kiểm tra thường xuyên 2026” trong migration/backfill để filter không tạo nhóm rỗng.

Quản trị có màn hình “Chuyên đề kiểm tra” để tạo, sửa, đóng, lưu trữ, phân công thành viên, gắn loại báo cáo và tạo kho Drive. Không xóa cứng chuyên đề đã có hồ sơ; chỉ chuyển `ARCHIVED`.

### 3.4. Hiển thị và báo cáo theo chuyên đề

- Thanh bên nhóm kênh dữ liệu theo chuyên đề khi kênh bật `campaignMode`.
- Danh sách hồ sơ có bộ lọc chuyên đề gọn, hỗ trợ responsive và giữ lựa chọn trên URL.
- Dashboard tính KPI trong chuyên đề đang chọn.
- Report catalog có thêm trường `campaignId`, `campaignCode`, `campaignName`, `campaignDecisionNo`, `campaignStartDate`, `campaignEndDate`.
- CMS mẫu báo cáo có block hệ thống `CAMPAIGN_CONTEXT`. Block này chỉ cho chọn cách trình bày; dữ liệu lấy từ chuyên đề, không cho người nhập tự sửa lại quyết định hoặc trưởng đoàn.
- Preview admin hiển thị đúng block chuyên đề bằng dữ liệu mẫu của phiên bản báo cáo.

## 4. Google Drive và Apps Script

### 4.1. Cây thư mục

Thư mục gốc `AUDIT_BGS` do tài khoản quản trị sở hữu và để `Restricted`:

```text
AUDIT_BGS/
  CD_2026_01_KIEM_TRA_TIN_DUNG/
    00_QUYET_DINH/
    CN_635_NAM_BUON_HO/
      10482910_CONG_TY_TNHH_CA_PHE_TAY_NGUYEN_XANH/
        TD01.01/
          HO_SO_BO_SUNG/
        TD05.05/
          HO_SO_BO_SUNG/
```

- Nút “Tạo kho dữ liệu” tạo thư mục chuyên đề và các thư mục chi nhánh bằng thao tác idempotent.
- Khi tiểu biên bản/hồ sơ khách hàng được đồng ý nhập vào đợt kiểm tra, hệ thống bảo đảm có thư mục `CIF_TEN`.
- Khi lỗi được tạo hoặc hồ sơ bổ sung được tải lên, hệ thống bảo đảm có thư mục `[MÃ_LỖI]/HO_SO_BO_SUNG` rồi lưu file tại đó.
- Tên được chuẩn hóa Unicode NFC, bỏ ký tự Drive không an toàn, giữ mã định danh ở đầu để không trùng tên.
- ID Drive được lưu trong dữ liệu ứng dụng; không tìm thư mục chỉ bằng tên.

### 4.2. Phân quyền hai lớp

Lớp ứng dụng:

- Admin: toàn bộ chuyên đề.
- Trưởng đoàn: toàn bộ chuyên đề mình phụ trách.
- Thành viên kiểm tra: các chi nhánh được phân công.
- Cán bộ/kiểm soát chi nhánh: hồ sơ thuộc đúng branch scope hiện có.
- API không trả URL hoặc nội dung tài liệu nếu user nằm ngoài scope.

Lớp Google Drive:

- Không tạo ACL loại `anyone` hoặc `domain`.
- Trưởng đoàn nhận quyền trên thư mục chuyên đề.
- Thành viên nhận quyền trực tiếp trên thư mục chi nhánh được giao, không nhận quyền ở thư mục chuyên đề.
- User chi nhánh nhận quyền đọc trên phạm vi cần xem; thao tác tải lên/thay thế vẫn đi qua ứng dụng.
- Các thư mục nhạy cảm dùng limited access; ACL được đồng bộ theo danh sách phân công.
- `writersCanShare=false` trên thư mục My Drive để editor không tự chia sẻ lại.
- Khi đổi thành viên hoặc phạm vi chi nhánh, job đồng bộ xóa permission cũ trước khi báo thành công.
- URL bị lộ không tạo quyền truy cập; Drive vẫn kiểm tra tài khoản Google đang đăng nhập với ACL.

Mỗi `UserProfile` có `googleWorkspaceEmail`. Admin chỉ được bật “Đã cấu hình Drive” khi email này hợp lệ và đồng bộ permission thành công.

### 4.3. Apps Script

Mã bàn giao gồm:

- `integrations/google-apps-script/AuditBGSDrive.gs`
- `integrations/google-apps-script/appsscript.json`
- `integrations/google-apps-script/README.md`

Apps Script chạy dưới tài khoản quản trị triển khai và đọc các Script Properties:

- `AUDIT_BGS_ROOT_FOLDER_ID`
- `AUDIT_BGS_SHARED_SECRET`
- `AUDIT_BGS_ALLOWED_CLOCK_SKEW_SECONDS`

`doPost` chỉ nhận các action trong whitelist:

- `PING`
- `PROVISION_CAMPAIGN`
- `ENSURE_CUSTOMER_FOLDER`
- `ENSURE_ERROR_FOLDER`
- `SYNC_CAMPAIGN_ACL`
- `REVOKE_CAMPAIGN_ACCESS`

Mỗi request có timestamp, nonce, action và payload; backend ký HMAC-SHA256. Script kiểm tra chữ ký, giới hạn lệch giờ, chặn nonce dùng lại và dùng `LockService` để tránh tạo trùng. Response trả JSON có `requestId`, folder IDs và lỗi chuẩn hóa; không trả secret hoặc OAuth token.

Admin UI chỉ lưu URL triển khai và trạng thái kiểm tra kết nối. Shared secret nằm trong biến môi trường backend và Script Properties, không lưu hoặc đọc lại ở trình duyệt.

## 5. Ưu tiên giám sát bằng dấu sao

“Tiếp nhận”, “Theo dõi” và “Ưu tiên giám sát” là ba trạng thái độc lập:

- Tiếp nhận: user chịu trách nhiệm xử lý công việc.
- Theo dõi: user muốn thấy cập nhật nhưng không nhận trách nhiệm xử lý.
- Gắn sao: đánh dấu mục theo dõi quan trọng của riêng user.

Gắn sao vào hồ sơ chưa theo dõi sẽ tự tạo watch target rồi đặt `isPriority=true`. Bỏ theo dõi sẽ xóa cả dấu sao. Bỏ sao không bỏ theo dõi.

`WorkspaceTarget` bổ sung `isPriority`, `prioritizedAt`. API dùng command idempotent để bật/tắt; người dùng chỉ sửa target của chính mình. Sidebar có nhóm “Ưu tiên giám sát” ở trên “Đang theo dõi”; trong từng nhóm sắp xếp: quá hạn trước, sau đó hạn gần nhất, rồi thời điểm gắn sao.

Icon sao có `aria-label`, trạng thái `aria-pressed`, tooltip ngắn và kích thước chạm tối thiểu 44 px trên mobile.

## 6. API chính

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`

### Chuyên đề

- `GET /api/v1/campaigns`
- `GET /api/v1/campaigns/:id`
- `POST /api/v1/admin/campaigns`
- `PATCH /api/v1/admin/campaigns/:id`
- `POST /api/v1/admin/campaigns/:id/provision-drive`
- `POST /api/v1/admin/campaigns/:id/sync-drive-acl`
- `POST /api/v1/admin/campaigns/:id/close`
- `POST /api/v1/admin/campaigns/:id/archive`

### Theo dõi ưu tiên

- `PUT /api/v1/workspace/watch-targets`
- `PATCH /api/v1/workspace/watch-targets/:id/priority`
- `DELETE /api/v1/workspace/watch-targets/:id`

Mọi mutation dùng expected version hoặc idempotency key phù hợp. Lỗi trả RFC 7807 và không để lộ user, secret, permission ID hoặc đường dẫn nội bộ.

## 7. Luồng lỗi và khả năng phục hồi

- Sai tài khoản/mật khẩu luôn trả cùng thông báo “Tài khoản hoặc mật khẩu không đúng”.
- Tài khoản bị khóa hoặc session hết hạn đưa về login, giữ return path hợp lệ.
- Apps Script timeout không rollback chuyên đề; `driveProvisionStatus=FAILED` lưu thông báo an toàn và cho retry idempotent.
- Tạo được folder nhưng đồng bộ ACL thất bại thì trạng thái chưa được đánh dấu READY.
- Thu hồi user khỏi chuyên đề chỉ hoàn tất khi ACL Drive đã bị xóa; nếu lỗi, UI hiển thị “Chờ đồng bộ quyền” và chặn cung cấp Drive URL.
- Upload file chỉ ghi Evidence AVAILABLE sau khi Drive trả ID và checksum thành công.
- Audit log ghi đăng nhập thành công/thất bại đã làm mờ username, logout, tạo/sửa chuyên đề, tạo kho, thay đổi thành viên, đồng bộ/thu hồi ACL và gắn/bỏ sao.

## 8. Dữ liệu và migration

Migration mới bổ sung:

- `user_credentials`
- `auth_sessions`
- `app_users.google_workspace_email`
- `audit_campaigns`
- `audit_campaign_members`
- `audit_campaign_branches`
- `audit_campaign_report_channels`
- `findings.campaign_id`
- `workspace_watch_targets.is_priority`, `prioritized_at`
- các cột Drive ID/status cần thiết

Khóa ngoại, unique key và index phải ngăn trùng membership, trùng branch assignment và trùng một watch target trên mỗi user/target. Dry-run migration phải chạy được nhiều lần mà không thay đổi kết quả.

## 9. Kiểm thử và tiêu chí nghiệm thu

### Unit

- Hash/verify mật khẩu, expiry và revoke session.
- Scope chuyên đề theo từng vai trò.
- Chuẩn hóa tên folder và HMAC Apps Script.
- Gắn sao tự tạo watch, bỏ sao không bỏ watch.

### Integration

- Không session trả 401; giả mạo `x-user-id` không đổi được user.
- Năm tài khoản đăng nhập đúng, mật khẩu sai bị từ chối.
- User ngoài chuyên đề không đọc được hồ sơ/API Drive URL.
- Tạo chuyên đề, phân công, filter, gắn nhiều report channel.
- Provision và retry không tạo folder trùng.
- Thay thành viên sinh đúng lệnh cấp/thu hồi ACL.
- Trạng thái Drive không READY khi ACL lỗi.

### Contract/migration

- Zod schemas và API payload ổn định.
- Migration/seed dry-run đạt; production guard chặn demo credentials.

### E2E local

- Login/logout và refresh session.
- Không còn dropdown chuyển người dùng.
- Admin tạo chuyên đề, phân trưởng đoàn/thành viên/chi nhánh, chọn loại báo cáo.
- Filter và nhóm hồ sơ theo chuyên đề trên desktop/mobile.
- Gắn sao xuất hiện ở “Ưu tiên giám sát”, không làm thay đổi trạng thái tiếp nhận.
- Nút tạo kho hiển thị READY với Apps Script stub; lỗi kết nối có retry rõ ràng.

### Nghiệm thu Google Drive thật

- Admin mở được toàn bộ cây.
- Trưởng đoàn mở được thư mục chuyên đề.
- Thành viên chỉ mở được chi nhánh được phân công.
- User ngoài danh sách mở URL nhận Access denied.
- Thu hồi thành viên khiến URL cũ không mở lại được.
- Editor không tự chia sẻ cho tài khoản ngoài.

## 10. Thứ tự triển khai

1. Auth local thật và năm tài khoản mẫu.
2. Dấu sao ưu tiên giám sát.
3. Mô hình/API/UI chuyên đề và filter.
4. Block CMS `CAMPAIGN_CONTEXT` và report catalog.
5. Apps Script, backend gateway, cấu hình và cây Drive.
6. Kiểm thử tổng, chạy localhost và nghiệm thu Drive thật khi có tài khoản Google quản trị, root folder ID và deployment URL.

## 11. Ranh giới hoàn thành

“Code-complete local” yêu cầu tất cả test local, migration dry-run, build và E2E đạt. “Google Drive configured” chỉ được công bố khi có bằng chứng thật cho tài khoản ngoài bị từ chối và user bị thu hồi mất quyền. Không có credential Google thì bàn giao mã Apps Script, hướng dẫn triển khai và trạng thái NOT_CONFIGURED; không giả lập thành READY.
