import React, { useState } from 'react';
import { Building2, MapPin, Network, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { OrgUnit, UpdateOrgUnitDTO, UserProfile } from '../../../shared/contracts';

type EditableType = 'INTERNAL_TEAM' | 'CLUSTER' | 'BRANCH' | 'DEPARTMENT';

interface Props {
  orgUnits: OrgUnit[];
  users: UserProfile[];
  onOrgUnitCreated: (unit: Partial<OrgUnit>) => Promise<void>;
  onOrgUnitUpdated: (id: string, unit: UpdateOrgUnitDTO) => Promise<void>;
  onOrgUnitDeleted: (id: string) => Promise<void>;
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

export const OrganizationManager: React.FC<Props> = ({ orgUnits, users, onOrgUnitCreated, onOrgUnitUpdated, onOrgUnitDeleted }) => {
  const [editing, setEditing] = useState<OrgUnit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headOffice = orgUnits.find(unit => unit.type === 'HEAD_OFFICE');
  const internalTeams = orgUnits.filter(unit => unit.type === 'INTERNAL_TEAM');
  const clusters = orgUnits.filter(unit => unit.type === 'CLUSTER');
  const branches = orgUnits.filter(unit => unit.type === 'BRANCH');
  const departments = orgUnits.filter(unit => unit.type === 'DEPARTMENT');
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
  const parentOptions = form.type === 'BRANCH' ? clusters : form.type === 'DEPARTMENT' ? branches : [];

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"><div><h3 className="text-base font-bold text-slate-900">Cơ cấu tổ chức</h3><p className="mt-1 text-xs text-slate-500">Tạo, sửa hoặc xóa đơn vị khi không còn dữ liệu nghiệp vụ tham chiếu.</p></div><button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-[#006b68] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[#005956]"><Plus className="h-4 w-4" />Thêm đơn vị</button></div>
    {submitError && !open && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-[#006b68]"><Users className="h-4 w-4" /><h4 className="text-sm font-bold">Nhóm nội bộ</h4></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{internalTeams.map(team => <article key={team.id} className="rounded-xl border border-teal-100 bg-teal-50/60 p-4"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold uppercase text-[#006b68]">{team.code}</div><div className="mt-1 text-sm font-bold text-slate-900">{team.name}</div></div><UnitActions unit={team} disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="mt-2 text-[11px] text-slate-600">Phê duyệt HT: <span className="font-bold">{team.leaderName || 'Chưa phân công'}</span></div><StatusBadge active={team.isActive} /></article>)}</div></section>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">{clusters.map(cluster => { const clusterBranches = branches.filter(branch => branch.parentId === cluster.id); return <section key={cluster.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white"><div className="flex items-center gap-2.5"><div className="rounded-lg bg-white/10 p-2"><Network className="h-4 w-4 text-teal-300" /></div><div><h4 className="text-sm font-bold">{cluster.name}</h4><span className="font-mono text-[10px] text-slate-300">{cluster.code}</span></div></div><UnitActions unit={cluster} dark disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="flex-1 space-y-2.5 p-4">{clusterBranches.map(branch => <div key={branch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-mono text-xs font-bold text-[#006b68]">{branch.code}</div><div><div className="text-xs font-bold text-slate-800">{branch.name}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400"><MapPin className="h-3 w-3" />Chi nhánh trực thuộc</div></div></div><UnitActions unit={branch} disabled={busy} onEdit={openEdit} onDelete={remove} /></div><div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">{departments.filter(department => department.parentId === branch.id).map(department => <span key={department.id} className="inline-flex items-center gap-1 rounded-md border border-teal-100 bg-white px-2 py-1 text-[10px] font-semibold text-[#006b68]"><span>{department.name}</span><button type="button" aria-label={`Sửa đơn vị ${department.name}`} onClick={() => openEdit(department)}><Pencil className="h-3 w-3" /></button><button type="button" aria-label={`Xóa đơn vị ${department.name}`} onClick={() => remove(department)}><Trash2 className="h-3 w-3 text-red-600" /></button></span>)}</div></div>)}</div></section>; })}</div>

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white"><h4 className="flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 text-sky-400" />{editing ? 'Sửa đơn vị' : 'Thêm đơn vị'}</h4><button onClick={close} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div><form onSubmit={save} className="space-y-4 p-6">{submitError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}<Field label="Loại đơn vị"><select disabled={Boolean(editing)} value={form.type} onChange={event => setForm({ ...form, type: event.target.value as EditableType, parentId: '' })} className="input"><option value="INTERNAL_TEAM">Nhóm nghiệp vụ nội bộ</option><option value="CLUSTER">Cụm địa bàn</option><option value="BRANCH">Chi nhánh</option><option value="DEPARTMENT">Phòng/PGD</option></select></Field>{parentOptions.length > 0 && <Field label={form.type === 'BRANCH' ? 'Thuộc cụm' : 'Thuộc chi nhánh'}><select value={form.parentId} onChange={event => setForm({ ...form, parentId: event.target.value })} required className="input"><option value="">Chọn đơn vị cha</option>{parentOptions.map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></Field>}<Field label="Mã đơn vị"><input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} required className="input font-mono" /></Field><Field label="Tên đơn vị"><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required className="input" /></Field><Field label="Người phụ trách / phê duyệt"><select value={form.leaderUserId} onChange={event => setForm({ ...form, leaderUserId: event.target.value })} className="input"><option value="">Chưa phân công</option>{activeUsers.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></Field>{editing && <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} />Đơn vị đang hoạt động</label>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={close} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Hủy</button><button disabled={busy} className="rounded-lg bg-[#006b68] px-5 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu đơn vị'}</button></div></form></div></div>}
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block text-xs font-bold text-slate-700">{label}<div className="mt-1"><span className="block [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-xs">{children}</span></div></label>;
const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => <span className={`mt-2 inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>{active ? 'Hoạt động' : 'Ngừng hoạt động'}</span>;
const UnitActions: React.FC<{ unit: OrgUnit; dark?: boolean; disabled: boolean; onEdit: (unit: OrgUnit) => void; onDelete: (unit: OrgUnit) => void }> = ({ unit, dark, disabled, onEdit, onDelete }) => <div className="flex gap-1"><button type="button" aria-label={`Sửa đơn vị ${unit.name}`} onClick={() => onEdit(unit)} className={`rounded p-1 ${dark ? 'text-slate-200 hover:bg-white/10' : 'text-slate-500 hover:bg-white'}`}><Pencil className="h-3.5 w-3.5" /><span className="sr-only">Sửa đơn vị</span></button><button type="button" aria-label={`Xóa đơn vị ${unit.name}`} disabled={disabled} onClick={() => onDelete(unit)} className={`rounded p-1 disabled:opacity-40 ${dark ? 'text-red-200 hover:bg-white/10' : 'text-red-600 hover:bg-white'}`}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Xóa đơn vị</span></button></div>;
