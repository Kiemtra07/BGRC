import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, History, RefreshCw, Search } from 'lucide-react';
import { AuditLogEntry, UserRole, WorkflowCommand } from '../../../shared/contracts';
import { api } from '../../services/api';
import { userRoleLabels, workflowEventLabels } from '../../content/ui-copy';

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
};

const isWorkflowCommand = (eventType: string): eventType is WorkflowCommand => eventType in workflowEventLabels;
const eventLabel = (eventType: string): string => isWorkflowCommand(eventType) ? workflowEventLabels[eventType] : 'Cập nhật hồ sơ';
const roleLabel = (role: string): string => userRoleLabels[role as UserRole] || 'Người dùng';

export const AuditTrailViewer: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Nhật ký xử lý</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Dữ liệu thử nghiệm, chưa dùng cho vận hành chính thức.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#006b68]/20 bg-[#006b68]/10 px-3 py-1 text-xs font-bold text-[#006b68]">
            <Database className="h-3.5 w-3.5" />
            Dữ liệu thử nghiệm
          </span>
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
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium outline-none transition focus:border-[#006b68] focus:ring-2 focus:ring-[#006b68]/20"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadAuditEvents()}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#006b68] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#005a58] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">Không tải được nhật ký</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    <p className="text-sm font-bold text-[#006b68]">{log.targetEntity}</p>
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
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
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
                      <td className="px-5 py-3.5 font-bold text-[#006b68]">{log.targetEntity}</td>
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
