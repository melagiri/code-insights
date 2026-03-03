import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SESSION_CHARACTER_COLORS, OUTCOME_DOT } from '@/lib/constants/colors';
import { formatDuration, getSessionTitle, cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import type { Session } from '@/lib/types';

const SOURCE_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  'codex-cli': 'Codex CLI',
  'copilot-cli': 'Copilot CLI',
  copilot: 'Copilot',
};

interface CompactSessionRowProps {
  session: Session;
  isActive: boolean;
  showProject: boolean;
  insightCounts?: Record<string, number>;
  outcome?: string;
  onClick: () => void;
}

export function CompactSessionRow({
  session,
  isActive,
  showProject,
  insightCounts,
  outcome,
  onClick,
}: CompactSessionRowProps) {
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const title = getSessionTitle(session);
  const characterColor = session.session_character
    ? (SESSION_CHARACTER_COLORS[session.session_character] ?? 'bg-muted text-muted-foreground')
    : null;

  const sourceLabel = session.source_tool
    ? (SOURCE_LABELS[session.source_tool] ?? session.source_tool)
    : null;

  const insightTotal = insightCounts
    ? Object.entries(insightCounts)
        .filter(([type]) => type !== 'summary')
        .reduce((sum, [, n]) => sum + n, 0)
    : 0;

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors border-l-2',
        isActive
          ? 'bg-accent/60 border-primary'
          : 'border-transparent hover:bg-accent/40'
      )}
    >
      {/* Title */}
      <p className="text-sm font-medium line-clamp-2 leading-snug">{title}</p>

      {/* Badges */}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {outcome && OUTCOME_DOT[outcome] && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('w-2 h-2 rounded-full shrink-0', OUTCOME_DOT[outcome].color)} />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{OUTCOME_DOT[outcome].label}</TooltipContent>
          </Tooltip>
        )}
        {session.session_character && characterColor && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${characterColor}`}>
            {session.session_character.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      {/* Metadata: source . messages . duration . cost . insights */}
      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/70 flex-wrap">
        {sourceLabel && (
          <>
            <span className="text-muted-foreground">{sourceLabel}</span>
            <span className="text-muted-foreground/30">&middot;</span>
          </>
        )}
        <span>{session.message_count} msgs</span>
        <span className="text-muted-foreground/30">&middot;</span>
        <span>{formatDuration(startedAt, endedAt)}</span>
        {session.estimated_cost_usd != null && (
          <>
            <span className="text-muted-foreground/30">&middot;</span>
            <span>${session.estimated_cost_usd.toFixed(2)}</span>
          </>
        )}
        {insightTotal > 0 && (
          <>
            <span className="text-muted-foreground/30">&middot;</span>
            <span className="flex items-center gap-0.5 text-purple-500/80">
              <Sparkles className="h-2.5 w-2.5" />
              {insightTotal}
            </span>
          </>
        )}
      </div>

      {/* Project name (only when "All Projects" selected) */}
      {showProject && (
        <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
          {session.project_name}
        </p>
      )}
    </button>
  );
}
