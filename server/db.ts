import fs from 'node:fs';
import path from 'node:path';
import type { CannedReply, Conversation, Message, Settings, UserRole } from '../src/types';

export interface UserRecord {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string | null;
  created_at: string;
  password_hash: string;
}

export interface SessionRecord {
  token_hash: string;
  kind: 'agent' | 'visitor';
  subject_id: string; // user id for agents, visitor id for visitors
  created_at: string;
  last_seen_at: string;
}

export type ConversationRecord = Omit<Conversation, 'assignee'> & { closed_at?: string | null };

export interface DbState {
  settings: Settings;
  users: UserRecord[];
  sessions: SessionRecord[];
  conversations: ConversationRecord[];
  messages: Message[];
  canned_replies: CannedReply[];
}

const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  company_name: 'LiveFlow Support',
  logo_url: null,
  primary_color: '#10b981',
  welcome_message: 'Hi there! 👋 Welcome to our site. How can our team help you today?',
  offline_message: 'We are currently offline. Please drop your email and inquiry, and we will reply as soon as we are back!',
  working_hours: {
    enabled: true,
    start: '09:00',
    end: '18:00',
    timezone: 'UTC',
  },
  widget_position: 'bottom-right',
  prechat_enabled: true,
  updated_at: new Date().toISOString(),
};

const DEFAULT_CANNED: Array<Pick<CannedReply, 'title' | 'content'>> = [
  { title: 'Greeting', content: 'Hi there! Thanks for reaching out. How can I assist you today?' },
  { title: 'Looking into it', content: 'Thank you for explaining! I am checking this in our system right now, please give me 2 minutes.' },
  { title: 'Arabic Welcome', content: 'أهلاً بك وسهلاً! يسعدنا تواصلك، كيف يمكنني تقديم المساعدة لك؟' },
  { title: 'Arabic Checking', content: 'شكراً لتوضيحك، أقوم بالتحقق من التفاصيل وسأوافيك بالرد فوراً.' },
  { title: 'Resolved', content: 'Great! I am glad we were able to solve this. Feel free to contact us anytime if you need more help!' },
];

function initialState(): DbState {
  const now = new Date().toISOString();
  return {
    settings: { ...DEFAULT_SETTINGS, updated_at: now },
    users: [],
    sessions: [],
    conversations: [],
    messages: [],
    canned_replies: DEFAULT_CANNED.map((c, i) => ({
      id: `cr-${i + 1}`,
      title: c.title,
      content: c.content,
      created_at: now,
    })),
  };
}

/**
 * Small JSON-file database. The whole state lives in memory and is flushed to
 * disk shortly after every change (write to a temp file, then rename).
 */
export class JsonDb {
  readonly state: DbState;
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'db.json');

    if (fs.existsSync(this.file)) {
      const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DbState>;
      this.state = { ...initialState(), ...loaded };
    } else {
      this.state = initialState();
      this.flush();
    }
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 100);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const json = JSON.stringify(this.state, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch {
      // Rename can fail on Windows if another process holds the file open.
      fs.writeFileSync(this.file, json);
    }
  }
}
