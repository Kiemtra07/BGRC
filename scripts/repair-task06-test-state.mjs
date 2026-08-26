import assert from 'node:assert/strict';
import { constants, copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(workspaceRoot, 'data', 'local-state.json');
const backupPath = join(
  workspaceRoot,
  'data',
  'local-state.pre-task06-repair-20260825T002914Z.json',
);
const tempPath = `${statePath}.task06-repair.tmp`;

const envelope = JSON.parse(readFileSync(statePath, 'utf8'));
const data = envelope.data;

assert.equal(
  envelope.savedAt,
  '2026-08-25T00:29:14.161Z',
  'Refusing to repair: local-state.json no longer matches the leaked test snapshot.',
);
assert.ok(data && typeof data === 'object', 'Missing local-state data envelope.');

const expectedBefore = {
  orgUnits: 14,
  appUsers: 9,
  reportChannels: 3,
  findings: 11,
  workflowEvents: 9,
  evidences: 3,
  importBatches: 4,
  reportDefinitions: 2,
  workspaceWatchTargets: 7,
};

for (const [collection, count] of Object.entries(expectedBefore)) {
  assert.equal(
    data[collection]?.length,
    count,
    `Refusing to repair: unexpected ${collection} count.`,
  );
}

function removeExactIds(collection, ids) {
  const expectedIds = new Set(ids);
  const presentIds = new Set(collection.map((entry) => entry.id));
  for (const id of expectedIds) {
    assert.ok(presentIds.has(id), `Refusing to repair: missing fixture ${id}.`);
  }

  return collection.filter((entry) => !expectedIds.has(entry.id));
}

const fixtureFindingIds = [
  'find-562c2f2f-aba2-41bd-b4d5-1eb7284155eb',
  'find-d033f897-fd49-445b-a4dd-b0ee194b28a9',
  'find-e1ebafc4-b4a5-44bd-96e9-2aa80f746327',
  'find-9e027337-f370-4aa0-9a7e-59fbc828bf10',
  'find-19c26c15-5816-4215-8475-02c60e88fbf9',
  'find-b7638500-64f6-4231-ba39-92c304790319',
  'find-6689e0be-da44-4b29-a7d0-adba1737111c',
];
const fixtureEventIds = [
  'evt-38c46766-d6be-4bf0-bd3a-185b010bb3ef',
  'evt-4885c2e1-c845-4b45-b067-8d16abf6fbfa',
];
const fixtureBatchIds = [
  'batch-e877bd65-91c3-4ec1-9cc3-cff1a6a32224',
  'batch-86f2c437-15f0-4722-98c2-876144345a27',
  'batch-3fa53e1b-90f9-4395-a604-ca9b3780d3de',
  'batch-99a8bdd8-d661-499d-a712-aa5d090d4923',
];
const fixtureReportIds = [
  'report-70d01dcc-ee42-425a-bf0e-06698c4da891',
  'report-feb4474e-d3c2-47dd-b963-8dc6a7dc265a',
];
const fixtureUserIds = [
  'user-f67fd69d-1fde-484d-bcd7-97c5be054f5f',
  'user-b4e80f72-281f-4304-b264-313cd1e1ff90',
  'user-d6c01ee0-c8bf-4bd7-ac41-d1cd0c4f5649',
  'user-1f4f7b35-aedb-4ab1-bf1f-da3db53de23d',
];
const fixtureWatchIds = [
  'workspace-092111ab-608d-43b0-b75b-63f828f9e0bd',
  'workspace-9eff5d1d-11c7-4cd8-9146-e9e9c93de573',
  'workspace-80d89993-08a6-49e8-9cfe-3201ae9dfa1c',
];

data.findings = removeExactIds(data.findings, fixtureFindingIds);
data.workflowEvents = removeExactIds(data.workflowEvents, fixtureEventIds);
data.importBatches = removeExactIds(data.importBatches, fixtureBatchIds);
data.reportDefinitions = removeExactIds(data.reportDefinitions, fixtureReportIds);
data.appUsers = removeExactIds(data.appUsers, fixtureUserIds);
data.workspaceWatchTargets = removeExactIds(data.workspaceWatchTargets, fixtureWatchIds);

const leakedIdempotencyKey =
  'user-f67fd69d-1fde-484d-bcd7-97c5be054f5f:POST:/api/v1/findings/find-002/actions/branch-control-approve:approve-own-branch-428';
assert.ok(
  Object.hasOwn(data.idempotencyRecords, leakedIdempotencyKey),
  'Refusing to repair: missing leaked idempotency record.',
);
delete data.idempotencyRecords[leakedIdempotencyKey];

const finding002 = data.findings.find((finding) => finding.id === 'find-002');
assert.ok(finding002, 'Missing find-002.');
assert.equal(finding002.workflowStatus, 'SUBMITTED_INTERNAL');
assert.equal(finding002.version, 3);
finding002.workflowStatus = 'SUBMITTED_BRANCH';
finding002.version = 2;
finding002.updatedAt = '2026-08-20T10:30:00.000Z';

const finding003 = data.findings.find((finding) => finding.id === 'find-003');
assert.ok(finding003, 'Missing find-003.');
assert.equal(finding003.version, 6);
assert.equal(finding003.subItems.length, 4);
assert.equal(finding003.subItems[3].id, 'sub-7c3252db-69d0-4963-ac11-bdd8334c9339');
finding003.version = 4;
finding003.updatedAt = '2026-08-24T23:02:52.688Z';
finding003.subItems = finding003.subItems.slice(0, 3).map((subItem) => ({
  ...subItem,
  status: 'ACCEPTED',
  updatedAt: '2026-08-24T23:02:52.688Z',
  reviewerNote: 'đồng ý bỏ',
  reviewedByUserId: 'user-internal-supervisor',
  reviewedByName: 'Trần Lãnh Đạo (Giám Đốc Ban Kiểm Toán)',
  reviewedAt: '2026-08-24T23:02:52.688Z',
}));

const complianceTeam = data.orgUnits.find((unit) => unit.id === 'org-team-compliance');
assert.ok(complianceTeam, 'Missing org-team-compliance.');
assert.equal(complianceTeam.leaderUserId, 'user-1f4f7b35-aedb-4ab1-bf1f-da3db53de23d');
delete complianceTeam.leaderUserId;
delete complianceTeam.leaderName;
complianceTeam.updatedAt = complianceTeam.createdAt;

const expectedAfter = {
  orgUnits: 14,
  appUsers: 5,
  reportChannels: 3,
  findings: 4,
  workflowEvents: 7,
  evidences: 3,
  importBatches: 0,
  reportDefinitions: 0,
  workspaceWatchTargets: 4,
};

for (const [collection, count] of Object.entries(expectedAfter)) {
  assert.equal(data[collection]?.length, count, `Repair produced an invalid ${collection} count.`);
}
assert.equal(Object.keys(data.idempotencyRecords).length, 2);
assert.equal(data.workspaceAccepted.length, 2);
assert.equal(data.findingFollows.length, 0);

const serializedData = JSON.stringify(data);
for (const fixtureId of [
  ...fixtureFindingIds,
  ...fixtureEventIds,
  ...fixtureBatchIds,
  ...fixtureReportIds,
  ...fixtureUserIds,
  ...fixtureWatchIds,
  leakedIdempotencyKey,
  'sub-7c3252db-69d0-4963-ac11-bdd8334c9339',
]) {
  assert.ok(!serializedData.includes(fixtureId), `Fixture ${fixtureId} remains after repair.`);
}

copyFileSync(statePath, backupPath, constants.COPYFILE_EXCL);
envelope.savedAt = new Date().toISOString();
writeFileSync(tempPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
renameSync(tempPath, statePath);

console.log(
  JSON.stringify(
    {
      repaired: statePath,
      backup: backupPath,
      savedAt: envelope.savedAt,
      counts: expectedAfter,
      idempotencyRecords: Object.keys(data.idempotencyRecords).length,
    },
    null,
    2,
  ),
);
