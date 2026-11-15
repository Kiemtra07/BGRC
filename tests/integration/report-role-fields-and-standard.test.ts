import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const admin = { 'x-user-id': 'user-admin' };
const officer = { 'x-user-id': 'user-internal-officer' };
const branchInput = { 'x-user-id': 'user-branch-635' };

type CatalogConfiguration = {
  version: number;
  fields: Array<Record<string, any>>;
  metrics: Array<Record<string, any>>;
};

const writable = (configuration: CatalogConfiguration, hideFieldForBranchInput: string[] = [], hideMetricForBranchInput: string[] = []) => ({
  expectedVersion: configuration.version,
  fields: configuration.fields.map(field => ({
    key: field.key,
    label: field.label,
    isActive: field.isActive,
    filterable: field.filterable,
    groupable: field.groupable,
    exportable: field.exportable,
    defaultExport: field.defaultExport,
    sortOrder: field.sortOrder,
    hiddenForRoles: hideFieldForBranchInput.includes(field.key) ? ['BRANCH_INPUT'] : [],
  })),
  metrics: configuration.metrics.map(metric => ({
    key: metric.key,
    label: metric.label,
    isActive: metric.isActive,
    sortOrder: metric.sortOrder,
    hiddenForRoles: hideMetricForBranchInput.includes(metric.key) ? ['BRANCH_INPUT'] : [],
  })),
});

const readConfiguration = async (): Promise<CatalogConfiguration> =>
  (await app.inject({ method: 'GET', url: '/api/v1/admin/report-catalog', headers: admin })).json();

afterAll(async () => {
  await app.close();
});

describe('bộ trường báo cáo theo vai trò', () => {
  it('ẩn trường và chỉ số với một vai trò: danh mục, chạy, xuất và chia sẻ đều theo', async () => {
    const original = await readConfiguration();
    try {
      const saved = await app.inject({
        method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin,
        payload: writable(original, ['dimension.officer'], ['metric.credit_balance_sum']),
      });
      expect(saved.statusCode, saved.body).toBe(200);

      const adminCatalog = (await app.inject({ method: 'GET', url: '/api/v1/reports/catalog', headers: admin })).json();
      const inputCatalog = (await app.inject({ method: 'GET', url: '/api/v1/reports/catalog', headers: branchInput })).json();
      const officerCatalog = (await app.inject({ method: 'GET', url: '/api/v1/reports/catalog', headers: officer })).json();
      const hasField = (catalog: any, key: string) => catalog.fields.some((field: any) => field.key === key);
      const hasMetric = (catalog: any, key: string) => catalog.metrics.some((metric: any) => metric.key === key);

      // Quản trị viên và vai trò khác vẫn thấy đủ; chỉ vai trò bị ẩn mất trường.
      expect(hasField(adminCatalog, 'dimension.officer')).toBe(true);
      expect(hasField(officerCatalog, 'dimension.officer')).toBe(true);
      expect(hasField(inputCatalog, 'dimension.officer')).toBe(false);
      expect(hasField(inputCatalog, 'dimension.branch')).toBe(true);
      expect(hasMetric(inputCatalog, 'metric.credit_balance_sum')).toBe(false);
      expect(hasMetric(officerCatalog, 'metric.credit_balance_sum') || !hasMetric(adminCatalog, 'metric.credit_balance_sum')).toBe(true);

      const hiddenGroup = await app.inject({
        method: 'POST', url: '/api/v1/reports/runs', headers: branchInput,
        payload: { groupBy: 'dimension.officer', metrics: ['metric.finding_count'] },
      });
      expect(hiddenGroup.statusCode).toBe(422);
      expect(hiddenGroup.json()).toMatchObject({ code: 'REPORT_GROUP_DISABLED' });

      const hiddenMetric = await app.inject({
        method: 'POST', url: '/api/v1/reports/runs', headers: branchInput,
        payload: { groupBy: 'dimension.branch', metrics: ['metric.credit_balance_sum'] },
      });
      expect(hiddenMetric.statusCode).toBe(422);
      expect(hiddenMetric.json()).toMatchObject({ code: 'REPORT_METRIC_DISABLED' });

      const allowed = await app.inject({
        method: 'POST', url: '/api/v1/reports/runs', headers: branchInput,
        payload: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
      });
      expect(allowed.statusCode, allowed.body).toBe(200);

      const adminStillRuns = await app.inject({
        method: 'POST', url: '/api/v1/reports/runs', headers: admin,
        payload: { groupBy: 'dimension.officer', metrics: ['metric.finding_count'] },
      });
      expect(adminStillRuns.statusCode, adminStillRuns.body).toBe(200);

      const hiddenExport = await app.inject({
        method: 'POST', url: '/api/v1/reports/exports', headers: branchInput,
        payload: { format: 'csv', query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] }, columns: ['dimension.officer'] },
      });
      expect(hiddenExport.statusCode).toBe(422);
      expect(hiddenExport.json()).toMatchObject({ code: 'REPORT_EXPORT_FIELD_DISABLED' });

      // Chia sẻ báo cáo dùng trường bị ẩn cho vai trò đó bị chặn ngay lúc chia sẻ.
      const shareHidden = await app.inject({
        method: 'POST', url: '/api/v1/reports/definitions', headers: officer,
        payload: {
          name: 'Theo cán bộ kiểm tra',
          query: { groupBy: 'dimension.officer', metrics: ['metric.finding_count'] },
          exportColumns: ['dimension.officer'],
          visibility: 'ROLE_SHARED', sharedWithRoles: ['BRANCH_INPUT'],
        },
      });
      expect(shareHidden.statusCode, shareHidden.body).toBe(422);
      expect(shareHidden.json()).toMatchObject({ code: 'REPORT_NOT_AVAILABLE_FOR_ROLE' });
    } finally {
      const latest = await readConfiguration();
      const restore = writable(original);
      restore.expectedVersion = latest.version;
      expect((await app.inject({ method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin, payload: restore })).statusCode).toBe(200);
    }
  });

  it('không cho ẩn hết trường để nhóm hoặc hết chỉ số của một vai trò', async () => {
    const original = await readConfiguration();
    const everyGroupable = original.fields.filter(field => field.isActive && field.groupable).map(field => field.key as string);
    const response = await app.inject({
      method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin,
      payload: writable(original, everyGroupable),
    });
    expect(response.statusCode).toBe(422);
  });
});

describe('báo cáo chuẩn', () => {
  it('chỉ quản trị viên đặt và thu hồi, người dùng không sửa hay xóa được, lưu bản sao thì được', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/reports/definitions', headers: officer,
      payload: { name: 'Tồn đọng theo đơn vị', exportColumns: ['dimension.branch'], visibility: 'ROLE_SHARED', sharedWithRoles: ['BRANCH_INPUT'] },
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id as string;
    expect(created.json().isStandard).toBeUndefined();

    const selfPublish = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: officer, payload: { isStandard: true } });
    expect(selfPublish.statusCode).toBe(403);
    expect(selfPublish.json()).toMatchObject({ code: 'REPORT_STANDARD_ADMIN_ONLY' });

    const published = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: admin, payload: { isStandard: true } });
    expect(published.statusCode, published.body).toBe(200);
    expect(published.json()).toMatchObject({ isStandard: true, visibility: 'ROLE_SHARED' });

    // Chủ báo cáo cũng bị khóa sau khi đã là báo cáo chuẩn.
    const ownerEdit = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: officer, payload: { name: 'Tự ý đổi tên' } });
    expect(ownerEdit.statusCode).toBe(403);
    expect(ownerEdit.json()).toMatchObject({ code: 'REPORT_DEFINITION_STANDARD_LOCKED' });
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: officer })).statusCode).toBe(403);

    // Người được chia sẻ vẫn thấy và dùng báo cáo chuẩn.
    const listed = (await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers: branchInput })).json() as Array<{ id: string; isStandard?: boolean }>;
    expect(listed.find(item => item.id === id)?.isStandard).toBe(true);

    // Đưa về riêng tư thì tự thu hồi chuẩn, và lỗi không để lại trạng thái dở dang.
    const refused = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: admin, payload: { visibility: 'ROLE_SHARED', sharedWithRoles: [], isStandard: true } });
    expect(refused.statusCode).toBe(422);
    const stillStandard = (await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers: admin })).json() as Array<{ id: string; isStandard?: boolean; sharedWithRoles: string[] }>;
    expect(stillStandard.find(item => item.id === id)).toMatchObject({ isStandard: true, sharedWithRoles: ['BRANCH_INPUT'] });

    const withdrawn = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: admin, payload: { visibility: 'PRIVATE' } });
    expect(withdrawn.statusCode, withdrawn.body).toBe(200);
    expect(withdrawn.json().isStandard).toBeUndefined();

    expect((await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: admin })).statusCode).toBe(204);
  });

  it('báo cáo chuẩn phải chia sẻ cho ít nhất một vai trò', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/reports/definitions', headers: admin,
      payload: { name: 'Báo cáo riêng của quản trị', exportColumns: ['dimension.branch'] },
    });
    const id = created.json().id as string;
    const response = await app.inject({ method: 'PATCH', url: `/api/v1/reports/definitions/${id}`, headers: admin, payload: { isStandard: true } });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'REPORT_STANDARD_NEEDS_ROLES' });
    await app.inject({ method: 'DELETE', url: `/api/v1/reports/definitions/${id}`, headers: admin });
  });
});
