import { Conversation, Message, Profile, Settings, CannedReply, AnalyticsSummary } from '../types';

/**
 * Client for the LiveFlow server (server/index.ts).
 *
 * Two kinds of callers share this module: staff in the dashboard ("agent") and
 * customers in the chat widget ("visitor"). Each has its own token, so the same
 * browser can be signed in to the dashboard and test the widget at once.
 */

export type Audience = 'agent' | 'visitor';

const TOKEN_KEYS: Record<Audience, string> = {
  agent: 'liveflow_agent_token',
  visitor: 'liveflow_visitor_token',
};

/** Fired on window when the server rejects the staff token (expired, disabled, deleted). */
export const AGENT_UNAUTHORIZED_EVENT = 'liveflow:agent-unauthorized';

function getToken(audience: Audience): string | null {
  try {
    return localStorage.getItem(TOKEN_KEYS[audience]);
  } catch {
    return null;
  }
}

function setToken(audience: Audience, token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEYS[audience], token);
    else localStorage.removeItem(TOKEN_KEYS[audience]);
  } catch {
    // Storage unavailable (private mode); the session just won't survive a reload.
  }
  realtime[audience].reset();
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { as?: Audience; body?: unknown; raw?: { data: Blob; headers: Record<string, string> } } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.as ? getToken(options.as) : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.raw) {
    Object.assign(headers, options.raw.headers);
    body = options.raw.data;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(path, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && options.as === 'agent' && token) {
      setToken('agent', null);
      window.dispatchEvent(new Event(AGENT_UNAUTHORIZED_EVENT));
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

// -----------------------------------------------------------------------------
// Realtime: one Server-Sent Events stream per audience
// -----------------------------------------------------------------------------

type Listener = (data: any) => void;

const settingsListeners = new Set<(s: Settings) => void>();

class RealtimeConnection {
  private source: EventSource | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private connectedBefore = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly audience: Audience) {}

  subscribe(type: string, cb: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    this.connect();
    return () => {
      this.listeners.get(type)?.delete(cb);
    };
  }

  /** Close the stream; the next subscribe() reconnects with the current token. */
  reset() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.source?.close();
    this.source = null;
    this.connectedBefore = false;
  }

  private emit(type: string, data: unknown) {
    this.listeners.get(type)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('Realtime listener error:', err);
      }
    });
  }

  private connect() {
    if (this.source) return;
    const token = getToken(this.audience);
    if (!token) return;

    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    source.onopen = () => {
      // After a dropped connection, tell views to refetch what they may have missed.
      if (this.connectedBefore) this.emit('resync', null);
      this.connectedBefore = true;
    };
    source.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        this.emit(type, data);
        if (type === 'settings_updated') settingsListeners.forEach((cb) => cb(data));
      } catch {
        // Ignore malformed frames
      }
    };
    source.onerror = () => {
      // The browser retries network errors itself; CLOSED means it gave up (e.g. 401).
      if (source.readyState === EventSource.CLOSED) {
        this.source = null;
        this.retryTimer = setTimeout(() => this.connect(), 5000);
      }
    };
    this.source = source;
  }
}

const realtime: Record<Audience, RealtimeConnection> = {
  agent: new RealtimeConnection('agent'),
  visitor: new RealtimeConnection('visitor'),
};

// -----------------------------------------------------------------------------
// Data access layer used by the UI
// -----------------------------------------------------------------------------

export const liveflowService = {
  // 1. STAFF AUTH
  hasAgentToken(): boolean {
    return !!getToken('agent');
  },

  async getAuthStatus(): Promise<{ needsSetup: boolean }> {
    return request('GET', '/api/auth/status');
  },

  async setupAdmin(payload: { full_name: string; username: string; password: string }): Promise<Profile> {
    const res = await request<{ token: string; profile: Profile }>('POST', '/api/auth/setup', { body: payload });
    setToken('agent', res.token);
    return res.profile;
  },

  async login(username: string, password: string): Promise<Profile> {
    const res = await request<{ token: string; profile: Profile }>('POST', '/api/auth/login', {
      body: { username, password },
    });
    setToken('agent', res.token);
    return res.profile;
  },

  async logout(): Promise<void> {
    try {
      await request('POST', '/api/auth/logout', { as: 'agent' });
    } finally {
      setToken('agent', null);
    }
  },

  async getCurrentProfile(): Promise<Profile> {
    const res = await request<{ profile: Profile }>('GET', '/api/auth/me', { as: 'agent' });
    return res.profile;
  },

  // 2. SETTINGS
  async getSettings(): Promise<Settings> {
    return request('GET', '/api/settings');
  },

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    return request('PUT', '/api/settings', { as: 'agent', body: updates });
  },

  onSettingsUpdated(cb: (s: Settings) => void) {
    settingsListeners.add(cb);
    return () => {
      settingsListeners.delete(cb);
    };
  },

  // 3. USERS
  async getProfiles(): Promise<Profile[]> {
    return request('GET', '/api/users', { as: 'agent' });
  },

  async createUser(payload: {
    username: string;
    password: string;
    full_name: string;
    role: 'admin' | 'agent';
  }): Promise<{ success: boolean; user?: Profile; error?: string }> {
    try {
      const res = await request<{ user: Profile }>('POST', '/api/users', { as: 'agent', body: payload });
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async updateUser(
    userId: string,
    updates: Partial<Profile> & { password?: string }
  ): Promise<{ success: boolean; user?: Profile; error?: string }> {
    try {
      const res = await request<{ user: Profile }>('PATCH', `/api/users/${userId}`, { as: 'agent', body: updates });
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await request('DELETE', `/api/users/${userId}`, { as: 'agent' });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // 4. VISITOR SESSION
  async getOrInitVisitorSession(): Promise<string> {
    const res = await request<{ visitor_id: string; token: string }>('POST', '/api/visitor/session', { as: 'visitor' });
    if (res.token !== getToken('visitor')) setToken('visitor', res.token);
    return res.visitor_id;
  },

  // 5. CONVERSATIONS
  async getConversations(): Promise<Conversation[]> {
    return request('GET', '/api/conversations', { as: 'agent' });
  },

  async getVisitorConversation(_visitorId?: string): Promise<Conversation | null> {
    return request('GET', '/api/visitor/conversation', { as: 'visitor' });
  },

  async createConversation(payload: Partial<Conversation> & { visitor_id: string }): Promise<Conversation> {
    return request('POST', '/api/visitor/conversations', {
      as: 'visitor',
      body: {
        visitor_name: payload.visitor_name,
        visitor_contact: payload.visitor_contact,
        metadata: payload.metadata,
      },
    });
  },

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | null> {
    return request('PATCH', `/api/conversations/${id}`, { as: 'agent', body: updates });
  },

  async submitCSATRating(conversationId: string, rating: number, feedback?: string): Promise<Conversation | null> {
    return request('POST', `/api/conversations/${conversationId}/rating`, {
      as: 'visitor',
      body: { rating, feedback },
    });
  },

  // 6. MESSAGES
  async getMessages(conversationId: string, isAgent: boolean = false): Promise<Message[]> {
    return request('GET', `/api/conversations/${conversationId}/messages`, { as: isAgent ? 'agent' : 'visitor' });
  },

  async sendMessage(payload: {
    conversation_id: string;
    sender_type: 'visitor' | 'agent' | 'system';
    sender_id?: string | null;
    content: string;
    attachment_url?: string | null;
    is_internal_note?: boolean;
  }): Promise<Message> {
    return request('POST', `/api/conversations/${payload.conversation_id}/messages`, {
      as: payload.sender_type === 'visitor' ? 'visitor' : 'agent',
      body: {
        content: payload.content,
        attachment_url: payload.attachment_url,
        is_internal_note: payload.is_internal_note,
      },
    });
  },

  async markMessagesSeen(conversationId: string, readerType: 'visitor' | 'agent'): Promise<void> {
    await request('POST', `/api/conversations/${conversationId}/seen`, { as: readerType }).catch(() => {});
  },

  // 7. ATTACHMENTS
  async uploadAttachment(file: File, as: Audience): Promise<string> {
    const res = await request<{ url: string }>('POST', '/api/uploads', {
      as,
      raw: {
        data: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
      },
    });
    return res.url;
  },

  // 8. CANNED REPLIES
  async getCannedReplies(): Promise<CannedReply[]> {
    return request('GET', '/api/canned-replies', { as: 'agent' });
  },

  async addCannedReply(title: string, content: string): Promise<CannedReply> {
    return request('POST', '/api/canned-replies', { as: 'agent', body: { title, content } });
  },

  // 9. ANALYTICS
  async getAnalytics(): Promise<AnalyticsSummary> {
    return request('GET', '/api/analytics', { as: 'agent' });
  },

  // 10. REALTIME
  subscribeToConversationMessages(conversationId: string, onMessage: (msg: Message) => void, as: Audience) {
    return realtime[as].subscribe('message_created', (msg: Message) => {
      if (msg.conversation_id === conversationId) onMessage(msg);
    });
  },

  subscribeToAllConversations(onNewOrUpdated: (conv: Conversation) => void, onNewMessage?: (msg: Message) => void) {
    const unsubs = [
      realtime.agent.subscribe('conversation_created', onNewOrUpdated),
      realtime.agent.subscribe('conversation_updated', onNewOrUpdated),
      onNewMessage ? realtime.agent.subscribe('message_created', onNewMessage) : () => {},
    ];
    return () => unsubs.forEach((u) => u());
  },

  subscribeToVisitorConversation(conversationId: string, onUpdated: (conv: Conversation) => void) {
    return realtime.visitor.subscribe('conversation_updated', (conv: Conversation) => {
      if (conv.id === conversationId) onUpdated(conv);
    });
  },

  /** Fires when the other side has read this conversation. */
  subscribeToSeen(conversationId: string, as: Audience, onSeen: () => void) {
    return realtime[as].subscribe('messages_seen', (data: { conversationId: string; readerType: Audience }) => {
      if (data.conversationId === conversationId && data.readerType !== as) onSeen();
    });
  },

  /** Fires after the realtime stream reconnects, so views can refetch missed data. */
  subscribeToResync(as: Audience, onResync: () => void) {
    return realtime[as].subscribe('resync', onResync);
  },

  subscribeToProfiles(onProfiles: (profiles: Profile[]) => void) {
    return realtime.agent.subscribe('profiles_updated', onProfiles);
  },

  createTypingBroadcast(
    conversationId: string,
    senderType: Audience,
    onTypingStatus: (isTyping: boolean, sender: string) => void
  ) {
    const unsubscribe = realtime[senderType].subscribe(
      'typing',
      (data: { conversationId: string; senderType: Audience; isTyping: boolean }) => {
        if (data.conversationId === conversationId && data.senderType !== senderType) {
          onTypingStatus(data.isTyping, data.senderType);
        }
      }
    );
    return {
      sendTyping(isTyping: boolean) {
        request('POST', '/api/typing', {
          as: senderType,
          body: { conversation_id: conversationId, is_typing: isTyping },
        }).catch(() => {});
      },
      unsubscribe,
    };
  },

  createPresenceTracker(_agentId: string, onPresenceChange: (onlineAgentIds: string[]) => void) {
    const unsubscribe = realtime.agent.subscribe('presence_state', (data: { onlineAgents: string[] }) => {
      onPresenceChange(data.onlineAgents || []);
    });
    return {
      setOnline(online: boolean) {
        request('POST', '/api/presence', { as: 'agent', body: { online } }).catch(() => {});
      },
      unsubscribe,
    };
  },
};
