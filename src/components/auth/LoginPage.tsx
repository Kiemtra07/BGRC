import React, { FormEvent, useState } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { LoginDTO } from '../../../shared/contracts';

interface LoginPageProps {
  onLogin: (credentials: LoginDTO) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onForgotPassword }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      await onLogin({ username: username.trim(), password });
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
    <main className="relative isolate min-h-screen overflow-hidden bg-[#062b31] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0d4a4b] via-[#062b31] to-[#041e26]" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-24 h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-[#001b20]/40 lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <section className="relative flex min-h-[410px] flex-col overflow-hidden bg-[#0b3f44] p-7 text-white sm:p-10 lg:min-h-[720px] lg:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(196,243,238,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(196,243,238,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
          <svg aria-hidden="true" viewBox="0 0 520 420" className="pointer-events-none absolute -right-24 top-16 h-[420px] w-[520px] text-teal-100/10 sm:-right-10 lg:right-0 lg:top-28">
            <path d="M46 318 144 210 232 264 324 118 466 188" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M144 210 292 246 466 188M232 264 324 118" fill="none" stroke="currentColor" strokeDasharray="5 8" strokeWidth="1" />
            <circle cx="46" cy="318" r="7" fill="#0b3f44" stroke="currentColor" strokeWidth="2" />
            <circle cx="144" cy="210" r="8" fill="#bcebe5" />
            <circle cx="232" cy="264" r="6" fill="#e8b865" />
            <circle cx="324" cy="118" r="9" fill="#0b3f44" stroke="currentColor" strokeWidth="2" />
            <circle cx="466" cy="188" r="7" fill="#bcebe5" />
          </svg>

          <div className="relative flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f5fbfa] text-brand-600 shadow-lg shadow-black/10">
              <ShieldCheck className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[15px] font-black tracking-[0.12em] text-white">AUDIT MONITORING</div>
              <div className="mt-0.5 text-xs font-medium text-teal-100/75">Quản lý hồ sơ kiểm tra</div>
            </div>
          </div>

          <div className="relative mt-auto max-w-xl pt-20 sm:pt-28 lg:pt-36">
            <h1 className="max-w-[12ch] text-4xl font-black leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl">Quản lý hồ sơ kiểm tra</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-teal-50/75 sm:text-[15px]">
              Đăng nhập để tiếp tục theo dõi hồ sơ, bằng chứng và phê duyệt.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center bg-[#f7fbfb] px-5 py-10 sm:px-10 sm:py-14 lg:px-14">
          <div className="w-full max-w-[430px]">
            <div className="mb-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">Audit Monitoring</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950">Đăng nhập</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Sử dụng email và mật khẩu do quản trị viên cấp.</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-5">
              {error && <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-semibold leading-5 text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></div>}

              {googleLoginEnabled && <button type="button" onClick={startGoogleLogin} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-panel transition-colors hover:border-brand-400 hover:bg-brand-50">
                <LogIn className="h-4 w-4 text-brand-600" />Đăng nhập với Google
              </button>}

              {googleLoginEnabled && <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />Hoặc email và mật khẩu<span className="h-px flex-1 bg-slate-200" /></div>}

              <label className="block text-sm font-bold text-slate-800">
                <span className="mb-2 flex items-center justify-between gap-3">Email đăng nhập <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Bắt buộc</span></span>
                <span className="group flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition-colors focus-within:border-brand-500/70 focus-within:ring-0">
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-brand-600" />
                  <input type="email" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:outline-none" placeholder="Nhập email doanh nghiệp" autoFocus />
                </span>
              </label>

              <label className="block text-sm font-bold text-slate-800">
                <span className="mb-2 flex items-center justify-between gap-3">Mật khẩu <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Bắt buộc</span></span>
                <span className="group flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition-colors focus-within:border-brand-500/70 focus-within:ring-0">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-brand-600" />
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:outline-none" placeholder="Nhập mật khẩu" />
                  <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <button type="submit" disabled={submitting || !username.trim() || !password} className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-brand-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg">
                {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" /> : <LogIn className="h-4 w-4" />}
                {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </button>

              {onForgotPassword && <button type="button" onClick={forgotPassword} className="w-full rounded-lg py-1 text-center text-xs font-bold text-brand-600 transition-colors hover:text-brand-800 hover:underline">Quên mật khẩu?</button>}
            </form>

          </div>
        </section>
      </div>

      {forgotOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#021b20]/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title" aria-describedby="forgot-password-description">
        <form onSubmit={event => { event.preventDefault(); void requestForgotPassword(forgotEmail.trim()); }} className="w-full max-w-md rounded-3xl border border-white/60 bg-white p-6 shadow-2xl sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck className="h-5 w-5" /></div>
            <div><h2 id="forgot-password-title" className="text-lg font-black text-slate-950">Đặt lại mật khẩu</h2><p id="forgot-password-description" className="mt-1 text-sm leading-5 text-slate-500">Nhập email doanh nghiệp để nhận liên kết an toàn.</p></div>
          </div>
          <input type="email" required autoFocus autoComplete="email" value={forgotEmail} onChange={event => setForgotEmail(event.target.value)} className="mt-6 min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition-colors focus:border-brand-500/70 focus:ring-0 focus-visible:outline-none" placeholder="email@doanhnghiep.vn" />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setForgotOpen(false)} className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100">Hủy</button><button type="submit" className="min-h-11 rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white shadow-panel transition-colors hover:bg-brand-600">Gửi liên kết</button></div>
        </form>
      </div>}
    </main>
  );
};
