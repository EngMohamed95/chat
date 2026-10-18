/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { LoginPage } from './components/auth/LoginPage';
import { ChatWidget } from './components/widget/ChatWidget';

function AppContent() {
  const { profile, loading } = useAuth();

  // Check if loaded inside embed iframe
  const isWidgetOnlyMode =
    typeof window !== 'undefined' && window.location.search.includes('mode=widget');

  // If in widget-only iframe mode (for external sites)
  if (isWidgetOnlyMode) {
    return <ChatWidget initialOpen={false} isEmbedded={true} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated for the dashboard
  if (!profile) {
    return <LoginPage />;
  }

  // Authenticated Agent Dashboard
  return <DashboardLayout />;
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
