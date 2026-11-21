# Rà soát nâng cấp, lỗi, rủi ro lộ thông tin và tối ưu luồng

Ngày rà soát: 2026-11-21. Mã nguồn: nhánh `main` tại `d957276`.

## 1. Phạm vi và bằng chứng

Đã chạy lại trong phiên này:

| Kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` | Đạt |
| `npm test` | 400 unit, 169 integration, 3 contract, tất cả đạt |
| `npm run security:preflight` | Đạt, 558 file |
| `npm run security:audit` | 8 lỗ hổng phụ thuộc (5 high, 3 moderate), xem mục 5 |
| Dựng lại `api/index.mjs` | Trùng byte với bản đã commit |
| Probe `resolveApprovalRoute` | Tái hiện được lỗi L2 (mục 3) |

Chưa kiểm: PostgreSQL thật nhiều instance, RLS bằng token thật, Drive thật, backup/restore. Các kết luận "tĩnh" bên dưới đọc từ mã, ghi rõ khi đã có probe.

Đối chiếu với `planupp.md`: các mục F01, F02, F04, F05, F06 đã có trong mã đúng như mô tả. Mục F03 đánh dấu xong nhưng chỉ phủ phần chống dùng lại OTP; phần "OTP sai tới ngưỡng thì trả 429" chưa có (B1).

## 2. Rủi ro lộ thông tin và kiểm soát truy cập

| Mã | Mức | Vấn đề | Vị trí | Hướng xử lý |
|---|---|---|---|---|
| B1 | Cao | Nhập đúng mật khẩu, sai mã Authenticator không được tính vào bộ đếm khóa. Ai đã có mật khẩu (lộ, lừa nhập) có thể dò mã 6 số không giới hạn, chỉ bị chặn bởi trần 300 lượt/phút mỗi instance. Cả nhánh Supabase cũng vậy. | `server/src/app.ts:3676`, `:3602` | Gọi `recordLoginFailure` khi MFA sai, dùng chung khóa theo tên đăng nhập. Đếm cả mã dự phòng. |
| B2 | Cao | Ẩn trường theo vai trò (`hiddenForRoles`, `exportable`) chỉ áp ở danh mục, chạy và xuất. Ba đường vẫn trả dữ liệu cố định: `POST /reports/drill` (CIF, tên khách hàng, dư nợ, cán bộ), `GET /reports/findings.csv` (13 cột cố định, giao diện còn gọi đường này tại `src/services/api.ts:533`), `GET /reports/summary` và `/dashboards/summary` (tổng giá trị ảnh hưởng). Quản trị viên tắt trường cho một vai trò thì vai trò đó vẫn lấy được qua ba đường này. | `app.ts:3080`, `:7462`, `:7428`, `:7075` | Một hàm lọc cột và chỉ số theo vai trò, dùng cho cả ba. Hoặc bỏ `findings.csv` và `reports/summary` nếu màn hình mới đã thay thế. |
| B3 | Cao | Nháp giải trình ở lưới hồ sơ lưu trong `localStorage` với khóa chung cho mọi tài khoản, không xóa khi đăng xuất, không xóa sau khi gửi. Máy dùng chung ở chi nhánh: người đăng nhập sau thấy chữ của người trước điền sẵn vào cùng hồ sơ và có thể gửi đi dưới tên mình. | `src/components/reports/FindingGridWorkspace.tsx:27` | `sessionStorage`, khóa theo `userId`, xóa khi đăng xuất và khi gửi thành công. |
| B4 | Trung bình | Minh chứng bị thu hồi chỉ đổi trạng thái, tệp vẫn nằm trên Drive hoặc đĩa. Thư mục Drive được chia sẻ cho người thật (`SYNC_CAMPAIGN_ACL`), nên tệp "đã thu hồi" vẫn mở được ngoài ứng dụng. | `app.ts:6930` | Xóa hoặc chuyển tệp vào thư mục cách ly, rút ACL, ghi sự kiện. Có lịch dọn theo chính sách lưu giữ. |
| B5 | Trung bình | Bước xác thực lại (`/auth/step-up`) và đổi mật khẩu (`/auth/password`) không giới hạn số lần sai. Kẻ giữ được cookie phiên quản trị có thể dò mật khẩu hoặc mã OTP qua hai đường này. | `app.ts:3749`, `:3826` | Dùng chung bộ đếm sai với đăng nhập, khóa theo `userId`. |
| B6 | Trung bình | `reassign` chỉ chặn giao cho người nộp. Không chặn giao bước mới cho người đang giữ bước khác của cùng tuyến, trong khi bàn giao hàng loạt (`eligibleRecipientsForStage`) chặn. Hai đường cùng việc, hai luật khác nhau. | `app.ts:6363` | Dùng `eligibleRecipientsForStage` cho cả hai. |
| B7 | Trung bình | `resolveApprovalRoute` không kiểm tra một người giữ hai bước. Probe: người có cả vai trò Kiểm soát và Lãnh đạo được chọn cho cả hai bước (`{c:"dual", l:"dual"}`), và `eligibleRecipientsForStage` sau đó trả rỗng cho bước Lãnh đạo. Mất tách biệt người duyệt. | `server/src/modules/workflow/approval-assignment.ts:149` | Loại người đã giữ bước trước khỏi danh sách chọn bước sau, thiếu người thì dừng tuyến như hiện nay. |
| B8 | Trung bình | `GET /findings/:id/next-approvers` trả tên và phòng của người duyệt cho mọi người có quyền đọc hồ sơ, kể cả vai trò chỉ xem. | `app.ts:6174` | Chỉ trả khi người gọi có quyền chuyển bước hiện tại. |
| B9 | Trung bình | Chế độ Supabase: so khớp tài khoản theo email nhưng không kiểm tra email đã xác nhận (`email_confirmed_at`). Nếu đăng ký mở, người ngoài tạo tài khoản trùng email của một người dùng rồi vào được. | `app.ts:456`, `:3787` | Bắt buộc `email_confirmed_at`, ưu tiên khớp theo `authUserId`. |
| B10 | Thấp | `forgot-password` chỉ bị trần chung 300/phút mỗi instance, đủ để dội thư đặt lại mật khẩu vào một hộp thư. | `app.ts:3802` | Giới hạn theo email và theo IP, trả 204 như cũ. |
| B11 | Thấp | `ready` công khai trả chế độ kho dữ liệu, kho minh chứng, scanner. Đã che phần lỗi chi tiết, còn lại là thông tin do thám nhẹ. | `app.ts:3389` | Giữ cho probe hạ tầng, hoặc rút `checks` còn `status`. |
| B12 | Thấp | `integrations/google-apps-script/.clasp.json` chưa theo dõi và chưa nằm trong `.gitignore`; `git add .` sẽ đưa `scriptId` lên. File `data/local-state.pre-task06-repair-*.json` là bản chụp trạng thái thật còn nằm trên đĩa. | repo | Thêm vào `.gitignore`; xóa bản chụp cũ khi hết hạn lưu. |
| B13 | Thấp | Nhập DOCX/PDF kiểm giới hạn ZIP trên kích thước khai báo ở header, sau khi đã `loadAsync`. Tệp giả header gây tốn bộ nhớ trước khi bị phát hiện. | `finding-document-import.ts:34`, `campaign-document-import.ts:23` | Dùng bộ đọc central directory không giải nén như `evidence-content.ts`; gộp hai module trùng mã. |

Điểm đã làm tốt, giữ nguyên:

- Token phiên lưu dạng băm SHA-256, cookie HttpOnly và SameSite.
- CSRF hai lớp (Origin cộng token), thu hồi phiên khi đổi mật khẩu.
- Quét và cách ly minh chứng ở production; kiểu nội dung lấy từ bản ghi, không lấy từ kho.
- CSP và nosniff cho cả API.
- Nhật ký an ninh ghi cả lượt xem minh chứng và xuất dữ liệu.
- Seed demo bị chặn ở production; email Google phải được xác thực.

## 3. Lỗi logic và độ tin cậy

| Mã | Mức | Vấn đề | Vị trí | Hướng xử lý |
|---|---|---|---|---|
| L1 | Trung bình | `POST /findings/:id/sub-items` và `PUT /findings/:id/special-case` không có `Idempotency-Key` lẫn `expectedVersion`. Mạng chậm rồi gửi lại thì nhân đôi ý sai sót; hai người đổi dấu sao cùng lúc thì ghi đè nhau. Dấu sao đổi luồng duyệt nên ảnh hưởng tới người duyệt. | `app.ts:5542`, `:6200` | Thêm `expectedVersion` và khóa lặp như bảy lệnh workflow. |
| L2 | Trung bình | Dấu sao chỉ kiểm các hồ sơ của khách hàng nằm trong phạm vi của người gọi. Người phạm vi hẹp (một phòng) có thể bật dấu sao khi hồ sơ cùng khách hàng ở phòng khác đã nộp, làm các hồ sơ đó lệch luật. | `app.ts:6204` | Kiểm toàn bộ hồ sơ của khách hàng, không theo phạm vi người gọi. |
| L3 | Trung bình | Chế độ Supabase có MFA: gọi `signOut` rồi vẫn đặt cookie bằng chính phiên vừa bị đăng xuất. Người dùng đúng mã vẫn mất phiên ở yêu cầu kế tiếp. Chỉ ảnh hưởng nếu bật `AUTH_MODE=supabase`. | `app.ts:3609` | Chỉ `signOut` khi MFA sai. |
| L4 | Thấp | Bàn giao chuyển bước duyệt nhưng không chuyển "Tiếp nhận công việc" và "Theo dõi" của người cũ, chỉ đếm số lượng. | `app.ts:4735` | Hỏi khi bàn giao: chuyển hoặc xóa. |
| L5 | Thấp | Xóa hoặc khóa người đang giữ hồ sơ trả 409 và bắt quản trị viên đi hai bước. | `app.ts:4669` | Một thao tác "bàn giao và khóa" trong hộp thoại bàn giao. |
| L6 | Thấp | `requestStartedAt` là `Map` toàn cục, chỉ xóa khi đo xong; yêu cầu bị hủy giữa chừng để lại phần tử. | `app.ts:240` | Dùng `WeakMap` theo request hoặc xóa trong `onRequestAbort`. |
| L7 | Thấp | Phiên chỉ có hạn tuyệt đối 8 giờ, không có hạn nhàn rỗi và không giới hạn số phiên mỗi người. Máy chi nhánh bỏ quên vẫn dùng được tới hết ca. | `session-store.ts:19` | Thêm hạn nhàn rỗi 30 phút, có ghi `lastSeenAt` định kỳ. |

Hạng mục còn mở từ `planupp.md` (G1 đến G8): kiểm thử PostgreSQL thật nhiều instance, RLS bằng token thật, backup/restore, scanner thật, tải ở quy mô mục tiêu. Đây vẫn là cổng chặn mở rộng, không thay đổi so với kế hoạch.

## 4. Tối ưu luồng xử lý, xếp theo hiệu quả

Số đo sẵn có: một bước workflow tốn khoảng 5 ms ở 9 hồ sơ, 450 ms ở 5.000, 1,9 giây ở 20.000, gần như toàn bộ nằm ở `structuredClone` và gộp ba chiều cả snapshot. Mọi thao tác ghi đều đi qua đường này.

1. **Đưa các ghi nhỏ ra khỏi snapshot (làm nhanh, hiệu quả ngay).** Hiện 81 chỗ gọi `persistLocalState()`. Nhiều thao tác không đụng hồ sơ nhưng vẫn ghi cả snapshot: tạo và thu hồi phiên (mỗi lượt đăng nhập, đăng xuất), đánh dấu step-up, theo dõi và tiếp nhận công việc, ưu tiên theo dõi, và xuất báo cáo (`app.ts:7299`, trong khi `findings.csv` ở `:7482` đã dùng đường nhẹ `flushSecurityEvents`). Chuyển phiên sang bảng riêng như `auth_security_state`, chuyển ưu tiên cá nhân sang bảng nhỏ, đổi xuất báo cáo sang `flushSecurityEvents`.
2. **Ghi theo từng hồ sơ (việc lớn, đúng hướng đã chốt ở G6).** Dùng `finding_records` làm nơi ghi cho lệnh workflow, giữ snapshot cho cấu hình. Làm theo expand, backfill, đối chiếu, cutover như kế hoạch. Đặt đo thời gian từng bước ở 0, 5.000, 20.000 hồ sơ làm điều kiện nghiệm thu.
3. **Tổng hợp bằng SQL.** `readScopedFindingsForAnalytics` nạp toàn bộ hồ sơ trong phạm vi vào bộ nhớ cho mỗi lần chạy báo cáo, kéo thả, xuất và thẻ tổng quan (`app.ts:2581`). Đẩy `COUNT`, `SUM`, `GROUP BY` xuống SQL bằng đúng mệnh đề phạm vi của `scope-predicate.ts`; chỉ nạp dòng khi xem chi tiết hoặc xuất.
4. **Tra phiên một lần.** `AuthSessionStore.resolve` băm SHA-256 lại token cho từng bản ghi phiên trong vòng lặp và lọc cả danh sách mỗi yêu cầu (`session-store.ts:52`). Băm một lần, giữ `Map` theo digest, dọn hết hạn theo lịch. Cùng lúc, tra người dùng theo `Map<id>` thay vì `appUsers.find` (30 chỗ tra tuyến tính trên hồ sơ và người dùng).
5. **Chế độ Supabase.** Mỗi yêu cầu có xác thực gọi mạng tới `/auth/v1/user` (`app.ts:454`). Nếu giữ chế độ này, kiểm JWT cục bộ bằng JWKS kèm bộ nhớ đệm vài chục giây.
6. **Luồng duyệt.** Giữ lựa chọn người nhận ở từng bước như đã chốt. Bổ sung theo thiết kế `LUU_DO_BAN_GIAO_HO_SO.md`: giao việc tạm có `validUntil` (cột đã có), bàn giao và khóa trong một thao tác (L5), nhắc bước đang chờ quá hạn theo SLA. Cron Vercel gói Hobby chỉ chạy ngày một lần nên nhắc nhở chưa theo giờ được; cần worker có tần suất theo SLO.
7. **Gói nhập liệu.** Hai module bóc tách tài liệu trùng gần hết mã (B13); gộp để một bản vá bảo mật phủ cả hai.

## 5. Phụ thuộc và vận hành

- `npm audit`: `zod` thấp hơn 4.6.6 (tốn bộ nhớ khi kiểm mảng lớn có ràng buộc, chạy ở máy chủ), `fast-uri` (phụ thuộc của Fastify, xử lý URI), `vite`, `source-map-js` và `vitest` (chỉ dựng và test). Chạy `npm audit fix` cho các mục không phá vỡ, kiểm lại bằng `npm run ci`. Với `zod`, bản 4 là nâng cấp phá vỡ; trước mắt giữ trần kích thước thân yêu cầu thấp ở các endpoint nhận JSON lớn và lập kế hoạch nâng riêng.
- Multipart chỉ đặt `fileSize`; thêm `files`, `fields`, `parts` để chặn yêu cầu nhiều phần.
- Thêm vào `ci` bước so khớp `api/index.mjs` với bản dựng lại (hôm nay trùng, nhưng chưa có cổng chặn).
- Giữ `AUTH_MODE` production ở `credentials` hoặc `oidc`; chế độ Supabase còn L3, B9 và không hỗ trợ step-up (trả 501), nên các thao tác quản trị nhạy cảm không dùng được.

## 6. Thứ tự đề xuất

1. Đợt một, sửa nhỏ, rủi ro thấp: B1, B5, B3, B6, B7, B2 (đường drill và csv), L1, L2, thêm `.gitignore`.
2. Đợt hai: tối ưu mục 1, 4 trong phần 4 (đo trước và sau), B4, B8, B10, L7.
3. Đợt ba: tổng hợp bằng SQL và ghi theo từng hồ sơ cùng các cổng nghiệm thu G1 đến G8.

Mỗi sửa ở đợt một cần một test thất bại trước: ví dụ nhập 8 mã MFA sai thì lượt thứ 9 trả 429; vai trò bị ẩn `credit_balance` gọi drill và `findings.csv` không còn thấy cột đó; đăng xuất rồi đăng nhập tài khoản khác không thấy nháp cũ.

## 7. Tình trạng xử lý đợt một (2026-11-21)

Chưa commit. `npm run ci` đạt: 405 unit, 180 integration, 3 contract, secret preflight, dựng lại `api/index.mjs`.

| Mã | Kết quả | Test thêm |
|---|---|---|
| B1 | Mã Authenticator sai (đã nhập mã) tính vào bộ đếm khóa theo mã tài khoản, 8 lần thì khóa 15 phút. Chưa nhập mã không tính. Cả nhánh Supabase. | `auth-attempt-limits.test.ts` |
| B5 | Xác thực lại và đổi mật khẩu có bộ đếm riêng theo tài khoản, cùng ngưỡng. | `auth-attempt-limits.test.ts` |
| B6 | `reassign` dùng `eligibleRecipientsForStage` như bàn giao hàng loạt. Kiểm hạn giao việc chạy trước kiểm người nhận. | `approval-routing.test.ts` |
| B7 | `resolveApprovalRoute` thử lần lượt để không dồn hai bước cho một người, thiếu người thì dừng tuyến. | `approval-assignment.test.ts` |
| B2 | Drill bỏ CIF, tên khách hàng, cán bộ, dư nợ, giá trị ảnh hưởng khi trường bị ẩn hoặc tắt. CSV danh sách chỉ giữ cột được thấy và được xuất. | `report-hidden-fields-no-bypass.test.ts` |
| B3 | Nháp lưu `sessionStorage` theo tài khoản, xóa khi đăng xuất, xóa khóa cũ trong `localStorage`. | `grid-drafts.test.ts` |
| L1 | Thêm ý sai sót và đặt dấu sao bắt buộc `expectedVersion`, giao diện đã gửi kèm. | `finding-edit-guards.test.ts` |
| L2 | Dấu sao khóa và áp dụng theo mọi hồ sơ của khách hàng, không theo phạm vi người gọi. | `finding-edit-guards.test.ts` |
| L3 | Supabase có MFA chỉ thu hồi phiên khi mã sai. Chưa có test (cần giả lập Supabase). | không |
| B12 | `.clasp.json` đã vào `.gitignore`. | không |

Chưa làm, còn ở đợt sau: `/reports/summary` và `/dashboards/summary` vẫn trả tổng giá trị ảnh hưởng không theo ẩn trường (chỉ là số tổng hợp, không có định danh khách hàng; `/reports/summary` giao diện không còn gọi).

## 8. Tình trạng xử lý đợt hai (2026-11-21)

Chưa commit. `npm run ci` đạt: 405 unit, 183 integration, 3 contract.

| Mã | Kết quả | Test |
|---|---|---|
| Tối ưu 4 | `AuthSessionStore.resolve` băm token một lần và chỉ dọn phiên hết hạn mỗi 60 giây. Đo với 2.000 phiên, 2.000 lượt tra: 1,74 ms xuống 0,015 ms mỗi lượt. | `auth-session.test.ts` (hành vi không đổi) |
| Tối ưu 1 (một phần) | Xuất báo cáo chỉ ghi nhật ký an ninh, không ghi lại cả snapshot. | `report-export-*` hiện có |
| B8 | `next-approvers` chỉ trả danh sách cho người đang được chuyển bước đó (nộp, Kiểm soát, Lãnh đạo). Người khác nhận danh sách rỗng. | `approval-routing.test.ts` |
| B10 | Quên mật khẩu giới hạn 8 thư mỗi 15 phút cho một địa chỉ. Vượt ngưỡng vẫn trả 204 và không gửi. | `forgot-password-limit.test.ts` |

Chưa làm và lý do:

- **L7 (hạn nhàn rỗi của phiên):** `lastSeenAt` hiện chỉ nằm trong bộ nhớ và chỉ được ghi khi có thao tác ghi khác. Đặt hạn nhàn rỗi bây giờ sẽ đăng xuất nhầm người chỉ đang đọc. Cần chuyển phiên sang bảng riêng trước.
- **Tối ưu 1 (phần còn lại):** phiên, theo dõi và tiếp nhận công việc vẫn ghi cả snapshot. Phiên cần migration và bảng riêng, làm cùng L7.

### B4: cách ly tệp minh chứng bị thu hồi (2026-11-21)

Chưa commit. `npm run ci` đạt: 407 unit, 184 integration, 3 contract.

- Thu hồi minh chứng vẫn có hiệu lực ngay trong hồ sơ. Sau đó tệp được chuyển vào `_quarantine`, không xóa.
- Local: tệp dời sang `<kho>/_quarantine/<đường dẫn cũ>`. Tìm tệp theo mã bỏ qua thư mục cách ly, nên không bị phục vụ hay dọn nhầm.
- Google Drive: chuyển tệp sang thư mục `_quarantine` ngay dưới gốc lưu trữ (tạo nếu chưa có) và gỡ quyền chia sẻ trực tiếp, giữ chủ sở hữu. Quyền thừa kế mất cùng thư mục cũ. Chạy lại an toàn.
- Chuyển tệp lỗi thì bản ghi chưa có `storageQuarantinedAt` và cron bảo trì hằng ngày thử lại; kết quả nằm ở `maintenance.revokedEvidenceQuarantine`.
- Test: `evidence-storage.test.ts` (Drive và local), `evidence-revoke-quarantine.test.ts` (từ tải lên tới thu hồi, và cron).

Chưa kiểm trên Drive thật: cần thử với thư mục thử nghiệm, đặc biệt trường hợp tệp và thư mục `_quarantine` nằm ở hai Shared Drive khác nhau (Drive không cho chuyển chéo). Tệp bị scanner từ chối hoặc nguồn bị sửa (`REJECTED`) chưa được cách ly, nằm ngoài phạm vi này.

## 9. Phiên đăng nhập sang bảng riêng và hạn nhàn rỗi (2026-11-21)

Chưa commit. `npm run ci` đạt: 422 unit, 187 integration, 3 contract, dry-run 30 migration.

- Migration `0132_auth_sessions.sql`: bảng `auth_sessions` (chỉ lưu SHA-256 của token), RLS chỉ cho backend, chỉ mục theo `user_id` và `expires_at`.
- Ở PostgreSQL, đăng nhập, đăng xuất, xác thực lại và thu hồi phiên chỉ chạm một hàng và không còn ghi snapshot (`persistSessionChange` chỉ đẩy dấu vết an ninh vào sổ). Local JSON và bộ nhớ giữ phiên trong snapshot như cũ, qua cùng giao diện `SessionBackend`.
- Hạn nhàn rỗi (L7) chạy trên bảng: mặc định 30 phút, đổi bằng `SESSION_IDLE_MINUTES` (0 là tắt). Lần hoạt động cuối chỉ được ghi khi đã cũ hơn 2 phút, nên đọc dữ liệu không kéo theo ghi ở mỗi yêu cầu. Hạn tuyệt đối 8 giờ giữ nguyên.
- Nếu mã được triển khai trước khi chạy migration, lúc khởi động hệ thống phát hiện chưa có bảng, ghi cảnh báo và tạm giữ phiên trong snapshot thay vì làm hỏng đăng nhập. Sau migration, lần khởi động kế tiếp tự chuyển sang bảng.
- `npm run acceptance:preflight` kiểm thêm sự tồn tại của `auth_sessions`.
- Test: `auth-sessions-repository.test.ts` chạy cùng một bộ hành vi trên cả hai nơi lưu phiên và kiểm hạn nhàn rỗi, ngưỡng ghi lại lần hoạt động cuối.

Cần biết khi triển khai: người đang đăng nhập lúc chuyển sang bảng sẽ phải đăng nhập lại một lần, vì phiên cũ nằm trong snapshot. Các bản ghi phiên cũ trong snapshot vẫn còn nhưng không còn được dùng. Chưa đo trên PostgreSQL thật; baseline bộ nhớ không phản ánh phần này.

## 10. Chỉnh giao diện hiển thị (2026-11-21)

Kiểm ở các bề rộng 320, 375, 768, 1024, 1440 trên đăng nhập, danh sách, hồ sơ, báo cáo và các màn quản trị bằng đo phần tử tràn, cắt và chữ bị rút gọn.

- Chữ: cỡ nhỏ nhất 13px (trước 12px, 904 chỗ dùng) và chữ nội dung 15px, nén chữ tiêu đề đăng nhập bớt chặt và giãn dòng để dấu tiếng Việt không dính nhau, khử răng cưa chữ.
- Tên khách hàng, mã lỗi và tên loại báo cáo xuống tối đa hai dòng và có chú giải đầy đủ thay vì bị cắt bằng dấu ba chấm.
- Danh sách hồ sơ chuyển sang dạng thẻ dưới 1280px (bảng cần 820px nên bị cuộn ngang ở 1024px).
- Menu xuất báo cáo không còn tràn ra ngoài màn hình ở bề rộng hẹp.
- Ngăn kéo bên trái khi đóng không còn nhận phím Tab.
- Test `ui-legibility.test.ts` giữ các quy tắc trên.
