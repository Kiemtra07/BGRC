import crypto from 'node:crypto';
import type { Finding, UserProfile } from '../../../shared/contracts';
import { scopeSqlForUser } from '../security/scope-predicate';
import type { PostgresClientLike, PostgresPoolLike } from './postgres-state';
import { withBackendTransaction } from './postgres-transaction';

/**
 * Bảng `finding_records`: chiếu hồ sơ ra một bảng thật để Postgres lọc thay cho `Array.filter`.
 *
 * Hôm nay một cán bộ QLKH chi nhánh mở danh sách là nạp toàn bộ hồ sơ của cả 200 đơn vị vào RAM
 * rồi lọc bằng JavaScript để hiển thị 20 dòng. Ở đây mệnh đề phạm vi đi thẳng xuống `WHERE`, nên
 * database chỉ trả về đúng những dòng người đó được xem, bằng chỉ mục.
 *
 * Cột `payload` giữ nguyên vẹn bản ghi hồ sơ. Nhờ vậy đường đọc SQL trả về **đúng cùng một đối
 * tượng** mà đường đọc trong bộ nhớ trả về — điều kiện bắt buộc để bật/tắt giữa hai đường bằng cờ
 * mà người dùng không nhận ra khác biệt nào.
 */

export interface FindingRecordsSyncResult {
  upserted: number;
  deleted: number;
}

export interface FindingListOptions {
  user: UserProfile;
  /** Bộ lọc thô từ query string, cùng đúng những khoá mà applyFindingQueryFilters đọc. */
  query: Record<string, string | undefined>;
  page: number;
  limit: number;
}

export interface FindingListPage {
  items: Finding[];
  total: number;
}

/**
 * Vân tay nội dung của một hồ sơ. `evidenceCount` nằm trong vân tay vì nó là cột phẳng của bảng:
 * thêm hay thu hồi một minh chứng phải làm dòng đó được ghi lại, dù bản thân hồ sơ không đổi.
 */
export function findingContentHash(finding: Finding, evidenceCount: number): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(finding))
    .update(`|evidence:${evidenceCount}`)
    .digest('hex');
}

const asDate = (value?: string): string | null => (value && value.trim() ? value.slice(0, 10) : null);
const asText = (value?: string | null): string | null => (value === undefined || value === null || value === '' ? null : value);

/** Thứ tự cột phải khớp đúng danh sách trong câu INSERT bên dưới. */
function rowValues(finding: Finding, evidenceCount: number, hash: string): unknown[] {
  return [
    finding.id,
    asText(finding.campaignId),
    finding.channelId,
    asText(finding.channelCode),
    finding.cif,
    finding.customerName,
    asText(finding.clusterName),
    asText(finding.branchCode),
    asText(finding.branchName),
    asText(finding.department),
    asText(finding.officerName),
    finding.errorCode,
    asText(finding.errorGroup),
    asText(finding.errorTitle),
    asText(finding.businessLine),
    asText(finding.riskLevel),
    finding.workflowStatus,
    finding.slaStatus,
    Boolean(finding.isOverdue),
    Boolean(finding.isSpecialCase),
    asDate(finding.auditDate),
    asDate(finding.deadlineDate),
    Number(finding.exposureAmount ?? 0),
    Number(finding.creditBalance ?? 0),
    Number(finding.version ?? 1),
    evidenceCount,
    finding.createdAt,
    finding.updatedAt,
    JSON.stringify(finding),
    hash,
  ];
}

const COLUMNS = [
  'finding_id', 'campaign_id', 'channel_id', 'channel_code', 'cif', 'customer_name',
  'cluster_name', 'branch_code', 'branch_name', 'department', 'officer_name',
  'error_code', 'error_group', 'error_title', 'business_line', 'risk_level',
  'workflow_status', 'sla_status', 'is_overdue', 'is_special_case',
  'audit_date', 'deadline_date', 'exposure_amount', 'credit_balance', 'version',
  'evidence_count', 'created_at', 'updated_at', 'payload', 'content_hash',
];

/** Ép kiểu cho những cột mà driver không tự suy ra được từ tham số. */
const COLUMN_CASTS: Record<string, string> = {
  audit_date: '::date',
  deadline_date: '::date',
  created_at: '::timestamptz',
  updated_at: '::timestamptz',
  payload: '::jsonb',
};

/** Ghi theo lô để một lần nhập lớn không dựng ra câu lệnh vượt giới hạn tham số của Postgres. */
const UPSERT_BATCH_SIZE = 200;

export class PostgresFindingRecords {
  private readonly pool: PostgresPoolLike;
  /**
   * Vân tay của những dòng tiến trình này tin là đang nằm dưới database. Có nó thì mỗi lượt đồng bộ
   * chỉ gửi đi những hồ sơ thật sự đổi, thay vì đẩy cả 20.000 dòng mỗi lần ai đó bấm một nút.
   * `undefined` nghĩa là chưa đọc lần nào — lần đồng bộ đầu của mỗi instance sẽ nạp nó.
   */
  private knownHashes: Map<string, string> | undefined;

  public constructor(options: { pool: PostgresPoolLike }) {
    this.pool = options.pool;
  }

  public async sync(
    findings: readonly Finding[],
    evidenceCountById: ReadonlyMap<string, number>,
  ): Promise<FindingRecordsSyncResult> {
    return withBackendTransaction(this.pool, async client => {
      const known = this.knownHashes ?? await this.loadHashes(client);

      const changed: Finding[] = [];
      const nextHashes = new Map<string, string>();
      for (const finding of findings) {
        const evidenceCount = evidenceCountById.get(finding.id) ?? 0;
        const hash = findingContentHash(finding, evidenceCount);
        nextHashes.set(finding.id, hash);
        if (known.get(finding.id) !== hash) changed.push(finding);
      }
      const removed = [...known.keys()].filter(id => !nextHashes.has(id));

      for (let start = 0; start < changed.length; start += UPSERT_BATCH_SIZE) {
        await this.upsertBatch(client, changed.slice(start, start + UPSERT_BATCH_SIZE), evidenceCountById, nextHashes);
      }
      if (removed.length > 0) {
        await client.query('DELETE FROM finding_records WHERE finding_id = ANY($1::text[])', [removed]);
      }

      // Chỉ tin vào bộ nhớ đệm sau khi transaction đã ghi xong. Gán sớm hơn thì một lần COMMIT hỏng
      // sẽ để lại cache nói rằng dòng đã ghi, và lượt đồng bộ sau bỏ qua đúng những dòng chưa ghi.
      this.knownHashes = nextHashes;
      return { upserted: changed.length, deleted: removed.length };
    }).catch(error => {
      // Lượt sau phải đọc lại vân tay từ database thay vì tin vào bộ nhớ đệm có thể đã lệch.
      this.knownHashes = undefined;
      throw error;
    });
  }

  private async loadHashes(client: PostgresClientLike): Promise<Map<string, string>> {
    const result = await client.query('SELECT finding_id, content_hash FROM finding_records');
    return new Map(result.rows.map(row => [String(row.finding_id), String(row.content_hash)]));
  }

  private async upsertBatch(
    client: PostgresClientLike,
    batch: readonly Finding[],
    evidenceCountById: ReadonlyMap<string, number>,
    hashes: ReadonlyMap<string, string>,
  ): Promise<void> {
    if (batch.length === 0) return;
    const params: unknown[] = [];
    const tuples = batch.map(finding => {
      const offset = params.length;
      params.push(...rowValues(finding, evidenceCountById.get(finding.id) ?? 0, hashes.get(finding.id)!));
      return `(${COLUMNS.map((column, index) => `$${offset + index + 1}${COLUMN_CASTS[column] ?? ''}`).join(', ')})`;
    });
    const updates = COLUMNS.filter(column => column !== 'finding_id')
      .map(column => `${column} = EXCLUDED.${column}`)
      .join(', ');
    await client.query(
      `INSERT INTO finding_records(${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}
       ON CONFLICT (finding_id) DO UPDATE SET ${updates}`,
      params,
    );
  }

  /**
   * Bảng chiếu đã sẵn sàng chưa.
   *
   * Bật cờ đọc bằng SQL mà chưa chạy migration thì *mọi* lần mở danh sách hồ sơ trả về 500 kèm
   * thông báo thô của driver — người dùng chỉ thấy màn hình hỏng, còn nguyên nhân thật thì nằm ở
   * cấu hình triển khai. Hỏi một câu lúc khởi động để hỏng ở chỗ có người đọc được.
   */
  public async assertReady(): Promise<void> {
    try {
      await withBackendTransaction(this.pool, client =>
        client.query('SELECT 1 FROM finding_records LIMIT 1'));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        'FINDINGS_READ_PATH=sql nhưng không đọc được bảng finding_records. '
        + 'Hãy chạy `npm run db:migrate` trước khi bật cờ này. Chi tiết: ' + reason,
      );
    }
  }

  /**
   * Kiểm tra bảng chiếu đã bắt kịp snapshot trước khi cho phép đường đọc SQL phục vụ người dùng.
   * Chỉ đếm dòng là chưa đủ: một lần backfill dở dang có thể vô tình thay một hồ sơ bằng hồ sơ cũ
   * nhưng vẫn giữ nguyên tổng số. So vân tay giúp phát hiện cả thiếu, thừa và lệch nội dung.
   */
  public async assertCoverage(
    findings: readonly Finding[],
    evidenceCountById: ReadonlyMap<string, number>,
  ): Promise<void> {
    const expected = new Map(
      findings.map(item => [item.id, findingContentHash(item, evidenceCountById.get(item.id) ?? 0)]),
    );
    await withBackendTransaction(this.pool, async client => {
      const actual = await this.loadHashes(client);
      const missing = [...expected.keys()].filter(id => !actual.has(id));
      const stale = [...actual.keys()].filter(id => !expected.has(id));
      const changed = [...expected.keys()].filter(id => actual.get(id) !== expected.get(id) && actual.has(id));
      if (missing.length === 0 && stale.length === 0 && changed.length === 0) return;

      throw new Error(
        'FINDING_RECORDS_NOT_BACKFILLED — bảng finding_records chưa khớp snapshot. '
        + `missing=${missing.length}; stale=${stale.length}; changed=${changed.length}. `
        + 'Chạy `npm run db:backfill:finding-records:dry-run`, đối chiếu số lượng, rồi mới backfill.',
      );
    });
  }

  public async list(options: FindingListOptions): Promise<FindingListPage> {
    const { sql, params } = buildListQuery(options);
    return withBackendTransaction(this.pool, async client => {
      const result = await client.query(sql, params);
      return {
        // `payload` là bản ghi hồ sơ nguyên vẹn, nên không có bước dựng lại nào để mà sai.
        items: result.rows.map(row => row.payload as Finding),
        total: result.rows.length > 0 ? Number(result.rows[0].total_count) : 0,
      };
    });
  }

  /** Load a caller's full SQL-filtered scope for analytics without hydrating the global snapshot. */
  public async listAll(options: Omit<FindingListOptions, 'page' | 'limit'>): Promise<Finding[]> {
    const items: Finding[] = [];
    const pageSize = 1_000;
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (items.length < total) {
      const result = await this.list({ ...options, page, limit: pageSize });
      items.push(...result.items);
      total = result.total;
      if (result.items.length === 0) break;
      page += 1;
    }
    return items;
  }
}

/**
 * Dịch bộ lọc của màn hình danh sách thành một truy vấn.
 *
 * Mỗi điều kiện ở đây phải nói đúng cùng một điều với nhánh tương ứng trong `applyFindingQueryFilters`.
 * Chỗ dễ lệch nhất là tìm kiếm tự do: chỉ mục trigram trên `search_text` gộp năm trường thành một
 * chuỗi, nên một từ khoá vắt qua ranh giới hai trường sẽ khớp ở SQL mà không khớp ở JavaScript. Nên
 * `search_text` chỉ dùng để **thu hẹp** tập ứng viên bằng chỉ mục; điều kiện đúng vẫn là phép so
 * từng trường ngay bên cạnh. Chỉ mục để chạy nhanh, vị từ để chạy đúng.
 */
export function buildListQuery(options: FindingListOptions): { sql: string; params: unknown[] } {
  const { user, query, page, limit } = options;
  const params: unknown[] = [];
  const placeholder = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const scope = scopeSqlForUser(user, 'f', 1);
  params.push(...scope.params);
  const conditions: string[] = [scope.sql];

  const eq = (column: string, value?: string) => {
    if (value) conditions.push(`${column} = ${placeholder(value)}`);
  };
  // Bộ lọc rỗng trong JavaScript so bằng `(f.department || '') === value`, nên chuỗi rỗng dưới
  // database (lưu thành NULL) phải khớp với chuỗi rỗng người dùng gửi lên.
  const eqNullable = (column: string, value?: string) => {
    if (value === undefined) return;
    conditions.push(`coalesce(${column}, '') = ${placeholder(value)}`);
  };

  if (query.channelId) {
    const value = placeholder(query.channelId);
    conditions.push(`(f.channel_id = ${value} OR f.channel_code = ${value})`);
  }
  eq('f.campaign_id', query.campaignId);
  eq('f.workflow_status', query.workflowStatus);
  if (query.slaStatus) {
    // Quá hạn cắt ngang mọi trạng thái SLA đã lưu, đúng như phía JavaScript suy lại.
    conditions.push(query.slaStatus === 'OVERDUE'
      ? `(f.is_overdue OR f.sla_status = ${placeholder('OVERDUE')})`
      : `(NOT f.is_overdue AND f.sla_status = ${placeholder(query.slaStatus)})`);
  }
  eq('f.branch_code', query.branchCode);
  eqNullable('f.department', query.department);
  eq('f.cluster_name', query.clusterName);
  eq('f.error_code', query.errorCode);
  eqNullable('f.error_group', query.errorGroup);
  eqNullable('f.officer_name', query.officerName);
  eq('f.risk_level', query.riskLevel);
  eq('f.business_line', query.businessLine);

  if (query.unresolvedOnly === 'true') {
    conditions.push(`f.workflow_status <> ${placeholder('WAIVED_RESOLVED')}`);
  }
  if (query.specialOnly === 'true') conditions.push('f.is_special_case');
  if (query.hasEvidence === 'YES') conditions.push('f.evidence_count > 0');
  if (query.hasEvidence === 'NO') conditions.push('f.evidence_count = 0');

  // Cùng phép suy ngày với JavaScript: dùng auditDate, thiếu thì lấy ngày của createdAt.
  const findingDate = "coalesce(f.audit_date, (f.created_at AT TIME ZONE 'UTC')::date)";
  if (query.dateFrom) conditions.push(`${findingDate} >= ${placeholder(query.dateFrom)}::date`);
  if (query.dateTo) conditions.push(`${findingDate} <= ${placeholder(query.dateTo)}::date`);

  if (query.search) {
    const needle = query.search.toLowerCase();
    const like = placeholder(`%${needle}%`);
    const term = placeholder(needle);
    // `search_text` gộp năm trường nên chỉ dùng để thu hẹp bằng chỉ mục GIN; phép so từng trường
    // ngay sau đó mới là điều kiện đúng, khớp từng ký tự với bản JavaScript.
    conditions.push(`(f.search_text LIKE ${like} AND (
      position(${term} in f.cif) > 0
      OR position(${term} in lower(f.customer_name)) > 0
      OR position(${term} in lower(f.error_code)) > 0
      OR position(${term} in lower(coalesce(f.branch_name, ''))) > 0
      OR position(${term} in lower(coalesce(f.cluster_name, ''))) > 0
    ))`);
  }

  const offset = Math.max(0, (page - 1) * limit);
  const sql = `SELECT f.payload, count(*) OVER () AS total_count
                 FROM finding_records f
                WHERE ${conditions.join(' AND ')}
                ORDER BY f.created_at DESC, f.finding_id DESC
                LIMIT ${placeholder(limit)} OFFSET ${placeholder(offset)}`;
  return { sql, params };
}
