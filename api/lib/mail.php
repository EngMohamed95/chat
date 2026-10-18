<?php
/**
 * Emails an agent's reply to a visitor who has left the website, so a question
 * asked and abandoned still gets its answer.
 */

/** A visitor counts as still on the site while its widget has polled within this many seconds. */
const VISITOR_ONLINE_SECONDS = 30;

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

/** Queues the reply email when the conversation has an email address and the visitor is not on the site. */
function queue_reply_email(array $conv, array $msg, array $settings, array $visitorSeen): void
{
    global $pendingMails;
    $to = trim((string)($conv['visitor_contact'] ?? ''));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    $seen = (int)($visitorSeen[$conv['visitor_id']] ?? 0);
    if (time() - $seen <= VISITOR_ONLINE_SECONDS) return;

    $company = (string)($settings['company_name'] ?? 'Support');
    $name = (string)($conv['visitor_name'] ?? '');
    $from = mail_sender($settings);
    $link = mail_safe_link((string)($conv['metadata']['current_url'] ?? ''), $from);
    $color = preg_match('/^#[0-9a-f]{3,8}$/i', (string)($settings['primary_color'] ?? '')) ? $settings['primary_color'] : '#10b981';
    $body = $msg['content'] !== '' ? nl2br(mail_escape($msg['content'])) : '📎 Attachment / مرفق';

    $button = $link === '' ? '' :
        '<p style="margin:24px 0 0"><a href="' . mail_escape($link) . '" style="background:' . $color . ';color:#fff;text-decoration:none;'
        . 'padding:10px 20px;border-radius:8px;display:inline-block;font-weight:bold">تابع المحادثة | Continue the chat</a></p>';

    $html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Tahoma,Arial,sans-serif">'
        . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;color:#18181b">'
        . '<h2 style="margin:0 0 16px;font-size:18px">' . mail_escape($company) . '</h2>'
        . '<p dir="auto" style="margin:0 0 12px">' . ($name !== '' ? 'مرحباً ' . mail_escape($name) . ' | Hello ' . mail_escape($name) : 'مرحباً | Hello') . '</p>'
        . '<p dir="auto" style="margin:0 0 8px;color:#52525b;font-size:13px">لديك رد جديد على محادثتك | You have a new reply to your chat:</p>'
        . '<div dir="auto" style="background:#f4f4f5;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.6">' . $body . '</div>'
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
