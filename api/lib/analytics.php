<?php

function liveflow_average(array $values): float
{
    return $values ? array_sum($values) / count($values) : 0.0;
}

function liveflow_round1(float $n): float
{
    return round($n * 10) / 10;
}

function liveflow_ms(string $iso): float
{
    return (float)strtotime($iso) * 1000 + (float)substr($iso, 20, 3);
}

/** Dashboard numbers: totals, CSAT, per-agent metrics and the last 7 days. */
function compute_analytics(array $db, array $onlineAgentIds): array
{
    $convs = $db['conversations'];
    $messages = $db['messages'];
    usort($messages, function ($a, $b) { return strcmp($a['created_at'], $b['created_at']); });

    $byConv = [];
    foreach ($messages as $m) $byConv[$m['conversation_id']][] = $m;

    // Seconds between the first visitor message and the first public agent reply after it.
    $responseTimes = [];
    foreach ($convs as $c) {
        $start = null;
        foreach ($byConv[$c['id']] ?? [] as $m) {
            if ($start === null) {
                if ($m['sender_type'] === 'visitor') $start = liveflow_ms($m['created_at']);
                continue;
            }
            if ($m['sender_type'] === 'agent' && empty($m['is_internal_note']) && liveflow_ms($m['created_at']) >= $start) {
                $responseTimes[$c['id']] = (liveflow_ms($m['created_at']) - $start) / 1000;
                break;
            }
        }
    }

    $total = count($convs);
    $open = $closed = 0;
    $ratings = [];
    foreach ($convs as $c) {
        if ($c['status'] === 'open') $open++;
        if ($c['status'] === 'closed') $closed++;
        if (isset($c['rating']) && is_int($c['rating'])) $ratings[] = $c['rating'];
    }

    $breakdown = [];
    foreach ([5, 4, 3, 2, 1] as $stars) {
        $count = count(array_filter($ratings, function ($r) use ($stars) { return $r === $stars; }));
        $breakdown[] = [
            'score' => $stars,
            'stars' => str_repeat('★', $stars) . str_repeat('☆', 5 - $stars),
            'count' => $count,
            'percentage' => $ratings ? (int)round($count / count($ratings) * 100) : 0,
        ];
    }

    $agentMetrics = [];
    foreach ($db['users'] as $u) {
        $mine = array_filter($convs, function ($c) use ($u) { return ($c['assigned_to'] ?? null) === $u['id']; });
        $resolved = count(array_filter($mine, function ($c) { return $c['status'] === 'closed'; }));
        $myRatings = [];
        $myResponses = [];
        foreach ($mine as $c) {
            if (isset($c['rating']) && is_int($c['rating'])) $myRatings[] = $c['rating'];
            if (isset($responseTimes[$c['id']])) $myResponses[] = $responseTimes[$c['id']];
        }
        $agentMetrics[] = [
            'agent_id' => $u['id'],
            'full_name' => $u['full_name'],
            'username' => $u['username'],
            'avatar_url' => $u['avatar_url'] ?? null,
            'conversations_handled' => count($mine),
            'resolved_count' => $resolved,
            'resolution_rate_percent' => $mine ? (int)round($resolved / count($mine) * 100) : 0,
            'avg_first_response_seconds' => (int)round(liveflow_average($myResponses)),
            'avg_csat_score' => liveflow_round1(liveflow_average($myRatings)),
            'total_ratings' => count($myRatings),
            'is_online' => in_array($u['id'], $onlineAgentIds, true),
        ];
    }

    $msgsPerDay = [];
    foreach ($messages as $m) {
        $k = substr($m['created_at'], 0, 10);
        $msgsPerDay[$k] = ($msgsPerDay[$k] ?? 0) + 1;
    }

    $historical = [];
    $daily = [];
    for ($i = 6; $i >= 0; $i--) {
        $t = strtotime("-$i day");
        $key = gmdate('Y-m-d', $t);
        $label = gmdate('D, n/j', $t);

        $created = array_filter($convs, function ($c) use ($key) { return substr($c['created_at'], 0, 10) === $key; });
        $resolvedThatDay = count(array_filter($convs, function ($c) use ($key) {
            return !empty($c['closed_at']) && substr($c['closed_at'], 0, 10) === $key;
        }));
        $dayResponses = [];
        foreach ($created as $c) if (isset($responseTimes[$c['id']])) $dayResponses[] = $responseTimes[$c['id']];
        $dayRatings = [];
        foreach ($convs as $c) {
            if (!empty($c['rated_at']) && substr($c['rated_at'], 0, 10) === $key && isset($c['rating']) && is_int($c['rating'])) {
                $dayRatings[] = $c['rating'];
            }
        }
        $msgs = $msgsPerDay[$key] ?? 0;

        $historical[] = [
            'date' => $label,
            'total_conversations' => count($created),
            'resolved_conversations' => $resolvedThatDay,
            'messages_sent' => $msgs,
            'avg_response_time_minutes' => liveflow_round1(liveflow_average($dayResponses) / 60),
            'resolution_rate_percent' => $created ? min(100, (int)round($resolvedThatDay / count($created) * 100)) : 0,
            'csat_score' => liveflow_round1(liveflow_average($dayRatings)),
        ];
        $daily[] = ['date' => $label, 'conversations' => count($created), 'messages' => $msgs];
    }

    return [
        'total_conversations' => $total,
        'open_conversations' => $open,
        'closed_conversations' => $closed,
        'messages_today' => $msgsPerDay[gmdate('Y-m-d')] ?? 0,
        'avg_first_response_minutes' => liveflow_round1(liveflow_average(array_values($responseTimes)) / 60),
        'overall_csat_score' => liveflow_round1(liveflow_average($ratings)),
        'total_csat_responses' => count($ratings),
        'resolution_rate_percent' => $total ? (int)round($closed / $total * 100) : 0,
        'csat_breakdown' => $breakdown,
        'agent_metrics' => $agentMetrics,
        'historical_data' => $historical,
        'daily_stats' => $daily,
    ];
}
