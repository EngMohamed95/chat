// server/index.ts
import express from "express";
import crypto2 from "node:crypto";
import fs2 from "node:fs";
import http from "node:http";
import os from "node:os";
import path2 from "node:path";

// server/analytics.ts
var average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
var round1 = (n) => Math.round(n * 10) / 10;
var dayKey = (iso) => iso.slice(0, 10);
function firstResponseSeconds(conv, messagesByConv) {
  const msgs = messagesByConv.get(conv.id) || [];
  const firstVisitor = msgs.find((m) => m.sender_type === "visitor");
  if (!firstVisitor) return null;
  const start = new Date(firstVisitor.created_at).getTime();
  const reply = msgs.find(
    (m) => m.sender_type === "agent" && !m.is_internal_note && new Date(m.created_at).getTime() >= start
  );
  if (!reply) return null;
  return (new Date(reply.created_at).getTime() - start) / 1e3;
}
function computeAnalytics(state, onlineAgentIds2) {
  const convs = state.conversations;
  const messagesByConv = /* @__PURE__ */ new Map();
  for (const m of [...state.messages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!messagesByConv.has(m.conversation_id)) messagesByConv.set(m.conversation_id, []);
    messagesByConv.get(m.conversation_id).push(m);
  }
  const responseTimes = /* @__PURE__ */ new Map();
  for (const c of convs) {
    const s = firstResponseSeconds(c, messagesByConv);
    if (s !== null) responseTimes.set(c.id, s);
  }
  const total = convs.length;
  const open = convs.filter((c) => c.status === "open").length;
  const closed = convs.filter((c) => c.status === "closed").length;
  const today = dayKey((/* @__PURE__ */ new Date()).toISOString());
  const ratings = convs.filter((c) => typeof c.rating === "number").map((c) => c.rating);
  const csatBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((r) => r === stars).length;
    return {
      score: stars,
      stars: "\u2605".repeat(stars) + "\u2606".repeat(5 - stars),
      count,
      percentage: ratings.length ? Math.round(count / ratings.length * 100) : 0
    };
  });
  const agentMetrics = state.users.map((u) => {
    const mine = convs.filter((c) => c.assigned_to === u.id);
    const resolved = mine.filter((c) => c.status === "closed").length;
    const myRatings = mine.filter((c) => typeof c.rating === "number").map((c) => c.rating);
    const myResponses = mine.filter((c) => responseTimes.has(c.id)).map((c) => responseTimes.get(c.id));
    return {
      agent_id: u.id,
      full_name: u.full_name,
      username: u.username,
      avatar_url: u.avatar_url,
      conversations_handled: mine.length,
      resolved_count: resolved,
      resolution_rate_percent: mine.length ? Math.round(resolved / mine.length * 100) : 0,
      avg_first_response_seconds: Math.round(average(myResponses)),
      avg_csat_score: round1(average(myRatings)),
      total_ratings: myRatings.length,
      is_online: onlineAgentIds2.includes(u.id)
    };
  });
  const historicalData = [];
  const dailyStats = [];
  for (let i = 6; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
    const created = convs.filter((c) => dayKey(c.created_at) === key);
    const resolvedThatDay = convs.filter((c) => c.closed_at && dayKey(c.closed_at) === key).length;
    const msgs = state.messages.filter((m) => dayKey(m.created_at) === key).length;
    const dayResponses = created.filter((c) => responseTimes.has(c.id)).map((c) => responseTimes.get(c.id));
    const dayRatings = convs.filter((c) => c.rated_at && dayKey(c.rated_at) === key && typeof c.rating === "number").map((c) => c.rating);
    historicalData.push({
      date: label,
      total_conversations: created.length,
      resolved_conversations: resolvedThatDay,
      messages_sent: msgs,
      avg_response_time_minutes: round1(average(dayResponses) / 60),
      resolution_rate_percent: created.length ? Math.min(100, Math.round(resolvedThatDay / created.length * 100)) : 0,
      csat_score: round1(average(dayRatings))
    });
    dailyStats.push({ date: label, conversations: created.length, messages: msgs });
  }
  return {
    total_conversations: total,
    open_conversations: open,
    closed_conversations: closed,
    messages_today: state.messages.filter((m) => dayKey(m.created_at) === today).length,
    avg_first_response_minutes: round1(average([...responseTimes.values()]) / 60),
    overall_csat_score: round1(average(ratings)),
    total_csat_responses: ratings.length,
    resolution_rate_percent: total ? Math.round(closed / total * 100) : 0,
    csat_breakdown: csatBreakdown,
    agent_metrics: agentMetrics,
    historical_data: historicalData,
    daily_stats: dailyStats
  };
}

// server/auth.ts
import crypto from "node:crypto";
var SCRYPT_KEYLEN = 64;
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
var LoginThrottle = class {
  constructor(maxFailures = 10, windowMs = 15 * 60 * 1e3) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.failures = /* @__PURE__ */ new Map();
  }
  isBlocked(key) {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }
  fail(key) {
    const entry = this.failures.get(key);
    if (!entry || Date.now() - entry.first > this.windowMs) {
      this.failures.set(key, { count: 1, first: Date.now() });
    } else {
      entry.count += 1;
    }
  }
  reset(key) {
    this.failures.delete(key);
  }
};

// server/db.ts
import fs from "node:fs";
import path from "node:path";
var DEFAULT_SETTINGS = {
  id: "default",
  company_name: "LiveFlow Support",
  logo_url: null,
  primary_color: "#10b981",
  welcome_message: "Hi there! \u{1F44B} Welcome to our site. How can our team help you today?",
  offline_message: "We are currently offline. Please drop your email and inquiry, and we will reply as soon as we are back!",
  working_hours: {
    enabled: true,
    start: "09:00",
    end: "18:00",
    timezone: "UTC"
  },
  widget_position: "bottom-right",
  prechat_enabled: true,
  updated_at: (/* @__PURE__ */ new Date()).toISOString()
};
var DEFAULT_CANNED = [
  { title: "Greeting", content: "Hi there! Thanks for reaching out. How can I assist you today?" },
  { title: "Looking into it", content: "Thank you for explaining! I am checking this in our system right now, please give me 2 minutes." },
  { title: "Arabic Welcome", content: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0648\u0633\u0647\u0644\u0627\u064B! \u064A\u0633\u0639\u062F\u0646\u0627 \u062A\u0648\u0627\u0635\u0644\u0643\u060C \u0643\u064A\u0641 \u064A\u0645\u0643\u0646\u0646\u064A \u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629 \u0644\u0643\u061F" },
  { title: "Arabic Checking", content: "\u0634\u0643\u0631\u0627\u064B \u0644\u062A\u0648\u0636\u064A\u062D\u0643\u060C \u0623\u0642\u0648\u0645 \u0628\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0648\u0633\u0623\u0648\u0627\u0641\u064A\u0643 \u0628\u0627\u0644\u0631\u062F \u0641\u0648\u0631\u0627\u064B." },
  { title: "Resolved", content: "Great! I am glad we were able to solve this. Feel free to contact us anytime if you need more help!" }
];
function initialState() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
      created_at: now
    }))
  };
}
var JsonDb = class {
  constructor(dataDir) {
    this.saveTimer = null;
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, "db.json");
    if (fs.existsSync(this.file)) {
      const loaded = JSON.parse(fs.readFileSync(this.file, "utf8"));
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
      fs.writeFileSync(this.file, json);
    }
  }
};

// server/index.ts
var ROOT = path2.resolve(import.meta.dirname, "..");
var DATA_DIR = process.env.DATA_DIR ? path2.resolve(process.env.DATA_DIR) : path2.join(ROOT, "data");
var UPLOADS_DIR = path2.join(DATA_DIR, "uploads");
var DIST_DIR = path2.join(ROOT, "dist");
var PORT = Number(process.env.PORT) || 3001;
var HOST = process.env.HOST || "0.0.0.0";
var IS_PROD = process.argv.includes("--prod") || true;
var AGENT_SESSION_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
var UPLOAD_EXTENSIONS = /* @__PURE__ */ new Set([...IMAGE_EXTENSIONS, ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx", ".zip"]);
var USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
var db = new JsonDb(DATA_DIR);
fs2.mkdirSync(UPLOADS_DIR, { recursive: true });
var throttle = new LoginThrottle();
var DUMMY_HASH = hashPassword(crypto2.randomUUID());
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var handle = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    next(err);
  }
};
function text(value, field, opts = {}) {
  const { max = 200, required = false } = opts;
  if (value === void 0 || value === null || value === "") {
    if (required) throw new HttpError(400, `${field} is required`);
    return void 0;
  }
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${field} is required`);
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`);
  return trimmed;
}
function toProfile(user) {
  const { password_hash: _hash, ...profile } = user;
  return profile;
}
function withAssignee(conv) {
  const user = conv.assigned_to ? db.state.users.find((u) => u.id === conv.assigned_to) : void 0;
  return { ...conv, assignee: user ? toProfile(user) : void 0 };
}
function findUser(id) {
  const user = db.state.users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, "User not found");
  return user;
}
function activeAdminCount() {
  return db.state.users.filter((u) => u.role === "admin" && u.is_active).length;
}
function validatePassword(value) {
  if (typeof value !== "string" || value.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  if (value.length > 200) throw new HttpError(400, "Password is too long");
  return value;
}
function createUserRecord(body, role) {
  const full_name = text(body?.full_name, "Full name", { max: 100, required: true });
  const username = String(body?.username || "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, "Username must be 3-32 characters: English letters, numbers, dot, dash or underscore");
  }
  if (db.state.users.some((u) => u.username === username)) throw new HttpError(409, "This username is already taken");
  return {
    id: newId("user"),
    username,
    full_name,
    role,
    is_active: true,
    avatar_url: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    password_hash: hashPassword(validatePassword(body?.password))
  };
}
function startSession(kind, subjectId) {
  const token = newToken();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.state.sessions.push({ token_hash: hashToken(token), kind, subject_id: subjectId, created_at: now, last_seen_at: now });
  return token;
}
function revokeSessions(predicate) {
  const revoked = new Set(db.state.sessions.filter(predicate).map((s) => s.token_hash));
  if (!revoked.size) return;
  db.state.sessions = db.state.sessions.filter((s) => !revoked.has(s.token_hash));
  for (const client of [...clients]) {
    if (revoked.has(client.auth.tokenHash)) disconnect(client);
  }
}
function authenticate(req, allowQueryToken = false) {
  const header = req.headers.authorization;
  let token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token && allowQueryToken && typeof req.query.token === "string") token = req.query.token;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db.state.sessions.find((s) => s.token_hash === tokenHash);
  if (!session) return null;
  if (session.kind === "visitor") return { kind: "visitor", visitorId: session.subject_id, tokenHash };
  const user = db.state.users.find((u) => u.id === session.subject_id);
  const idle = Date.now() - new Date(session.last_seen_at).getTime();
  if (!user || !user.is_active || idle > AGENT_SESSION_MAX_IDLE_MS) return null;
  if (idle > 60 * 60 * 1e3) {
    session.last_seen_at = (/* @__PURE__ */ new Date()).toISOString();
    db.save();
  }
  return { kind: "agent", user, tokenHash };
}
var requireAgent = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth || auth.kind !== "agent") return void res.status(401).json({ error: "Please sign in again" });
  res.locals.auth = auth;
  next();
};
var requireAdmin = (req, res, next) => {
  requireAgent(req, res, () => {
    if (res.locals.auth.user.role !== "admin") return void res.status(403).json({ error: "Administrators only" });
    next();
  });
};
var requireVisitor = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth || auth.kind !== "visitor") return void res.status(401).json({ error: "Visitor session expired" });
  res.locals.auth = auth;
  next();
};
var requireAny = (req, res, next) => {
  const auth = authenticate(req);
  if (!auth) return void res.status(401).json({ error: "Please sign in again" });
  res.locals.auth = auth;
  next();
};
function conversationFor(auth, id) {
  const conv = db.state.conversations.find((c) => c.id === id);
  if (!conv || auth.kind === "visitor" && conv.visitor_id !== auth.visitorId) {
    throw new HttpError(404, "Conversation not found");
  }
  return conv;
}
function lanUrls() {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family === "IPv4" && !addr.internal) urls.push(`http://${addr.address}:${PORT}`);
    }
  }
  return urls;
}
var clients = /* @__PURE__ */ new Set();
var awayAgents = /* @__PURE__ */ new Set();
var isStaff = (c) => c.auth.kind === "agent";
var isVisitor = (visitorId) => (c) => c.auth.kind === "visitor" && c.auth.visitorId === visitorId;
function push(client, type, data) {
  if (client.res.writableEnded) return;
  client.res.write(`data: ${JSON.stringify({ type, data })}

`);
}
function disconnect(client) {
  if (!clients.delete(client)) return;
  clearInterval(client.ping);
  if (!client.res.writableEnded) client.res.end();
  if (client.auth.kind === "agent") broadcastPresence();
}
function broadcast(filter, type, data) {
  for (const client of clients) if (filter(client)) push(client, type, data);
}
function onlineAgentIds() {
  const ids = /* @__PURE__ */ new Set();
  for (const c of clients) if (c.auth.kind === "agent" && !awayAgents.has(c.auth.user.id)) ids.add(c.auth.user.id);
  return [...ids];
}
function broadcastPresence() {
  broadcast(isStaff, "presence_state", { onlineAgents: onlineAgentIds() });
}
function publishConversation(conv, created = false) {
  broadcast(isStaff, created ? "conversation_created" : "conversation_updated", withAssignee(conv));
  broadcast(isVisitor(conv.visitor_id), "conversation_updated", conv);
}
function publishProfiles() {
  broadcast(isStaff, "profiles_updated", db.state.users.map(toProfile));
}
var app = express();
if (process.env.TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    fallthrough: false,
    setHeaders(res, filePath) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      if (!IMAGE_EXTENSIONS.has(path2.extname(filePath).toLowerCase())) {
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  })
);
app.post(
  "/api/uploads",
  requireAny,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  handle((req, res) => {
    const original = decodeURIComponent(String(req.headers["x-file-name"] || "file"));
    const ext = path2.extname(original).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) throw new HttpError(400, `File type ${ext || "(none)"} is not allowed`);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "Empty file");
    const name = `${crypto2.randomUUID()}${ext}`;
    fs2.writeFileSync(path2.join(UPLOADS_DIR, name), req.body);
    res.json({ url: `/uploads/${name}` });
  })
);
app.use("/api", express.json({ limit: "1mb" }));
app.get("/api/events", (req, res) => {
  const auth = authenticate(req, true);
  if (!auth) return void res.status(401).end();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 3000\n\n");
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 25e3);
  const client = { res, auth, ping };
  clients.add(client);
  if (auth.kind === "agent") broadcastPresence();
  res.on("error", () => disconnect(client));
  req.on("close", () => disconnect(client));
});
app.post(
  "/api/typing",
  requireAny,
  handle((req, res) => {
    const auth = res.locals.auth;
    const conv = conversationFor(auth, String(req.body?.conversation_id || ""));
    const payload = { conversationId: conv.id, senderType: auth.kind, isTyping: !!req.body?.is_typing };
    broadcast(isStaff, "typing", payload);
    broadcast(isVisitor(conv.visitor_id), "typing", payload);
    res.json({ ok: true });
  })
);
app.post("/api/presence", requireAgent, (req, res) => {
  const userId = res.locals.auth.user.id;
  if (req.body?.online) awayAgents.delete(userId);
  else awayAgents.add(userId);
  broadcastPresence();
  res.json({ ok: true });
});
app.get("/api/auth/status", (_req, res) => {
  res.json({ needsSetup: db.state.users.length === 0 });
});
app.post(
  "/api/auth/setup",
  handle((req, res) => {
    if (db.state.users.length > 0) throw new HttpError(409, "Setup was already completed. Please sign in.");
    const user = createUserRecord(req.body, "admin");
    db.state.users.push(user);
    const token = startSession("agent", user.id);
    db.save();
    res.json({ token, profile: toProfile(user) });
  })
);
app.post(
  "/api/auth/login",
  handle((req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const key = `${req.ip}|${username}`;
    if (throttle.isBlocked(key)) throw new HttpError(429, "Too many failed attempts. Try again in 15 minutes.");
    const user = db.state.users.find((u) => u.username === username);
    const valid = verifyPassword(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) {
      throttle.fail(key);
      throw new HttpError(401, "Wrong username or password");
    }
    if (!user.is_active) throw new HttpError(403, "This account is disabled. Contact your administrator.");
    throttle.reset(key);
    const token = startSession("agent", user.id);
    db.save();
    res.json({ token, profile: toProfile(user) });
  })
);
app.post("/api/auth/logout", requireAgent, (_req, res) => {
  const tokenHash = res.locals.auth.tokenHash;
  revokeSessions((s) => s.token_hash === tokenHash);
  db.save();
  res.json({ ok: true });
});
app.get("/api/auth/me", requireAgent, (_req, res) => {
  res.json({ profile: toProfile(res.locals.auth.user) });
});
app.get("/api/users", requireAgent, (_req, res) => {
  res.json(db.state.users.map(toProfile));
});
app.post(
  "/api/users",
  requireAdmin,
  handle((req, res) => {
    const role = req.body?.role === "admin" ? "admin" : "agent";
    const user = createUserRecord(req.body, role);
    db.state.users.push(user);
    db.save();
    publishProfiles();
    res.json({ user: toProfile(user) });
  })
);
app.patch(
  "/api/users/:id",
  requireAdmin,
  handle((req, res) => {
    const auth = res.locals.auth;
    const user = findUser(req.params.id);
    const isSelf = user.id === auth.user.id;
    const body = req.body || {};
    if (body.full_name !== void 0) user.full_name = text(body.full_name, "Full name", { max: 100, required: true });
    if (body.role !== void 0 || body.is_active !== void 0) {
      const role = body.role === void 0 ? user.role : body.role === "admin" ? "admin" : "agent";
      const isActive = body.is_active === void 0 ? user.is_active : !!body.is_active;
      if (isSelf && (role !== user.role || isActive !== user.is_active)) {
        throw new HttpError(400, "You cannot change your own role or disable your own account");
      }
      const losesAdmin = user.role === "admin" && user.is_active && (role !== "admin" || !isActive);
      if (losesAdmin && activeAdminCount() <= 1) throw new HttpError(400, "There must be at least one active administrator");
      user.role = role;
      user.is_active = isActive;
      if (!isActive) revokeSessions((s) => s.kind === "agent" && s.subject_id === user.id);
    }
    if (body.password !== void 0) {
      user.password_hash = hashPassword(validatePassword(body.password));
      revokeSessions((s) => s.kind === "agent" && s.subject_id === user.id && s.token_hash !== auth.tokenHash);
    }
    db.save();
    publishProfiles();
    res.json({ user: toProfile(user) });
  })
);
app.delete(
  "/api/users/:id",
  requireAdmin,
  handle((req, res) => {
    const user = findUser(req.params.id);
    if (user.id === res.locals.auth.user.id) throw new HttpError(400, "You cannot delete your own account");
    if (user.role === "admin" && user.is_active && activeAdminCount() <= 1) {
      throw new HttpError(400, "There must be at least one active administrator");
    }
    db.state.users = db.state.users.filter((u) => u.id !== user.id);
    revokeSessions((s) => s.kind === "agent" && s.subject_id === user.id);
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
app.get("/api/settings", (_req, res) => {
  res.json(db.state.settings);
});
app.put(
  "/api/settings",
  requireAdmin,
  handle((req, res) => {
    const body = req.body || {};
    const s = { ...db.state.settings };
    if (body.company_name !== void 0) s.company_name = text(body.company_name, "Company name", { max: 100, required: true });
    if (body.logo_url !== void 0) s.logo_url = text(body.logo_url, "Logo URL", { max: 1e3 }) || null;
    if (body.primary_color !== void 0) {
      if (typeof body.primary_color !== "string" || !/^#[0-9a-f]{3,8}$/i.test(body.primary_color)) {
        throw new HttpError(400, "Brand color must be a hex color like #10b981");
      }
      s.primary_color = body.primary_color;
    }
    if (body.welcome_message !== void 0) s.welcome_message = text(body.welcome_message, "Welcome message", { max: 1e3 }) || "";
    if (body.offline_message !== void 0) s.offline_message = text(body.offline_message, "Offline message", { max: 1e3 }) || "";
    if (body.widget_position !== void 0) s.widget_position = body.widget_position === "bottom-left" ? "bottom-left" : "bottom-right";
    if (body.prechat_enabled !== void 0) s.prechat_enabled = !!body.prechat_enabled;
    if (body.working_hours !== void 0) {
      const wh = body.working_hours || {};
      const time = (v, fallback) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : fallback;
      s.working_hours = {
        enabled: !!wh.enabled,
        start: time(wh.start, s.working_hours.start),
        end: time(wh.end, s.working_hours.end),
        timezone: text(wh.timezone, "Timezone", { max: 64 }) || s.working_hours.timezone
      };
    }
    s.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    db.state.settings = s;
    db.save();
    broadcast(() => true, "settings_updated", s);
    res.json(s);
  })
);
app.post("/api/visitor/session", (req, res) => {
  const existing = authenticate(req);
  const header = req.headers.authorization || "";
  if (existing?.kind === "visitor") {
    return void res.json({ visitor_id: existing.visitorId, token: header.slice(7) });
  }
  const visitorId = newId("visitor");
  const token = startSession("visitor", visitorId);
  db.save();
  res.json({ visitor_id: visitorId, token });
});
app.get("/api/visitor/conversation", requireVisitor, (_req, res) => {
  const visitorId = res.locals.auth.visitorId;
  const latest = db.state.conversations.filter((c) => c.visitor_id === visitorId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  res.json(latest || null);
});
app.post(
  "/api/visitor/conversations",
  requireVisitor,
  handle((req, res) => {
    const body = req.body || {};
    const visitorId = res.locals.auth.visitorId;
    const rawMeta = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const metadata = {};
    for (const key of ["current_url", "referrer", "browser", "os", "device", "first_seen_at"]) {
      if (typeof rawMeta[key] === "string") metadata[key] = rawMeta[key].slice(0, 500);
    }
    metadata.ip = req.ip || "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const conv = {
      id: newId("conv"),
      visitor_id: visitorId,
      visitor_name: text(body.visitor_name, "Name", { max: 100 }) || `Visitor #${visitorId.slice(-4)}`,
      visitor_contact: text(body.visitor_contact, "Contact", { max: 200 }) || null,
      status: "open",
      assigned_to: null,
      last_message: "Started a conversation",
      last_message_at: now,
      unread_for_agent: 0,
      unread_for_visitor: 0,
      metadata,
      created_at: now
    };
    db.state.conversations.push(conv);
    db.save();
    publishConversation(conv, true);
    res.json(conv);
  })
);
app.get("/api/conversations", requireAgent, (_req, res) => {
  const list = [...db.state.conversations].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  res.json(list.map(withAssignee));
});
app.patch(
  "/api/conversations/:id",
  requireAgent,
  handle((req, res) => {
    const conv = conversationFor(res.locals.auth, req.params.id);
    const body = req.body || {};
    if (body.status !== void 0) {
      if (body.status !== "open" && body.status !== "closed") throw new HttpError(400, "Invalid status");
      if (body.status !== conv.status) conv.closed_at = body.status === "closed" ? (/* @__PURE__ */ new Date()).toISOString() : null;
      conv.status = body.status;
    }
    if (body.assigned_to !== void 0) {
      if (body.assigned_to) findUser(String(body.assigned_to));
      conv.assigned_to = body.assigned_to ? String(body.assigned_to) : null;
    }
    db.save();
    publishConversation(conv);
    res.json(withAssignee(conv));
  })
);
app.post(
  "/api/conversations/:id/rating",
  requireVisitor,
  handle((req, res) => {
    const conv = conversationFor(res.locals.auth, req.params.id);
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Rating must be 1-5");
    conv.rating = rating;
    conv.rating_feedback = text(req.body?.feedback, "Feedback", { max: 1e3 }) || null;
    conv.rated_at = (/* @__PURE__ */ new Date()).toISOString();
    db.save();
    publishConversation(conv);
    res.json(conv);
  })
);
app.get(
  "/api/conversations/:id/messages",
  requireAny,
  handle((req, res) => {
    const auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const msgs = db.state.messages.filter((m) => m.conversation_id === conv.id && (auth.kind === "agent" || !m.is_internal_note)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    res.json(msgs);
  })
);
app.post(
  "/api/conversations/:id/messages",
  requireAny,
  handle((req, res) => {
    const auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const body = req.body || {};
    const content = text(body.content, "Message", { max: 5e3 }) || "";
    const attachment = text(body.attachment_url, "Attachment", { max: 300 }) || null;
    if (attachment && !attachment.startsWith("/uploads/")) throw new HttpError(400, "Invalid attachment");
    if (!content && !attachment) throw new HttpError(400, "Message is empty");
    const isAgent = auth.kind === "agent";
    const msg = {
      id: newId("msg"),
      conversation_id: conv.id,
      sender_type: isAgent ? "agent" : "visitor",
      sender_id: isAgent ? auth.user.id : auth.visitorId,
      content,
      attachment_url: attachment,
      is_internal_note: isAgent && !!body.is_internal_note,
      seen: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.state.messages.push(msg);
    if (!msg.is_internal_note) {
      conv.last_message = msg.content || "\u{1F4CE} Attachment";
      conv.last_message_at = msg.created_at;
      if (isAgent) {
        conv.unread_for_visitor = (conv.unread_for_visitor || 0) + 1;
      } else {
        conv.unread_for_agent = (conv.unread_for_agent || 0) + 1;
        if (conv.status === "closed") {
          conv.status = "open";
          conv.closed_at = null;
        }
      }
    }
    db.save();
    broadcast(isStaff, "message_created", msg);
    if (!msg.is_internal_note) broadcast(isVisitor(conv.visitor_id), "message_created", msg);
    publishConversation(conv);
    res.json(msg);
  })
);
app.post(
  "/api/conversations/:id/seen",
  requireAny,
  handle((req, res) => {
    const auth = res.locals.auth;
    const conv = conversationFor(auth, req.params.id);
    const readerType = auth.kind === "agent" ? "agent" : "visitor";
    const senderType = readerType === "agent" ? "visitor" : "agent";
    let changed = false;
    for (const m of db.state.messages) {
      if (m.conversation_id === conv.id && m.sender_type === senderType && !m.seen) {
        m.seen = true;
        changed = true;
      }
    }
    const unreadField = readerType === "agent" ? "unread_for_agent" : "unread_for_visitor";
    if (conv[unreadField]) {
      conv[unreadField] = 0;
      changed = true;
    }
    if (changed) {
      db.save();
      const payload = { conversationId: conv.id, readerType };
      broadcast(isStaff, "messages_seen", payload);
      broadcast(isVisitor(conv.visitor_id), "messages_seen", payload);
      publishConversation(conv);
    }
    res.json({ ok: true });
  })
);
app.get("/api/canned-replies", requireAgent, (_req, res) => {
  res.json([...db.state.canned_replies].sort((a, b) => b.created_at.localeCompare(a.created_at)));
});
app.post(
  "/api/canned-replies",
  requireAgent,
  handle((req, res) => {
    const reply = {
      id: newId("cr"),
      title: text(req.body?.title, "Title", { max: 100, required: true }),
      content: text(req.body?.content, "Content", { max: 2e3, required: true }),
      created_by: res.locals.auth.user.id,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.state.canned_replies.push(reply);
    db.save();
    res.json(reply);
  })
);
app.get("/api/analytics", requireAgent, (_req, res) => {
  res.json(computeAnalytics(db.state, onlineAgentIds()));
});
app.get("/api/server-info", requireAgent, (_req, res) => {
  res.json({ port: PORT, lanUrls: lanUrls() });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
var httpServer = http.createServer(app);
if (IS_PROD) {
  if (!fs2.existsSync(path2.join(DIST_DIR, "index.html"))) {
    console.error('dist/ is missing. Run "npm run build" first.');
    process.exit(1);
  }
  app.use(express.static(DIST_DIR, { index: false }));
  app.get("*", (_req, res) => res.sendFile(path2.join(DIST_DIR, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: ROOT,
    appType: "spa",
    server: {
      middlewareMode: true,
      // Share our HTTP server for Vite's websocket so everything runs on one port.
      ws: { server: httpServer }
    }
  });
  app.use(vite.middlewares);
}
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err?.type === "entity.too.large") return void res.status(413).json({ error: "File is too large (max 10 MB)" });
  if (err?.type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid JSON" });
  if (err?.status === 404 || err?.statusCode === 404) return void res.status(404).json({ error: "Not found" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});
httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Start on another port, e.g. in PowerShell: $env:PORT=3002; npm run dev`);
    process.exit(1);
  }
  throw err;
});
httpServer.listen(PORT, HOST, () => {
  console.log(`
  LiveFlow ${IS_PROD ? "(production)" : "(development)"} is running`);
  console.log(`  Dashboard:     http://localhost:${PORT}/`);
  console.log(`  Customer chat: http://localhost:${PORT}/chat`);
  for (const url of lanUrls()) console.log(`  On your network: ${url}/chat`);
  console.log(`  Data folder:   ${DATA_DIR}
`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    db.flush();
    process.exit(0);
  });
}
