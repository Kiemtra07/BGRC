import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../server/src/app';
import { REPORT_FIELD_CATALOG, REPORT_METRIC_CATALOG, REPORT_PRESETS, ReportRunRequestSchema } from '../../shared/contracts';

const adminHeaders = { 'x-user-id': 'user-admin' };
const branchHeaders = { 'x-user-id': 'user-branch-635' };

describe('report drill-through and built-in presets', () => {
  afterAll(async () => {
    await app.close();
  });

  it('ships presets that the query schema and the field catalogue both accept', () => {
    expect(REPORT_PRESETS.length).toBeGreaterThan(0);
    const groupable = new Set(REPORT_FIELD_CATALOG.filter(field => field.groupable).map(field => field.key));
    const metrics = new Set(REPORT_METRIC_CATALOG.map(metric => metric.key));
    const ids = new Set<string>();

    for (const preset of REPORT_PRESETS) {
      expect(ids.has(preset.id), `Mã mẫu ${preset.id} bị trùng`).toBe(false);
      ids.add(preset.id);
      expect(preset.name.length, `Mẫu ${preset.id} phải có tên`).toBeGreaterThan(2);
      expect(preset.description.length, `Mẫu ${preset.id} phải có mô tả`).toBeGreaterThan(10);
      expect(ReportRunRequestSchema.safeParse(preset.query).success, `Truy vấn mẫu ${preset.id} không hợp lệ`).toBe(true);
      expect(groupable.has(preset.query.groupBy)).toBe(true);
      preset.query.metrics.forEach(key => expect(metrics.has(key)).toBe(true));
      // A preset that opens on the crosstab tab must actually define a column field, otherwise the
      // user lands on a tab the result cannot fill.
      if (preset.presentation === 'pivot') expect(preset.query.pivotBy).toBeDefined();
    }
  });

  it('runs every preset against the live server without a configuration error', async () => {
    for (const preset of REPORT_PRESETS) {
      const run = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/runs',
        headers: adminHeaders,
        payload: preset.query,
      });
      expect(run.statusCode, `Mẫu ${preset.id}: ${run.body}`).toBe(200);
      if (preset.query.pivotBy) expect(run.json().pivot).toBeDefined();
    }
  });

  it('returns the findings behind one group and pages through them', async () => {
    const run = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/runs',
      headers: adminHeaders,
      payload: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
    });
    const group = run.json().groups[0];
    expect(group).toBeDefined();

    const drill = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/drill',
      headers: adminHeaders,
      payload: { query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] }, rowKey: group.key, pageSize: 5 },
    });

    expect(drill.statusCode).toBe(200);
    const body = drill.json();
    expect(body.total).toBe(group.metricValues['metric.finding_count']);
    expect(body.rowLabel).toBe(group.label);
    expect(body.rows.length).toBe(Math.min(5, body.total));
    body.rows.forEach((row: { branchCode: string }) => expect(row.branchCode).toBe(group.key));
  });

  it('narrows to a single crosstab cell when a column key is supplied', async () => {
    const query = { groupBy: 'dimension.branch', pivotBy: 'dimension.workflow_status', metrics: ['metric.finding_count'] };
    const run = await app.inject({ method: 'POST', url: '/api/v1/reports/runs', headers: adminHeaders, payload: query });
    const pivot = run.json().pivot;
    const cell = pivot.rows.flatMap((row: { key: string; values: Record<string, number> }) => pivot.columns
      .filter((column: { key: string }) => (row.values[column.key] || 0) > 0)
      .map((column: { key: string }) => ({ rowKey: row.key, columnKey: column.key, value: row.values[column.key] })))[0];
    expect(cell).toBeDefined();

    const drill = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/drill',
      headers: adminHeaders,
      payload: { query, rowKey: cell.rowKey, columnKey: cell.columnKey },
    });

    expect(drill.statusCode).toBe(200);
    expect(drill.json().total).toBe(cell.value);
    drill.json().rows.forEach((row: { branchCode: string; workflowStatusLabel: string }) => {
      expect(row.branchCode).toBe(cell.rowKey);
      expect(row.workflowStatusLabel.length).toBeGreaterThan(0);
    });
  });

  it('honours the caller data scope instead of the branch key they ask for', async () => {
    const query = { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] };
    const [adminDrill, branchDrill] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/reports/drill', headers: adminHeaders, payload: { query, rowKey: '102' } }),
      app.inject({ method: 'POST', url: '/api/v1/reports/drill', headers: branchHeaders, payload: { query, rowKey: '102' } }),
    ]);

    expect(adminDrill.statusCode).toBe(200);
    expect(adminDrill.json().total).toBeGreaterThan(0);
    // A branch user asking for another branch's cell gets an empty result, never that branch's rows.
    expect(branchDrill.statusCode).toBe(200);
    expect(branchDrill.json().total).toBe(0);
    expect(branchDrill.json().rows).toEqual([]);
  });

  it('rejects a drill whose filter rule is not a valid report rule', async () => {
    const drill = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/drill',
      headers: adminHeaders,
      payload: {
        query: { rules: [{ key: 'dimension.branch', operator: 'op.gte', value: '102' }], groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
      },
    });

    expect(drill.statusCode).toBe(422);
  });
});
