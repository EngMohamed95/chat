<?php
/**
 * Emails every public agent reply to the visitor as well, so a visitor who
 * closed the website still gets the answer.
 */

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

/** @param array[] $messages agent replies to include, oldest first */
function queue_reply_email(array $conv, array $messages, array $settings): void
{
    global $pendingMails;
    $to = trim((string)($conv['visitor_contact'] ?? ''));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return;

    $company = (string)($settings['company_name'] ?? 'Support');
    $name = (string)($conv['visitor_name'] ?? '');
    $from = mail_sender($settings);
    // The button opens the chat on this conversation, on the page it started from (or the site's home page).
    $page = mail_safe_link((string)($conv['metadata']['current_url'] ?? ''), $from);
    if ($page === '') $page = 'https://' . substr(strrchr($from, '@'), 1) . '/';
    $page = preg_replace('/#.*$/', '', $page);
    $link = $page . (strpos($page, '?') === false ? '?' : '&') . 'lf_chat=' . rawurlencode(resume_token($conv['id']));
    $color = preg_match('/^#[0-9a-f]{3,8}$/i', (string)($settings['primary_color'] ?? '')) ? $settings['primary_color'] : '#10b981';

    $bubbles = '';
    foreach ($messages as $msg) {
        $text = $msg['content'] !== '' ? nl2br(mail_escape($msg['content'])) : '📎 Attachment / مرفق';
        $bubbles .= '<div dir="auto" style="background:#f4f4f5;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.6;margin:0 0 8px">' . $text . '</div>';
    }
    $button = '<p style="margin:24px 0 0"><a href="' . mail_escape($link) . '" style="background:' . $color . ';color:#fff;text-decoration:none;'
        . 'padding:12px 22px;border-radius:8px;display:inline-block;font-weight:bold">افتح المحادثة ورد من الشات | Open the chat to reply</a></p>';

    $html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Tahoma,Arial,sans-serif">'
        . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;color:#18181b">'
        . '<h2 style="margin:0 0 16px;font-size:18px">' . mail_escape($company) . '</h2>'
        . '<p dir="auto" style="margin:0 0 12px">' . ($name !== '' ? 'مرحباً ' . mail_escape($name) . ' | Hello ' . mail_escape($name) : 'مرحباً | Hello') . '</p>'
        . '<p dir="auto" style="margin:0 0 8px;color:#52525b;font-size:13px">لديك رد جديد على محادثتك | You have a new reply to your chat:</p>'
        . $bubbles
        . $button
        . '<p dir="auto" style="margin:24px 0 0;color:#71717a;font-size:12px">للرد، افتح المحادثة من الزر أعلاه | To reply, open the chat with the button above.</p>'
        . '</div></body></html>';

    $pendingMails[] = [
        'to' => $to,
        'subject' => "رد جديد من $company | New reply from $company",
        'html' => $html,
        'from' => $from,
        'fromName' => $company,
    ];
}

/**
 * Sends one email with PHP's mail().
 * @param array{to:string,subject:string,html:string,from:string,fromName:string} $m
 * @return array{sent:bool,error:?string}
 */
function send_mail(array $m): array
{
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
        return ['sent' => true, 'error' => null];
    }
    if (!function_exists('mail')) return ['sent' => false, 'error' => 'mail() is disabled on this server'];
    error_clear_last();
    $sent = @mail($m['to'], $subject, $body, $headers, '-f' . $m['from']);
    // Some hosts refuse a custom envelope sender; try once more with their default.
    if (!$sent) $sent = @mail($m['to'], $subject, $body, $headers);
    $error = $sent ? null : (error_get_last()['message'] ?? 'mail() returned false');
    if (!$sent) error_log("LiveFlow: could not email {$m['to']}: $error");
    return ['sent' => $sent, 'error' => $error];
}

/** Sends the queued emails and records each outcome in data/mail_log.json (the last 30). */
function send_pending_mails(Store $store): void
{
    global $pendingMails;
    $results = [];
    foreach ($pendingMails as $m) {
        $r = send_mail($m);
        $results[] = ['at' => now_iso(), 'to' => $m['to'], 'sent' => $r['sent'], 'error' => $r['error']];
    }
    $pendingMails = [];
    $log = array_slice(array_merge($store->readSide('mail_log'), $results), -30);
    $store->writeSide('mail_log', $log);
    $store->unlock();
}
