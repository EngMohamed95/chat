<?php
/**
 * LiveFlow API for PHP hosting. Every /api/* and /uploads/* request is routed here
 * by the site's .htaccess (or by `php -S` in development).
 *
 * Realtime works by polling: clients call GET /api/events?since=N every few
 * seconds and receive the events published since N.
 */

declare(strict_types=1);

require __DIR__ . '/lib/store.php';
require __DIR__ . '/lib/analytics.php';
require __DIR__ . '/lib/mail.php';

const AGENT_SESSION_MAX_IDLE = 30 * 24 * 3600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const IMAGE_TYPES = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp'];
const FILE_TYPES = [
    'pdf' => 'application/pdf',
    'txt' => 'text/plain; charset=utf-8',
    'csv' => 'text/csv; charset=utf-8',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip' => 'application/zip',
];
const USERNAME_PATTERN = '/^[a-z0-9._-]{3,32}$/';
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW = 15 * 60;
/** An agent counts as online while it has polled within this many seconds. */
const PRESENCE_TIMEOUT = 25;

final class HttpError extends Exception
{
    /** @var int */
    public $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** @var Store $store */
$store = null;

function db(): array
{
    global $store;
    return $store->db();
}

function &dbRef(): array
{
    global $store;
    $store->markDirty();
    return $store->db();
}

/** Character count (mbstring is not installed on every host). */
function ulen(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : (int)preg_match_all('/./su', $s);
}

function usubstr(string $s, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $length, 'UTF-8') : (preg_match('/^.{0,' . $length . '}/su', $s, $m) ? $m[0] : '');
}

function text($value, string $field, int $max = 200, bool $required = false): ?string
{
    if ($value === null || $value === '') {
        if ($required) throw new HttpError(400, "$field is required");
        return null;
    }
    if (!is_string($value)) throw new HttpError(400, "$field must be text");
    $trimmed = trim($value);
    if ($trimmed === '') {
        if ($required) throw new HttpError(400, "$field is required");
        return null;
    }
    if (ulen($trimmed) > $max) throw new HttpError(400, "$field is too long (max $max characters)");
    return $trimmed;
}

function body(): array
{
    static $body = null;
    if ($body === null) {
        $raw = file_get_contents('php://input', false, null, 0, MAX_JSON_BYTES + 1);
        if (strlen((string)$raw) > MAX_JSON_BYTES) throw new HttpError(413, 'Request is too large');
        $body = $raw === '' || $raw === false ? [] : json_decode($raw, true);
        if (!is_array($body)) throw new HttpError(400, 'Invalid JSON');
    }
    return $body;
}

function to_profile(array $user): array
{
    unset($user['password_hash']);
    return $user;
}

function profiles(): array
{
    return array_map('to_profile', db()['users']);
}

function find_user_index(string $id): int
{
    foreach (db()['users'] as $i => $u) if ($u['id'] === $id) return $i;
    throw new HttpError(404, 'User not found');
}

function with_assignee(array $conv): array
{
    $conv['metadata'] = (object)($conv['metadata'] ?? []);
    if (!empty($conv['assigned_to'])) {
        foreach (db()['users'] as $u) {
            if ($u['id'] === $conv['assigned_to']) $conv['assignee'] = to_profile($u);
        }
    }
    return $conv;
}

function for_visitor(array $conv): array
{
    $conv['metadata'] = (object)($conv['metadata'] ?? []);
    return $conv;
}

function active_admin_count(): int
{
    return count(array_filter(db()['users'], function ($u) { return $u['role'] === 'admin' && $u['is_active']; }));
}

function validate_password($value): string
{
    if (!is_string($value) || strlen($value) < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (strlen($value) > 200) throw new HttpError(400, 'Password is too long');
    return $value;
}

function hash_password(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function create_user_record(array $body, string $role): array
{
    $fullName = text($body['full_name'] ?? null, 'Full name', 100, true);
    $username = strtolower(trim((string)($body['username'] ?? '')));
    if (!preg_match(USERNAME_PATTERN, $username)) {
        throw new HttpError(400, 'Username must be 3-32 characters: English letters, numbers, dot, dash or underscore');
    }
    foreach (db()['users'] as $u) {
        if ($u['username'] === $username) throw new HttpError(409, 'This username is already taken');
    }
    return [
        'id' => new_id('user'),
        'username' => $username,
        'full_name' => $fullName,
        'role' => $role,
        'is_active' => true,
        'avatar_url' => null,
        'created_at' => now_iso(),
        'password_hash' => hash_password(validate_password($body['password'] ?? null)),
    ];
}

function base64url(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

// --- Sessions ---------------------------------------------------------------

/** Staff sessions are stored (hashed) so they can be revoked. */
function start_agent_session(string $userId): string
{
    $token = base64url(random_bytes(32));
    $now = now_iso();
    $db = &dbRef();
    $db['sessions'][] = ['token_hash' => hash('sha256', $token), 'kind' => 'agent', 'subject_id' => $userId, 'created_at' => $now, 'last_seen_at' => $now];
    return $token;
}

/** Visitor tokens are signed instead of stored, so a page view on the website never writes to the database. */
function visitor_token(string $visitorId): string
{
    global $store;
    return 'v1.' . $visitorId . '.' . base64url(hash_hmac('sha256', $visitorId, $store->secret(), true));
}

/** Days a "continue the chat" link from a reply email keeps working. */
const RESUME_LINK_DAYS = 30;

/** Signed link token that lets whoever has the reply email reopen that one conversation on any device. */
function resume_token(string $convId): string
{
    $payload = $convId . '.' . (time() + RESUME_LINK_DAYS * 86400);
    return 'r1.' . $payload . '.' . resume_token_signature($payload);
}

function resume_token_signature(string $payload): string
{
    global $store;
    return base64url(hash_hmac('sha256', 'resume|' . $payload, $store->secret(), true));
}

function revoke_sessions(callable $predicate): void
{
    $db = &dbRef();
    $db['sessions'] = array_values(array_filter($db['sessions'], function ($s) use ($predicate) { return !$predicate($s); }));
}

function bearer_token(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $k => $v) if (strtolower($k) === 'authorization') $header = $v;
    }
    if ($header === '') $header = $_SERVER['HTTP_X_LIVEFLOW_AUTH'] ?? '';
    return strncmp($header, 'Bearer ', 7) === 0 ? substr($header, 7) : '';
}

/** @return array{kind:string,user?:array,visitorId?:string,tokenHash?:string}|null */
function authenticate(): ?array
{
    global $store;
    $token = bearer_token();
    if ($token === '') return null;

    if (strncmp($token, 'v1.', 3) === 0) {
        $parts = explode('.', $token);
        // Visitor ids are generated here, or kept from conversations imported from Zaetoon.
        if (count($parts) !== 3 || !preg_match('/^(visitor-[0-9a-f-]{36}|zt-contact-[0-9]+)$/', $parts[1])) return null;
        return hash_equals(visitor_token($parts[1]), $token) ? ['kind' => 'visitor', 'visitorId' => $parts[1]] : null;
    }

    $tokenHash = hash('sha256', $token);
    $db = db();
    foreach ($db['sessions'] as $i => $s) {
        if ($s['token_hash'] !== $tokenHash || $s['kind'] !== 'agent') continue;
        $idle = time() - strtotime($s['last_seen_at']);
        foreach ($db['users'] as $u) {
            if ($u['id'] !== $s['subject_id']) continue;
            if (!$u['is_active'] || $idle > AGENT_SESSION_MAX_IDLE) return null;
            if ($idle > 3600) {
                $ref = &dbRef();
                $ref['sessions'][$i]['last_seen_at'] = now_iso();
            }
            return ['kind' => 'agent', 'user' => $u, 'tokenHash' => $tokenHash];
        }
        return null;
    }
    return null;
}

function require_any(): array
{
    $auth = authenticate();
    if (!$auth) throw new HttpError(401, 'Please sign in again');
    return $auth;
}

function require_agent(): array
{
    $auth = authenticate();
    if (!$auth || $auth['kind'] !== 'agent') throw new HttpError(401, 'Please sign in again');
    return $auth;
}

function require_admin(): array
{
    $auth = require_agent();
    if ($auth['user']['role'] !== 'admin') throw new HttpError(403, 'Administrators only');
    return $auth;
}

function require_visitor(): array
{
    $auth = authenticate();
    if (!$auth || $auth['kind'] !== 'visitor') throw new HttpError(401, 'Visitor session expired');
    return $auth;
}

/** Visitors can only reach their own conversation; it 404s otherwise so ids can't be probed. */
function conversation_index(array $auth, string $id): int
{
    foreach (db()['conversations'] as $i => $c) {
        if ($c['id'] !== $id) continue;
        if ($auth['kind'] === 'visitor' && $c['visitor_id'] !== $auth['visitorId']) break;
        return $i;
    }
    throw new HttpError(404, 'Conversation not found');
}

// --- Realtime --------------------------------------------------------------------

function publish(string $to, string $type, $data): void
{
    global $store;
    $store->publish($to, $type, $data);
}

function publish_conversation(array $conv, bool $created = false): void
{
    publish('staff', $created ? 'conversation_created' : 'conversation_updated', with_assignee($conv));
    publish('visitor:' . $conv['visitor_id'], 'conversation_updated', for_visitor($conv));
}

function publish_profiles(): void
{
    publish('staff', 'profiles_updated', profiles());
}

function online_agent_ids(): array
{
    global $store;
    $ids = [];
    foreach ($store->readSide('presence') as $id => $p) {
        if (empty($p['away']) && time() - (int)$p['seen'] <= PRESENCE_TIMEOUT) $ids[] = (string)$id;
    }
    return $ids;
}

function update_presence(string $userId, ?bool $away = null): void
{
    global $store;
    $presence = $store->readSide('presence');
    $entry = $presence[$userId] ?? ['seen' => 0, 'away' => false];
    $changed = $away !== null && $away !== (bool)$entry['away'];
    if (!$changed && time() - (int)$entry['seen'] < 10) return;
    $entry['seen'] = time();
    if ($away !== null) $entry['away'] = $away;
    $presence[$userId] = $entry;
    $store->writeSide('presence', $presence);
}

// --- Login throttling ------------------------------------------------------------

function throttle_key(string $username): string
{
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $username);
}

function throttle_blocked(string $key): bool
{
    global $store;
    $entry = $store->readSide('throttle')[$key] ?? null;
    return $entry && time() - $entry['first'] <= LOGIN_WINDOW && $entry['count'] >= LOGIN_MAX_FAILURES;
}

function throttle_record(string $key, bool $failed): void
{
    global $store;
    $all = array_filter($store->readSide('throttle'), function ($e) { return time() - $e['first'] <= LOGIN_WINDOW; });
    if ($failed) {
        $entry = $all[$key] ?? ['count' => 0, 'first' => time()];
        $entry['count']++;
        $all[$key] = $entry;
    } else {
        unset($all[$key]);
    }
    $store->writeSide('throttle', $all);
}

// -----------------------------------------------------------------------------
// Uploads
// -----------------------------------------------------------------------------

function serve_upload(string $name): void
{
    global $store;
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $types = IMAGE_TYPES + FILE_TYPES;
    $file = $store->dir . '/uploads/' . $name;
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $name) || $name[0] === '.' || !isset($types[$ext]) || !is_file($file)) {
        throw new HttpError(404, 'Not found');
    }
    // Uploaded files are untrusted: never let them run script on this origin.
    header('Content-Type: ' . $types[$ext]);
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    header('Cache-Control: private, max-age=31536000, immutable');
    if (!isset(IMAGE_TYPES[$ext])) header('Content-Disposition: attachment');
    readfile($file);
}

/** Upload size limit: 10 MB, or less if the host's post_max_size is lower. */
function max_upload_bytes(): int
{
    $ini = trim((string)ini_get('post_max_size'));
    $units = ['k' => 1024, 'm' => 1024 * 1024, 'g' => 1024 * 1024 * 1024];
    $unit = strtolower(substr($ini, -1));
    $bytes = isset($units[$unit]) ? (int)$ini * $units[$unit] : (int)$ini;
    return $bytes > 0 ? min(MAX_UPLOAD_BYTES, $bytes) : MAX_UPLOAD_BYTES;
}

function save_upload(): array
{
    global $store;
    $original = rawurldecode((string)($_SERVER['HTTP_X_FILE_NAME'] ?? 'file'));
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!isset(IMAGE_TYPES[$ext]) && !isset(FILE_TYPES[$ext])) {
        throw new HttpError(400, 'File type ' . ($ext ? ".$ext" : '(none)') . ' is not allowed');
    }
    $max = max_upload_bytes();
    $tooLarge = 'File is too large (max ' . round($max / 1048576) . ' MB)';
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) throw new HttpError(413, $tooLarge);
    // Read the file before authenticating: authentication takes the data lock, which must not wait on a slow upload.
    $data = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($data === false || $data === '') throw new HttpError(400, 'Empty file');
    if (strlen($data) > $max) throw new HttpError(413, $tooLarge);
    require_any();
    $name = substr(new_id('f'), 2) . '.' . $ext;
    file_put_contents($store->dir . '/uploads/' . $name, $data);
    return ['url' => "/uploads/$name"];
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

/** @return array|object|null Response body (JSON). */
function route(string $method, string $path)
{
    global $store;

    // --- Realtime ------------------------------------------------------------------
    if ($method === 'GET' && $path === '/api/events') {
        $auth = require_any();
        $since = isset($_GET['since']) && $_GET['since'] !== '' ? (int)$_GET['since'] : null;
        $isAgent = $auth['kind'] === 'agent';
        $visitorTarget = $isAgent ? null : 'visitor:' . $auth['visitorId'];
        $result = $store->eventsSince($since, function ($to) use ($isAgent, $visitorTarget) {
            return $to === 'all' || ($isAgent ? $to === 'staff' : $to === $visitorTarget);
        });
        if ($isAgent) {
            update_presence($auth['user']['id']);
            $result['onlineAgents'] = online_agent_ids();
        }
        return $result;
    }

    if ($method === 'POST' && $path === '/api/typing') {
        $auth = require_any();
        $conv = db()['conversations'][conversation_index($auth, (string)(body()['conversation_id'] ?? ''))];
        $payload = ['conversationId' => $conv['id'], 'senderType' => $auth['kind'], 'isTyping' => !empty(body()['is_typing'])];
        publish('staff', 'typing', $payload);
        publish('visitor:' . $conv['visitor_id'], 'typing', $payload);
        return ['ok' => true];
    }

    if ($method === 'POST' && $path === '/api/presence') {
        $auth = require_agent();
        update_presence($auth['user']['id'], empty(body()['online']));
        return ['ok' => true];
    }

    // --- Staff authentication ----------------------------------------------------
    // On the hosting, the first administrator is created over SSH (api/tools/set-password.php), never
    // from the website: an empty or not-yet-uploaded database must not let a stranger claim the admin account.
    $webSetupAllowed = PHP_SAPI === 'cli-server';

    if ($method === 'GET' && $path === '/api/auth/status') {
        return ['needsSetup' => $webSetupAllowed && count(db()['users']) === 0];
    }

    if ($method === 'POST' && $path === '/api/auth/setup') {
        if (!$webSetupAllowed) throw new HttpError(403, 'Create the first administrator over SSH with api/tools/set-password.php');
        if (count(db()['users']) > 0) throw new HttpError(409, 'Setup was already completed. Please sign in.');
        $user = create_user_record(body(), 'admin');
        $db = &dbRef();
        $db['users'][] = $user;
        return ['token' => start_agent_session($user['id']), 'profile' => to_profile($user)];
    }

    if ($method === 'POST' && $path === '/api/auth/login') {
        $username = strtolower(trim((string)(body()['username'] ?? '')));
        $password = (string)(body()['password'] ?? '');
        $key = throttle_key($username);
        if (throttle_blocked($key)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

        $user = null;
        foreach (db()['users'] as $u) if ($u['username'] === $username) $user = $u;
        $hash = $user['password_hash'] ?? '';
        if ($user && strncmp($hash, 'scrypt$', 7) === 0) {
            throttle_record($key, true);
            throw new HttpError(401, 'This password was set on the old server and must be set again. Run api/tools/set-password.php from SSH.');
        }
        // Spend the same hashing time for unknown users so timing does not reveal which usernames exist.
        $valid = $user ? password_verify($password, $hash) : !password_hash($password, PASSWORD_DEFAULT);
        if (!$user || !$valid) {
            throttle_record($key, true);
            throw new HttpError(401, 'Wrong username or password');
        }
        if (!$user['is_active']) throw new HttpError(403, 'This account is disabled. Contact your administrator.');
        throttle_record($key, false);
        return ['token' => start_agent_session($user['id']), 'profile' => to_profile($user)];
    }

    if ($method === 'POST' && $path === '/api/auth/logout') {
        $auth = require_agent();
        revoke_sessions(function ($s) use ($auth) { return $s['token_hash'] === $auth['tokenHash']; });
        return ['ok' => true];
    }

    if ($method === 'GET' && $path === '/api/auth/me') {
        return ['profile' => to_profile(require_agent()['user'])];
    }

    // --- Users (team) ------------------------------------------------------------
    if ($method === 'GET' && $path === '/api/users') {
        require_agent();
        return profiles();
    }

    if ($method === 'POST' && $path === '/api/users') {
        require_admin();
        $user = create_user_record(body(), (body()['role'] ?? '') === 'admin' ? 'admin' : 'agent');
        $db = &dbRef();
        $db['users'][] = $user;
        publish_profiles();
        return ['user' => to_profile($user)];
    }

    if (preg_match('#^/api/users/([^/]+)$#', $path, $m) && ($method === 'PATCH' || $method === 'DELETE')) {
        $auth = require_admin();
        $i = find_user_index($m[1]);
        $db = &dbRef();
        $user = &$db['users'][$i];
        $isSelf = $user['id'] === $auth['user']['id'];

        if ($method === 'DELETE') {
            if ($isSelf) throw new HttpError(400, 'You cannot delete your own account');
            if ($user['role'] === 'admin' && $user['is_active'] && active_admin_count() <= 1) {
                throw new HttpError(400, 'There must be at least one active administrator');
            }
            $id = $user['id'];
            unset($user);
            array_splice($db['users'], $i, 1);
            revoke_sessions(function ($s) use ($id) { return $s['kind'] === 'agent' && $s['subject_id'] === $id; });
            foreach ($db['conversations'] as &$conv) {
                if (($conv['assigned_to'] ?? null) === $id) {
                    $conv['assigned_to'] = null;
                    publish_conversation($conv);
                }
            }
            unset($conv);
            publish_profiles();
            return ['ok' => true];
        }

        $b = body();
        if (array_key_exists('full_name', $b)) $user['full_name'] = text($b['full_name'], 'Full name', 100, true);
        if (array_key_exists('role', $b) || array_key_exists('is_active', $b)) {
            $role = !array_key_exists('role', $b) ? $user['role'] : ($b['role'] === 'admin' ? 'admin' : 'agent');
            $isActive = !array_key_exists('is_active', $b) ? $user['is_active'] : (bool)$b['is_active'];
            if ($isSelf && ($role !== $user['role'] || $isActive !== $user['is_active'])) {
                throw new HttpError(400, 'You cannot change your own role or disable your own account');
            }
            $losesAdmin = $user['role'] === 'admin' && $user['is_active'] && ($role !== 'admin' || !$isActive);
            if ($losesAdmin && active_admin_count() <= 1) throw new HttpError(400, 'There must be at least one active administrator');
            $user['role'] = $role;
            $user['is_active'] = $isActive;
            $id = $user['id'];
            if (!$isActive) revoke_sessions(function ($s) use ($id) { return $s['kind'] === 'agent' && $s['subject_id'] === $id; });
        }
        if (array_key_exists('password', $b)) {
            $user['password_hash'] = hash_password(validate_password($b['password']));
            // Sign the user out everywhere, except the admin's own current session.
            $id = $user['id'];
            $keep = $auth['tokenHash'];
            revoke_sessions(function ($s) use ($id, $keep) {
                return $s['kind'] === 'agent' && $s['subject_id'] === $id && $s['token_hash'] !== $keep;
            });
        }
        $result = to_profile($user);
        unset($user);
        publish_profiles();
        return ['user' => $result];
    }

    // --- Settings ----------------------------------------------------------------
    if ($method === 'GET' && $path === '/api/settings') {
        return db()['settings'];
    }

    if ($method === 'PUT' && $path === '/api/settings') {
        require_admin();
        $b = body();
        $s = db()['settings'];
        if (array_key_exists('company_name', $b)) $s['company_name'] = text($b['company_name'], 'Company name', 100, true);
        if (array_key_exists('logo_url', $b)) $s['logo_url'] = text($b['logo_url'], 'Logo URL', 1000);
        if (array_key_exists('primary_color', $b)) {
            if (!is_string($b['primary_color']) || !preg_match('/^#[0-9a-f]{3,8}$/i', $b['primary_color'])) {
                throw new HttpError(400, 'Brand color must be a hex color like #10b981');
            }
            $s['primary_color'] = $b['primary_color'];
        }
        if (array_key_exists('welcome_message', $b)) $s['welcome_message'] = text($b['welcome_message'], 'Welcome message', 1000) ?? '';
        if (array_key_exists('offline_message', $b)) $s['offline_message'] = text($b['offline_message'], 'Offline message', 1000) ?? '';
        if (array_key_exists('notification_email', $b)) {
            $email = text($b['notification_email'], 'Notification email', 200);
            if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(400, 'Notification email is not a valid email address');
            $s['notification_email'] = $email;
        }
        if (array_key_exists('widget_position', $b)) $s['widget_position'] = $b['widget_position'] === 'bottom-left' ? 'bottom-left' : 'bottom-right';
        if (array_key_exists('prechat_enabled', $b)) $s['prechat_enabled'] = (bool)$b['prechat_enabled'];
        if (array_key_exists('working_hours', $b)) {
            $wh = is_array($b['working_hours']) ? $b['working_hours'] : [];
            $time = function ($v, $fallback) { return is_string($v) && preg_match('/^\d{2}:\d{2}$/', $v) ? $v : $fallback; };
            $s['working_hours'] = [
                'enabled' => !empty($wh['enabled']),
                'start' => $time($wh['start'] ?? null, $s['working_hours']['start']),
                'end' => $time($wh['end'] ?? null, $s['working_hours']['end']),
                'timezone' => text($wh['timezone'] ?? null, 'Timezone', 64) ?? $s['working_hours']['timezone'],
            ];
        }
        $s['updated_at'] = now_iso();
        $db = &dbRef();
        $db['settings'] = $s;
        publish('all', 'settings_updated', $s);
        return $s;
    }

    // --- Visitors ----------------------------------------------------------------
    if ($method === 'POST' && $path === '/api/visitor/session') {
        $existing = authenticate();
        if ($existing && $existing['kind'] === 'visitor') {
            return ['visitor_id' => $existing['visitorId'], 'token' => bearer_token()];
        }
        $visitorId = new_id('visitor');
        return ['visitor_id' => $visitorId, 'token' => visitor_token($visitorId)];
    }

    if ($method === 'POST' && $path === '/api/visitor/resume') {
        $parts = explode('.', (string)(body()['token'] ?? ''));
        $invalid = new HttpError(400, 'This chat link is invalid or has expired');
        if (count($parts) !== 4 || $parts[0] !== 'r1' || (int)$parts[2] < time()) throw $invalid;
        if (!hash_equals(resume_token_signature($parts[1] . '.' . $parts[2]), $parts[3])) throw $invalid;
        foreach (db()['conversations'] as $c) {
            if ($c['id'] === $parts[1]) return ['visitor_id' => $c['visitor_id'], 'token' => visitor_token($c['visitor_id'])];
        }
        throw $invalid;
    }

    if ($method === 'GET' && $path === '/api/visitor/conversation') {
        $auth = require_visitor();
        $latest = null;
        foreach (db()['conversations'] as $c) {
            if ($c['visitor_id'] === $auth['visitorId'] && (!$latest || strcmp($c['created_at'], $latest['created_at']) > 0)) $latest = $c;
        }
        return $latest ? for_visitor($latest) : null;
    }

    if ($method === 'POST' && $path === '/api/visitor/conversations') {
        $auth = require_visitor();
        $b = body();
        $rawMeta = isset($b['metadata']) && is_array($b['metadata']) ? $b['metadata'] : [];
        $metadata = [];
        foreach (['current_url', 'referrer', 'browser', 'os', 'device', 'first_seen_at'] as $key) {
            if (isset($rawMeta[$key]) && is_string($rawMeta[$key])) $metadata[$key] = usubstr($rawMeta[$key], 500);
        }
        $metadata['ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
        $contact = text($b['visitor_contact'] ?? null, 'Email', 200);
        // The pre-chat form asks for an email so replies can reach visitors who leave the site.
        if (!empty(db()['settings']['prechat_enabled']) && ($contact === null || !filter_var($contact, FILTER_VALIDATE_EMAIL))) {
            throw new HttpError(400, 'Please enter a valid email address');
        }
        $now = now_iso();
        $conv = [
            'id' => new_id('conv'),
            'visitor_id' => $auth['visitorId'],
            'visitor_name' => text($b['visitor_name'] ?? null, 'Name', 100) ?? 'Visitor #' . substr($auth['visitorId'], -4),
            'visitor_contact' => $contact,
            'status' => 'open',
            'assigned_to' => null,
            'last_message' => 'Started a conversation',
            'last_message_at' => $now,
            'unread_for_agent' => 0,
            'unread_for_visitor' => 0,
            'metadata' => $metadata,
            'created_at' => $now,
        ];
        $db = &dbRef();
        $db['conversations'][] = $conv;
        publish_conversation($conv, true);
        return for_visitor($conv);
    }

    // --- Conversations & messages ------------------------------------------------
    if ($method === 'GET' && $path === '/api/conversations') {
        require_agent();
        $list = db()['conversations'];
        usort($list, function ($a, $b) { return strcmp($b['last_message_at'], $a['last_message_at']); });
        return array_map('with_assignee', $list);
    }

    if (preg_match('#^/api/conversations/([^/]+)(?:/(rating|messages|seen))?$#', $path, $m)) {
        $action = $m[2] ?? '';

        if ($action === '' && $method === 'PATCH') {
            $auth = require_agent();
            $i = conversation_index($auth, $m[1]);
            $b = body();
            $db = &dbRef();
            $conv = &$db['conversations'][$i];
            if (array_key_exists('status', $b)) {
                if ($b['status'] !== 'open' && $b['status'] !== 'closed') throw new HttpError(400, 'Invalid status');
                if ($b['status'] !== $conv['status']) $conv['closed_at'] = $b['status'] === 'closed' ? now_iso() : null;
                $conv['status'] = $b['status'];
            }
            if (array_key_exists('assigned_to', $b)) {
                if ($b['assigned_to']) find_user_index((string)$b['assigned_to']);
                $conv['assigned_to'] = $b['assigned_to'] ? (string)$b['assigned_to'] : null;
            }
            $result = $conv;
            unset($conv);
            publish_conversation($result);
            return with_assignee($result);
        }

        if ($action === 'rating' && $method === 'POST') {
            $auth = require_visitor();
            $i = conversation_index($auth, $m[1]);
            $rating = body()['rating'] ?? null;
            if (!is_int($rating) || $rating < 1 || $rating > 5) throw new HttpError(400, 'Rating must be 1-5');
            $db = &dbRef();
            $conv = &$db['conversations'][$i];
            $conv['rating'] = $rating;
            $conv['rating_feedback'] = text(body()['feedback'] ?? null, 'Feedback', 1000);
            $conv['rated_at'] = now_iso();
            $result = $conv;
            unset($conv);
            publish_conversation($result);
            return for_visitor($result);
        }

        if ($action === 'messages' && $method === 'GET') {
            $auth = require_any();
            $conv = db()['conversations'][conversation_index($auth, $m[1])];
            $msgs = array_values(array_filter(db()['messages'], function ($msg) use ($conv, $auth) {
                return $msg['conversation_id'] === $conv['id'] && ($auth['kind'] === 'agent' || empty($msg['is_internal_note']));
            }));
            usort($msgs, function ($a, $b) { return strcmp($a['created_at'], $b['created_at']); });
            return $msgs;
        }

        if ($action === 'messages' && $method === 'POST') {
            $auth = require_any();
            $i = conversation_index($auth, $m[1]);
            $b = body();
            $content = text($b['content'] ?? null, 'Message', 5000) ?? '';
            $attachment = text($b['attachment_url'] ?? null, 'Attachment', 300);
            if ($attachment !== null && strncmp($attachment, '/uploads/', 9) !== 0) throw new HttpError(400, 'Invalid attachment');
            if ($content === '' && $attachment === null) throw new HttpError(400, 'Message is empty');

            $isAgent = $auth['kind'] === 'agent';
            $msg = [
                'id' => new_id('msg'),
                'conversation_id' => $m[1],
                'sender_type' => $isAgent ? 'agent' : 'visitor',
                'sender_id' => $isAgent ? $auth['user']['id'] : $auth['visitorId'],
                'content' => $content,
                'attachment_url' => $attachment,
                'is_internal_note' => $isAgent && !empty($b['is_internal_note']),
                'seen' => false,
                'created_at' => now_iso(),
            ];
            $db = &dbRef();
            $db['messages'][] = $msg;
            $conv = &$db['conversations'][$i];
            if (!$msg['is_internal_note']) {
                $conv['last_message'] = $content !== '' ? $content : '📎 Attachment';
                $conv['last_message_at'] = $msg['created_at'];
                if ($isAgent) {
                    $conv['unread_for_visitor'] = ($conv['unread_for_visitor'] ?? 0) + 1;
                } else {
                    $conv['unread_for_agent'] = ($conv['unread_for_agent'] ?? 0) + 1;
                    if ($conv['status'] === 'closed') {
                        $conv['status'] = 'open';
                        $conv['closed_at'] = null;
                    }
                }
            }
            $result = $conv;
            unset($conv);
            publish('staff', 'message_created', $msg);
            if (!$msg['is_internal_note']) publish('visitor:' . $result['visitor_id'], 'message_created', $msg);
            if ($isAgent && !$msg['is_internal_note']) {
                queue_reply_email($result, [$msg], db()['settings']);
            }
            publish_conversation($result);
            return $msg;
        }

        if ($action === 'seen' && $method === 'POST') {
            $auth = require_any();
            $i = conversation_index($auth, $m[1]);
            $readerType = $auth['kind'] === 'agent' ? 'agent' : 'visitor';
            $senderType = $readerType === 'agent' ? 'visitor' : 'agent';
            $unreadField = $readerType === 'agent' ? 'unread_for_agent' : 'unread_for_visitor';

            $changed = false;
            foreach (db()['messages'] as $j => $msg) {
                if ($msg['conversation_id'] === $m[1] && $msg['sender_type'] === $senderType && empty($msg['seen'])) {
                    $db = &dbRef();
                    $db['messages'][$j]['seen'] = true;
                    $changed = true;
                }
            }
            if (!empty(db()['conversations'][$i][$unreadField])) {
                $db = &dbRef();
                $db['conversations'][$i][$unreadField] = 0;
                $changed = true;
            }
            if ($changed) {
                $conv = db()['conversations'][$i];
                $payload = ['conversationId' => $conv['id'], 'readerType' => $readerType];
                publish('staff', 'messages_seen', $payload);
                publish('visitor:' . $conv['visitor_id'], 'messages_seen', $payload);
                publish_conversation($conv);
            }
            return ['ok' => true];
        }
    }

    // --- Canned replies, analytics -----------------------------------------------
    if ($method === 'GET' && $path === '/api/canned-replies') {
        require_agent();
        $list = db()['canned_replies'];
        usort($list, function ($a, $b) { return strcmp($b['created_at'], $a['created_at']); });
        return $list;
    }

    if ($method === 'POST' && $path === '/api/canned-replies') {
        $auth = require_agent();
        $reply = [
            'id' => new_id('cr'),
            'title' => text(body()['title'] ?? null, 'Title', 100, true),
            'content' => text(body()['content'] ?? null, 'Content', 2000, true),
            'created_by' => $auth['user']['id'],
            'created_at' => now_iso(),
        ];
        $db = &dbRef();
        $db['canned_replies'][] = $reply;
        return $reply;
    }

    if ($method === 'POST' && $path === '/api/settings/test-email') {
        require_admin();
        $to = trim((string)(body()['to'] ?? ''));
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new HttpError(400, 'Enter a valid email address');
        $settings = db()['settings'];
        $from = mail_sender($settings);
        $company = (string)($settings['company_name'] ?? 'Support');
        $result = send_mail([
            'to' => $to,
            'subject' => "Test email from $company",
            'html' => '<p dir="auto">' . mail_escape("هذه رسالة تجربة من $company. | This is a test email from $company.") . '</p>',
            'from' => $from,
            'fromName' => $company,
        ]);
        return $result + [
            'from' => $from,
            'php_version' => PHP_VERSION,
            'sendmail_path' => (string)ini_get('sendmail_path'),
            'mail_disabled' => in_array('mail', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true),
        ];
    }

    if ($method === 'GET' && $path === '/api/analytics') {
        require_agent();
        return compute_analytics(db(), online_agent_ids());
    }

    if ($method === 'POST' && $path === '/api/uploads') {
        return save_upload();
    }

    throw new HttpError(404, 'Not found');
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

$uriPath = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
// Works whether the site is served from the domain root or a sub-folder.
$path = preg_match('#(/(?:api|uploads)(?:/.*)?)$#', $uriPath, $pm) ? rtrim($pm[1], '/') : $uriPath;
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
// Some shared hosts' firewalls block PUT/PATCH/DELETE, so the client tunnels them through POST.
if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $override = strtoupper((string)$_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
    if (in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) $method = $override;
}

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
// PHP warnings must never end up inside a JSON response; they go to the error log.
ini_set('display_errors', '0');

try {
    $store = new Store(data_dir());
    if ($method === 'GET' && strncmp($path, '/uploads/', 9) === 0) {
        serve_upload(substr($path, 9));
        exit;
    }
    // Read the request body before any handler takes the data lock, so a slow client cannot hold it.
    if ($method !== 'GET' && $path !== '/api/uploads') body();
    $result = route($method, $path);
    $store->flush();
    $status = 200;
} catch (HttpError $e) {
    // Nothing is saved: a request either completes or leaves the data as it was.
    $result = ['error' => $e->getMessage()];
    $status = $e->status;
} catch (Throwable $e) {
    error_log('LiveFlow: ' . $e);
    $result = ['error' => 'Server error'];
    $status = 500;
}

http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

// Reply emails go out after the response, with the data lock released, so a slow mail server delays nobody.
if ($status === 200 && $pendingMails) {
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    if ($store) $store->unlock();
    send_pending_mails();
}
