import React, { useState } from 'react';
import { Building2, Plus, Network, MapPin, Users, X } from 'lucide-react';
import { OrgUnit } from '../../../shared/contracts';

interface Props {
  orgUnits: OrgUnit[];
  onOrgUnitCreated: (unit: Partial<OrgUnit>) => Promise<void>;
}

export const OrganizationManager: React.FC<Props> = ({ orgUnits, onOrgUnitCreated }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'INTERNAL_TEAM' | 'CLUSTER' | 'BRANCH' | 'DEPARTMENT'>('INTERNAL_TEAM');
  const [parentId, setParentId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const headOffice = orgUnits.find(unit => unit.type === 'HEAD_OFFICE');
  const internalTeams = orgUnits.filter(unit => unit.type === 'INTERNAL_TEAM');
  const clusters = orgUnits.filter(u => u.type === 'CLUSTER');
  const branches = orgUnits.filter(u => u.type === 'BRANCH');
  const departments = orgUnits.filter(u => u.type === 'DEPARTMENT');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    try {
      setSubmitError(null);
      await onOrgUnitCreated({
        code,
        name,
        type,
        parentId: type === 'INTERNAL_TEAM' || type === 'CLUSTER' ? headOffice?.id : parentId || undefined,
        isActive: true,
      });
      setCode('');
      setName('');
      setIsAddModalOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo đơn vị.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-slate-900">Cơ cấu tổ chức</h3>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-[#006b68] hover:bg-[#005956] text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm đơn vị</span>
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-[#006b68]"><Users className="h-4 w-4" /><h4 className="text-sm font-bold">Nhóm nội bộ</h4></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {internalTeams.map(team => (
            <article key={team.id} className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
              <div className="text-[10px] font-bold uppercase text-[#006b68]">{team.code}</div>
              <div className="mt-1 text-sm font-bold text-slate-900">{team.name}</div>
              <div className="mt-2 text-[11px] text-slate-600">Phê duyệt HT: <span className="font-bold">{team.leaderName || 'Chưa phân công'}</span></div>
            </article>
          ))}
        </div>
      </section>

      {/* Cluster Grid with Branches */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {clusters.map(cluster => {
          const clusterBranches = branches.filter(b => b.parentId === cluster.id);
          return (
            <div key={cluster.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <Network className="w-4 h-4 text-teal-300" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{cluster.name}</h4>
                    <span className="text-[10px] text-slate-300 font-mono">{cluster.code}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-teal-500/20 text-teal-200 text-[11px] font-bold rounded-full border border-teal-300/30">
                  {clusterBranches.length} chi nhánh
                </span>
              </div>

              <div className="p-4 space-y-2.5 flex-1 overflow-y-auto max-h-96">
                {clusterBranches.map(branch => (
                  <div key={branch.id} className="p-3 bg-slate-50 hover:bg-teal-50/50 rounded-xl border border-slate-200 transition-colors">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-mono font-bold text-xs text-[#006b68]">
                        {branch.code}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800">{branch.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>Chi nhánh trực thuộc</span>
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200">
                      Hoạt động
                    </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
                      {departments.filter(department => department.parentId === branch.id).map(department => <span key={department.id} className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-[#006b68] border border-teal-100">{department.name}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-400" />
                <span>Thêm đơn vị</span>
              </h4>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {submitError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{submitError}</div>}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Loại đơn vị</label>
                <select 
                  value={type} 
                  onChange={e => { setType(e.target.value as typeof type); setParentId(''); }}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-medium bg-white"
                >
                  <option value="INTERNAL_TEAM">Nhóm nghiệp vụ nội bộ</option>
                  <option value="BRANCH">Chi nhánh</option>
                  <option value="CLUSTER">Cụm địa bàn</option>
                  <option value="DEPARTMENT">Phòng/PGD</option>
                </select>
              </div>

              {type === 'BRANCH' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Thuộc cụm</label>
                  <select 
                    value={parentId} 
                    onChange={e => setParentId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs font-medium bg-white"
                  >
                    <option value="">Chọn cụm</option>
                    {clusters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'DEPARTMENT' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Thuộc chi nhánh</label>
                  <select value={parentId} onChange={e => setParentId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs font-medium bg-white" required>
                    <option value="">Chọn chi nhánh</option>
                    {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} - {branch.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mã đơn vị</label>
                <input 
                  type="text" 
                  value={code} 
                  onChange={e => setCode(e.target.value)}
                  placeholder="Ví dụ: 638 hoặc CUM_TAY_BAC" 
                  className="w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tên đơn vị</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="Ví dụ: Chi nhánh Buôn Hồ 2" 
                  className="w-full px-3 py-2 border rounded-lg text-xs font-semibold text-slate-800"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 text-xs font-bold text-white bg-[#006b68] hover:bg-[#005956] rounded-lg shadow-md"
                >
                  Lưu đơn vị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
