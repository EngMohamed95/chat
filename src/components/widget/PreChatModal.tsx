import React, { useState } from 'react';
import { User, Mail, MessageSquare, ArrowRight } from 'lucide-react';
import { isArabic } from '../../lib/rtl';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PreChatModalProps {
  companyName: string;
  welcomeMessage: string;
  primaryColor: string;
  onSubmit: (data: { name: string; contact: string; initialMessage?: string }) => void;
  onCancel?: () => void;
}

export const PreChatModal: React.FC<PreChatModalProps> = ({
  companyName,
  welcomeMessage,
  primaryColor,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide your name');
      return;
    }
    if (!EMAIL_PATTERN.test(contact.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    onSubmit({
      name: name.trim(),
      contact: contact.trim(),
      initialMessage: initialMessage.trim() || undefined,
    });
  };

  const isRTLText = isArabic(welcomeMessage) || isArabic(name) || isArabic(initialMessage);

  return (
    <div className="flex-1 flex flex-col justify-center p-6 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 overflow-y-auto">
      <div className="text-center mb-6">
        <div
          className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white shadow-md"
          style={{ backgroundColor: primaryColor }}
        >
          <MessageSquare className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {companyName}
        </h3>
        <p
          dir={isRTLText ? 'rtl' : 'ltr'}
          className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed px-2"
        >
          {welcomeMessage}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="p-2.5 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-center">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
            Your Name *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe / محمد علي"
              dir={isArabic(name) ? 'rtl' : 'ltr'}
              className="w-full text-xs pl-9 pr-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
            Email *
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              dir="ltr"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. alex@company.com"
              className="w-full text-xs pl-9 pr-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400"
            />
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">We will also send our replies to this email.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
            How can we help you? (Optional)
          </label>
          <textarea
            rows={2}
            value={initialMessage}
            onChange={(e) => setInitialMessage(e.target.value)}
            placeholder="Type your question or request..."
            dir={isArabic(initialMessage) ? 'rtl' : 'ltr'}
            className="w-full text-xs p-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 resize-none"
          />
        </div>

        <button
          type="submit"
          style={{ backgroundColor: primaryColor }}
          className="w-full py-3 px-4 text-xs font-bold text-white rounded-xl shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 group cursor-pointer"
        >
          <span>Start Conversation</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </form>
    </div>
  );
};
