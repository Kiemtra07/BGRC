import React, { useState } from 'react';
import { CustomerRecord, AuditError, UserProfile } from '../../types';
import { KpiCard } from '../common/KpiCard';
import {
  Building2,
  Users,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Send,
  Upload,
  Search,
  FileText,
  HardDrive,
  CheckCheck,
  Eye,
  AlertTriangle,
  Lock,
  ArrowRight
} from 'lucide-react';

interface BranchDashboardProps {
  customers: CustomerRecord[];
  currentUser: UserProfile;
  onSelectCustomer: (customer: CustomerRecord) => void;
  onBatchPushClusterApprove?: (customerIds: string[]) => void;
}

export const BranchDashboard: React.FC<BranchDashboardProps> = ({
  customers,
  currentUser,
  onSelectCustomer,
  onBatchPushClusterApprove
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>(currentUser.branchName || 'Chi nhánh Nam Buôn Hồ');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Branch list
  const branchList = Array.from(new Set(customers.map(c => c.branchName)));

  // Filter customers for this branch/cluster
  const branchCustomers = customers.filter(c => {
    const matchBranch = selectedBranch === 'ALL' || c.branchName === selectedBranch;
    const matchDept = selectedDept === 'ALL' || c.department === selectedDept;
    return matchBranch && matchDept;
  });

  // Department list for selected branch
  const deptList = ['ALL', ...Array.from(new Set(customers.filter(c => c.branchName === selectedBranch).map(c => c.department)))];

  // Compute branch metrics
  const branchErrors = branchCustomers.flatMap(c => c.errors);
  const totalBranchErrors = branchErrors.length;
  const resolvedBranchErrors = branchErrors.filter(e => e.status === 'WAIVED_RESOLVED').length;
  const pendingBranchInput = branchErrors.filter(e => e.status === 'PENDING').length;
  const waitingClusterApprove = branchErrors.filter(e => e.status === 'SUBMITTED_BRANCH').length;
  const waitingInternal = branchErrors.filter(e => e.status === 'SUBMITTED_INTERNAL').length;

  // Search and status filter
  const displayedCustomers = branchCustomers.filter(cust => {
    const matchSearch = 
      cust.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.cif.includes(searchTerm) ||
      cust.errors.some(e => e.errorCode.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchStatus = true;
    if (filterStatus === 'PENDING') {
      matchStatus = cust.errors.some(e => e.status === 'PENDING');
    } else if (filterStatus === 'SUBMITTED_BRANCH') {
      matchStatus = cust.errors.some(e => e.status === 'SUBMITTED_BRANCH');
    } else if (filterStatus === 'SUBMITTED_INTERNAL') {
      matchStatus = cust.errors.some(e => e.status === 'SUBMITTED_INTERNAL');
    } else if (filterStatus === 'WAIVED_RESOLVED') {
      matchStatus = cust.errors.every(e => e.status === 'WAIVED_RESOLVED');
    }

    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Branch Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-rule shadow-panel flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cổng quản lý sai sót cụm chi nhánh
            </h1>
            <span className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
              {currentUser.clusterName || 'Cụm Tây Nguyên'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tra cứu sai sót theo Cụm/Chi nhánh/Phòng ban, đính kèm hồ sơ khắc phục lên Google Drive và đẩy phê duyệt đa cấp.
          </p>
        </div>

        {/* Cluster / Branch Selector Bar */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-rule">
          <Building2 className="w-4 h-4 text-brand-600 ml-2" />
          <select
            value={selectedBranch}
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setSelectedDept('ALL');
            }}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
          >
            {branchList.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
          >
            {deptList.map(d => (
              <option key={d} value={d}>{d === 'ALL' ? 'Tất cả Phòng / PGD' : d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Role Alert / Notice */}
      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-bold mb-0.5">Quy định lưu trữ & phân quyền Google Drive:</p>
          <p>
            Người nhập liệu tại chi nhánh tải hồ sơ sửa lỗi (.pdf, .docx, .xlsx) lên Google Drive dùng chung. Sau khi bấm <strong>"Đẩy duyệt"</strong>, hồ sơ sẽ bị khóa; chi nhánh chỉ được xem để bảo đảm chứng từ không bị thay đổi. Chỉ Khối Nội bộ được phép xóa tệp.
          </p>
        </div>
      </div>

      {/* Branch KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Tổng khách hàng của chi nhánh"
          value={branchCustomers.length}
          subtitle={selectedBranch}
          icon={Users}
          iconBgColor="bg-brand-50"
          iconColor="text-brand-500"
          isActive={filterStatus === 'ALL'}
          onClick={() => setFilterStatus('ALL')}
        />
        <KpiCard
          title="Tổng sai sót của chi nhánh"
          value={totalBranchErrors}
          subtitle={`${resolvedBranchErrors} lỗi đã hoàn tất`}
          icon={AlertOctagon}
          iconBgColor="bg-slate-100"
          iconColor="text-slate-700"
        />
        <KpiCard
          title="Cần đính kèm hồ sơ"
          value={pendingBranchInput}
          subtitle="Chưa tải tài liệu"
          icon={Clock}
          iconBgColor="bg-red-50"
          iconColor="text-red-600"
          badgeText="Cần xử lý"
          badgeType="danger"
          isActive={filterStatus === 'PENDING'}
          onClick={() => setFilterStatus('PENDING')}
        />
        <KpiCard
          title="Chờ kiểm soát chi nhánh"
          value={waitingClusterApprove}
          subtitle="Đã nộp hồ sơ"
          icon={Send}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          badgeText="Chờ kiểm soát chi nhánh"
          badgeType="warning"
          isActive={filterStatus === 'SUBMITTED_BRANCH'}
          onClick={() => setFilterStatus('SUBMITTED_BRANCH')}
        />
        <KpiCard
          title="Đã gửi Khối Nội bộ"
          value={waitingInternal}
          subtitle="Chờ duyệt bỏ lỗi"
          icon={CheckCheck}
          iconBgColor="bg-info-surface"
          iconColor="text-info"
          badgeText="Chờ Khối"
          badgeType="info"
          isActive={filterStatus === 'SUBMITTED_INTERNAL'}
          onClick={() => setFilterStatus('SUBMITTED_INTERNAL')}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-rule shadow-panel flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo CIF, tên khách hàng hoặc mã lỗi..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${filterStatus === 'ALL' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Tất cả ({branchCustomers.length})
          </button>
          <button
            onClick={() => setFilterStatus('PENDING')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${filterStatus === 'PENDING' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700'}`}
          >
            Chưa xử lý ({pendingBranchInput})
          </button>
          <button
            onClick={() => setFilterStatus('SUBMITTED_BRANCH')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${filterStatus === 'SUBMITTED_BRANCH' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}
          >
            Chờ Kiểm soát chi nhánh ({waitingClusterApprove})
          </button>
          <button
            onClick={() => setFilterStatus('SUBMITTED_INTERNAL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${filterStatus === 'SUBMITTED_INTERNAL' ? 'bg-info-surface0 text-white' : 'bg-info-surface text-info'}`}
          >
            Đã Gửi Khối ({waitingInternal})
          </button>
        </div>
      </div>

      {/* Customer & Error Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayedCustomers.length === 0 ? (
          <div className="col-span-3 bg-white rounded-2xl border border-rule p-12 text-center text-slate-500 text-xs">
            Không có hồ sơ nào thuộc điều kiện lọc.
          </div>
        ) : (
          displayedCustomers.map(cust => {
            const hasPending = cust.errors.some(e => e.status === 'PENDING');
            const hasWaitingCluster = cust.errors.some(e => e.status === 'SUBMITTED_BRANCH');
            const hasWaitingInternal = cust.errors.some(e => e.status === 'SUBMITTED_INTERNAL');
            const allResolved = cust.errors.every(e => e.status === 'WAIVED_RESOLVED');
            const driveCount = cust.errors.flatMap(e => e.attachments).length;

            return (
              <div
                key={cust.id}
                className="bg-white rounded-2xl border border-rule p-5 shadow-panel hover:border-brand-400 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        {cust.customerName}
                      </h3>
                      <div className="text-[11px] font-mono font-semibold text-brand-600 mt-0.5">
                        CIF: {cust.cif} • {cust.loanGroup}
                      </div>
                    </div>
                    {allResolved ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Đã Xong
                      </span>
                    ) : hasWaitingCluster ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Chờ Kiểm soát chi nhánh
                      </span>
                    ) : hasWaitingInternal ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-info-surface text-info border border-info-border">
                        Chờ Khối Duyệt
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                        Cần Khắc Phục
                      </span>
                    )}
                  </div>

                  {/* Branch & Officer Info */}
                  <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Phòng/PGD:</span>
                      <span className="font-medium text-slate-800 truncate max-w-[170px]">{cust.department}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dư nợ tín dụng:</span>
                      <span className="font-bold text-slate-900">{cust.creditBalance.toLocaleString()} Tr.đ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cán bộ QLKH:</span>
                      <span className="font-medium text-slate-800">{cust.officerName}</span>
                    </div>
                  </div>

                  {/* Errors Badges */}
                  <div className="mt-3">
                    <span className="text-[10px] font-bold text-slate-400 block mb-1">
                      Danh sách sai sót ({cust.errors.length}):
                    </span>
                    <div className="space-y-1.5">
                      {cust.errors.map(err => (
                        <div
                          key={err.id}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-rule text-xs"
                        >
                          <span className="font-mono font-bold text-brand-700 bg-white px-1.5 py-0.5 rounded border border-rule text-[10px]">
                            {err.errorCode}
                          </span>
                          <span className="text-[11px] text-slate-700 truncate max-w-[150px]" title={err.errorTitle}>
                            {err.errorTitle}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {err.attachments.length} file
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <HardDrive className="w-3.5 h-3.5 text-brand-600" />
                    <span>{driveCount} tệp trên Drive</span>
                  </div>
                  <button
                    onClick={() => onSelectCustomer(cust)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition transform hover:scale-[1.02]"
                  >
                    <span>Xử lý hồ sơ</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
