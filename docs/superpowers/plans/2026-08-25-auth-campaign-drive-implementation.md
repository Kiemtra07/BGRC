# Auth, Campaign, Drive and Priority Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock identity switching with real local authentication, add per-user priority monitoring, make audit campaigns a reusable report dimension, and provision a permission-scoped Google Drive hierarchy through Apps Script.

**Architecture:** Fastify owns authentication, RBAC, campaign scope, sessions and all Drive commands. React consumes cookie-authenticated APIs and never receives a shared secret. Google Apps Script executes as the administrator and only performs signed, idempotent folder/ACL operations requested by the backend.

**Tech Stack:** TypeScript 5.6, Fastify 5, React 18, Zod 3, Node `crypto.scrypt`, Vitest, Playwright, PostgreSQL migrations, Google Apps Script/Advanced Drive service.

## Global Constraints

- Run the UTF-8 preflight before trusting Vietnamese terminal output.
- Use `apply_patch` for file edits and preserve unrelated workspace changes.
- `E:\AuditBGS` is not a Git repository; replace commit steps with Graph `record_edit` checkpoints and report that commits are unavailable.
- Demo accounts exist only when `NODE_ENV !== 'production'` and `SEED_DEMO_USERS=true`.
- Production remains fail-closed for OIDC/PostgreSQL/real Drive requirements.
- Browser requests must not authenticate with `x-user-id`; only integration tests may opt into the test identity bridge.
- Never expose Apps Script shared secret, OAuth token, raw ACL IDs or an unscoped Drive URL to the browser.
- Drive readiness is `READY` only after folder provisioning and ACL reconciliation both succeed.

---

## File Structure

### Authentication boundary

- Create `server/src/security/password.ts`: scrypt hash/verify and constant-time comparison.
- Create `server/src/security/session-store.ts`: create, resolve, revoke and expire server-side sessions.
- Modify `shared/contracts/auth.ts`: credential/session contracts and `googleWorkspaceEmail`.
- Modify `server/src/app.ts`: public login route, cookie parsing, session auth hook, logout and production guards.
- Modify `src/services/api.ts`: cookie credentials, login/logout, removal of mutable user header.
- Create `src/components/auth/LoginPage.tsx`: compact real login form.
- Modify `src/App.tsx`: auth bootstrap, login gate, user menu and logout.

### Monitoring boundary

- Modify `shared/contracts/workspace.ts`: `isPriority`, `prioritizedAt`, priority command schema.
- Modify `server/src/app.ts`: priority mutation and deterministic queue sorting.
- Modify `src/components/portal/WorkspaceSidebar.tsx`: priority group and star control.
- Modify `src/components/portal/FindingDetailPage.tsx`: star control beside follow/accept actions.

### Campaign boundary

- Create `shared/contracts/campaigns.ts`: campaign DTOs, schemas and status/member types.
- Modify `shared/contracts/index.ts`, `shared/contracts/findings.ts`, `shared/contracts/reporting.ts`, `shared/contracts/channels.ts`.
- Create `server/src/modules/campaigns/campaign-service.ts`: validation, scope and lifecycle transitions.
- Modify `server/src/app.ts`: campaign state, APIs, finding filter/backfill and report projections.
- Create `src/components/admin/campaigns/CampaignManager.tsx`: CRUD, membership, channels, Drive provisioning.
- Modify `src/components/admin/AdminPortal.tsx`, `src/App.tsx`, `src/services/api.ts`, `src/components/portal/WorkspaceSidebar.tsx`, `src/components/reports/ReportsWorkspace.tsx`.
- Modify report CMS files to support the system block `CAMPAIGN_CONTEXT`.

### Drive boundary

- Create `server/src/adapters/apps-script-drive.ts`: signed gateway and canonical payload.
- Create `integrations/google-apps-script/AuditBGSDrive.gs` and `appsscript.json`.
- Create `integrations/google-apps-script/README.md`.
- Modify `server/src/adapters/google-drive.ts` and evidence upload flow to use campaign/customer/error folder IDs.
- Modify `.env.example` with safe, server-only configuration.

### Persistence and verification

- Create `db/migrations/0070_auth_campaign_drive_priority.sql`.
- Modify `db/seed.ts`, `server/src/repositories/local-state.ts`, `server/src/state/durable-state-coordinator.ts` and `data/local-state.json` through repository-safe backfill.
- Add focused unit, integration, contract and Playwright tests.
- Update `PLANUPDATE.md` only after all local evidence is available.

---

### Task 1: Authentication primitives and contracts

**Files:**
- Create: `server/src/security/password.ts`
- Create: `server/src/security/session-store.ts`
- Modify: `shared/contracts/auth.ts`
- Modify: `shared/contracts/index.ts`
- Test: `tests/unit/auth-session.test.ts`

**Interfaces:**
- Produces: `hashPassword(password): Promise<string>` and `verifyPassword(password, encoded): Promise<boolean>`.
- Produces: `AuthSessionStore.create(userId)`, `.resolve(token)`, `.revoke(token)`, `.purgeExpired()`.
- Produces: `LoginSchema`, `LoginDTO`, `AuthSessionRecord`, `LoginResponse`.

- [ ] **Step 1: Write failing password/session tests**

```ts
it('hashes without storing plaintext and verifies the correct password', async () => {
  const encoded = await hashPassword('AuditAdmin@2026');
  expect(encoded).not.toContain('AuditAdmin@2026');
  await expect(verifyPassword('AuditAdmin@2026', encoded)).resolves.toBe(true);
  await expect(verifyPassword('wrong', encoded)).resolves.toBe(false);
});

it('expires and revokes opaque sessions', () => {
  const store = new AuthSessionStore({ now: () => new Date('2026-08-25T00:00:00Z'), ttlMs: 60_000 });
  const session = store.create('user-admin');
  expect(store.resolve(session.token)?.userId).toBe('user-admin');
  store.revoke(session.token);
  expect(store.resolve(session.token)).toBeUndefined();
});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/auth-session.test.ts`  
Expected: FAIL because password/session modules do not exist.

- [ ] **Step 3: Implement scrypt and session primitives**

```ts
const SCRYPT_KEY_LENGTH = 64;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
```

Store only a SHA-256 digest of the opaque session token so local state never contains reusable bearer tokens.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/unit/auth-session.test.ts`  
Expected: PASS.

- [ ] **Step 5: Record checkpoint**

Record the four files with Graph and note that Git commit is unavailable.

### Task 2: Fastify login/logout and five demo accounts

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/security/access-control.ts`
- Modify: `server/src/repositories/local-state.ts`
- Modify: `db/seed.ts`
- Test: `tests/integration/authentication.test.ts`
- Test: `tests/contract/auth-contract.test.ts`

**Interfaces:**
- Consumes: password/session primitives from Task 1.
- Produces: cookie `audit_bgs_session`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, authenticated `GET /api/v1/me`.

- [ ] **Step 1: Add RED integration cases**

```ts
const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {
  username: 'admin.hethong', password: 'AuditAdmin@2026',
}});
expect(login.statusCode).toBe(200);
expect(login.cookies[0].name).toBe('audit_bgs_session');
expect(login.cookies[0].httpOnly).toBe(true);

const spoofed = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'x-user-id': 'user-admin' } });
expect(spoofed.statusCode).toBe(401);
```

Also assert the five usernames log into their exact roles and the same neutral 401 detail is returned for unknown user and bad password.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/integration/authentication.test.ts tests/contract/auth-contract.test.ts`  
Expected: FAIL because auth routes and cookies do not exist.

- [ ] **Step 3: Implement auth hook and demo seed guard**

Public paths become health, ready and login. Resolve the user from the session cookie; enable an explicit `ALLOW_TEST_USER_HEADER=true` bridge only while `NODE_ENV=test`. Define the five accounts from the approved spec and hash passwords at startup/seed time without storing plaintext.

- [ ] **Step 4: Add production guard**

```ts
if (env.NODE_ENV === 'production' && env.SEED_DEMO_USERS === 'true') {
  violations.push('SEED_DEMO_USERS không được bật ở production');
}
```

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/integration/authentication.test.ts tests/contract/auth-contract.test.ts`  
Expected: PASS.

### Task 3: Login UI and removal of user switching

**Files:**
- Create: `src/components/auth/LoginPage.tsx`
- Modify: `src/services/api.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/ui-architecture.test.ts`
- Test: `tests/e2e/auth-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 auth endpoints.
- Produces: `api.login`, `api.logout`, cookie-authenticated `request`, compact login gate.

- [ ] **Step 1: Add RED architecture assertions**

```ts
expect(appSource).not.toContain('aria-label="Chuyển người dùng"');
expect(apiSource).not.toContain("'x-user-id'");
expect(loginSource).toContain('autocomplete="username"');
expect(loginSource).toContain('autocomplete="current-password"');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/ui-architecture.test.ts`  
Expected: FAIL on old selector/header authentication.

- [ ] **Step 3: Implement cookie client and login gate**

Use `credentials: 'same-origin'` on every request. On initial `/me` 401, render `LoginPage`; after login call the existing scoped data bootstrap. Header user menu contains only identity, role and logout.

- [ ] **Step 4: Add Playwright login/logout proof**

The smoke must log in as branch input, assert branch-scoped customer data, log out, refresh and confirm the login form remains.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/unit/ui-architecture.test.ts && node tests/e2e/auth-smoke.mjs`  
Expected: unit and desktop/mobile login smoke PASS.

### Task 4: Priority monitoring star

**Files:**
- Modify: `shared/contracts/workspace.ts`
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/portal/WorkspaceSidebar.tsx`
- Modify: `src/components/portal/FindingDetailPage.tsx`
- Test: `tests/unit/workspace-priority.test.ts`
- Test: `tests/integration/workspace-actions.test.ts`

**Interfaces:**
- Produces: `WorkspaceTarget.isPriority`, `prioritizedAt`, `SetWorkspacePrioritySchema`.
- Produces: `PATCH /api/v1/workspace/watch-targets/:id/priority`.

- [ ] **Step 1: Write RED behavior tests**

```ts
expect(starUnwatchedTarget(queue, dto).following[0]).toMatchObject({ isPriority: true });
expect(unstarTarget(queue, id).following[0]).toMatchObject({ isPriority: false });
expect(unstarTarget(queue, id).following).toHaveLength(1);
```

Integration cases assert one user cannot modify another user's target and priority items sort before ordinary watch targets.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/workspace-priority.test.ts tests/integration/workspace-actions.test.ts`  
Expected: FAIL because priority fields/route are absent.

- [ ] **Step 3: Implement contracts, command and sort**

Use an idempotent boolean command `{ isPriority: boolean }`. Starring an untracked finding first creates its watch target; deleting a watch target removes priority with it.

- [ ] **Step 4: Implement accessible UI**

Add an `aria-pressed` star button with 44px mobile target. Render “Ưu tiên giám sát” above “Đang theo dõi”; never change accepted-work state.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/unit/workspace-priority.test.ts tests/integration/workspace-actions.test.ts`  
Expected: PASS.

### Task 5: Campaign contracts, persistence and migration

**Files:**
- Create: `shared/contracts/campaigns.ts`
- Modify: `shared/contracts/index.ts`
- Modify: `shared/contracts/findings.ts`
- Modify: `shared/contracts/workspace.ts`
- Create: `db/migrations/0070_auth_campaign_drive_priority.sql`
- Modify: `db/seed.ts`
- Modify: `server/src/repositories/local-state.ts`
- Test: `tests/contract/campaign-contract.test.ts`
- Test: `tests/migrations/0070-auth-campaign-drive-priority.test.ts`

**Interfaces:**
- Produces: `AuditCampaign`, `AuditCampaignMember`, `CreateAuditCampaignDTO`, `UpdateAuditCampaignDTO`, lifecycle command schemas.
- Adds `Finding.campaignId` and campaign arrays to durable local state.

- [ ] **Step 1: Write RED schema and migration tests**

Reject end date before start date, duplicate members, lead missing from members, member branches outside campaign branches and empty `reportChannelIds`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/contract/campaign-contract.test.ts tests/migrations/0070-auth-campaign-drive-priority.test.ts`  
Expected: FAIL on missing schema/migration.

- [ ] **Step 3: Implement focused Zod contracts**

```ts
export const AuditCampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
export const CampaignMemberSchema = z.object({
  userId: z.string().min(1),
  memberRole: z.enum(['LEAD', 'MEMBER']),
  assignedBranchCodes: z.array(z.string().min(1)).default([]),
});
```

Use `superRefine` for cross-field rules and optimistic `expectedVersion` on updates.

- [ ] **Step 4: Implement migration/backfill**

Create normalized campaign/member/branch/channel tables, credentials/sessions, Drive status fields and watch priority columns. Backfill existing findings to the seeded `campaign-regular-2026`.

- [ ] **Step 5: Run GREEN and migration dry-run**

Run: `npx vitest run tests/contract/campaign-contract.test.ts tests/migrations/0070-auth-campaign-drive-priority.test.ts && npm run db:migrate:dry-run`  
Expected: PASS and all migrations report valid SQL without applying changes.

### Task 6: Campaign service, APIs and data scope

**Files:**
- Create: `server/src/modules/campaigns/campaign-service.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/security/access-control.ts`
- Modify: `src/services/api.ts`
- Test: `tests/unit/campaign-service.test.ts`
- Test: `tests/integration/campaigns.test.ts`

**Interfaces:**
- Produces: `canAccessCampaign(user, campaign, members)`, `assertCampaignTransition`, `filterCampaignsForUser`.
- Produces admin CRUD/lifecycle APIs and scoped `GET /api/v1/campaigns`.

- [ ] **Step 1: Write RED scope/lifecycle tests**

```ts
expect(canAccessCampaign(admin, campaign, members)).toBe(true);
expect(canAccessCampaign(assignedOfficer, campaign, members)).toBe(true);
expect(canAccessCampaign(unassignedOfficer, campaign, members)).toBe(false);
expect(() => archiveCampaign(activeCampaign)).toThrow('CAMPAIGN_MUST_BE_CLOSED');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/campaign-service.test.ts tests/integration/campaigns.test.ts`  
Expected: FAIL on missing service/routes.

- [ ] **Step 3: Implement service and APIs**

Enforce admin-only mutations, optimistic version checks, immutable IDs, archive-not-delete after findings exist, and derived scope for lead/member/branch roles.

- [ ] **Step 4: Bind findings/imports to campaign**

New web/import DTOs require an accessible active campaign. `GET /findings`, dashboard and customer case accept `campaignId` and apply campaign scope before other filters.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/unit/campaign-service.test.ts tests/integration/campaigns.test.ts`  
Expected: PASS including BOLA cases.

### Task 7: Campaign admin UI, workspace filter and report CMS block

**Files:**
- Create: `src/components/admin/campaigns/CampaignManager.tsx`
- Modify: `src/components/admin/AdminPortal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/portal/WorkspaceSidebar.tsx`
- Modify: `src/components/reports/ReportsWorkspace.tsx`
- Modify: `src/components/admin/report-types/FormSchemaEditor.tsx`
- Modify: `src/components/admin/report-types/ReportFormPreview.tsx`
- Modify: `src/components/ingestion/WebFormFindingModal.tsx`
- Modify: `shared/contracts/reporting.ts`
- Test: `tests/unit/campaign-ui-architecture.test.ts`
- Test: `tests/integration/reporting-campaign.test.ts`
- Test: `tests/e2e/campaign-smoke.mjs`

**Interfaces:**
- Consumes: campaign APIs from Task 6.
- Produces: admin campaign editor, URL-preserved filter, `CAMPAIGN_CONTEXT` system block and report fields.

- [ ] **Step 1: Write RED UI/report tests**

Assert campaign fields are in report catalog, the CMS block cannot bind arbitrary user-entered values, and report runs filter by `campaignId` before grouping.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/campaign-ui-architecture.test.ts tests/integration/reporting-campaign.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement compact campaign management**

Use one responsive editor with Information, Assignment, Report types and Drive status sections. Validate inline; do not add explanatory AI-style paragraphs.

- [ ] **Step 4: Implement filter and CMS block**

Persist `campaignId` in `URLSearchParams`, pass it to dashboard/findings/reports, and render campaign code/name/decision/dates/lead from authoritative campaign data.

- [ ] **Step 5: Run GREEN and Playwright smoke**

Run: `npx vitest run tests/unit/campaign-ui-architecture.test.ts tests/integration/reporting-campaign.test.ts && node tests/e2e/campaign-smoke.mjs`  
Expected: desktop and 375px flows PASS.

### Task 8: Signed Apps Script gateway and script package

**Files:**
- Create: `server/src/adapters/apps-script-drive.ts`
- Create: `integrations/google-apps-script/AuditBGSDrive.gs`
- Create: `integrations/google-apps-script/appsscript.json`
- Create: `integrations/google-apps-script/README.md`
- Modify: `.env.example`
- Test: `tests/unit/apps-script-drive.test.ts`
- Test: `tests/contract/apps-script-contract.test.ts`

**Interfaces:**
- Produces: `AppsScriptDriveGateway.execute(action, payload)` and canonical `DriveCommandResponse`.
- Apps Script actions: `PING`, `PROVISION_CAMPAIGN`, `ENSURE_CUSTOMER_FOLDER`, `ENSURE_ERROR_FOLDER`, `SYNC_CAMPAIGN_ACL`, `REVOKE_CAMPAIGN_ACCESS`.

- [ ] **Step 1: Write RED signing and replay tests**

```ts
const signed = signDriveRequest({ action: 'PING', payload: {}, timestamp: 1, nonce: 'n-1' }, 'secret');
expect(verifyDriveSignature(signed, 'secret')).toBe(true);
expect(verifyDriveSignature({ ...signed, action: 'PROVISION_CAMPAIGN' }, 'secret')).toBe(false);
```

Contract tests assert unknown actions, stale timestamps and reused nonces are rejected.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/apps-script-drive.test.ts tests/contract/apps-script-contract.test.ts`  
Expected: FAIL on missing gateway/script contract.

- [ ] **Step 3: Implement backend gateway**

Canonicalize JSON keys recursively, sign `timestamp + '.' + nonce + '.' + action + '.' + canonicalPayload`, enforce timeout and map non-2xx/script errors to `HttpProblem(503, 'DRIVE_PROVISION_FAILED', ...)` without leaking secrets.

- [ ] **Step 4: Implement Apps Script**

Use `PropertiesService`, `CacheService` for nonce replay protection, `LockService` for idempotent folder creation, Drive Advanced Service for ACL and `writersCanShare=false`. Set limited access where supported; never create `anyone` or `domain` permission.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/unit/apps-script-drive.test.ts tests/contract/apps-script-contract.test.ts`  
Expected: PASS.

### Task 9: Drive provisioning, ACL reconciliation and evidence paths

**Files:**
- Modify: `server/src/modules/campaigns/campaign-service.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/adapters/google-drive.ts`
- Modify: `src/components/admin/campaigns/CampaignManager.tsx`
- Test: `tests/integration/campaign-drive.test.ts`
- Test: `tests/integration/evidence-storage.test.ts`

**Interfaces:**
- Consumes: Task 8 gateway.
- Produces: provision/sync routes, deterministic folder IDs/status and evidence placement under campaign/customer/error.

- [ ] **Step 1: Write RED orchestration tests with a fake gateway**

Assert provisioning retries do not duplicate, ACL failure leaves `driveProvisionStatus='FAILED'`, removed members trigger revoke commands, and evidence becomes AVAILABLE only after storage returns checksum/object ID.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/integration/campaign-drive.test.ts tests/integration/evidence-storage.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement provisioning state machine**

Use `NOT_CONFIGURED -> PROVISIONING -> READY|FAILED`; store `driveLastError` as a user-safe code/message. A campaign is not READY until `PROVISION_CAMPAIGN` and `SYNC_CAMPAIGN_ACL` both succeed.

- [ ] **Step 4: Implement folder placement**

Generate NFC-safe `CD_CODE_NAME/CN_CODE_NAME/CIF_NAME/ERROR_CODE/HO_SO_BO_SUNG`; store returned IDs on campaign/finding/evidence records rather than searching by display name.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/integration/campaign-drive.test.ts tests/integration/evidence-storage.test.ts`  
Expected: PASS.

### Task 10: Full verification, documentation and localhost handoff

**Files:**
- Modify: `PLANUPDATE.md`
- Create: `tests/e2e/auth-campaign-priority-smoke.mjs`
- Modify: `tests/e2e/local-smoke.mjs`

**Interfaces:**
- Produces: evidence-backed local status and honest NOT_CONFIGURED/READY distinction.

- [ ] **Step 1: Run UTF-8 and focused suites**

Run the UTF-8 preflight, then all new unit/integration/contract tests.  
Expected: Vietnamese probe intact; all focused tests PASS.

- [ ] **Step 2: Run migration and full CI**

Run: `npm run ci`  
Expected: every migration dry-run, TypeScript, unit, integration, contract and Vite build PASS.

- [ ] **Step 3: Run security and dependency checks**

Run: `npm audit --audit-level=high`  
Expected: zero high/critical vulnerabilities.

- [ ] **Step 4: Run localhost Playwright proof**

Cover all five logins, logout/session refresh, campaign CRUD/filter, priority star independence, responsive admin and Drive stub retry.  
Expected: PASS at desktop and 375px.

- [ ] **Step 5: Update PLANUPDATE truthfully**

Record exact test counts, local URLs, configured/not-configured Drive state, files changed and remaining production blockers. Do not claim Drive ACL acceptance without real Google credentials and an outside-account denial test.

- [ ] **Step 6: Record Graph outcome**

Record meaningful edits and final status with the session run ID. Note that no Git commit exists because the workspace is not a repository.
