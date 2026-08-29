import React from 'react';
import { CircleCheck, CircleDashed, Clock3, LucideIcon, Timer, TriangleAlert } from 'lucide-react';
import type { Finding, SlaStatus } from '../../../shared/contracts';
import { slaStatusLabels, workflowStatusLabels } from '../../content/ui-copy';

/**
 * One vocabulary for "how late is it" and "where is it in the route".
 *
 * Both used to be styled inline at every call site, which is how "Quá hạn" ended
 * up as solid red-on-white while every other SLA state was a pale outline: the
 * weights disagreed, so the eye read weight instead of meaning. Here every state
 * shares one shape and one weight, and each carries its own glyph so the state
 * survives greyscale printing and colour-blind readers.
 */

type Tone = 'risk' | 'warn' | 'ok' | 'info' | 'idle';

const toneClass: Record<Tone, string> = {
  risk: 'border-risk-border bg-risk-surface text-risk',
  warn: 'border-warn-border bg-warn-surface text-warn',
  ok: 'border-ok-border bg-ok-surface text-ok',
  info: 'border-info-border bg-info-surface text-info',
  idle: 'border-idle-border bg-idle-surface text-idle',
};

const slaTone: Record<SlaStatus, Tone> = { OVERDUE: 'risk', DUE_SOON: 'warn', ON_TRACK: 'ok', CLOSED: 'idle' };
const slaIcon: Record<SlaStatus, LucideIcon> = { OVERDUE: TriangleAlert, DUE_SOON: Timer, ON_TRACK: Clock3, CLOSED: CircleCheck };

const workflowTone: Record<Finding['workflowStatus'], Tone> = {
  PENDING: 'idle',
  SUBMITTED_BRANCH: 'info',
  SUBMITTED_BRANCH_LEADER: 'info',
  SUBMITTED_INTERNAL: 'info',
  REJECTED: 'warn',
  WAIVED_RESOLVED: 'ok',
};

/** How far along the approval route a status sits, drawn as filled route ticks. */
const workflowStep: Record<Finding['workflowStatus'], number> = {
  PENDING: 0,
  REJECTED: 0,
  SUBMITTED_BRANCH: 1,
  SUBMITTED_BRANCH_LEADER: 2,
  SUBMITTED_INTERNAL: 3,
  WAIVED_RESOLVED: 4,
};

const base = 'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-[3px] text-[10px] font-bold leading-4 whitespace-nowrap';

export const SlaPill: React.FC<{ status: SlaStatus; className?: string }> = ({ status, className = '' }) => {
  const Icon = slaIcon[status];
  return (
    <span className={`${base} ${toneClass[slaTone[status]]} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {slaStatusLabels[status]}
    </span>
  );
};

/**
 * The workflow status doubles as a position indicator: four ticks show how much
 * of the approval route is behind the hồ sơ, so a branch officer can tell "chờ
 * kiểm soát" from "chờ phê duyệt HT" without reading the words.
 */
export const WorkflowPill: React.FC<{ status: Finding['workflowStatus']; showRoute?: boolean; className?: string }> = ({ status, showRoute = true, className = '' }) => {
  const step = workflowStep[status];
  const tone = workflowTone[status];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {showRoute && (
        <span className="flex shrink-0 items-center gap-[2px]" aria-hidden>
          {[1, 2, 3, 4].map(tick => (
            <span key={tick} className={`h-[3px] w-2 rounded-full ${tick <= step ? currentTick[tone] : 'bg-slate-200'}`} />
          ))}
        </span>
      )}
      <span className={`min-w-0 truncate text-[11px] font-semibold ${labelClass[tone]}`}>{workflowStatusLabels[status]}</span>
    </span>
  );
};

const currentTick: Record<Tone, string> = {
  risk: 'bg-risk', warn: 'bg-warn', ok: 'bg-ok', info: 'bg-info', idle: 'bg-slate-400',
};
const labelClass: Record<Tone, string> = {
  risk: 'text-risk', warn: 'text-warn', ok: 'text-ok', info: 'text-info', idle: 'text-slate-600',
};

/** A quiet outline chip for reference data — mã lỗi, CIF, chi nhánh. */
export const CodeChip: React.FC<{ children: React.ReactNode; title?: string; className?: string }> = ({ children, title, className = '' }) => (
  <span title={title} className={`inline-flex items-center rounded border border-brand-200 bg-brand-50 px-1.5 py-[2px] font-mono text-[10px] font-bold leading-4 text-brand-700 ${className}`}>
    {children}
  </span>
);

export const EmptyHint: React.FC<{ icon?: LucideIcon; title: string; hint?: string }> = ({ icon: Icon = CircleDashed, title, hint }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <Icon className="h-7 w-7 text-slate-300" aria-hidden />
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    {hint && <p className="max-w-sm text-xs leading-5 text-slate-500">{hint}</p>}
  </div>
);
