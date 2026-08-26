import React, { useState } from 'react';
import { EmailScheduleConfig, EmailLogEntry, CustomerRecord } from '../../types';
import {
  Mail,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers,
  Sparkles,
  History,
  Tag,
  Settings
} from 'lucide-react';

interface EmailSchedulerConfigProps {
  config: EmailScheduleConfig;
  customers: CustomerRecord[];
  onUpdateConfig: (newConfig: EmailScheduleConfig) => void;
  onClose?: () => void;
}

export const EmailSchedulerConfig: React.FC<EmailSchedulerConfigProps> = ({
  config,
  customers,
  onUpdateConfig,
  onClose
}) => {
  const [formData, setFormData] = useState<EmailScheduleConfig>({ ...config });
  const [testSending, setTestSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'CONFIG' | 'LOGS'>('CONFIG');

  const clustersList = ['Cụm Tây Nguyên', 'Cụm TP.HCM', 'Cụm Miền Trung - Tây Nguyên', 'Cụm Miền Bắc'];

  const toggleCluster = (clusterName: string) => {
    const current = formData.recipientClusters;
    const updated = current.includes(clusterName)
      ? current.filter(c => c !== clusterName)
      : [...current, clusterName];
    setFormData({ ...formData, recipientClusters: updated });
  };

  const handleSave = () => {
    onUpdateConfig(formData);
    alert('✅ Đã lưu cấu hình tự động đẩy email deadline thành công!');
    if (onClose) onClose();
  };

  // Test Email Trigger simulation
  const handleSendTestEmail = () => {
    setTestSending(true);
    setTimeout(() => {
      const now = new Date();
      const sentTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const newLogs: EmailLogEntry[] = formData.recipientClusters.map(cluster => ({
        id: 'EML_' + Math.random().toString(36).substring(2, 8),
        sentAt: sentTime,
        clusterName: cluster,
        recipientEmail: `${cluster.toLowerCase().replace(/[^a-z]/g, '')}.audit@bank.vn`,
        subject: formData.emailSubjectTemplate.replace('{TenCum}', cluster),
        errorCount: customers.filter(c => c.clusterName === cluster).flatMap(c => c.errors).filter(e => e.status !== 'WAIVED_RESOLVED').length,
        status: 'SUCCESS'
      }));

      const updatedConfig = {
        ...formData,
        lastSentDate: sentTime,
        logs: [...newLogs, ...formData.logs]
      };

      setFormData(updatedConfig);
      onUpdateConfig(updatedConfig);
      setTestSending(false);
      alert(`🚀 Đã gửi thành công ${newLogs.length} email đôn đốc deadline tới các Cụm Chi Nhánh!`);
    }, 600);
  };

  const insertTag = (tag: string) => {
    setFormData({
      ...formData,
      emailBodyTemplate: formData.emailBodyTemplate + ` ${tag} `
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="brand-gradient p-6 text-white flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
            <Mail className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">
              Cấu Hình Tự Động Gửi Email Đôn Đốc Deadline Xử Lý Lỗi
            </h2>
            <p className="text-xs text-brand-100 mt-1">
              Hệ thống tự động kích hoạt cron job định kỳ gửi email nhắc nhở cho Ban Giám Đốc các Cụm Chi Nhánh có sai sót tồn đọng.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 px-6">
        <button
          onClick={() => setActiveTab('CONFIG')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'CONFIG'
              ? 'border-brand-500 text-brand-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          Thiết Lập Lịch & Mẫu Email
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'LOGS'
              ? 'border-brand-500 text-brand-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          Nhật Ký Email Đã Gửi ({formData.logs.length})
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-6">
        
        {activeTab === 'CONFIG' && (
          <div className="space-y-6">
            
            {/* Toggle Enable & Frequency */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Trạng thái tự động gửi</h4>
                  <p className="text-[11px] text-slate-500">Bật/tắt tiến trình gửi định kỳ</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </label>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Tần suất gửi email
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="DAILY">Hàng ngày (Daily)</option>
                  <option value="WEEKLY">Hàng tuần vào Thứ Hai (Weekly)</option>
                  <option value="ON_OVERDUE">Khi có lỗi phát sinh Quá Hạn (Instant)</option>
                </select>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Khung giờ kích hoạt & Cảnh báo trước (SLA)
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={formData.triggerTime}
                    onChange={(e) => setFormData({ ...formData, triggerTime: e.target.value })}
                    className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                  <div className="flex items-center gap-1 text-[11px] text-slate-600">
                    <span>Trước</span>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={formData.daysBeforeDeadline}
                      onChange={(e) => setFormData({ ...formData, daysBeforeDeadline: parseInt(e.target.value) || 3 })}
                      className="w-12 px-1.5 py-1 text-xs bg-white border border-slate-300 rounded text-center font-bold"
                    />
                    <span>ngày</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recipient Clusters Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-2">
                Các Cụm Chi Nhánh áp dụng nhận email tự động:
              </label>
              <div className="flex gap-2.5 flex-wrap">
                {clustersList.map(cluster => {
                  const isSelected = formData.recipientClusters.includes(cluster);
                  return (
                    <button
                      key={cluster}
                      type="button"
                      onClick={() => toggleCluster(cluster)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${isSelected ? 'text-brand-600' : 'text-slate-400'}`} />
                      {cluster}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject & Body Template Editor */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Tiêu đề Email (Subject):
                </label>
                <input
                  type="text"
                  value={formData.emailSubjectTemplate}
                  onChange={(e) => setFormData({ ...formData, emailSubjectTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-900">
                    Nội dung Email Mẫu (Body Template):
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Thẻ tự động:</span>
                    {['{TenCum}', '{SoLoiTonDong}', '{SoLoiQuaHan}', '{HanChot}', '{LinkPortal}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(tag)}
                        className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 font-mono text-[10px] border border-brand-200 transition"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={7}
                  value={formData.emailBodyTemplate}
                  onChange={(e) => setFormData({ ...formData, emailBodyTemplate: e.target.value })}
                  className="w-full p-3 font-sans text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Lần gửi gần nhất: <strong>{formData.lastSentDate || 'Chưa gửi'}</strong>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testSending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {testSending ? 'Đang gửi thử...' : 'Gửi Thử Nghiệm Ngay Tới Các Cụm'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 px-6 py-2 text-xs font-black text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand transition"
                >
                  Lưu Thiết Lập Tự Động
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'LOGS' && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Thời Gian Gửi</th>
                    <th className="p-3">Cụm Nhận</th>
                    <th className="p-3">Email Người Nhận</th>
                    <th className="p-3">Tiêu Đề</th>
                    <th className="p-3">Số Lượng Lỗi Tồn</th>
                    <th className="p-3">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {formData.logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-600">{log.sentAt}</td>
                      <td className="p-3 font-bold text-slate-900">{log.clusterName}</td>
                      <td className="p-3 text-brand-600 font-mono">{log.recipientEmail}</td>
                      <td className="p-3 text-slate-700 max-w-xs truncate">{log.subject}</td>
                      <td className="p-3 font-bold text-red-600">{log.errorCount} lỗi</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Thành công
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
