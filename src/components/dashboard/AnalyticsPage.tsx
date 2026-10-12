import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  Star,
  Users,
  TrendingUp,
  Download,
  Calendar,
  Sparkles,
  Award,
} from 'lucide-react';
import { AnalyticsSummary } from '../../types';
import { liveflowService } from '../../lib/api';
import { Avatar } from '../common/Avatar';
import { useSettings } from '../../context/SettingsContext';

const CSAT_COLORS = ['#10b981', '#34d399', '#fbbf24', '#f97316', '#ef4444'];

export const AnalyticsPage: React.FC = () => {
  const { t, isDark } = useSettings();
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    let isMounted = true;
    liveflowService.getAnalytics().then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-zinc-400">
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const gridColor = isDark ? '#27272a' : '#f4f4f5';
  const textColor = isDark ? '#a1a1aa' : '#71717a';

  return (
    <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950 p-6 overflow-y-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Support Performance & Analytics</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time metrics, Customer Satisfaction (CSAT) telemetry, agent response benchmarks, and conversation volume.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Filter */}
          <div className="flex p-0.5 bg-zinc-200/80 dark:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  timeRange === r
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs font-semibold'
                    : 'hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `liveflow-analytics-${Date.now()}.json`;
              a.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CSAT Score Card */}
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span>Overall CSAT Rating</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {data.overall_csat_score.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-400">/ 5.0</span>
            <span className="ml-auto text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              +0.2 vs last wk
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">
            Based on {data.total_csat_responses} verified visitor ratings
          </p>
        </div>

        {/* First Response Time */}
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span>Avg First Response</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {data.avg_first_response_minutes}m
            </span>
            <span className="text-xs text-zinc-400">({Math.round(data.avg_first_response_minutes * 60)}s)</span>
            <span className="ml-auto text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              Industry top 5%
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">Target benchmark: &lt; 2 minutes</p>
        </div>

        {/* Resolution Rate */}
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span>Resolution Rate</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {data.resolution_rate_percent}%
            </span>
            <span className="text-xs text-zinc-400">resolved</span>
            <span className="ml-auto text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              {data.closed_conversations} closed
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">
            {data.open_conversations} tickets currently open
          </p>
        </div>

        {/* Volume Today */}
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span>Messages Today</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {data.messages_today}
            </span>
            <span className="text-xs text-zinc-400">exchanged</span>
            <span className="ml-auto text-[11px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
              {data.total_conversations} total chats
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">Active customer communication</p>
        </div>
      </div>

      {/* Row 1 Charts: Volume Trend & CSAT Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Historical Conversation Volume Chart */}
        <div className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Conversation Volume & Resolution History
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Total incoming visitor threads vs successfully resolved tickets
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Total Chats
              </span>
              <span className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400"></span> Resolved
              </span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.historical_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 11 }} />
                <YAxis tick={{ fill: textColor, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#18181b' : '#ffffff',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total_conversations"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#totalGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved_conversations"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#resGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CSAT Distribution Breakdown */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Customer Satisfaction (CSAT) Breakdown
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">Distribution across post-chat rating surveys</p>

            <div className="space-y-3 mt-5">
              {data.csat_breakdown.map((item, idx) => (
                <div key={item.score} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                      <span className="text-amber-500 font-bold">{item.score}★</span>
                      <span className="text-zinc-400 text-[11px]">({item.count} ratings)</span>
                    </div>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{item.percentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: CSAT_COLORS[idx % CSAT_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Positive Sentiment:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {(data.csat_breakdown.slice(0, 2).reduce((a, b) => a + b.percentage, 0))}% (4-5 stars)
            </span>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: First Response Time Trend & Resolution Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* First Response Time Trend (LineChart) */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                First Response Time Trend (Minutes)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Average time until an agent replies to a new inquiry</p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg">
              Avg 1.4m
            </span>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.historical_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 11 }} />
                <YAxis tick={{ fill: textColor, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#18181b' : '#ffffff',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_response_time_minutes"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f59e0b' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resolution Rate Trend (BarChart) */}
        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Resolution Rate % By Day
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Percentage of conversations resolved satisfactorily</p>
            </div>
            <span className="text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-lg">
              Goal &gt; 85%
            </span>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.historical_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: textColor, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#18181b' : '#ffffff',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="resolution_rate_percent" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Detailed Agent Performance Metrics Table */}
      <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>Detailed Agent Performance Metrics</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Individual staff benchmarks, response speed, resolution efficiency, and customer satisfaction ratings.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="pb-3 pl-1">Agent</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-center">Handled</th>
                <th className="pb-3 text-center">Resolved</th>
                <th className="pb-3 text-center">Resolution Rate</th>
                <th className="pb-3 text-center">Avg Response</th>
                <th className="pb-3 text-right pr-2">CSAT Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {data.agent_metrics.map((ag) => (
                <tr key={ag.agent_id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-850/50 transition-colors">
                  <td className="py-3 pl-1 flex items-center gap-2.5">
                    <Avatar
                      name={ag.full_name}
                      url={ag.avatar_url}
                      className="w-8 h-8 border border-zinc-200 dark:border-zinc-700"
                    />
                    <div>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">{ag.full_name}</p>
                      <p className="text-[10px] text-zinc-400">@{ag.username}</p>
                    </div>
                  </td>

                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        ag.is_online
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ag.is_online ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      {ag.is_online ? 'Online' : 'Away'}
                    </span>
                  </td>

                  <td className="py-3 text-center font-medium text-zinc-800 dark:text-zinc-200">
                    {ag.conversations_handled}
                  </td>

                  <td className="py-3 text-center text-teal-600 dark:text-teal-400 font-semibold">
                    {ag.resolved_count}
                  </td>

                  <td className="py-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${ag.resolution_rate_percent}%` }}
                        />
                      </div>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{ag.resolution_rate_percent}%</span>
                    </div>
                  </td>

                  <td className="py-3 text-center text-zinc-600 dark:text-zinc-300 font-mono">
                    {ag.avg_first_response_seconds}s
                  </td>

                  <td className="py-3 text-right pr-2">
                    <span className="inline-flex items-center gap-1 text-amber-500 font-bold bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-lg">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {ag.avg_csat_score.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
