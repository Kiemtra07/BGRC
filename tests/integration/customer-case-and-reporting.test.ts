import { afterAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { app } from '../../server/src/app';

const adminHeaders = { 'x-user-id': 'user-admin' };

describe('customer case, branch control, import and reporting', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns one customer case containing every recorded error code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/customers/10482910/case',
      headers: { 'x-user-id': 'user-branch-635' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      cif: '10482910',
      branchCode: '635',
      department: 'Phòng QLKH 1',
      totalFindings: 2,
    });
    expect(response.json().findings.map((item: { errorCode: string }) => item.errorCode)).toEqual([
      'TD01.01',
      'TD05.05',
    ]);
  });

  it('keeps cluster as geography while departments belong to a branch and users belong to departments', async () => {
    const [orgResponse, userResponse] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/admin/org-units',
        headers: { 'x-user-id': 'user-admin' },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { 'x-user-id': 'user-admin' },
      }),
    ]);

    const units = orgResponse.json();
    const branch = units.find((unit: { code: string }) => unit.code === '635');
    const departments = units.filter((unit: { type: string; parentId?: string }) => unit.type === 'DEPARTMENT' && unit.parentId === branch.id);
    const controller = userResponse.json().find((user: { id: string }) => user.id === 'user-branch-controller-635');

    expect(departments.map((unit: { name: string }) => unit.name)).toContain('Phòng Kiểm soát chi nhánh');
    expect(controller).toMatchObject({
      primaryRole: 'BRANCH_CONTROLLER',
      branchCode: '635',
      department: 'Phòng Kiểm soát chi nhánh',
      scopes: [{ scopeType: 'BRANCH', orgUnitCode: '635' }],
    });
  });

  it('lets branch control approve its own branch finding without any cluster approval role', async () => {
    const controller = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: adminHeaders,
      payload: {
        fullName: 'Kiểm soát Chi nhánh 428',
        email: 'controller.428@bank.com.vn',
        portal: 'BRANCH',
        roles: ['BRANCH_CONTROLLER'],
        primaryRole: 'BRANCH_CONTROLLER',
        branchCode: '428',
        branchName: 'Chi nhánh Bình Tây Sài Gòn',
        department: 'Phòng Kiểm soát chi nhánh',
        isActive: true,
      },
    });
    expect(controller.statusCode).toBe(200);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-002/actions/branch-control-approve',
      headers: { 'x-user-id': controller.json().user.id, 'idempotency-key': 'approve-own-branch-428' },
      payload: { expectedVersion: 2, notes: 'Hồ sơ và chứng cứ phù hợp, chuyển cán bộ kiểm tra.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ workflowStatus: 'SUBMITTED_INTERNAL', version: 3 });
  });

  it('blocks branch control approval when no available evidence exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-004/actions/branch-control-approve',
      headers: { 'x-user-id': 'user-branch-controller-635', 'idempotency-key': 'approve-without-evidence-635' },
      payload: { expectedVersion: 2, notes: 'Không được duyệt vì thực tế chưa có tệp minh chứng.' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'EVIDENCE_REQUIRED_FOR_WORKFLOW' });
  });

  it('reports evidenceCount from available metadata instead of stale projections', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-003',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().evidences).toHaveLength(1);
    expect(response.json().evidenceCount).toBe(1);
  });

  it('serves a real multi-page PDF for seeded local evidence metadata', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/evidence/drive_mock_002/content',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.startsWith('%PDF-1.4')).toBe(true);
    expect(response.body).toContain('/Count 3');
  });

  it('stores multiple child issues and lets reviewers decide each item separately', async () => {
    const detail = await app.inject({ method: 'GET', url: '/api/v1/findings/find-003', headers: adminHeaders });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().subItems.length).toBeGreaterThanOrEqual(3);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-003/sub-items',
      headers: { 'x-user-id': 'user-internal-officer' },
      payload: { content: 'Chưa đối chiếu đầy đủ số liệu tồn kho với báo cáo tài chính.' },
    });
    expect(created.statusCode).toBe(201);

    const subItems = created.json().subItems;
    const decisions = subItems.map((item: { id: string }, index: number) => ({
      subItemId: item.id,
      decision: index === 0 ? 'RETURN' : 'ACCEPT',
    }));
    const reviewed = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-003/sub-items/review',
      headers: { 'x-user-id': 'user-internal-supervisor' },
      payload: { decisions, reviewNote: 'Chấp nhận các ý có đủ chứng từ, chuyển trả ý đầu tiên.' },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().subItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: subItems[0].id, status: 'RETURNED' }),
      expect.objectContaining({ id: subItems[1].id, status: 'ACCEPTED' }),
    ]));
  });

  it('requires available evidence before a reviewer accepts every child issue', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: '/api/v1/findings/find-004',
      headers: { 'x-user-id': 'user-branch-controller-635' },
    });
    const decisions = detail.json().subItems.map((item: { id: string }) => ({ subItemId: item.id, decision: 'ACCEPT' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/findings/find-004/sub-items/review',
      headers: { 'x-user-id': 'user-branch-controller-635' },
      payload: { decisions, reviewNote: 'Đề nghị chấp nhận toàn bộ.' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'EVIDENCE_REQUIRED_FOR_WORKFLOW' });
  });

  it('imports multiple error rows for the same customer as one customer case', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/findings',
      headers: { 'x-user-id': 'user-internal-officer' },
      payload: {
        sourceFileName: 'TIEU_BIEN_BAN_KHCN.xlsx',
        rows: [
          {
            channelId: 'chan-audit-bgs',
            cif: 'CASE-IMPORT-01',
            customerName: 'Khách hàng nhập thử',
            clusterName: 'Cụm Tây Nguyên',
            branchCode: '635',
            branchName: 'Chi nhánh Nam Buôn Hồ',
            department: 'PGD Nam Buôn Hồ 1',
            decisionNo: '23179/QD-BIDV ngày 08/11/2024',
            auditDate: '2024-10-31',
            loanGroup: 'Nhóm 1',
            collateralValue: 2500,
            loanPurpose: 'Bổ sung vốn lưu động phục vụ phương án kinh doanh',
            errorCode: 'TD03.07',
            errorTitle: 'Báo cáo đề xuất chưa đầy đủ',
            description: 'Báo cáo đề xuất chưa đánh giá đầy đủ phương án kinh doanh.',
            quantity: 2,
            exposureAmount: 1000,
          },
          {
            channelId: 'chan-audit-bgs',
            cif: 'CASE-IMPORT-01',
            customerName: 'Khách hàng nhập thử',
            clusterName: 'Cụm Tây Nguyên',
            branchCode: '635',
            branchName: 'Chi nhánh Nam Buôn Hồ',
            department: 'PGD Nam Buôn Hồ 1',
            decisionNo: '23179/QD-BIDV ngày 08/11/2024',
            auditDate: '2024-10-31',
            loanGroup: 'Nhóm 1',
            collateralValue: 2500,
            loanPurpose: 'Bổ sung vốn lưu động phục vụ phương án kinh doanh',
            errorCode: 'TD06.03',
            errorTitle: 'Sử dụng vốn chưa đúng mục đích',
            description: 'Dòng tiền giải ngân đi qua tài khoản trung gian và quay lại khách hàng.',
            exposureAmount: 1000,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ customerCount: 1, findingCount: 2, duplicateCount: 0 });

    const customerCase = await app.inject({
      method: 'GET',
      url: '/api/v1/customers/CASE-IMPORT-01/case',
      headers: { 'x-user-id': 'user-branch-635' },
    });
    const importedFindings = customerCase.json().findings;
    expect(importedFindings).toHaveLength(2);
    expect(importedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        errorCode: 'TD03.07',
        decisionNo: '23179/QD-BIDV ngày 08/11/2024',
        auditDate: '2024-10-31',
        loanGroup: 'Nhóm 1',
        collateralValue: 2500,
        loanPurpose: 'Bổ sung vốn lưu động phục vụ phương án kinh doanh',
        quantity: 2,
      }),
    ]));
  });

  it('preserves an imported deadline and otherwise derives it from the channel SLA configuration', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/findings',
      headers: { 'x-user-id': 'user-internal-officer' },
      payload: {
        sourceFileName: 'deadline-preservation.xlsx',
        rows: [
          {
            channelId: 'chan-audit-bgs', cif: 'SLA-IMPORT-EXPLICIT', customerName: 'Khách hàng giữ hạn', clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
            auditDate: '2024-02-28', deadlineDate: '2024-03-05', errorCode: 'TD91.01', errorTitle: 'Giữ hạn từ Excel', description: 'Hạn xử lý được nạp từ hàng Excel và phải được giữ nguyên.', exposureAmount: 1,
          },
          {
            channelId: 'chan-audit-bgs', cif: 'SLA-IMPORT-DERIVED', customerName: 'Khách hàng tính hạn', clusterName: 'Cụm Tây Nguyên', branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ',
            auditDate: '2024-02-28', errorCode: 'TD91.02', errorTitle: 'Tính hạn theo kênh', description: 'Không có hạn nguồn nên phải dùng cấu hình SLA của kênh.', exposureAmount: 1,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ cif: 'SLA-IMPORT-EXPLICIT', deadlineDate: '2024-03-05', slaStatus: 'OVERDUE', isOverdue: true }),
      expect.objectContaining({ cif: 'SLA-IMPORT-DERIVED', deadlineDate: '2024-03-14', slaStatus: 'OVERDUE', isOverdue: true }),
    ]));
  });

  it('deduplicates repeated rows inside the same import batch', async () => {
    const row = {
      channelId: 'chan-audit-bgs',
      cif: 'BATCH-DUP-01',
      customerName: 'Khách hàng bị lặp dòng Excel',
      clusterName: 'Cụm Tây Nguyên',
      branchCode: '635',
      branchName: 'Chi nhánh Nam Buôn Hồ',
      department: 'PGD Nam Buôn Hồ 1',
      decisionNo: 'QĐ-DUP-2026/01',
      errorCode: 'TD97.01',
      errorTitle: 'Dòng dữ liệu bị nhập lặp',
      description: 'Hai dòng giống hệt nhau trong cùng một file chỉ được tạo một sai sót.',
      exposureAmount: 50,
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/findings',
      headers: { 'x-user-id': 'user-internal-officer' },
      payload: { sourceFileName: 'duplicate-rows.xlsx', rows: [row, { ...row }] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ findingCount: 1, duplicateCount: 1 });
  });

  it('provides report aggregates and a CSV export for authorized users', async () => {
    const [summary, csv] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/reports/summary',
        headers: { 'x-user-id': 'user-internal-officer' },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/reports/findings.csv',
        headers: { 'x-user-id': 'user-internal-officer' },
      }),
    ]);

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ totalCustomers: expect.any(Number), totalFindings: expect.any(Number) });
    expect(summary.json().byBranch).toEqual(expect.arrayContaining([
      expect.objectContaining({ branchCode: '635', customerCount: expect.any(Number), findingCount: expect.any(Number) }),
    ]));
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('CIF,Tên khách hàng,Cụm,Chi nhánh,Phòng');
  });

  it('publishes a canonical report-key catalog and executes typed report filters', async () => {
    const catalog = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/catalog',
      headers: adminHeaders,
    });

    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'dimension.branch', valueType: 'ENUM', groupable: true }),
      expect.objectContaining({ key: 'measure.exposure', valueType: 'NUMBER', groupable: false }),
    ]));
    expect(catalog.json().metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'metric.finding_count' }),
      expect.objectContaining({ key: 'metric.exposure_sum' }),
    ]));
    expect(catalog.json().operators).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'op.eq' }),
      expect.objectContaining({ key: 'op.between' }),
    ]));

    const run = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/runs',
      headers: adminHeaders,
      payload: {
        rules: [
          { key: 'dimension.branch', operator: 'op.eq', value: '102' },
          { key: 'measure.exposure', operator: 'op.gte', value: 5000 },
          { key: 'date.audit', operator: 'op.between', from: '2026-07-01', to: '2026-07-31' },
          { key: 'flag.overdue', operator: 'op.is_false' },
        ],
        groupBy: 'dimension.error_code',
        metrics: ['metric.customer_count', 'metric.finding_count', 'metric.exposure_sum'],
      },
    });

    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({
      matchedFindingCount: 1,
      metricValues: {
        'metric.customer_count': 1,
        'metric.finding_count': 1,
        'metric.exposure_sum': 6000,
      },
    });
    expect(run.json().groups).toEqual([
      expect.objectContaining({ key: 'TD03.02', label: 'TD03.02' }),
    ]);

    const crosstab = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/runs',
      headers: adminHeaders,
      payload: {
        groupBy: 'dimension.branch',
        pivotBy: 'dimension.workflow_status',
        metrics: ['metric.finding_count'],
      },
    });
    expect(crosstab.statusCode).toBe(200);
    expect(crosstab.json().pivot).toMatchObject({
      rowField: 'dimension.branch',
      columnField: 'dimension.workflow_status',
      metric: 'metric.finding_count',
    });
    expect(crosstab.json().pivot.columns.length).toBeGreaterThan(0);

    const branchCatalog = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/catalog',
      headers: { 'x-user-id': 'user-branch-635' },
    });
    const branchOptions = branchCatalog.json().fields.find((field: { key: string }) => field.key === 'dimension.branch').options;
    expect(branchOptions).toEqual([{ value: '635', label: '635 · Chi nhánh Nam Buôn Hồ' }]);
  });

  it('lets only administrators edit report labels, visibility and export defaults', async () => {
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/report-catalog',
      headers: { 'x-user-id': 'user-internal-officer' },
    });
    expect(forbidden.statusCode).toBe(403);

    const current = await app.inject({ method: 'GET', url: '/api/v1/admin/report-catalog', headers: adminHeaders });
    expect(current.statusCode).toBe(200);
    const original = current.json();
    const writable = (configuration: typeof original) => ({
      expectedVersion: configuration.version,
      fields: configuration.fields.map((field: any) => ({
        key: field.key,
        label: field.label,
        isActive: field.isActive,
        filterable: field.filterable,
        groupable: field.groupable,
        exportable: field.exportable,
        defaultExport: field.defaultExport,
        sortOrder: field.sortOrder,
      })),
      metrics: configuration.metrics.map((metric: any) => ({
        key: metric.key,
        label: metric.label,
        isActive: metric.isActive,
        sortOrder: metric.sortOrder,
      })),
    });

    const changedPayload = writable(original);
    changedPayload.fields = changedPayload.fields.map((field: any) => field.key === 'dimension.branch'
      ? { ...field, label: 'Đơn vị kinh doanh' }
      : field.key === 'flag.overdue'
        ? { ...field, isActive: false, filterable: false, defaultExport: false }
        : field);

    try {
      const saved = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/report-catalog',
        headers: adminHeaders,
        payload: changedPayload,
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().version).toBe(original.version + 1);

      const catalog = await app.inject({ method: 'GET', url: '/api/v1/reports/catalog', headers: adminHeaders });
      expect(catalog.json().fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'dimension.branch', label: 'Đơn vị kinh doanh' }),
      ]));
      expect(catalog.json().fields.some((field: any) => field.key === 'flag.overdue')).toBe(false);

      const disabledRun = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/runs',
        headers: adminHeaders,
        payload: { rules: [{ key: 'flag.overdue', operator: 'op.is_true' }], metrics: ['metric.finding_count'] },
      });
      expect(disabledRun.statusCode).toBe(422);
      expect(disabledRun.json()).toMatchObject({ code: 'REPORT_FIELD_DISABLED' });
    } finally {
      const latest = await app.inject({ method: 'GET', url: '/api/v1/admin/report-catalog', headers: adminHeaders });
      const restorePayload = writable(original);
      restorePayload.expectedVersion = latest.json().version;
      const restored = await app.inject({ method: 'PUT', url: '/api/v1/admin/report-catalog', headers: adminHeaders, payload: restorePayload });
      expect(restored.statusCode).toBe(200);
    }
  });

  it('shares report definitions by role and composes an accessible multi-widget dashboard', async () => {
    const sharedReport = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/definitions',
      headers: adminHeaders,
      payload: {
        name: 'Tồn đọng dành cho người xem',
        filters: {}, columns: [], exportColumns: ['dimension.cif'],
        query: { groupBy: 'dimension.branch', metrics: ['metric.finding_count'] },
        visibility: 'ROLE_SHARED', sharedWithRoles: ['INTERNAL_OFFICER'],
      },
    });
    expect(sharedReport.statusCode).toBe(201);
    expect(sharedReport.json()).toMatchObject({ visibility: 'ROLE_SHARED', sharedWithRoles: ['INTERNAL_OFFICER'] });

    const officerReports = await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers: { 'x-user-id': 'user-internal-officer' } });
    expect(officerReports.statusCode).toBe(200);
    expect(officerReports.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: sharedReport.json().id })]));

    const branchReports = await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers: { 'x-user-id': 'user-branch-635' } });
    expect(branchReports.statusCode).toBe(200);
    expect(branchReports.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: sharedReport.json().id })]));

    const dashboard = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/dashboards',
      headers: adminHeaders,
      payload: {
        name: 'Bảng theo dõi người xem', reportDefinitionIds: [sharedReport.json().id],
        visibility: 'ROLE_SHARED', sharedWithRoles: ['INTERNAL_OFFICER'],
      },
    });
    expect(dashboard.statusCode).toBe(201);
    expect(dashboard.json()).toMatchObject({ name: 'Bảng theo dõi người xem', reportDefinitionIds: [sharedReport.json().id] });

    const officerDashboards = await app.inject({ method: 'GET', url: '/api/v1/reports/dashboards', headers: { 'x-user-id': 'user-internal-officer' } });
    expect(officerDashboards.statusCode).toBe(200);
    expect(officerDashboards.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: dashboard.json().id })]));
  });

  it('rejects incompatible report operators and exports full reports in CSV, HTML and XLSX', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/runs',
      headers: adminHeaders,
      payload: {
        rules: [{ key: 'measure.exposure', operator: 'op.contains', value: '6000' }],
        metrics: ['metric.finding_count'],
      },
    });
    expect(invalid.statusCode).toBe(422);

    const exportPayload = {
      query: {
        rules: [{ key: 'dimension.branch', operator: 'op.eq', value: '102' }],
        metrics: ['metric.finding_count'],
      },
      columns: ['dimension.cif', 'dimension.customer', 'dimension.error_code', 'measure.exposure'],
    };
    const [csv, html, xlsx] = await Promise.all(['csv', 'html', 'xlsx'].map(format => app.inject({
      method: 'POST',
      url: '/api/v1/reports/exports',
      headers: adminHeaders,
      payload: { ...exportPayload, format },
    })));

    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    // Headers are quoted like the data cells: a report field can be renamed to contain a comma.
    expect(csv.body).toContain('"CIF","Tên khách hàng","Mã lỗi","Giá trị ảnh hưởng"');
    expect(csv.body).toContain('10993821');
    expect(csv.body).not.toContain('Chi nhánh Nam Buôn Hồ');

    expect(html.statusCode).toBe(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.body).toContain('<title>Báo cáo Audit BGS</title>');
    expect(html.body).toContain('Tổng quan');
    expect(html.body).toContain('Phân tích theo');
    expect(html.body).toContain('Dữ liệu chi tiết');
    expect(html.body).toContain('10993821');

    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const workbook = await JSZip.loadAsync(xlsx.rawPayload);
    expect(Object.keys(workbook.files)).toEqual(expect.arrayContaining([
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml',
      'xl/tables/table1.xml',
      'xl/tables/table2.xml',
    ]));
    expect(await workbook.file('xl/worksheets/sheet3.xml')!.async('string')).toContain('10993821');
  });

  it('requires branchCode when the same CIF exists in multiple branches', async () => {
    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/findings',
      headers: adminHeaders,
      payload: {
        sourceFileName: 'same-cif-other-branch.xlsx',
        rows: [{
          channelId: 'chan-audit-bgs',
          cif: '10482910',
          customerName: 'Khách hàng trùng CIF tại chi nhánh khác',
          clusterName: 'Cụm TP. Hồ Chí Minh',
          branchCode: '428',
          branchName: 'Chi nhánh Bình Tây Sài Gòn',
          department: 'Phòng QLKH 2',
          errorCode: 'TD10.99',
          errorTitle: 'Sai sót tại chi nhánh khác',
          description: 'Dữ liệu dùng để kiểm tra không được gộp hồ sơ khác chi nhánh.',
          exposureAmount: 100,
        }],
      },
    });
    expect(imported.statusCode).toBe(201);

    const ambiguous = await app.inject({ method: 'GET', url: '/api/v1/customers/10482910/case', headers: adminHeaders });
    expect(ambiguous.statusCode).toBe(409);
    expect(ambiguous.json()).toMatchObject({ code: 'CUSTOMER_CASE_AMBIGUOUS' });

    const scoped = await app.inject({ method: 'GET', url: '/api/v1/customers/10482910/case?branchCode=635', headers: adminHeaders });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json()).toMatchObject({ branchCode: '635', totalFindings: 2 });
    expect(scoped.json().findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ errorCode: 'TD01.01' }),
      expect.objectContaining({ errorCode: 'TD05.05' }),
    ]));
  });

  it('filters report data and stores reusable report definitions', async () => {
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/summary?branchCode=428',
      headers: adminHeaders,
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toMatchObject({ totalCustomers: 2, totalFindings: 2 });
    expect(filtered.json().byBranch).toEqual([
      expect.objectContaining({ branchCode: '428', findingCount: 2 }),
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/definitions',
      headers: adminHeaders,
      payload: {
        name: 'Báo cáo tồn đọng Chi nhánh 635',
        description: 'Mẫu tái sử dụng cho họp kiểm soát hằng tuần.',
        filters: { branchCode: '635', workflowStatus: 'PENDING' },
        columns: ['cif', 'customerName', 'department', 'errorCode', 'workflowStatus'],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Báo cáo tồn đọng Chi nhánh 635', createdByUserId: 'user-admin' });

    const definitions = await app.inject({ method: 'GET', url: '/api/v1/reports/definitions', headers: adminHeaders });
    expect(definitions.statusCode).toBe(200);
    expect(definitions.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.json().id, filters: { branchCode: '635', workflowStatus: 'PENDING' } }),
    ]));

    const canonical = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/definitions',
      headers: adminHeaders,
      payload: {
        name: 'Phân tích chuẩn theo mã lỗi',
        query: {
          rules: [{ key: 'dimension.branch', operator: 'op.eq', value: '635' }],
          groupBy: 'dimension.error_code',
          metrics: ['metric.customer_count', 'metric.finding_count', 'metric.exposure_sum'],
        },
        exportColumns: ['dimension.cif', 'dimension.customer', 'dimension.error_code', 'measure.exposure'],
      },
    });
    expect(canonical.statusCode).toBe(201);
    expect(canonical.json()).toMatchObject({
      query: { groupBy: 'dimension.error_code', rules: [{ key: 'dimension.branch', operator: 'op.eq', value: '635' }] },
      exportColumns: ['dimension.cif', 'dimension.customer', 'dimension.error_code', 'measure.exposure'],
    });
  });

  it('builds a scoped work queue and persists followed findings per user', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/workspace/my-work',
      headers: { 'x-user-id': 'user-branch-controller-635' },
    });

    expect(before.statusCode).toBe(200);
    expect(before.json().actionable).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'find-004', workflowStatus: 'SUBMITTED_BRANCH', branchCode: '635' }),
    ]));
    expect(before.json().following).toEqual([]);

    const followed = await app.inject({
      method: 'PUT',
      url: '/api/v1/findings/find-004/follow',
      headers: { 'x-user-id': 'user-branch-controller-635' },
    });
    expect(followed.statusCode).toBe(200);
    expect(followed.json()).toMatchObject({ findingId: 'find-004', isFollowing: true });

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/workspace/my-work',
      headers: { 'x-user-id': 'user-branch-controller-635' },
    });
    expect(after.json().following).toEqual([
      expect.objectContaining({ id: 'find-004', isFollowing: true }),
    ]);

    const unfollowed = await app.inject({
      method: 'DELETE',
      url: '/api/v1/findings/find-004/follow',
      headers: { 'x-user-id': 'user-branch-controller-635' },
    });
    expect(unfollowed.statusCode).toBe(200);
    expect(unfollowed.json()).toMatchObject({ findingId: 'find-004', isFollowing: false });
  });

  it('lets users explicitly accept work and watch cluster, branch or customer scopes', async () => {
    const headers = { 'x-user-id': 'user-internal-supervisor' };
    const accepted = await app.inject({
      method: 'PUT',
      url: '/api/v1/workspace/accepted',
      headers,
      payload: { targetType: 'CUSTOMER', branchCode: '635', cif: '10482910' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ targetType: 'CUSTOMER', customerName: 'Công ty TNHH Cà Phê Tây Nguyên Xanh', matchedFindingCount: 2 });

    for (const payload of [
      { targetType: 'CLUSTER', clusterName: 'Cụm Tây Nguyên' },
      { targetType: 'BRANCH', branchCode: '635' },
      { targetType: 'CUSTOMER', branchCode: '635', cif: '10482910' },
    ]) {
      const watched = await app.inject({ method: 'PUT', url: '/api/v1/workspace/watch-targets', headers, payload });
      expect(watched.statusCode).toBe(200);
    }

    const queue = await app.inject({ method: 'GET', url: '/api/v1/workspace/my-work', headers });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().accepted).toEqual([
      expect.objectContaining({ targetType: 'CUSTOMER', branchCode: '635', cif: '10482910' }),
    ]);
    expect(queue.json().watchTargets.map((target: { targetType: string }) => target.targetType).sort()).toEqual(['BRANCH', 'CLUSTER', 'CUSTOMER']);

    const released = await app.inject({ method: 'DELETE', url: `/api/v1/workspace/accepted/${accepted.json().id}`, headers });
    expect(released.statusCode).toBe(204);
  });

  it('keeps a selected campaign, importer provenance and idempotent result for an interactive finding import', async () => {
    const headers = {
      'x-user-id': 'user-internal-officer',
      'idempotency-key': 'finding-provenance-import-v1',
    };
    const payload = {
      sourceFileName: 'danh-sach-sai-sot-da-dan.xlsx',
      sourceType: 'CLIPBOARD',
      rows: [{
        campaignId: 'campaign-regular-2026',
        channelId: 'chan-audit-bgs',
        cif: 'IMP-PROV-2026',
        customerName: 'Khách hàng kiểm thử provenance',
        clusterName: 'Cụm Tây Nguyên',
        branchCode: '635',
        branchName: 'Chi nhánh Nam Buôn Hồ',
        department: 'PGD Nam Buôn Hồ 1',
        errorCode: 'TD03.07',
        errorTitle: 'Kiểm thử nguồn nạp',
        description: 'Dòng kiểm thử lưu chuyên đề, người nạp và nguồn dữ liệu.',
      }],
    };

    const first = await app.inject({ method: 'POST', url: '/api/v1/imports/findings', headers, payload });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      customerCount: 1,
      findingCount: 1,
      findings: [expect.objectContaining({
        campaignId: 'campaign-regular-2026',
        importSourceType: 'CLIPBOARD',
        importSourceFileName: payload.sourceFileName,
        importedByUserId: 'user-internal-officer',
      })],
    });

    const replay = await app.inject({ method: 'POST', url: '/api/v1/imports/findings', headers, payload });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const batches = await app.inject({ method: 'GET', url: '/api/v1/imports/batches', headers: { 'x-user-id': 'user-internal-officer' } });
    expect(batches.statusCode).toBe(200);
    expect(batches.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.json().batchId, campaignId: 'campaign-regular-2026', sourceType: 'CLIPBOARD' }),
    ]));
  });
});
