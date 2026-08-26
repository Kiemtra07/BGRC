# Hướng dẫn vận hành AuditBGS

> Dùng cho bản hiện tại ngày 25/08/2026. Thuật ngữ trên màn hình là nguồn tham chiếu: **Kiểm soát chi nhánh**, **Chuyển phê duyệt HT**, **Trả chi nhánh bổ sung**, **Đóng lỗi**.

## 1. Nhóm người dùng

| Nhóm | Vai trò | Công việc chính |
|---|---|---|
| Quản trị | `ADMIN` | Người dùng, đơn vị, chuyên đề, loại báo cáo, form, luồng, SLA, tích hợp, audit |
| Cán bộ kiểm tra | `INTERNAL_OFFICER` | Nạp dữ liệu, tạo hồ sơ, theo dõi chuyên đề |
| Lãnh đạo/Phê duyệt HT | `SUPERVISOR`, `INTERNAL_APPROVER` | Phê duyệt đóng lỗi hoặc trả chi nhánh |
| Cán bộ chi nhánh | `BRANCH_INPUT` | Tiếp nhận, khắc phục, giải trình, tải tài liệu, gửi duyệt |
| Kiểm soát chi nhánh | `BRANCH_CONTROLLER` | Kiểm tra từng ý sai sót, chuyển phê duyệt HT hoặc trả bổ sung |

Cụm là phạm vi địa bàn và báo cáo, không phải một cấp duyệt.

## 2. Admin chuẩn bị trước khi vận hành

### Tạo chuyên đề

Vào **Quản trị → Chuyên đề**:

1. Nhập mã, tên, quyết định, thời gian.
2. Chọn trưởng đoàn và thành viên.
3. Chọn chi nhánh được kiểm tra và loại báo cáo sử dụng.
4. Lưu nháp, kiểm tra phân công rồi chuyển sang **Đang thực hiện**.
5. Nếu đã cấu hình Apps Script, bấm **Tạo kho dữ liệu**; chỉ tin trạng thái `READY` khi tạo folder và ACL đều thành công.

### Tạo hoặc sửa loại báo cáo

Vào **Quản trị → Loại báo cáo**:

1. Khai báo thông tin và đơn vị chủ quản.
2. Chọn cách nhập: form, Excel hoặc API.
3. Thiết kế form bằng block; chọn cách hiển thị `CASE_REVIEW`, `EXCEL_GRID` hoặc `FORM_ONLY`.
4. Chọn có/không yêu cầu đính kèm.
5. Chọn luồng:
   - **Luồng kiểm soát**: Chi nhánh → Kiểm soát chi nhánh → Phê duyệt HT.
   - **Luồng gọn**: Chi nhánh → Phê duyệt HT.
6. Cấu hình SLA và thông báo.
7. Xem trước màn hình người dùng rồi lưu phiên bản.

Không đổi phiên bản của hồ sơ đã tạo. Loại báo cáo đang có dữ liệu phải tạm ngừng thay vì xóa.

## 3. Cán bộ kiểm tra tạo hồ sơ

### Nhập từ Excel

1. Mở **Nạp dữ liệu** và chọn loại báo cáo/chuyên đề.
2. Chọn nhiều file Excel, tệp ZIP, dán dữ liệu hoặc dùng dữ liệu mẫu.
3. Kiểm tra mapping cột, dropdown, kiểu dữ liệu và lỗi từng dòng.
4. Chỉ xác nhận khi số dòng hợp lệ, chi nhánh và chuyên đề đúng phạm vi.
5. Hệ thống bỏ qua bản ghi trùng theo khóa nghiệp vụ và tạo hồ sơ `PENDING`.

### Nhập bằng form

1. Chọn **Tạo hồ sơ**.
2. Chọn chuyên đề, loại báo cáo và chi nhánh.
3. Nhập CIF, khách hàng, mã lỗi, nội dung và các trường động.
4. Lưu để tạo hồ sơ `PENDING` và ghim phiên bản cấu hình.

## 4. Cán bộ chi nhánh xử lý

1. Đăng nhập và mở **Hồ sơ khách hàng**.
2. Có thể bấm **Tiếp nhận công việc**, **Theo dõi** hoặc đánh dấu sao **Ưu tiên giám sát**; ba trạng thái này độc lập.
3. Chọn mã lỗi cần xử lý.
4. Khắc phục thực tế và nhập giải trình tối thiểu theo yêu cầu màn hình.
5. Nếu loại báo cáo yêu cầu tài liệu, tải PDF/DOCX/XLSX/JPG/PNG tối đa 25 MB/tệp.
6. Có thể thu hồi tài liệu sai và tải bản thay thế khi hồ sơ còn `PENDING` hoặc `REJECTED`.
7. Bấm gửi duyệt:
   - Luồng kiểm soát chuyển sang `SUBMITTED_BRANCH`.
   - Luồng gọn chuyển thẳng sang `SUBMITTED_INTERNAL`.

Khi hồ sơ đã nộp, chi nhánh không được thay tài liệu cho tới khi hồ sơ được trả về.

## 5. Kiểm soát chi nhánh

Áp dụng cho hồ sơ `SUBMITTED_BRANCH`:

1. Mở hồ sơ và kiểm tra giải trình/tài liệu.
2. Đánh giá đầy đủ từng ý sai sót; không được bỏ sót ý.
3. Nếu đạt, bấm **Chuyển phê duyệt HT** → `SUBMITTED_INTERNAL`.
4. Nếu chưa đạt, nhập lý do tối thiểu theo màn hình rồi bấm **Trả chi nhánh bổ sung** → `REJECTED`.

Kiểm soát chi nhánh chỉ thao tác hồ sơ trong phạm vi chi nhánh được cấp.

## 6. Phê duyệt HT

Áp dụng cho hồ sơ `SUBMITTED_INTERNAL`:

1. Đối chiếu nội dung sai sót, từng ý đánh giá, giải trình và tài liệu.
2. Nếu đủ điều kiện, nhập số quyết định/công văn và bấm **Đóng lỗi**.
3. Hồ sơ chuyển `WAIVED_RESOLVED`; SLA chuyển `CLOSED`.
4. Nếu chưa đạt, nhập lý do và bấm **Trả chi nhánh bổ sung** → `REJECTED`.

Hồ sơ bị trả phải được chi nhánh bổ sung và nộp lại theo đúng luồng một cấp/hai cấp đã ghim.

## 7. Theo dõi, ưu tiên và báo cáo

- **Tiếp nhận công việc**: đưa đối tượng vào danh sách đang làm.
- **Theo dõi**: nhận biết đối tượng cần quan sát lâu dài.
- **Ưu tiên giám sát**: đánh dấu sao và đưa lên đầu danh sách theo dõi; không thay đổi SLA hay quyền xử lý.
- Báo cáo cho phép lọc theo chuyên đề, loại báo cáo, đơn vị, trạng thái, SLA, CIF và mã lỗi.
- Có thể xuất HTML hoặc XLSX đầy đủ theo phạm vi được cấp.
- Trường báo cáo và chỉ số chỉ do Admin cấu hình; người xem báo cáo chỉ dùng bộ lọc cần thiết.

## 8. SLA

- `ON_TRACK`: còn trên 3 ngày.
- `DUE_SOON`: còn 1-3 ngày.
- `OVERDUE`: đã quá hạn.
- `CLOSED`: hồ sơ đã đóng.

Worker chạy 08:30 hằng ngày. SLA chỉ cảnh báo và sắp xếp ưu tiên, không tự đổi bước phê duyệt.

## 9. Kho tài liệu

### Local hiện tại

- Binary minh chứng nằm trong `data/drive_storage`.
- Chỉ dùng cho phát triển/UAT trên một máy; không dùng làm kho production.

### Google Drive mục tiêu

- Folder gốc do tài khoản quản trị sở hữu, không chia sẻ công khai hoặc toàn domain.
- Folder chuyên đề cấp quyền theo email thành viên/chi nhánh; email ngoài danh sách bị thu hồi.
- Cây: `CHUYEN_DE/KHACH_HANG/CIF_TEN/LOI_MA_LOI`.
- Apps Script hiện đã có cổng tạo folder và đồng bộ ACL; upload/stream binary thật vẫn phải hoàn tất trước production.

## 10. Xử lý tình huống

| Hiện tượng | Cách xử lý |
|---|---|
| Không bấm gửi duyệt được | Kiểm tra giải trình, tài liệu bắt buộc và từng ý sai sót |
| Không sửa/xóa tài liệu được | Hồ sơ đã nộp; cần cấp duyệt trả về chi nhánh |
| Không thấy hồ sơ | Kiểm tra chuyên đề, chi nhánh, vai trò và phạm vi dữ liệu |
| Xóa loại báo cáo bị từ chối | Loại báo cáo đang có dữ liệu; chuyển sang tạm ngừng |
| Kho Drive báo chưa cấu hình | Kiểm tra URL/secret Apps Script và folder root; không dùng fallback giả |
| Trạng thái SLA sai | Kiểm tra hạn xử lý và lần chạy worker 08:30; không sửa `workflowStatus` bằng tay |

## 11. Tài liệu liên quan

- `LUU_DO_VAN_HANH_CHI_TIET.md`: lưu đồ chuẩn.
- `HUONG_DAN_DEPLOY.md`: hạ tầng, database, deploy, backup và rollback.
- `integrations/google-apps-script/README.md`: cấu hình Drive.
- `PLANUPDATE.md`: trạng thái triển khai và việc còn lại.

