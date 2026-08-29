import React, { useState } from 'react';
import { Building2, Filter, LayoutGrid, List, MapPin, Network, Pencil, Plus, Search, Trash2, Users, X, Upload, Download } from 'lucide-react';
import { BulkOrgUnitImportDTO, BulkOrgUnitImportResult, OrgUnit, UpdateOrgUnitDTO, UserProfile } from '../../../shared/contracts';
import { parseOrgImportFile, type OrgImportPreviewRow } from '../../lib/org-import';

type EditableType = 'INTERNAL_TEAM' | 'CLUSTER' | 'BRANCH' | 'DEPARTMENT';

interface Props {
  orgUnits: OrgUnit[];
  users: UserProfile[];
  onOrgUnitCreated: (unit: Partial<OrgUnit>) => Promise<void>;
  onOrgUnitUpdated: (id: string, unit: UpdateOrgUnitDTO) => Promise<void>;
  onOrgUnitDeleted: (id: string) => Promise<void>;
  onOrgUnitsImported: (batch: BulkOrgUnitImportDTO) => Promise<BulkOrgUnitImportResult>;
}

interface FormState {
  code: string;
  name: string;
  type: EditableType;
  parentId: string;
  leaderUserId: string;
  isActive: boolean;
}

const emptyForm = (): FormState => ({ code: '', name: '', type: 'INTERNAL_TEAM', parentId: '', leaderUserId: '', isActive: true });

const orgFilterClass = 'min-h-9 rounded-lg border border-rule bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500';

const orgTypeLabel: Record<string, string> = {
  HEAD_OFFICE: 'Hội sở', INTERNAL_TEAM: 'Nhóm nội bộ', CLUSTER: 'Cụm địa bàn', BRANCH: 'Chi nhánh', DEPARTMENT: 'Phòng/PGD',
};

/** Flat view of the same units the tree draws, for looking one up by code or name. */
const OrgUnitTable: React.FC<{
  units: OrgUnit[];
  unitById: Map<string, OrgUnit>;
  busy: boolean;
  onEdit: (unit: OrgUnit) => void;
  onDelete: (unit: OrgUnit) => void;
  onClearFilters: () => void;
}> = ({ units, unitById, busy, onEdit, onDelete, onClearFilters }) => {
  if (!units.length) return (
    <div className="rounded-2xl border border-rule bg-white p-10 text-center shadow-panel">
      <p className="text-sm font-semibold text-slate-700">Không có đơn vị nào khớp bộ lọc</p>
      <button type="button" onClick={onClearFilters} className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-rule px-3 text-xs font-bold text-brand-600 hover:border-brand-300">Bỏ lọc</button>
    </div>
  );
  return (
    <section aria-label="Danh sách đơn vị" className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="border-b border-rule bg-slate-50/80 text-[11px] font-semibold text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Mã</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Tên đơn vị</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Loại</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Trực thuộc</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Phụ trách</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Trạng thái</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {units.map(unit => {
              const parent = unit.parentId ? unitById.get(unit.parentId) : undefined;
              return (
                <tr key={unit.id} className="transition-colors hover:bg-brand-50/50">
                  <td className="px-4 py-3 font-mono text-[11px] font-bold text-brand-600">{unit.code}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{unit.name}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{orgTypeLabel[unit.type] || unit.type}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{parent ? `${parent.code} · ${parent.name}` : '—'}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{unit.leaderName || 'Chưa phân công'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px] font-bold ${unit.isActive ? 'border-ok-border bg-ok-surface text-ok' : 'border-idle-border bg-idle-surface text-idle'}`}>{unit.isActive ? 'Hoạt động' : 'Ngừng'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => onEdit(unit)} aria-label={`Sửa đơn vị ${unit.name}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rule px-2 text-[11px] font-bold text-slate-700 hover:border-brand-300 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" />Sửa</button>
                      <button type="button" disabled={busy} onClick={() => onDelete(unit)} aria-label={`Xóa đơn vị ${unit.name}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-risk-border px-2 text-[11px] font-bold text-risk hover:bg-risk-surface disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Xóa</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const OrganizationManager: React.FC<Props> = ({ orgUnits, users, onOrgUnitCreated, onOrgUnitUpdated, onOrgUnitDeleted, onOrgUnitsImported }) => {
  const [editing, setEditing] = useState<OrgUnit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<OrgImportPreviewRow[]>([]);
  // The card tree shows the hierarchy; the list answers "which unit is this code" without
  // scrolling three cluster columns. Filters narrow both.
  const [layout, setLayout] = useState<'TREE' | 'LIST'>('TREE');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | EditableType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [clusterFilter, setClusterFilter] = useState('ALL');

  const headOffice = orgUnits.find(unit => unit.type === 'HEAD_OFFICE');
  const unitById = new Map(orgUnits.map(unit => [unit.id, unit]));
  /** Cluster of a unit, walking up branch -> cluster so a phòng also matches its cluster. */
  const clusterIdOf = (unit: OrgUnit): string | undefined => {
    if (unit.type === 'CLUSTER') return unit.id;
    const parent = unit.parentId ? unitById.get(unit.parentId) : undefined;
    return parent ? clusterIdOf(parent) : undefined;
  };
  const matchesFilters = (unit: OrgUnit) => {
    if (typeFilter !== 'ALL' && unit.type !== typeFilter) return false;
    if (statusFilter !== 'ALL' && unit.isActive !== (statusFilter === 'ACTIVE')) return false;
    if (clusterFilter !== 'ALL' && clusterIdOf(unit) !== clusterFilter) return false;
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return true;
    return [unit.code, unit.name, unit.leaderName].some(value => value?.toLocaleLowerCase('vi').includes(query));
  };
  const activeFilterCount = [typeFilter, statusFilter, clusterFilter].filter(value => value !== 'ALL').length;
  const clearFilters = () => { setTypeFilter('ALL'); setStatusFilter('ALL'); setClusterFilter('ALL'); setSearch(''); };

  const allClusters = orgUnits.filter(unit => unit.type === 'CLUSTER');
  const internalTeams = orgUnits.filter(unit => unit.type === 'INTERNAL_TEAM' && matchesFilters(unit));
  const clusters = allClusters.filter(unit => matchesFilters(unit) || orgUnits.some(child => clusterIdOf(child) === unit.id && child.id !== unit.id && matchesFilters(child)));
  const branches = orgUnits.filter(unit => unit.type === 'BRANCH');
  const departments = orgUnits.filter(unit => unit.type === 'DEPARTMENT');
  const listUnits = orgUnits.filter(unit => unit.type !== 'HEAD_OFFICE' && matchesFilters(unit));
  const activeUsers = users.filter(user => user.isActive);
  const open = isModalOpen;

  const close = () => { setEditing(null); setForm(emptyForm()); setSubmitError(null); setIsModalOpen(false); };
  const openCreate = () => { setEditing(null); setForm(emptyForm()); setSubmitError(null); setIsModalOpen(true); };
  const openEdit = (unit: OrgUnit) => {
    if (unit.type === 'HEAD_OFFICE') return;
    setEditing(unit);
    setForm({ code: unit.code, name: unit.name, type: unit.type, parentId: unit.parentId ?? '', leaderUserId: unit.leaderUserId ?? '', isActive: unit.isActive });
    setSubmitError(null); setIsModalOpen(true);
  };
  const effectiveParent = (): string | undefined => form.type === 'INTERNAL_TEAM' || form.type === 'CLUSTER' ? headOffice?.id : form.parentId || undefined;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setSubmitError(null);
      const parentId = effectiveParent();
      if (editing) {
        await onOrgUnitUpdated(editing.id, { code: form.code, name: form.name, parentId: parentId ?? null, leaderUserId: form.leaderUserId || null, isActive: form.isActive, expectedUpdatedAt: editing.updatedAt });
      } else {
        await onOrgUnitCreated({ code: form.code, name: form.name, type: form.type, parentId, leaderUserId: form.leaderUserId || undefined, isActive: form.isActive });
      }
      close();
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Không thể lưu đơn vị.'); }
    finally { setBusy(false); }
  };
  const remove = async (unit: OrgUnit) => {
    if (!window.confirm(`Xóa đơn vị “${unit.name}”? Hệ thống sẽ chặn xóa nếu còn đơn vị con, người dùng, hồ sơ hoặc chuyên đề tham chiếu.`)) return;
    try { setBusy(true); setSubmitError(null); await onOrgUnitDeleted(unit.id); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : 'Không thể xóa đơn vị.'); }
    finally { setBusy(false); }
  };
  const parentOptions = form.type === 'BRANCH' ? allClusters : form.type === 'DEPARTMENT' ? branches : [];
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImportPreview(await parseOrgImportFile(file, orgUnits)); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : 'Không thể đọc tệp đơn vị.'); }
    finally { event.target.value = ''; }
  };
  const commitImport = async () => {
    const valid = importPreview.filter(row => row.payload && !row.errors.length);
    if (!valid.length) return;
    try {
      setBusy(true);
      const result = await onOrgUnitsImported({ rows: valid.map(row => ({ rowNumber: row.rowNumber, unit: row.payload! })) });
      const failed = new Map(result.failed.map(row => [row.rowNumber, `${row.code}: ${row.message}`]));
      setImportPreview(previous => previous.filter(row => row.errors.length || failed.has(row.rowNumber)).map(row => failed.has(row.rowNumber) ? { ...row, errors: [failed.get(row.rowNumber)!] } : row));
      setSubmitError(`Đã tạo ${result.created.length} đơn vị${result.failed.length ? `; ${result.failed.length} dòng lỗi.` : '.'}`);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Không thể nhập đơn vị theo lô.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rule bg-white p-5 shadow-panel sm:flex-row sm:items-center"><div><h3 className="text-base font-bold text-slate-900">Cơ cấu tổ chức</h3><p className="mt-1 text-xs text-slate-500">Tạo, sửa hoặc xóa đơn vị khi không còn dữ liệu nghiệp vụ tham chiếu.</p></div><div className="flex flex-wrap gap-2"><a href="/templates/mau-nhap-don-vi.csv" download className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Tải mẫu Excel/CSV</a><input id="bulk-org-import" type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportFile} /><label htmlFor="bulk-org-import" className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-500 px-4 py-2.5 text-xs font-bold text-brand-600"><Upload className="h-4 w-4" />Nhập danh sách</label><button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-brand-600"><Plus className="h-4 w-4" />Thêm đơn vị</button></div></div>
    {importPreview.length > 0 && <section className="rounded-2xl border border-info-border bg-info-surface p-4"><div className="flex items-center justify-between gap-2"><div><h4 className="text-sm font-bold text-slate-900">Xem trước nhập đơn vị</h4><p className="text-xs text-slate-600">Cột bắt buộc: Mã đơn vị, Tên đơn vị, Loại đơn vị, Mã đơn vị cha. Dùng mã/tên cha đã có hoặc nằm ở dòng trước.</p></div><div className="flex gap-2"><button type="button" onClick={() => setImportPreview([])} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600">Hủy</button><button type="button" onClick={commitImport} disabled={busy || !importPreview.some(row => row.payload && !row.errors.length)} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Đang nhập...' : 'Tạo đơn vị hợp lệ'}</button></div></div><div className="mt-3 max-h-56 overflow-auto rounded-lg border border-info-border bg-white"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Dòng</th><th className="p-2">Mã</th><th className="p-2">Tên</th><th className="p-2">Kết quả</th></tr></thead><tbody>{importPreview.map(row => <tr key={row.rowNumber} className="border-t border-slate-100"><td className="p-2">{row.rowNumber}</td><td className="p-2 font-mono">{row.payload?.code || '-'}</td><td className="p-2">{row.payload?.name || '-'}</td><td className={`p-2 ${row.errors.length ? 'text-red-700' : 'text-emerald-700'}`}>{row.errors.join('; ') || 'Sẵn sàng'}</td></tr>)}</tbody></table></div></section>}
    {submitError && !open && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}

    <div className="space-y-3 rounded-2xl border border-rule bg-white p-3 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Kiểu hiển thị đơn vị" className="flex gap-1 self-start rounded-xl bg-slate-100 p-1">
          <button type="button" role="tab" aria-selected={layout === 'TREE'} onClick={() => setLayout('TREE')} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${layout === 'TREE' ? 'bg-white text-brand-600 shadow-panel' : 'text-slate-600 hover:text-slate-900'}`}><LayoutGrid className="h-4 w-4" />Sơ đồ</button>
          <button type="button" role="tab" aria-selected={layout === 'LIST'} onClick={() => setLayout('LIST')} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${layout === 'LIST' ? 'bg-white text-brand-600 shadow-panel' : 'text-slate-600 hover:text-slate-900'}`}><List className="h-4 w-4" />Danh sách</button>
        </div>
        <label className="relative block w-full md:max-w-sm">
          <span className="sr-only">Tìm đơn vị</span>
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm mã, tên đơn vị, người phụ trách..." className="min-h-10 w-full rounded-xl border border-rule bg-white pl-10 pr-4 text-xs font-medium outline-none focus:border-brand-500" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Filter className="h-3.5 w-3.5" />Lọc</span>
        <select aria-label="Lọc theo loại đơn vị" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className={orgFilterClass}>
          <option value="ALL">Mọi loại đơn vị</option>
          <option value="INTERNAL_TEAM">Nhóm nghiệp vụ nội bộ</option>
          <option value="CLUSTER">Cụm địa bàn</option>
          <option value="BRANCH">Chi nhánh</option>
          <option value="DEPARTMENT">Phòng/PGD</option>
        </select>
        <select aria-label="Lọc theo cụm địa bàn" value={clusterFilter} onChange={event => setClusterFilter(event.target.value)} className={`${orgFilterClass} max-w-[220px]`}>
          <option value="ALL">Mọi cụm địa bàn</option>
          {allClusters.map(cluster => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
        </select>
        <select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className={orgFilterClass}>
          <option value="ALL">Mọi trạng thái</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
        {(activeFilterCount > 0 || search.trim()) && <button type="button" onClick={clearFilters} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rule px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-risk-border hover:text-risk"><X className="h-3.5 w-3.5" />Bỏ lọc</button>}
        <span data-numeric className="ml-auto text-[11px] font-semibold text-slate-500">{listUnits.length}/{orgUnits.filter(unit => unit.type !== 'HEAD_OFFICE').length} đơn vị</span>
      </div>
    </div>

    {layout === 'LIST' ? <OrgUnitTable units={listUnits} unitById={unitById} busy={busy} onEdit={openEdit} onDelete={remove} onClearFilters={clearFilters} /> : <>
    <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel"><div className="flex items-center gap-2 text-brand-600"><Users className="h-4 w-4" /><h4 className="text-sm font-bold">Nhóm nội bộ</h4></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{internalTeams.map(team => <article key={team.id} className="rounded-xl border border-brand-100 bg-brand-50/60 p-4"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold text-brand-600">{team.code}</div><div className="mt-1 text-sm font-bold text-slate-900">{team.name}</div></div><UnitActions unit={team} disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="mt-2 text-[11px] text-slate-600">Phê duyệt HT: <span className="font-bold">{team.leaderName || 'Chưa phân công'}</span></div><StatusBadge active={team.isActive} /></article>)}</div></section>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">{clusters.map(cluster => { const clusterBranches = branches.filter(branch => branch.parentId === cluster.id); return <section key={cluster.id} className="flex flex-col overflow-hidden rounded-2xl border border-rule bg-white shadow-panel"><div className="flex items-start justify-between gap-3 border-b border-rule bg-brand-50 p-4 text-brand-800"><div className="flex items-center gap-2.5"><div className="rounded-lg bg-white p-2"><Network className="h-4 w-4 text-brand-500" /></div><div><h4 className="text-sm font-bold">{cluster.name}</h4><span className="font-mono text-[10px] text-brand-600">{cluster.code}</span></div></div><UnitActions unit={cluster} disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="flex-1 space-y-2.5 p-4">{clusterBranches.map(branch => <div key={branch.id} className="rounded-xl border border-rule bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rule bg-white font-mono text-xs font-bold text-brand-600">{branch.code}</div><div><div className="text-xs font-bold text-slate-800">{branch.name}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400"><MapPin className="h-3 w-3" />Chi nhánh trực thuộc</div></div></div><UnitActions unit={branch} disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="mt-2 flex flex-wrap gap-1.5 border-t border-rule pt-2">{departments.filter(department => department.parentId === branch.id).map(department => <span key={department.id} className="inline-flex items-center gap-1 rounded-md border border-brand-100 bg-white px-2 py-1 text-[10px] font-semibold text-brand-600"><span>{department.name}</span><button type="button" aria-label={`Sửa đơn vị ${department.name}`} onClick={() => openEdit(department)}><Pencil className="h-3 w-3" /></button><button type="button" aria-label={`Xóa đơn vị ${department.name}`} onClick={() => remove(department)}><Trash2 className="h-3 w-3 text-red-600" /></button></span>)}</div></div>)}</div></section>; })}</div>
    </>}

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-rule bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-rule bg-slate-50 px-6 py-4 text-slate-900"><h4 className="flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 text-brand-500" />{editing ? 'Sửa đơn vị' : 'Thêm đơn vị'}</h4><button onClick={close} aria-label="Đóng" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button></div><form onSubmit={save} className="space-y-4 p-6">{submitError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}<Field label="Loại đơn vị"><select disabled={Boolean(editing)} value={form.type} onChange={event => setForm({ ...form, type: event.target.value as EditableType, parentId: '' })} className="input"><option value="INTERNAL_TEAM">Nhóm nghiệp vụ nội bộ</option><option value="CLUSTER">Cụm địa bàn</option><option value="BRANCH">Chi nhánh</option><option value="DEPARTMENT">Phòng/PGD</option></select></Field>{parentOptions.length > 0 && <Field label={form.type === 'BRANCH' ? 'Thuộc cụm' : 'Thuộc chi nhánh'}><select value={form.parentId} onChange={event => setForm({ ...form, parentId: event.target.value })} required className="input"><option value="">Chọn đơn vị cha</option>{parentOptions.map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></Field>}<Field label="Mã đơn vị"><input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} required className="input font-mono" /></Field><Field label="Tên đơn vị"><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required className="input" /></Field><Field label="Người phụ trách / phê duyệt"><select value={form.leaderUserId} onChange={event => setForm({ ...form, leaderUserId: event.target.value })} className="input"><option value="">Chưa phân công</option>{activeUsers.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></Field>{editing && <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} />Đơn vị đang hoạt động</label>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={close} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Hủy</button><button disabled={busy} className="rounded-lg bg-brand-500 px-5 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu đơn vị'}</button></div></form></div></div>}
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block text-xs font-bold text-slate-700">{label}<div className="mt-1"><span className="block [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-rule [&_.input]:bg-white [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-xs">{children}</span></div></label>;
const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => <span className={`mt-2 inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rule bg-slate-100 text-slate-500'}`}>{active ? 'Hoạt động' : 'Ngừng hoạt động'}</span>;
const UnitActions: React.FC<{ unit: OrgUnit; dark?: boolean; disabled: boolean; onEdit: (unit: OrgUnit) => void; onDelete: (unit: OrgUnit) => void }> = ({ unit, dark, disabled, onEdit, onDelete }) => <div className="flex gap-1"><button type="button" aria-label={`Sửa đơn vị ${unit.name}`} onClick={() => onEdit(unit)} className={`rounded p-1 ${dark ? 'text-slate-200 hover:bg-white/10' : 'text-slate-500 hover:bg-white'}`}><Pencil className="h-3.5 w-3.5" /><span className="sr-only">Sửa đơn vị</span></button><button type="button" aria-label={`Xóa đơn vị ${unit.name}`} disabled={disabled} onClick={() => onDelete(unit)} className={`rounded p-1 disabled:opacity-40 ${dark ? 'text-red-200 hover:bg-white/10' : 'text-red-600 hover:bg-white'}`}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Xóa đơn vị</span></button></div>;
