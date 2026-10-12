import React, { useState, useEffect } from 'react';
import { ExternalLink, Link2, Check } from 'lucide-react';
import { Conversation, Message, Profile, CannedReply } from '../../types';
import { liveflowService } from '../../lib/api';
import { useCustomerChatLinks } from '../../lib/chatLink';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { sound } from '../../lib/sound';
import { Sidebar } from './Sidebar';
import { ConversationList } from './ConversationList';
import { ChatArea } from './ChatArea';
import { AnalyticsPage } from './AnalyticsPage';
import { UsersManagement } from './UsersManagement';
import { SettingsPage } from './SettingsPage';
import { InstallCodePage } from './InstallCodePage';

interface DashboardLayoutProps {
  onSwitchToPreview: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ onSwitchToPreview }) => {
  const { profile, isAdmin } = useAuth();
  const { t } = useSettings();

  const [currentTab, setCurrentTab] = useState<string>('conversations');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const { shareLink } = useCustomerChatLinks();

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // 1. Initial Load of conversations, agents, canned replies
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [convList, agentList, crList] = await Promise.all([
          liveflowService.getConversations(),
          liveflowService.getProfiles(),
          liveflowService.getCannedReplies(),
        ]);

        if (isMounted) {
          setConversations(convList);
          setAgents(agentList);
          setCannedReplies(crList);
          if (convList.length > 0 && !selectedConversationId) {
            setSelectedConversationId(convList[0].id);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();

    // 2. Realtime subscription to conversations & messages
    const unsubscribeAll = liveflowService.subscribeToAllConversations(
      (updatedConv: Conversation) => {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === updatedConv.id);
          if (idx === -1) return [updatedConv, ...prev];
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...updatedConv };
          return copy.sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
        });
      },
      (newMsg: Message) => {
        if (newMsg.sender_type === 'visitor') {
          sound.playNotification();

          // Request desktop notification if permitted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('New LiveFlow Message', {
                body: newMsg.content || 'Visitor uploaded an attachment',
                icon: '/vite.svg',
              });
            } catch {
              // Ignore
            }
          }
        }
      }
    );

    // Team changes (agent added / removed / renamed)
    const unsubscribeProfiles = liveflowService.subscribeToProfiles((list) => {
      if (isMounted) setAgents(list);
    });

    // Connection came back -> refetch the inbox
    const unsubscribeResync = liveflowService.subscribeToResync('agent', () => {
      liveflowService.getConversations().then((convList) => {
        if (isMounted) setConversations(convList);
      });
    });

    // 3. Realtime presence tracker for agent online/away
    let presenceController: any = null;
    if (profile?.id) {
      presenceController = liveflowService.createPresenceTracker(profile.id, (onlineIds) => {
        setIsOnline(onlineIds.includes(profile.id));
      });
    }

    // Ask notification permission on first interaction
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      isMounted = false;
      unsubscribeAll();
      unsubscribeProfiles();
      unsubscribeResync();
      presenceController?.unsubscribe();
    };
  }, [profile?.id]);

  // Total unread for current agent
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_for_agent || 0), 0);

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) || null;

  const handleConversationUpdated = (updated: Conversation) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'preview') {
      onSwitchToPreview();
      return;
    }
    setCurrentTab(tab);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden select-none">
      {/* Top Application Bar */}
      <header className="h-12 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-sm tracking-tight text-emerald-600 dark:text-emerald-400">
            LiveFlow Inbox
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
            Enterprise Omnichannel Customer Support
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Customer chat link (copy to share) */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
            title={shareLink}
          >
            {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{linkCopied ? t('copied') : t('customerLink')}</span>
          </button>

          {/* Test Customer View Button */}
          <button
            type="button"
            onClick={onSwitchToPreview}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Customer Website View</span>
          </button>
        </div>
      </header>

      {/* Main App Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          isOnline={isOnline}
          onToggleOnline={(online) => {
            setIsOnline(online);
            if (profile?.id) {
              const tracker = liveflowService.createPresenceTracker(profile.id, () => {});
              tracker.setOnline(online);
            }
          }}
          unreadTotal={totalUnread}
        />

        {/* Dynamic Center Views */}
        {currentTab === 'conversations' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Column 2: Conversation List */}
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversationId}
              onSelect={(id) => setSelectedConversationId(id)}
              currentAgent={profile}
              t={t}
            />

            {/* Column 3: Active Chat Area */}
            <ChatArea
              conversation={selectedConversation}
              currentAgent={profile}
              agents={agents}
              cannedReplies={cannedReplies}
              onConversationUpdated={handleConversationUpdated}
              t={t}
            />
          </div>
        )}

        {currentTab === 'analytics' && <AnalyticsPage />}
        {currentTab === 'users' && <UsersManagement />}
        {currentTab === 'settings' && <SettingsPage />}
        {currentTab === 'install' && <InstallCodePage />}
      </div>
    </div>
  );
};
