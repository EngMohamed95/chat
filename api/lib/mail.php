<?php
/**
 * Emails agent replies to visitors who left the website without reading them,
 * so a question asked and abandoned still gets its answer.
 *
 * Each public agent reply schedules its conversation in the mail queue. The
 * queue is checked whenever anyone polls (agents poll constantly while the
 * dashboard is open): once a reply is due, it is emailed if the visitor has
 * not read it and is no longer on the site; if they are still there, it is
 * checked again a minute later.
 */

/** A visitor counts as still on the site while its widget has polled within this many seconds. */
const VISITOR_ONLINE_SECONDS = 30;
/** How long to wait for a visitor who is still on the site to read a reply before checking again. */
const MAIL_RECHECK_SECONDS = 60;
/** Unread replies older than this are no longer emailed. */
const MAIL_GIVE_UP_SECONDS = 24 * 3600;

/** @var array<int, array{to:string,subject:string,html:string,from:string,fromName:string}> */
$pendingMails = [];

function mail_escape(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/** Sender address: the configured notification email, or noreply@ the site's main domain. */
function mail_sender(array $settings): string
{
    $configured = $settings['notification_email'] ?? '';
    if (is_string($configured) && filter_var($configured, FILTER_VALIDATE_EMAIL)) return $configured;
    $host = preg_replace('/:\d+$/', '', strtolower((string)($_SERVER['HTTP_HOST'] ?? 'localhost')));
    $parts = explode('.', $host);
    $domain = count($parts) > 2 ? implode('.', array_slice($parts, -2)) : $host;
    $fallback = 'noreply@' . $domain;
    // The Host header comes from the client, so the result is validated before it reaches mail headers.
    return filter_var($fallback, FILTER_VALIDATE_EMAIL) ? $fallback : 'noreply@localhost';
}

/** The visitor's page link, only if it is on the sender's own domain (visitors control this value). */
function mail_safe_link(string $url, string $sender): string
{
    if (!preg_match('#^https?://#i', $url)) return '';
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    $domain = strtolower(substr(strrchr($sender, '@'), 1));
    $suffix = '.' . $domain;
    return $host === $domain || substr($host, -strlen($suffix)) === $suffix ? $url : '';
}

function visitor_is_online(array $visitorSeen, string $visitorId): bool
{
    return time() - (int)($visitorSeen[$visitorId] ?? 0) <= VISITOR_ONLINE_SECONDS;
}

/** Puts a conversation in the mail queue after an agent's public reply. */
function schedule_reply_email(Store $store, array $conv, array $msg, array $visitorSeen): void
{
    if (!filter_var(trim((string)($conv['visitor_contact'] ?? '')), FILTER_VALIDATE_EMAIL)) return;
    $queue = $store->readSide('mail_queue');
    $due = visitor_is_online($visitorSeen, $conv['visitor_id']) ? time() + MAIL_RECHECK_SECONDS : time();
    $entry = $queue[$conv['id']] ?? ['since' => $msg['created_at'], 'due' => $due];
    $entry['due'] = min((int)$entry['due'], $due);
    $queue[$conv['id']] = $entry;
    $store->writeSide('mail_queue', $queue);
}

/** Emails the due conversations whose visitors left without reading the replies. */
function process_mail_queue(Store $store): void
{
    $queue = $store->readSide('mail_queue');
    if (!$queue) return;
    $now = time();
    $due = array_filter($queue, function ($e) use ($now) { return (int)$e['due'] <= $now; });
    if (!$due) return;
    // Loaded only when something is due: visitors poll often and the queue is usually empty.
    $db = $store->db();

    $visitorSeen = $store->readSide('visitors');
    $convs = [];
    foreach ($db['conversations'] as $c) if (isset($due[$c['id']])) $convs[$c['id']] = $c;

    foreach ($due as $convId => $entry) {
        $conv = $convs[$convId] ?? null;
        $unread = [];
        if ($conv) {
            foreach ($db['messages'] as $m) {
                if ($m['conversation_id'] === $convId && $m['sender_type'] === 'agent' && empty($m['is_internal_note'])
                    && empty($m['seen']) && strcmp($m['created_at'], $entry['since']) >= 0) {
                    $unread[] = $m;
                }
            }
        }
        $tooOld = $now - strtotime($entry['since']) > MAIL_GIVE_UP_SECONDS;
        if (!$unread || $tooOld) {
            unset($queue[$convId]);
        } elseif (visitor_is_online($visitorSeen, $conv['visitor_id'])) {
            // Still on the site: they may yet read it in the chat.
            $queue[$convId]['due'] = $now + MAIL_RECHECK_SECONDS;
        } else {
            usort($unread, function ($a, $b) { return strcmp($a['created_at'], $b['created_at']); });
            queue_reply_email($conv, $unread, $db['settings']);
            unset($queue[$convId]);
        }
    }
    $store->writeSide('mail_queue', $queue);
}

/** @param array[] $messages unread agent replies, oldest first */
function queue_reply_email(array $conv, array $messages, array $settings): void
{
    global $pendingMails;
    $to = trim((string)($conv['visitor_contact'] ?? ''));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return;

    $company = (string)($settings['company_name'] ?? 'Support');
    $name = (string)($conv['visitor_name'] ?? '');
    $from = mail_sender($settings);
    $link = mail_safe_link((string)($conv['metadata']['current_url'] ?? ''), $from);
    $color = preg_match('/^#[0-9a-f]{3,8}$/i', (string)($settings['primary_color'] ?? '')) ? $settings['primary_color'] : '#10b981';

    $bubbles = '';
    foreach ($messages as $msg) {
        $text = $msg['content'] !== '' ? nl2br(mail_escape($msg['content'])) : '📎 Attachment / مرفق';
        $bubbles .= '<div dir="auto" style="background:#f4f4f5;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.6;margin:0 0 8px">' . $text . '</div>';
    }
    $button = $link === '' ? '' :
        '<p style="margin:24px 0 0"><a href="' . mail_escape($link) . '" style="background:' . $color . ';color:#fff;text-decoration:none;'
        . 'padding:10px 20px;border-radius:8px;display:inline-block;font-weight:bold">تابع المحادثة | Continue the chat</a></p>';

    $html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Tahoma,Arial,sans-serif">'
        . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;color:#18181b">'
        . '<h2 style="margin:0 0 16px;font-size:18px">' . mail_escape($company) . '</h2>'
        . '<p dir="auto" style="margin:0 0 12px">' . ($name !== '' ? 'مرحباً ' . mail_escape($name) . ' | Hello ' . mail_escape($name) : 'مرحباً | Hello') . '</p>'
        . '<p dir="auto" style="margin:0 0 8px;color:#52525b;font-size:13px">لديك رد جديد على محادثتك | You have a new reply to your chat:</p>'
        . $bubbles
        . $button
        . '<p dir="auto" style="margin:24px 0 0;color:#71717a;font-size:12px">يمكنك الرد على هذا البريد مباشرة | You can reply to this email directly.</p>'
        . '</div></body></html>';

    $pendingMails[] = [
        'to' => $to,
        'subject' => "رد جديد من $company | New reply from $company",
        'html' => $html,
        'from' => $from,
        'fromName' => $company,
    ];
}

/** Sends the queued emails. Runs after the response is sent and the data lock is released. */
function send_pending_mails(): void
{
    global $pendingMails;
    foreach ($pendingMails as $m) {
        $encode = function (string $s): string { return '=?UTF-8?B?' . base64_encode($s) . '?='; };
        $headers = implode("\r\n", [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            'From: ' . $encode($m['fromName']) . ' <' . $m['from'] . '>',
            'Reply-To: ' . $m['from'],
        ]);
        $body = chunk_split(base64_encode($m['html']));
        $subject = $encode($m['subject']);

        $logFile = getenv('LIVEFLOW_MAIL_LOG');
        if ($logFile) {
            // Development: write the email to a file instead of sending it.
            file_put_contents($logFile, "To: {$m['to']}\r\nSubject: $subject\r\n$headers\r\n\r\n{$m['html']}\r\n\r\n", FILE_APPEND);
            continue;
        }
        $sent = @mail($m['to'], $subject, $body, $headers, '-f' . $m['from']);
        // Some hosts refuse a custom envelope sender; try once more with their default.
        if (!$sent) $sent = @mail($m['to'], $subject, $body, $headers);
        if (!$sent) error_log("LiveFlow: could not email reply to {$m['to']}");
    }
    $pendingMails = [];
}
