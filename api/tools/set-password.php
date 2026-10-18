<?php
/**
 * Sets a staff account's password from the command line (SSH), e.g.:
 *   php ~/www/livechat/api/tools/set-password.php admin
 * Creates an administrator with that username when the account does not exist.
 */

// Command line only (some hosts' `php` is php-cgi, so check for a web request rather than the SAPI name).
if (isset($_SERVER['REQUEST_METHOD'])) {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/store.php';

$username = strtolower(trim($argv[1] ?? ''));
if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
    fwrite(STDERR, "Usage: php set-password.php <username>\n");
    exit(1);
}

function prompt_hidden(string $label): string
{
    fwrite(STDOUT, $label);
    $hide = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec');
    if ($hide) shell_exec('stty -echo 2>/dev/null');
    $value = rtrim((string)fgets(STDIN), "\r\n");
    if ($hide) shell_exec('stty echo 2>/dev/null');
    fwrite(STDOUT, "\n");
    return $value;
}

$password = prompt_hidden('New password: ');
if (strlen($password) < 6) {
    fwrite(STDERR, "Password must be at least 6 characters.\n");
    exit(1);
}
if (prompt_hidden('Repeat password: ') !== $password) {
    fwrite(STDERR, "Passwords do not match.\n");
    exit(1);
}

$store = new Store(data_dir());
$db = &$store->db();
$found = false;
foreach ($db['users'] as &$user) {
    if ($user['username'] !== $username) continue;
    $user['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    $user['is_active'] = true;
    $found = true;
    $id = $user['id'];
    // Sign the account out everywhere.
    $db['sessions'] = array_values(array_filter($db['sessions'], function ($s) use ($id) { return $s['subject_id'] !== $id; }));
}
unset($user);

if (!$found) {
    $db['users'][] = [
        'id' => new_id('user'),
        'username' => $username,
        'full_name' => $username,
        'role' => 'admin',
        'is_active' => true,
        'avatar_url' => null,
        'created_at' => now_iso(),
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ];
}

$store->markDirty();
$store->flush();
echo $found ? "Password updated for \"$username\".\n" : "Created administrator \"$username\".\n";
echo 'Data folder: ' . $store->dir . "\n";
