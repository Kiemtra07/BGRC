import React, { FormEvent, useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { LoginDTO } from '../../../shared/contracts';

interface LoginPageProps {
  onLogin: (credentials: LoginDTO) => Promise<void>;
}

// Usernames and CoPlus role codes match the CoPlus directory so a persona is the same person here.
const demoUsers = [
  ['Quản trị hệ thống · ADMIN_HT', 'admin.hethong@auditbgs.local', 'AuditAdmin@2026'],
  ['Lê Bá Khánh Linh · GD_KTGSTT', 'linhlbk@auditbgs.local', 'AuditLead@2026'],
  ['Trần Đức Bách · CB1_KTGSTT', 'bachtd@auditbgs.local', 'AuditOfficer@2026'],
  ['Cán bộ hỗ trợ CN 635 · CBHT_CN', 'cbht635@auditbgs.local', 'BranchInput@2026'],
  ['Lê Trần Khánh Ly · CB_GSKT_TH', 'lyltk1@auditbgs.local', 'BranchControl@2026'],
] as const;

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const isDevelopment = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    try {
      setSubmitting(true);
      setError(null);
      await onLogin({ username: username.trim(), password, ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.');
    } finally {
      setSubmitting(false);
    }
  };

  const startGoogleLogin = () => {
    window.location.assign('/api/v1/auth/google');
  };
  const googleLoginEnabled = (import.meta as ImportMeta & { env?: { VITE_AUTH_MODE?: string } }).env?.VITE_AUTH_MODE === 'oidc';

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f7f7] px-4 py-8">
      <section className="w-full max-w-[420px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-teal-950/10">
        <div className="bg-[#006b68] px-7 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-base font-black text-[#006b68]">AB</div>
            <div><div className="text-lg font-black tracking-wide">AUDIT BGS</div><div className="text-xs text-teal-100">Quản lý hồ sơ kiểm tra</div></div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 px-7 py-7">
          <div><h1 className="text-xl font-black text-slate-900">Đăng nhập</h1><p className="mt-1 text-xs text-slate-500">Dùng email và mật khẩu AuditBGS đã được quản trị viên cấp.</p></div>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-800">{error}</div>}

          {googleLoginEnabled && <button type="button" onClick={startGoogleLogin} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:border-[#006b68] hover:bg-teal-50">
            <LogIn className="h-4 w-4 text-[#006b68]" />Đăng nhập với Google
          </button>}

          {googleLoginEnabled && <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />Hoặc email và mật khẩu<span className="h-px flex-1 bg-slate-200" /></div>}
          <label className="block text-xs font-bold text-slate-700">Email đăng nhập
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#006b68] focus-within:ring-2 focus-within:ring-teal-100">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input type="email" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="min-h-11 w-full bg-transparent text-sm outline-none" placeholder="Nhập email doanh nghiệp" autoFocus />
            </span>
          </label>

          <label className="block text-xs font-bold text-slate-700">Mã Google Authenticator <span className="font-normal text-slate-400">(nếu được yêu cầu)</span>
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#006b68] focus-within:ring-2 focus-within:ring-teal-100">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="min-h-11 w-full bg-transparent font-mono text-sm tracking-[0.35em] outline-none" placeholder="123456" />
            </span>
          </label>

          <label className="block text-xs font-bold text-slate-700">Mật khẩu
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#006b68] focus-within:ring-2 focus-within:ring-teal-100">
              <LockKeyhole className="h-4 w-4 text-slate-400" />
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Nhập mật khẩu" />
              <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <button type="submit" disabled={submitting || !username.trim() || !password} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#005956] disabled:cursor-not-allowed disabled:opacity-50">
            <LogIn className="h-4 w-4" />{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          {isDevelopment && <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-slate-700">5 tài khoản dùng thử tại local</summary>
            <div className="mt-3 space-y-2">{demoUsers.map(([role, demoUsername, demoPassword]) => <button key={demoUsername} type="button" onClick={() => { setUsername(demoUsername); setPassword(demoPassword); }} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-[#006b68]"><span className="block font-bold text-slate-800">{role}</span><span className="mt-0.5 block font-mono text-[10px] text-slate-500">{demoUsername} · {demoPassword}</span></button>)}</div>
          </details>}
        </form>
      </section>
    </main>
  );
};
