import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { INSIGHT_TYPE_COLORS, INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import { cn } from '@/lib/utils';
import { getScoreTier, extractPQScore } from '@/lib/score-utils';
import type { Insight, InsightType, InsightMetadata } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { OutcomeBadge, renderTypeContent } from './insight-metadata';
import { PromptQualityContent } from './PromptQualityCard';

const SCORE_BADGE_COLORS: Record<string, string> = {
  excellent: 'bg-green-500/15 text-green-600',
  good: 'bg-yellow-500/15 text-yellow-600',
  fair: 'bg-orange-500/15 text-orange-600',
  poor: 'bg-red-500/15 text-red-600',
};

const DOT_COLORS: Record<InsightType, string> = {
  summary: 'bg-purple-500',
  decision: 'bg-blue-500',
  learning: 'bg-green-500',
  technique: 'bg-green-500',
  prompt_quality: 'bg-rose-500',
};

const EXPAND_BORDER_COLORS: Record<InsightType, string> = {
  summary: 'border-purple-500/40',
  decision: 'border-blue-500/40',
  learning: 'border-green-500/40',
  technique: 'border-green-500/40',
  prompt_quality: 'border-rose-500/40',
};

interface InsightListItemProps {
  insight: Insight;
  showProject?: boolean;
  allInsightIds?: Set<string>;
  highlighted?: boolean;
  defaultExpanded?: boolean;
}

export function InsightListItem({ insight, showProject = false, allInsightIds, highlighted = false, defaultExpanded = false }: InsightListItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showRing, setShowRing] = useState(highlighted);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowRing(!!highlighted);
  }, [highlighted]);

  useEffect(() => {
    if (highlighted && itemRef.current) {
      requestAnimationFrame(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const timer = setTimeout(() => setShowRing(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [highlighted]);

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
  const expandedTypeContent = insight.type !== 'prompt_quality'
    ? renderTypeContent(insight.type, metadata, bullets)
    : null;

  // Prompt quality score for collapsed badge — dual-read new and legacy schema
  const pqScore = insight.type === 'prompt_quality'
    ? extractPQScore(metadata as Record<string, unknown>)
    : null;

  return (
    <div
      ref={itemRef}
      className={cn(
        'border-b last:border-b-0 transition-shadow duration-500',
        showRing && 'ring-2 ring-primary rounded-sm'
      )}
    >
      <button
        className="w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2.5">
          <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', DOT_COLORS[insight.type])} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={cn('text-xs font-medium', iconColorClass)}>
                {INSIGHT_TYPE_LABELS[insight.type]}
              </span>
              {pqScore != null && (
                <span className={cn(
                  'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  SCORE_BADGE_COLORS[getScoreTier(pqScore)]
                )}>
                  {pqScore}
                </span>
              )}
              {recurringCount > 0 && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs py-0">
                  Recurring {recurringCount + 1}x
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium leading-snug">{insight.title}</p>
            <div className="flex items-center justify-between gap-2 mt-0.5 flex-wrap">
              {showProject && (
                <span className="text-xs text-muted-foreground">{insight.project_name}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(insight.timestamp), { addSuffix: true })}
              </span>
            </div>
          </div>
          <div className="shrink-0 mt-1 text-muted-foreground">
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className={cn(
          'mx-3 mb-2.5 ml-[1.85rem] pl-3 pr-3 py-2.5 border-l-2 bg-muted/20 rounded-r-md',
          EXPAND_BORDER_COLORS[insight.type]
        )}>
          {insight.type === 'prompt_quality' ? (
            <PromptQualityContent insight={insight} />
          ) : expandedTypeContent ? (
            <div>{expandedTypeContent}</div>
          ) : (
            <>
              {insight.content && (
                <p className="text-sm text-foreground leading-relaxed">{insight.content}</p>
              )}
              {bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
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

          {metadata.outcome && insight.type === 'summary' && (
            <div className="mt-2">
              <OutcomeBadge outcome={metadata.outcome} />
            </div>
          )}

          <div className="mt-3">
            <a
              href={`/sessions?session=${insight.session_id}`}
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
