/**
 * Tạo 6 tài khoản thử nghiệm phủ đủ các vị trí trong luồng khắc phục sai sót, gồm cả Lãnh đạo chi nhánh.
 *
 * Khác với seed demo: script gọi đúng API quản trị nên tài khoản đi qua toàn bộ kiểm tra (phạm vi
 * dữ liệu, nhóm nội bộ, trùng tên đăng nhập) và có mật khẩu thật lưu cùng state. Chúng là tài
 * khoản bình thường do quản trị viên tạo, xoá được từ giao diện như mọi tài khoản khác.
 *
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run users:seed-test
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run users:seed-test -- --password "MatKhauChung2026"
 */
import { COPLUS_ROLE_CATALOG, CoPlusRoleCode, CreateUserDTO } from '../shared/contracts';

if (process.env.NODE_ENV === 'production') {
  console.error('Từ chối: không tạo tài khoản thử nghiệm trên môi trường production.');
  process.exit(1);
}

const apiBase = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/+$/, '');
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminUsername || !adminPassword) {
  console.error('Thiếu ADMIN_USERNAME / ADMIN_PASSWORD của tài khoản quản trị dùng để tạo.');
  console.error('  ADMIN_USERNAME=quantri ADMIN_PASSWORD="..." npm run users:seed-test');
  process.exit(1);
}

const passwordFlagIndex = process.argv.indexOf('--password');
const sharedPassword = passwordFlagIndex > -1
  ? process.argv[passwordFlagIndex + 1]
  : `Thu${Math.random().toString(36).slice(2, 10)}Nghiem@2026`;
if (!sharedPassword || sharedPassword.length < 12) {
  console.error('Mật khẩu chung phải từ 12 ký tự.');
  process.exit(1);
}

/**
 * Các vị trí đúng theo thứ tự hồ sơ đi qua: chi nhánh giải trình → kiểm soát → lãnh đạo chi nhánh (nếu bật) → Ban phê
 * duyệt. Hình dạng mỗi tài khoản (portal, nhóm, phòng) phải khớp ràng buộc của CreateUserSchema.
 */
const positions: Array<{ coplusRole: CoPlusRoleCode; user: Omit<CreateUserDTO, 'password'> }> = [
  {
    coplusRole: 'ADMIN_HT',
    user: {
      fullName: 'Quản trị hệ thống (thử nghiệm)', email: 'test.quantri@bidv.com.vn', username: 'test.quantri',
      portal: 'INTERNAL', roles: ['ADMIN'], primaryRole: 'ADMIN', coplusRole: 'ADMIN_HT', isActive: true,
    },
  },
  {
    coplusRole: 'GD_KTGSTT',
    user: {
      fullName: 'Giám đốc Ban KT&GSTT (thử nghiệm)', email: 'test.giamdoc@bidv.com.vn', username: 'test.giamdoc',
      portal: 'INTERNAL', roles: ['SUPERVISOR', 'INTERNAL_APPROVER'], primaryRole: 'SUPERVISOR',
      coplusRole: 'GD_KTGSTT', isActive: true,
    },
  },
  {
    coplusRole: 'CB1_KTGSTT',
    user: {
      fullName: 'Cán bộ kiểm tra tham gia đoàn (thử nghiệm)', email: 'test.canbo@bidv.com.vn', username: 'test.canbo',
      portal: 'INTERNAL', roles: ['INTERNAL_OFFICER'], primaryRole: 'INTERNAL_OFFICER', coplusRole: 'CB1_KTGSTT',
      internalTeamId: 'org-team-credit-audit', teamRole: 'MEMBER', isActive: true,
    },
  },
  {
    coplusRole: 'CB_GSKT_TH',
    user: {
      fullName: 'Cán bộ giám sát HĐKT (thử nghiệm)', email: 'test.giamsat@bidv.com.vn', username: 'test.giamsat',
      portal: 'BRANCH', roles: ['BRANCH_CONTROLLER'], primaryRole: 'BRANCH_CONTROLLER', coplusRole: 'CB_GSKT_TH',
      branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng Kiểm soát chi nhánh', isActive: true,
    },
  },
  {
    coplusRole: 'LD_CN',
    user: {
      fullName: 'Lãnh đạo Chi nhánh 635 (thử nghiệm)', email: 'test.lanhdao@bidv.com.vn', username: 'test.lanhdao',
      portal: 'BRANCH', roles: ['BRANCH_LEADER'], primaryRole: 'BRANCH_LEADER', coplusRole: 'LD_CN', isActive: true,
      branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Ban Giám đốc',
    },
  },
  {
    coplusRole: 'CBHT_CN',
    user: {
      fullName: 'Cán bộ hỗ trợ chi nhánh 635 (thử nghiệm)', email: 'test.chinhanh@bidv.com.vn', username: 'test.chinhanh',
      portal: 'BRANCH', roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', coplusRole: 'CBHT_CN',
      branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng QLKH 1', isActive: true,
    },
  },
];

const login = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: adminUsername, password: adminPassword }),
});
if (!login.ok) {
  console.error(`Đăng nhập quản trị thất bại (${login.status}). Kiểm tra ADMIN_USERNAME/ADMIN_PASSWORD và API_BASE_URL=${apiBase}`);
  process.exit(1);
}
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';

const results: Array<{ position: string; username: string; status: string }> = [];
for (const { coplusRole, user } of positions) {
  const response = await fetch(`${apiBase}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ ...user, password: sharedPassword } satisfies CreateUserDTO),
  });
  const label = COPLUS_ROLE_CATALOG.find(role => role.code === coplusRole)?.label ?? coplusRole;
  if (response.ok) {
    results.push({ position: label, username: user.username!, status: 'đã tạo' });
  } else {
    const problem = await response.json().catch(() => ({})) as { detail?: string; code?: string };
    results.push({ position: label, username: user.username!, status: `LỖI ${response.status} ${problem.code ?? ''} ${problem.detail ?? ''}`.trim() });
  }
}

console.log('\n== TÀI KHOẢN THỬ NGHIỆM ==');
console.log(`Mật khẩu chung cho cả 6: ${sharedPassword}\n`);
for (const row of results) {
  console.log(`  ${row.username.padEnd(16)} ${row.position.padEnd(46)} ${row.status}`);
}
console.log('\nThứ tự luồng: test.chinhanh giải trình → test.giamsat rà soát → test.lanhdao duyệt CN (nếu cấu hình) → test.giamdoc đóng lỗi.');
console.log('Xoá khi không cần: Quản trị → Người dùng, hoặc đặt isActive=false.');
