import React from 'react';
import type { ReportCatalogFieldConfiguration, ReportCatalogMetricConfiguration, UserRole } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';

/** Vai trò có thể bị ẩn trường. Quản trị viên luôn thấy đủ nên không có cột riêng. */
export const HIDEABLE_ROLES: UserRole[] = ['SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER', 'BRANCH_CONTROLLER', 'BRANCH_LEADER', 'BRANCH_INPUT', 'VIEWER'];

interface ReportRoleMatrixProps {
  fields: ReportCatalogFieldConfiguration[];
  metrics: ReportCatalogMetricConfiguration[];
  query: string;
  compactFieldKeys: ReadonlySet<string>;
  onToggleField: (key: ReportCatalogFieldConfiguration['key'], role: UserRole, visible: boolean) => void;
  onToggleMetric: (key: ReportCatalogMetricConfiguration['key'], role: UserRole, visible: boolean) => void;
  onApplyCompact: (role: UserRole) => void;
  onShowAll: (role: UserRole) => void;
}

/**
 * Mỗi hàng là một trường hoặc chỉ số, mỗi cột là một vai trò. Ô được chọn nghĩa là vai trò đó thấy
 * trường trong báo cáo. Trường đang tắt chung thì không vai trò nào thấy, nên ô bị khóa.
 */
export const ReportRoleMatrix: React.FC<ReportRoleMatrixProps> = ({ fields, metrics, query, compactFieldKeys, onToggleField, onToggleMetric, onApplyCompact, onShowAll }) => {
  const needle = query.trim().toLocaleLowerCase('vi');
  const matches = (label: string) => !needle || label.toLocaleLowerCase('vi').includes(needle);
  const visibleFields = fields.filter(field => matches(field.label));
  const visibleMetrics = metrics.filter(metric => matches(metric.label));

  const renderRows = <T extends { key: string; label: string; isActive: boolean; hiddenForRoles: UserRole[] }>(
    items: T[],
    toggle: (key: T['key'], role: UserRole, visible: boolean) => void,
  ) => items.map(item => (
    <tr key={item.key} className={item.isActive ? '' : 'opacity-50'}>
      <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-800">
        {item.label}
        {!item.isActive && <span className="ml-2 text-xs font-medium text-slate-500">đang tắt chung</span>}
      </th>
      {HIDEABLE_ROLES.map(role => {
        const visible = !item.hiddenForRoles.includes(role);
        return (
          <td key={role} className="px-2 py-2 text-center">
            <input
              type="checkbox"
              checked={visible}
              disabled={!item.isActive}
              onChange={event => toggle(item.key, role, event.target.checked)}
              aria-label={`${userRoleLabels[role]} xem ${item.label}`}
              className="h-5 w-5 accent-teal-700"
            />
          </td>
        );
      })}
    </tr>
  ));

  return (
    <div className="space-y-3" data-testid="report-role-matrix">
      <p className="rounded-xl border border-rule bg-slate-50 p-3 text-xs text-slate-600">
        Bỏ chọn một ô để ẩn trường hoặc chỉ số đó với vai trò ở cột. Quản trị viên luôn thấy đủ. Người giữ nhiều vai trò chỉ bị ẩn khi mọi vai trò của họ đều bị ẩn. Bấm "Lưu thay đổi" ở trên để áp dụng.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-rule bg-white shadow-panel">
        <table className="w-full min-w-[56rem] border-collapse text-xs">
          <caption className="sr-only">Trường và chỉ số báo cáo mỗi vai trò được xem</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-left font-semibold">Trường hoặc chỉ số</th>
              {HIDEABLE_ROLES.map(role => (
                <th key={role} scope="col" className="px-2 py-2 text-center font-semibold">
                  <div>{userRoleLabels[role]}</div>
                  <div className="mt-1 flex justify-center gap-1">
                    <button type="button" onClick={() => onApplyCompact(role)} className="min-h-8 rounded-md border border-rule bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Gọn</button>
                    <button type="button" onClick={() => onShowAll(role)} className="min-h-8 rounded-md border border-rule bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Đủ</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            <tr><th colSpan={HIDEABLE_ROLES.length + 1} scope="colgroup" className="bg-slate-100 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Trường dữ liệu ({visibleFields.length})</th></tr>
            {renderRows(visibleFields, onToggleField)}
            <tr><th colSpan={HIDEABLE_ROLES.length + 1} scope="colgroup" className="bg-slate-100 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Chỉ số ({visibleMetrics.length})</th></tr>
            {renderRows(visibleMetrics, onToggleMetric)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">"Gọn" giữ cho vai trò đó {compactFieldKeys.size} trường cơ bản và mọi chỉ số; "Đủ" bỏ mọi giới hạn của vai trò.</p>
    </div>
  );
};
