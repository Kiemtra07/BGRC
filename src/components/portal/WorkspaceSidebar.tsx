import React from 'react';
import { BriefcaseBusiness, ChevronRight, Database, Eye, PanelLeftClose, PanelLeftOpen, Radio, Star } from 'lucide-react';
import { MyWorkQueue, ReportChannel, WorkspaceTarget } from '../../../shared/contracts';

interface Props {
  channels: ReportChannel[];
  selectedChannelId: string;
  workQueue: MyWorkQueue;
  collapsed: boolean;
  onToggle: () => void;
  onSelectChannel: (channelId: string) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onTogglePriority: (target: WorkspaceTarget) => void | Promise<void>;
}

export const WorkspaceSidebar: React.FC<Props> = ({ channels, selectedChannelId, workQueue, collapsed, onToggle, onSelectChannel, onOpenTarget, onTogglePriority }) => {
  const priorityTargets = workQueue.watchTargets.filter(target => target.isPriority);
  const regularTargets = workQueue.watchTargets.filter(target => !target.isPriority);
  return (
  <aside className="h-full min-h-[calc(100dvh-116px)] border-r border-rule bg-white" aria-label="Không gian làm việc">
    {/* The panel is already labelled for assistive tech; a repeated all-caps title row only
        spent a row of vertical space, so the collapse control now stands alone. */}
    <div className={`flex min-h-12 items-center border-b border-rule ${collapsed ? 'justify-center px-2' : 'justify-end px-2'}`}>
      <button type="button" onClick={onToggle} aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600">
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>
    </div>

    <SidebarSection collapsed={collapsed} icon={<Database />} title="Kênh dữ liệu">
      <div className="space-y-1.5" data-testid="channel-sidebar">
        {channels.filter(channel => channel.isActive).map(channel => {
          const active = channel.id === selectedChannelId;
          // A solid teal block per channel made the whole rail shout; the active channel is
          // marked by a rule and a tint instead, which still wins at a glance.
          return <button key={channel.id} title={channel.name} aria-label={channel.name} aria-current={active ? 'true' : undefined} onClick={() => onSelectChannel(channel.id)} className={`relative flex min-h-11 w-full items-start gap-2.5 overflow-hidden rounded-lg py-2.5 text-left text-[12px] leading-4 transition-colors ${collapsed ? 'justify-center px-2' : 'px-3'} ${active ? 'bg-brand-50 font-bold text-brand-700' : 'font-semibold text-slate-600 hover:bg-slate-50'}`}>
            {active && <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-brand-500" />}
            <Radio className={`h-4 w-4 shrink-0 ${collapsed ? 'mt-0' : 'mt-0.5'} ${active ? 'text-brand-500' : 'text-slate-300'}`} />
            {!collapsed && <span>{channel.name}</span>}
          </button>;
        })}
      </div>
    </SidebarSection>

    <SidebarSection collapsed={collapsed} icon={<BriefcaseBusiness />} title="Công việc đang làm" count={workQueue.accepted.length}>
      <TargetItems items={workQueue.accepted} empty="Chưa có công việc được tiếp nhận." collapsed={collapsed} onOpen={onOpenTarget} />
    </SidebarSection>

    {priorityTargets.length > 0 && <SidebarSection collapsed={collapsed} icon={<Star />} title="Ưu tiên giám sát" count={priorityTargets.length}>
      <TargetItems items={priorityTargets} empty="" collapsed={collapsed} onOpen={onOpenTarget} onTogglePriority={onTogglePriority} />
    </SidebarSection>}

    <SidebarSection collapsed={collapsed} icon={<Eye />} title="Đang theo dõi" count={regularTargets.length}>
      <TargetItems items={regularTargets} empty="Chưa có mục theo dõi." collapsed={collapsed} onOpen={onOpenTarget} onTogglePriority={onTogglePriority} />
    </SidebarSection>
  </aside>
  );
};

const SidebarSection: React.FC<{ collapsed: boolean; icon: React.ReactElement; title: string; count?: number; children: React.ReactNode }> = ({ collapsed, icon, title, count, children }) => (
  <section className="border-b border-rule p-3 last:border-b-0">
    <div className={`mb-2 flex min-h-7 items-center gap-2 ${collapsed ? 'justify-center' : 'px-1'}`} title={collapsed ? title : undefined}>
      <span className="relative text-slate-400">
        {React.cloneElement(icon, { className: 'h-4 w-4' } as React.SVGAttributes<SVGElement>)}
        {collapsed && typeof count === 'number' && count > 0 && <span data-numeric className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-black text-white">{count}</span>}
      </span>
      {!collapsed && <><h2 className="text-[12px] font-bold text-slate-700">{title}</h2>{typeof count === 'number' && <span data-numeric className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{count}</span>}</>}
    </div>
    {children}
  </section>
);

const TargetItems: React.FC<{ items: WorkspaceTarget[]; empty: string; collapsed: boolean; onOpen: (target: WorkspaceTarget) => void; onTogglePriority?: (target: WorkspaceTarget) => void | Promise<void> }> = ({ items, empty, collapsed, onOpen, onTogglePriority }) => {
  if (collapsed) return items.length ? <div className="space-y-1">{items.slice(0, 3).map(item => <button key={item.id} onClick={() => onOpen(item)} title={`${targetTypeLabel[item.targetType]} · ${item.label}`} aria-label={`Mở ${item.label}`} className="flex h-11 w-full items-center justify-center rounded-xl text-[10px] font-bold text-brand-600 hover:bg-brand-50">{targetTypeShort[item.targetType]}</button>)}</div> : null;
  if (!items.length) return <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">{empty}</p>;
  return <div className="space-y-0.5">
    {items.slice(0, 6).map(item => <div key={item.id} className="group flex min-h-12 w-full items-stretch rounded-lg transition-colors hover:bg-brand-50">
      <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="mt-0.5 block truncate text-[12px] font-semibold text-slate-800">{item.label}</span>
          <span data-numeric className="mt-0.5 block truncate text-[10px] text-slate-500">{targetTypeLabel[item.targetType]} · {item.matchedFindingCount} mã lỗi{item.targetType === 'CUSTOMER' ? ` · CIF ${item.cif}` : ''}</span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" aria-hidden />
      </button>
      {onTogglePriority && <button type="button" onClick={() => onTogglePriority(item)} aria-label={item.isPriority ? `Bỏ ưu tiên ${item.label}` : `Ưu tiên ${item.label}`} aria-pressed={Boolean(item.isPriority)} title={item.isPriority ? 'Bỏ ưu tiên giám sát' : 'Ưu tiên giám sát'} className={`grid min-h-11 w-10 shrink-0 place-items-center rounded-lg transition-colors ${item.isPriority ? 'text-amber-500' : 'text-slate-200 hover:text-amber-500 group-hover:text-slate-400'}`}><Star className={`h-4 w-4 ${item.isPriority ? 'fill-current' : ''}`} /></button>}
    </div>)}
    {items.length > 6 && <p data-numeric className="px-2 pt-1 text-[10px] font-semibold text-slate-400">Còn {items.length - 6} mục khác</p>}
  </div>;
};

const targetTypeLabel: Record<WorkspaceTarget['targetType'], string> = { CLUSTER: 'Cụm địa bàn', BRANCH: 'Chi nhánh', CUSTOMER: 'Khách hàng' };
const targetTypeShort: Record<WorkspaceTarget['targetType'], string> = { CLUSTER: 'CỤM', BRANCH: 'CN', CUSTOMER: 'KH' };
