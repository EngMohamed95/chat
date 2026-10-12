import React, { createContext, useContext, useState, useEffect } from 'react';
import { Settings } from '../types';
import { liveflowService } from '../lib/api';
import { translations } from '../lib/rtl';

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  lang: 'en' | 'ar';
  setLang: (lang: 'en' | 'ar') => void;
  isRTL: boolean;
  t: (key: keyof typeof translations.en) => string;
  isDark: boolean;
  toggleTheme: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    id: 'default',
    company_name: 'LiveFlow Support',
    logo_url: null,
    primary_color: '#10b981',
    welcome_message: 'Hi there! 👋 Welcome to our site. How can our team help you today?',
    offline_message: 'We are currently offline. Please drop your email and inquiry, and we will reply as soon as we are back!',
    working_hours: {
      enabled: true,
      start: '09:00',
      end: '18:00',
      timezone: 'UTC',
    },
    widget_position: 'bottom-right',
    prechat_enabled: true,
    updated_at: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState<'en' | 'ar'>('en');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Load stored preferences
    const storedLang = localStorage.getItem('liveflow_lang') as 'en' | 'ar';
    if (storedLang && (storedLang === 'en' || storedLang === 'ar')) {
      setLangState(storedLang);
    }

    const storedTheme = localStorage.getItem('liveflow_theme');
    if (storedTheme === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Load initial settings
    liveflowService
      .getSettings()
      .then((s) => setSettings(s))
      .catch((err) => console.warn('Failed to load settings:', err))
      .finally(() => setLoading(false));

    // Listen for live settings changes across tabs
    const unsub = liveflowService.onSettingsUpdated((updated: Settings) => {
      setSettings(updated);
    });

    return () => unsub();
  }, []);

  const setLang = (newLang: 'en' | 'ar') => {
    setLangState(newLang);
    localStorage.setItem('liveflow_lang', newLang);
  };

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('liveflow_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('liveflow_theme', 'light');
      }
      return next;
    });
  };

  const updateSettings = async (updates: Partial<Settings>) => {
    const updated = await liveflowService.updateSettings(updates);
    setSettings(updated);
  };

  const isRTL = lang === 'ar';

  const t = (key: keyof typeof translations.en): string => {
    return translations[lang]?.[key] || translations.en[key] || String(key);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        updateSettings,
        lang,
        setLang,
        isRTL,
        t,
        isDark,
        toggleTheme,
      }}
    >
      <div dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'font-arabic' : ''}>
        {children}
      </div>
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
