import React, { useState } from 'react';
import { ErrorMasterItem } from '../../types';
import { INITIAL_ERROR_MASTER } from '../../lib/mock-data';
import { X, Search, BookOpen, FileText, CheckCircle } from 'lucide-react';

interface ErrorCatalogModalProps {
  onClose: () => void;
}

export const ErrorCatalogModal: React.FC<ErrorCatalogModalProps> = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');

  const groups = ['ALL', ...Array.from(new Set(INITIAL_ERROR_MASTER.map(m => m.group)))];

  const filteredCatalog = INITIAL_ERROR_MASTER.filter(item => {
    const matchSearch = 
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchGroup = selectedGroup === 'ALL' || item.group === selectedGroup;
    return matchSearch && matchGroup;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-50 text-brand-500">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Bảng Danh Mục Mã Sai Sót Hoạt Động Tín Dụng (Bangma Sai Sot 2026)
              </h3>
              <p className="text-xs text-slate-500">
                Áp dụng đối chiếu cho tất cả các Tiểu biên bản kiểm tra tại các Cụm Chi nhánh
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã lỗi (TD01.01, TD02...), tên lỗi hoặc mô tả..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {groups.map(grp => (
              <button
                key={grp}
                onClick={() => setSelectedGroup(grp)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedGroup === grp
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {grp === 'ALL' ? 'Tất cả nhóm' : grp}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-3">
          {filteredCatalog.map(item => (
            <div
              key={item.code}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-brand-300 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 font-mono font-bold text-xs border border-brand-200">
                    {item.code}
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {item.title}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                  {item.groupName}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {item.description}
              </p>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Văn bản dẫn chiếu: <strong>{item.referenceDoc}</strong></span>
                <span className="text-brand-600 font-medium">Quy chuẩn Khối Kiểm Tra Nội Bộ</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
