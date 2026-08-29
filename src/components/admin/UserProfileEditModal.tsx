import React, { useState } from 'react';
import { Building2, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import type { OrgUnit, UpdateUserDTO, UserProfile } from '../../../shared/contracts';
import { coplusRoleLabel } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';

interface Props {
  user: UserProfile;
  orgUnits: OrgUnit[];
  busy?: boolean;
  onClose: () => void;
  onSave: (data: UpdateUserDTO) => Promise<void>;
}

export const UserProfileEditModal: React.FC<Props> = ({ user, orgUnits, busy = false, onClose, onSave }) => {
  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [googleWorkspaceEmail, setGoogleWorkspaceEmail] = useState(user.googleWorkspaceEmail ?? '');
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);

  const assignedUnit = user.orgUnitId ? orgUnits.find(unit => unit.id === user.orgUnitId) : undefined;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim().toLocaleLowerCase('en-US'),
        phone: phone.trim() || undefined,
        googleWorkspaceEmail: googleWorkspaceEmail.trim(),
        isActive,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật hồ sơ người dùng.');
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="user-profile-edit-title" className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-rule bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-brand-500 px-5 py-4 text-white">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100">Hồ sơ cá nhân</p><h2 id="user-profile-edit-title" className="mt-0.5 text-base font-bold">Sửa hồ sơ người dùng</h2></div>
        <button type="button" aria-label="Đóng hồ sơ người dùng" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={save} className="space-y-5 p-5">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Vai trò" value={user.coplusRole ? coplusRoleLabel(user.coplusRole) : userRoleLabels[user.primaryRole]} icon={<ShieldCheck className="h-4 w-4" />} />
          <Info label="Khối" value={user.portal === 'BRANCH' ? 'Mạng lưới chi nhánh' : 'Khối nội bộ'} icon={<Building2 className="h-4 w-4" />} />
          <Info label="Đơn vị / phòng" value={assignedUnit?.name || user.department || user.branchName || 'Chưa phân công'} icon={<Building2 className="h-4 w-4" />} />
          <Info label="Email đăng nhập" value={user.email} icon={<Mail className="h-4 w-4" />} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ và tên"><input required value={fullName} onChange={event => setFullName(event.target.value)} /></Field>
          <Field label="Tên đăng nhập"><input required minLength={2} value={username} onChange={event => setUsername(event.target.value)} /></Field>
          <Field label="Email doanh nghiệp"><input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></Field>
          <Field label="Số điện thoại"><input value={phone} onChange={event => setPhone(event.target.value)} /></Field>
        </div>
        <Field label="Email Google Workspace để cấp quyền tệp đính kèm"><input type="email" value={googleWorkspaceEmail} onChange={event => setGoogleWorkspaceEmail(event.target.value)} placeholder="Để trống nếu trùng email doanh nghiệp" /><span className="mt-1 block text-[10px] font-medium text-slate-500">Dùng để cấp quyền Google Drive; không thay đổi email đăng nhập.</span></Field>
        <label className="flex items-center gap-2 rounded-xl border border-rule bg-slate-50 px-3 py-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="h-4 w-4 accent-[#006b68]" />Tài khoản đang hoạt động</label>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100">Hủy</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand-500 px-5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu hồ sơ'}</button></div>
      </form>
    </div>
  </div>;
};

const fieldInputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-rule px-3 text-xs font-medium outline-none focus:border-brand-500';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-bold text-slate-700">
    {label}
    {React.Children.map(children, child => {
      if (!React.isValidElement(child) || child.type !== 'input') return child;
      const input = child as React.ReactElement<{ className?: string }>;
      return React.cloneElement(input, { className: [fieldInputClass, input.props.className].filter(Boolean).join(' ') });
    })}
  </label>
);
const Info: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => <div className="rounded-xl border border-rule bg-slate-50 p-3"><div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">{icon}{label}</div><div className="mt-1 text-xs font-bold text-slate-800">{value}</div></div>;
