import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Palette,
  Clock,
  Layout,
  MessageSquare,
  Check,
  Upload,
  Globe,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const PRESET_COLORS = [
  '#10b981', // Emerald
  '#059669', // Forest green
  '#2563eb', // Royal blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#0d9488', // Teal
  '#0f172a', // Midnight slate
];

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();

  const [companyName, setCompanyName] = useState(settings.company_name);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color || '#10b981');
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcome_message);
  const [offlineMessage, setOfflineMessage] = useState(settings.offline_message);
  const [widgetPosition, setWidgetPosition] = useState(settings.widget_position || 'bottom-right');
  const [prechatEnabled, setPrechatEnabled] = useState(settings.prechat_enabled);
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(settings.working_hours?.enabled ?? true);
  const [startTime, setStartTime] = useState(settings.working_hours?.start || '09:00');
  const [endTime, setEndTime] = useState(settings.working_hours?.end || '18:00');
  const [timezone, setTimezone] = useState(settings.working_hours?.timezone || 'UTC');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      await updateSettings({
        company_name: companyName,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        welcome_message: welcomeMessage,
        offline_message: offlineMessage,
        widget_position: widgetPosition,
        prechat_enabled: prechatEnabled,
        working_hours: {
          enabled: workingHoursEnabled,
          start: startTime,
          end: endTime,
          timezone,
        },
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>{t('settings')}</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Configure widget branding, working hours schedules, and lead collection settings.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-xl text-xs font-semibold animate-in fade-in duration-200">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Saved live to widget!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* Brand & Identity Card */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>Branding & Visual Appearance</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                Logo / Avatar URL
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://... logo image link"
                className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Color Palette Picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-2">
              Primary Brand Color
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setPrimaryColor(col)}
                  style={{ backgroundColor: col }}
                  className={`w-7 h-7 rounded-xl transition-transform cursor-pointer flex items-center justify-center ${
                    primaryColor === col ? 'scale-115 ring-2 ring-offset-2 ring-emerald-500 shadow-sm' : 'hover:scale-105'
                  }`}
                >
                  {primaryColor === col && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}

              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                />
                <span className="text-xs font-mono text-zinc-500">{primaryColor}</span>
              </div>
            </div>
          </div>

          {/* Screen Position */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-2">
              Widget Screen Position
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <label
                className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors text-xs font-medium ${
                  widgetPosition === 'bottom-right'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <input
                  type="radio"
                  name="position"
                  checked={widgetPosition === 'bottom-right'}
                  onChange={() => setWidgetPosition('bottom-right')}
                  className="hidden"
                />
                <span>Bottom Right (Standard)</span>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors text-xs font-medium ${
                  widgetPosition === 'bottom-left'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <input
                  type="radio"
                  name="position"
                  checked={widgetPosition === 'bottom-left'}
                  onChange={() => setWidgetPosition('bottom-left')}
                  className="hidden"
                />
                <span>Bottom Left</span>
              </label>
            </div>
          </div>
        </div>

        {/* Messaging & Lead Capture Card */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>Widget Behavior & Greetings</span>
          </h3>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
              Welcome Greeting (shown to online visitors)
            </label>
            <textarea
              rows={2}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              className="w-full text-xs p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
              Offline / Away Greeting (shown when team is away)
            </label>
            <textarea
              rows={2}
              value={offlineMessage}
              onChange={(e) => setOfflineMessage(e.target.value)}
              className="w-full text-xs p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 resize-none"
            />
          </div>

          {/* Pre-Chat Form Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-850/60 rounded-xl">
            <div>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Pre-Chat Lead Capture Form
              </p>
              <p className="text-[11px] text-zinc-400">
                Require visitors to submit their name and contact info before opening chat
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prechatEnabled}
                onChange={(e) => setPrechatEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>

        {/* Working Hours Card */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Working Hours Schedule</span>
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={workingHoursEnabled}
                onChange={(e) => setWorkingHoursEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {workingHoursEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. Asia/Riyadh, UTC"
                  className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Applying Changes...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
