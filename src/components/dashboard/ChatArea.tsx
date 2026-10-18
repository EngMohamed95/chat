import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Zap,
  StickyNote,
  UserCheck,
  CheckCircle,
  RotateCcw,
  Check,
  CheckCheck,
  Image as ImageIcon,
  FileText,
  Clock,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { Conversation, Message, Profile, CannedReply } from '../../types';
import { liveflowService } from '../../lib/api';
import { sound } from '../../lib/sound';
import { isArabic, getTextDirection } from '../../lib/rtl';
import { CannedReplySelector } from './CannedReplySelector';
import { Attachment } from '../common/Attachment';

interface ChatAreaProps {
  conversation: Conversation | null;
  currentAgent: Profile | null;
  agents: Profile[];
  cannedReplies: CannedReply[];
  onConversationUpdated: (updated: Conversation) => void;
  t: (key: any) => string;
  /** Phones show one pane at a time: returns to the conversation list. */
  onBack?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  currentAgent,
  agents,
  cannedReplies,
  onConversationUpdated,
  t,
  onBack,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isVisitorTyping, setIsVisitorTyping] = useState(false);
  const [showCannedPicker, setShowCannedPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const typingBroadcastRef = useRef<any>(null);

  // 1. Fetch messages on conversation change
  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setLoadingMessages(true);

    liveflowService.getMessages(conversation.id, true).then((msgs) => {
      if (isMounted) {
        setMessages(msgs);
        setLoadingMessages(false);
        // Mark seen by agent
        liveflowService.markMessagesSeen(conversation.id, 'agent');
      }
    });

    // Subscribe to new incoming messages
    const unsubscribe = liveflowService.subscribeToConversationMessages(
      conversation.id,
      (newMsg: Message) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (newMsg.sender_type === 'visitor') {
          sound.playNotification();
          liveflowService.markMessagesSeen(conversation.id, 'agent');
        }
      },
      'agent'
    );

    // Customer read our replies -> double check marks
    const unsubscribeSeen = liveflowService.subscribeToSeen(conversation.id, 'agent', () => {
      setMessages((prev) => prev.map((m) => (m.sender_type === 'agent' ? { ...m, seen: true } : m)));
    });

    // Connection came back -> refetch messages we may have missed
    const unsubscribeResync = liveflowService.subscribeToResync('agent', () => {
      liveflowService.getMessages(conversation.id, true).then((msgs) => {
        if (isMounted) setMessages(msgs);
      });
    });

    // Typing broadcast channel
    const typingController = liveflowService.createTypingBroadcast(
      conversation.id,
      'agent',
      (isTyping, sender) => {
        if (sender === 'visitor') {
          setIsVisitorTyping(isTyping);
        }
      }
    );
    typingBroadcastRef.current = typingController;

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeSeen();
      unsubscribeResync();
      typingController.unsubscribe();
    };
  }, [conversation?.id]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isVisitorTyping]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50 dark:bg-zinc-950/40 text-center select-none">
        <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-4 shadow-xs">
          <Sparkles className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
          {t('selectConversation')}
        </h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
          Select any conversation from the list to reply in real time or view visitor details.
        </p>
      </div>
    );
  }

  // Handle typing broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!isInternalNote && typingBroadcastRef.current) {
      typingBroadcastRef.current.sendTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingBroadcastRef.current?.sendTyping(false);
      }, 1500);
    }
  };

  // Send message or internal note
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content && !uploading) return;

    setInputText('');
    setShowCannedPicker(false);
    if (typingBroadcastRef.current) {
      typingBroadcastRef.current.sendTyping(false);
    }

    try {
      sound.playSend();
      const newMsg = await liveflowService.sendMessage({
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: currentAgent?.id || null,
        content,
        is_internal_note: isInternalNote,
      });

      setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));

      // If internal note, don't change last message seen by visitor
      if (!isInternalNote) {
        onConversationUpdated({
          ...conversation,
          last_message: content,
          last_message_at: newMsg.created_at,
        });
      }
    } catch (err) {
      console.error('Failed to send agent message:', err);
    }
  };

  // Keydown Enter to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Toggle status open/closed
  const handleToggleStatus = async () => {
    const newStatus = conversation.status === 'open' ? 'closed' : 'open';
    const updated = await liveflowService.updateConversation(conversation.id, {
      status: newStatus,
    });
    if (updated) {
      onConversationUpdated(updated);
    }
  };

  // Assign agent
  const handleAssignAgent = async (agentId: string) => {
    const updated = await liveflowService.updateConversation(conversation.id, {
      assigned_to: agentId || null,
    });
    if (updated) {
      onConversationUpdated(updated);
    }
  };

  // Upload attachment
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await liveflowService.uploadAttachment(file, 'agent');
      const isImg = file.type.startsWith('image/');
      const newMsg = await liveflowService.sendMessage({
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: currentAgent?.id || null,
        content: isImg ? `Attached image: ${file.name}` : `Attached document: ${file.name}`,
        attachment_url: publicUrl,
        is_internal_note: isInternalNote,
      });
      setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
      sound.playSend();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isInputArabic = isArabic(inputText);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 overflow-hidden relative">
      {/* Top Header Bar */}
      <div className="p-2.5 sm:p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 sm:gap-3 bg-white dark:bg-zinc-900 select-none">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden p-2 -ms-1 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
          )}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
            {conversation.visitor_name ? conversation.visitor_name.charAt(0).toUpperCase() : 'V'}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-2">
              <span>{conversation.visitor_name || 'Visitor'}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  conversation.status === 'open'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {conversation.status === 'open' ? 'Open' : 'Resolved'}
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 truncate">
              {conversation.visitor_contact || conversation.metadata?.current_url || 'Anonymous'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Assign Dropdown */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-xl text-xs">
            <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={conversation.assigned_to || ''}
              onChange={(e) => handleAssignAgent(e.target.value)}
              className="bg-transparent text-xs max-w-[6rem] sm:max-w-none text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="">{t('unassigned')}</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Close / Reopen */}
          <button
            type="button"
            onClick={handleToggleStatus}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ${
              conversation.status === 'open'
                ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
            }`}
          >
            {conversation.status === 'open' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-zinc-500" />
                <span className="hidden sm:inline">{t('closeChat')}</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('reopenChat')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Message History Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/40 dark:bg-zinc-950/40">
        {loadingMessages ? (
          <div className="p-12 text-center text-xs text-zinc-400">Loading messages...</div>
        ) : (
          messages.map((msg) => {
            const isVisitor = msg.sender_type === 'visitor';
            const isNote = msg.is_internal_note;
            const isAr = isArabic(msg.content);
            const time = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isNote ? 'items-center my-2' : isVisitor ? 'items-start' : 'items-end'
                }`}
              >
                {/* Internal Note Banner */}
                {isNote ? (
                  <div className="max-w-[85%] p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-amber-900 dark:text-amber-200 text-xs shadow-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] mb-1 text-amber-700 dark:text-amber-300">
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>{t('internalNote')}</span>
                      <span className="text-[10px] font-normal opacity-70 ml-2">{time}</span>
                    </div>
                    <p dir={getTextDirection(msg.content)} className="whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  /* Standard Visitor or Agent Bubble */
                  <div className="flex flex-col max-w-[75%]">
                    <div
                      dir={getTextDirection(msg.content)}
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isVisitor
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 rounded-bl-xs'
                          : 'bg-emerald-600 text-white rounded-br-xs'
                      } ${isAr ? 'font-arabic' : ''}`}
                    >
                      {msg.attachment_url && <Attachment url={msg.attachment_url} />}
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>

                    <div
                      className={`flex items-center gap-1 mt-1 text-[10px] text-zinc-400 px-1 ${
                        isVisitor ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <span>{time}</span>
                      {!isVisitor && (
                        <span>
                          {msg.seen ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Visitor is typing indicator */}
        {isVisitorTyping && (
          <div className="flex items-center gap-2 p-2 bg-white dark:bg-zinc-850 rounded-2xl w-40 border border-zinc-200 dark:border-zinc-800 shadow-xs animate-pulse text-zinc-500 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"></span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]"></span>
            <span className="text-[11px]">{t('visitorIsTyping')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input Box */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 relative">
        {/* Canned Replies Selector Popover */}
        {showCannedPicker && (
          <CannedReplySelector
            cannedReplies={cannedReplies}
            onSelect={(content) => {
              setInputText(content);
              setShowCannedPicker(false);
            }}
            onAddReply={async (title, content) => {
              await liveflowService.addCannedReply(title, content);
            }}
            onClose={() => setShowCannedPicker(false)}
          />
        )}

        {/* Input Toggle Options: Reply vs Internal Note */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setIsInternalNote(false)}
              className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                !isInternalNote
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              Public Reply
            </button>
            <button
              type="button"
              onClick={() => setIsInternalNote(true)}
              className={`px-3 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isInternalNote
                  ? 'bg-amber-500 text-white shadow-xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span>Internal Note</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowCannedPicker(!showCannedPicker)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Canned</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Upload file or screenshot"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* Textarea Area */}
        <div
          className={`rounded-2xl border p-2 focus-within:ring-2 transition-all ${
            isInternalNote
              ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80 focus-within:ring-amber-500'
              : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-within:ring-emerald-500'
          }`}
        >
          <textarea
            rows={3}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isInternalNote ? 'Write internal note (only team sees this)...' : t('typeReply')}
            dir={isInputArabic ? 'rtl' : 'ltr'}
            className={`w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none resize-none p-1.5 ${
              isInputArabic ? 'font-arabic' : ''
            }`}
          />

          <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 text-[11px] text-zinc-400 px-1">
            <span>Press Enter to send, Shift+Enter for newline</span>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!inputText.trim() && !uploading}
              className={`px-3 py-1.5 rounded-xl text-white font-semibold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-40 cursor-pointer ${
                isInternalNote ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isInternalNote ? 'Save Note' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
