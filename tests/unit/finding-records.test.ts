import { describe, expect, it } from 'vitest';
import type { Finding, UserProfile } from '../../shared/contracts';
import {
  PostgresFindingRecords,
  buildListQuery,
  findingContentHash,
} from '../../server/src/repositories/finding-records';

interface QueryResult { rows: Array<Record<string, unknown>>; rowCount: number }

class FakeClient {
  public readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  public released = false;
  public constructor(private readonly hashRows: Array<Record<string, unknown>> = []) {}

  public async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalized, params });
    if (/SELECT finding_id, content_hash FROM finding_records/i.test(normalized)) {
      return { rows: this.hashRows, rowCount: this.hashRows.length };
    }
    return { rows: [], rowCount: 0 };
  }

  public release(): void { this.released = true; }
}

class FakePool {
  public constructor(public readonly client: FakeClient) {}
  public async connect(): Promise<FakeClient> { return this.client; }
}

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'find-1', campaignId: 'camp-1', channelId: 'chan-1', channelCode: 'TD',
  cif: '10482910', customerName: 'Công ty ABC', clusterName: 'Cụm Tây Nguyên',
  branchCode: '635', branchName: 'Chi nhánh Nam Buôn Hồ', department: 'Phòng QLKH 1',
  officerName: 'Nguyễn Văn A', errorCode: 'TD01.01', errorTitle: 'Lỗi', description: '',
  workflowStatus: 'PENDING', slaStatus: 'ON_TRACK', isOverdue: false,
  deadlineDate: '2026-10-01', auditDate: '2026-09-01',
  exposureAmount: 100, creditBalance: 200, version: 1,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  evidences: [], subItems: [],
  ...over,
} as Finding);

const adminUser: UserProfile = {
  id: 'admin', username: 'admin', email: 'a@b.c', fullName: 'Admin', portal: 'INTERNAL',
  roles: ['ADMIN'], primaryRole: 'ADMIN', isActive: true,
  scopes: [{ scopeType: 'ALL' }],
} as UserProfile;

const branchUser: UserProfile = {
  id: 'u2', username: 'u2', email: 'u@b.c', fullName: 'U2', portal: 'BRANCH',
  roles: ['BRANCH_INPUT'], primaryRole: 'BRANCH_INPUT', isActive: true,
  branchCode: '635', department: 'Phòng QLKH 1',
  scopes: [{ scopeType: 'DEPARTMENT', orgUnitCode: '635', departmentName: 'Phòng QLKH 1' }],
} as UserProfile;

const query = (over: Record<string, string | undefined> = {}) =>
  buildListQuery({ user: adminUser, query: over, page: 1, limit: 20 });

describe('truy vấn danh sách hồ sơ bằng SQL', () => {
  it('luôn đặt phạm vi dữ liệu vào truy vấn, kể cả khi không có bộ lọc nào', () => {
    const scoped = buildListQuery({ user: branchUser, query: {}, page: 1, limit: 20 });
    expect(scoped.sql).toContain('f.branch_code = $1');
    expect(scoped.sql).toContain('f.department');
    // Tài khoản không có phạm vi thì truy vấn phải trả rỗng, không phải trả tất cả.
    const noScope = buildListQuery({
      user: { ...branchUser, scopes: [] } as UserProfile,
      query: {}, page: 1, limit: 20,
    });
    expect(noScope.sql).toContain('WHERE false');
  });

  /**
   * Đây là lớp lỗi nguy hiểm nhất của việc chuyển đường đọc: một bộ lọc mà giao diện vẫn cho chọn
   * nhưng SQL lặng lẽ bỏ qua. Người dùng lọc theo chi nhánh mình và nhận về hồ sơ của chi nhánh
   * khác — không có thông báo lỗi nào, chỉ có dữ liệu sai. Nên mọi khoá mà applyFindingQueryFilters
   * đọc đều phải làm truy vấn đổi đi.
   */
  it('không bỏ quên âm thầm bất kỳ bộ lọc nào của màn hình', () => {
    const baseline = query().sql;
    const filters: Record<string, string> = {
      channelId: 'chan-1', campaignId: 'camp-1', workflowStatus: 'PENDING', slaStatus: 'DUE_SOON',
      branchCode: '635', department: 'Phòng QLKH 1', clusterName: 'Cụm Tây Nguyên',
      errorCode: 'TD01.01', errorGroup: 'TD', officerName: 'Nguyễn Văn A',
      riskLevel: 'HIGH', businessLine: 'CREDIT',
      unresolvedOnly: 'true', specialOnly: 'true', hasEvidence: 'YES',
      dateFrom: '2026-01-01', dateTo: '2026-12-31', search: 'abc',
    };
    for (const [key, value] of Object.entries(filters)) {
      const withFilter = query({ [key]: value });
      expect(withFilter.sql, `bộ lọc ${key} không tác động tới truy vấn`).not.toBe(baseline);
    }
  });

  it('suy lại trạng thái quá hạn đúng như phía JavaScript', () => {
    // Quá hạn cắt ngang mọi trạng thái SLA đã lưu; hỏi DUE_SOON thì hồ sơ quá hạn phải bị loại.
    expect(query({ slaStatus: 'OVERDUE' }).sql).toContain('(f.is_overdue OR f.sla_status = $1)');
    expect(query({ slaStatus: 'DUE_SOON' }).sql).toContain('(NOT f.is_overdue AND f.sla_status = $1)');
  });

  it('so bộ lọc rỗng bằng coalesce để chuỗi rỗng khớp NULL', () => {
    // JavaScript so `(f.department || '') === value`, nên hồ sơ chưa gắn phòng phải khớp giá trị rỗng.
    const rendered = query({ department: '' });
    expect(rendered.sql).toContain("coalesce(f.department, '') = $1");
    expect(rendered.params.slice(0, 1)).toEqual(['']);
  });

  it('dùng chỉ mục để thu hẹp nhưng vẫn so từng trường để chạy đúng', () => {
    const rendered = query({ search: 'BUÔN' });
    // Chỉ mục GIN trên search_text gộp năm trường, nên một từ khoá vắt qua ranh giới hai trường sẽ
    // khớp ở đó mà không khớp bên JavaScript. Vị từ so từng trường mới là điều kiện đúng.
    expect(rendered.sql).toContain('f.search_text LIKE');
    expect(rendered.sql).toContain('position($2 in f.cif) > 0');
    expect(rendered.sql).toContain('position($2 in lower(f.customer_name)) > 0');
    expect(rendered.sql).toContain('position($2 in lower(coalesce(f.cluster_name, \'\'))) > 0');
    expect(rendered.params).toContain('%buôn%');
    expect(rendered.params).toContain('buôn');
  });

  it('đếm tổng số dòng khớp trong cùng một lượt đi, và phân trang xác định', () => {
    const rendered = buildListQuery({ user: adminUser, query: {}, page: 3, limit: 20 });
    expect(rendered.sql).toContain('count(*) OVER () AS total_count');
    expect(rendered.sql).toContain('ORDER BY f.created_at DESC, f.finding_id DESC');
    // LIMIT rồi OFFSET là hai tham số cuối; trang 3 với 20 dòng bắt đầu từ dòng 40.
    expect(rendered.params.slice(-2)).toEqual([20, 40]);
  });

  it('đánh số tham số liên tục từ phạm vi sang bộ lọc, không trùng không nhảy', () => {
    const rendered = buildListQuery({
      user: branchUser,
      query: { workflowStatus: 'PENDING', branchCode: '635' },
      page: 1, limit: 20,
    });
    const used = [...rendered.sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
    expect(Math.max(...used)).toBe(rendered.params.length);
    expect(new Set(used).size).toBeLessThanOrEqual(rendered.params.length);
    for (let i = 1; i <= rendered.params.length; i++) expect(used).toContain(i);
  });
});

describe('đồng bộ bảng chiếu hồ sơ', () => {
  const noEvidence = new Map<string, number>();

  it('lần đầu nạp vân tay từ database rồi ghi mọi hồ sơ', async () => {
    const client = new FakeClient([]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });
    const result = await records.sync([finding({ id: 'a' }), finding({ id: 'b' })], noEvidence);

    expect(result).toEqual({ upserted: 2, deleted: 0 });
    expect(client.queries.some(q => /SELECT finding_id, content_hash/i.test(q.sql))).toBe(true);
    expect(client.queries.filter(q => /INSERT INTO finding_records/i.test(q.sql))).toHaveLength(1);
    expect(client.released).toBe(true);
  });

  it('lượt sau không ghi gì khi không có hồ sơ nào đổi', async () => {
    const client = new FakeClient([]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });
    const items = [finding({ id: 'a' }), finding({ id: 'b' })];
    await records.sync(items, noEvidence);
    client.queries.length = 0;

    const second = await records.sync(items, noEvidence);
    expect(second).toEqual({ upserted: 0, deleted: 0 });
    // Đây là toàn bộ lý do có cột content_hash: không đẩy lại 20.000 dòng ở mỗi lần ai đó bấm nút.
    expect(client.queries.filter(q => /INSERT INTO finding_records/i.test(q.sql))).toHaveLength(0);
    expect(client.queries.filter(q => /SELECT finding_id, content_hash/i.test(q.sql))).toHaveLength(0);
  });

  it('chỉ ghi lại đúng hồ sơ vừa đổi, và xoá hồ sơ đã biến mất', async () => {
    const client = new FakeClient([]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });
    await records.sync([finding({ id: 'a' }), finding({ id: 'b' })], noEvidence);
    client.queries.length = 0;

    const result = await records.sync([finding({ id: 'a', workflowStatus: 'SUBMITTED_BRANCH' })], noEvidence);
    expect(result).toEqual({ upserted: 1, deleted: 1 });
    const del = client.queries.find(q => /DELETE FROM finding_records/i.test(q.sql));
    expect(del?.params).toEqual([['b']]);
  });

  it('coi việc thêm minh chứng là một thay đổi cần ghi lại', async () => {
    const client = new FakeClient([]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });
    const items = [finding({ id: 'a' })];
    await records.sync(items, noEvidence);
    client.queries.length = 0;

    // Hồ sơ không đổi, nhưng cột evidence_count thì đổi — bộ lọc "đã có minh chứng" đọc cột đó.
    const result = await records.sync(items, new Map([['a', 2]]));
    expect(result.upserted).toBe(1);
  });

  it('quên bộ nhớ đệm khi ghi hỏng, để lượt sau đọc lại từ database', async () => {
    class FailingClient extends FakeClient {
      public override async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
        if (/INSERT INTO finding_records/i.test(sql)) throw new Error('mất kết nối');
        return super.query(sql, params);
      }
    }
    const client = new FailingClient([]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });
    await expect(records.sync([finding({ id: 'a' })], noEvidence)).rejects.toThrow('mất kết nối');

    // Giữ lại bộ nhớ đệm sau một lượt hỏng là bỏ qua đúng những dòng chưa hề được ghi.
    client.queries.length = 0;
    await expect(records.sync([finding({ id: 'a' })], noEvidence)).rejects.toThrow();
    expect(client.queries.some(q => /SELECT finding_id, content_hash/i.test(q.sql))).toBe(true);
  });

  it('vân tay đổi theo nội dung hồ sơ và theo số minh chứng', () => {
    const base = finding();
    expect(findingContentHash(base, 0)).toBe(findingContentHash(finding(), 0));
    expect(findingContentHash(base, 0)).not.toBe(findingContentHash(base, 1));
    expect(findingContentHash(base, 0)).not.toBe(findingContentHash(finding({ workflowStatus: 'REJECTED' }), 0));
  });

  it('từ chối đường đọc SQL khi bảng chiếu thiếu hoặc lệch hồ sơ', async () => {
    const client = new FakeClient([
      { finding_id: 'a', content_hash: findingContentHash(finding({ id: 'a' }), 0) },
    ]);
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });

    await expect(records.assertCoverage([finding({ id: 'a' }), finding({ id: 'b' })], noEvidence))
      .rejects.toThrow(/FINDING_RECORDS_NOT_BACKFILLED/);
  });

  it('chấp nhận đường đọc SQL khi toàn bộ ID và vân tay đều khớp', async () => {
    const items = [finding({ id: 'a' }), finding({ id: 'b' })];
    const client = new FakeClient(items.map(item => ({
      finding_id: item.id,
      content_hash: findingContentHash(item, 0),
    })));
    const records = new PostgresFindingRecords({ pool: new FakePool(client) as never });

    await expect(records.assertCoverage(items, noEvidence)).resolves.toBeUndefined();
  });
});
