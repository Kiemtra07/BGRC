import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import type { CreatedUserResponse, UserProfile } from '../../../shared/contracts';

interface Props {
  user: UserProfile;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (password?: string) => Promise<CreatedUserResponse>;
}

export const UserPasswordModal: React.FC<Props> = ({ user, busy = false, onClose, onSubmit }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password && password !== confirmation) { setError('Mật khẩu xác nhận không khớp.'); return; }
    setError(null);
    try { await onSubmit(password.trim() || undefined); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đổi mật khẩu.'); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="user-password-title" className="w-full max-w-md rounded-2xl border border-rule bg-white shadow-2xl">
      <div className="flex items-center justify-between rounded-t-2xl bg-brand-500 px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100">Bảo mật tài khoản</p><h2 id="user-password-title" className="mt-0.5 text-base font-bold">Đổi mật khẩu</h2></div><button type="button" aria-label="Đóng đổi mật khẩu" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
      <form onSubmit={submit} className="space-y-4 p-5"><div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><KeyRound className="h-4 w-4 text-brand-600" />{user.fullName}</div><p className="mt-1 text-[11px] text-slate-500">{user.email}</p></div>{error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}<Field label="Mật khẩu mới (tùy chọn)"><input type="password" minLength={12} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Để trống để sinh mật khẩu tạm" /></Field><Field label="Xác nhận mật khẩu"><input type="password" minLength={12} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Nhập lại mật khẩu mới" /></Field><p className="text-[11px] leading-relaxed text-slate-500">Nếu để trống, hệ thống sinh mật khẩu tạm và hiển thị đúng một lần. Mọi phiên đăng nhập hiện tại sẽ bị thu hồi.</p><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100">Hủy</button><button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Đang xử lý...' : 'Lưu mật khẩu'}</button></div></form>
    </div>
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block text-xs font-bold text-slate-700">{label}{React.cloneElement(children as React.ReactElement, { className: 'mt-1.5 min-h-11 w-full rounded-xl border border-rule px-3 text-xs font-medium outline-none focus:border-brand-500' })}</label>;
