/**
 * Xoá dữ liệu demo khỏi state đang chạy (local-json hoặc Postgres).
 *
 * Dùng khi một môi trường đã từng khởi động với `SEED_DEMO_DATA` bật và nay cần sạch trước khi
 * nạp dữ liệu kiểm toán thật. Chạy khô (dry-run) theo mặc định — phải truyền `--yes` mới thực xoá.
 *
 *   npm run demo:purge              # liệt kê những gì sẽ bị xoá, không đụng dữ liệu
 *   npm run demo:purge -- --yes     # thực hiện xoá
 *   npm run demo:purge -- --yes --include-org-units --include-channels
 */
import path from 'node:path';
import { createStateRepository } from '../server/src/repositories/state-repository';

/**
 * Bản ghi demo mang id cố định do người viết đặt trong `server/src/app.ts`; bản ghi phát sinh lúc
 * chạy luôn có UUID. Liệt kê tường minh ở đây để lệnh xoá không bao giờ đoán nhầm sang dữ liệu thật.
 */
const DEMO_USER_IDS = [
  'user-admin',
  'user-internal-supervisor',
  'user-internal-officer',
  'user-branch-controller-635',
  'user-branch-635',
];
const DEMO_FINDING_IDS = ['find-001', 'find-002', 'find-003', 'find-004'];
const DEMO_CAMPAIGN_IDS = ['campaign-regular-2026'];
const DEMO_ORG_UNIT_PREFIX = 'org-';
const DEMO_CHANNEL_IDS = ['chan-audit-bgs', 'chan-aml', 'chan-op-risk'];

interface PurgeState {
  appUsers?: Array<{ id: string; username?: string; fullName?: string; roles?: string[] }>;
  findings?: Array<{ id: string; cif?: string; errorCode?: string }>;
  auditCampaigns?: Array<{ id: string }>;
  orgUnits?: Array<{ id: string }>;
  reportChannels?: Array<{ id: string }>;
  reportChannelVersions?: Array<{ channelId: string }>;
  workflowEvents?: Array<{ findingId: string }>;
  evidences?: Array<{ findingId: string }>;
  findingFollows?: Array<{ findingId: string; userId: string }>;
  workspaceAccepted?: Array<{ userId: string }>;
  workspaceWatchTargets?: Array<{ userId: string }>;
  authSessions?: Array<{ userId: string }>;
  importBatches?: unknown[];
  [key: string]: unknown;
}

const argv = new Set(process.argv.slice(2));
const apply = argv.has('--yes');
const includeOrgUnits = argv.has('--include-org-units');
const includeChannels = argv.has('--include-channels');

const repository = createStateRepository<PurgeState>({
  filePath: process.env.LOCAL_STATE_FILE ?? path.join(process.cwd(), 'data', 'local-state.json'),
  dataStoreMode: process.env.DATA_STORE_MODE,
  persistenceEnabled: true,
  snapshotId: process.env.STATE_SNAPSHOT_ID,
});

const purge = (state: PurgeState) => {
  const userIds = new Set((state.appUsers ?? []).filter(user => DEMO_USER_IDS.includes(user.id)).map(user => user.id));
  const findingIds = new Set((state.findings ?? []).filter(finding => DEMO_FINDING_IDS.includes(finding.id)).map(finding => finding.id));
  const campaignIds = new Set((state.auditCampaigns ?? []).filter(item => DEMO_CAMPAIGN_IDS.includes(item.id)).map(item => item.id));
  const orgUnitIds = new Set(includeOrgUnits
    ? (state.orgUnits ?? []).filter(unit => unit.id.startsWith(DEMO_ORG_UNIT_PREFIX)).map(unit => unit.id)
    : []);
  const channelIds = new Set(includeChannels
    ? (state.reportChannels ?? []).filter(channel => DEMO_CHANNEL_IDS.includes(channel.id)).map(channel => channel.id)
    : []);

  const report = {
    'Tài khoản demo': userIds.size,
    'Hồ sơ sai sót demo': findingIds.size,
    'Chuyên đề demo': campaignIds.size,
    'Sự kiện luồng của hồ sơ demo': (state.workflowEvents ?? []).filter(event => findingIds.has(event.findingId)).length,
    'Minh chứng của hồ sơ demo': (state.evidences ?? []).filter(item => findingIds.has(item.findingId)).length,
    'Phiên đăng nhập của tài khoản demo': (state.authSessions ?? []).filter(item => userIds.has(item.userId)).length,
    'Đơn vị tổ chức mẫu': orgUnitIds.size,
    'Loại báo cáo mẫu': channelIds.size,
  };

  const next: PurgeState = {
    ...state,
    appUsers: (state.appUsers ?? []).filter(user => !userIds.has(user.id)),
    findings: (state.findings ?? []).filter(finding => !findingIds.has(finding.id)),
    auditCampaigns: (state.auditCampaigns ?? []).filter(item => !campaignIds.has(item.id)),
    workflowEvents: (state.workflowEvents ?? []).filter(event => !findingIds.has(event.findingId)),
    evidences: (state.evidences ?? []).filter(item => !findingIds.has(item.findingId)),
    findingFollows: (state.findingFollows ?? []).filter(item => !findingIds.has(item.findingId) && !userIds.has(item.userId)),
    workspaceAccepted: (state.workspaceAccepted ?? []).filter(item => !userIds.has(item.userId)),
    workspaceWatchTargets: (state.workspaceWatchTargets ?? []).filter(item => !userIds.has(item.userId)),
    authSessions: (state.authSessions ?? []).filter(item => !userIds.has(item.userId)),
    orgUnits: (state.orgUnits ?? []).filter(unit => !orgUnitIds.has(unit.id)),
    reportChannels: (state.reportChannels ?? []).filter(channel => !channelIds.has(channel.id)),
    reportChannelVersions: (state.reportChannelVersions ?? []).filter(version => !channelIds.has(version.channelId)),
  };

  return { next, report };
};

const empty: PurgeState = {};
const current = await repository.load(empty);
const { next, report } = purge(current);

console.log(apply ? '== XOÁ DỮ LIỆU DEMO ==' : '== CHẠY KHÔ (chưa xoá gì) ==');
for (const [label, count] of Object.entries(report)) {
  console.log(`  ${label.padEnd(36)} ${count}`);
}

const remainingAdmins = (next.appUsers ?? []).filter(user => user.roles?.includes('ADMIN')).length;
if (remainingAdmins === 0) {
  console.log('\n  ⚠  Sau khi xoá sẽ KHÔNG còn tài khoản quản trị nào.');
  console.log('     Hãy đặt BOOTSTRAP_ADMIN_USERNAME và BOOTSTRAP_ADMIN_PASSWORD_HASH trước khi khởi động lại,');
  console.log('     nếu không sẽ không đăng nhập được. Tạo hash bằng: npm run auth:hash-password -- "<mật khẩu>"');
}

if (!apply) {
  console.log('\n  Thêm --yes để thực hiện xoá.');
  process.exit(0);
}

await repository.update(empty, () => next);
console.log('\n  Đã xoá xong. Khởi động lại API để nạp lại state.');
