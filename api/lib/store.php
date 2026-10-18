<?php
/**
 * File storage for LiveFlow: one JSON database plus small side files, all
 * guarded by a single lock so concurrent PHP requests never interleave writes.
 */

final class Store
{
    /** Events older than this are dropped; a client that fell further behind refetches everything. */
    const EVENT_TTL_SECONDS = 300;
    const MAX_EVENTS = 1000;

    /** @var string */
    public $dir;
    /** @var resource|null */
    private $lock;
    /** @var array|null */
    private $db;
    /** @var bool */
    private $dbDirty = false;
    /** @var array|null */
    private $events;
    /** @var bool */
    private $eventsDirty = false;

    public function __construct(string $dir)
    {
        $this->dir = $dir;
        if (!is_dir($dir . '/uploads') && !@mkdir($dir . '/uploads', 0775, true) && !is_dir($dir . '/uploads')) {
            throw new RuntimeException("Cannot create data folder $dir");
        }
        // The data folder must never be browsable, even if it ends up inside the web root.
        if (!file_exists($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
        }
    }

    /** Takes the lock for the rest of the request; released automatically when PHP exits. */
    public function lock(): void
    {
        if ($this->lock) return;
        $this->lock = fopen($this->dir . '/.lock', 'c');
        if (!$this->lock || !flock($this->lock, LOCK_EX)) throw new RuntimeException('Cannot lock data folder');
    }

    // --- Main database -------------------------------------------------------

    public function &db(): array
    {
        if ($this->db === null) {
            $this->lock();
            $file = $this->dir . '/db.json';
            if (file_exists($file)) {
                // Never replace a database that exists but cannot be read: that would wipe it.
                $raw = file_get_contents($file);
                $this->db = $raw === false ? null : json_decode($raw, true);
                if (!is_array($this->db)) throw new RuntimeException("$file is unreadable or corrupt");
            } else {
                $this->db = self::initialState();
                $this->dbDirty = true;
            }
            $this->db += self::initialState();
            $this->db['settings'] += self::defaultSettings();
        }
        return $this->db;
    }

    public function markDirty(): void
    {
        $this->dbDirty = true;
    }

    // --- Realtime events (read by polling clients) -----------------------------

    private function &events(): array
    {
        if ($this->events === null) {
            $this->lock();
            $data = self::readJson($this->dir . '/events.json');
            $this->events = [
                'seq' => (int)($data['seq'] ?? 0),
                // Highest sequence number that has been dropped; clients behind it must resync.
                'dropped' => (int)($data['dropped'] ?? 0),
                'items' => $data['items'] ?? [],
            ];
        }
        return $this->events;
    }

    /** @param string $to 'staff', 'all', or 'visitor:<id>' */
    public function publish(string $to, string $type, $data): void
    {
        $ev = &$this->events();
        $ev['seq']++;
        $ev['items'][] = ['seq' => $ev['seq'], 'to' => $to, 'type' => $type, 'data' => $data, 'at' => time()];
        $this->eventsDirty = true;
    }

    /** Current sequence number, events after $since visible to the caller, and whether it fell behind. */
    public function eventsSince(?int $since, callable $visible): array
    {
        $ev = &$this->events();
        if ($since === null) return ['seq' => $ev['seq'], 'events' => [], 'resync' => false];
        $resync = $since > $ev['seq'] || $since < $ev['dropped'];
        $out = [];
        foreach ($ev['items'] as $item) {
            if ($item['seq'] > $since && $visible($item['to'])) {
                $out[] = ['type' => $item['type'], 'data' => $item['data']];
            }
        }
        return ['seq' => $ev['seq'], 'events' => $resync ? [] : $out, 'resync' => $resync];
    }

    // --- Side files ---------------------------------------------------------------

    public function readSide(string $name): array
    {
        $this->lock();
        return self::readJson($this->dir . "/$name.json");
    }

    public function writeSide(string $name, array $data): void
    {
        $this->lock();
        self::writeJson($this->dir . "/$name.json", $data);
    }

    /** Writes whatever changed. Called once at the end of every request. */
    public function flush(): void
    {
        if ($this->dbDirty && $this->db !== null) {
            self::writeJson($this->dir . '/db.json', $this->db);
            $this->dbDirty = false;
        }
        if ($this->eventsDirty) {
            $ev = &$this->events();
            $cutoff = time() - self::EVENT_TTL_SECONDS;
            $keep = [];
            foreach ($ev['items'] as $item) {
                if ($item['at'] >= $cutoff) $keep[] = $item;
                else $ev['dropped'] = max($ev['dropped'], $item['seq']);
            }
            $overflow = count($keep) - self::MAX_EVENTS;
            if ($overflow > 0) {
                $ev['dropped'] = max($ev['dropped'], $keep[$overflow - 1]['seq']);
                $keep = array_slice($keep, $overflow);
            }
            $ev['items'] = $keep;
            self::writeJson($this->dir . '/events.json', $ev);
            $this->eventsDirty = false;
        }
    }

    public function secret(): string
    {
        $file = $this->dir . '/secret.key';
        if (!file_exists($file)) {
            $this->lock();
            // Another request may have created it while we waited for the lock.
            if (!file_exists($file)) {
                $new = bin2hex(random_bytes(32));
                $tmp = $file . '.tmp';
                if (file_put_contents($tmp, $new) !== strlen($new) || !rename($tmp, $file)) {
                    throw new RuntimeException('Could not create secret.key');
                }
            }
        }
        $secret = trim((string)file_get_contents($file));
        if (strlen($secret) < 32) throw new RuntimeException('secret.key is corrupt');
        return $secret;
    }

    private static function readJson(string $file): array
    {
        if (!file_exists($file)) return [];
        $data = json_decode(file_get_contents($file), true);
        return is_array($data) ? $data : [];
    }

    private static function writeJson(string $file, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false) throw new RuntimeException('Could not encode ' . basename($file));
        $tmp = $file . '.tmp';
        // A short write (disk full, quota) must not replace the good file.
        if (file_put_contents($tmp, $json) !== strlen($json)) {
            @unlink($tmp);
            throw new RuntimeException('Could not write ' . basename($file) . ' (disk full?)');
        }
        if (!@rename($tmp, $file)) {
            // Windows cannot rename over a file another process has open.
            $ok = file_put_contents($file, $json) === strlen($json);
            @unlink($tmp);
            if (!$ok) throw new RuntimeException('Could not write ' . basename($file));
        }
    }

    public static function defaultSettings(): array
    {
        return [
            'id' => 'default',
            'company_name' => 'LiveFlow Support',
            'logo_url' => null,
            'primary_color' => '#10b981',
            'welcome_message' => 'Hi there! 👋 Welcome to our site. How can our team help you today?',
            'offline_message' => 'We are currently offline. Please drop your email and inquiry, and we will reply as soon as we are back!',
            'working_hours' => ['enabled' => true, 'start' => '09:00', 'end' => '18:00', 'timezone' => 'UTC'],
            'widget_position' => 'bottom-right',
            'prechat_enabled' => true,
            'updated_at' => now_iso(),
        ];
    }

    private static function initialState(): array
    {
        $now = now_iso();
        $canned = [
            ['Greeting', 'Hi there! Thanks for reaching out. How can I assist you today?'],
            ['Looking into it', 'Thank you for explaining! I am checking this in our system right now, please give me 2 minutes.'],
            ['Arabic Welcome', 'أهلاً بك وسهلاً! يسعدنا تواصلك، كيف يمكنني تقديم المساعدة لك؟'],
            ['Arabic Checking', 'شكراً لتوضيحك، أقوم بالتحقق من التفاصيل وسأوافيك بالرد فوراً.'],
            ['Resolved', 'Great! I am glad we were able to solve this. Feel free to contact us anytime if you need more help!'],
        ];
        return [
            'settings' => self::defaultSettings(),
            'users' => [],
            'sessions' => [],
            'conversations' => [],
            'messages' => [],
            'canned_replies' => array_map(function ($c, $i) use ($now) {
                return ['id' => 'cr-' . ($i + 1), 'title' => $c[0], 'content' => $c[1], 'created_at' => $now];
            }, $canned, array_keys($canned)),
        ];
    }
}

function now_iso(?float $time = null): string
{
    $time = $time ?? microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int)$time) . sprintf('.%03dZ', (int)(($time - floor($time)) * 1000));
}

function new_id(string $prefix): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return $prefix . '-' . substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
}

/** Folder holding db.json and uploads. Override with the LIVEFLOW_DATA_DIR environment variable. */
function data_dir(): string
{
    $env = getenv('LIVEFLOW_DATA_DIR');
    if ($env) return rtrim($env, '/\\');
    // Development: the repository's data/ folder next to api/.
    $repoData = dirname(__DIR__, 2) . '/data';
    if (is_dir($repoData) && file_exists(dirname(__DIR__, 2) . '/package.json')) return $repoData;
    // Hosting: api/ sits in the site folder (~/www/<site>/api), data lives outside the web root in ~/liveflow-data.
    return dirname(__DIR__, 4) . '/liveflow-data';
}
