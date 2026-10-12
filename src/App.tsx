/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { WebsitePreview } from './components/preview/WebsitePreview';
import { LoginPage } from './components/auth/LoginPage';
import { ChatWidget } from './components/widget/ChatWidget';

function AppContent() {
  const { profile, loading } = useAuth();
  const [viewMode, setViewMode] = useState<'dashboard' | 'preview'>(() => {
    // If URL has ?preview=true or hash #preview, start in preview
    if (typeof window !== 'undefined' && (window.location.search.includes('mode=preview') || window.location.hash === '#preview')) {
      return 'preview';
    }
    return 'dashboard';
  });

  // Check if loaded inside embed iframe
  const isWidgetOnlyMode =
    typeof window !== 'undefined' && window.location.search.includes('mode=widget');

  // Shareable full-page chat link for customers (/chat)
  const isChatPage =
    typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/chat';

  if (isChatPage) {
    return <ChatWidget fullPage />;
  }

  // If in widget-only iframe mode (for external sites)
  if (isWidgetOnlyMode) {
    return <ChatWidget initialOpen={false} isEmbedded={true} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold">Initializing LiveFlow...</p>
        </div>
      </div>
    );
  }

  // If previewing website customer view
  if (viewMode === 'preview') {
    return <WebsitePreview onSwitchToDashboard={() => setViewMode('dashboard')} />;
  }

  // If user is not authenticated for the dashboard
  if (!profile) {
    return <LoginPage />;
  }

  // Authenticated Agent Dashboard
  return <DashboardLayout onSwitchToPreview={() => setViewMode('preview')} />;
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SettingsProvider>
  );
}
