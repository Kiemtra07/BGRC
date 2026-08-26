import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  FileSpreadsheet, 
  Sliders, 
  History, 
  ArrowLeft,
  Database,
  ClipboardCheck,
} from 'lucide-react';
import { AuditCampaign, CreateAuditCampaignDTO, CreateReportChannelDTO, CreatedUserResponse, CreateUserDTO, OrgUnit, UserProfile, ReportChannel, UpdateReportChannelDTO } from '../../../shared/contracts';
import { DynamicChannelManager } from './DynamicChannelManager';
import { OrganizationManager } from './OrganizationManager';
import { UserManager } from './UserManager';
import { ButtonPermissionMatrix } from './ButtonPermissionMatrix';
import { AuditTrailViewer } from './AuditTrailViewer';
import { ReportCatalogManager } from './ReportCatalogManager';
import { CampaignManager } from './campaigns/CampaignManager';

interface Props {
  orgUnits: OrgUnit[];
  users: UserProfile[];
  channels: ReportChannel[];
  campaigns: AuditCampaign[];
  onOrgUnitCreated: (unit: Partial<OrgUnit>) => Promise<void>;
  onUserCreated: (user: CreateUserDTO) => Promise<CreatedUserResponse>;
  onChannelCreated: (channel: Partial<CreateReportChannelDTO>) => Promise<void>;
  onChannelUpdated: (id: string, channel: UpdateReportChannelDTO) => Promise<void>;
  onChannelDeleted: (id: string) => Promise<void>;
  onCampaignCreated: (campaign: CreateAuditCampaignDTO) => Promise<void>;
  onCampaignProvisionDrive: (id: string) => Promise<void>;
  onBackToPortal?: () => void;
}

type AdminTab = 'CAMPAIGNS' | 'CHANNELS' | 'REPORT_CATALOG' | 'ORGANIZATION' | 'USERS' | 'PERMISSIONS' | 'AUDIT_LOG';

export const AdminPortal: React.FC<Props> = ({
  orgUnits,
  users,
  channels,
  campaigns,
  onOrgUnitCreated,
  onUserCreated,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
  onCampaignCreated,
  onCampaignProvisionDrive,
  onBackToPortal
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('CAMPAIGNS');

  const tabs: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'CAMPAIGNS', label: 'Chuyên đề', icon: ClipboardCheck },
    { id: 'CHANNELS', label: 'Loại báo cáo', icon: FileSpreadsheet },
    { id: 'REPORT_CATALOG', label: 'Trường báo cáo', icon: Database },
    { id: 'ORGANIZATION', label: 'Đơn vị', icon: Building2 },
    { id: 'USERS', label: 'Người dùng', icon: Users },
    { id: 'PERMISSIONS', label: 'Quyền thao tác', icon: Sliders },
    { id: 'AUDIT_LOG', label: 'Nhật ký', icon: History },
  ];

  return (
    <div className="min-w-0 max-w-full space-y-6">
      {/* Top Banner */}
      <div className="bg-[#006b68] rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 bg-white/10 text-white border border-white/25 rounded-full text-[11px] font-bold uppercase tracking-wider">
              AUDIT BGS
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-white">Quản trị</h2>
          <p className="text-xs text-white/80 mt-1">Loại báo cáo, trường dữ liệu, người dùng và quyền hệ thống.</p>
        </div>

        {onBackToPortal && (
          <button
            onClick={onBackToPortal}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 flex items-center gap-2 transition-all self-start md:self-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về hồ sơ</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${isActive ? 'bg-[#006b68] text-white shadow-md shadow-[#006b68]/20' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'CAMPAIGNS' && <CampaignManager campaigns={campaigns} users={users} orgUnits={orgUnits} channels={channels} onCreate={onCampaignCreated} onProvisionDrive={onCampaignProvisionDrive} />}
        {activeTab === 'CHANNELS' && (
          <DynamicChannelManager channels={channels} onChannelCreated={onChannelCreated} onChannelUpdated={onChannelUpdated} onChannelDeleted={onChannelDeleted} />
        )}

        {activeTab === 'ORGANIZATION' && (
          <OrganizationManager orgUnits={orgUnits} onOrgUnitCreated={onOrgUnitCreated} />
        )}

        {activeTab === 'REPORT_CATALOG' && (
          <ReportCatalogManager />
        )}

        {activeTab === 'USERS' && (
          <UserManager users={users} orgUnits={orgUnits} onUserCreated={onUserCreated} />
        )}

        {activeTab === 'PERMISSIONS' && (
          <ButtonPermissionMatrix />
        )}

        {activeTab === 'AUDIT_LOG' && (
          <AuditTrailViewer />
        )}
      </div>
    </div>
  );
};
