import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, GitBranch, Pencil, Plus, Search, Sheet, Trash2 } from 'lucide-react';
import { CreateReportChannelDTO, ReportChannel, UpdateReportChannelDTO } from '../../../shared/contracts';
import { ExcelTemplateImporterModal } from './ExcelTemplateImporterModal';
import { ReportTypeEditor } from './report-types/ReportTypeEditor';

interface Props {
  channels: ReportChannel[];
  onChannelCreated: (channel: Partial<CreateReportChannelDTO>) => Promise<void>;
  onChannelUpdated: (id: string, channel: UpdateReportChannelDTO) => Promise<void>;
  onChannelDeleted: (id: string) => Promise<void>;
}

export const DynamicChannelManager: React.FC<Props> = ({ channels, onChannelCreated, onChannelUpdated, onChannelDeleted }) => {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<ReportChannel | 'NEW'>();
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const filtered = useMemo(() => channels.filter(channel => [channel.code, channel.name, channel.issuingDepartment].some(value => value.toLowerCase().includes(search.toLowerCase()))), [channels, search]);

  const remove = async (channel: ReportChannel) => {
    try {
      setDeletingId(channel.id);
      setActionError(undefined);
      await onChannelDeleted(channel.id);
      setPendingDeleteId(undefined);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Không thể xóa loại báo cáo.');
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h3 className="text-base font-extrabold text-slate-900">Loại báo cáo</h3></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setIsImporterOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Sheet className="h-4 w-4" /> Tạo từ Excel</button>
            <button type="button" onClick={() => setEditor('NEW')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#006b68] px-3 py-2 text-xs font-bold text-white hover:bg-[#005956]"><Plus className="h-4 w-4" /> Tạo loại báo cáo</button>
          </div>
        </div>
        <div className="relative mt-4 max-w-lg"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo mã, tên hoặc đơn vị..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:border-[#006b68] focus:outline-none" /></div>
      </div>

      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{actionError}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(260px,1.4fr)_minmax(180px,1fr)_110px_110px_150px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
          <span>Loại báo cáo</span><span>Đơn vị</span><span>Luồng</span><span>Phiên bản</span><span className="text-right">Thao tác</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map(channel => (
            <div key={channel.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(260px,1.4fr)_minmax(180px,1fr)_110px_110px_150px] md:items-center">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-lg bg-teal-50 p-2 text-[#006b68]"><FileSpreadsheet className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{channel.name}</p><p className="mt-0.5 font-mono text-[11px] font-bold text-[#006b68]">{channel.code}</p></div></div></div>
              <p className="truncate text-xs text-slate-600">{channel.issuingDepartment}</p>
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"><GitBranch className="h-3 w-3" />{channel.workflowConfig?.workflowType === 'ONE_TIER' ? '1 cấp' : '2 cấp'}</span>
              <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-700">v{channel.configVersion}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${channel.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{channel.isActive ? 'Đang dùng' : 'Tạm ngừng'}</span></div>
              <div className="flex items-center justify-start gap-1 md:justify-end">
                <button type="button" onClick={() => setEditor(channel)} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-[#006b68] hover:bg-teal-50"><Pencil className="h-4 w-4" /> Sửa</button>
                {pendingDeleteId === channel.id ? <div role="group" aria-label={`Xác nhận xóa ${channel.name}`} className="flex items-center gap-1 rounded-lg bg-red-50 p-1">
                  <button type="button" onClick={() => remove(channel)} disabled={deletingId === channel.id} className="min-h-8 rounded-md bg-red-600 px-2 text-[11px] font-bold text-white disabled:opacity-50">{deletingId === channel.id ? 'Đang xóa...' : 'Xóa'}</button>
                  <button type="button" onClick={() => setPendingDeleteId(undefined)} disabled={deletingId === channel.id} className="min-h-8 rounded-md px-2 text-[11px] font-bold text-slate-600 hover:bg-white disabled:opacity-50">Hủy</button>
                </div> : <button type="button" aria-label={`Xóa ${channel.name}`} onClick={() => { setActionError(undefined); setPendingDeleteId(channel.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-4 py-10 text-center text-xs text-slate-500">Không có loại báo cáo phù hợp.</div>}
        </div>
      </div>

      {editor && <ReportTypeEditor key={editor === 'NEW' ? 'new' : editor.id} channel={editor === 'NEW' ? undefined : editor} onClose={() => setEditor(undefined)} onSave={async data => { if (editor === 'NEW') await onChannelCreated(data); else await onChannelUpdated(editor.id, data); }} />}
      <ExcelTemplateImporterModal isOpen={isImporterOpen} onClose={() => setIsImporterOpen(false)} onChannelCreated={onChannelCreated} />
    </div>
  );
};
