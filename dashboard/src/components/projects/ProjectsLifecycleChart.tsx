import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/lib/constants/colors';
import type { ProjectLifecycleWeek } from '@/lib/types';

const C = CHART_COLORS.projectLifecycle;

interface ProjectsLifecycleChartProps {
  weeks: ProjectLifecycleWeek[];
  isLoading?: boolean;
}

function fmtWeek(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ChartRow extends ProjectLifecycleWeek {
  label: string;
  newly_dropped_neg: number;
}

interface LifecycleTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}

function LifecycleTooltip({ active, payload }: LifecycleTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const buckets = [
    { label: 'Active', value: row.active, color: C.active },
    { label: 'Reactivated', value: row.reactivated, color: C.reactivated },
    { label: 'Dropped', value: row.dropped, color: C.dropped },
  ];

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{row.label}</div>
      <div className="space-y-0.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: b.color }} />
              {b.label}
            </span>
            <span className="font-medium tabular-nums">{b.value}</span>
          </div>
        ))}
      </div>
      {(row.started > 0 || row.newly_dropped > 0) && (
        <div className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[11px]">
          {row.started > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span style={{ color: C.started }}>Started / reactivated this week</span>
              <span className="font-medium text-foreground">{row.started}</span>
            </div>
          )}
          {row.newly_dropped > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span style={{ color: C.dropped_event }}>Dropped this week</span>
              <span className="font-medium text-foreground">{row.newly_dropped}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectsLifecycleChart({ weeks, isLoading }: ProjectsLifecycleChartProps) {
  const chartData: ChartRow[] = weeks.map((w) => ({
    ...w,
    label: fmtWeek(w.week),
    newly_dropped_neg: -w.newly_dropped,
  }));

  const maxCumulative = chartData.reduce((m, d) => Math.max(m, d.active + d.reactivated + d.dropped), 0);
  const maxDelta = chartData.reduce((m, d) => Math.max(m, d.started, d.newly_dropped), 0) || 1;

  return (
    <Card>
      <CardHeader className="space-y-0.5 pb-1">
        <CardTitle className="text-sm font-medium">Project Lifecycle</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Cumulative active / reactivated / dropped projects since your first session · full history
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          {isLoading || chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Loading project lifecycle…' : 'No project history yet'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  interval={Math.max(0, Math.ceil(chartData.length / 10) - 1)}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, Math.ceil(maxCumulative * 1.08) || 1]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  width={32}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[-maxDelta - 1, maxDelta + 1]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  width={28}
                />
                <Tooltip content={<LifecycleTooltip />} cursor={{ fill: 'currentColor', opacity: 0.05 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="active"
                  stackId="lifecycle"
                  stroke={C.active}
                  fill={C.active}
                  fillOpacity={0.7}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="reactivated"
                  stackId="lifecycle"
                  stroke={C.reactivated}
                  fill={C.reactivated}
                  fillOpacity={0.7}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="dropped"
                  stackId="lifecycle"
                  stroke={C.dropped}
                  fill={C.dropped}
                  fillOpacity={0.5}
                />
                <Bar yAxisId="right" dataKey="started" fill={C.started} maxBarSize={5} />
                <Bar yAxisId="right" dataKey="newly_dropped_neg" fill={C.dropped_event} maxBarSize={5} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {chartData.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {[
              { label: 'Active', color: C.active },
              { label: 'Reactivated', color: C.reactivated },
              { label: 'Dropped', color: C.dropped },
              { label: 'Started / reactivated (weekly)', color: C.started },
              { label: 'Dropped (weekly)', color: C.dropped_event },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
