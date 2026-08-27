# AuditBGS — Hướng dẫn sử dụng

> Hệ thống quản lý và theo dõi khắc phục phát hiện kiểm tra – giám sát tuân thủ (KT&GSTT).
> Phiên bản tài liệu 1.0 · 27/08/2026

---

## 1. Giới thiệu

AuditBGS số hóa toàn bộ vòng đời một **phát hiện (finding)** từ khi ghi nhận đến khi khắc phục xong và được phê duyệt:

- **Nạp dữ liệu** phát hiện từ biên bản kiểm tra (Excel, và tiểu biên bản Word — xem mục 6).
- **Chi nhánh khắc phục**, đính kèm **minh chứng**.
- **Kiểm soát chi nhánh → Lãnh đạo chi nhánh → Hội sở (KT&GSTT)** duyệt theo luồng.
- Theo dõi **SLA/hạn xử lý**, cảnh báo quá hạn.
- **Báo cáo** tổng hợp, xuất Excel/HTML.

Hệ thống có **hai cổng**: cổng **Nội bộ (Hội sở/KT&GSTT)** và cổng **Chi nhánh**. Người dùng thấy chức năng theo đúng vai trò của mình.

---

## 2. Đăng nhập

- Truy cập địa chỉ hệ thống (vd `https://bgrc.vercel.app`).
- Đăng nhập bằng **tài khoản Google** của đơn vị (Google OIDC) hoặc bằng **tài khoản nội bộ** (tên đăng nhập + mật khẩu) tùy cấu hình.
- Sau khi đăng nhập, hệ thống hiển thị giao diện theo vai trò; nếu sai quyền, một số mục sẽ không xuất hiện.
- Quên mật khẩu / mất quyền: liên hệ **Quản trị viên Hội sở (ADMIN_HT)**.

---

## 3. Vai trò và phân quyền

Vai trò theo danh mục CoPlus, gom thành các nhóm quyền chính:

| Nhóm | Vai trò tiêu biểu | Làm được gì |
|---|---|---|
| Ban lãnh đạo | Ban lãnh đạo BIDV | Xem tổng hợp, giám sát |
| KT&GSTT (Hội sở) | Giám đốc/PGĐ/Cán bộ Ban KT&GSTT | Nạp dữ liệu, phê duyệt cuối (INTERNAL_APPROVER), giám sát |
| Hỗ trợ & giám sát | Cán bộ hỗ trợ chi nhánh, nhóm Giám sát/Tổng hợp | Nhập liệu chi nhánh (BRANCH_INPUT), kiểm soát chi nhánh (BRANCH_CONTROLLER) |
| Chi nhánh | Lãnh đạo chi nhánh | Duyệt cấp chi nhánh (BRANCH_LEADER) |
| Quản trị | ADMIN_HT | Cấu hình hệ thống, người dùng, loại báo cáo, SLA, workflow |

Quyền dữ liệu theo **phạm vi**: Toàn hệ thống / Theo cụm / Theo chi nhánh / Theo phòng ban — mỗi người chỉ thấy dữ liệu trong phạm vi được cấp.

---

## 4. Tổng quan giao diện

Thanh điều hướng chính có tối đa 4 mục (hiện theo quyền):

1. **Hồ sơ khách hàng** — danh sách và chi tiết các phát hiện, nơi xử lý nghiệp vụ hằng ngày.
2. **Nạp dữ liệu** — tải biên bản kiểm tra để tạo phát hiện (hiện với người có quyền nhập liệu).
3. **Báo cáo** — chạy và xuất báo cáo tổng hợp.
4. **Quản trị** — cấu hình hệ thống (chỉ Admin).

Trang chủ hiển thị các **chỉ số nhanh (KPI)**: tổng phát hiện, đang chờ khắc phục, quá hạn, đã hoàn tất…

---

## 5. Quy trình nghiệp vụ (vòng đời một phát hiện)

Trạng thái đi theo một chiều, mỗi bước có người phụ trách:

1. **Chờ chi nhánh khắc phục** (`PENDING`) — phát hiện vừa được nạp, giao về chi nhánh.
2. **Chi nhánh nộp** (`SUBMITTED_BRANCH`) — cán bộ chi nhánh nhập nội dung khắc phục + đính kèm minh chứng, bấm **Nộp**. Chuyển sang chờ **Kiểm soát chi nhánh**.
3. **Kiểm soát chi nhánh đồng ý** (`SUBMITTED_BRANCH_LEADER`) — người kiểm soát rà soát, đồng ý → chuyển **Lãnh đạo chi nhánh**.
4. **Lãnh đạo chi nhánh duyệt** → chuyển **Hội sở (KT&GSTT) phê duyệt**.
5. **Hội sở phê duyệt** → phát hiện **hoàn tất**. Nếu chưa đạt, người duyệt **trả lại** kèm lý do để chi nhánh làm lại.

> Hệ thống hỗ trợ **hai mẫu luồng** cấu hình theo từng loại báo cáo:
> - **1 cấp**: Chi nhánh khắc phục → Phê duyệt Hội sở.
> - **2 cấp**: Chi nhánh khắc phục → Kiểm soát chi nhánh → Phê duyệt Hội sở.

Mỗi lần chuyển bước đều được **ghi nhật ký (audit log)**: ai làm, khi nào, nội dung.

---

## 6. Nạp dữ liệu

Vào **Nạp dữ liệu**, chọn **Loại báo cáo** phù hợp rồi tải tệp. Hệ thống đưa dữ liệu vào **vùng tạm (staging)**, **kiểm tra hợp lệ**, hiển thị dòng lỗi để sửa, rồi mới **ghi nhận (commit)** thành phát hiện thật.

### 6.1 Nạp từ Excel (đang dùng)
- Tải file `.xlsx` biên bản kiểm tra.
- Hệ thống tự nhận: chi nhánh, số quyết định, ngày kiểm tra, cán bộ, cụm, phòng ban; và từng dòng khách hàng kèm **mã sai sót (TDxx)**, **mức độ rủi ro** (Cao/Trung bình/Thấp), **mảng nghiệp vụ** (tín dụng/phi tín dụng), **hạn xử lý** (nếu có trong file).
- Dòng thiếu/lỗi được đánh dấu; sửa hoặc bổ sung rồi commit.

### 6.2 Nạp từ Word — tiểu biên bản theo từng người (.doc/.docx)
- Dùng khi biên bản là **tiểu biên bản riêng của từng cán bộ/khách hàng** dạng văn bản Word thay vì bảng Excel.
- Tải file `.docx` (khuyến nghị) hoặc `.doc`; hệ thống trích xuất các trường (đối tượng, mã sai sót, nội dung, mức độ, hạn) và dựng phát hiện tương ứng, đưa vào cùng luồng staging → kiểm tra → commit như Excel.
- *(Tính năng đang được bổ sung — xem mục 12. Để bảo đảm bóc tách đúng, cần một tệp mẫu tiểu biên bản chuẩn.)*

### 6.3 Nhập tay qua biểu mẫu web
- Với phát hiện lẻ, dùng nút thêm phát hiện qua **biểu mẫu web** (Web Form) — nhập trực tiếp không cần tệp.

---

## 7. Xử lý hồ sơ và phát hiện

Tại **Hồ sơ khách hàng**:
- Tìm kiếm/lọc theo chi nhánh, trạng thái, mức độ, mã sai sót, hạn.
- Mở **chi tiết phát hiện** để xem thông tin, lịch sử xử lý, minh chứng và **thanh mã lỗi**.
- Nút **Tiếp nhận công việc** để nhận xử lý; **Theo dõi** để ghim phát hiện vào danh sách ưu tiên của mình.
- Nhập nội dung khắc phục và thực hiện hành động chuyển bước (**Nộp / Đồng ý / Duyệt / Trả lại**) theo vai trò.

---

## 8. Minh chứng (đính kèm tài liệu)

- Trong chi tiết phát hiện, khu vực **Minh chứng** cho phép tải tài liệu (ảnh, PDF, tệp).
- Tệp được **tải trực tiếp lên Google Drive** của hệ thống; hồ sơ chỉ lưu liên kết. Nhờ vậy tải được **file lớn** mà vẫn nhanh.
- Mỗi minh chứng có trạng thái (đang tải/khả dụng/lỗi) và được kiểm tra toàn vẹn (checksum).
- Nếu loại báo cáo cấu hình **không dùng minh chứng**, khu vực này được ẩn và hồ sơ chuyển bước bằng dữ liệu biểu mẫu.

---

## 9. SLA và hạn xử lý

- Mỗi phát hiện có **hạn xử lý (deadline)** lấy từ biên bản nguồn, hoặc tính theo cấu hình SLA của loại báo cáo.
- Trạng thái SLA hiển thị bằng **badge**: đúng hạn / sắp đến hạn / quá hạn.
- KPI **Quá hạn** trên trang chủ giúp theo dõi nhanh.
- Hệ thống tự đánh giá SLA **hằng ngày** (tự động lúc 08:30) và khi có thay đổi.

---

## 10. Báo cáo

Vào **Báo cáo**:
- Chọn **mẫu báo cáo**, chọn **"Xem theo"** (chiều phân tích), thêm **điều kiện lọc**, xem kết quả.
- **Lưu cách xem** để dùng lại nhanh.
- **Xuất Excel (.xlsx)** hoặc **HTML** từ nút trên giao diện.
- Cột hiển thị/chỉ số do **Quản trị** cấu hình để bảo đảm nhất quán; người xem tập trung vào lọc và xuất.

---

## 11. Quản trị (dành cho Admin Hội sở)

Mục **Quản trị** gồm:

- **Loại báo cáo** — trung tâm cấu hình: thông tin, **biểu mẫu động (CMS theo block)**, luồng phê duyệt (1/2 cấp), SLA, tích hợp Google Sheets/email. Mỗi lần sửa tạo **phiên bản mới**; hồ sơ cũ giữ nguyên luật theo phiên bản đã ghim.
- **Mẫu form** — dựng biểu mẫu nhập liệu theo block (tiêu đề, hướng dẫn, trường, nhóm, phân cách); có thể **tạo mẫu tự động từ file Excel**.
- **Trường báo cáo** — đổi tên hiển thị, bật/tắt, chọn cột xuất mặc định, sắp xếp.
- **Người dùng & vai trò** — tạo/khóa tài khoản, gán vai trò và phạm vi dữ liệu.
- **Workflow builder** — cấu hình các bước duyệt.
- **SLA / leo thang (escalation)** — đặt số ngày, mức cảnh báo.
- **Kênh/lịch email, nhật ký kiểm toán, danh mục mã lỗi**.

> Nguyên tắc an toàn: mã trường, kiểu dữ liệu và toán tử là **whitelist kỹ thuật**, không sửa qua giao diện để tránh phá truy vấn/quyền dữ liệu.

---

## 12. Ghi chú tính năng đang bổ sung

- **Nạp tiểu biên bản Word (.doc/.docx)** theo từng người: đang được phát triển; sẽ dùng chung luồng staging → kiểm tra → commit như Excel. Cần **tệp mẫu chuẩn** để bóc tách đúng các trường.

---

## 13. Câu hỏi thường gặp

**Không thấy mục "Nạp dữ liệu"/"Quản trị"?** — Do vai trò của bạn không có quyền đó; liên hệ Admin.

**Nộp khắc phục nhưng bị trả lại?** — Xem lý do trả lại trong lịch sử phát hiện, bổ sung rồi nộp lại.

**Tải minh chứng lớn bị lỗi?** — Kiểm tra kết nối Google Drive của hệ thống; báo Admin nếu trạng thái Drive "chưa sẵn sàng".

**Số liệu SLA có vẻ chưa cập nhật?** — SLA đánh giá tự động hằng ngày và khi có thay đổi; có thể chờ chu kỳ kế tiếp hoặc nhờ Admin chạy đánh giá lại.

**Dữ liệu tôi thấy khác đồng nghiệp?** — Do phạm vi dữ liệu (cụm/chi nhánh/phòng) khác nhau theo vai trò.

---

*Liên hệ hỗ trợ: Quản trị viên Hội sở (ADMIN_HT).*
