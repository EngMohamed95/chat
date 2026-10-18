import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Message, Profile, Settings } from '../src/types';
import { computeAnalytics } from './analytics';
import { hashPassword, hashToken, LoginThrottle, newId, newToken, verifyPassword } from './auth';
import { JsonDb, type ConversationRecord, type UserRecord } from './db';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const AGENT_SESSION_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const UPLOAD_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.zip']);
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

const db = new JsonDb(DATA_DIR);
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const throttle = new LoginThrottle();
// Used to spend the same scrypt time whether or not the username exists.
const DUMMY_HASH = hashPassword(crypto.randomUUID());

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type Auth =
  | { kind: 'agent'; user: UserRecord; tokenHash: string }
  | { kind: 'visitor'; visitorId: string; tokenHash: string };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
const handle =
  (fn: (req: Request, res: Response) => void): RequestHandler =>
  (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };

function text(value: unknown, field: string, opts: { max?: number; required?: boolean } = {}): string | undefined {
  const { max = 200, required = false } = opts;
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${field} is required`);
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`);
  return trimmed;
}

function toProfile(user: UserRecord): Profile {
  const { password_hash: _hash, ...profile } = user;
  return profile;
}

function withAssignee(conv: ConversationRecord) {
  const user = conv.assigned_to ? db.state.users.find((u) => u.id === conv.assigned_to) : undefined;
  return { ...conv, assignee: user ? toProfile(user) : undefined };
}

function findUser(id: string): UserRecord {
  const user = db.state.users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

function activeAdminCount(): number {
  return db.state.users.filter((u) => u.role === 'admin' && u.is_active).length;
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (value.length > 200) throw new HttpError(400, 'Password is too long');
  return value;
}

function createUserRecord(body: any, role: 'admin' | 'agent'): UserRecord {
  const full_name = text(body?.full_name, 'Full name', { max: 100, required: true })!;
  const username = String(body?.username || '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, 'Username must be 3-32 characters: English letters, numbers, dot, dash or underscore');
  }
  if (db.state.users.some((u) => u.username === username)) throw new HttpError(409, 'This username is already taken');
  return {
    id: newId('user'),
    username,
    full_name,
    role,
    is_active: true,
    avatar_url: null,
    created_at: new Date().toISOString(),
    password_hash: hashPassword(validatePassword(body?.password)),
  };
}

function startSession(kind: 'agent' | 'visitor', subjectId: string): string {
  const token = newToken();
  const now = new Date().toISOString();
  db.state.sessions.push({ token_hash: hashToken(token), kind, subject_id: subjectId, created_at: now, last_seen_at: now });
  return token;
}

function revokeSessions(predicate: (s: { token_hash: string; kind: string; subject_id: string }) => boolean) {
  const revoked = new Set(db.state.sessions.filter(predicate).map((s) => s.token_hash));
  if (!revoked.size) return;
  db.state.sessions = db.state.sessions.filter((s) => !revoked.has(s.token_hash));
  for (const client of [...clients]) {
    if (revoked.has(client.auth.tokenHash)) disconnect(client);
  }
}

function authenticate(req: Request, allowQueryToken = false): Auth | null {
  const header = req.headers.authorization;
  let token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token && allowQueryToken && typeof req.query.token === 'string') token = req.query.token;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = db.state.sessions.find((s) => s.token_hash === tokenHash);
  if (!session) return null;

  if (session.kind === 'visitor') return { kind: 'visitor', visitorId: session.subject_id, tokenHash };

  const user = db.state.users.find((u) => u.id === session.subject_id);
  const idle = Date.now() - new Date(session.last_seen_at).getTime();
  if (!user || !user.is_active || idle > AGENT_SESSION_MAX_IDLE_MS) return null;
  if (idle > 60 * 60 * 1000) {
    session.last_seen_at = new Date().toISOString();
    db.save();
  }
  return { kind: 'agent', user, tokenHash };
}

const requireAgent: RequestHandler = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth || auth.kind !== 'agent') return void res.status(401).json({ error: 'Please sign in again' });
  res.locals.auth = auth;
  next();
};

const requireAdmin: RequestHandler = (req, res, next) => {
  requireAgent(req, res, () => {
    if (res.locals.auth.user.role !== 'admin') return void res.status(403).json({ error: 'Administrators only' });
    next();
  });
};

const requireVisitor: RequestHandler = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth || auth.kind !== 'visitor') return void res.status(401).json({ error: 'Visitor session expired' });
  res.locals.auth = auth;
  next();
};

const requireAny: RequestHandler = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth) return void res.status(401).json({ error: 'Please sign in again' });
  res.locals.auth = auth;
  next();
};

/** Visitors can only reach their own conversation; it 404s otherwise so ids can't be probed. */
function conversationFor(auth: Auth, id: string): ConversationRecord {
  const conv = db.state.conversations.find((c) => c.id === id);
  if (!conv || (auth.kind === 'visitor' && conv.visitor_id !== auth.visitorId)) {
    throw new HttpError(404, 'Conversation not found');
  }
  return conv;
}

// -----------------------------------------------------------------------------
// Realtime (Server-Sent Events)
// -----------------------------------------------------------------------------

interface Client {
  res: Response;
  auth: Auth;
  ping: NodeJS.Timeout;
}

const clients = new Set<Client>();
const awayAgents = new Set<string>();

const isStaff = (c: Client) => c.auth.kind === 'agent';
const isVisitor = (visitorId: string) => (c: Client) => c.auth.kind === 'visitor' && c.auth.visitorId === visitorId;

function push(client: Client, type: string, data: unknown) {
  if (client.res.writableEnded) return;
  client.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

/** Drop a realtime connection (browser closed it, or its session was revoked). */
function disconnect(client: Client) {
  if (!clients.delete(client)) return;
  clearInterval(client.ping);
  if (!client.res.writableEnded) client.res.end();
  if (client.auth.kind === 'agent') broadcastPresence();
}

function broadcast(filter: (c: Client) => boolean, type: string, data: unknown) {
  for (const client of clients) if (filter(client)) push(client, type, data);
}

function onlineAgentIds(): string[] {
  const ids = new Set<string>();
  for (const c of clients) if (c.auth.kind === 'agent' && !awayAgents.has(c.auth.user.id)) ids.add(c.auth.user.id);
  return [...ids];
}

function broadcastPresence() {
  broadcast(isStaff, 'presence_state', { onlineAgents: onlineAgentIds() });
}

function publishConversation(conv: ConversationRecord, created = false) {
  broadcast(isStaff, created ? 'conversation_created' : 'conversation_updated', withAssignee(conv));
  broadcast(isVisitor(conv.visitor_id), 'conversation_updated', conv);
}

function publishProfiles() {
  broadcast(isStaff, 'profiles_updated', db.state.users.map(toProfile));
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

const app = express();
// Hosting platforms proxy from the same machine; trusting loopback keeps req.ip
// the real visitor address so login throttling is per visitor.
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 'loopback');
app.disable('x-powered-by');

app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    fallthrough: false,
    setHeaders(res, filePath) {
      // Uploaded files are untrusted: never let them run script on this origin.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  })
);

app.post(
  '/api/uploads',
  requireAny,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  handle((req, res) => {
    const original = decodeURIComponent(String(req.headers['x-file-name'] || 'file'));
    const ext = path.extname(original).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) throw new HttpError(400, `File type ${ext || '(none)'} is not allowed`);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Empty file');
    const name = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), req.body);
    res.json({ url: `/uploads/${name}` });
  })
);

app.use('/api', express.json({ limit: '1mb' }));

// --- Realtime stream ---------------------------------------------------------

app.get('/api/events', (req, res) => {
  const auth = authenticate(req, true);
  if (!auth) return void res.status(401).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25000);
  const client: Client = { res, auth, ping };
  clients.add(client);
  if (auth.kind === 'agent') broadcastPresence();

  res.on('error', () => disconnect(client));
  req.on('close', () => disconnect(client));
});

app.post(
  '/api/typing',
  requireAny,
  handle((req, res) => {
    const auth: Auth = res.locals.auth;
    const conv = conversationFor(auth, String(req.body?.conversation_id || ''));
    const payload = { conversationId: conv.id, senderType: auth.kind, isTyping: !!req.body?.is_typing };
    broadcast(isStaff, 'typing', payload);
    broadcast(isVisitor(conv.visitor_id), 'typing', payload);
    res.json({ ok: true });
  })
);

app.post('/api/presence', requireAgent, (req, res) => {
  const userId = res.locals.auth.user.id;
  if (req.body?.online) awayAgents.delete(userId);
  else awayAgents.add(userId);
  broadcastPresence();
  res.json({ ok: true });
});

// --- Staff authentication ----------------------------------------------------

app.get('/api/auth/status', (_req, res) => {
  res.json({ needsSetup: db.state.users.length === 0 });
});

app.post(
  '/api/auth/setup',
  handle((req, res) => {
    if (db.state.users.length > 0) throw new HttpError(409, 'Setup was already completed. Please sign in.');
    const user = createUserRecord(req.body, 'admin');
    db.state.users.push(user);
    const token = startSession('agent', user.id);
    db.save();
    res.json({ token, profile: toProfile(user) });
  })
);

app.post(
  '/api/auth/login',
  handle((req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const key = `${req.ip}|${username}`;
    if (throttle.isBlocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

    const user = db.state.users.find((u) => u.username === username);
    const valid = verifyPassword(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) {
      throttle.fail(key);
      throw new HttpError(401, 'Wrong username or password');
    }
    if (!user.is_active) throw new HttpError(403, 'This account is disabled. Contact your administrator.');

    throttle.reset(key);
    const token = startSession('agent', user.id);
    db.save();
    res.json({ token, profile: toProfile(user) });
  })
);

app.post('/api/auth/logout', requireAgent, (_req, res) => {
  const tokenHash = res.locals.auth.tokenHash;
  revokeSessions((s) => s.token_hash === tokenHash);
  db.save();
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAgent, (_req, res) => {
  res.json({ profile: toProfile(res.locals.auth.user) });
});

// --- Users (team) ------------------------------------------------------------

app.get('/api/users', requireAgent, (_req, res) => {
  res.json(db.state.users.map(toProfile));
});

app.post(
  '/api/users',
  requireAdmin,
  handle((req, res) => {
    const role = req.body?.role === 'admin' ? 'admin' : 'agent';
    const user = createUserRecord(req.body, role);
    db.state.users.push(user);
    db.save();
    publishProfiles();
    res.json({ user: toProfile(user) });
  })
);

app.patch(
  '/api/users/:id',
  requireAdmin,
  handle((req, res) => {
    const auth = res.locals.auth as Extract<Auth, { kind: 'agent' }>;
    const user = findUser(req.params.id);
    const isSelf = user.id === auth.user.id;
    const body = req.body || {};

    if (body.full_name !== undefined) user.full_name = text(body.full_name, 'Full name', { max: 100, required: true })!;

    if (body.role !== undefined || body.is_active !== undefined) {
      const role = body.role === undefined ? user.role : body.role === 'admin' ? 'admin' : 'agent';
      const isActive = body.is_active === undefined ? user.is_active : !!body.is_active;
      if (isSelf && (role !== user.role || isActive !== user.is_active)) {
        throw new HttpError(400, 'You cannot change your own role or disable your own account');
      }
      const losesAdmin = user.role === 'admin' && user.is_active && (role !== 'admin' || !isActive);
      if (losesAdmin && activeAdminCount() <= 1) throw new HttpError(400, 'There must be at least one active administrator');
      user.role = role;
      user.is_active = isActive;
      if (!isActive) revokeSessions((s) => s.kind === 'agent' && s.subject_id === user.id);
    }

    if (body.password !== undefined) {
      user.password_hash = hashPassword(validatePassword(body.password));
      // Sign the user out everywhere, except the admin's own current session.
      revokeSessions((s) => s.kind === 'agent' && s.subject_id === user.id && s.token_hash !== auth.tokenHash);
    }

    db.save();
    publishProfiles();
    res.json({ user: toProfile(user) });
  })
);

app.delete(
  '/api/users/:id',
  requireAdmin,
  handle((req, res) => {
    const user = findUser(req.params.id);
    if (user.id === res.locals.auth.user.id) throw new HttpError(400, 'You cannot delete your own account');
    if (user.role === 'admin' && user.is_active && activeAdminCount() <= 1) {
      throw new HttpError(400, 'There must be at least one active administrator');
    }

    db.state.users = db.state.users.filter((u) => u.id !== user.id);
    revokeSessions((s) => s.kind === 'agent' && s.subject_id === user.id);
    for (const conv of db.state.conversations) {
      if (conv.assigned_to === user.id) {
        conv.assigned_to = null;
        publishConversation(conv);
      }
    }
    db.save();
    publishProfiles();
    res.json({ ok: true });
  })
);

// --- Settings ----------------------------------------------------------------

app.get('/api/settings', (_req, res) => {
  res.json(db.state.settings);
});

app.put(
  '/api/settings',
  requireAdmin,
  handle((req, res) => {
    const body = req.body || {};
    const s: Settings = { ...db.state.settings };

    if (body.company_name !== undefined) s.company_name = text(body.company_name, 'Company name', { max: 100, required: true })!;
    if (body.logo_url !== undefined) s.logo_url = text(body.logo_url, 'Logo URL', { max: 1000 }) || null;
    if (body.primary_color !== undefined) {
      if (typeof body.primary_color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(body.primary_color)) {
        throw new HttpError(400, 'Brand color must be a hex color like #10b981');
      }
      s.primary_color = body.primary_color;
    }
    if (body.welcome_message !== undefined) s.welcome_message = text(body.welcome_message, 'Welcome message', { max: 1000 }) || '';
    if (body.offline_message !== undefined) s.offline_message = text(body.offline_message, 'Offline message', { max: 1000 }) || '';
    if (body.widget_position !== undefined) s.widget_position = body.widget_position === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    if (body.prechat_enabled !== undefined) s.prechat_enabled = !!body.prechat_enabled;
    if (body.working_hours !== undefined) {
      const wh = body.working_hours || {};
      const time = (v: unknown, fallback: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : fallback);
      s.working_hours = {
        enabled: !!wh.enabled,
        start: time(wh.start, s.working_hours.start),
        end: time(wh.end, s.working_hours.end),
        timezone: text(wh.timezone, 'Timezone', { max: 64 }) || s.working_hours.timezone,
      };
    }
    s.updated_at = new Date().toISOString();

    db.state.settings = s;
    db.save();
    broadcast(() => true, 'settings_updated', s);
    res.json(s);
  })
);

// --- Visitors ----------------------------------------------------------------

app.post('/api/visitor/session', (req, res) => {
  const existing = authenticate(req);
  const header = req.headers.authorization || '';
  if (existing?.kind === 'visitor') {
    return void res.json({ visitor_id: existing.visitorId, token: header.slice(7) });
  }
  const visitorId = newId('visitor');
  const token = startSession('visitor', visitorId);
  db.save();
  res.json({ visitor_id: visitorId, token });
});

app.get('/api/visitor/conversation', requireVisitor, (_req, res) => {
  const visitorId = res.locals.auth.visitorId;
  const latest = db.state.conversations
    .filter((c) => c.visitor_id === visitorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  res.json(latest || null);
});

app.post(
  '/api/visitor/conversations',
  requireVisitor,
  handle((req, res) => {
    const body = req.body || {};
    const visitorId: string = res.locals.auth.visitorId;
    const rawMeta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const metadata: Record<string, string> = {};
    for (const key of ['current_url', 'referrer', 'browser', 'os', 'device', 'first_seen_at']) {
      if (typeof rawMeta[key] === 'string') metadata[key] = rawMeta[key].slice(0, 500);
    }
    metadata.ip = req.ip || '';

    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      id: newId('conv'),
      visitor_id: visitorId,
      visitor_name: text(body.visitor_name, 'Name', { max: 100 }) || `Visitor #${visitorId.slice(-4)}`,
      visitor_contact: text(body.visitor_contact, 'Contact', { max: 200 }) || null,
      status: 'open',
      assigned_to: null,
      last_message: 'Started a conversation',
      last_message_at: now,
      unread_for_agent: 0,
      unread_for_visitor: 0,
      metadata,
      created_at: now,
    };
    db.state.conversations.push(conv);
    db.save();
    publishConversation(conv, true);
    res.json(conv);
  })
);

// --- Conversations & messages ------------------------------------------------

app.get('/api/conversations', requireAgent, (_req, res) => {
  const list = [...db.state.conversations].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  res.json(list.map(withAssignee));
});

app.patch(
  '/api/conversations/:id',
  requireAgent,
  handle((req, res) => {
    const conv = conversationFor(res.locals.auth, req.params.id);
    const body = req.body || {};
    if (body.status !== undefined) {
      if (body.status !== 'open' && body.status !== 'closed') throw new HttpError(400, 'Invalid status');
      if (body.status !== conv.status) conv.closed_at = body.status === 'closed' ? new Date().toISOString() : null;
      conv.status = body.status;
    }
    if (body.assigned_to !== undefined) {
      if (body.assigned_to) findUser(String(body.assigned_to));
      conv.assigned_to = body.assigned_to ? String(body.assigned_to) : null;
    }
    db.save();
    publishConversation(conv);
    res.json(withAssignee(conv));
  })
);

app.post(
  '/api/conversations/:id/rating',
  requireVisitor,
  handle((req, res) => {
    const conv = conversationFor(res.locals.auth, req.params.id);
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be 1-5');
    conv.rating = rating;
    conv.rating_feedback = text(req.body?.feedback, 'Feedback', { max: 1000 }) || null;
    conv.rated_at = new Date().toISOString();
    db.save();
    publishConversation(conv);
    res.json(conv);
  })
);

app.get(
  '/api/conversations/:id/messages',
  requireAny,
  handle((req, res) => {
    const auth: Auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const msgs = db.state.messages
      .filter((m) => m.conversation_id === conv.id && (auth.kind === 'agent' || !m.is_internal_note))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    res.json(msgs);
  })
);

app.post(
  '/api/conversations/:id/messages',
  requireAny,
  handle((req, res) => {
    const auth: Auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const body = req.body || {};
    const content = text(body.content, 'Message', { max: 5000 }) || '';
    const attachment = text(body.attachment_url, 'Attachment', { max: 300 }) || null;
    if (attachment && !attachment.startsWith('/uploads/')) throw new HttpError(400, 'Invalid attachment');
    if (!content && !attachment) throw new HttpError(400, 'Message is empty');

    const isAgent = auth.kind === 'agent';
    const msg: Message = {
      id: newId('msg'),
      conversation_id: conv.id,
      sender_type: isAgent ? 'agent' : 'visitor',
      sender_id: isAgent ? auth.user.id : auth.visitorId,
      content,
      attachment_url: attachment,
      is_internal_note: isAgent && !!body.is_internal_note,
      seen: false,
      created_at: new Date().toISOString(),
    };
    db.state.messages.push(msg);

    if (!msg.is_internal_note) {
      conv.last_message = msg.content || '📎 Attachment';
      conv.last_message_at = msg.created_at;
      if (isAgent) {
        conv.unread_for_visitor = (conv.unread_for_visitor || 0) + 1;
      } else {
        conv.unread_for_agent = (conv.unread_for_agent || 0) + 1;
        if (conv.status === 'closed') {
          conv.status = 'open';
          conv.closed_at = null;
        }
      }
    }
    db.save();

    broadcast(isStaff, 'message_created', msg);
    if (!msg.is_internal_note) broadcast(isVisitor(conv.visitor_id), 'message_created', msg);
    publishConversation(conv);
    res.json(msg);
  })
);

app.post(
  '/api/conversations/:id/seen',
  requireAny,
  handle((req, res) => {
    const auth: Auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const readerType = auth.kind === 'agent' ? 'agent' : 'visitor';
    const senderType = readerType === 'agent' ? 'visitor' : 'agent';

    let changed = false;
    for (const m of db.state.messages) {
      if (m.conversation_id === conv.id && m.sender_type === senderType && !m.seen) {
        m.seen = true;
        changed = true;
      }
    }
    const unreadField = readerType === 'agent' ? 'unread_for_agent' : 'unread_for_visitor';
    if (conv[unreadField]) {
      conv[unreadField] = 0;
      changed = true;
    }

    if (changed) {
      db.save();
      const payload = { conversationId: conv.id, readerType };
      broadcast(isStaff, 'messages_seen', payload);
      broadcast(isVisitor(conv.visitor_id), 'messages_seen', payload);
      publishConversation(conv);
    }
    res.json({ ok: true });
  })
);

// --- Canned replies, analytics, server info ----------------------------------

app.get('/api/canned-replies', requireAgent, (_req, res) => {
  res.json([...db.state.canned_replies].sort((a, b) => b.created_at.localeCompare(a.created_at)));
});

app.post(
  '/api/canned-replies',
  requireAgent,
  handle((req, res) => {
    const reply = {
      id: newId('cr'),
      title: text(req.body?.title, 'Title', { max: 100, required: true })!,
      content: text(req.body?.content, 'Content', { max: 2000, required: true })!,
      created_by: res.locals.auth.user.id,
      created_at: new Date().toISOString(),
    };
    db.state.canned_replies.push(reply);
    db.save();
    res.json(reply);
  })
);

app.get('/api/analytics', requireAgent, (_req, res) => {
  res.json(computeAnalytics(db.state, onlineAgentIds()));
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// -----------------------------------------------------------------------------
// Frontend + startup
// -----------------------------------------------------------------------------

const httpServer = http.createServer(app);

if (IS_PROD) {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('dist/ is missing. Run "npm run build" first.');
    process.exit(1);
  }
  app.use(express.static(DIST_DIR, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));

  // FTP deploys refresh tmp/restart.txt last; exit so the host's process
  // supervisor starts the new build.
  fs.watchFile(path.join(ROOT, 'tmp', 'restart.txt'), { interval: 5000 }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) return;
    console.log('New deploy detected, restarting');
    db.flush();
    process.exit(0);
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'spa',
    server: {
      middlewareMode: true,
      // Share our HTTP server for Vite's websocket so everything runs on one port.
      ws: { server: httpServer },
    },
  });
  app.use(vite.middlewares);
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.too.large') return void res.status(413).json({ error: 'File is too large (max 10 MB)' });
  if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON' });
  if (err?.status === 404 || err?.statusCode === 404) return void res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Start on another port, e.g. in PowerShell: $env:PORT=3002; npm run dev`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, HOST, () => {
  console.log(`\n  LiveFlow ${IS_PROD ? '(production)' : '(development)'} is running`);
  console.log(`  Dashboard:     http://localhost:${PORT}/`);
  console.log(`  Data folder:   ${DATA_DIR}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    db.flush();
    process.exit(0);
  });
}
