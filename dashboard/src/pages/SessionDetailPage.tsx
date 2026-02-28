import { useState, useMemo } from 'react';
import { useParams } from 'react-router';
import { useSession, useSessionMutation } from '@/hooks/useSessions';
import { useInsights } from '@/hooks/useInsights';
import { useMessages } from '@/hooks/useMessages';
import {
  getSessionTitle,
  formatDuration,
  formatDurationMinutes,
  formatDateRange,
  formatModelName,
  cn,
} from '@/lib/utils';
import { SESSION_CHARACTER_COLORS, SESSION_CHARACTER_LABELS, SOURCE_TOOL_COLORS } from '@/lib/constants/colors';
import { parseJsonField } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InsightCard } from '@/components/insights/InsightCard';
import { PromptQualityCard } from '@/components/insights/PromptQualityCard';
import { AnalyzeDropdown } from '@/components/analysis/AnalyzeDropdown';
import { RenameSessionDialog } from '@/components/sessions/RenameSessionDialog';
import { ChatConversation } from '@/components/chat/conversation/ChatConversation';
import {
  MessageSquare,
  Wrench,
  Clock,
  Pencil,
  Sparkles,
  X,
  FileText,
  BookOpen,
  GitCommit,
  BarChart2,
  ChevronRight,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading: loading, error } = useSession(id);
  const { data: insights = [] } = useInsights({ sessionId: id });
  const messagesQuery = useMessages(id);
  const sessionMutation = useSessionMutation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);

  // Flatten paginated messages
  const messages = messagesQuery.data?.pages.flat() ?? [];
  const loadingMessages = messagesQuery.isLoading;
  const loadingMore = messagesQuery.isFetchingNextPage;
  const hasMore = messagesQuery.hasNextPage ?? false;

  const allInsightIds = useMemo(() => new Set(insights.map((i) => i.id)), [insights]);

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="shrink-0 border-b px-6 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border px-3 py-2.5">
                <Skeleton className="h-6 w-16 mx-auto" />
                <Skeleton className="h-3 w-12 mx-auto mt-1" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Session not found'}
          </p>
        </div>
      </div>
    );
  }

  const nonPromptInsights = insights.filter(
    (i) => i.type !== 'prompt_quality' && i.type !== 'summary'
  );
  const hasPromptQuality = insights.some((i) => i.type === 'prompt_quality');

  const summaryInsight = insights.find((i) => i.type === 'summary');
  const summaryText = session.summary || summaryInsight?.content;
  const summaryBulletsRaw = summaryInsight
    ? parseJsonField<string[]>(summaryInsight.bullets, [])
    : [];
  const summaryBullets =
    summaryBulletsRaw.length > 0
      ? summaryBulletsRaw
      : session.summary
        ? session.summary
            .split('\n')
            .filter((l) => l.startsWith('- '))
            .map((l) => l.slice(2))
        : [];
  const summaryTitle =
    summaryInsight?.title ||
    (session.summary
      ? session.summary.split('\n').find((l) => !l.startsWith('- '))?.trim() ||
        'Session Summary'
      : 'Session Summary');

  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  const characterColor = session.session_character
    ? SESSION_CHARACTER_COLORS[session.session_character]
    : null;
  const characterLabel = session.session_character
    ? SESSION_CHARACTER_LABELS[session.session_character]
    : null;

  const modelsUsed = parseJsonField<string[]>(session.models_used, []);

  function handleExport(format: 'plain' | 'obsidian' | 'notion') {
    const title = getSessionTitle(session!);
    const dateStr = startedAt.toISOString().slice(0, 10);
    const lines: string[] = [];

    if (format === 'obsidian') {
      lines.push(`# ${title}`, '', `> [!info]`);
      lines.push(
        `> Date: ${dateStr}  `,
        `> Duration: ${formatDurationMinutes(durationMinutes)}  `,
        `> Project: ${session!.project_name}`
      );
    } else {
      lines.push(
        `# ${title}`,
        '',
        `**Date:** ${dateStr}  `,
        `**Duration:** ${formatDurationMinutes(durationMinutes)}  `,
        `**Project:** ${session!.project_name}`
      );
    }

    if (summaryText) {
      lines.push('', '## Summary', '', summaryText);
    }
    if (insights.length > 0) {
      lines.push('', '## Insights');
      for (const insight of insights.filter((i) => i.type !== 'summary')) {
        lines.push('', `### ${insight.title} (${insight.type})`, '', insight.content);
      }
    }

    const content = lines.join('\n');
    const projectSlug = session!.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `session-${projectSlug}-${dateStr}.md`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format === 'plain' ? 'Markdown' : format}`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Compact header */}
      <div className="shrink-0 border-b px-6 py-3 space-y-2">
        {/* Row 1: Title + character badge + rename + analyze */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold leading-tight">{getSessionTitle(session)}</h1>
          {characterLabel && characterColor && (
            <Badge variant="outline" className={cn('text-xs shrink-0', characterColor)}>
              {characterLabel}
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setRenameOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Rename session</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Rename session</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-1">
            <AnalyzeDropdown
              session={session}
              onTitleSuggestion={setSuggestedTitle}
              hasExistingInsights={nonPromptInsights.length > 0}
              insightCount={nonPromptInsights.length}
              hasExistingPromptQuality={hasPromptQuality}
            />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="sr-only">Export session</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Export session</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('plain')}>
                  Export as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('obsidian')}>
                  Export for Obsidian
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('notion')}>
                  Export for Notion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Metadata */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{session.message_count} messages</span>
          <span>·</span>
          <Wrench className="h-3.5 w-3.5" />
          <span>{session.tool_call_count} tools</span>
          <span>·</span>
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDuration(startedAt, endedAt)}</span>
          <span>·</span>
          <span>{formatDateRange(startedAt, endedAt)}</span>
          <span>·</span>
          {session.git_remote_url ? (
            <a
              href={session.git_remote_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              {session.project_name}
            </a>
          ) : (
            <span>{session.project_name}</span>
          )}
          {session.source_tool && session.source_tool !== 'claude-code' && (
            <>
              <span>·</span>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs capitalize',
                  SOURCE_TOOL_COLORS[session.source_tool] ?? 'bg-muted text-muted-foreground'
                )}
              >
                {session.source_tool}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* AI Title Suggestion Banner */}
      {suggestedTitle && suggestedTitle !== getSessionTitle(session) && (
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-2.5 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span className="text-sm">
              AI suggests: <span className="font-medium">"{suggestedTitle}"</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await sessionMutation.mutateAsync({
                    id: session.id,
                    customTitle: suggestedTitle!,
                  });
                  toast.success('Session renamed successfully');
                  setSuggestedTitle(null);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : 'Failed to rename session'
                  );
                }
              }}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSuggestedTitle(null)}
              aria-label="Dismiss suggestion"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="shrink-0 bg-transparent border-b rounded-none h-auto w-full justify-start gap-4 px-6">
          <TabsTrigger
            value="overview"
            className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="conversation"
            className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Conversation ({session.message_count})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 p-6 space-y-6">
          {/* Summary */}
          {summaryText && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                <h3 className="text-sm font-medium">Summary</h3>
              </div>
              <div className="rounded-md bg-muted/20 px-4 py-3">
                <p className="font-medium text-sm mb-1.5">{summaryTitle}</p>
                {summaryBullets.length > 0 ? (
                  <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
                    {summaryBullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{summaryText}</p>
                )}
              </div>
            </div>
          )}

          {/* Session Vitals */}
          <div>
            <h3 className="text-sm font-medium mb-2">Session Vitals</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold">
                  {formatDurationMinutes(durationMinutes)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Duration</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold">{session.message_count}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Messages</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold">{session.tool_call_count}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Tool calls</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-center">
                {characterLabel && characterColor ? (
                  <>
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        characterColor.split(' ').find((c) => c.startsWith('text-'))
                      )}
                    >
                      {characterLabel}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Character</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-muted-foreground">—</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Character</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          {session.total_input_tokens != null && (
            <div>
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium group w-full">
                  <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  Usage Stats
                  {session.estimated_cost_usd != null && (
                    <span className="text-muted-foreground font-normal ml-1">
                      (${session.estimated_cost_usd.toFixed(2)})
                    </span>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6 pt-3">
                  <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Input tokens</span>
                      <span>{session.total_input_tokens?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Output tokens</span>
                      <span>{session.total_output_tokens?.toLocaleString()}</span>
                    </div>
                    {(session.cache_read_tokens ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache read tokens</span>
                        <span>{session.cache_read_tokens?.toLocaleString()}</span>
                      </div>
                    )}
                    {(session.cache_creation_tokens ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cache creation tokens</span>
                        <span>{session.cache_creation_tokens?.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>Estimated cost</span>
                      <span>${session.estimated_cost_usd?.toFixed(4)}</span>
                    </div>
                    {modelsUsed.length > 0 && (
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Models</span>
                        <span>{modelsUsed.map(formatModelName).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Insights */}
          {insights.filter((i) => i.type !== 'summary').length === 0 ? (
            <div className="rounded-lg border border-dashed">
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <BarChart2 className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium text-sm">This session hasn't been analyzed yet</p>
                <p className="text-xs text-muted-foreground">
                  Generate AI insights to extract learnings, decisions, and a session summary.
                </p>
                <div className="pt-2">
                  <AnalyzeDropdown
                    session={session}
                    onTitleSuggestion={setSuggestedTitle}
                    hasExistingInsights={false}
                    insightCount={0}
                    hasExistingPromptQuality={false}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {insights
                .filter((i) => i.type === 'prompt_quality')
                .map((insight) => (
                  <PromptQualityCard key={insight.id} insight={insight} />
                ))}

              {(() => {
                const learningInsights = insights.filter(
                  (i) => i.type === 'learning' || i.type === 'technique'
                );
                if (learningInsights.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Learnings</h3>
                      <Badge variant="secondary" className="text-xs">
                        {learningInsights.length}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {learningInsights.map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          showProject={false}
                          allInsightIds={allInsightIds}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const decisionInsights = insights.filter((i) => i.type === 'decision');
                if (decisionInsights.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <GitCommit className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Decisions</h3>
                      <Badge variant="secondary" className="text-xs">
                        {decisionInsights.length}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {decisionInsights.map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          showProject={false}
                          allInsightIds={allInsightIds}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </TabsContent>

        <TabsContent
          value="conversation"
          className="flex-1 overflow-y-auto mt-0 bg-muted/40 dark:bg-muted/20"
        >
          <ChatConversation
            messages={messages}
            loading={loadingMessages}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={() => messagesQuery.fetchNextPage()}
            sourceTool={session.source_tool}
          />
        </TabsContent>
      </Tabs>

      {/* Rename dialog */}
      <RenameSessionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        sessionId={session.id}
        currentTitle={getSessionTitle(session)}
      />
    </div>
  );
}
