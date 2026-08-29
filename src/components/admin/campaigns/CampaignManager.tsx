import React, { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { CalendarRange, Check, FileUp, Filter, FolderCog, LayoutGrid, List, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import { AuditCampaign, CampaignImportDraft, CreateAuditCampaignDTO, OrgUnit, ReportChannel, UpdateAuditCampaignDTO, UserProfile } from '../../../../shared/contracts';

interface Props {
  canProvisionDrive: boolean;
  campaigns: AuditCampaign[];
  users: UserProfile[];
  orgUnits: OrgUnit[];
  channels: ReportChannel[];
  onCreate: (data: CreateAuditCampaignDTO) => Promise<void>;
  onUpdate: (id: string, data: UpdateAuditCampaignDTO) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImportDraft: (file: File) => Promise<CampaignImportDraft>;
  onProvisionDrive: (id: string) => Promise<void>;
}

type CampaignForm = {
  code: string; name: string; description: string; decisionNo: string; startDate: string; endDate: string; leadUserId: string;
  memberIds: string[]; branchCodes: string[]; reportChannelIds: string[];
};

const emptyForm = (): CampaignForm => ({ code: '', name: '', description: '', decisionNo: '', startDate: '', endDate: '', leadUserId: '', memberIds: [], branchCodes: [], reportChannelIds: [] });

const campaignStatusLabel: Record<string, string> = { DRAFT: 'Nháp', ACTIVE: 'Đang chạy', CLOSED: 'Đã đóng' };
const campaignStatusTone: Record<string, string> = {
  DRAFT: 'border-idle-border bg-idle-surface text-idle',
  ACTIVE: 'border-ok-border bg-ok-surface text-ok',
  CLOSED: 'border-rule bg-slate-50 text-slate-500',
};

export const CampaignManager: React.FC<Props> = ({ canProvisionDrive, campaigns, users, orgUnits, channels, onCreate, onUpdate, onDelete, onImportDraft, onProvisionDrive }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AuditCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [layout, setLayout] = useState<'CARD' | 'LIST'>('CARD');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const importInputRef = useRef<HTMLInputElement>(null);
  const visibleCampaigns = campaigns.filter(campaign => {
    if (statusFilter !== 'ALL' && campaign.status !== statusFilter) return false;
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return true;
    return [campaign.code, campaign.name, campaign.decisionNo].some(value => value?.toLocaleLowerCase('vi').includes(query));
  });
  const leaders = users.filter(user => user.isActive && user.roles.some(role => ['SUPERVISOR', 'INTERNAL_APPROVER'].includes(role)));
  const memberOptions = users.filter(user => user.isActive && user.roles.includes('INTERNAL_OFFICER'));
  const branches = orgUnits.filter(unit => unit.type === 'BRANCH' && unit.isActive);
  const inputClassName = 'min-h-11 w-full rounded-xl border border-rule bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-teal-100';

  const closeForm = () => { setOpen(false); setEditing(null); setForm(emptyForm()); setWarnings([]); setError(null); };
  const toggle = (key: 'memberIds' | 'branchCodes' | 'reportChannelIds', value: string) => setForm(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value],
  }));
  const beginCreate = () => { setEditing(null); setForm(emptyForm()); setWarnings([]); setError(null); setOpen(true); };
  const beginEdit = (campaign: AuditCampaign) => {
    setEditing(campaign);
    setForm({
      code: campaign.code, name: campaign.name, description: campaign.description ?? '', decisionNo: campaign.decisionNo,
      startDate: campaign.startDate, endDate: campaign.endDate, leadUserId: campaign.leadUserId,
      memberIds: campaign.members.filter(member => member.memberRole === 'MEMBER').map(member => member.userId),
      branchCodes: campaign.branchCodes, reportChannelIds: campaign.reportChannelIds,
    });
    setWarnings([]); setError(null); setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: CreateAuditCampaignDTO = {
      code: form.code, name: form.name, description: form.description || undefined, decisionNo: form.decisionNo, startDate: form.startDate, endDate: form.endDate,
      leadUserId: form.leadUserId, branchCodes: form.branchCodes, reportChannelIds: form.reportChannelIds,
      members: [
        { userId: form.leadUserId, memberRole: 'LEAD', assignedBranchCodes: form.branchCodes },
        ...form.memberIds.filter(id => id !== form.leadUserId).map(userId => ({ userId, memberRole: 'MEMBER' as const, assignedBranchCodes: form.branchCodes })),
      ],
    };
    try {
      setBusy(true); setError(null);
      if (editing) await onUpdate(editing.id, { ...payload, expectedVersion: editing.version });
      else await onCreate(payload);
      closeForm();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu chuyên đề.'); }
    finally { setBusy(false); }
  };

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setImportBusy(true); setError(null);
      const result = await onImportDraft(file);
      setForm(current => ({ ...current, ...result.draft }));
      setWarnings(result.warnings);
      setEditing(null);
      setOpen(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đọc và tách dữ liệu từ tệp chuyên đề.'); }
    finally { setImportBusy(false); }
  };

  const remove = async (campaign: AuditCampaign) => {
    if (!window.confirm(`Xóa chuyên đề “${campaign.name}”? Chỉ chuyên đề nháp chưa có hồ sơ mới có thể xóa.`)) return;
    try { setBusy(true); setError(null); await onDelete(campaign.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể xóa chuyên đề.'); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black text-slate-900">Chuyên đề kiểm tra</h2></div>
      <div className="flex flex-wrap gap-2"><input ref={importInputRef} type="file" accept=".docx,.pdf,.xlsx,.xls" className="hidden" onChange={importDocument} /><button type="button" disabled={importBusy} onClick={() => importInputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-500 px-4 text-xs font-bold text-brand-600 disabled:opacity-50"><FileUp className="h-4 w-4" />{importBusy ? 'Đang đọc tệp...' : 'Nhập DOCX, PDF hoặc Excel'}</button><button type="button" onClick={beginCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white"><Plus className="h-4 w-4" />Tạo chuyên đề</button></div>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</div>}

    {open && <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-rule bg-white p-4 shadow-panel lg:grid-cols-2">
      <div className="lg:col-span-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">Tệp chỉ tạo bản nháp. Hãy kiểm tra nội dung và chọn đoàn/phạm vi trước khi lưu.</div>
      {warnings.length > 0 && <ul className="lg:col-span-2 list-disc space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-7 py-3 text-xs font-medium text-amber-800">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <Field label="Mã chuyên đề"><input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} required className={inputClassName} /></Field>
      <Field label="Tên chuyên đề"><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required className={inputClassName} /></Field>
      <Field label="Quyết định chuyên đề"><input value={form.decisionNo} onChange={event => setForm({ ...form, decisionNo: event.target.value })} required className={inputClassName} /></Field>
      <Field label="Trưởng đoàn"><select value={form.leadUserId} onChange={event => setForm({ ...form, leadUserId: event.target.value })} required className={inputClassName}><option value="">Chọn trưởng đoàn</option>{leaders.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></Field>
      <Field label="Thời gian kiểm tra"><div className="grid grid-cols-2 gap-2"><input type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} required className={inputClassName} /><input type="date" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} required className={inputClassName} /></div></Field>
      <Field label="Mô tả (nếu có)"><input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className={inputClassName} /></Field>
      <ChoiceGroup label="Thành viên" values={memberOptions.map(user => [user.id, user.fullName])} selected={form.memberIds} onToggle={value => toggle('memberIds', value)} />
      <ChoiceGroup label="Chi nhánh kiểm tra" values={branches.map(branch => [branch.code, `${branch.code} · ${branch.name}`])} selected={form.branchCodes} onToggle={value => toggle('branchCodes', value)} />
      <ChoiceGroup label="Loại báo cáo áp dụng" values={channels.filter(channel => channel.isActive).map(channel => [channel.id, channel.name])} selected={form.reportChannelIds} onToggle={value => toggle('reportChannelIds', value)} />
      <div className="flex justify-end gap-2 lg:col-span-2"><button type="button" onClick={closeForm} className="min-h-11 rounded-xl border border-rule px-4 text-xs font-bold">Hủy</button><button disabled={busy} className="min-h-11 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white">{busy ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Lưu chuyên đề'}</button></div>
    </form>}

    {/* Toolbar: card view reads a single chuyên đề well, the list answers "which one is
        QĐ-…-2026" across dozens without scrolling. */}
    <div className="flex flex-col gap-3 rounded-2xl border border-rule bg-white p-3 shadow-panel md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Kiểu hiển thị chuyên đề" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" role="tab" aria-selected={layout === 'CARD'} onClick={() => setLayout('CARD')} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${layout === 'CARD' ? 'bg-white text-brand-600 shadow-panel' : 'text-slate-600 hover:text-slate-900'}`}><LayoutGrid className="h-4 w-4" />Thẻ</button>
          <button type="button" role="tab" aria-selected={layout === 'LIST'} onClick={() => setLayout('LIST')} className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${layout === 'LIST' ? 'bg-white text-brand-600 shadow-panel' : 'text-slate-600 hover:text-slate-900'}`}><List className="h-4 w-4" />Danh sách</button>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Filter className="h-3.5 w-3.5" />Lọc</span>
        <select aria-label="Lọc theo trạng thái chuyên đề" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-9 rounded-lg border border-rule bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-brand-500">
          <option value="ALL">Mọi trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="ACTIVE">Đang chạy</option>
          <option value="CLOSED">Đã đóng</option>
        </select>
        {(statusFilter !== 'ALL' || search.trim()) && <button type="button" onClick={() => { setStatusFilter('ALL'); setSearch(''); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rule px-2.5 text-[11px] font-bold text-slate-600 hover:border-red-200 hover:text-red-700">Bỏ lọc</button>}
      </div>
      <label className="relative block w-full md:max-w-xs">
        <span className="sr-only">Tìm chuyên đề</span>
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm mã, tên, số quyết định..." className="min-h-10 w-full rounded-xl border border-rule bg-white pl-10 pr-4 text-xs font-medium outline-none focus:border-brand-500" />
      </label>
      <span data-numeric className="shrink-0 text-[11px] font-semibold text-slate-500">{visibleCampaigns.length}/{campaigns.length} chuyên đề</span>
    </div>

    {!visibleCampaigns.length && <div className="rounded-2xl border border-rule bg-white p-10 text-center text-sm font-semibold text-slate-600 shadow-panel">Không có chuyên đề nào khớp bộ lọc.</div>}

    {layout === 'LIST' && visibleCampaigns.length > 0 && <section aria-label="Danh sách chuyên đề" className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="border-b border-rule bg-slate-50/80 text-[11px] font-semibold text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Mã</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Tên chuyên đề</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Quyết định</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Thời gian</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Đoàn</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Trạng thái</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {visibleCampaigns.map(campaign => <tr key={campaign.id} className="transition-colors hover:bg-brand-50/50">
              <td className="px-4 py-3 font-mono text-[11px] font-bold text-brand-600">{campaign.code}</td>
              <td className="px-4 py-3 font-bold text-slate-900">{campaign.name}</td>
              <td className="px-4 py-3 text-[11px] text-slate-600">{campaign.decisionNo}</td>
              <td className="px-4 py-3 text-[11px] text-slate-600">{campaign.startDate} – {campaign.endDate}</td>
              <td data-numeric className="px-4 py-3 text-[11px] text-slate-600">{campaign.members.length} thành viên</td>
              <td className="px-4 py-3"><span className={`inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px] font-bold ${campaignStatusTone[campaign.status] || 'border-idle-border bg-idle-surface text-idle'}`}>{campaignStatusLabel[campaign.status] || campaign.status}</span></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => beginEdit(campaign)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rule px-2 text-[11px] font-bold text-slate-700 hover:border-brand-300 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" />Sửa</button>
                  {canProvisionDrive && <button type="button" onClick={() => onProvisionDrive(campaign.id)} disabled={campaign.driveProvisionStatus === 'PROVISIONING'} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-200 px-2 text-[11px] font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50"><FolderCog className="h-3.5 w-3.5" />Drive</button>}
                  <button type="button" onClick={() => remove(campaign)} disabled={busy || campaign.status !== 'DRAFT'} title={campaign.status !== 'DRAFT' ? 'Chỉ xóa được chuyên đề nháp.' : undefined} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-[11px] font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Xóa</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {layout === 'CARD' && <div className="grid gap-3 lg:grid-cols-2">
      {visibleCampaigns.map(campaign => <article key={campaign.id} className="rounded-2xl border border-rule bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3"><div><span className="font-mono text-[10px] font-black text-brand-600">{campaign.code}</span><h3 className="mt-1 text-sm font-black text-slate-900">{campaign.name}</h3><p className="mt-1 text-xs text-slate-500">{campaign.decisionNo}</p></div><span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-black text-brand-600">{campaign.status}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600"><span className="flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{campaign.startDate} – {campaign.endDate}</span><span className="flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />{campaign.members.length} thành viên</span></div>
        {campaign.description && <p className="mt-3 text-xs text-slate-600">{campaign.description}</p>}
        {campaign.driveLastError && <p className="mt-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-700">{campaign.driveLastError}</p>}
        {campaign.driveRootUrl && <a href={campaign.driveRootUrl} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-bold text-brand-600 underline">Mở thư mục chuyên đề</a>}
        <div className={`mt-4 grid gap-2 ${canProvisionDrive ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}><button type="button" onClick={() => beginEdit(campaign)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-rule px-3 text-xs font-bold text-slate-700"><Pencil className="h-3.5 w-3.5" />Sửa chuyên đề</button><button type="button" onClick={() => remove(campaign)} disabled={busy || campaign.status !== 'DRAFT'} title={campaign.status !== 'DRAFT' ? 'Chỉ xóa được chuyên đề nháp.' : undefined} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Xóa chuyên đề</button>{canProvisionDrive && <button type="button" onClick={() => onProvisionDrive(campaign.id)} disabled={campaign.driveProvisionStatus === 'PROVISIONING'} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-brand-500 px-3 text-xs font-bold text-brand-600 disabled:opacity-50"><FolderCog className="h-3.5 w-3.5" />{campaign.driveProvisionStatus === 'PROVISIONING' ? 'Đang tạo...' : campaign.driveProvisionStatus === 'READY' ? <><Check className="h-3.5 w-3.5" />Đồng bộ Drive</> : 'Tạo kho dữ liệu Drive'}</button>}</div>
      </article>)}
    </div>}
  </section>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="text-xs font-bold text-slate-700">{label}<div className="mt-1.5">{children}</div></label>;
const ChoiceGroup: React.FC<{ label: string; values: string[][]; selected: string[]; onToggle: (value: string) => void }> = ({ label, values, selected, onToggle }) => <fieldset className="rounded-xl border border-rule p-3"><legend className="px-1 text-xs font-bold text-slate-700">{label}</legend><div className="max-h-36 space-y-1 overflow-y-auto">{values.map(([value, text]) => <label key={value} className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{text}</label>)}</div></fieldset>;
