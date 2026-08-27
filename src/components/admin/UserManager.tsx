import React, { useMemo, useState } from 'react';
import {
  Building2,
  Key,
  Layers3,
  Mail,
  MapPinned,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Upload,
  Download,
  X,
} from 'lucide-react';
import { BulkUserImportDTO, BulkUserImportResult, CreatedUserResponse, CreateUserDTO, OrgUnit, UserProfile, UserRole, coplusRoleLabel, inferCoPlusRole } from '../../../shared/contracts';
import { userRoleLabels } from '../../content/ui-copy';
import { parseUserImportFile, type UserImportPreviewRow } from '../../lib/user-import';

interface Props {
  users: UserProfile[];
  orgUnits: OrgUnit[];
  onUserCreated: (user: CreateUserDTO) => Promise<CreatedUserResponse>;
  onUsersImported: (batch: BulkUserImportDTO) => Promise<BulkUserImportResult>;
}

type DirectoryView = 'INTERNAL' | 'GEOGRAPHY';

const UserCard: React.FC<{ user: UserProfile; compact?: boolean }> = ({ user, compact = false }) => (
  <article className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="truncate text-sm font-bold text-slate-900">{user.fullName}</h5>
          {user.teamRole === 'LEAD' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              <ShieldCheck className="h-3 w-3" /> Trưởng nhóm
            </span>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-slate-500">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
        {user.isActive ? 'Hoạt động' : 'Tạm khóa'}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
      <span className="rounded-md bg-[#006b68]/10 px-2 py-1 text-[#006b68]" title={userRoleLabels[user.primaryRole]}>{user.coplusRole ? coplusRoleLabel(user.coplusRole) : userRoleLabels[user.primaryRole]}</span>
      {user.coplusRole && <span className="rounded-md bg-slate-900/5 px-2 py-1 font-mono text-slate-600">{user.coplusRole}</span>}
      {user.department && <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{user.department}</span>}
    </div>
  </article>
);

export const UserManager: React.FC<Props> = ({ users, orgUnits, onUserCreated, onUsersImported }) => {
  const [directoryView, setDirectoryView] = useState<DirectoryView>('INTERNAL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [portal, setPortal] = useState<'INTERNAL' | 'BRANCH'>('INTERNAL');
  const [role, setRole] = useState<UserRole>('INTERNAL_OFFICER');
  const [selectedInternalTeam, setSelectedInternalTeam] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<{ fullName: string; username: string; password: string } | null>(null);
  const [userImportPreview, setUserImportPreview] = useState<UserImportPreviewRow[]>([]);
  const [isImportingUsers, setIsImportingUsers] = useState(false);

  const internalTeams = orgUnits.filter(unit => unit.type === 'INTERNAL_TEAM' && unit.isActive);
  const clusters = orgUnits.filter(unit => unit.type === 'CLUSTER' && unit.isActive);
  const branches = orgUnits.filter(unit => unit.type === 'BRANCH' && unit.isActive);
  const branchesInCluster = branches.filter(branch => branch.parentId === selectedCluster);
  const selectedBranchUnit = branches.find(branch => branch.code === selectedBranch);
  const departments = orgUnits.filter(unit => (
    unit.type === 'DEPARTMENT' && unit.parentId === selectedBranchUnit?.id && unit.isActive
  ));

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('vi');
    if (!query) return users;
    return users.filter(user => [
      user.fullName,
      user.email,
      user.internalTeamName,
      user.clusterName,
      user.branchName,
      user.department,
      userRoleLabels[user.primaryRole],
    ].some(value => value?.toLocaleLowerCase('vi').includes(query)));
  }, [searchTerm, users]);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPortal('INTERNAL');
    setRole('INTERNAL_OFFICER');
    setSelectedInternalTeam('');
    setSelectedCluster('');
    setSelectedBranch('');
    setSelectedDepartment('');
  };

  const handlePortalChange = (nextPortal: 'INTERNAL' | 'BRANCH') => {
    setPortal(nextPortal);
    setRole(nextPortal === 'INTERNAL' ? 'INTERNAL_OFFICER' : 'BRANCH_INPUT');
    setSelectedInternalTeam('');
    setSelectedCluster('');
    setSelectedBranch('');
    setSelectedDepartment('');
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const needsInternalTeam = role === 'INTERNAL_OFFICER' || role === 'INTERNAL_APPROVER';
    if (!fullName || !email || (needsInternalTeam && !selectedInternalTeam)) return;
    if (portal === 'BRANCH' && (!selectedBranch || !selectedDepartment)) return;

    const payload: CreateUserDTO = {
      fullName,
      email,
      username: email.split('@')[0],
      portal,
      roles: [role],
      primaryRole: role,
      // Record the CoPlus code the capability corresponds to, so the account is named the way the
      // CoPlus handbook names it rather than by an internal capability constant.
      coplusRole: inferCoPlusRole([role]),
      internalTeamId: needsInternalTeam ? selectedInternalTeam : undefined,
      teamRole: role === 'INTERNAL_APPROVER' ? 'LEAD' : role === 'INTERNAL_OFFICER' ? 'MEMBER' : undefined,
      branchCode: portal === 'BRANCH' ? selectedBranch : undefined,
      department: portal === 'BRANCH' ? selectedDepartment : undefined,
      isActive: true,
    };

    try {
      const created = await onUserCreated(payload);
      resetForm();
      setIsAddModalOpen(false);
      // Mật khẩu tạm chỉ trả về đúng một lần, nên nó phải nằm lại trên màn hình cho tới khi quản
      // trị viên tự đóng — không tự tắt sau vài giây như thông báo thường.
      if (created.temporaryPassword) {
        setIssuedCredential({ fullName, username: created.user.username, password: created.temporaryPassword });
      } else {
        setToastMessage(`Đã thêm ${fullName}.`);
        setTimeout(() => setToastMessage(null), 6000);
      }
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Không thể tạo tài khoản.');
    }
  };

  const systemUsers = filteredUsers.filter(user => user.portal === 'INTERNAL' && !user.internalTeamId);

  const handleUserImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUserImportPreview(await parseUserImportFile(file, users, orgUnits));
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Không thể đọc tệp người dùng.');
    } finally {
      event.target.value = '';
    }
  };

  const commitUserImport = async () => {
    const valid = userImportPreview.filter(row => row.payload && row.errors.length === 0);
    if (!valid.length) return;
    setIsImportingUsers(true);
    const credentials: string[][] = [['Họ và tên', 'Tên đăng nhập', 'Email', 'Mật khẩu tạm']];
    try {
      const result = await onUsersImported({ rows: valid.map(row => ({ rowNumber: row.rowNumber, user: row.payload! })) });
      for (const created of result.created) {
        const source = valid.find(row => row.rowNumber === created.rowNumber);
        credentials.push([created.user.fullName, created.user.username, created.user.email, source?.payload?.password || created.temporaryPassword || 'Đăng nhập Google']);
      }
      if (result.created.length) {
        const csv = '\uFEFF' + credentials.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tai-khoan-vua-tao-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      const failedByRow = new Map(result.failed.map(row => [row.rowNumber, `${row.code}: ${row.message}`]));
      setUserImportPreview(previous => previous
        .filter(row => row.errors.length > 0 || failedByRow.has(row.rowNumber))
        .map(row => failedByRow.has(row.rowNumber)
          ? { ...row, errors: [failedByRow.get(row.rowNumber)!] }
          : row));
      setToastMessage(`Đã tạo ${result.created.length} tài khoản${result.failed.length ? `; ${result.failed.length} dòng chưa tạo` : ' và tải danh sách mật khẩu một lần'}.`);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Không thể hoàn tất lô tài khoản.');
    } finally {
      setIsImportingUsers(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-user-directory">
      {toastMessage && (
        <div role="status" className="flex items-center justify-between rounded-xl bg-[#006b68] p-4 text-xs font-semibold text-white shadow-lg">
          <div className="flex items-center gap-2"><Key className="h-4 w-4" /><span>{toastMessage}</span></div>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setToastMessage(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {issuedCredential && (
        <div role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black text-amber-900"><Key className="h-4 w-4" />Mật khẩu tạm của {issuedCredential.fullName}</p>
              <p className="mt-1 text-[11px] font-semibold text-amber-800">Chỉ hiển thị lần này. Chuyển cho người dùng và yêu cầu đổi ngay sau khi đăng nhập.</p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-amber-300 bg-white p-2.5">
                  <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Tên đăng nhập</dt>
                  <dd className="mt-1 select-all font-mono text-sm font-bold text-slate-900">{issuedCredential.username}</dd>
                </div>
                <div className="rounded-lg border border-amber-300 bg-white p-2.5">
                  <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Mật khẩu tạm</dt>
                  <dd className="mt-1 select-all break-all font-mono text-sm font-bold text-slate-900">{issuedCredential.password}</dd>
                </div>
              </dl>
            </div>
            <button type="button" aria-label="Tôi đã lưu mật khẩu" onClick={() => setIssuedCredential(null)} className="shrink-0 rounded-lg p-1 text-amber-900 hover:bg-amber-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#006b68]">Người dùng</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">Quản lý người dùng</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/templates/mau-nhap-nguoi-dung.xlsx" download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Tải mẫu Excel</a>
            <input id="bulk-user-import" type="file" accept=".xlsx" className="hidden" onChange={handleUserImportFile} />
            <label htmlFor="bulk-user-import" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#006b68] px-4 py-2.5 text-xs font-bold text-[#006b68] hover:bg-teal-50"><Upload className="h-4 w-4" /> Nhập danh sách Excel</label>
            <button type="button" onClick={() => setIsAddModalOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#005956]"><Plus className="h-4 w-4" /> Thêm người dùng</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase text-slate-400">Người dùng</div><div className="mt-1 text-xl font-black text-slate-900">{users.length}</div></div>
          <div className="rounded-xl bg-teal-50 p-3"><div className="text-[10px] font-bold uppercase text-teal-700">Nhóm nội bộ</div><div className="mt-1 text-xl font-black text-[#006b68]">{internalTeams.length}</div></div>
          <div className="rounded-xl bg-cyan-50 p-3"><div className="text-[10px] font-bold uppercase text-cyan-700">Cụm / chi nhánh</div><div className="mt-1 text-xl font-black text-cyan-900">{clusters.length} / {branches.length}</div></div>
        </div>
      </header>

      {userImportPreview.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Xem trước nhập người dùng">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h4 className="text-sm font-bold text-slate-900">Xem trước danh sách người dùng</h4><p className="mt-1 text-xs text-slate-500">{userImportPreview.filter(row => !row.errors.length).length} hợp lệ · {userImportPreview.filter(row => row.errors.length).length} cần sửa. Google OAuth vẫn cấu hình thủ công.</p></div>
            <div className="flex gap-2"><button type="button" onClick={() => setUserImportPreview([])} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600">Hủy</button><button type="button" onClick={commitUserImport} disabled={isImportingUsers || !userImportPreview.some(row => row.payload && !row.errors.length)} className="inline-flex items-center gap-2 rounded-xl bg-[#006b68] px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300"><Download className="h-4 w-4" />{isImportingUsers ? 'Đang tạo...' : 'Tạo tài khoản hợp lệ'}</button></div>
          </div>
          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Dòng</th><th className="p-2">Người dùng</th><th className="p-2">Vai trò</th><th className="p-2">Mật khẩu</th><th className="p-2">Kết quả</th></tr></thead><tbody>{userImportPreview.map(row => <tr key={row.rowNumber} className="border-t border-slate-100"><td className="p-2">{row.rowNumber}</td><td className="p-2"><div className="font-semibold">{row.payload?.fullName || 'Không hợp lệ'}</div><div className="text-slate-500">{row.payload?.email}</div></td><td className="p-2">{row.payload?.primaryRole}</td><td className="p-2">{row.passwordMode === 'PROVIDED' ? 'Đã cung cấp' : 'Tự sinh'}</td><td className={`p-2 ${row.errors.length ? 'text-red-700' : 'text-emerald-700'}`}>{row.errors.join('; ') || 'Sẵn sàng'}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Chế độ phân nhóm người dùng" className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button type="button" role="tab" aria-selected={directoryView === 'INTERNAL'} onClick={() => setDirectoryView('INTERNAL')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold ${directoryView === 'INTERNAL' ? 'bg-[#006b68] text-white shadow' : 'text-slate-600'}`}>
            <Layers3 className="h-4 w-4" /> Khối nội bộ
          </button>
          <button type="button" role="tab" aria-selected={directoryView === 'GEOGRAPHY'} onClick={() => setDirectoryView('GEOGRAPHY')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold ${directoryView === 'GEOGRAPHY' ? 'bg-[#006b68] text-white shadow' : 'text-slate-600'}`}>
            <MapPinned className="h-4 w-4" /> Theo địa bàn
          </button>
        </div>
        <label className="relative block w-full md:max-w-sm">
          <span className="sr-only">Tìm người dùng</span>
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input type="search" placeholder="Tìm tên, email, nhóm, cụm, chi nhánh..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-medium outline-none focus:border-[#006b68] focus:ring-2 focus:ring-[#006b68]/15" />
        </label>
      </div>

      {directoryView === 'INTERNAL' ? (
        <section aria-label="Người dùng khối nội bộ" className="grid gap-4 xl:grid-cols-2">
          {internalTeams.map(team => {
            const teamUsers = filteredUsers.filter(user => user.internalTeamId === team.id);
            const lead = teamUsers.find(user => user.teamRole === 'LEAD');
            const members = teamUsers.filter(user => user.id !== lead?.id);
            return (
              <article key={team.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <div className="border-b border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-[10px] font-bold uppercase tracking-wide text-[#006b68]">Nhóm nội bộ</div><h4 className="mt-1 text-base font-bold text-slate-900">{team.name}</h4><p className="mt-1 text-[11px] text-slate-500">{team.code} · {teamUsers.length} người dùng</p></div>
                    <Users className="h-5 w-5 text-[#006b68]" />
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-amber-700"><UserCheck className="h-3.5 w-3.5" /> Phê duyệt HT</div>
                    {lead ? <UserCard user={lead} compact /> : <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Chưa phân công phê duyệt HT.</div>}
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase text-slate-500">Thành viên nhóm</div>
                    <div className="grid gap-2 sm:grid-cols-2">{members.map(member => <UserCard key={member.id} user={member} compact />)}</div>
                    {!members.length && <div className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">Chưa có thành viên phù hợp bộ lọc.</div>}
                  </div>
                </div>
              </article>
            );
          })}
          {systemUsers.length > 0 && (
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <h4 className="text-sm font-bold text-slate-900">Tài khoản hệ thống</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{systemUsers.map(user => <UserCard key={user.id} user={user} />)}</div>
            </article>
          )}
        </section>
      ) : (
        <section aria-label="Người dùng theo cụm địa bàn" className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs font-semibold text-cyan-900">
            Cụm chỉ dùng để nhóm địa bàn; quyền duyệt thuộc kiểm soát chi nhánh.
          </div>
          {clusters.map(cluster => {
            const clusterBranches = branches.filter(branch => branch.parentId === cluster.id);
            const clusterUserCount = filteredUsers.filter(user => user.clusterName === cluster.name).length;
            return (
              <article key={cluster.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3"><span className="rounded-xl bg-[#006b68] p-2 text-white"><MapPinned className="h-4 w-4" /></span><div><div className="text-[10px] font-bold uppercase text-slate-400">Cụm địa bàn</div><h4 className="text-base font-bold text-slate-900">{cluster.name}</h4></div></div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{clusterBranches.length} chi nhánh · {clusterUserCount} người dùng</span>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {clusterBranches.map(branch => {
                    const branchUsers = filteredUsers.filter(user => user.branchCode === branch.code);
                    const controllers = branchUsers.filter(user => user.primaryRole === 'BRANCH_CONTROLLER');
                    const officers = branchUsers.filter(user => user.primaryRole !== 'BRANCH_CONTROLLER');
                    return (
                      <section key={branch.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-bold uppercase text-[#006b68]">Chi nhánh {branch.code}</div><h5 className="mt-0.5 text-sm font-bold text-slate-900">{branch.name}</h5></div><Building2 className="h-5 w-5 text-[#006b68]" /></div>
                        <div className="mt-3 space-y-3">
                          <div><div className="mb-2 text-[10px] font-bold uppercase text-amber-700">Kiểm soát chi nhánh</div><div className="mb-2 text-[11px] text-slate-500">Kiểm tra hồ sơ và chuyển phê duyệt HT.</div><div className="grid gap-2">{controllers.map(user => <UserCard key={user.id} user={user} compact />)}</div>{!controllers.length && <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">Chưa có người kiểm soát.</div>}</div>
                          <div><div className="mb-2 text-[10px] font-bold uppercase text-slate-500">Cán bộ theo Phòng / PGD</div><div className="grid gap-2">{officers.map(user => <UserCard key={user.id} user={user} compact />)}</div>{!officers.length && <div className="rounded-lg border border-dashed border-slate-300 p-2 text-[11px] text-slate-500">Chưa có cán bộ phù hợp bộ lọc.</div>}</div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="create-user-title" className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#006b68] px-5 py-4 text-white">
              <h4 id="create-user-title" className="text-sm font-bold">Thêm người dùng</h4>
              <button type="button" aria-label="Đóng biểu mẫu" onClick={() => setIsAddModalOpen(false)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Họ và tên<input value={fullName} onChange={event => setFullName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-medium outline-none focus:border-[#006b68]" required /></label>
                <label className="text-xs font-bold text-slate-700">Email doanh nghiệp<input type="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-medium outline-none focus:border-[#006b68]" required /></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Khối người dùng<select value={portal} onChange={event => handlePortalChange(event.target.value as 'INTERNAL' | 'BRANCH')} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="INTERNAL">Khối nội bộ</option><option value="BRANCH">Mạng lưới chi nhánh</option></select></label>
                <label className="text-xs font-bold text-slate-700">Vai trò<select value={role} onChange={event => setRole(event.target.value as UserRole)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs">
                  {portal === 'INTERNAL' ? <><option value="INTERNAL_OFFICER">Cán bộ kiểm tra</option><option value="INTERNAL_APPROVER">Phê duyệt HT</option><option value="SUPERVISOR">Lãnh đạo khối nội bộ</option><option value="ADMIN">Quản trị hệ thống</option></> : <><option value="BRANCH_INPUT">Cán bộ chi nhánh</option><option value="BRANCH_CONTROLLER">Kiểm soát chi nhánh</option><option value="BRANCH_LEADER">Lãnh đạo chi nhánh</option></>}
                </select></label>
              </div>

              {portal === 'INTERNAL' && (role === 'INTERNAL_OFFICER' || role === 'INTERNAL_APPROVER') && (
                <label className="block text-xs font-bold text-slate-700">Nhóm nội bộ<select value={selectedInternalTeam} onChange={event => setSelectedInternalTeam(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs" required><option value="">-- Chọn nhóm --</option>{internalTeams.map(team => <option key={team.id} value={team.id}>{team.code} · {team.name}</option>)}</select></label>
              )}

              {portal === 'BRANCH' && (
                <div className="space-y-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
                  <p className="text-[11px] font-semibold text-cyan-900">Cụm dùng để lọc danh sách; quyền được cấp theo chi nhánh.</p>
                  <label className="block text-xs font-bold text-slate-700">Cụm địa bàn<select value={selectedCluster} onChange={event => { setSelectedCluster(event.target.value); setSelectedBranch(''); setSelectedDepartment(''); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs" required><option value="">-- Chọn cụm --</option>{clusters.map(cluster => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}</select></label>
                  <label className="block text-xs font-bold text-slate-700">Chi nhánh<select value={selectedBranch} onChange={event => { setSelectedBranch(event.target.value); setSelectedDepartment(''); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs" required disabled={!selectedCluster}><option value="">-- Chọn chi nhánh --</option>{branchesInCluster.map(branch => <option key={branch.id} value={branch.code}>{branch.code} · {branch.name}</option>)}</select></label>
                  <label className="block text-xs font-bold text-slate-700">Phòng / PGD<select value={selectedDepartment} onChange={event => setSelectedDepartment(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs" required disabled={!selectedBranch}><option value="">-- Chọn Phòng / PGD --</option>{departments.map(department => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100">Hủy</button>
                <button type="submit" className="min-h-11 rounded-xl bg-[#006b68] px-5 text-xs font-bold text-white hover:bg-[#005956]">Thêm người dùng</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
