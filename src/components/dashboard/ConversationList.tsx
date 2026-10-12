import React, { useState } from 'react';
import { Search, Filter, Inbox, CheckCircle2, User, Clock, Star } from 'lucide-react';
import { Conversation, Profile } from '../../types';
import { isArabic } from '../../lib/rtl';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentAgent: Profile | null;
  t: (key: any) => string;
}

type FilterType = 'all' | 'open' | 'mine' | 'closed';

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  currentAgent,
  t,
}) => {
  const [filter, setFilter] = useState<FilterType>('open');
  const [search, setSearch] = useState('');

  const filteredConversations = conversations
    .filter((conv) => {
      // Status & Assignee Filter
      if (filter === 'open') return conv.status === 'open';
      if (filter === 'closed') return conv.status === 'closed';
      if (filter === 'mine') return conv.assigned_to === currentAgent?.id;
      return true; // 'all'
    })
    .filter((conv) => {
      // Search query
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (conv.visitor_name && conv.visitor_name.toLowerCase().includes(q)) ||
        (conv.visitor_contact && conv.visitor_contact.toLowerCase().includes(q)) ||
        (conv.last_message && conv.last_message.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

  const counts = {
    all: conversations.length,
    open: conversations.filter((c) => c.status === 'open').length,
    mine: conversations.filter((c) => c.assigned_to === currentAgent?.id).length,
    closed: conversations.filter((c) => c.status === 'closed').length,
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="w-80 md:w-96 bg-zinc-50/50 dark:bg-zinc-900/60 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 select-none">
      {/* Header & Search */}
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('conversations')}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-normal">
              {counts.open} open
            </span>
          </h2>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchConversations')}
            className="w-full text-xs pl-8 pr-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex p-0.5 bg-zinc-200/70 dark:bg-zinc-800 rounded-xl text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          {(['open', 'mine', 'all', 'closed'] as FilterType[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex-1 py-1.5 rounded-lg transition-all capitalize flex items-center justify-center gap-1 cursor-pointer ${
                filter === tab
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs font-semibold'
                  : 'hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span>{t(tab)}</span>
              <span className="text-[10px] text-zinc-400">({counts[tab]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Cards List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
            <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
            <p>{t('noConversations')}</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedId === conv.id;
            const hasUnread = conv.unread_for_agent > 0;
            const isMsgArabic = isArabic(conv.last_message);

            return (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`p-3.5 transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-emerald-600'
                    : 'hover:bg-white dark:hover:bg-zinc-850/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Visitor Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                      {conv.visitor_name ? conv.visitor_name.charAt(0).toUpperCase() : 'V'}
                    </div>
                    <div className="min-w-0">
                      <h4
                        className={`text-xs truncate ${
                          hasUnread
                            ? 'font-bold text-zinc-900 dark:text-zinc-100'
                            : 'font-semibold text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {conv.visitor_name || 'Visitor'}
                      </h4>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {conv.visitor_contact || conv.metadata?.current_url || 'Anonymous'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 text-[10px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTime(conv.last_message_at)}
                    </span>
                    {hasUnread && (
                      <span className="mt-1 px-1.5 py-0.2 bg-emerald-600 text-white font-bold rounded-full text-[10px]">
                        {conv.unread_for_agent}
                      </span>
                    )}
                  </div>
                </div>

                {/* Last Message Preview */}
                <p
                  dir={isMsgArabic ? 'rtl' : 'ltr'}
                  className={`text-xs line-clamp-1 leading-relaxed ${
                    hasUnread
                      ? 'font-medium text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 dark:text-zinc-400'
                  } ${isMsgArabic ? 'font-arabic' : ''}`}
                >
                  {conv.last_message || 'New conversation'}
                </p>

                {/* Badges / Rating / Assignee */}
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    {conv.status === 'closed' ? (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                        Resolved
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium">
                        Open
                      </span>
                    )}

                    {conv.rating && (
                      <span className="flex items-center gap-0.5 text-amber-500 font-bold px-1 py-0.5 bg-amber-50 dark:bg-amber-950/30 rounded">
                        <Star className="w-2.5 h-2.5 fill-amber-400" />
                        {conv.rating}.0
                      </span>
                    )}
                  </div>

                  {conv.assignee && (
                    <span className="text-zinc-400 flex items-center gap-1 truncate max-w-[100px]">
                      <User className="w-2.5 h-2.5" />
                      {conv.assignee.full_name}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
