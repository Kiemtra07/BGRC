import React, { useState } from 'react';
import { UserProfile, PortalType, UserRole } from '../../types';
import { MOCK_USERS } from '../../lib/mock-data';
import {
  Shield,
  Building2,
  Users,
  Bell,
  LogOut,
  ChevronDown,
  Mail,
  BookOpen,
  HardDrive,
  Sparkles,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile;
  activePortal: PortalType;
  pendingCount: number;
  overdueCount: number;
  onSelectUser: (user: UserProfile) => void;
  onOpenEmailConfig: () => void;
  onOpenCatalog: () => void;
  onOpenIngestion: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activePortal,
  pendingCount,
  overdueCount,
  onSelectUser,
  onOpenEmailConfig,
  onOpenCatalog,
  onOpenIngestion,
  onLogout
}) => {
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return 'Quản Trị Hệ Thống (Admin)';
      case 'SUPERVISOR': return 'Cán Bộ Giám Sát';
      case 'INTERNAL_APPROVER': return 'Hội Đồng Phê Duyệt Khối';
      case 'INTERNAL_OFFICER': return 'Cán Bộ Kiểm Tra Khối';
      case 'BRANCH_INPUT': return 'User Nhập Liệu Chi Nhánh';
      case 'BRANCH_CONTROLLER': return 'Kiểm soát chi nhánh';
      default: return role;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand & Portal Badge */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center shadow-brand font-black text-lg tracking-wider">
              BGS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 tracking-tight text-base">
                  AuditBGS
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 uppercase">
                  {activePortal === 'INTERNAL' ? 'Cổng Khối Nội Bộ' : 'Cổng Chi Nhánh'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5">
                Quản Lý Sai Sót & Tiểu Biên Bản Kiểm Tra
              </p>
            </div>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2">
          
          {activePortal === 'INTERNAL' && (
            <button
              onClick={onOpenIngestion}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition transform hover:scale-[1.02]"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Nạp Dữ Liệu Siêu Tốc</span>
            </button>
          )}

          <button
            onClick={onOpenCatalog}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Xem bảng mã sai sót TD01-TD10"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Mã Sai Sót</span>
          </button>

          {activePortal === 'INTERNAL' && (
            <button
              onClick={onOpenEmailConfig}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              title="Cấu hình gửi email tự động"
            >
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Email Deadline</span>
            </button>
          )}

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
              title="Thông báo sai sót"
            >
              <Bell className="w-5 h-5" />
              {overdueCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <h4 className="text-xs font-bold text-slate-900">Thông Báo Cảnh Báo</h4>
                  <span className="text-[11px] text-slate-500">Hệ thống AuditBGS</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  {overdueCount > 0 && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-800">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Có {overdueCount} sai sót quá hạn SLA!</p>
                        <p className="text-[11px] text-red-600 mt-0.5">Cần đôn đốc các Chi nhánh Nam Buôn Hồ, Bình Tây xử lý gấp.</p>
                      </div>
                    </div>
                  )}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-slate-700">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Đồng bộ Google Drive đang hoạt động</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Tất cả tài liệu hồ sơ đã được mã hóa an toàn.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-200 mx-1" />

          {/* User Profile & Fast Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-100 transition border border-slate-200"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 font-bold flex items-center justify-center text-xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left hidden lg:block">
                <p className="text-xs font-bold text-slate-900 leading-tight">
                  {currentUser.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {getRoleLabel(currentUser.role)}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Quick Switch User Modal/Dropdown */}
            {showRoleDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in duration-150">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Chuyển Nhanh Quyền Truy Cập (Demo RBAC)
                  </p>
                </div>
                <div className="py-1 space-y-1">
                  {MOCK_USERS.map(user => {
                    const isSelected = user.id === currentUser.id;
                    return (
                      <button
                        key={user.id}
                        onClick={() => {
                          onSelectUser(user);
                          setShowRoleDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-brand-50 text-brand-700 font-bold'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{user.name}</p>
                          <p className="text-[10px] text-slate-500">{getRoleLabel(user.role)}</p>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {user.portal === 'INTERNAL' ? 'Nội Bộ' : 'Chi Nhánh'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-slate-100 mt-1">
                  <button
                    onClick={() => {
                      setShowRoleDropdown(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-red-600 hover:bg-red-50 font-bold flex items-center gap-2 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Đổi Cổng Đăng Nhập
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
