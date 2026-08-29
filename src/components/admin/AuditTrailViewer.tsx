import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, History, RefreshCw, Search, Trash2 } from 'lucide-react';
import { AuditLogEntry, UserRole, WorkflowCommand } from '../../../shared/contracts';
import { api } from '../../services/api';
import { securityEventLabels, userRoleLabels, workflowEventLabels } from '../../content/ui-copy';

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
};

const isWorkflowCommand = (eventType: string): eventType is WorkflowCommand => eventType in workflowEventLabels;
const eventLabel = (eventType: string): string => {
  if (isWorkflowCommand(eventType)) return workflowEventLabels[eventType];
  return securityEventLabels[eventType] ?? 'Cập nhật hồ sơ';
};
const roleLabel = (role: string): string => userRoleLabels[role as UserRole] || 'Hệ thống';

export const AuditTrailViewer: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAuditEvents = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setLogs(await api.getAuditEvents());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải nhật ký xử lý.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuditEvents();
  }, [loadAuditEvents]);

  const downloadAuditEvents = async (): Promise<void> => {
    setIsDownloading(true);
    setError('');
    setMessage('');
    try {
      await api.downloadAuditEventsCsv(searchTerm);
      setMessage('Đã bắt đầu tải tệp CSV theo dữ liệu đang lọc.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải nhật ký CSV.');
    } finally {
      setIsDownloading(false);
    }
  };

  const clearTestAuditEvents = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Xóa toàn bộ nhật ký thử nghiệm trên máy hoặc trong môi trường kiểm thử? Thao tác này không thể hoàn tác.',
    );
    if (!confirmed) return;

    setIsClearing(true);
    setError('');
    setMessage('');
    try {
      const { cleared } = await api.clearTestAuditEvents();
      await loadAuditEvents();
      setMessage(`Đã xóa ${cleared} bản ghi nhật ký thử nghiệm.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa nhật ký.');
    } finally {
      setIsClearing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const keyword = searchTerm.trim().toLocaleLowerCase('vi');
    if (!keyword) return logs;
    return logs.filter(log => [
      log.eventType,
      log.actorName,
      log.actorRole,
      log.targetEntity,
      log.details,
      log.cif,
      log.errorCode,
      log.branchCode,
    ].some(value => value.toLocaleLowerCase('vi').includes(keyword)));
  }, [logs, searchTerm]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-rule bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-base font-bold text-slate-900">Nhật ký xử lý</h3>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Tìm trong nhật ký</span>
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Tìm theo sự kiện, người thao tác, CIF, mã lỗi..."
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-rule bg-white py-2.5 pl-10 pr-4 text-xs font-medium outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadAuditEvents()}
            disabled={isDownloading || isClearing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-white px-4 py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-500/5 disabled:cursor-wait disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${isDownloading ? 'animate-pulse' : ''}`} />
            Tải CSV
          </button>
          <button
            type="button"
            onClick={() => void clearTestAuditEvents()}
            disabled={isClearing || isDownloading}
            title="Chỉ dùng cho dữ liệu thử nghiệm trên máy hoặc trong môi trường kiểm thử"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            <Trash2 className={`h-4 w-4 ${isClearing ? 'animate-pulse' : ''}`} />
            Xóa nhật ký thử nghiệm
          </button>
          <button
            type="button"
            onClick={() => void loadAuditEvents()}
            disabled={isLoading || isClearing || isDownloading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">Không thể hoàn tất thao tác</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {message && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {message}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-rule bg-white shadow-panel">
        {isLoading && logs.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-xs font-medium text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Đang tải nhật ký...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
            <History className="h-8 w-8 text-slate-300" />
            <p>{logs.length === 0 ? 'Chưa có thao tác nào.' : 'Không có thao tác phù hợp từ khóa.'}</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {filteredLogs.map(log => (
                <article key={log.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{eventLabel(log.eventType)}</span>
                    <time className="text-right font-mono text-[10px] text-slate-500">{formatTimestamp(log.timestamp)}</time>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-600">{log.targetEntity}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{log.details}</p>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-bold text-slate-700">{log.actorName}</span> · <span>{roleLabel(log.actorRole)}</span>
                  </p>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[960px] w-full text-left text-xs">
                <thead className="border-b border-rule bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Thời gian</th>
                    <th className="px-5 py-3.5 font-bold">Sự kiện</th>
                    <th className="px-5 py-3.5 font-bold">Người thao tác</th>
                    <th className="px-5 py-3.5 font-bold">Đối tượng</th>
                    <th className="px-5 py-3.5 font-bold">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[11px] text-slate-500">{formatTimestamp(log.timestamp)}</td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">{eventLabel(log.eventType)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{log.actorName}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{roleLabel(log.actorRole)}</div>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-brand-600">{log.targetEntity}</td>
                      <td className="max-w-md px-5 py-3.5 leading-5 text-slate-600">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
