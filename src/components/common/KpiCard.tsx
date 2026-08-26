import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  badgeText?: string;
  badgeType?: 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  onClick?: () => void;
  isActive?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBgColor = 'bg-brand-50',
  iconColor = 'text-brand-500',
  badgeText,
  badgeType = 'neutral',
  onClick,
  isActive = false
}) => {
  const getBadgeStyle = () => {
    switch (badgeType) {
      case 'danger':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'success':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'info':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl bg-white p-5 border transition-all duration-200 ${
        isActive
          ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-brand-lg'
          : 'border-slate-200 hover:border-brand-300 hover:shadow-md'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase truncate">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {value}
            </span>
            {badgeText && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getBadgeStyle()}`}>
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${iconBgColor} flex-shrink-0`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
      
      {/* Bottom accent indicator */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${isActive ? 'bg-brand-500' : 'bg-transparent'}`} />
    </div>
  );
};
