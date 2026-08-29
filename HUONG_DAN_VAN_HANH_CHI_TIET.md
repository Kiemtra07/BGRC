# AuditBGS — Hướng dẫn vận hành

> Tài liệu dành cho Admin và người phụ trách vận hành nghiệp vụ hằng ngày.
> Đây là tài liệu vận hành (tách riêng với [Hướng dẫn sử dụng](./HUONG_DAN_SU_DUNG.md)). Phiên bản 2.0 · Cập nhật 29/08/2026

Tài liệu này mô tả việc chuẩn bị cấu hình, điều phối hồ sơ, kiểm tra SLA, quản lý minh chứng, xử lý sự cố và nghiệm thu. Phần cài đặt hạ tầng sâu (Supabase, Vercel, Google OAuth) xem [Sổ tay cài đặt/cấu hình](./docs/HUONG_DAN_CAI_DAT_SU_DUNG_VAN_HANH_AUDITBGS.md).

## 1. Lưu đồ vận hành chuẩn

![Lưu đồ vận hành AuditBGS](./luu_do_van_hanh_chi_tiet.png)

*Hình 1 — Lưu đồ dùng khi hướng dẫn người dùng và kiểm tra hồ sơ: nhập liệu → staging → chi nhánh khắc phục → kiểm soát/lãnh đạo (nếu có) → phê duyệt HT; nhánh đỏ là trả bổ sung.*

Mở [bản Markdown có trạng thái và Mermaid](./LUU_DO_VAN_HANH_CHI_TIET.md) hoặc [bản Draw.io chỉnh sửa được](./LUU_DO_VAN_HANH_CHI_TIET.drawio) khi cần trình chiếu, chỉnh sửa hay xuất lại ảnh.

## 2. Checklist đầu ca

1. Kiểm tra người trực, vai trò và phạm vi dữ liệu của các nhóm xử lý.
2. Kiểm tra trạng thái `/api/v1/ready` và log runtime theo môi trường.
3. Mở **Hồ sơ khách hàng**, lọc **Quá hạn** và **Cần bổ sung**.
4. Kiểm tra hàng đợi **Chờ kiểm soát**, **Chờ lãnh đạo CN** và **Chờ phê duyệt HT**.
5. Kiểm tra lỗi upload, lỗi thông báo và các hồ sơ bị treo từ ngày trước.
6. Không xóa audit log, không sửa `workflowStatus` trực tiếp trong dữ liệu.

## 3. Vai trò và trách nhiệm vận hành

| Vai trò | Trách nhiệm |
|---|---|
| `ADMIN` | Quản lý user, đơn vị, chuyên đề, loại báo cáo, form, workflow, SLA, tích hợp và nhật ký. |
| `INTERNAL_OFFICER` | Nạp dữ liệu, kiểm tra staging, tạo hồ sơ và theo dõi tiến độ. |
| `BRANCH_INPUT` | Khắc phục, giải trình, quản lý minh chứng trước khi nộp. |
| `BRANCH_CONTROLLER` | Kiểm tra đủ từng mã lỗi; chuyển tiếp hoặc trả bổ sung. |
| `BRANCH_LEADER` | Duyệt tuyến có bước lãnh đạo chi nhánh. |
| `SUPERVISOR` / `INTERNAL_APPROVER` | Phê duyệt cuối, đóng lỗi hoặc trả hồ sơ. |

Phạm vi `ALL`, `CLUSTER`, `BRANCH`, `DEPARTMENT` được kiểm tra ở API. Cụm chỉ phục vụ địa bàn/lọc, không tự tạo thêm cấp duyệt.

## 4. Cấu hình trước khi chạy nghiệp vụ

### 4.1 Cơ cấu tổ chức và người dùng

1. Vào **Quản trị → Cơ cấu tổ chức**, kiểm tra nhóm nội bộ, cụm, chi nhánh và phòng/PGD.
2. Vào **Quản trị → Người dùng**, tạo hoặc mời tài khoản bằng email thật.
3. Gán đúng vai trò và phạm vi; kiểm tra người dùng chi nhánh không nhìn thấy dữ liệu ngoài phạm vi.
4. Khi nhân sự nghỉ/chuyển vị trí, khóa hoặc thu hồi quyền trước khi thay đổi phân công.

![Quản trị người dùng](./docs/assets/huong-dan/01-quan-tri-nguoi-dung.png)

*Hình 2 — Người dùng phải có vai trò, trạng thái hoạt động và phạm vi phù hợp trước khi nhận hồ sơ.*

![Cơ cấu tổ chức](./docs/assets/huong-dan/02-co-cau-to-chuc.png)

*Hình 3 — Cơ cấu tổ chức là nguồn để phân quyền và lọc báo cáo; không dùng “cụm” như một cấp phê duyệt.*

### 4.2 Tạo và điều phối chuyên đề

Vào **Quản trị → Chuyên đề**:

1. Tạo mã, tên, quyết định, thời gian, trưởng đoàn, thành viên, chi nhánh và loại báo cáo.
2. Có thể nhập DOCX, PDF hoặc Excel để tạo bản nháp; luôn kiểm tra lại trường được bóc tách.
3. Lưu nháp, rà soát phân công rồi chuyển **Đang chạy**.
4. Chỉ bấm **Tạo kho dữ liệu Drive** khi credential, folder gốc và quyền ACL đã sẵn sàng.
5. Khi chuyên đề có hồ sơ, không xóa vật lý; chuyển trạng thái hoặc lưu trữ theo quy trình.

![Quản trị chuyên đề](./docs/assets/huong-dan/03-chuyen-de.png)

*Hình 4 — Chuyên đề có thể tạo thủ công hoặc từ tệp, nhưng bản nháp luôn phải được người phụ trách xác nhận.*

### 4.3 Cấu hình loại báo cáo và tuyến duyệt

Vào **Quản trị → Loại báo cáo**:

1. Khai báo mã, tên, đơn vị chủ quản và kênh nhập.
2. Thiết kế form theo block; đặt trường bắt buộc, kiểu dữ liệu, dropdown và cột xuất.
3. Chọn `CASE_REVIEW`, `EXCEL_GRID` hoặc `FORM_ONLY`.
4. Chọn chính sách minh chứng.
5. Chọn tuyến `ONE_TIER`, `TWO_TIER` hoặc `THREE_TIER`:
   - `ONE_TIER`: Chi nhánh → Phê duyệt HT.
   - `TWO_TIER`: Chi nhánh → Kiểm soát chi nhánh → Phê duyệt HT.
   - `THREE_TIER`: Chi nhánh → Kiểm soát chi nhánh → Lãnh đạo chi nhánh → Phê duyệt HT.
6. Cấu hình SLA, thông báo, tích hợp và nút hành động.
7. Lưu **phiên bản mới**, mở hồ sơ mẫu kiểm tra rồi mới áp dụng rộng.

![Cấu hình luồng phê duyệt](./docs/assets/huong-dan/07-luong-phe-duyet.png)

*Hình 5 — Màn hình cấu hình thể hiện ba lựa chọn tuyến; phiên bản mới chỉ áp dụng cho hồ sơ tạo sau khi lưu.*

Không đổi luật của hồ sơ đang xử lý. Loại báo cáo đã có dữ liệu thì tạm ngừng thay vì xóa.

### 4.4 Nhật ký và trường báo cáo

- **Trường báo cáo**: bật/tắt hiển thị, cho phép lọc, xuất mặc định và thứ tự cột.
- **Nhật ký**: lọc theo sự kiện, người thao tác, CIF hoặc mã lỗi; xuất CSV khi cần kiểm toán.
- Production giữ audit log append-only; không xóa bằng giao diện hoặc sửa thẳng dữ liệu.

![Nhật ký xử lý](./docs/assets/huong-dan/04-nhat-ky.png)

*Hình 6 — Nhật ký là bằng chứng vận hành; cần lưu bản xuất theo lịch của đơn vị.*

## 5. Nhập dữ liệu và kiểm tra staging

1. Chọn **Nạp dữ liệu**, loại báo cáo và chuyên đề.
2. Nhận dữ liệu từ nhiều Excel, ZIP chứa Excel, dán từ Excel, DOCX hoặc biểu mẫu web.
3. Kiểm tra mapping cột, kiểu dữ liệu, mã chi nhánh, chuyên đề, mã lỗi và dòng trùng.
4. Không commit khi còn dòng bắt buộc lỗi hoặc sai phạm vi.
5. Sau commit, đối chiếu số khách hàng, số mã lỗi và audit event; không nạp lại cùng một lô nếu chưa kiểm tra khóa trùng.

### 5.1 Quy tắc DOCX

- Tệp DOCX finding cần bảng có **Tên khách hàng, CIF, Mã chi nhánh, Mã sai sót**.
- Tệp DOCX/PDF/Excel dùng để tạo chuyên đề chỉ tạo **bản nháp**; Admin phải xác nhận trước khi lưu.
- Tệp vượt giới hạn an toàn hoặc sai cấu trúc phải trả về người nhập để chuẩn hóa, không bỏ qua cảnh báo.

## 6. Điều phối vòng đời hồ sơ

| Từ trạng thái | Điều kiện và nút | Sang trạng thái |
|---|---|---|
| `PENDING` / `REJECTED` | Chi nhánh nhập đủ nội dung, minh chứng (nếu bắt buộc), bấm gửi | `SUBMITTED_BRANCH`, `SUBMITTED_BRANCH_LEADER` hoặc `SUBMITTED_INTERNAL` theo phiên bản tuyến |
| `SUBMITTED_BRANCH` | Kiểm soát đạt và bấm chuyển | `SUBMITTED_INTERNAL` hoặc `SUBMITTED_BRANCH_LEADER` |
| `SUBMITTED_BRANCH` | Kiểm soát chưa đạt, ghi lý do và trả | `REJECTED` |
| `SUBMITTED_BRANCH_LEADER` | Lãnh đạo chi nhánh duyệt | `SUBMITTED_INTERNAL` |
| `SUBMITTED_BRANCH_LEADER` | Lãnh đạo chi nhánh trả, ghi lý do | `REJECTED` |
| `SUBMITTED_INTERNAL` | Phê duyệt HT đủ điều kiện, nhập số quyết định/công văn nếu cần | `WAIVED_RESOLVED` |
| `SUBMITTED_INTERNAL` | Phê duyệt HT chưa đủ điều kiện, ghi lý do và trả | `REJECTED` |

Mọi lệnh chuyển bước phải đi qua API, kiểm tra vai trò/phạm vi, version lạc hậu và ghi audit event. Không chỉnh trạng thái bằng SQL hoặc local JSON bằng tay.

## 7. Minh chứng và Google Drive

- Cho phép PDF, DOCX, XLSX, JPG, PNG; tối đa 25 MB/tệp và phải đúng MIME type.
- Chi nhánh chỉ thêm/thu hồi/thay thế tệp ở `PENDING` hoặc `REJECTED`; sau khi nộp, tệp bị khóa ở cấp chi nhánh.
- Mỗi tệp phải có checksum, kích thước, người tải, thời điểm và phiên bản.
- Local `data/drive_storage` chỉ dành cho phát triển/UAT. Production chỉ đạt khi upload/stream Google Drive thật được kiểm tra end-to-end.
- Khi Drive sẵn sàng, cây thư mục chuẩn là `CHUYEN_DE/KHACH_HANG/CIF_TEN/LOI_MA_LOI`; ACL cấp theo email/phân công, không chia sẻ công khai.

![Thư mục Google Drive cá nhân](./docs/assets/huong-dan/09-google-drive-ca-nhan.png)

*Hình 7 — Tài khoản OAuth phải có quyền chỉnh sửa thư mục gốc; service account cần Shared Drive theo cấu hình adapter.*

## 8. SLA, thông báo và giám sát

- `ON_TRACK`: còn trên 3 ngày; `DUE_SOON`: còn 1–3 ngày; `OVERDUE`: đã quá hạn; `CLOSED`: hồ sơ đã đóng.
- Worker mặc định chạy lúc 08:30 `Asia/Ho_Chi_Minh`; chỉ cập nhật `slaStatus`, không cập nhật `workflowStatus`.
- Kiểm tra outbox, retry và chống gửi trùng khi thông báo được bật.
- Gia hạn phải lưu người duyệt, lý do, hạn cũ, hạn mới và audit event.
- Mỗi ngày rà soát hồ sơ quá hạn, lỗi Drive, lỗi email và hàng đợi phê duyệt.

## 9. Báo cáo và bàn giao

- Báo cáo phải được chạy trong đúng phạm vi của người xem; không dùng tài khoản Admin để suy ra số liệu của chi nhánh.
- Kiểm tra bộ lọc, mẫu chia sẻ, bảng chéo và file xuất trước khi gửi.
- Khi bàn giao ca, ghi rõ hồ sơ chờ xử lý, hồ sơ bị trả, lỗi tích hợp, lần chạy SLA gần nhất và việc cần theo dõi.

## 10. Xử lý sự cố nhanh

| Hiện tượng | Kiểm tra trước | Cách xử lý |
|---|---|---|
| Không đăng nhập được | Email, trạng thái user, OIDC/Supabase Auth | Không tạo tài khoản trùng; Admin kiểm tra log và cấp lại/reset đúng quy trình. |
| Không thấy hồ sơ | `branchCode`, phòng ban, vai trò, chuyên đề, trạng thái | Sửa phân công/phạm vi bằng giao diện quản trị, không sửa dữ liệu gốc trực tiếp. |
| Không gửi được | Trường bắt buộc, minh chứng, từng mã lỗi, version hồ sơ | Bổ sung dữ liệu hoặc yêu cầu cấp trước trả hồ sơ. |
| Không sửa được tệp | Hồ sơ đã rời `PENDING`/`REJECTED` | Chờ cấp duyệt trả về; không xóa tệp trong kho bằng tay. |
| Drive chưa sẵn sàng | Credential, root folder, ACL, `/api/v1/ready` | Dừng nghiệm thu upload production, sửa env/quyền rồi redeploy và thử lại. |
| SLA không cập nhật | Cron, `CRON_SECRET`, database, timezone | Kiểm tra job/log; không sửa `slaStatus` hay `workflowStatus` trực tiếp. |
| Số liệu báo cáo bất thường | Bộ lọc, quyền, phiên bản trường và dữ liệu nguồn | Chụp bộ lọc, xuất audit, tái hiện bằng tài khoản đúng phạm vi. |

## 11. Lịch vận hành

### Hằng ngày

- Kiểm tra `/api/v1/health` và `/api/v1/ready` theo môi trường.
- Kiểm tra hàng đợi `SUBMITTED_BRANCH`, `SUBMITTED_BRANCH_LEADER`, `SUBMITTED_INTERNAL`, `REJECTED`.
- Kiểm tra SLA quá hạn, outbox/thông báo, Drive và lỗi runtime.

### Hằng tuần

- Xuất nhật ký kiểm toán lưu trữ riêng.
- Rà soát user nghỉ/chuyển vị trí, phạm vi chi nhánh và quyền tối thiểu.
- Kiểm tra dung lượng/quyền folder Drive và các hồ sơ có minh chứng lỗi.

### Hằng tháng

- Rà soát loại báo cáo, form, workflow, SLA và phiên bản đang dùng.
- Thử backup/restore trên môi trường kiểm thử; xoay secret theo chính sách.
- Chọn một hồ sơ đã đóng để kiểm tra lại audit trail, minh chứng và file xuất.

## 12. Checklist nghiệm thu sau thay đổi

- [ ] Migration dry-run và typecheck đạt.
- [ ] Kiểm tra nạp Excel, ZIP, dán từ Excel và DOCX.
- [ ] Kiểm tra luồng `ONE_TIER`, `TWO_TIER` và `THREE_TIER`/trường hợp đặc biệt.
- [ ] Kiểm tra trả bổ sung ở kiểm soát, lãnh đạo chi nhánh và Hội sở.
- [ ] Kiểm tra minh chứng đúng MIME, giới hạn 25 MB, khóa sau khi nộp và thay thế sau khi trả.
- [ ] Kiểm tra SLA độc lập với workflow và thông báo không gửi trùng.
- [ ] Kiểm tra báo cáo theo phạm vi người dùng và xuất CSV/XLSX/HTML.
- [ ] Kiểm tra audit log có người, vai trò, thời điểm, trước/sau và lý do.
- [ ] Nếu production dùng Google Drive, kiểm tra upload, stream, checksum và ACL thật.

## 13. Tài liệu liên quan

- [Hướng dẫn sử dụng](./HUONG_DAN_SU_DUNG.md) — thao tác từng vai trò.
- [Lưu đồ vận hành](./LUU_DO_VAN_HANH_CHI_TIET.md) — nguồn trạng thái và sơ đồ chuẩn.
- [Bản Draw.io](./LUU_DO_VAN_HANH_CHI_TIET.drawio).
- [Sổ tay cài đặt/cấu hình production](./docs/HUONG_DAN_CAI_DAT_SU_DUNG_VAN_HANH_AUDITBGS.md).
- [Hướng dẫn deploy](./HUONG_DAN_DEPLOY.md).
