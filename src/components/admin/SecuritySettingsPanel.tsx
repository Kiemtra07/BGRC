import React, { useEffect, useRef, useState } from 'react';
import { CircleCheck, Loader2, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react';
import { MfaPolicy, SecuritySettingsResponse, mfaPolicyLabels } from '../../../shared/contracts';
import { api } from '../../services/api';

/**
 * Google Authenticator is a system policy, not a per-account preference. Enrolment is still
 * per person because TOTP needs one secret each, so this panel pairs the single policy control
 * with the list of accounts the policy now covers but that have not been issued a code yet —
 * without that list, switching the policy on would silently lock people out at next login.
 */
const policyOptions: Array<{ value: MfaPolicy; hint: string }> = [
  { value: 'DISABLED', hint: 'Chỉ dùng email và mật khẩu. Phù hợp khi đang thử nghiệm.' },
  { value: 'REQUIRED_INTERNAL', hint: 'Cán bộ Hội sở phải nhập mã; chi nhánh vẫn đăng nhập như cũ.' },
  { value: 'REQUIRED_ALL', hint: 'Mọi tài khoản đều phải nhập mã 6 chữ số khi đăng nhập.' },
];

export const SecuritySettingsPanel: React.FC = () => {
  const [data, setData] = useState<SecuritySettingsResponse | null>(null);
  const [draft, setDraft] = useState<MfaPolicy>('DISABLED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ fullName: string; secret: string; otpauthUri: string } | null>(null);
  const mountedRef = useRef(true);

  /** Issue or revoke one person's TOTP secret. The server refuses a revoke the policy still needs. */
  const setEnrolment = async (userId: string, fullName: string, enabled: boolean) => {
    try {
      setEnrolling(userId); setError(null); setNotice(null);
      const result = await api.updateUserAuthenticator(userId, { enabled });
      if (!mountedRef.current) return;
      if (result.setup) setIssued({ fullName, ...result.setup });
      else setNotice(`Đã thu hồi mã Google Authenticator của ${fullName}.`);
      const refreshed = await api.getSecuritySettings();
      if (mountedRef.current) setData(refreshed);
    } catch (reason) {
      if (!mountedRef.current) return;
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật mã Authenticator.');
    } finally {
      if (mountedRef.current) setEnrolling(null);
    }
  };

  const load = async () => {
    try {
      setError(null);
      const result = await api.getSecuritySettings();
      if (!mountedRef.current) return;
      setData(result);
      setDraft(result.settings.mfaPolicy);
    } catch (reason) {
      if (!mountedRef.current) return;
      setError(reason instanceof Error ? reason.message : 'Không thể tải cấu hình bảo mật.');
    }
  };

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { void load(); }, []);

  const save = async () => {
    try {
      setBusy(true); setError(null); setNotice(null);
      const result = await api.updateSecuritySettings({ mfaPolicy: draft });
      setData(result);
      setDraft(result.settings.mfaPolicy);
      setNotice(result.pendingEnrolment.length
        ? `Đã lưu. Còn ${result.pendingEnrolment.length} tài khoản chưa được cấp mã — bấm “Cấp mã” ở bảng bên dưới trước khi họ đăng nhập lại.`
        : 'Đã lưu chính sách bảo mật.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu cấu hình bảo mật.');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return (
    <div className="rounded-2xl border border-rule bg-white p-10 text-center shadow-panel">
      {error
        ? <p role="alert" className="text-sm font-semibold text-risk">{error}</p>
        : <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Đang tải cấu hình bảo mật...</p>}
    </div>
  );

  const dirty = draft !== data.settings.mfaPolicy;
  const changed = data.settings.updatedByName
    ? `${data.settings.updatedByName} · ${new Date(data.settings.updatedAt).toLocaleString('vi-VN')}`
    : 'Chưa thay đổi lần nào';

  return (
    <div className="space-y-4" data-testid="security-settings-panel">
      <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-brand-500" />Google Authenticator</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Áp dụng chung cho toàn hệ thống. Từng tài khoản không tự bật hoặc tắt được.</p>
          </div>
          <span className="text-[11px] text-slate-500">Cập nhật gần nhất: {changed}</span>
        </div>

        {error && <div role="alert" className="mt-3 rounded-xl border border-risk-border bg-risk-surface px-3 py-2 text-xs font-semibold text-risk">{error}</div>}
        {notice && <div role="status" className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-600">{notice}</div>}

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Chính sách Google Authenticator</legend>
          {policyOptions.map(option => {
            const active = draft === option.value;
            return (
              <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${active ? 'border-brand-500 bg-brand-50' : 'border-rule bg-white hover:border-brand-300'}`}>
                <input
                  type="radio"
                  name="mfa-policy"
                  className="mt-0.5 accent-brand-500"
                  checked={active}
                  onChange={() => setDraft(option.value)}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900">{mfaPolicyLabels[option.value]}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <span data-numeric className="text-[11px] font-semibold text-slate-500">
            Đang áp dụng cho {data.coveredUserCount} tài khoản đang hoạt động
          </span>
          <div className="flex gap-2">
            {dirty && <button type="button" onClick={() => setDraft(data.settings.mfaPolicy)} className="inline-flex min-h-10 items-center rounded-xl border border-rule px-3.5 text-xs font-bold text-slate-600 hover:border-slate-400">Hoàn tác</button>}
            <button type="button" onClick={save} disabled={busy || !dirty} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-bold text-white shadow-raised transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy ? 'Đang lưu...' : 'Lưu chính sách'}
            </button>
          </div>
        </div>
      </section>

      {/* The secret is shown exactly once — the server never returns it again. */}
      {issued && (
        <section role="status" className="rounded-2xl border border-ok-border bg-ok-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-ok"><CircleCheck className="h-4 w-4" />Đã cấp mã cho {issued.fullName}</h4>
            <button type="button" onClick={() => setIssued(null)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900">Đóng</button>
          </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">Gửi thông tin này cho người dùng để thêm tài khoản vào Google Authenticator. Sau khi đóng, mã sẽ không thể xem lại.</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-rule bg-white p-2.5">
              <dt className="text-[10px] font-bold text-slate-500">Mã bí mật</dt>
              <dd className="mt-1 select-all break-all font-mono text-sm font-bold text-slate-900">{issued.secret}</dd>
            </div>
            <div className="rounded-lg border border-rule bg-white p-2.5">
              <dt className="text-[10px] font-bold text-slate-500">Đường dẫn thiết lập</dt>
              <dd className="mt-1 select-all break-all font-mono text-[10px] font-semibold text-slate-900">{issued.otpauthUri}</dd>
            </div>
          </dl>
        </section>
      )}

      {data.pendingEnrolment.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warn-border bg-warn-surface px-5 py-3 text-xs leading-5 text-warn">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
          {data.pendingEnrolment.length} tài khoản đang bị chính sách bắt buộc nhưng chưa có mã — họ sẽ không đăng nhập được cho tới khi bạn bấm “Cấp mã”.
        </p>
      )}

      {/* One place to issue and revoke. The user directory only displays the resulting state. */}
      <section className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
        <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
          <h4 className="text-sm font-bold text-slate-900">Cấp mã Google Authenticator</h4>
          <span data-numeric className="text-[11px] font-semibold text-slate-500">{data.enrolment.filter(row => row.configured).length}/{data.enrolment.length} đã có mã</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-rule bg-slate-50/80 text-[11px] font-semibold text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Họ tên / email</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Khối</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Chính sách</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Mã</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {data.enrolment.map(row => (
                <tr key={row.id} className="transition-colors hover:bg-brand-50/50">
                  <td className="px-5 py-3">
                    <div className="font-bold text-slate-900">{row.fullName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{row.portal === 'INTERNAL' ? 'Khối nội bộ' : 'Chi nhánh'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px] font-bold ${row.covered ? 'border-info-border bg-info-surface text-info' : 'border-idle-border bg-idle-surface text-idle'}`}>{row.covered ? 'Bắt buộc' : 'Không bắt buộc'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px] font-bold ${row.configured ? 'border-ok-border bg-ok-surface text-ok' : row.covered ? 'border-warn-border bg-warn-surface text-warn' : 'border-idle-border bg-idle-surface text-idle'}`}>{row.configured ? 'Đã cấp' : 'Chưa cấp'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {row.configured ? (
                        <button type="button" disabled={enrolling === row.id || row.covered} title={row.covered ? 'Đổi chính sách trước khi thu hồi, nếu không tài khoản sẽ không đăng nhập được.' : undefined} onClick={() => void setEnrolment(row.id, row.fullName, false)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-risk-border px-2.5 text-[11px] font-bold text-risk hover:bg-risk-surface disabled:cursor-not-allowed disabled:opacity-40">
                          {enrolling === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}Thu hồi
                        </button>
                      ) : (
                        <button type="button" disabled={enrolling === row.id} onClick={() => void setEnrolment(row.id, row.fullName, true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-200 px-2.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-50">
                          {enrolling === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}Cấp mã
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
