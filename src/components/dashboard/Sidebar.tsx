import React from 'react';
import {
  MessageSquare,
  Users,
  Settings as SettingsIcon,
  BarChart3,
  Code2,
  Moon,
  Sun,
  Globe,
  LogOut,
  Radio,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { Avatar } from '../common/Avatar';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isOnline: boolean;
  onToggleOnline: (online: boolean) => void;
  unreadTotal: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isOnline,
  onToggleOnline,
  unreadTotal,
}) => {
  const { profile, logout, isAdmin } = useAuth();
  const { settings, lang, setLang, isDark, toggleTheme, t } = useSettings();

  const navItems = [
    { id: 'conversations', label: t('conversations'), icon: MessageSquare, badge: unreadTotal },
    { id: 'analytics', label: t('analytics'), icon: BarChart3 },
    ...(isAdmin
      ? [
          { id: 'users', label: t('users'), icon: Users },
          { id: 'settings', label: t('settings'), icon: SettingsIcon },
        ]
      : []),
    { id: 'install', label: t('install'), icon: Code2 },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col justify-between select-none shrink-0 transition-colors">
      {/* Top Section: Brand + Agent Presence */}
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: settings.primary_color || '#10b981' }}
            >
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {settings.company_name}
              </h2>
              <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                Support Hub
              </span>
            </div>
          </div>
        </div>

        {/* Current Agent Presence Toggle */}
        <div className="p-3 mx-3 my-3 bg-zinc-50 dark:bg-zinc-850/60 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar
                name={profile?.full_name}
                url={profile?.avatar_url}
                className="w-9 h-9 border border-zinc-200 dark:border-zinc-700"
              />
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                  isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {profile?.full_name || 'Staff Agent'}
              </p>
              <p className="text-[10px] text-zinc-400 capitalize">
                {profile?.role === 'admin' ? 'Administrator' : 'Agent'}
              </p>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50 flex items-center justify-between text-xs">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <Radio className={`w-3 h-3 ${isOnline ? 'text-emerald-500 animate-pulse' : 'text-zinc-400'}`} />
              {isOnline ? t('online') : t('away')}
            </span>
            <button
              type="button"
              onClick={() => onToggleOnline(!isOnline)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                isOnline
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
              }`}
            >
              {isOnline ? 'Set Away' : 'Go Online'}
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Preferences & Logout */}
      <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
        {/* Language & Theme Controls */}
        <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-500">
          {/* Language Switch */}
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Toggle Arabic / English"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="font-semibold">{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Toggle Light / Dark mode"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
          </button>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
