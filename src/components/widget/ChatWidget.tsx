import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  Minimize2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { Conversation, Message } from '../../types';
import { liveflowService } from '../../lib/api';
import { getVisitorMetadata } from '../../lib/visitor';
import { sound } from '../../lib/sound';
import { isArabic, getTextDirection } from '../../lib/rtl';
import { EmojiPicker } from './EmojiPicker';
import { PreChatModal } from './PreChatModal';
import { CSATSurveyCard } from './CSATSurveyCard';
import { Attachment } from '../common/Attachment';

interface ChatWidgetProps {
  initialOpen?: boolean;
  isEmbedded?: boolean;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  initialOpen = false,
  isEmbedded = false,
}) => {
  const { settings, loading: settingsLoading } = useSettings();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [visitorId, setVisitorId] = useState<string>('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const typingBroadcastRef = useRef<any>(null);

  const primaryColor = settings.primary_color || '#10b981';
  const positionClass =
    settings.widget_position === 'bottom-left' ? 'left-6' : 'right-6';

  // Embedded on another site (widget.js): the host page owns the iframe's size and
  // corner, so tell it whenever the chat opens/closes or the position setting changes.
  useEffect(() => {
    if (!isEmbedded || settingsLoading || window.parent === window) return;
    window.parent.postMessage(
      { source: 'liveflow-widget', action: 'resize', isOpen, position: settings.widget_position },
      '*'
    );
  }, [isEmbedded, settingsLoading, isOpen, settings.widget_position]);

  // 1. Initialize anonymous visitor session
  useEffect(() => {
    let isMounted = true;
    async function initVisitor() {
      try {
        // Opened from the "Open the chat" button in a reply email: continue that conversation.
        const resumeToken = new URLSearchParams(window.location.search).get('resume');
        if (resumeToken) {
          try {
            await liveflowService.resumeVisitorSession(resumeToken);
            if (isMounted) setIsOpen(true);
          } catch (err) {
            console.warn('Chat link could not be used:', err);
          }
        }

        const uid = await liveflowService.getOrInitVisitorSession();
        if (!isMounted) return;
        setVisitorId(uid);

        // Fetch existing conversation for this visitor
        const existingConv = await liveflowService.getVisitorConversation(uid);
        if (existingConv) {
          setConversation(existingConv);
          const history = await liveflowService.getMessages(existingConv.id, false);
          if (isMounted) setMessages(history);
        }
      } catch (err) {
        console.error('Visitor init failed:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    initVisitor();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Realtime listener for incoming messages & typing broadcast
  useEffect(() => {
    if (!conversation) return;

    // Mark messages as seen when widget is open
    if (isOpen) {
      liveflowService.markMessagesSeen(conversation.id, 'visitor');
    }

    // Subscribe to new messages
    const unsubscribeMessages = liveflowService.subscribeToConversationMessages(
      conversation.id,
      (newMsg: Message) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (newMsg.sender_type === 'agent') {
          if (soundEnabled) {
            sound.playNotification();
          }
          if (isOpen) {
            liveflowService.markMessagesSeen(conversation.id, 'visitor');
          }
        }
      },
      'visitor'
    );

    // Status changes (e.g. agent closed the chat -> show rating card)
    const unsubscribeConversation = liveflowService.subscribeToVisitorConversation(
      conversation.id,
      (updated) => setConversation(updated)
    );

    // Agent read our messages -> double check marks
    const unsubscribeSeen = liveflowService.subscribeToSeen(conversation.id, 'visitor', () => {
      setMessages((prev) => prev.map((m) => (m.sender_type === 'visitor' ? { ...m, seen: true } : m)));
    });

    // Connection came back (e.g. phone was locked) -> refetch what we missed
    const unsubscribeResync = liveflowService.subscribeToResync('visitor', async () => {
      const [latestConv, history] = await Promise.all([
        liveflowService.getVisitorConversation(),
        liveflowService.getMessages(conversation.id, false),
      ]);
      if (latestConv?.id === conversation.id) setConversation(latestConv);
      setMessages(history);
    });

    // Typing broadcast channel
    const typingController = liveflowService.createTypingBroadcast(
      conversation.id,
      'visitor',
      (isTyping, sender) => {
        if (sender === 'agent') {
          setIsAgentTyping(isTyping);
        }
      }
    );
    typingBroadcastRef.current = typingController;

    return () => {
      unsubscribeMessages();
      unsubscribeConversation();
      unsubscribeSeen();
      unsubscribeResync();
      typingController.unsubscribe();
    };
  }, [conversation?.id, isOpen, soundEnabled]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAgentTyping, isOpen]);

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (typingBroadcastRef.current) {
      typingBroadcastRef.current.sendTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingBroadcastRef.current?.sendTyping(false);
      }, 1500);
    }
  };

  // Start chat from pre-chat form or direct
  const handleStartConversation = async (data?: {
    name: string;
    contact: string;
    initialMessage?: string;
  }) => {
    const metadata = getVisitorMetadata();
    const newConv = await liveflowService.createConversation({
      visitor_id: visitorId,
      visitor_name: data?.name || 'Visitor #' + visitorId.slice(-4),
      visitor_contact: data?.contact || null,
      metadata,
    });
    setConversation(newConv);

    if (data?.initialMessage) {
      const msg = await liveflowService.sendMessage({
        conversation_id: newConv.id,
        sender_type: 'visitor',
        sender_id: visitorId,
        content: data.initialMessage,
      });
      setMessages([msg]);
    }
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text && !uploading) return;

    if (!conversation) {
      setInputText('');
      await handleStartConversation({ name: '', contact: '', initialMessage: text });
      return;
    }

    setInputText('');
    setShowEmojiPicker(false);
    if (typingBroadcastRef.current) {
      typingBroadcastRef.current.sendTyping(false);
    }

    try {
      sound.playSend();
      const newMsg = await liveflowService.sendMessage({
        conversation_id: conversation.id,
        sender_type: 'visitor',
        sender_id: visitorId,
        content: text,
      });
      setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;

    setUploading(true);
    try {
      const publicUrl = await liveflowService.uploadAttachment(file, 'visitor');
      const isImg = file.type.startsWith('image/');
      const newMsg = await liveflowService.sendMessage({
        conversation_id: conversation.id,
        sender_type: 'visitor',
        sender_id: visitorId,
        content: isImg ? `Sent photo: ${file.name}` : `Sent file: ${file.name}`,
        attachment_url: publicUrl,
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

  // Submit CSAT Rating
  const handleCSATSubmit = async (rating: number, feedback?: string) => {
    if (!conversation) return;
    const updated = await liveflowService.submitCSATRating(conversation.id, rating, feedback);
    if (updated) {
      setConversation(updated);
    }
  };

  const unreadCount = conversation?.unread_for_visitor || 0;
  const isArabicInput = isArabic(inputText);

  return (
    <div
      className={
        isEmbedded
          ? 'fixed inset-0 flex items-center justify-center font-sans antialiased text-zinc-900 select-none'
          : `fixed ${positionClass} bottom-6 z-50 font-sans antialiased text-zinc-900 select-none`
      }
    >
      {/* 1. Floating Circular Chat Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            if (conversation) {
              liveflowService.markMessagesSeen(conversation.id, 'visitor');
            }
          }}
          style={{ backgroundColor: primaryColor }}
          className={`relative group w-14 h-14 rounded-full ${isEmbedded ? 'shadow-lg' : 'shadow-2xl'} flex items-center justify-center text-white cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200`}
          aria-label="Open Live Chat"
        >
          <MessageSquare className="w-6 h-6 transition-transform group-hover:rotate-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* 2. Modern Chat Window */}
      {isOpen && (
        <div
          className={`${
            isEmbedded
              ? 'w-full h-full'
              : 'w-[380px] sm:w-[400px] h-[600px] max-h-[calc(100vh-80px)] rounded-3xl shadow-2xl border'
          } bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200`}
        >
          {/* Header */}
          <div
            style={{ backgroundColor: primaryColor }}
            className="p-4 text-white flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={settings.company_name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white/80 shadow-sm"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-white/80 bg-white/20 flex items-center justify-center shadow-sm">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">
                  {settings.company_name || 'Live Support'}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-white/90">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                  <span>Online • Typically replies instantly</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-white/80">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded-full hover:bg-white/20 hover:text-white transition-colors"
                title={soundEnabled ? 'Mute chime' : 'Unmute chime'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4 text-white/60" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 hover:text-white transition-colors"
                title="Minimize chat"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {loadingHistory ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : !conversation && settings.prechat_enabled ? (
            /* Pre-chat Capture Form */
            <PreChatModal
              companyName={settings.company_name}
              welcomeMessage={settings.welcome_message}
              primaryColor={primaryColor}
              onSubmit={handleStartConversation}
            />
          ) : (
            /* Active Message History */
            <div className="flex-1 flex flex-col min-h-0 bg-zinc-50 dark:bg-zinc-950/50">
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {/* Welcome Message Pill */}
                <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs text-center">
                  <p
                    dir={getTextDirection(settings.welcome_message)}
                    className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed"
                  >
                    {settings.welcome_message}
                  </p>
                </div>

                {/* Messages Feed */}
                {messages.map((msg) => {
                  const isVisitor = msg.sender_type === 'visitor';
                  const isAr = isArabic(msg.content);
                  const dir = isAr ? 'rtl' : 'ltr';
                  const time = new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isVisitor ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        dir={dir}
                        style={
                          isVisitor
                            ? { backgroundColor: primaryColor, color: '#ffffff' }
                            : {}
                        }
                        className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                          isVisitor
                            ? 'rounded-br-xs'
                            : 'bg-white dark:bg-zinc-850 text-zinc-800 dark:text-zinc-100 border border-zinc-200/70 dark:border-zinc-800 rounded-bl-xs'
                        } ${isAr ? 'font-arabic' : ''}`}
                      >
                        {msg.attachment_url && <Attachment url={msg.attachment_url} imageClassName="max-h-48" />}
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>

                      {/* Timestamp & Seen checkmarks */}
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 px-1">
                        <span>{time}</span>
                        {isVisitor && (
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
                  );
                })}

                {/* Typing Indicator */}
                {isAgentTyping && (
                  <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-zinc-850 rounded-2xl w-28 border border-zinc-200/70 dark:border-zinc-800 shadow-xs animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]"></span>
                    <span className="text-[10px] text-zinc-500">Typing...</span>
                  </div>
                )}

                {/* Customer Satisfaction (CSAT) Survey if conversation is closed or requested */}
                {conversation?.status === 'closed' && (
                  <CSATSurveyCard
                    conversationId={conversation.id}
                    existingRating={conversation.rating}
                    onSubmit={handleCSATSubmit}
                    primaryColor={primaryColor}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 relative">
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(emoji) => setInputText((prev) => prev + emoji)}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}

                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-1.5 border border-zinc-200 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-emerald-500 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                    title="Insert Emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                    title="Upload file or image"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <input
                    type="text"
                    value={inputText}
                    onChange={handleInputChange}
                    placeholder="Type your message..."
                    dir={isArabicInput ? 'rtl' : 'ltr'}
                    className={`flex-1 bg-transparent text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none px-1 ${
                      isArabicInput ? 'font-arabic' : ''
                    }`}
                  />

                  <button
                    type="submit"
                    disabled={!inputText.trim() && !uploading}
                    style={{ backgroundColor: primaryColor }}
                    className="p-2 text-white rounded-xl shadow-xs disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    title="Send"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
