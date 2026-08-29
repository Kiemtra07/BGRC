import React, { FormEvent, useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { LoginDTO } from '../../../shared/contracts';

interface LoginPageProps {
  onLogin: (credentials: LoginDTO) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onForgotPassword }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
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
  const requestForgotPassword = async (email: string) => {
    if (!email || !onForgotPassword) return;
    try { await onForgotPassword(email); setError('Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể gửi email đặt lại mật khẩu.'); }
    finally { setForgotOpen(false); }
  };
  const forgotPassword = async () => {
    const email = username.trim();
    if (email) return requestForgotPassword(email);
    setForgotOpen(true);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8">
      <section className="w-full max-w-[420px] overflow-hidden rounded-3xl border border-rule bg-white shadow-xl shadow-teal-950/10">
        <div className="bg-brand-500 px-7 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-base font-black text-brand-600">AM</div>
            <div><div className="text-lg font-black tracking-wide">AUDIT MONITORING</div><div className="text-xs text-teal-100">Quản lý hồ sơ kiểm tra</div></div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 px-7 py-7">
          <div><h1 className="text-xl font-black text-slate-900">Đăng nhập</h1><p className="mt-1 text-xs text-slate-500">Dùng email và mật khẩu Audit Monitoring đã được quản trị viên cấp.</p></div>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-800">{error}</div>}

          {googleLoginEnabled && <button type="button" onClick={startGoogleLogin} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-panel hover:border-brand-500 hover:bg-brand-50">
            <LogIn className="h-4 w-4 text-brand-600" />Đăng nhập với Google
          </button>}

          {googleLoginEnabled && <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />Hoặc email và mật khẩu<span className="h-px flex-1 bg-slate-200" /></div>}
          <label className="block text-xs font-bold text-slate-700">Email đăng nhập
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-rule px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-teal-100">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input type="email" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="min-h-11 w-full bg-transparent text-sm outline-none" placeholder="Nhập email doanh nghiệp" autoFocus />
            </span>
          </label>

          <label className="block text-xs font-bold text-slate-700">Mã Google Authenticator <span className="font-normal text-slate-400">(nếu được yêu cầu)</span>
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-rule px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-teal-100">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="min-h-11 w-full bg-transparent font-mono text-sm tracking-[0.35em] outline-none" placeholder="123456" />
            </span>
          </label>

          <label className="block text-xs font-bold text-slate-700">Mật khẩu
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-rule px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-teal-100">
              <LockKeyhole className="h-4 w-4 text-slate-400" />
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Nhập mật khẩu" />
              <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <button type="submit" disabled={submitting || !username.trim() || !password} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-bold text-white shadow-panel hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
            <LogIn className="h-4 w-4" />{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          {onForgotPassword && <button type="button" onClick={forgotPassword} className="w-full text-center text-xs font-bold text-brand-600 hover:underline">Quên mật khẩu?</button>}
        </form>
      </section>
      {forgotOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
        <form onSubmit={event => { event.preventDefault(); void requestForgotPassword(forgotEmail.trim()); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="forgot-password-title" className="text-lg font-black text-slate-900">Đặt lại mật khẩu</h2>
          <p className="mt-1 text-sm text-slate-500">Nhập email doanh nghiệp để nhận liên kết an toàn.</p>
          <input type="email" required autoFocus autoComplete="email" value={forgotEmail} onChange={event => setForgotEmail(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-rule px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-teal-100" placeholder="email@doanhnghiep.vn" />
          <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setForgotOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Hủy</button><button type="submit" className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">Gửi liên kết</button></div>
        </form>
      </div>}
    </main>
  );
};
