import type { AgentMetric, AnalyticsSummary, CSATBreakdown, HistoricalDataPoint, Message } from '../src/types';
import type { ConversationRecord, DbState } from './db';

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const dayKey = (iso: string) => iso.slice(0, 10);

/** Seconds between the first visitor message and the first public agent reply after it. */
function firstResponseSeconds(conv: ConversationRecord, messagesByConv: Map<string, Message[]>): number | null {
  const msgs = messagesByConv.get(conv.id) || [];
  const firstVisitor = msgs.find((m) => m.sender_type === 'visitor');
  if (!firstVisitor) return null;
  const start = new Date(firstVisitor.created_at).getTime();
  const reply = msgs.find(
    (m) => m.sender_type === 'agent' && !m.is_internal_note && new Date(m.created_at).getTime() >= start
  );
  if (!reply) return null;
  return (new Date(reply.created_at).getTime() - start) / 1000;
}

export function computeAnalytics(state: DbState, onlineAgentIds: string[]): AnalyticsSummary {
  const convs = state.conversations;
  const messagesByConv = new Map<string, Message[]>();
  for (const m of [...state.messages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!messagesByConv.has(m.conversation_id)) messagesByConv.set(m.conversation_id, []);
    messagesByConv.get(m.conversation_id)!.push(m);
  }

  const responseTimes = new Map<string, number>();
  for (const c of convs) {
    const s = firstResponseSeconds(c, messagesByConv);
    if (s !== null) responseTimes.set(c.id, s);
  }

  const total = convs.length;
  const open = convs.filter((c) => c.status === 'open').length;
  const closed = convs.filter((c) => c.status === 'closed').length;
  const today = dayKey(new Date().toISOString());
  const ratings = convs.filter((c) => typeof c.rating === 'number').map((c) => c.rating as number);

  const csatBreakdown: CSATBreakdown[] = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((r) => r === stars).length;
    return {
      score: stars,
      stars: '★'.repeat(stars) + '☆'.repeat(5 - stars),
      count,
      percentage: ratings.length ? Math.round((count / ratings.length) * 100) : 0,
    };
  });

  const agentMetrics: AgentMetric[] = state.users.map((u) => {
    const mine = convs.filter((c) => c.assigned_to === u.id);
    const resolved = mine.filter((c) => c.status === 'closed').length;
    const myRatings = mine.filter((c) => typeof c.rating === 'number').map((c) => c.rating as number);
    const myResponses = mine.filter((c) => responseTimes.has(c.id)).map((c) => responseTimes.get(c.id)!);
    return {
      agent_id: u.id,
      full_name: u.full_name,
      username: u.username,
      avatar_url: u.avatar_url,
      conversations_handled: mine.length,
      resolved_count: resolved,
      resolution_rate_percent: mine.length ? Math.round((resolved / mine.length) * 100) : 0,
      avg_first_response_seconds: Math.round(average(myResponses)),
      avg_csat_score: round1(average(myRatings)),
      total_ratings: myRatings.length,
      is_online: onlineAgentIds.includes(u.id),
    };
  });

  const historicalData: HistoricalDataPoint[] = [];
  const dailyStats: AnalyticsSummary['daily_stats'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

    const created = convs.filter((c) => dayKey(c.created_at) === key);
    const resolvedThatDay = convs.filter((c) => c.closed_at && dayKey(c.closed_at) === key).length;
    const msgs = state.messages.filter((m) => dayKey(m.created_at) === key).length;
    const dayResponses = created.filter((c) => responseTimes.has(c.id)).map((c) => responseTimes.get(c.id)!);
    const dayRatings = convs
      .filter((c) => c.rated_at && dayKey(c.rated_at) === key && typeof c.rating === 'number')
      .map((c) => c.rating as number);

    historicalData.push({
      date: label,
      total_conversations: created.length,
      resolved_conversations: resolvedThatDay,
      messages_sent: msgs,
      avg_response_time_minutes: round1(average(dayResponses) / 60),
      resolution_rate_percent: created.length ? Math.min(100, Math.round((resolvedThatDay / created.length) * 100)) : 0,
      csat_score: round1(average(dayRatings)),
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
    resolution_rate_percent: total ? Math.round((closed / total) * 100) : 0,
    csat_breakdown: csatBreakdown,
    agent_metrics: agentMetrics,
    historical_data: historicalData,
    daily_stats: dailyStats,
  };
}
