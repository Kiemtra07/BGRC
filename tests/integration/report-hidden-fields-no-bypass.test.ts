import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';

const admin = { 'x-user-id': 'user-admin' };
const officer = { 'x-user-id': 'user-internal-officer' };

type Configuration = { version: number; fields: Array<Record<string, any>>; metrics: Array<Record<string, any>> };

const readConfiguration = async (): Promise<Configuration> =>
  (await app.inject({ method: 'GET', url: '/api/v1/admin/report-catalog', headers: admin })).json();

const writable = (
  configuration: Configuration,
  options: { hiddenForOfficer?: string[]; notExportable?: string[] },
) => ({
  expectedVersion: configuration.version,
  fields: configuration.fields.map(field => {
    const exportable = !options.notExportable?.includes(field.key) && field.exportable;
    return {
      key: field.key,
      label: field.label,
      isActive: field.isActive,
      filterable: field.filterable,
      groupable: field.groupable,
      exportable,
      defaultExport: exportable && field.defaultExport,
      sortOrder: field.sortOrder,
      hiddenForRoles: options.hiddenForOfficer?.includes(field.key) ? ['INTERNAL_OFFICER'] : [],
    };
  }),
  metrics: configuration.metrics.map(metric => ({
    key: metric.key,
    label: metric.label,
    isActive: metric.isActive,
    sortOrder: metric.sortOrder,
    hiddenForRoles: [],
  })),
});

const drillBody = {
  query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
  pageSize: 100,
};

afterAll(async () => {
  await app.close();
});

describe('trường bị ẩn hoặc tắt xuất không lọt qua các đường báo cáo phụ', () => {
  it('drill không trả CIF, tên khách hàng, dư nợ và giá trị ảnh hưởng cho vai trò bị ẩn các trường đó', async () => {
    const original = await readConfiguration();
    try {
      const saved = await app.inject({
        method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin,
        payload: writable(original, { hiddenForOfficer: ['dimension.cif', 'dimension.customer', 'measure.credit_balance', 'measure.exposure'] }),
      });
      expect(saved.statusCode, saved.body).toBe(200);

      const hidden = await app.inject({ method: 'POST', url: '/api/v1/reports/drill', headers: officer, payload: drillBody });
      expect(hidden.statusCode, hidden.body).toBe(200);
      const rows = hidden.json().rows as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).not.toHaveProperty('cif');
        expect(row).not.toHaveProperty('customerName');
        expect(row).not.toHaveProperty('creditBalance');
        expect(row).not.toHaveProperty('exposureAmount');
        expect(row).toHaveProperty('errorCode');
      }

      const full = await app.inject({ method: 'POST', url: '/api/v1/reports/drill', headers: admin, payload: drillBody });
      expect(full.statusCode, full.body).toBe(200);
      expect(full.json().rows[0]).toHaveProperty('cif');
      expect(full.json().rows[0]).toHaveProperty('creditBalance');
    } finally {
      const current = await readConfiguration();
      await app.inject({ method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin, payload: writable({ ...original, version: current.version }, {}) });
    }
  });

  it('CSV danh sách hồ sơ bỏ cột bị ẩn với vai trò và cột đã tắt xuất', async () => {
    const original = await readConfiguration();
    try {
      const baseline = await app.inject({ method: 'GET', url: '/api/v1/reports/findings.csv', headers: officer });
      expect(baseline.statusCode, baseline.body).toBe(200);
      expect(baseline.body.split('\r\n')[0]).toContain('Tên khách hàng');

      const saved = await app.inject({
        method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin,
        payload: writable(original, {
          hiddenForOfficer: ['dimension.customer', 'measure.credit_balance'],
          notExportable: ['dimension.officer'],
        }),
      });
      expect(saved.statusCode, saved.body).toBe(200);

      const officerCsv = await app.inject({ method: 'GET', url: '/api/v1/reports/findings.csv', headers: officer });
      expect(officerCsv.statusCode, officerCsv.body).toBe(200);
      const officerHeader = officerCsv.body.split('\r\n')[0];
      expect(officerHeader).not.toContain('Tên khách hàng');
      expect(officerHeader).not.toContain('Dư nợ');
      expect(officerHeader).not.toContain('Cán bộ');
      expect(officerHeader).toContain('Mã lỗi');

      const adminCsv = await app.inject({ method: 'GET', url: '/api/v1/reports/findings.csv', headers: admin });
      const adminHeader = adminCsv.body.split('\r\n')[0];
      expect(adminHeader).toContain('Tên khách hàng');
      expect(adminHeader).toContain('Dư nợ');
      expect(adminHeader).not.toContain('Cán bộ');
    } finally {
      const current = await readConfiguration();
      await app.inject({ method: 'PUT', url: '/api/v1/admin/report-catalog', headers: admin, payload: writable({ ...original, version: current.version }, {}) });
    }
  });
});
