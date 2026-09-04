import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CHART_COLORS } from '@/lib/constants/colors';
import { formatTokenCount } from '@/lib/utils';
import { formatCost } from '@/lib/cost-utils';
import type { ActivityDay } from '@/lib/types';

type DashboardRange = '7d' | '30d' | '90d' | 'all';
type MetricKey =
  | 'composite'
  | 'cognitive_load'
  | 'cost'
  | 'tokens'
  | 'tool_calls'
  | 'messages'
  | 'projects'
  | 'sessions';
type CompositeMode = 'weighted' | 'stacked';

interface DashboardActivityChartProps {
  days: ActivityDay[];
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  isLoading?: boolean;
}

const rangeOptions: { value: DashboardRange; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

// Metric config. Composite is a weighted blend of the keys in COMPOSITE_KEYS;
// `sessions` is deliberately excluded from the composite (a count, not effort).
// Weights match the reference design: cost .30, tokens .25, tool_calls .20,
// messages .15, projects .10 (sum = 1.0).
const M = CHART_COLORS.activityMetrics;
const METRICS: Record<MetricKey, { label: string; color: string; weight?: number; fmt: (n: number) => string }> = {
  composite:      { label: 'Composite score', color: M.composite,      fmt: (n) => n.toFixed(1) },
  cognitive_load: { label: 'Cognitive load',  color: M.cognitive_load, fmt: (n) => Math.round(n).toLocaleString() },
  cost:           { label: 'Cost (USD)',      color: M.cost,       weight: 0.30, fmt: formatCost },
  tokens:         { label: 'Tokens',          color: M.tokens,     weight: 0.25, fmt: formatTokenCount },
  tool_calls:     { label: 'Tool calls',      color: M.tool_calls, weight: 0.20, fmt: (n) => Math.round(n).toLocaleString() },
  messages:       { label: 'Messages',        color: M.messages,   weight: 0.15, fmt: (n) => Math.round(n).toLocaleString() },
  projects:       { label: 'Projects',        color: M.projects,   weight: 0.10, fmt: (n) => Math.round(n).toLocaleString() },
  sessions:       { label: 'Sessions',        color: M.sessions,   fmt: (n) => Math.round(n).toLocaleString() },
};
const METRIC_ORDER: MetricKey[] = ['composite', 'cognitive_load', 'cost', 'tokens', 'tool_calls', 'messages', 'projects', 'sessions'];
const COMPOSITE_KEYS = ['cost', 'tokens', 'tool_calls', 'messages', 'projects'] as const;
const TOTAL_W = COMPOSITE_KEYS.reduce((s, k) => s + (METRICS[k].weight ?? 0), 0);

type CompositeKey = (typeof COMPOSITE_KEYS)[number];
type NormFactors = Record<CompositeKey, number>;

function computeNormFactors(days: ActivityDay[]): NormFactors {
  const max = {} as NormFactors;
  for (const k of COMPOSITE_KEYS) {
    max[k] = days.reduce((m, d) => Math.max(m, d[k] || 0), 0) || 1;
  }
  return max;
}

// Weighted contribution of metric k for day d, in score points (0..100). The
// contributions sum to the composite score. Uses a FIXED reference (max across
// all-time days) so a day's score is stable regardless of the selected range.
function contribution(d: ActivityDay, k: CompositeKey, norm: NormFactors): number {
  return 100 * ((METRICS[k].weight ?? 0) / TOTAL_W) * ((d[k] || 0) / norm[k]);
}
function composite(d: ActivityDay, norm: NormFactors): number {
  return COMPOSITE_KEYS.reduce((s, k) => s + contribution(d, k, norm), 0);
}

function shortNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ChartRow extends ActivityDay {
  label: string;
  score: number;
  contrib_cost: number;
  contrib_tokens: number;
  contrib_tool_calls: number;
  contrib_messages: number;
  contrib_projects: number;
}

// Breakdown tooltip: headline score plus the raw metrics that feed it.
interface ActivityTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}
function ActivityTooltip({ active, payload }: ActivityTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const metrics: { label: string; value: string; color?: string }[] = [
    { label: 'Cognitive load', value: Math.round(row.cognitive_load).toLocaleString(), color: M.cognitive_load },
    { label: 'Cost', value: formatCost(row.cost), color: M.cost },
    { label: 'Tokens', value: formatTokenCount(row.tokens), color: M.tokens },
    { label: 'Tool calls', value: row.tool_calls.toLocaleString(), color: M.tool_calls },
    { label: 'Messages', value: row.messages.toLocaleString(), color: M.messages },
    { label: 'Projects', value: row.projects.toLocaleString(), color: M.projects },
    { label: 'Sessions', value: row.sessions.toLocaleString(), color: M.sessions },
  ];

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
        <span className="text-sm font-semibold" style={{ color: M.composite }}>
          {row.score.toFixed(1)}
          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">/100</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: m.color }} />
              {m.label}
            </span>
            <span className="font-medium tabular-nums">{m.value}</span>
          </div>
        ))}
      </div>
      {row.peak_sessions > 0 && (
        <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
          Peak multitasking: <span className="font-medium text-foreground">{row.peak_sessions}</span> session
          {row.peak_sessions !== 1 ? 's' : ''} across{' '}
          <span className="font-medium text-foreground">{row.peak_projects}</span> project
          {row.peak_projects !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

export function DashboardActivityChart({ days, range, onRangeChange, isLoading }: DashboardActivityChartProps) {
  const [metric, setMetric] = useState<MetricKey>('composite');
  const [compositeMode, setCompositeMode] = useState<CompositeMode>('weighted');

  const isComposite = metric === 'composite';
  const stacked = isComposite && compositeMode === 'stacked';

  // Fixed all-time reference — computed across ALL days, never the window.
  const norm = useMemo(() => computeNormFactors(days), [days]);

  // Window the series client-side; composite scores stay on the fixed reference.
  const windowed = useMemo(() => {
    if (range === 'all') return days;
    const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return days.slice(-n);
  }, [days, range]);

  const chartData = useMemo<ChartRow[]>(
    () =>
      windowed.map((d) => ({
        ...d,
        label: fmtDate(d.date),
        score: composite(d, norm),
        contrib_cost: contribution(d, 'cost', norm),
        contrib_tokens: contribution(d, 'tokens', norm),
        contrib_tool_calls: contribution(d, 'tool_calls', norm),
        contrib_messages: contribution(d, 'messages', norm),
        contrib_projects: contribution(d, 'projects', norm),
      })),
    [windowed, norm]
  );

  // Y-axis zooms to the min/max actually shown. Stacked must start at 0 (layers
  // sum to the whole); a single series zooms to [min, max] so the quietest day
  // sits near the floor and the busiest fills the frame.
  const [yMin, yMax] = useMemo<[number, number]>(() => {
    const vals = chartData.map((d) => (isComposite ? d.score : (d[metric] ?? 0)));
    if (vals.length === 0) return [0, 1];
    const maxShown = Math.max(...vals, 0);
    const minShown = Math.min(...vals);
    const baseline = stacked || minShown === maxShown ? 0 : minShown;
    let yTop = maxShown + (maxShown - baseline) * 0.08;
    if (yTop <= baseline) yTop = baseline + 1;
    return [baseline, yTop];
  }, [chartData, isComposite, metric, stacked]);

  const accent = METRICS[metric].color;
  const span = windowed.length;
  const dateSpan = span > 0 ? `${windowed[0].date} → ${windowed[span - 1].date}` : '';

  const tickFormatter = (v: number) => (isComposite ? v.toFixed(0) : shortNum(v));
  const xInterval = range === '7d' ? 0 : range === '30d' ? 4 : range === '90d' ? 13 : Math.ceil(span / 8);

  return (
    <Card>
      <CardHeader className="space-y-2 pb-1">
        <div className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {isComposite
                ? 'Composite = weighted blend of cost, tokens, tool calls, messages & projects · fixed all-time scale'
                : metric === 'cognitive_load'
                ? 'Context-switching load — concurrent sessions × projects², integrated over active time'
                : `Daily ${METRICS[metric].label.toLowerCase()}`}
              {dateSpan && ` · ${dateSpan}`}
            </p>
          </div>
          <div className="flex gap-1">
            {rangeOptions.map(({ value, label }) => (
              <Button
                key={value}
                variant={range === value ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => onRangeChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-row items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRIC_ORDER.map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: METRICS[k].color }} />
                    {METRICS[k].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isComposite && (
            <div className="flex overflow-hidden rounded-md border">
              {(['weighted', 'stacked'] as CompositeMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCompositeMode(mode)}
                  className={`px-2.5 py-1 text-xs capitalize transition-colors ${
                    compositeMode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          {isLoading || chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Loading activity…' : 'No activity data yet'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {stacked ? (
                // Stacked composite → bar chart (layers sum to the score)
                <BarChart data={chartData} barCategoryGap={span > 60 ? 1 : span > 30 ? '10%' : '20%'}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    interval={xInterval}
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    allowDataOverflow
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    width={38}
                    tickFormatter={tickFormatter}
                  />
                  <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'currentColor', opacity: 0.05 }} />
                  {COMPOSITE_KEYS.map((k) => (
                    <Bar key={k} dataKey={`contrib_${k}`} stackId="composite" fill={METRICS[k].color} />
                  ))}
                </BarChart>
              ) : (
                // Weighted composite & single metrics → area/line chart
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="activityAccentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accent} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    interval={xInterval}
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    allowDataOverflow
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    width={38}
                    tickFormatter={tickFormatter}
                  />
                  <Tooltip content={<ActivityTooltip />} cursor={{ stroke: accent, strokeOpacity: 0.3 }} />
                  <Area
                    type="monotone"
                    dataKey={isComposite ? 'score' : metric}
                    stroke={accent}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#activityAccentFill)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
        {/* Legend — stacked composite shows the weighted layers */}
        {stacked && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {COMPOSITE_KEYS.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: METRICS[k].color }} />
                {METRICS[k].label} ({Math.round((METRICS[k].weight ?? 0) * 100)}%)
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
