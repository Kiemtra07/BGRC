# Thiết kế hoàn thiện Nhập dữ liệu và Cognos-lite

**Ngày:** 2026-08-27
**Trạng thái:** Đã thống nhất phạm vi và thứ tự triển khai
**Thứ tự bắt buộc:** Hoàn thiện toàn bộ Nhập dữ liệu trước; chỉ bắt đầu Cognos-lite sau khi bộ nghiệm thu Nhập dữ liệu đạt.

## 1. Mục tiêu

Xây dựng một cổng nhập dữ liệu có kiểm soát cho dữ liệu sai sót và tài khoản người dùng, bảo đảm người vận hành biết dữ liệu sẽ đi vào loại báo cáo/chuyên đề nào, xem trước được thay đổi, không tạo bản ghi trùng khi gửi lại và truy vết được ai đã nhập. Trên nền dữ liệu đã chuẩn hóa đó, bổ sung lớp báo cáo tự phục vụ kiểu Cognos-lite gồm truy vấn, nhóm, bảng chéo, biểu đồ, dashboard, lưu mẫu và xuất dữ liệu.

## 2. Quyết định phạm vi

### 2.1. Nhập dữ liệu nghiệp vụ

- Đổi toàn bộ nhãn chức năng từ **“Nạp dữ liệu”** thành **“Nhập dữ liệu”**.
- Trước khi chọn tệp hoặc dán Excel, người dùng phải chọn:
  - **Loại báo cáo/kênh dữ liệu** đang hoạt động.
  - **Chuyên đề/đợt kiểm tra** hợp lệ với loại báo cáo và phạm vi của người dùng.
- Không dùng mã kênh hoặc chuyên đề mặc định ẩn trong giao diện. Mọi dòng nhập nhận cùng đích đã chọn, trừ khi mẫu nhập được mở rộng có cột đích và vượt qua kiểm tra quyền.
- Hỗ trợ bốn nguồn:
  - một hoặc nhiều tệp Excel `.xlsx`;
  - tệp ZIP chứa các tệp Excel hợp lệ;
  - dữ liệu dán từ Excel/clipboard;
  - tài liệu `.docx` theo cấu trúc bảng hoặc nhãn trường được hỗ trợ.
- PDF không thuộc đợt hoàn thiện này vì việc bóc tách tự do có độ tin cậy thấp; PDF vẫn thuộc luồng tạo chuyên đề đã được thiết kế riêng.

### 2.2. Quy trình xem trước rồi mới ghi

Mọi nguồn nhập dùng chung pipeline:

1. Đọc nguồn và chuẩn hóa tên cột/giá trị.
2. Kiểm tra định dạng, quyền, chi nhánh, loại báo cáo, chuyên đề và mã lỗi.
3. Chuẩn hóa khóa nhận diện và loại bản ghi trùng trong chính lô.
4. Đối chiếu dữ liệu hiện có để phân loại `MỚI`, `TRÙNG`, `LỖI`.
5. Hiển thị màn xem trước có tổng số dòng, số hợp lệ, số trùng, số lỗi và lỗi theo từng dòng.
6. Chỉ ghi khi người dùng xác nhận.
7. Trả kết quả và cho tải danh sách lỗi/trùng.

Không ghi một phần ngoài ý muốn. Mặc định, hệ thống chỉ ghi các dòng hợp lệ sau khi người dùng xác nhận rõ; dòng lỗi và dòng trùng bị bỏ qua, được xuất lại để sửa. Nếu không còn dòng hợp lệ, nút xác nhận bị khóa.

### 2.3. Chống trùng và gửi lại an toàn

- Khóa nghiệp vụ của sai sót là bộ giá trị đã chuẩn hóa: `channelId + campaignId + branchCode + cif + errorCode + decisionNo`.
- Trong một lô, hai dòng có cùng khóa chỉ tạo một bản ghi; các dòng sau được đánh dấu trùng và trỏ về dòng đầu.
- Với dữ liệu đang có, khóa trùng không được tạo bản ghi mới và không được âm thầm ghi đè.
- Mỗi lần xác nhận phải gửi `Idempotency-Key`. Gửi lại cùng khóa và cùng payload trả lại kết quả cũ; cùng khóa nhưng payload khác bị từ chối.
- Clipboard được chuẩn hóa giống Excel nên lỗi tạo hai mã lỗi giống nhau từ hai dòng giống nhau phải bị loại bỏ.

### 2.4. Truy vết nguồn nhập

Mỗi lô nhập lưu:

- người nhập (`uploadedByUserId`, `uploadedByName`);
- thời điểm nhập;
- loại nguồn (`XLSX`, `ZIP_XLSX`, `CLIPBOARD`, `DOCX`);
- tên tệp gốc hoặc nhãn clipboard;
- mã băm nội dung;
- loại báo cáo và chuyên đề đích;
- số dòng mới, trùng, lỗi;
- trạng thái `VALIDATED`, `COMMITTED`, `FAILED`.

Mỗi sai sót tạo từ lô lưu `importBatchId`, `importedByUserId`, `importedByName`, `importedAt` và `importSourceType`. Nhật ký không chứa nội dung tệp đầy đủ hoặc bí mật.

### 2.5. Bóc tách DOCX

- Ưu tiên bảng có hàng tiêu đề chứa các tên tương đương `CIF`, `Khách hàng`, `Mã lỗi`, `Chi nhánh`, `Số quyết định`.
- Cho phép một hàng chứa nhiều mã lỗi, tách theo dấu phẩy, chấm phẩy hoặc xuống dòng.
- Nếu không tìm thấy bảng có cấu trúc đủ tin cậy, trả lỗi có hướng dẫn; không suy diễn bằng AI và không ghi dữ liệu.
- Kết quả DOCX vẫn đi qua cùng validator, dedupe, preview và commit như Excel.

### 2.6. Nhập người dùng theo lô

Chỉ `ADMIN` được sử dụng. Giao diện nằm trong Quản trị > Người dùng và có bốn bước: tải mẫu, tải lên, xem trước, xác nhận.

Workbook mẫu `.xlsx` gồm:

- `NGUOI_DUNG`: vùng nhập liệu có bộ lọc và dropdown.
- `DANH_MUC`: nguồn dropdown cho cổng, vai trò, trạng thái, đơn vị/nhóm và chi nhánh; được tạo từ dữ liệu đang hoạt động tại thời điểm tải mẫu.
- `HUONG_DAN`: giải thích cột bắt buộc, phạm vi từng vai trò, ví dụ hợp lệ và lưu ý Google OIDC cấu hình thủ công.

Cột dữ liệu:

- `Tên đăng nhập*`
- `Họ và tên*`
- `Email*`
- `Mật khẩu tạm`
- `Cổng*` (`INTERNAL` hoặc `BRANCH`)
- `Vai trò chính*`
- `Vai trò bổ sung`
- `Vai trò CoPlus`
- `Mã đơn vị/nhóm nội bộ`
- `Mã chi nhánh`
- `Phòng/PGD`
- `Trạng thái*`
- `Ghi chú`

Quy tắc bảo mật:

- Mật khẩu có thể để trống; server sinh mật khẩu tạm đủ mạnh.
- Nếu có mật khẩu trong Excel, chỉ giữ trong bộ nhớ đủ thời gian validate/hash; không lưu tệp gốc, không log, không ghi audit và không trả lại ở API xem trước.
- Xem trước chỉ hiển thị `Đã cung cấp` hoặc `Tự sinh`.
- Kết quả xác nhận cho tải **một lần** workbook thông tin đăng nhập của tài khoản vừa tạo. Server không thể đọc lại mật khẩu sau khi đã hash.
- Username và email được so sánh không phân biệt hoa thường, cả trong lô và với dữ liệu hiện có. Trùng là lỗi; không cập nhật tài khoản hiện có một cách ngầm định.
- Mỗi tài khoản phải vượt qua cùng `CreateUserSchema` và kiểm tra phạm vi như tạo đơn lẻ.
- Google OAuth/OIDC không được tự thêm “test user” hay tự cấu hình Google Cloud. Email trong AuditBGS phải khớp email Google; cấu hình consent screen/client/redirect URI vẫn là thao tác quản trị thủ công.

### 2.7. API dự kiến cho Nhập dữ liệu

- `POST /api/v1/imports/findings/validate`: nhận nguồn và đích, trả token xem trước ngắn hạn cùng kết quả từng dòng.
- `POST /api/v1/imports/findings/commit`: nhận preview token và `Idempotency-Key`, ghi các dòng hợp lệ.
- `GET /api/v1/imports/:id/rejections.xlsx`: tải dòng lỗi/trùng.
- `GET /api/v1/admin/users/import-template.xlsx`: sinh mẫu user theo danh mục hiện hành.
- `POST /api/v1/admin/users/imports/validate`: validate workbook, không ghi.
- `POST /api/v1/admin/users/imports/commit`: tạo tài khoản hợp lệ theo token xem trước và idempotency key.
- `GET /api/v1/admin/users/imports/:id/credentials.xlsx`: tải thông tin đăng nhập một lần.
- `GET /api/v1/admin/users/imports/:id/rejections.xlsx`: tải lỗi theo dòng.

Token xem trước có thời hạn, gắn với người tạo, mã băm payload và đích nhập. Người khác hoặc payload/đích khác không được dùng token đó.

## 3. Cognos-lite

Cognos-lite là giai đoạn độc lập, chỉ bắt đầu sau nghiệm thu mục 2. Phiên bản đầu không sao chép toàn bộ IBM Cognos; nó cung cấp tập chức năng tự phục vụ phù hợp AuditBGS.

### 3.1. Nguồn dữ liệu chuẩn

- Dùng mô hình semantic cố định do hệ thống công bố, không cho người dùng chạy SQL tùy ý.
- Dataset đầu tiên gồm khách hàng, sai sót, chi nhánh/PGD, cán bộ quản lý, loại báo cáo, chuyên đề, trạng thái workflow, SLA và người nhập.
- Trường có nhãn tiếng Việt, kiểu dữ liệu, phép tổng hợp mặc định, quyền truy cập và quan hệ rõ ràng.

### 3.2. Trình dựng báo cáo

- Chọn cột, bộ lọc, sắp xếp và điều kiện `ALL/ANY`.
- Group nhiều cấp và metric `COUNT`, `COUNT DISTINCT`, `SUM`, `AVG`, `MIN`, `MAX` trên trường phù hợp.
- Bảng chi tiết và bảng chéo/pivot với hàng, cột, số đo và tổng cộng.
- Trường tính toán giới hạn từ danh sách hàm an toàn; không thực thi mã tùy ý.
- Biểu đồ cột, thanh, đường, tròn và KPI; hệ thống tự chặn cấu hình không tương thích kiểu dữ liệu.
- Drill từ số tổng hợp xuống danh sách hồ sơ trong phạm vi quyền hiện tại.

### 3.3. Lưu, chia sẻ và dashboard

- Lưu báo cáo cá nhân hoặc chia sẻ theo quyền.
- Dashboard gồm nhiều widget báo cáo, bộ lọc chung và bố cục responsive.
- Sao chép phiên bản trước khi sửa báo cáo chia sẻ.
- Xuất XLSX/CSV/HTML; PDF chỉ bổ sung khi bố cục in được nghiệm thu.
- Lập lịch gửi báo cáo không nằm trong Cognos-lite v1; chỉ thiết kế điểm mở rộng, tránh kéo theo worker/email/outbox chưa có bằng chứng production.

### 3.4. An toàn và hiệu năng

- Mọi truy vấn tái sử dụng data scope/RBAC hiện tại; không tin bộ lọc từ client để quyết định quyền.
- Giới hạn số dòng xem trước, thời gian truy vấn, số nhóm và độ phức tạp trường tính.
- Xuất dữ liệu lớn chạy qua job có trạng thái; bản v1 có thể giới hạn kích thước và trả lỗi rõ ràng thay vì giữ request vô hạn.
- Không ghi dữ liệu vận hành từ báo cáo.

## 4. Mô hình dữ liệu bổ sung

- Mở rộng `ImportBatch` với đích, nguồn, hash, trạng thái và thống kê validate/commit.
- Mở rộng `Finding` bằng các trường provenance nêu ở mục 2.4.
- Thêm `ImportPreview` hoặc kho staging có TTL, ràng buộc người dùng/hash/đích.
- Thêm `UserImportBatch` và bản ghi lỗi theo dòng; không có cột mật khẩu thô.
- Cognos-lite thêm `SemanticDataset`, `ReportDefinition`, `DashboardDefinition`, `ReportVersion` và quyền chia sẻ. Trường cấu hình phức hợp dùng schema versioned và được Zod validate trước khi lưu/chạy.

## 5. Xử lý lỗi và trải nghiệm

- Lỗi theo dòng chứa số dòng, tên cột, mã lỗi ổn định và thông báo tiếng Việt có thể sửa.
- UI không mất lựa chọn đích khi người dùng sửa nguồn.
- Tải lại trang sau validate không tự commit.
- Commit thành công hiển thị mã lô và liên kết tới nhật ký; commit một phần hiển thị chính xác số đã tạo/bỏ qua.
- Tệp lỗi giữ nguyên cột nguồn và thêm `Trạng thái nhập`, `Mã lỗi`, `Chi tiết lỗi`.
- Mobile ưu tiên thẻ tổng hợp và bảng lỗi cuộn ngang; hành động xác nhận luôn cho thấy số dòng sẽ ghi.

## 6. Nghiệm thu Nhập dữ liệu

Giai đoạn Nhập dữ liệu chỉ hoàn tất khi có bằng chứng:

1. Không thể nhập khi chưa chọn loại báo cáo và chuyên đề hợp lệ.
2. Excel nhiều tệp, ZIP, clipboard và DOCX đều đi qua preview trước commit.
3. Hai dòng clipboard giống nhau chỉ tạo một sai sót; dòng còn lại được báo trùng.
4. Gửi lại cùng idempotency key không tạo thêm dữ liệu.
5. Mỗi sai sót và lô thể hiện đúng người nhập, thời điểm và nguồn.
6. Người dùng không có quyền không thể nhập vào chi nhánh/chuyên đề ngoài scope.
7. Mẫu user có dropdown và hướng dẫn; workbook được kiểm tra dữ liệu, công thức, bố cục và render trước khi phát hành.
8. Nhập user theo lô phát hiện trùng username/email, không log mật khẩu, và chỉ ADMIN truy cập được.
9. Google OIDC tiếp tục đăng nhập bằng email khớp; không có tuyên bố tự cấu hình Google.
10. Unit, integration, contract, typecheck/build và migration dry-run đều đạt; smoke local chứng minh ít nhất một lô dữ liệu và một lô user.

## 7. Nghiệm thu Cognos-lite v1

1. Dataset semantic áp đúng RBAC/scope ở server.
2. Tạo được bảng chi tiết, bảng nhóm, pivot và ít nhất ba loại biểu đồ.
3. Bộ lọc chi nhánh, cán bộ quản lý, chuyên đề, trạng thái, SLA và người nhập cho kết quả đúng.
4. Lưu/mở/sao chép/chia sẻ báo cáo đúng quyền.
5. Dashboard nhiều widget dùng được trên desktop/mobile.
6. Xuất XLSX/CSV/HTML khớp kết quả đang lọc và không vượt scope.
7. Test tải/ngưỡng bảo vệ trả lỗi có kiểm soát khi truy vấn vượt giới hạn.

## 8. Ngoài phạm vi hiện tại

- Tự động cấu hình Google Cloud OAuth consent screen, test user hoặc redirect URI.
- Chạy SQL tùy ý từ trình dựng báo cáo.
- AI tự suy diễn cấu trúc DOCX không chuẩn.
- OCR PDF tự do cho dữ liệu sai sót.
- Lập lịch gửi báo cáo production khi outbox/email worker chưa được chứng minh.
- Deploy, push hoặc thay đổi dịch vụ bên ngoài nếu chưa có yêu cầu phát hành riêng.
