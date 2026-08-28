import React from 'react';
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReportMetricDefinition, ReportMetricKey, ReportPivotResult, ReportRunResult } from '../../../shared/contracts';

type ChartType = 'bar' | 'line' | 'pie';

const COLORS = ['#006b68', '#0f766e', '#0891b2', '#2563eb', '#7c3aed', '#c2410c', '#be123c'];

const metricValue = (value: number, metric?: ReportMetricDefinition): string => {
  if (metric?.unit === 'PERCENT') return `${value.toLocaleString('vi-VN')}%`;
  if (metric?.unit === 'MILLION_VND') return `${value.toLocaleString('vi-VN')} triệu`;
  return value.toLocaleString('vi-VN');
};
export const ReportCrosstab: React.FC<{ pivot: ReportPivotResult; metric?: ReportMetricDefinition; onDrill?: (rowKey: string, columnKey?: string) => void }> = ({ pivot, metric, onDrill }) => (
  <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="report-crosstab">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
      <h3 className="text-sm font-bold text-slate-900">Bảng chéo</h3>
      <span className="text-[11px] font-semibold text-slate-500">Theo {pivot.columns.length} cột · {metric?.label || 'Chỉ số'}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="sticky left-0 bg-slate-50 px-4 py-3">Hàng</th>{pivot.columns.map(column => <th key={column.key} className="px-4 py-3 text-right">{column.label}</th>)}<th className="px-4 py-3 text-right">Tổng</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{pivot.rows.map(row => <tr key={row.key}><td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-800">{row.label}</td>{pivot.columns.map(column => <td key={column.key} className="px-4 py-3 text-right text-slate-700">{onDrill ? <button type="button" onClick={() => onDrill(row.key, column.key)} className="underline-offset-2 hover:text-[#006b68] hover:underline">{metricValue(row.values[column.key] || 0, metric)}</button> : metricValue(row.values[column.key] || 0, metric)}</td>)}<td className="px-4 py-3 text-right font-black text-[#006b68]">{onDrill ? <button type="button" onClick={() => onDrill(row.key)} className="underline-offset-2 hover:underline">{metricValue(row.total, metric)}</button> : metricValue(row.total, metric)}</td></tr>)}</tbody>
      </table>
    </div>
    {pivot.rows.length === 0 && <p className="p-5 text-xs text-slate-500">Không có dữ liệu phù hợp với bộ lọc.</p>}
  </div>
);

export const ReportChart: React.FC<{ result: ReportRunResult; metricKey: ReportMetricKey; metric?: ReportMetricDefinition; type: ChartType }> = ({ result, metricKey, metric, type }) => {
  const data = result.groups.map(row => ({ name: row.label, value: row.metricValues[metricKey] || 0 }));
  if (!data.length) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Không có dữ liệu để vẽ biểu đồ.</div>;
  const tooltip = <Tooltip formatter={(value: number) => metricValue(value, metric)} />;
  return <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="report-chart" role="img" aria-label={`Biểu đồ ${metric?.label || 'báo cáo'}`}>
    <div className="mb-3 text-sm font-bold text-slate-900">{metric?.label || 'Chỉ số'} theo nhóm</div>
    <ResponsiveContainer width="100%" height="90%">
      {type === 'line' ? <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}><XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={54} /><YAxis tick={{ fontSize: 11 }} /><Legend /><Line type="monotone" dataKey="value" name={metric?.label || 'Giá trị'} stroke="#006b68" strokeWidth={3} dot={{ r: 3 }} />{tooltip}</LineChart>
        : type === 'pie' ? <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius={96} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{data.map((item, index) => <Cell key={`${item.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie>{tooltip}<Legend /></PieChart>
          : <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}><XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={54} /><YAxis tick={{ fontSize: 11 }} /><Bar dataKey="value" name={metric?.label || 'Giá trị'} fill="#006b68" radius={[5, 5, 0, 0]} />{tooltip}<Legend /></BarChart>}
    </ResponsiveContainer>
  </div>;
};
