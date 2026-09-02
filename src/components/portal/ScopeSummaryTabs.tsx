import React from 'react';
import { CircleCheck, ClipboardList, LucideIcon, TriangleAlert, UserCheck, Users } from 'lucide-react';
import { DashboardSummary, UserProfile } from '../../../shared/contracts';

/**
 * Thẻ số tổng quan chia làm hai phạm vi, vì hai câu hỏi khác nhau không nên chen vào cùng một dãy số.
 *
 * `SCOPE` trả lời "tôi đang gánh bao nhiêu việc" — toàn bộ phạm vi dữ liệu của người đăng nhập, nên
 * nó không đổi khi người dùng đổi điều kiện tìm kiếm. `CAMPAIGN` trả lời "chuyên đề vừa tìm ra sao"
 * — đúng tập hồ sơ mà lần tìm kiếm vừa rồi trả về.
 */
export type SummaryScope = 'SCOPE' | 'CAMPAIGN';

/** Phạm vi dữ liệu tuỳ theo vai trò, gọi bằng tên thay vì bắt người dùng tự suy từ con số. */
export function scopeTabLabel(user: UserProfile | null): string {
  const roles = user?.roles ?? [];
  if (roles.some(role => ['ADMIN', 'SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER'].includes(role))) return 'Toàn phạm vi';
  if (roles.some(role => ['BRANCH_CONTROLLER', 'BRANCH_LEADER'].includes(role))) return 'Toàn chi nhánh';
  if (roles.includes('BRANCH_INPUT')) return 'Khách hàng tôi quản lý';
  return 'Phạm vi của tôi';
}

const toneClass = {
  brand: { icon: 'text-slate-400', value: 'text-slate-900' },
  risk: { icon: 'text-risk', value: 'text-risk' },
  ok: { icon: 'text-ok', value: 'text-ok' },
} as const;

/**
 * Nhãn và con số nằm cùng một dòng. Bố cục cũ xếp chúng thành hai dòng rồi thêm dòng chú thích thứ
 * ba ("còn 8 chưa đóng", "kiểm soát & Hội sở"), khiến năm con số chiếm gần nửa màn hình đầu tiên —
 * chỗ đáng ra phải dành cho chính danh sách hồ sơ.
 */
const Cell: React.FC<{ icon: LucideIcon; label: string; value: number; tone?: keyof typeof toneClass; className?: string }> = ({
  icon: Icon, label, value, tone = 'brand', className = '',
}) => (
  <div className={`flex items-center gap-2 bg-white px-3 py-2 ${className}`}>
    <Icon className={`h-3.5 w-3.5 shrink-0 ${toneClass[tone].icon}`} aria-hidden />
    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600">{label}</span>
    <span data-numeric className={`shrink-0 text-base font-black leading-none tabular-nums ${toneClass[tone].value}`}>{value}</span>
  </div>
);

const Tab: React.FC<{ active: boolean; disabled?: boolean; label: string; onSelect: () => void }> = ({ active, disabled, label, onSelect }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    disabled={disabled}
    onClick={onSelect}
    className={`min-h-8 rounded-lg px-3 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:text-slate-300 ${active ? 'bg-white text-brand-700 shadow-panel' : 'text-slate-500 hover:text-slate-800'}`}
  >
    {label}
  </button>
);

const Skeleton: React.FC = () => (
  <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
    {Array.from({ length: 5 }, (_, index) => (
      <div key={index} className="flex items-center gap-2 bg-white px-3 py-2">
        <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-6 animate-pulse rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

interface ScopeSummaryTabsProps {
  scope: SummaryScope;
  onScopeChange: (scope: SummaryScope) => void;
  currentUser: UserProfile | null;
  scopeSummary: DashboardSummary | null;
  campaignSummary: DashboardSummary | null;
  loading: boolean;
}

export const ScopeSummaryTabs: React.FC<ScopeSummaryTabsProps> = ({
  scope, onScopeChange, currentUser, scopeSummary, campaignSummary, loading,
}) => {
  const campaignReady = Boolean(campaignSummary);
  // Bấm vào tab chuyên đề khi chưa tìm kiếm là vô nghĩa, nên tab đó bị khoá cho tới lúc có kết quả.
  const active = scope === 'CAMPAIGN' && !campaignReady ? 'SCOPE' : scope;
  const summary = active === 'CAMPAIGN' ? campaignSummary : scopeSummary;

  return (
    <section aria-label="Tổng quan hồ sơ" className="overflow-hidden rounded-2xl border border-rule bg-rule shadow-panel">
      <div role="tablist" aria-label="Phạm vi thống kê" className="flex gap-1 bg-slate-50 p-1.5">
        <Tab active={active === 'SCOPE'} label={scopeTabLabel(currentUser)} onSelect={() => onScopeChange('SCOPE')} />
        <Tab active={active === 'CAMPAIGN'} disabled={!campaignReady} label="Chuyên đề đang tìm" onSelect={() => onScopeChange('CAMPAIGN')} />
      </div>

      {summary ? (
        <div className={`grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-5 ${loading ? 'opacity-60' : ''}`}>
          <Cell icon={TriangleAlert} tone={summary.overdueCount > 0 ? 'risk' : 'brand'} label="Quá hạn" value={summary.overdueCount} />
          <Cell icon={ClipboardList} label="Tổng mã lỗi" value={summary.totalFindings} />
          <Cell icon={Users} label="Chờ chi nhánh" value={summary.pendingRemediation} />
          <Cell icon={UserCheck} label="Chờ duyệt" value={summary.submittedBranch + summary.submittedInternal} />
          <Cell icon={CircleCheck} tone="ok" className="col-span-2 lg:col-span-1" label="Đã đóng" value={summary.waivedResolved} />
        </div>
      ) : <Skeleton />}
    </section>
  );
};
