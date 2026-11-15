import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Loader2, X } from 'lucide-react';
import type { HandoverResult, UserOpenItems, UserProfile } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';
import { api } from '../../services/api';

interface Props {
  user: UserProfile;
  onClose: () => void;
  onHandedOver?: (result: HandoverResult) => void;
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none';

/**
 * Bàn giao các bước duyệt mà một người đang giữ sang người khác, trước khi khóa hay xóa tài khoản.
 * Dùng phần tử `<dialog>` gốc: trình duyệt lo focus, phím Esc và lớp phủ.
 */
export const HandoverDialog: React.FC<Props> = ({ user, onClose, onHandedOver }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<UserOpenItems | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HandoverResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getUserOpenItems(user.id, recipientId || undefined)
      .then(next => { if (active) setData(next); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách hồ sơ đang giữ.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id, recipientId, reloadKey]);

  const transferable = data?.items.filter(item => item.transferable) ?? [];
  const canSubmit = Boolean(recipientId) && transferable.length > 0 && reason.trim().length >= 5 && password.length > 0 && !submitting;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.stepUp({ password });
      const outcome = await api.executeHandover({
        fromUserId: user.id,
        toUserId: recipientId,
        reason: reason.trim(),
        items: transferable.map(item => ({ findingId: item.findingId, stage: item.stage, expectedVersion: item.version })),
      });
      setResult(outcome);
      onHandedOver?.(outcome);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể bàn giao hồ sơ.');
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  const reloadAfterResult = () => {
    setResult(null);
    setRecipientId('');
    setReason('');
    setReloadKey(key => key + 1);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="handover-title"
      onClose={onClose}
      className="w-[min(56rem,calc(100vw-1.5rem))] max-w-none rounded-2xl border border-rule bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50"
    >
      <form onSubmit={submit} className="flex max-h-[90dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4">
          <div>
            <h2 id="handover-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ArrowRightLeft className="h-4 w-4 text-brand-600" aria-hidden="true" />Bàn giao hồ sơ của {user.fullName}
            </h2>
            <p className="mt-1 text-xs text-slate-600">Chuyển các bước duyệt người này đang giữ sang người khác trước khi khóa, xóa hoặc chuyển chi nhánh.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Đóng" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
          {loading && !data && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Đang tải hồ sơ đang giữ...</p>}

          {result && <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            <p className="font-bold">Đã bàn giao {result.moved} bước duyệt. Người cũ còn giữ {result.remaining} hồ sơ.</p>
            {result.skipped.length > 0 && <>
              <p className="font-semibold">Bỏ qua {result.skipped.length} hồ sơ:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {result.skipped.map(item => <li key={`${item.findingId}:${item.stage}`}><span className="font-mono">{item.findingId}</span> ({userRoleLabels[item.stage]}): {item.message}</li>)}
              </ul>
            </>}
          </div>}

          {data && !result && (data.total === 0
            ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">Người này không còn giữ hồ sơ nào. Có thể khóa hoặc xóa tài khoản.</p>
            : <>
              <p className="text-xs text-slate-700">
                Đang giữ <strong>{data.total}</strong> hồ sơ ở các bước duyệt.
                {data.hiddenOutOfScope > 0 && <> Có <strong>{data.hiddenOutOfScope}</strong> hồ sơ nằm ngoài phạm vi của bạn; cần quản trị viên có phạm vi toàn hệ thống bàn giao nốt.</>}
                {data.items.length < data.total - data.hiddenOutOfScope && <> Danh sách hiển thị tối đa {data.items.length} hồ sơ; bàn giao xong hãy tải lại để làm tiếp.</>}
                {(data.acceptedTargets > 0 || data.watchTargets > 0) && <> Mục tiếp nhận ({data.acceptedTargets}) và theo dõi ({data.watchTargets}) là của riêng người này, không chuyển theo.</>}
              </p>

              <label className="block text-xs">
                <span className="mb-1 block font-bold text-slate-700">Người nhận</span>
                <select autoFocus value={recipientId} onChange={event => setRecipientId(event.target.value)} className={fieldClass} required>
                  <option value="">Chọn người nhận</option>
                  {data.recipientOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.fullName}{option.department ? ` · ${option.department}` : ''} · nhận được {option.eligibleCount}/{data.items.length} hồ sơ
                    </option>
                  ))}
                </select>
                {data.recipientOptions.length === 0 && <span className="mt-1 block font-semibold text-red-700">Chưa có ai đủ điều kiện nhận. Hãy bổ sung người có đúng vai trò và phạm vi.</span>}
              </label>

              <div role="region" aria-label="Danh sách hồ sơ đang giữ" tabIndex={0} className="max-h-72 overflow-auto rounded-xl border border-rule">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <caption className="sr-only">Hồ sơ đang giữ ở các bước duyệt</caption>
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Khách hàng</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Mã lỗi</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Bước</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Hạn</th>
                      {recipientId && <th scope="col" className="px-3 py-2 font-semibold">Chuyển được</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {data.items.map(item => (
                      <tr key={`${item.findingId}:${item.stage}`}>
                        <td className="px-3 py-2"><div className="font-semibold text-slate-900">{item.customerName}</div><div className="font-mono text-slate-500">{item.cif} · {item.branchName}</div></td>
                        <td className="px-3 py-2 font-mono">{item.errorCode}</td>
                        <td className="px-3 py-2">{userRoleLabels[item.stage]}<div className="text-slate-500">{item.isCurrentStage ? 'Đang chờ ngay' : 'Còn ở phía sau'}</div></td>
                        <td className="px-3 py-2">{new Date(`${item.deadlineDate}T00:00:00`).toLocaleDateString('vi-VN')}</td>
                        {recipientId && <td className="px-3 py-2">{item.transferable ? <span className="font-semibold text-emerald-700">Được</span> : <span className="font-semibold text-red-700" title={item.blockedReason}>Bị chặn</span>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recipientId && data.items.length > transferable.length && <p className="text-xs font-semibold text-red-700">{data.items.length - transferable.length} hồ sơ người nhận này không nhận được (thiếu vai trò, ngoài phạm vi hoặc đã giữ bước khác). Chọn người khác cho phần còn lại.</p>}

              <label className="block text-xs">
                <span className="mb-1 block font-bold text-slate-700">Lý do bàn giao</span>
                <textarea value={reason} onChange={event => setReason(event.target.value)} rows={2} minLength={5} required className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none" placeholder="Ví dụ: chuyển công tác sang chi nhánh khác" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-bold text-slate-700">Mật khẩu của bạn để xác nhận</span>
                <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required className={fieldClass} />
              </label>
            </>)}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-3">
          {result && result.remaining > 0 && <button type="button" onClick={reloadAfterResult} className="min-h-11 rounded-xl border border-rule px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">Tải lại danh sách</button>}
          <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-xl border border-rule px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">{result ? 'Đóng' : 'Hủy'}</button>
          {!result && data && data.total > 0 && (
            <button type="submit" disabled={!canSubmit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Bàn giao {transferable.length} hồ sơ
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
};
