# Supabase Auth và quản trị đơn vị/người dùng

## Mục tiêu

Đưa xác thực tài khoản về Supabase Auth để quản trị viên có thể quản lý user trong Supabase Dashboard và trong AuditBGS; đồng thời hoàn thiện cây đơn vị với nhập Excel theo lô và bảo đảm nút `HEAD_OFFICE` luôn tồn tại tự động.

## Phạm vi đã chốt

- Supabase `auth.users` là nguồn sự thật cho email, mật khẩu, phiên đăng nhập, mời user, khôi phục mật khẩu và xóa/khóa Auth.
- Bảng hồ sơ ứng dụng hiện có tiếp tục giữ `fullName`, vai trò CoPlus, portal, phạm vi chi nhánh/phòng và trạng thái nghiệp vụ; thêm khóa liên kết tới UUID của `auth.users` khi schema hiện tại chưa có khóa tương đương.
- Secret/Admin key của Supabase chỉ được dùng trong server runtime; browser chỉ dùng publishable/anon key hoặc cookie phiên.
- Admin trong AuditBGS có thể tạo/mời, sửa hồ sơ và quyền, khóa/mở khóa, reset mật khẩu và xóa user. Xóa mặc định là vô hiệu hóa hồ sơ để giữ lịch sử; xóa Auth cứng chỉ cho phép khi không còn tham chiếu nghiệp vụ và phải ghi audit.
- User tự đổi mật khẩu khi đã đăng nhập và có luồng quên mật khẩu qua email. Bắt buộc mật khẩu mới tối thiểu 12 ký tự ở lớp ứng dụng và cấu hình Auth tương ứng.
- Tài khoản đang dùng hash `scrypt$...` riêng của ứng dụng sẽ được chuyển qua invite/reset; không cố đưa hash riêng vào Supabase nếu không đáp ứng thuật toán import được hỗ trợ.
- `HEAD_OFFICE` là bản ghi cấu trúc do server bootstrap, không xuất hiện trong file import và không có nút tạo thủ công.
- Nhập đơn vị dùng XLSX: tải mẫu, đọc sheet đầu tiên, preview, kiểm tra mã trùng/kiểu cha, tạo theo thứ tự `CLUSTER → BRANCH → DEPARTMENT`, idempotency key, kết quả từng dòng và audit batch. Nếu thiếu `HEAD_OFFICE`, server tạo trước khi xử lý lô.

## Luồng dữ liệu

1. Browser đăng nhập bằng Supabase Auth và gửi access token/cookie tới API.
2. API xác thực token bằng Supabase server client, lấy `auth.users.id`, rồi nạp hồ sơ ứng dụng và quyền từ PostgreSQL.
3. Tác vụ admin user gọi `supabase.auth.admin.*` ở server và cập nhật hồ sơ ứng dụng trong cùng một giao dịch hoặc compensating cleanup khi Auth tạo thành công nhưng hồ sơ thất bại.
4. Tác vụ thay đổi quyền/trạng thái luôn ghi security event; khóa/xóa phải thu hồi phiên hoặc chặn token ở các route nhạy cảm.
5. Import đơn vị xác thực toàn bộ batch trước khi ghi, dùng mã đơn vị làm khóa idempotent, không tự suy diễn cha ngoài cây đã cấu hình.

## API dự kiến

- `POST /api/v1/admin/users`: tạo Auth user hoặc gửi invite, tạo hồ sơ, trả về trạng thái invite; không trả plaintext password nếu dùng invite.
- `PATCH /api/v1/admin/users/:id`: sửa tên, email, vai trò, portal, nhóm/chi nhánh/phòng, trạng thái.
- `POST /api/v1/admin/users/:id/password`: admin đặt mật khẩu hoặc gửi reset; không lưu/hiển thị lại plaintext.
- `POST /api/v1/admin/users/:id/disable` và `POST /api/v1/admin/users/:id/enable`: khóa/mở, thu hồi phiên theo chính sách.
- `DELETE /api/v1/admin/users/:id`: soft-delete hồ sơ; tùy chọn hard-delete Auth sau kiểm tra tham chiếu.
- `POST /api/v1/auth/change-password`: user đã đăng nhập đổi mật khẩu; hỗ trợ xác nhận mật khẩu hiện tại.
- `POST /api/v1/auth/forgot-password`: phát reset email qua Supabase.
- `POST /api/v1/admin/org-units/imports/preview` và `/commit`: preview/commit XLSX, tối đa 500 dòng, trả lỗi theo dòng và `batchId`.

## UI dự kiến

- Form thêm user có lựa chọn “Gửi lời mời qua email” hoặc đặt mật khẩu tạm có cảnh báo một lần; hiển thị rõ email đăng nhập và email Google Drive là hai trường khác nhau.
- Mỗi thẻ user có Sửa, Khóa/Mở, Reset mật khẩu, Xóa; không cho thao tác tự xóa tài khoản admin cuối cùng.
- Trang hồ sơ người dùng có “Đổi mật khẩu” và “Quên mật khẩu”.
- Màn hình Đơn vị có nút tải mẫu/nhập Excel, preview dạng bảng, lỗi từng dòng, xác nhận commit và tải báo cáo kết quả.
- Thông báo rõ rằng Head Office do hệ thống tạo; admin bắt đầu từ Cụm địa bàn.

## Di trú và tương thích

- Giữ adapter auth hiện tại trong một khoảng chuyển tiếp chỉ ở local/test; production chuyển sang `AUTH_MODE=supabase` sau khi cấu hình URL, publishable key và server secret.
- Script di trú tạo Auth identity theo email, upsert hồ sơ bằng mapping cũ → `auth.users.id`, gửi invite/reset cho từng tài khoản và xuất báo cáo lỗi; không ghi password plaintext vào file/log.
- Sau cutover, loại bỏ đọc/ghi `user_credentials` và các route login scrypt khỏi production path.

## Kiểm thử và nghiệm thu

- Unit: parser XLSX đơn vị, thứ tự cha, duplicate/idempotency, validation mật khẩu và mapping profile.
- Integration: Supabase Auth adapter (mock server), admin CRUD/disable/reset, self-service change password, import preview/commit, audit và rollback khi profile lỗi.
- E2E: admin tạo user → invite/reset → user đặt mật khẩu → đăng nhập; admin khóa user; admin nhập một lô CLUSTER/BRANCH/DEPARTMENT; refresh vẫn giữ cây.
- Acceptance: không còn lỗi “CLUSTER/BRANCH phải trực thuộc” khi bắt đầu từ dữ liệu rỗng; mọi thao tác user được thực hiện được từ Dashboard Supabase hoặc Admin UI; không có secret key trong bundle browser; `npm run typecheck`, focused tests, full CI và build đều đạt.

## Ngoài phạm vi

- Không đưa dữ liệu nghiệp vụ, quyền chi tiết hoặc cây đơn vị vào `user_metadata` do người dùng tự sửa được.
- Không coi Vercel là user directory và không xóa dữ liệu nghiệp vụ khi xóa Auth user.
