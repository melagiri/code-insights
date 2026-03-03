import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { FileText, GitCommit, BookOpen, Target, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { INSIGHT_TYPE_COLORS, INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import { cn } from '@/lib/utils';
import type { Insight, InsightType, InsightMetadata } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { OutcomeBadge, renderTypeContent } from './insight-metadata';

const typeIcons: Record<InsightType, typeof FileText> = {
  summary: FileText,
  decision: GitCommit,
  learning: BookOpen,
  technique: BookOpen,
  prompt_quality: Target,
};

interface InsightListItemProps {
  insight: Insight;
  showProject?: boolean;
  allInsightIds?: Set<string>;
}

export function InsightListItem({ insight, showProject = false, allInsightIds }: InsightListItemProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = typeIcons[insight.type];
  const colorClass = INSIGHT_TYPE_COLORS[insight.type];
  const bullets = parseJsonField<string[]>(insight.bullets, []);
  const metadata = parseJsonField<InsightMetadata>(insight.metadata, {});
  const linkedIds = insight.linked_insight_ids
    ? parseJsonField<string[]>(insight.linked_insight_ids, [])
    : [];

  const recurringCount = linkedIds.length > 0
    ? (allInsightIds
        ? linkedIds.filter(id => allInsightIds.has(id)).length
        : linkedIds.length)
    : 0;

  const iconColorClass = colorClass.split(' ').find(c => c.startsWith('text-')) || 'text-muted-foreground';

  // For collapsed preview: show key field based on type
  const collapsedPreview = !expanded && (() => {
    if (insight.type === 'decision' && metadata.choice) {
      return <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Choice: {metadata.choice}</p>;
    }
    if ((insight.type === 'learning' || insight.type === 'technique') && metadata.takeaway) {
      return <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Takeaway: {metadata.takeaway}</p>;
    }
    if (insight.type === 'summary' && metadata.outcome) {
      return (
        <div className="mt-1">
          <OutcomeBadge outcome={metadata.outcome} />
        </div>
      );
    }
    // Generic fallback: show bullets
    if (bullets.length > 0) {
      return (
        <ul className="mt-2 space-y-0.5">
          {bullets.slice(0, 3).map((bullet, i) => (
            <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
              <span className="shrink-0 mt-0.5">-</span>
              <span className="line-clamp-1">{bullet}</span>
            </li>
          ))}
        </ul>
      );
    }
    return null;
  })();

  // For expanded content: type-specific or generic fallback
  const expandedTypeContent = renderTypeContent(insight.type, metadata, bullets);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 shrink-0 rounded-md p-1.5', colorClass)}>
            <Icon className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={cn('text-xs font-medium', iconColorClass)}>
                {INSIGHT_TYPE_LABELS[insight.type]}
              </span>
              {recurringCount > 0 && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs py-0">
                  Recurring {recurringCount + 1}x
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium leading-snug">{insight.title}</p>

            <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
              {showProject && (
                <span className="text-xs text-muted-foreground">{insight.project_name}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(insight.timestamp), { addSuffix: true })}
              </span>
            </div>

            {collapsedPreview}
          </div>

          <div className="shrink-0 mt-0.5 text-muted-foreground">
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t bg-muted/20">
          {expandedTypeContent ? (
            <div className="mt-3">
              {expandedTypeContent}
            </div>
          ) : (
            <>
              {insight.content && (
                <div className="mt-3">
                  <p className="text-sm text-foreground leading-relaxed">{insight.content}</p>
                </div>
              )}

              {bullets.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {bullets.map((bullet, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="shrink-0 mt-0.5">-</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Confidence: {Math.round(insight.confidence * 100)}%</span>
          </div>

          <div className="mt-3">
            <a
              href={`/sessions/${insight.session_id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              View session
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
