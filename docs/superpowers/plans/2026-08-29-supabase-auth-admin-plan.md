# Supabase Auth và quản trị đơn vị/người dùng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đăng nhập sang Supabase Auth và hoàn thiện quản trị user, đổi mật khẩu, nhập đơn vị theo lô mà không phá cây `HEAD_OFFICE → CLUSTER → BRANCH → DEPARTMENT`.

**Architecture:** Fastify giữ mọi kiểm tra RBAC, scope và audit; một adapter Supabase server-only xác thực JWT và gọi Auth Admin API. Hồ sơ ứng dụng tiếp tục ở PostgreSQL, liên kết với `auth.users.id`; browser chỉ nhận session/token không bao giờ nhận secret key. Import đơn vị dùng parser/validator thuần trước khi ghi và commit idempotent theo batch.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, React/Vite, `@supabase/supabase-js`, PostgreSQL migrations, `read-excel-file`.

## Global Constraints

- Không ghi password plaintext vào database, log, CSV hoặc bundle browser.
- Supabase secret/service key chỉ được đọc trong server runtime; publishable/anon key mới được phép ở browser.
- `HEAD_OFFICE` luôn do server bootstrap; file import chỉ chứa `CLUSTER`, `BRANCH`, `DEPARTMENT`.
- Giữ nguyên các thay đổi chưa commit trong `.local-run/`; chỉ stage file thuộc task.
- Mọi text tiếng Việt phải được ghi UTF-8 và chạy preflight trước test/build.
- Mọi thay đổi quyền/trạng thái user phải ghi security event và thu hồi/chặn phiên theo chính sách.

---

### Task 1: Supabase Auth adapter và cấu hình runtime

**Files:**
- Create: `server/src/auth/supabase-auth.ts`
- Modify: `server/src/app.ts`
- Modify: `shared/contracts/auth.ts`
- Modify: `.env.example`
- Test: `tests/unit/supabase-auth.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, bearer/cookie token.
- Produces: `createSupabaseAuthAdapter()`, `verifyRequestUser(req)`, `createAuthUser()`, `inviteAuthUser()`, `updateAuthUser()`, `deleteAuthUser()`.

- [ ] **Step 1: Write the failing test** for token verification, missing configuration, admin secret isolation, and Auth Admin error normalization in `tests/unit/supabase-auth.test.ts`.
- [ ] **Step 2: Run the focused test**: `npm.cmd test -- --run tests/unit/supabase-auth.test.ts`; expected FAIL because the adapter is absent.
- [ ] **Step 3: Implement the adapter** with server-only `createClient`, `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`; expose typed methods and never serialize the secret key.
- [ ] **Step 4: Replace production auth resolution** in `server/src/app.ts` behind `AUTH_MODE=supabase`, while retaining custom credentials only for local/test compatibility.
- [ ] **Step 5: Run focused tests and typecheck**: `npm.cmd test -- --run tests/unit/supabase-auth.test.ts` and `npm.cmd run typecheck`; expected PASS.
- [ ] **Step 6: Commit**: `git add server/src/auth/supabase-auth.ts server/src/app.ts shared/contracts/auth.ts .env.example tests/unit/supabase-auth.test.ts; git commit -m "feat: add supabase auth adapter"`.

### Task 2: Link application profiles and add self-service password flows

**Files:**
- Create: `db/migrations/0101_supabase_auth_profiles.sql`
- Modify: `shared/contracts/auth.ts`
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Create: `src/components/auth/ChangePasswordPage.tsx`
- Modify: `src/App.tsx`
- Test: `tests/integration/supabase-auth-profile.test.ts`

**Interfaces:**
- Consumes: adapter from Task 1 and existing `UserProfile` records.
- Produces: `POST /api/v1/auth/change-password`, `POST /api/v1/auth/forgot-password`, profile `authUserId` mapping, and UI calls `changePassword()`/`forgotPassword()`.

- [ ] **Step 1: Add migration test assertions** for nullable backfill-safe `auth_user_id`, unique index, active status, and no direct grants to `anon`.
- [ ] **Step 2: Run the integration test** and observe FAIL on missing migration/routes.
- [ ] **Step 3: Add migration** with `auth_user_id uuid references auth.users(id) on delete restrict`, unique partial index, and RLS/grants matching server-only writes.
- [ ] **Step 4: Implement authenticated change/reset flows**; enforce 12-character minimum, optional current-password verification, audit event, and session refresh/revocation.
- [ ] **Step 5: Add the profile page and API methods** with accessible Vietnamese labels and no password echo.
- [ ] **Step 6: Run focused tests**: `npm.cmd test -- --run tests/integration/supabase-auth-profile.test.ts`; expected PASS.
- [ ] **Step 7: Commit** migration, contracts, API and UI.

### Task 3: Admin user lifecycle (create/invite, edit, lock, reset, delete)

**Files:**
- Modify: `shared/contracts/auth.ts`
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/admin/AdminPortal.tsx`
- Modify: `src/components/admin/UserManager.tsx`
- Test: `tests/integration/user-management.test.ts`
- Test: `tests/integration/admin-user-import.test.ts`

**Interfaces:**
- Consumes: Supabase adapter/profile mapping from Tasks 1–2.
- Produces: `PATCH /api/v1/admin/users/:id`, `POST .../disable`, `POST .../enable`, `DELETE ...`, invite/reset responses, and UI callbacks.

- [ ] **Step 1: Write failing integration cases** for admin edit, disable/enable, reset, soft-delete, last-admin protection, and invite response without plaintext password.
- [ ] **Step 2: Run focused integration tests** and confirm expected 404/405 failures.
- [ ] **Step 3: Implement server routes** with `requireAdmin`, Zod DTOs, optimistic `expectedUpdatedAt`, profile/Auth compensation, audit events, and session revocation.
- [ ] **Step 4: Wire `UserManager` cards/actions** for Sửa, Khóa/Mở, Reset mật khẩu, Xóa; add explicit create mode “Gửi lời mời” vs “Đặt mật khẩu tạm”.
- [ ] **Step 5: Update `AdminPortal` and `App.tsx` callbacks** and preserve filtered directory state after each mutation.
- [ ] **Step 6: Run focused tests plus `npm.cmd run typecheck`**; expected all PASS.
- [ ] **Step 7: Commit** the scoped user lifecycle changes.

### Task 4: Bulk organization import with deterministic hierarchy

**Files:**
- Create: `src/lib/org-unit-import.ts`
- Modify: `shared/contracts/org.ts`
- Modify: `server/src/app.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/admin/OrganizationManager.tsx`
- Modify: `src/components/admin/AdminPortal.tsx`
- Create: `public/templates/mau-nhap-don-vi.xlsx`
- Test: `tests/unit/org-unit-import.test.ts`
- Test: `tests/integration/organization-campaign-management.test.ts`

**Interfaces:**
- Consumes: `OrgUnit`, `ensureHeadOfficeOrgUnit()`, existing user import parser patterns.
- Produces: `parseOrgUnitImportFile()`, `POST /api/v1/admin/org-units/imports/preview`, `POST .../commit`, `BulkOrgUnitImportResult`.

- [ ] **Step 1: Write failing parser tests** for valid 3-level rows, missing parent, duplicate code, wrong type, and formula-string neutralization.
- [ ] **Step 2: Run `npm.cmd test -- --run tests/unit/org-unit-import.test.ts`** and confirm FAIL.
- [ ] **Step 3: Implement parser/validator** with first-sheet reading, max 500 rows, Vietnamese headers, normalized codes, and deterministic parent resolution.
- [ ] **Step 4: Add preview/commit routes** with `HEAD_OFFICE` bootstrap, full-batch validation, idempotency key, row-level errors, audit batch, and no partial writes after validation failure.
- [ ] **Step 5: Add template download, file picker, preview table and result CSV** to `OrganizationManager`.
- [ ] **Step 6: Extend integration tests** to prove empty snapshot bootstrap and cluster→branch→department import survives reload.
- [ ] **Step 7: Run focused unit/integration tests and typecheck**; expected PASS.
- [ ] **Step 8: Commit** parser, API, UI and template.

### Task 5: Migration tooling, documentation and cutover guard

**Files:**
- Create: `scripts/migrate-custom-users-to-supabase.mjs`
- Modify: `docs/HUONG_DAN_CAI_DAT_SU_DUNG_VAN_HANH_AUDITBGS.md`
- Modify: `.env.example`
- Modify: `tests/contract/api-contract.test.ts`
- Create: `tests/e2e/supabase-user-admin-smoke.mjs`

**Interfaces:**
- Consumes: old app user IDs/emails and Supabase service key from a secure process environment.
- Produces: dry-run/apply migration report, cutover checklist, contract assertions and E2E smoke script.

- [ ] **Step 1: Write dry-run contract tests** requiring no secret output, deterministic mapping, invite/reset status, and error CSV without password values.
- [ ] **Step 2: Run tests** and confirm FAIL because the script/contract is absent.
- [ ] **Step 3: Implement dry-run/apply script** with explicit `--input`, `--project-ref`, `--apply`; default dry-run, invite existing users, map profiles, and stop on duplicate email.
- [ ] **Step 4: Document Supabase Dashboard setup** (Auth provider, SMTP, redirect URL, secret storage, RLS, backup, rollback) and production `AUTH_MODE=supabase` guard.
- [ ] **Step 5: Add E2E smoke** admin invite → user set password → login → admin disable → access denied; run only against an explicitly configured test project.
- [ ] **Step 6: Run contract/E2E dry-run and `npm.cmd run ci`**; expected tests, typecheck, migrations and build PASS.
- [ ] **Step 7: Commit** migration tooling and operational documentation.

### Task 6: Final verification and release handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-29-supabase-auth-admin-plan.md` (checklist only)

- [ ] **Step 1:** Run UTF-8 preflight and `git diff --check`.
- [ ] **Step 2:** Run focused unit/integration suites for auth, users and org import.
- [ ] **Step 3:** Run `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run ci` with fresh output.
- [ ] **Step 4:** Start local web/API using existing scripts and smoke health, login, self-change-password, admin CRUD and org import without production credentials.
- [ ] **Step 5:** Verify browser bundle does not contain `SUPABASE_SECRET_KEY`, `service_role`, or plaintext password fields.
- [ ] **Step 6:** Reconcile `git status`, keep `.local-run/` untouched, and report local proof separately from Supabase/Vercel production cutover prerequisites.
