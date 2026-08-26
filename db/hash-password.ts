/**
 * Sinh chuỗi hash scrypt để đặt vào BOOTSTRAP_ADMIN_PASSWORD_HASH.
 *
 *   npm run auth:hash-password -- "MatKhauCuaBan"
 *
 * Không bao giờ đặt mật khẩu thô vào biến môi trường: giá trị đó đọc được từ bảng tiến trình và từ
 * bảng điều khiển của nhà cung cấp hạ tầng.
 */
import { hashPassword } from '../server/src/security/password';

const password = process.argv[2];
if (!password) {
  console.error('Thiếu mật khẩu.\n  npm run auth:hash-password -- "MatKhauCuaBan"');
  process.exit(1);
}
if (password.length < 12) {
  console.error(`Mật khẩu chỉ ${password.length} ký tự; đặt tối thiểu 12 ký tự cho tài khoản quản trị.`);
  process.exit(1);
}

console.log(await hashPassword(password));
