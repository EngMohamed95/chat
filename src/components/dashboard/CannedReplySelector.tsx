import React, { useState } from 'react';
import { Search, Zap, Plus, Check } from 'lucide-react';
import { CannedReply } from '../../types';
import { isArabic } from '../../lib/rtl';

interface CannedReplySelectorProps {
  cannedReplies: CannedReply[];
  onSelect: (content: string) => void;
  onAddReply: (title: string, content: string) => Promise<void>;
  onClose: () => void;
}

export const CannedReplySelector: React.FC<CannedReplySelectorProps> = ({
  cannedReplies,
  onSelect,
  onAddReply,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = cannedReplies.filter(
    (cr) =>
      cr.title.toLowerCase().includes(search.toLowerCase()) ||
      cr.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await onAddReply(newTitle.trim(), newContent.trim());
      setNewTitle('');
      setNewContent('');
      setIsCreating(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute bottom-16 left-6 z-50 w-80 bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="p-3 border-b border-zinc-100 dark:border-zinc-700/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-850/50">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>Canned / Quick Replies</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCreating(!isCreating)}
            className="p-1 text-zinc-400 hover:text-emerald-600 rounded transition-colors text-xs flex items-center gap-1"
            title="Create new quick reply"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">{isCreating ? 'List' : 'New'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded text-xs ml-1"
          >
            ✕
          </button>
        </div>
      </div>

      {isCreating ? (
        <form onSubmit={handleCreate} className="p-3 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Refund Policy / ترحيب"
              className="w-full text-xs px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">Snippet Message</label>
            <textarea
              required
              rows={2}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Full text that will be inserted..."
              dir={isArabic(newContent) ? 'rtl' : 'ltr'}
              className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Quick Reply'}</span>
          </button>
        </form>
      ) : (
        <>
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-700/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search snippets..."
                className="w-full text-xs pl-8 pr-2 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-750">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">No quick replies found.</div>
            ) : (
              filtered.map((cr) => (
                <button
                  key={cr.id}
                  type="button"
                  onClick={() => onSelect(cr.content)}
                  className="w-full p-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors flex flex-col gap-0.5 group cursor-pointer"
                >
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {cr.title}
                  </span>
                  <p
                    dir={isArabic(cr.content) ? 'rtl' : 'ltr'}
                    className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed"
                  >
                    {cr.content}
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
