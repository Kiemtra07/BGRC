import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { LoginDTO } from '../../../shared/contracts';

interface LoginPageProps {
  onLogin: (credentials: LoginDTO) => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
}

/** Ba câu này luân phiên ở bảng bên trái; giữ ngắn để đọc trọn trong một nhịp đổi. */
const PANEL_HIGHLIGHTS = [
  { title: 'Theo dõi sai sót theo vòng đời', detail: 'Từ lúc phát hiện tới khi chi nhánh khắc phục và kiểm soát đóng hồ sơ.' },
  { title: 'Bằng chứng khắc phục tập trung', detail: 'Mỗi mã lỗi giữ đủ tệp đính kèm, người chịu trách nhiệm và mốc thời hạn.' },
  { title: 'Phê duyệt nhiều cấp, có dấu vết', detail: 'Chi nhánh trình, kiểm soát duyệt, mọi thao tác đều vào nhật ký.' },
] as const;

const HIGHLIGHT_INTERVAL_MS = 5_200;

/** Đường gấp khúc của biểu đồ; khai báo một lần để nét mờ, nét sáng, vệt chạy
    và mảng nền phía dưới không bao giờ lệch nhau khi chỉnh hình. */
const PANEL_LINE = 'M46 318 144 210 232 264 324 118 466 188';
/** Nối tiếp đường trên rồi đóng xuống đáy — mảng màu dưới đường biểu đồ. */
const PANEL_AREA = `${PANEL_LINE} L466 352 L46 352 Z`;

/* ---------------------------------------------------------------------------
   Nhịp chạy của gói hồ sơ.
   Toàn bộ chuyển động lặp treo vào đúng một chu kỳ: gói sáng chạy hết đường
   trong 65% chu kỳ rồi nghỉ, và mỗi chốt bật sáng đúng lúc gói đi qua. Nhờ
   chung chu kỳ và chỉ lệch nhau bằng `animation-delay`, quan hệ pha giữa gói
   và các chốt giữ nguyên mãi mãi chứ không trôi dần ra khỏi nhau.
   --------------------------------------------------------------------------- */
const PACKET_CYCLE_MS = 5_400;
/** Gói chỉ xuất phát sau khi nét sáng vẽ xong (200ms trễ + 1900ms vẽ). */
const PACKET_START_MS = 2_100;

/** Các nút trên đường gấp khúc, hiện dần theo đúng thứ tự nét vẽ chạy qua.
    `arrive` là mốc gói hồ sơ chạm tới nút, tính từ đầu mỗi chu kỳ — suy ra từ
    độ dài thật của từng đoạn (145.8 / 103.2 / 172.6 / 158.3 ≈ 580 đơn vị), nên
    chốt sáng lên đúng khoảnh khắc đầu vệt sáng đi qua chứ không phải áng chừng. */
const PANEL_NODES = [
  { cx: 46, cy: 318, r: 7, fill: '#0b3f44', halo: '#bcebe5', stroke: true, delay: 400, arrive: 0 },
  { cx: 144, cy: 210, r: 8, fill: '#bcebe5', halo: '#bcebe5', stroke: false, delay: 780, arrive: 833 },
  { cx: 232, cy: 264, r: 6, fill: '#e8b865', halo: '#e8b865', stroke: false, delay: 1080, arrive: 1423 },
  { cx: 324, cy: 118, r: 9, fill: '#0b3f44', halo: '#bcebe5', stroke: true, delay: 1420, arrive: 2410 },
  { cx: 466, cy: 188, r: 7, fill: '#bcebe5', halo: '#bcebe5', stroke: false, delay: 1760, arrive: 3315 },
] as const;

/** Ba lớp của vệt sáng: cùng một nhịp, chỉ trễ nhau vài chục mili-giây nên lớp
    sau luôn nằm phía sau lớp trước và cả cụm đọc thành một vệt có đuôi. */
const PACKET_LAYERS = [
  { lag: 210, width: 8, color: '#bcebe5', opacity: 0.14 },
  { lag: 100, width: 4.5, color: '#d8f4f0', opacity: 0.36 },
  { lag: 0, width: 3, color: '#f4fffd', opacity: 0.95 },
] as const;

/** Bụi sáng trôi lên trong nền bảng — chỉ đủ để mảng tối không phẳng lì. */
const PANEL_MOTES = [
  { cx: 96, cy: 300, r: 2, duration: 14000, delay: 600 },
  { cx: 208, cy: 172, r: 1.6, duration: 17000, delay: 3200 },
  { cx: 372, cy: 246, r: 2.2, duration: 15500, delay: 6400 },
  { cx: 438, cy: 126, r: 1.6, duration: 19000, delay: 9000 },
] as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onForgotPassword }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(
      () => setHighlightIndex(index => (index + 1) % PANEL_HIGHLIGHTS.length),
      HIGHLIGHT_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const highlight = PANEL_HIGHLIGHTS[highlightIndex];

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
    // Chiều cao khung nằm ở `.login-root` trong index.css (dvh có dự phòng vh), không đặt bằng
    // utility vì thứ tự phát CSS của Tailwind làm `100vh` thắng `100dvh`.
    <main className="login-root relative isolate flex overflow-hidden bg-[#062b31] p-3 sm:p-6 lg:px-8 lg:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0d4a4b] via-[#062b31] to-[#041e26]" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-24 h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />

      {/* Mobile xếp dọc: bảng minh hoạ co theo nội dung, khung nhập chiếm phần còn lại. */}
      <div className="login-shell relative mx-auto grid h-full w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-[#001b20]/40 sm:rounded-[2rem] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] lg:grid-rows-1">
        <section className="login-panel relative flex flex-col overflow-hidden bg-[#0b3f44] p-5 text-white sm:p-8 lg:p-14">
          {/* Lưới trôi chậm: nới rộng ra ngoài khung 32px để nhịp dịch chuyển không hở mép. */}
          <div aria-hidden="true" className="login-grid pointer-events-none absolute -inset-x-10 -inset-y-10 opacity-30 [background-image:linear-gradient(rgba(196,243,238,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(196,243,238,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div aria-hidden="true" className="login-aurora pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />
          <div aria-hidden="true" className="login-aurora-slow pointer-events-none absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />

          <svg aria-hidden="true" viewBox="0 0 520 420" className="pointer-events-none absolute -right-16 top-4 h-[260px] w-[322px] opacity-60 text-teal-100/10 sm:opacity-100 sm:-right-10 sm:top-16 sm:h-[420px] sm:w-[520px] lg:right-0 lg:top-28">
            <defs>
              {/* Mảng dưới đường tắt hẳn trước khi chạm đáy để không phủ mờ chữ tiêu đề. */}
              <linearGradient id="login-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#bcebe5" stopOpacity="0.16" />
                <stop offset="62%" stopColor="#bcebe5" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#bcebe5" stopOpacity="0" />
              </linearGradient>
              {/* Hai cạnh dọc khép mảng lại (ở x=46 và x=466) sẽ thành vệt thẳng lộ liễu
                  nếu để nguyên; mặt nạ ngang này làm chúng tan dần vào nền. */}
              <linearGradient id="login-area-edges" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#000" />
                <stop offset="16%" stopColor="#fff" />
                <stop offset="80%" stopColor="#fff" />
                <stop offset="100%" stopColor="#000" />
              </linearGradient>
              <mask id="login-area-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="420">
                <rect x="0" y="0" width="520" height="420" fill="url(#login-area-edges)" />
              </mask>
            </defs>

            <path className="login-area" d={PANEL_AREA} fill="url(#login-area-fill)" stroke="none" mask="url(#login-area-mask)" />

            {/* Nét mờ nằm dưới để đường đi vẫn đọc được trước khi nét sáng vẽ xong. */}
            <path d={PANEL_LINE} fill="none" stroke="currentColor" strokeWidth="1.5" />
            {/* Đường dự phóng: nét đứt trôi chậm về phía điểm đến. */}
            <path className="login-dash-flow" d="M144 210 292 246 466 188M232 264 324 118" fill="none" stroke="#bcebe5" strokeOpacity="0.2" strokeDasharray="5 8" strokeWidth="1" />
            {/* Quầng mờ dưới nét sáng, tĩnh — chỉ để đường có chiều sâu. */}
            <path className="login-line-glow" d={PANEL_LINE} fill="none" stroke="#bcebe5" strokeOpacity="0.16" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <path className="login-draw" d={PANEL_LINE} fill="none" stroke="#bcebe5" strokeOpacity="0.38" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

            {/* Gói hồ sơ chạy dọc đường: lớp rộng mờ đi sau cùng làm đuôi, lớp mảnh
                sáng nhất là đầu vệt. */}
            {PACKET_LAYERS.map(layer => (
              <path
                key={`packet-${layer.lag}`}
                className="login-packet"
                style={{ animationDuration: `${PACKET_CYCLE_MS}ms`, animationDelay: `${PACKET_START_MS + layer.lag}ms` }}
                d={PANEL_LINE}
                fill="none"
                stroke={layer.color}
                strokeOpacity={layer.opacity}
                strokeWidth={layer.width}
                strokeLinecap="round"
              />
            ))}

            {/* Vòng sáng bật ra khỏi chốt đúng lúc gói chạy tới. */}
            {PANEL_NODES.map(node => (
              <circle
                key={`halo-${node.cx}`}
                className="login-halo"
                style={{ animationDuration: `${PACKET_CYCLE_MS}ms`, animationDelay: `${PACKET_START_MS + node.arrive}ms` }}
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill="none"
                stroke={node.halo}
                strokeWidth="1.5"
              />
            ))}

            {PANEL_NODES.map(node => (
              <circle
                key={`${node.cx}-${node.cy}`}
                className="login-node"
                style={{
                  // Hai animation nối nhau: bung vào lúc mở trang, rồi nảy một cái mỗi
                  // lần gói hồ sơ chạy qua. Nhịp nảy là animation đứng sau nên nó thắng
                  // quyền ghi `transform` — đúng thứ mình muốn sau khi nhịp bung xong.
                  animationDelay: `${node.delay}ms, ${PACKET_START_MS + node.arrive}ms`,
                  animationDuration: `520ms, ${PACKET_CYCLE_MS}ms`,
                } as React.CSSProperties}
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill={node.fill}
                stroke={node.stroke ? 'currentColor' : undefined}
                strokeWidth={node.stroke ? 2 : undefined}
              />
            ))}

            {PANEL_MOTES.map(mote => (
              <circle
                key={`mote-${mote.cx}`}
                className="login-mote"
                style={{ animationDuration: `${mote.duration}ms`, animationDelay: `${mote.delay}ms` }}
                cx={mote.cx}
                cy={mote.cy}
                r={mote.r}
                fill="#bcebe5"
              />
            ))}
          </svg>

          <div className="relative flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f5fbfa] text-brand-600 shadow-lg shadow-black/10 sm:h-12 sm:w-12 sm:rounded-2xl">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[13px] font-black tracking-[0.12em] text-white sm:text-[15px]">AUDIT MONITORING</div>
              <div className="mt-0.5 text-[11px] font-medium text-teal-100/75 sm:text-xs">Quản lý hồ sơ kiểm tra</div>
            </div>
          </div>

          <div className="login-panel-copy relative mt-auto max-w-xl pt-5 sm:pt-24 lg:pt-36">
            <h1 className="login-panel-title max-w-[12ch] text-[26px] font-black leading-[1.06] tracking-[-0.03em] text-white sm:text-4xl sm:tracking-[-0.04em] lg:text-5xl lg:leading-[1.04]">Quản lý hồ sơ kiểm tra</h1>
            {/* Câu này lặp ý với câu highlight ngay dưới; trên mobile chỗ đứng quý hơn nên bỏ hẳn. */}
            <p className="login-panel-lede mt-4 hidden max-w-md text-sm leading-6 text-teal-50/75 sm:block sm:text-[15px]">
              Đăng nhập để tiếp tục theo dõi hồ sơ, bằng chứng và phê duyệt.
            </p>

            {/* `key` đổi theo câu đang hiện để React gắn lại node và animation chạy lại từ đầu. */}
            <div className="login-panel-highlight mt-3 min-h-[40px] max-w-md border-l-2 border-teal-200/25 pl-3 sm:mt-7 sm:min-h-[78px] sm:pl-4">
              <p key={`title-${highlightIndex}`} className="login-rise text-[13px] font-bold text-white sm:text-sm">{highlight.title}</p>
              <p key={`detail-${highlightIndex}`} className="login-panel-detail login-rise mt-1.5 hidden text-sm leading-6 text-teal-50/70 sm:block" style={{ animationDelay: '90ms' }}>{highlight.detail}</p>
            </div>

            <div aria-hidden="true" className="login-panel-dots mt-3 flex items-center gap-1.5 sm:mt-5">
              {PANEL_HIGHLIGHTS.map((item, index) => (
                <span
                  key={item.title}
                  className={`h-1 rounded-full transition-all duration-500 ${index === highlightIndex ? 'w-8 bg-teal-200/80' : 'w-3 bg-white/25'}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* `min-h-0` để ô này co được trong grid row; chỉ khi màn quá thấp (điện thoại nằm ngang)
            phần nhập mới tự cuộn bên trong, còn trang thì không bao giờ sinh thanh cuộn. */}
        <section className="login-form-pane flex min-h-0 items-center justify-center overflow-y-auto bg-[#f7fbfb] px-5 py-6 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="w-full max-w-[430px]">
            <div className="login-form-head mb-5 sm:mb-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">Audit Monitoring</p>
                <h2 className="login-form-title mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:mt-3 sm:text-3xl">Đăng nhập</h2>
              </div>
            </div>

            <form onSubmit={submit} className="login-form flex flex-col gap-4 sm:gap-5">
              {error && <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-semibold leading-5 text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></div>}

              {googleLoginEnabled && <button type="button" onClick={startGoogleLogin} className="login-field inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 sm:min-h-14 bg-white px-4 text-sm font-bold text-slate-800 shadow-panel transition-colors hover:border-brand-400 hover:bg-brand-50">
                <LogIn className="h-4 w-4 text-brand-600" />Đăng nhập với Google
              </button>}

              {googleLoginEnabled && <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />Hoặc email và mật khẩu<span className="h-px flex-1 bg-slate-200" /></div>}

              <label className="block text-sm font-bold text-slate-800">
                <span className="mb-1.5 flex items-center justify-between gap-3 sm:mb-2">Email đăng nhập <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Bắt buộc</span></span>
                <span className="login-field group flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 sm:min-h-14 transition-colors focus-within:border-brand-500/70 focus-within:ring-0">
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-brand-600" />
                  <input type="email" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:outline-none" placeholder="Nhập email doanh nghiệp" autoFocus />
                </span>
              </label>

              <label className="block text-sm font-bold text-slate-800">
                <span className="mb-1.5 flex items-center justify-between gap-3 sm:mb-2">Mật khẩu <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Bắt buộc</span></span>
                <span className="login-field group flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 sm:min-h-14 transition-colors focus-within:border-brand-500/70 focus-within:ring-0">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-focus-within:text-brand-600" />
                  <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:outline-none" placeholder="Nhập mật khẩu" />
                  <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <button type="submit" disabled={submitting || !username.trim() || !password} className="login-submit group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-brand-lg sm:min-h-14 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg">
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
