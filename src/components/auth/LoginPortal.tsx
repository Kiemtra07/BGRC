import React, { useState } from 'react';
import { PortalType, UserProfile, UserRole } from '../../types';
import { MOCK_USERS } from '../../lib/mock-data';
import {
  Shield,
  Building2,
  Lock,
  ArrowRight,
  Sparkles,
  HardDrive,
  Mail,
  CheckCircle,
  FileCheck
} from 'lucide-react';

interface LoginPortalProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({ onLogin }) => {
  const [selectedPortal, setSelectedPortal] = useState<PortalType>('INTERNAL');

  const internalUsers = MOCK_USERS.filter(u => u.portal === 'INTERNAL');
  const branchUsers = MOCK_USERS.filter(u => u.portal === 'BRANCH');

  const activeUsersList = selectedPortal === 'INTERNAL' ? internalUsers : branchUsers;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-4xl">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500 text-white shadow-brand-lg font-black text-2xl mb-3 tracking-wider">
            BGS
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Hệ Thống Quản Lý Sai Sót & Tiểu Biên Bản Kiểm Tra
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
            Giải pháp số hóa toàn diện quy trình kiểm tra nội bộ, xử lý sai sót tín dụng, lưu trữ Google Drive bảo mật & cảnh báo deadline tự động.
          </p>
        </div>

        {/* 2-Portal Cards Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          
          {/* Card 1: Internal Block Portal */}
          <div
            onClick={() => setSelectedPortal('INTERNAL')}
            className={`p-6 rounded-2xl border-2 transition cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              selectedPortal === 'INTERNAL'
                ? 'bg-white border-brand-500 shadow-brand-lg ring-4 ring-brand-500/10'
                : 'bg-white/80 border-slate-200 hover:border-brand-300 hover:bg-white'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-brand-50 text-brand-600">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="text-xs font-black px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 uppercase">
                  Cổng 1
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900">
                CỔNG KHỐI NỘI BỘ (Internal)
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Dành cho Admin, Cán bộ kiểm tra, Giám sát và Hội đồng phê duyệt.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                  <span>Upload lô lỗi & nạp dữ liệu siêu tốc</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                  <span>Thẩm định & Đồng ý bỏ lỗi</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                  <span>Toàn quyền quản trị & Xóa file Google Drive</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-brand-600">Chọn Cổng Nội Bộ</span>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedPortal === 'INTERNAL' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                {selectedPortal === 'INTERNAL' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
            </div>
          </div>

          {/* Card 2: Branch Cluster Portal */}
          <div
            onClick={() => setSelectedPortal('BRANCH')}
            className={`p-6 rounded-2xl border-2 transition cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              selectedPortal === 'BRANCH'
                ? 'bg-white border-brand-500 shadow-brand-lg ring-4 ring-brand-500/10'
                : 'bg-white/80 border-slate-200 hover:border-brand-300 hover:bg-white'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                  <Building2 className="w-6 h-6" />
                </div>
                <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase">
                  Cổng 2
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900">
                CỔNG CỤM CHI NHÁNH (Branches)
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Dành cho User Nhập liệu Chi nhánh/Phòng ban và User Phê duyệt Cụm.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>Tra cứu danh sách sai sót theo Chi nhánh/Phòng</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>Đính kèm hồ sơ khắc phục lên Google Drive</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>Đẩy duyệt Cụm & Khóa quyền xóa file</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700">Chọn Cổng Chi Nhánh</span>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedPortal === 'BRANCH' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                {selectedPortal === 'BRANCH' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
            </div>
          </div>

        </div>

        {/* Quick User Selector Container */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Chọn Tài Khoản Trực Tiếp Để Đăng Nhập ({selectedPortal === 'INTERNAL' ? 'Khối Nội Bộ' : 'Cụm Chi Nhánh'})
              </h3>
              <p className="text-xs text-slate-500">Mỗi tài khoản được gán phân quyền (RBAC) nghiêm ngặt</p>
            </div>
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200">
              Demo Mode
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeUsersList.map(user => (
              <button
                key={user.id}
                onClick={() => onLogin(user)}
                className="p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/20 text-left transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-sm border border-brand-200 group-hover:bg-brand-500 group-hover:text-white transition">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 transition">
                      {user.name}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {user.department || user.branchName}
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                      Role: {user.role}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition" />
              </button>
            ))}
          </div>
        </div>

        {/* Footer Notes */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Hệ Thống AuditBGS • Màu chủ đạo #006b68 • Nền trắng chuẩn hóa • Font Roboto
        </div>

      </div>
    </div>
  );
};
