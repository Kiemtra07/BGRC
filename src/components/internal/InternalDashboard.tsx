import React, { useState } from 'react';
import { CustomerRecord, AuditError, UserProfile } from '../../types';
import { KpiCard } from '../common/KpiCard';
import {
  Users,
  AlertOctagon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  FileSpreadsheet,
  HardDrive,
  ShieldCheck,
  Building2,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface InternalDashboardProps {
  customers: CustomerRecord[];
  currentUser: UserProfile;
  onSelectCustomer: (customer: CustomerRecord) => void;
  onOpenFastIngestion: () => void;
}

export const InternalDashboard: React.FC<InternalDashboardProps> = ({
  customers,
  currentUser,
  onSelectCustomer,
  onOpenFastIngestion
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCluster, setFilterCluster] = useState('ALL');
  const [filterBranch, setFilterBranch] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Compute metrics
  const totalCustomers = customers.length;
  const allErrors = customers.flatMap(c => c.errors);
  const totalErrors = allErrors.length;
  const resolvedErrors = allErrors.filter(e => e.status === 'WAIVED_RESOLVED').length;
  const pendingErrors = allErrors.filter(e => e.status === 'PENDING').length;
  const waitingInternalReview = allErrors.filter(e => e.status === 'SUBMITTED_INTERNAL').length;
  const overdueErrors = allErrors.filter(e => e.isOverdue || (e.status === 'PENDING' && e.deadlineDate !== undefined && new Date(e.deadlineDate) < new Date())).length;
  const resolutionRate = totalErrors > 0 ? Math.round((resolvedErrors / totalErrors) * 100) : 0;

  // Chart Data: Errors by Group
  const errorGroups = ['TD01', 'TD02', 'TD03', 'TD04', 'TD05', 'TD06'];
  const chartDataByGroup = errorGroups.map(grp => {
    const count = allErrors.filter(e => e.errorGroup === grp).length;
    const resolved = allErrors.filter(e => e.errorGroup === grp && e.status === 'WAIVED_RESOLVED').length;
    return {
      name: grp,
      'Tổng lỗi': count,
      'Đã xử lý': resolved,
      'Tồn đọng': count - resolved
    };
  });

  // Chart Data: Errors by Branch
  const branches = Array.from(new Set(customers.map(c => c.branchName)));
  const chartDataByBranch = branches.map(br => {
    const brErrors = customers.filter(c => c.branchName === br).flatMap(c => c.errors);
    return {
      name: br.replace('Chi nhánh ', ''),
      'Tổng lỗi': brErrors.length,
      'Đã duyệt bỏ': brErrors.filter(e => e.status === 'WAIVED_RESOLVED').length
    };
  });

  // Filter logic
  const filteredCustomers = customers.filter(cust => {
    const matchSearch = 
      cust.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.cif.includes(searchTerm) ||
      cust.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.errors.some(e => e.errorCode.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchCluster = filterCluster === 'ALL' || cust.clusterName === filterCluster;
    const matchBranch = filterBranch === 'ALL' || cust.branchName === filterBranch;

    let matchStatus = true;
    if (filterStatus === 'PENDING') {
      matchStatus = cust.errors.some(e => e.status === 'PENDING');
    } else if (filterStatus === 'SUBMITTED_INTERNAL') {
      matchStatus = cust.errors.some(e => e.status === 'SUBMITTED_INTERNAL');
    } else if (filterStatus === 'WAIVED_RESOLVED') {
      matchStatus = cust.errors.every(e => e.status === 'WAIVED_RESOLVED');
    }

    return matchSearch && matchCluster && matchBranch && matchStatus;
  });

  const clusters = ['ALL', ...Array.from(new Set(customers.map(c => c.clusterName)))];

  const COLORS = ['#006b68', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Tổng Quan Khối Kiểm Tra & Giám Sát Nội Bộ
            </h1>
            <span className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
              Khối Nội Bộ
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi tiến độ xử lý sai sót tín dụng toàn quốc, phê duyệt bỏ lỗi và quản lý kho lưu trữ Google Drive tổng.
          </p>
        </div>

        <button
          onClick={onOpenFastIngestion}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-black text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition transform hover:scale-[1.02] flex-shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
          <span>Upload Lô Lỗi Siêu Tốc (Multi-Excel / Zip)</span>
        </button>
      </div>

      {/* Waiting Internal Review Callout Banner */}
      {waitingInternalReview > 0 && (
        <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-600 text-white flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-sky-950">
                Có {waitingInternalReview} hồ sơ sai sót đã được Cụm Chi Nhánh phê duyệt và đẩy lên chờ Khối Nội Bộ duyệt bỏ lỗi!
              </h4>
              <p className="text-[11px] text-sky-700 mt-0.5">
                Vui lòng kiểm tra các tệp đính kèm trên Google Drive và thực hiện phê duyệt.
              </p>
            </div>
          </div>
          <button
            onClick={() => setFilterStatus('SUBMITTED_INTERNAL')}
            className="px-4 py-1.5 text-xs font-bold text-sky-700 bg-white hover:bg-sky-100 border border-sky-200 rounded-xl transition flex-shrink-0 shadow-sm"
          >
            Lọc Xem Ngay
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Tổng Khách Hàng"
          value={totalCustomers}
          subtitle="Hồ sơ được kiểm tra"
          icon={Users}
          iconBgColor="bg-brand-50"
          iconColor="text-brand-500"
          isActive={filterStatus === 'ALL'}
          onClick={() => setFilterStatus('ALL')}
        />
        <KpiCard
          title="Tổng Sai Sót"
          value={totalErrors}
          subtitle={`Tỷ lệ xử lý: ${resolutionRate}%`}
          icon={AlertOctagon}
          iconBgColor="bg-slate-100"
          iconColor="text-slate-700"
        />
        <KpiCard
          title="Đã Bỏ Lỗi / Xong"
          value={resolvedErrors}
          subtitle="Đã duyệt bỏ khỏi hệ thống"
          icon={CheckCircle2}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          badgeText="Hoàn tất"
          badgeType="success"
          isActive={filterStatus === 'WAIVED_RESOLVED'}
          onClick={() => setFilterStatus('WAIVED_RESOLVED')}
        />
        <KpiCard
          title="Chờ Khối Duyệt"
          value={waitingInternalReview}
          subtitle="Cụm đã đẩy duyệt"
          icon={ShieldCheck}
          iconBgColor="bg-sky-50"
          iconColor="text-sky-600"
          badgeText="Cần xử lý"
          badgeType="info"
          isActive={filterStatus === 'SUBMITTED_INTERNAL'}
          onClick={() => setFilterStatus('SUBMITTED_INTERNAL')}
        />
        <KpiCard
          title="Tồn Đọng / Quá Hạn"
          value={pendingErrors}
          subtitle={`${overdueErrors} lỗi quá hạn SLA`}
          icon={Clock}
          iconBgColor="bg-red-50"
          iconColor="text-red-600"
          badgeText={overdueErrors > 0 ? 'Cảnh báo' : undefined}
          badgeType="danger"
          isActive={filterStatus === 'PENDING'}
          onClick={() => setFilterStatus('PENDING')}
        />
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Bar Chart: Errors by Group TD01-TD06 */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Phân Bố Sai Sót Theo Nhóm Nghiệp Vụ (TD01 - TD06)
              </h3>
              <p className="text-[11px] text-slate-500">So sánh số lượng phát sinh và tỷ lệ đã giải quyết</p>
            </div>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-56 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataByGroup}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Tổng lỗi" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Đã xử lý" fill="#006b68" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tồn đọng" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Errors by Branch */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tiến Độ Xử Lý Theo Chi Nhánh
              </h3>
              <p className="text-[11px] text-slate-500">Số lỗi phát sinh và số lỗi đã duyệt bỏ</p>
            </div>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-56 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataByBranch} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Tổng lỗi" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Đã duyệt bỏ" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo CIF, Tên KH, Chi nhánh, Mã sai sót..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          
          <select
            value={filterCluster}
            onChange={(e) => setFilterCluster(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-700 focus:outline-none"
          >
            {clusters.map(c => (
              <option key={c} value={c}>{c === 'ALL' ? 'Tất cả Cụm' : c}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Lỗi đang tồn đọng</option>
            <option value="SUBMITTED_INTERNAL">Chờ Khối duyệt bỏ lỗi</option>
            <option value="WAIVED_RESOLVED">Đã duyệt bỏ lỗi</option>
          </select>

          {(searchTerm || filterCluster !== 'ALL' || filterStatus !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCluster('ALL');
                setFilterStatus('ALL');
              }}
              className="text-xs text-brand-600 font-bold hover:underline px-2"
            >
              Xóa lọc
            </button>
          )}

        </div>

      </div>

      {/* Main Customers & Errors Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Danh Sách Hồ Sơ Khách Hàng & Sai Sót ({filteredCustomers.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Hiển thị dữ liệu trích xuất từ các tiểu biên bản kiểm tra
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Khách Hàng / CIF</th>
                <th className="p-3.5">Đơn Vị & Cụm</th>
                <th className="p-3.5">Dư Nợ (Tr.đ)</th>
                <th className="p-3.5">Danh Sách Mã Sai Sót</th>
                <th className="p-3.5">Hồ Sơ Đính Kèm (Drive)</th>
                <th className="p-3.5">Trạng Thái Xử Lý</th>
                <th className="p-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                    Không tìm thấy hồ sơ nào khớp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(cust => {
                  const hasWaitingInternal = cust.errors.some(e => e.status === 'SUBMITTED_INTERNAL');
                  const allResolved = cust.errors.every(e => e.status === 'WAIVED_RESOLVED');
                  const driveCount = cust.errors.flatMap(e => e.attachments).length;

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition">
                      
                      {/* Name & CIF */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{cust.customerName}</div>
                        <div className="text-[11px] font-mono font-semibold text-brand-600 mt-0.5">
                          CIF: {cust.cif} • {cust.loanGroup}
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="p-3.5 text-slate-700">
                        <div className="font-semibold">{cust.branchName}</div>
                        <div className="text-[11px] text-slate-500">{cust.department} ({cust.clusterName})</div>
                      </td>

                      {/* Debt */}
                      <td className="p-3.5 font-bold text-slate-900">
                        {cust.creditBalance.toLocaleString()} Tr.đ
                        <div className="text-[10px] text-slate-400 font-normal">TSBĐ: {cust.collateralValue.toLocaleString()} Tr</div>
                      </td>

                      {/* Errors Badges */}
                      <td className="p-3.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {cust.errors.map(err => {
                            const isResolved = err.status === 'WAIVED_RESOLVED';
                            const isWaiting = err.status === 'SUBMITTED_INTERNAL';
                            return (
                              <span
                                key={err.id}
                                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
                                  isResolved
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 line-through opacity-70'
                                    : isWaiting
                                    ? 'bg-sky-50 text-sky-700 border-sky-300 ring-1 ring-sky-300'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}
                                title={err.errorTitle}
                              >
                                {err.errorCode}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Drive Files */}
                      <td className="p-3.5">
                        {driveCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                            <HardDrive className="w-3.5 h-3.5 text-brand-500" />
                            {driveCount} file trên Drive
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Chưa có file</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        {allResolved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Đã Bỏ Toàn Bộ Lỗi
                          </span>
                        ) : hasWaitingInternal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            <ShieldCheck className="w-3 h-3 text-sky-600" /> Chờ Khối Duyệt Bỏ Lỗi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" /> Đang Chờ Chi Nhánh
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => onSelectCustomer(cust)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Chi Tiết & Duyệt</span>
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
