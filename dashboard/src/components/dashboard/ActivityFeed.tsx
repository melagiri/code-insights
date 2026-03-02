import { Link } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, FileText, GitCommit, BookOpen, Target, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getSessionTitle } from '@/lib/utils';
import { INSIGHT_TYPE_COLORS, SOURCE_TOOL_COLORS } from '@/lib/constants/colors';
import type { Session, Insight, InsightType } from '@/lib/types';

type FeedItem =
  | { kind: 'session'; session: Session; timestamp: Date }
  | { kind: 'insight'; insight: Insight; timestamp: Date };

interface ActivityFeedProps {
  sessions: Session[];
  insights: Insight[];
  limit?: number;
}

const insightTypeIcons: Record<InsightType, typeof FileText> = {
  summary: FileText,
  decision: GitCommit,
  learning: BookOpen,
  technique: BookOpen,
  prompt_quality: Target,
};

const insightTypeLabels: Record<InsightType, string> = {
  summary: 'Summary',
  decision: 'Decision',
  learning: 'Learning',
  technique: 'Learning',
  prompt_quality: 'Prompt Quality',
};

export function ActivityFeed({ sessions, insights, limit = 7 }: ActivityFeedProps) {
  const feedItems: FeedItem[] = [
    ...sessions.map((s) => ({ kind: 'session' as const, session: s, timestamp: new Date(s.started_at) })),
    ...insights.map((i) => ({ kind: 'insight' as const, insight: i, timestamp: new Date(i.timestamp) })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);

  if (feedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 gap-1.5 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No recent activity</p>
        <p className="text-xs text-muted-foreground">Start an AI coding session and run code-insights sync to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 divide-y divide-border">
      {feedItems.map((item) =>
        item.kind === 'session' ? (
          <SessionFeedItem key={`s-${item.session.id}`} session={item.session} />
        ) : (
          <InsightFeedItem key={`i-${item.insight.id}`} insight={item.insight} />
        )
      )}
    </div>
  );
}

function SessionFeedItem({ session }: { session: Session }) {
  const startedAt = new Date(session.started_at);
  const endedAt = new Date(session.ended_at);
  const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  const displayTitle = getSessionTitle(session);

  return (
    <Link to={`/sessions/${session.id}`} className="block group">
      <div className="py-1.5 px-1 hover:bg-accent transition-all duration-200 rounded-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 h-5 w-5 rounded bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
              <MessageSquare className="h-3 w-3 text-primary/70" />
            </div>
            <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors min-w-0">
              {displayTitle}
            </p>
            {session.source_tool && session.source_tool !== 'claude-code' && (
              <Badge
                variant="outline"
                className={`text-xs capitalize shrink-0 ${SOURCE_TOOL_COLORS[session.source_tool] ?? 'bg-muted text-muted-foreground'}`}
              >
                {session.source_tool}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              &middot; {session.message_count} msgs &middot; {durationMin}m
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(startedAt, { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function InsightFeedItem({ insight }: { insight: Insight }) {
  const Icon = insightTypeIcons[insight.type];
  const colorClass = INSIGHT_TYPE_COLORS[insight.type];
  const label = insightTypeLabels[insight.type];

  return (
    <Link to={`/sessions/${insight.session_id}`} className="block group">
      <div className="py-1.5 px-1 hover:bg-accent transition-all duration-200 rounded-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`shrink-0 h-5 w-5 rounded flex items-center justify-center transition-colors ${colorClass}`}>
              <Icon className="h-3 w-3" />
            </div>
            <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors min-w-0">
              {insight.title}
            </p>
            <Badge variant="outline" className={`text-xs shrink-0 ${colorClass}`}>
              {label}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(insight.timestamp), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  );
}
