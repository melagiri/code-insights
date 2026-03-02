import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDurationMinutes, formatModelName, formatTokenCount } from '@/lib/utils';
import {
  MessageSquare,
  Wrench,
  Clock,
  FolderOpen,
  Zap,
  Coins,
  DollarSign,
  Cpu,
} from 'lucide-react';

interface StatsHeroProps {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  totalDurationMin: number;
  totalProjects: number;
  isExact: boolean;
  totalTokens?: number;
  totalCost?: number;
  topModel?: string | null;
  tokenBreakdown?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function StatsHero({
  totalSessions,
  totalMessages,
  totalToolCalls,
  totalDurationMin,
  totalProjects,
  isExact,
  totalTokens,
  totalCost,
  topModel,
  tokenBreakdown,
}: StatsHeroProps) {
  const showUsage = (totalTokens ?? 0) > 0 || (totalCost ?? 0) > 0;

  const coreCell = (
    key: string,
    label: string,
    value: string,
    Icon: React.ElementType
  ) => (
    <div
      key={key}
      className="flex-1 min-w-[100px] px-3 py-2 border-r border-border last:border-r-0"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-base font-bold text-primary">{value}</div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap">
          {coreCell('sessions', 'Sessions', formatCompact(totalSessions), Zap)}
          {coreCell('messages', 'Messages', `${!isExact ? '~' : ''}${formatCompact(totalMessages)}`, MessageSquare)}
          {coreCell('toolCalls', 'Tool Calls', `${!isExact ? '~' : ''}${formatCompact(totalToolCalls)}`, Wrench)}
          {coreCell('duration', 'Coding Time', `${!isExact ? '~' : ''}${formatDurationMinutes(totalDurationMin)}`, Clock)}
          <div
            className={`flex-1 min-w-[100px] px-3 py-2 ${showUsage ? 'border-r border-border' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <FolderOpen className="h-3 w-3" />
              <span className="text-[11px] font-medium uppercase tracking-wide">Projects</span>
            </div>
            <div className="text-base font-bold text-primary">{totalProjects}</div>
          </div>

          {showUsage && (
            <>
              <div className="flex-1 min-w-[100px] px-3 py-2 border-r border-border last:border-r-0">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                  <Coins className="h-3 w-3" />
                  <span className="text-[11px] font-medium uppercase tracking-wide">Tokens</span>
                </div>
                {tokenBreakdown ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="text-base font-bold text-primary cursor-default"
                        aria-label="Token breakdown"
                      >
                        {formatTokenCount(totalTokens ?? 0)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs space-y-0.5">
                      <p>Input: {formatTokenCount(tokenBreakdown.inputTokens)}</p>
                      <p>Output: {formatTokenCount(tokenBreakdown.outputTokens)}</p>
                      <p>Cache Write: {formatTokenCount(tokenBreakdown.cacheCreationTokens)}</p>
                      <p>Cache Read: {formatTokenCount(tokenBreakdown.cacheReadTokens)}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="text-base font-bold text-primary">
                    {formatTokenCount(totalTokens ?? 0)}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-[100px] px-3 py-2 border-r border-border last:border-r-0">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                  <DollarSign className="h-3 w-3" />
                  <span className="text-[11px] font-medium uppercase tracking-wide">Cost</span>
                </div>
                <div className="text-base font-bold text-primary">
                  ${(totalCost ?? 0).toFixed(2)}
                </div>
              </div>

              {topModel && (
                <div className="flex-1 min-w-[100px] px-3 py-2 last:border-r-0">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                    <Cpu className="h-3 w-3" />
                    <span className="text-[11px] font-medium uppercase tracking-wide">Top Model</span>
                  </div>
                  <div className="text-base font-bold text-primary">
                    {formatModelName(topModel)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
