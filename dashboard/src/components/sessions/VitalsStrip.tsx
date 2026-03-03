import { formatDuration, formatModelName, formatTokenCount } from '@/lib/utils';
import { parseJsonField } from '@/lib/types';
import type { Session } from '@/lib/types';

interface VitalsStripProps {
  session: Session;
}

export function VitalsStrip({ session }: VitalsStripProps) {
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const modelsUsed = parseJsonField<string[]>(session.models_used, []);

  return (
    <div className="space-y-1.5">
      {/* Primary stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="Duration" value={formatDuration(startedAt, endedAt)} />
        <StatCell
          label="Messages"
          value={String(session.message_count)}
          sublabel={`${session.user_message_count} user · ${session.assistant_message_count} asst`}
        />
        <StatCell label="Tools" value={String(session.tool_call_count)} sublabel="calls" />
        <StatCell
          label="Cost"
          value={
            session.estimated_cost_usd != null
              ? `$${session.estimated_cost_usd.toFixed(2)}`
              : '--'
          }
        />
      </div>

      {/* Token breakdown + model row */}
      {session.total_input_tokens != null && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Tokens</span>
          <span>{formatTokenCount(session.total_input_tokens)} input</span>
          {(session.cache_read_tokens ?? 0) > 0 && (
            <>
              <span className="text-muted-foreground/30">&middot;</span>
              <span>{formatTokenCount(session.cache_read_tokens!)} cache</span>
            </>
          )}
          <span className="text-muted-foreground/30">&middot;</span>
          <span>{formatTokenCount(session.total_output_tokens ?? 0)} output</span>
          {modelsUsed.length > 0 && (
            <>
              <span className="text-muted-foreground/30">&middot;</span>
              <span className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                {modelsUsed.map(formatModelName).join(', ')}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      {sublabel && (
        <div className="text-[10px] text-muted-foreground/60 leading-tight">{sublabel}</div>
      )}
    </div>
  );
}
