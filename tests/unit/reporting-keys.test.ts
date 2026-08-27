import { describe, expect, it } from 'vitest';
import {
  REPORT_FIELD_CATALOG,
  REPORT_METRIC_CATALOG,
  ReportExportRequestSchema,
  ReportFilterRuleSchema,
  ReportRunRequestSchema,
  UpdateReportCatalogConfigurationSchema,
} from '../../shared/contracts';

describe('standard reporting keys', () => {
  it('uses unique namespaced keys for every field and metric', () => {
    const keys = [
      ...REPORT_FIELD_CATALOG.map(item => item.key),
      ...REPORT_METRIC_CATALOG.map(item => item.key),
    ];

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(key => /^(dimension|date|measure|flag|metric)\.[a-z0-9_]+$/.test(key))).toBe(true);
    expect(REPORT_FIELD_CATALOG.map(item => item.key)).toEqual(expect.arrayContaining([
      'dimension.campaign',
      'dimension.campaign_decision',
    ]));
  });

  it('accepts operators only when they match the field value type', () => {
    expect(ReportFilterRuleSchema.safeParse({
      key: 'measure.exposure',
      operator: 'op.between',
      from: 1000,
      to: 5000,
    }).success).toBe(true);

    expect(ReportFilterRuleSchema.safeParse({
      key: 'measure.exposure',
      operator: 'op.contains',
      value: '5000',
    }).success).toBe(false);
  });

  it('rejects group keys and metrics outside the canonical catalog', () => {
    expect(ReportRunRequestSchema.safeParse({
      groupBy: 'branchCode',
      metrics: ['totalFindings'],
      rules: [],
    }).success).toBe(false);
  });

  it('accepts the three supported export formats and defaults to CSV', () => {
    const request = {
      query: { metrics: ['metric.finding_count'] },
      columns: ['dimension.cif'],
    };
    expect(ReportExportRequestSchema.parse(request).format).toBe('csv');
    expect(ReportExportRequestSchema.parse({ ...request, format: 'html' }).format).toBe('html');
    expect(ReportExportRequestSchema.parse({ ...request, format: 'xlsx' }).format).toBe('xlsx');
    expect(ReportExportRequestSchema.safeParse({ ...request, format: 'pdf' }).success).toBe(false);
  });

  it('exports every column an admin can mark as a default export column', () => {
    // The catalog lets an admin flag all exportable fields as default export columns, so the export
    // request has to accept that many; a lower cap rejected the workspace's own default selection.
    const everyExportableField = REPORT_FIELD_CATALOG.filter(field => field.exportable).map(field => field.key);
    expect(everyExportableField.length).toBeGreaterThan(0);
    expect(ReportExportRequestSchema.safeParse({
      query: { metrics: ['metric.finding_count'] },
      columns: everyExportableField,
      format: 'xlsx',
    }).success).toBe(true);
  });

  it('refuses duplicate display names because Excel tables need unique column names', () => {
    const configuration = (labelOf: (index: number) => string) => ({
      expectedVersion: 1,
      fields: REPORT_FIELD_CATALOG.map((field, index) => ({
        key: field.key,
        label: labelOf(index),
        isActive: true,
        filterable: ['dimension.cluster', 'dimension.branch', 'dimension.department', 'dimension.officer', 'dimension.workflow_status', 'dimension.sla_status'].includes(field.key),
        groupable: field.groupable,
        exportable: field.exportable,
        defaultExport: field.exportable,
        sortOrder: index,
      })),
      metrics: REPORT_METRIC_CATALOG.map((metric, index) => ({
        key: metric.key, label: metric.label, isActive: true, sortOrder: index,
      })),
    });

    expect(UpdateReportCatalogConfigurationSchema.safeParse(configuration(index => `Cột ${index}`)).success).toBe(true);
    const clash = UpdateReportCatalogConfigurationSchema.safeParse(configuration(() => 'Trùng tên'));
    expect(clash.success).toBe(false);
    expect(clash.success === false && clash.error.issues.some(issue => issue.message.includes('bị trùng'))).toBe(true);
  });

  it('persists the administrator-selected fields that may be used as report filters', () => {
    const parsed = UpdateReportCatalogConfigurationSchema.parse({
      expectedVersion: 1,
      fields: REPORT_FIELD_CATALOG.map((field, index) => ({
        key: field.key,
        label: field.label,
        isActive: true,
        filterable: field.key === 'dimension.branch' || field.key === 'dimension.officer',
        groupable: field.groupable,
        exportable: field.exportable,
        defaultExport: field.exportable,
        sortOrder: index,
      })),
      metrics: REPORT_METRIC_CATALOG.map((metric, index) => ({ key: metric.key, label: metric.label, isActive: true, sortOrder: index })),
    });

    expect(parsed.fields.find(field => field.key === 'dimension.branch')?.filterable).toBe(true);
    expect(parsed.fields.find(field => field.key === 'dimension.cif')?.filterable).toBe(false);
  });
});
