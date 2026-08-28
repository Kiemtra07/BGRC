import React from 'react';
import { Check, LockKeyhole, X } from 'lucide-react';
import { workflowActionLabels } from '../../content/ui-copy';

const roleKeys = ['admin', 'officer', 'supervisor', 'approver', 'controller', 'branchLeader', 'branchInput', 'viewer'] as const;
type RoleKey = typeof roleKeys[number];

interface PermissionRow {
  id: string;
  label: string;
  description: string;
  allowed: RoleKey[];
}

const roles: Array<{ key: RoleKey; label: string }> = [
  { key: 'admin', label: 'Quản trị' },
  { key: 'officer', label: 'Cán bộ HT' },
  { key: 'supervisor', label: 'Lãnh đạo HT' },
  { key: 'approver', label: 'Phê duyệt HT' },
  { key: 'controller', label: 'Kiểm soát CN' },
  { key: 'branchLeader', label: 'Lãnh đạo CN' },
  { key: 'branchInput', label: 'Cán bộ CN' },
  { key: 'viewer', label: 'Chỉ xem' },
];

const allRoles = [...roleKeys];
const matrix: PermissionRow[] = [
  { id: 'campaign-config', label: 'Cấu hình chuyên đề', description: 'Tạo, sửa và quản lý chuyên đề kiểm tra', allowed: ['admin', 'officer', 'supervisor', 'approver'] },
  { id: 'report-type-config', label: 'Cấu hình loại báo cáo', description: 'Tạo, sửa và quản lý mẫu, luồng, SLA của loại báo cáo', allowed: ['admin', 'officer', 'supervisor', 'approver'] },
  { id: 'import', label: 'Nhập danh sách sai sót', description: 'Khởi tạo đợt kiểm tra từ dữ liệu chuẩn hóa', allowed: ['admin', 'officer', 'supervisor'] },
  { id: 'create', label: 'Tạo sai sót trực tiếp', description: 'Tạo một mã lỗi mới bằng biểu mẫu', allowed: ['admin', 'officer'] },
  { id: 'upload', label: 'Tải bằng chứng', description: 'Đính kèm hồ sơ PDF hoặc hình ảnh', allowed: ['branchInput'] },
  { id: 'submit', label: workflowActionLabels.submitBranch, description: 'Chuyển hồ sơ sang kiểm soát chi nhánh', allowed: ['branchInput'] },
  { id: 'branch-review', label: `${workflowActionLabels.branchApprove} / ${workflowActionLabels.returnToBranch}`, description: 'Kiểm tra hồ sơ trong phạm vi chi nhánh', allowed: ['controller'] },
  { id: 'branch-leader-review', label: 'Lãnh đạo CN duyệt / chuyển trả', description: 'Bước chỉ có ở luồng ba cấp hoặc hồ sơ gắn dấu sao', allowed: ['branchLeader'] },
  { id: 'internal-review', label: `${workflowActionLabels.internalApprove} / ${workflowActionLabels.returnToBranch}`, description: 'Ra quyết định cuối cùng', allowed: ['supervisor', 'approver'] },
  { id: 'export', label: 'Khai thác và xuất báo cáo', description: 'Xuất dữ liệu theo đúng phạm vi được cấp', allowed: allRoles },
];

const PermissionCell: React.FC<{ allowed: boolean; role: string; action: string }> = ({ allowed, role, action }) => (
  <span
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
    title={`${role}: ${allowed ? 'được phép' : 'không được phép'} ${action}`}
    aria-label={`${role}: ${allowed ? 'được phép' : 'không được phép'} ${action}`}
  >
    {allowed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
  </span>
);

export const ButtonPermissionMatrix: React.FC = () => (
  <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Quyền thao tác</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Quyền đang áp dụng; bảng này chỉ dùng để đối chiếu.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#006b68]/20 bg-[#006b68]/10 px-3 py-1 text-xs font-bold text-[#006b68]">
          <LockKeyhole className="h-3.5 w-3.5" />
          Đang áp dụng
        </span>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th className="sticky left-0 z-10 min-w-64 bg-slate-50 px-5 py-4 font-bold">Hành động</th>
              {roles.map(role => <th key={role.key} className="px-3 py-4 text-center font-mono text-[10px] font-bold">{role.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map(row => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="sticky left-0 z-10 bg-white px-5 py-3.5">
                  <div className="font-bold text-slate-900">{row.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{row.description}</div>
                </td>
                {roles.map(role => (
                  <td key={role.key} className="px-3 py-3.5 text-center">
                    <PermissionCell allowed={row.allowed.includes(role.key)} role={role.label} action={row.label.toLowerCase()} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">
        Dữ liệu hiển thị vẫn theo phạm vi được cấp.
      </p>
    </section>
  </div>
);
