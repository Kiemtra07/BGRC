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
  ShieldCheck,
} from 'lucide-react';
import { AuditCampaign, BulkUserImportDTO, BulkUserImportResult, BulkOrgUnitImportDTO, BulkOrgUnitImportResult, CampaignImportDraft, CreateAuditCampaignDTO, CreateReportChannelDTO, CreatedUserResponse, CreateUserDTO, OrgUnit, UpdateAuditCampaignDTO, UpdateOrgUnitDTO, UserProfile, ReportChannel, UpdateReportChannelDTO, UpdateAuthenticatorDTO, UpdateAuthenticatorResponse, UpdateUserDTO } from '../../../shared/contracts';
import { DynamicChannelManager } from './DynamicChannelManager';
import { OrganizationManager } from './OrganizationManager';
import { UserManager } from './UserManager';
import { ButtonPermissionMatrix } from './ButtonPermissionMatrix';
import { SecuritySettingsPanel } from './SecuritySettingsPanel';
import { AuditTrailViewer } from './AuditTrailViewer';
import { ReportCatalogManager } from './ReportCatalogManager';
import { CampaignManager } from './campaigns/CampaignManager';

interface Props {
  isSystemAdmin: boolean;
  orgUnits: OrgUnit[];
  users: UserProfile[];
  channels: ReportChannel[];
  campaigns: AuditCampaign[];
  onOrgUnitCreated: (unit: Partial<OrgUnit>) => Promise<void>;
  onOrgUnitUpdated: (id: string, unit: UpdateOrgUnitDTO) => Promise<void>;
  onOrgUnitDeleted: (id: string) => Promise<void>;
  onOrgUnitsImported: (batch: BulkOrgUnitImportDTO) => Promise<BulkOrgUnitImportResult>;
  onUserCreated: (user: CreateUserDTO) => Promise<CreatedUserResponse>;
  onUsersImported: (batch: BulkUserImportDTO) => Promise<BulkUserImportResult>;
  onAuthenticatorChange: (id: string, data: UpdateAuthenticatorDTO) => Promise<UpdateAuthenticatorResponse>;
  onUserUpdated: (id: string, data: UpdateUserDTO) => Promise<UserProfile>;
  onUserDeleted: (id: string) => Promise<void>;
  onUserPasswordReset: (id: string, data?: import('../../../shared/contracts').ResetUserPasswordDTO) => Promise<CreatedUserResponse>;
  onUserPasswordResetEmail?: (id: string) => Promise<void>;
  onChannelCreated: (channel: Partial<CreateReportChannelDTO>) => Promise<void>;
  onChannelUpdated: (id: string, channel: UpdateReportChannelDTO) => Promise<void>;
  onChannelDeleted: (id: string) => Promise<void>;
  onCampaignCreated: (campaign: CreateAuditCampaignDTO) => Promise<void>;
  onCampaignUpdated: (id: string, campaign: UpdateAuditCampaignDTO) => Promise<void>;
  onCampaignDeleted: (id: string) => Promise<void>;
  onCampaignImportDraft: (file: File) => Promise<CampaignImportDraft>;
  onCampaignProvisionDrive: (id: string) => Promise<void>;
  onBackToPortal?: () => void;
}

type AdminTab = 'CAMPAIGNS' | 'CHANNELS' | 'REPORT_CATALOG' | 'ORGANIZATION' | 'USERS' | 'PERMISSIONS' | 'SECURITY' | 'AUDIT_LOG';

export const AdminPortal: React.FC<Props> = ({
  isSystemAdmin,
  orgUnits,
  users,
  channels,
  campaigns,
  onOrgUnitCreated,
  onOrgUnitUpdated,
  onOrgUnitDeleted,
  onOrgUnitsImported,
  onUserCreated,
  onUsersImported,
  onAuthenticatorChange,
  onUserUpdated,
  onUserDeleted,
  onUserPasswordReset,
  onUserPasswordResetEmail,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
  onCampaignCreated,
  onCampaignUpdated,
  onCampaignDeleted,
  onCampaignImportDraft,
  onCampaignProvisionDrive,
  onBackToPortal
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('CAMPAIGNS');

  const allTabs: { id: AdminTab; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: 'CAMPAIGNS', label: 'Chuyên đề', icon: ClipboardCheck },
    { id: 'CHANNELS', label: 'Loại báo cáo', icon: FileSpreadsheet },
    { id: 'REPORT_CATALOG', label: 'Trường báo cáo', icon: Database, adminOnly: true },
    { id: 'ORGANIZATION', label: 'Đơn vị', icon: Building2, adminOnly: true },
    { id: 'USERS', label: 'Người dùng', icon: Users, adminOnly: true },
    { id: 'PERMISSIONS', label: 'Quyền thao tác', icon: Sliders },
    { id: 'SECURITY', label: 'Bảo mật', icon: ShieldCheck, adminOnly: true },
    { id: 'AUDIT_LOG', label: 'Nhật ký', icon: History, adminOnly: true },
  ];
  const tabs = allTabs.filter(tab => isSystemAdmin || !tab.adminOnly);

  return (
    <div className="min-w-0 max-w-full space-y-6">
      {/* Page header. The app bar directly above is already brand-coloured and already says
          AUDIT MONITORING, so a second coloured slab repeating both only pushed the tabs off-screen. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-slate-900">Quản trị</h2>
          <p className="mt-0.5 text-xs text-slate-500">Loại báo cáo, trường dữ liệu, người dùng và quyền hệ thống.</p>
        </div>

        {onBackToPortal && (
          <button
            onClick={onBackToPortal}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-rule bg-white px-3.5 text-xs font-bold text-slate-700 shadow-panel transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Về hồ sơ</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs — an underline rail reads as navigation; a row of filled pills reads as
          five equally urgent actions. */}
      <div className="-mt-2 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto border-b border-rule">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-xs font-bold transition-colors ${isActive ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {/* The required brand navigation colour, carried by the active-tab indicator. */}
              <span aria-hidden className={`absolute inset-x-1 -bottom-px h-0.5 rounded-full ${isActive ? 'bg-[#006b68]' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'CAMPAIGNS' && <CampaignManager canProvisionDrive={isSystemAdmin} campaigns={campaigns} users={users} orgUnits={orgUnits} channels={channels} onCreate={onCampaignCreated} onUpdate={onCampaignUpdated} onDelete={onCampaignDeleted} onImportDraft={onCampaignImportDraft} onProvisionDrive={onCampaignProvisionDrive} />}
        {activeTab === 'CHANNELS' && (
          <DynamicChannelManager channels={channels} onChannelCreated={onChannelCreated} onChannelUpdated={onChannelUpdated} onChannelDeleted={onChannelDeleted} />
        )}

        {activeTab === 'ORGANIZATION' && (
          <OrganizationManager orgUnits={orgUnits} users={users} onOrgUnitCreated={onOrgUnitCreated} onOrgUnitUpdated={onOrgUnitUpdated} onOrgUnitDeleted={onOrgUnitDeleted} onOrgUnitsImported={onOrgUnitsImported} />
        )}

        {activeTab === 'REPORT_CATALOG' && (
          <ReportCatalogManager />
        )}

        {activeTab === 'USERS' && (
          <UserManager users={users} orgUnits={orgUnits} onUserCreated={onUserCreated} onUsersImported={onUsersImported} onAuthenticatorChange={onAuthenticatorChange} onUserUpdated={onUserUpdated} onUserDeleted={onUserDeleted} onUserPasswordReset={onUserPasswordReset} onUserPasswordResetEmail={onUserPasswordResetEmail} />
        )}

        {activeTab === 'PERMISSIONS' && (
          <ButtonPermissionMatrix />
        )}

        {activeTab === 'SECURITY' && (
          <SecuritySettingsPanel />
        )}

        {activeTab === 'AUDIT_LOG' && (
          <AuditTrailViewer />
        )}
      </div>
    </div>
  );
};
