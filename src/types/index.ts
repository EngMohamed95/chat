export type UserRole = 'admin' | 'agent';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string | null;
  created_at: string;
}

export interface WorkingHours {
  enabled: boolean;
  start: string; // "09:00"
  end: string;   // "18:00"
  timezone: string;
}

export interface Settings {
  id: string;
  company_name: string;
  logo_url?: string | null;
  primary_color: string;
  welcome_message: string;
  offline_message: string;
  working_hours: WorkingHours;
  widget_position: 'bottom-right' | 'bottom-left';
  prechat_enabled: boolean;
  updated_at: string;
}

export interface VisitorMetadata {
  current_url?: string;
  referrer?: string;
  browser?: string;
  os?: string;
  device?: string;
  country?: string;
  ip?: string;
  first_seen_at?: string;
}

export interface Conversation {
  id: string;
  visitor_id: string;
  visitor_name?: string | null;
  visitor_contact?: string | null;
  status: 'open' | 'closed';
  assigned_to?: string | null;
  last_message?: string | null;
  last_message_at: string;
  unread_for_agent: number;
  unread_for_visitor: number;
  metadata: VisitorMetadata;
  rating?: number | null; // 1-5 CSAT score
  rating_feedback?: string | null;
  rated_at?: string | null;
  created_at: string;
  assignee?: Profile;
}

export interface AgentMetric {
  agent_id: string;
  full_name: string;
  username: string;
  avatar_url?: string | null;
  conversations_handled: number;
  resolved_count: number;
  resolution_rate_percent: number;
  avg_first_response_seconds: number;
  avg_csat_score: number; // e.g. 4.8
  total_ratings: number;
  is_online: boolean;
}

export interface CSATBreakdown {
  score: number;
  stars: string;
  count: number;
  percentage: number;
}

export interface HistoricalDataPoint {
  date: string;
  total_conversations: number;
  resolved_conversations: number;
  messages_sent: number;
  avg_response_time_minutes: number;
  resolution_rate_percent: number;
  csat_score: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'visitor' | 'agent' | 'system';
  sender_id?: string | null;
  content: string;
  attachment_url?: string | null;
  is_internal_note: boolean;
  seen: boolean;
  created_at: string;
}

export interface CannedReply {
  id: string;
  title: string;
  content: string;
  created_by?: string | null;
  created_at: string;
}

export interface AnalyticsSummary {
  total_conversations: number;
  open_conversations: number;
  closed_conversations: number;
  messages_today: number;
  avg_first_response_minutes: number;
  overall_csat_score: number;
  total_csat_responses: number;
  resolution_rate_percent: number;
  csat_breakdown: CSATBreakdown[];
  agent_metrics: AgentMetric[];
  historical_data: HistoricalDataPoint[];
  daily_stats: {
    date: string;
    conversations: number;
    messages: number;
  }[];
}
