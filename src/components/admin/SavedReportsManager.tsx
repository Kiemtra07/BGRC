import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { ReportDefinition, UserRole } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';
import { api } from '../../services/api';

const SHAREABLE_ROLES: UserRole[] = ['SUPERVISOR', 'INTERNAL_APPROVER', 'INTERNAL_OFFICER', 'BRANCH_CONTROLLER', 'BRANCH_LEADER', 'BRANCH_INPUT', 'VIEWER'];
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none';

/**
 * Báo cáo đã lưu của mọi người dùng. Quản trị viên xuất bản một báo cáo cho đúng vai trò bằng cách
 * chọn vai trò được xem, thu hồi bằng cách chuyển về riêng tư, và xóa báo cáo không còn dùng.
 */
export const SavedReportsManager: React.FC = () => {
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReportDefinition | null>(null);
  const [removing, setRemoving] = useState<ReportDefinition | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDefinitions(await api.getReportDefinitions());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách báo cáo đã lưu.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-4" data-testid="saved-reports-manager">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rule bg-white p-4 shadow-panel sm:p-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Báo cáo đã lưu</h3>
          <p className="mt-1 text-xs text-slate-600">Chọn vai trò được xem để chia sẻ một báo cáo. Đánh dấu "báo cáo chuẩn" để nó hiện ở mục riêng "Báo cáo chuẩn" ở màn Báo cáo và người dùng không sửa hay xóa được.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rule px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Tải lại</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-semibold text-brand-700">{notice}</div>}

      <div className="overflow-x-auto rounded-2xl border border-rule bg-white shadow-panel">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="sr-only">Báo cáo đã lưu</caption>
          <thead className="border-b border-rule bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Tên báo cáo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Người tạo</th>
              <th scope="col" className="px-4 py-3 font-semibold">Ai được xem</th>
              <th scope="col" className="px-4 py-3 font-semibold">Cập nhật</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {definitions.map(definition => (
              <tr key={definition.id}>
                <td className="px-4 py-3 font-bold text-slate-900">{definition.name}{definition.isStandard && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[0.75rem] font-bold text-brand-700">Chuẩn</span>}</td>
                <td className="px-4 py-3 text-slate-700">{definition.createdByName}</td>
                <td className="px-4 py-3 text-slate-700">{definition.visibility === 'ROLE_SHARED'
                  ? definition.sharedWithRoles.map(role => userRoleLabels[role]).join(', ')
                  : 'Chỉ người tạo'}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(definition.updatedAt).toLocaleDateString('vi-VN')}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(definition)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rule px-3 font-bold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Sửa</button>
                    <button type="button" onClick={() => setRemoving(definition)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 font-bold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && definitions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Chưa có báo cáo nào được lưu. Người dùng lưu báo cáo từ nút "Lưu cách xem" ở màn Báo cáo.</td></tr>}
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Đang tải...</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <EditDialog
        definition={editing}
        onClose={() => setEditing(null)}
        onSaved={updated => {
          setDefinitions(current => current.map(item => item.id === updated.id ? updated : item));
          setNotice(`Đã cập nhật "${updated.name}".`);
          setEditing(null);
        }}
      />}
      {removing && <DeleteDialog
        definition={removing}
        onClose={() => setRemoving(null)}
        onDeleted={() => {
          setDefinitions(current => current.filter(item => item.id !== removing.id));
          setNotice(`Đã xóa "${removing.name}".`);
          setRemoving(null);
        }}
      />}
    </section>
  );
};

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return { ref, close: () => ref.current?.close(), dialogProps: { onClose } };
}

const EditDialog: React.FC<{ definition: ReportDefinition; onClose: () => void; onSaved: (definition: ReportDefinition) => void }> = ({ definition, onClose, onSaved }) => {
  const { ref, close, dialogProps } = useModal(onClose);
  const [name, setName] = useState(definition.name);
  const [roles, setRoles] = useState<UserRole[]>(definition.visibility === 'ROLE_SHARED' ? definition.sharedWithRoles : []);
  const [standard, setStandard] = useState(Boolean(definition.isStandard));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateReportDefinition(definition.id, {
        name: name.trim(),
        visibility: roles.length ? 'ROLE_SHARED' : 'PRIVATE',
        sharedWithRoles: roles,
        isStandard: roles.length > 0 && standard,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu thay đổi.');
      setSaving(false);
    }
  };

  return (
    <dialog ref={ref} {...dialogProps} aria-labelledby="edit-report-title" className="w-[min(32rem,calc(100vw-1.5rem))] rounded-2xl border border-rule bg-white p-0 shadow-2xl backdrop:bg-slate-900/50">
      <form onSubmit={submit} className="space-y-4 p-5">
        <h3 id="edit-report-title" className="text-base font-bold text-slate-900">Sửa báo cáo đã lưu</h3>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
        <label className="block text-xs font-bold text-slate-700">Tên báo cáo
          <input autoFocus value={name} onChange={event => setName(event.target.value)} minLength={3} maxLength={150} required className={`${inputClass} mt-1`} />
        </label>
        <fieldset>
          <legend className="text-xs font-bold text-slate-700">Vai trò được xem</legend>
          <p className="mt-0.5 text-xs text-slate-500">Bỏ chọn hết để chuyển về riêng tư, chỉ người tạo xem được.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SHAREABLE_ROLES.map(role => (
              <label key={role} className="flex min-h-10 items-center gap-2 rounded-lg border border-rule px-3 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={roles.includes(role)} onChange={() => setRoles(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role])} />
                {userRoleLabels[role]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={`flex min-h-10 items-start gap-2 rounded-lg border border-rule px-3 py-2 text-xs font-semibold ${roles.length ? 'text-slate-700' : 'text-slate-400'}`}>
          <input type="checkbox" className="mt-0.5" checked={standard && roles.length > 0} disabled={roles.length === 0} onChange={event => setStandard(event.target.checked)} />
          <span>Đặt làm báo cáo chuẩn<span className="block font-normal text-slate-500">Hiện ở mục "Báo cáo chuẩn", tách khỏi báo cáo người dùng tự lưu. Cần chọn ít nhất một vai trò.</span></span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-11 rounded-xl border border-rule px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">Hủy</button>
          <button type="submit" disabled={saving || name.trim().length < 3} className="min-h-11 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Đang lưu' : 'Lưu thay đổi'}</button>
        </div>
      </form>
    </dialog>
  );
};

const DeleteDialog: React.FC<{ definition: ReportDefinition; onClose: () => void; onDeleted: () => void }> = ({ definition, onClose, onDeleted }) => {
  const { ref, close, dialogProps } = useModal(onClose);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteReportDefinition(definition.id);
      onDeleted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa báo cáo.');
      setDeleting(false);
    }
  };

  return (
    <dialog ref={ref} {...dialogProps} aria-labelledby="delete-report-title" className="w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl border border-rule bg-white p-0 shadow-2xl backdrop:bg-slate-900/50">
      <div className="space-y-4 p-5">
        <h3 id="delete-report-title" className="text-base font-bold text-slate-900">Xóa "{definition.name}"?</h3>
        <p className="text-xs text-slate-600">Báo cáo biến mất khỏi mọi người đang xem và không khôi phục được. Bảng điều khiển có báo cáo này sẽ không còn hiện nó.</p>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={close} className="min-h-11 rounded-xl border border-rule px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">Giữ lại</button>
          <button type="button" onClick={() => void confirm()} disabled={deleting} className="min-h-11 rounded-xl bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50">{deleting ? 'Đang xóa' : 'Xóa báo cáo'}</button>
        </div>
      </div>
    </dialog>
  );
};
