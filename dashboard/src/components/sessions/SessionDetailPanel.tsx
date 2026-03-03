import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSession, useSessionMutation } from '@/hooks/useSessions';
import { useInsights } from '@/hooks/useInsights';
import { useMessages } from '@/hooks/useMessages';
import {
  getSessionTitle,
  formatDurationMinutes,
  formatDateRange,
  cn,
} from '@/lib/utils';
import { SESSION_CHARACTER_COLORS, SESSION_CHARACTER_LABELS, SOURCE_TOOL_COLORS, OUTCOME_DOT } from '@/lib/constants/colors';
import { parseJsonField } from '@/lib/types';
import type { Insight, InsightMetadata } from '@/lib/types';
import { LearningContent, DecisionContent } from '@/components/insights/insight-metadata';
import { Badge } from '@/components/ui/badge';
import { ErrorCard } from '@/components/ErrorCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PromptQualityCard } from '@/components/insights/PromptQualityCard';
import { AnalyzeDropdown } from '@/components/analysis/AnalyzeDropdown';
import { AnalyzeButton } from '@/components/analysis/AnalyzeButton';
import { useAnalysis } from '@/components/analysis/AnalysisContext';
import { RenameSessionDialog } from '@/components/sessions/RenameSessionDialog';
import { VitalsStrip } from '@/components/sessions/VitalsStrip';
import { ChatConversation } from '@/components/chat/conversation/ChatConversation';
import { ConversationSearch } from '@/components/chat/conversation/ConversationSearch';
import {
  Clock,
  Pencil,
  Sparkles,
  X,
  FileText,
  BookOpen,
  GitBranch,
  GitCommit,
  GitPullRequest,
  BarChart2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

/** Per-item collapsible for learnings and decisions. Shows a 1-2 line preview
 *  with an expand toggle to reveal full structured metadata. */
function CollapsibleInsightItem({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false);
  const metadata = parseJsonField<InsightMetadata>(insight.metadata, {});

  // Build the preview text: use title if available, otherwise first ~120 chars of content
  const previewText = insight.title || insight.content.slice(0, 120);

  // Hint labels for the expandable sections
  const hintLabel =
    insight.type === 'decision'
      ? 'Situation, Choice, Rationale...'
      : 'What, Why, Takeaway...';

  // Check if there is structured metadata worth expanding
  const hasStructured =
    insight.type === 'decision'
      ? !!(metadata.situation || metadata.choice || metadata.reasoning)
      : !!(metadata.symptom || metadata.root_cause || metadata.takeaway);

  return (
    <div className="rounded-md border px-3 py-2.5">
      <button
        className="flex items-start gap-2 w-full text-left group"
        onClick={() => hasStructured && setExpanded(!expanded)}
        aria-expanded={expanded}
        disabled={!hasStructured}
      >
        {hasStructured ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-2">{previewText}</p>
          {!expanded && hasStructured && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">{hintLabel}</p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="ml-6 mt-2 pt-2 border-t">
          {insight.type === 'decision' ? (
            <DecisionContent metadata={metadata} />
          ) : (
            <LearningContent metadata={metadata} />
          )}
        </div>
      )}
    </div>
  );
}

interface SessionDetailPanelProps {
  sessionId: string;
}

export function SessionDetailPanel({ sessionId }: SessionDetailPanelProps) {
  const { data: session, isLoading: loading, error } = useSession(sessionId);
  const { data: insights = [] } = useInsights({ sessionId });
  const messagesQuery = useMessages(sessionId);
  const sessionMutation = useSessionMutation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingAllMessages, setLoadingAllMessages] = useState(false);
  const { state: analysisState } = useAnalysis();

  useEffect(() => {
    if (
      analysisState.status === 'complete' &&
      analysisState.sessionId === sessionId &&
      analysisState.type === 'session' &&
      analysisState.result?.suggestedTitle
    ) {
      setSuggestedTitle(analysisState.result.suggestedTitle);
    }
  }, [analysisState, sessionId]);

  const messages = messagesQuery.data?.pages.flat() ?? [];
  const loadingMessages = messagesQuery.isLoading;
  const loadingMore = messagesQuery.isFetchingNextPage;
  const hasMore = messagesQuery.hasNextPage ?? false;

  const fetchAllMessages = useCallback(async () => {
    if (loadingAllMessages || !messagesQuery.hasNextPage) return;
    setLoadingAllMessages(true);
    const MAX_PAGES = 50;
    for (let i = 0; i < MAX_PAGES; i++) {
      const result = await messagesQuery.fetchNextPage();
      if (!result.hasNextPage) break;
    }
    setLoadingAllMessages(false);
  }, [messagesQuery, loadingAllMessages]);

  const prLinks = useMemo(() => {
    const linkSet = new Set<string>();
    const prUrlPattern = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;
    for (const msg of messages) {
      const matches = msg.content.match(prUrlPattern);
      if (matches) {
        for (const match of matches) linkSet.add(match);
      }
    }
    return [...linkSet];
  }, [messagesQuery.data]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 border-b px-6 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <div className="p-6 space-y-4">
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
        <ErrorCard
          message={error instanceof Error ? error.message : 'Session not found'}
        />
      </div>
    );
  }

  const nonPromptInsights = insights.filter(
    (i) => i.type !== 'prompt_quality' && i.type !== 'summary'
  );
  const hasPromptQuality = insights.some((i) => i.type === 'prompt_quality');

  const summaryInsight = insights.find((i) => i.type === 'summary');
  const summaryMetadata = summaryInsight
    ? parseJsonField<InsightMetadata>(summaryInsight.metadata, {})
    : {};
  const sessionOutcome = summaryMetadata.outcome;
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold leading-tight">{getSessionTitle(session)}</h1>
          {sessionOutcome && OUTCOME_DOT[sessionOutcome] && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('w-2 h-2 rounded-full shrink-0', OUTCOME_DOT[sessionOutcome].color)} />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{OUTCOME_DOT[sessionOutcome].label}</TooltipContent>
            </Tooltip>
          )}
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

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDateRange(startedAt, endedAt)}</span>
          <span>&middot;</span>
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
          {session.git_branch && (
            <>
              <span>&middot;</span>
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono text-[11px] truncate max-w-[160px]">{session.git_branch}</span>
              </span>
            </>
          )}
          {session.source_tool && (
            <>
              <span>&middot;</span>
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
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-2.5 border-b bg-muted/50 transition-all duration-300">
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

      {/* VitalsStrip + Tabs */}
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

        <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0 p-5 space-y-4">
          {/* Vitals Strip */}
          <VitalsStrip session={session} />

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

          {/* PR Links */}
          {prLinks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Pull Requests</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {prLinks.map((url) => {
                  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
                  const label = match ? `${match[2]}#${match[3]}` : url;
                  return (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="text-xs hover:bg-accent cursor-pointer gap-1">
                        <GitPullRequest className="h-3 w-3" />
                        {label}
                      </Badge>
                    </a>
                  );
                })}
              </div>
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
                  <AnalyzeButton
                    session={session}
                    hasExistingInsights={false}
                    insightCount={0}
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
                    <div className="space-y-2">
                      {learningInsights.map((insight) => (
                        <CollapsibleInsightItem key={insight.id} insight={insight} />
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
                    <div className="space-y-2">
                      {decisionInsights.map((insight) => (
                        <CollapsibleInsightItem key={insight.id} insight={insight} />
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
          className="flex flex-col flex-1 overflow-hidden mt-0 bg-muted/40 dark:bg-muted/20"
        >
          <ConversationSearch
            messages={messages}
            onHighlightMessage={setSearchHighlightId}
            onSearchQueryChange={setSearchQuery}
            fetchAllMessages={fetchAllMessages}
            isLoadingAll={loadingAllMessages}
          />
          <div className="flex-1 overflow-y-auto">
            <ChatConversation
              messages={messages}
              loading={loadingMessages}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={() => messagesQuery.fetchNextPage()}
              sourceTool={session.source_tool}
              highlightMessageId={searchHighlightId}
              searchQuery={searchQuery}
            />
          </div>
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
