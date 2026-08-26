# Cổng Google Drive cho AuditBGS

Apps Script chạy bằng tài khoản quản trị sở hữu thư mục gốc. Web app có URL công khai để API AuditBGS gọi được, nhưng mọi lệnh đều bắt buộc chữ ký HMAC, thời hạn 5 phút và nonce chống phát lại. Không dùng URL này trực tiếp từ trình duyệt.

## Cài đặt

1. Tạo một thư mục Google Drive bằng tài khoản quản trị, không bật “Bất kỳ ai có liên kết” và không chia sẻ ở cấp domain.
2. Tạo dự án Apps Script, chép `AuditBGSDrive.gs` và `appsscript.json` vào dự án.
3. Trong **Services**, bật **Drive API**; trong Google Cloud project liên kết cũng bật Google Drive API.
4. Mở **Project Settings → Script Properties**, tạo:
   - `AUDIT_BGS_ROOT_FOLDER_ID`: ID thư mục gốc.
   - `AUDIT_BGS_HMAC_SECRET`: chuỗi bí mật ngẫu nhiên tối thiểu 32 byte.
5. Deploy dạng **Web app**:
   - Execute as: tài khoản triển khai/quản trị.
   - Who has access: Anyone. Đây chỉ là khả năng gọi endpoint; người gọi không có chữ ký hợp lệ vẫn bị từ chối.
6. Khai báo cùng URL và secret ở máy chủ AuditBGS:
   - `GOOGLE_APPS_SCRIPT_URL`
   - `GOOGLE_APPS_SCRIPT_SECRET`
7. Khai báo `googleWorkspaceEmail` cho từng tài khoản AuditBGS. Chỉ các email thuộc chuyên đề được cấp quyền trên folder chuyên đề.

## Quy tắc quyền

- Thư mục gốc chỉ do tài khoản quản trị sở hữu.
- Không cấp quyền `anyone` hoặc `domain`.
- Folder chuyên đề được đồng bộ theo đúng danh sách thành viên; quyền thừa bị thu hồi.
- Người ngoài danh sách không xem, không sửa và không tác động được.
- Cán bộ cần nộp minh chứng nhận quyền `writer`; người chỉ giám sát nhận `reader`.
- “Người chỉnh sửa có thể chia sẻ” được tắt khi loại Drive hỗ trợ; với Shared Drive phải khóa thêm ở chính sách quản trị Google Workspace.

## Cây thư mục

```text
THU_MUC_GOC/
  MA_CHUYEN_DE_TEN_CHUYEN_DE/
    QUYET_DINH/
    BAO_CAO/
    KHACH_HANG/
      CIF_TEN_KHACH_HANG/
        LOI_MA_LOI/
```

Nút **Tạo kho dữ liệu** trong AuditBGS chỉ báo “sẵn sàng” sau khi tạo folder và đồng bộ ACL đều thành công. Nếu thiếu cấu hình hoặc Google lỗi, hệ thống giữ trạng thái lỗi và không giả lập thành công.

