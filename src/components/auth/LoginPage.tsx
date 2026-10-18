import React, { useState } from 'react';
import { MessageSquare, Lock, User, ArrowRight, Globe, IdCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

const inputClass =
  'w-full text-xs ps-9 pe-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400';
const iconClass = 'w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2';

export const LoginPage: React.FC = () => {
  const { login, setupAdmin, needsSetup } = useAuth();
  const { settings, t, lang, setLang } = useSettings();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (needsSetup && password !== confirmPassword) {
      setError(t('passwordsDontMatch'));
      return;
    }

    setLoading(true);
    try {
      const res = needsSetup
        ? await setupAdmin({ full_name: fullName, username, password })
        : await login(username, password);
      if (!res.success) setError(res.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl shadow-xl p-8 space-y-6">
        <div className="flex justify-end -mt-2 -me-2">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="font-semibold">{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>

        <div className="text-center space-y-2">
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md"
            style={{ backgroundColor: settings.primary_color || '#10b981' }}
          >
            <MessageSquare className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
            {needsSetup ? t('setupTitle') : settings.company_name ? `${settings.company_name} — ${t('staffPortal')}` : t('staffPortal')}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {needsSetup ? t('setupSubtitle') : t('loginSubtitle')}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-600 dark:text-rose-300 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsSetup && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{t('name')}</label>
              <div className="relative">
                <IdCard className={iconClass} />
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{t('username')}</label>
            <div className="relative">
              <User className={iconClass} />
              <input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </div>
            {needsSetup && <p className="text-[10px] text-zinc-400 mt-1">{t('usernameHint')}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{t('password')}</label>
            <div className="relative">
              <Lock className={iconClass} />
              <input
                type="password"
                required
                minLength={needsSetup ? 6 : undefined}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>
          </div>

          {needsSetup && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: settings.primary_color || '#10b981' }}
            className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl shadow-md hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{loading ? t('signingIn') : needsSetup ? t('createAccount') : t('signIn')}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
