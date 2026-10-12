import React from 'react';
import {
  Sparkles,
  ShoppingBag,
  Zap,
  ArrowRight,
  ShieldCheck,
  Star,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { ChatWidget } from '../widget/ChatWidget';

interface WebsitePreviewProps {
  onSwitchToDashboard: () => void;
}

export const WebsitePreview: React.FC<WebsitePreviewProps> = ({ onSwitchToDashboard }) => {
  const { settings } = useSettings();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 flex flex-col relative select-none">
      {/* Top Banner with Quick Switch to Dashboard */}
      <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping"></span>
          <span className="font-semibold">Visitor Live Preview Mode</span>
          <span className="hidden sm:inline text-white/80">
            — Experience the floating chat widget as an external website visitor!
          </span>
        </div>

        <button
          type="button"
          onClick={onSwitchToDashboard}
          className="px-3 py-1 bg-white text-emerald-800 font-bold rounded-lg text-xs hover:bg-emerald-50 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Switch to Agent Dashboard</span>
        </button>
      </div>

      {/* Mock Host Website Navigation */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black">
            L
          </div>
          <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-white">
            Apex Cloud Technologies
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          <a href="#features" className="hover:text-emerald-600 transition-colors">Features</a>
          <a href="#solutions" className="hover:text-emerald-600 transition-colors">Solutions</a>
          <a href="#pricing" className="hover:text-emerald-600 transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-emerald-600 transition-colors">Documentation</a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl text-xs font-bold shadow-xs hover:opacity-90 transition-opacity"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Content */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>LiveFlow Customer Messaging Widget Active</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white max-w-3xl leading-tight">
          Next-Generation Live Chat & Real-Time Customer Support
        </h1>

        <p className="mt-4 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
          See the floating bubble at the bottom corner? Click it to open the real-time chat window, send messages in English or Arabic, upload files, and experience the smooth customer satisfaction (CSAT) rating flow!
        </p>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left w-full">
          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Instant Supabase Realtime
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Sub-millisecond message delivery, live typing broadcast, and agent online presence without heavy database polling.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Supabase Anonymous Auth & RLS
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Visitors receive an anonymous Supabase session so their conversation persists on refresh, secured by Row-Level Security.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Star className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              Bilingual RTL & CSAT Surveys
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Native Arabic Cairo/Tajawal font support, auto-text direction, and post-chat customer feedback ratings.
            </p>
          </div>
        </div>
      </main>

      {/* Floating Live Chat Widget */}
      <ChatWidget />
    </div>
  );
};
