import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, GitCommit, BookOpen, Target } from 'lucide-react';
import { INSIGHT_TYPE_COLORS, INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import type { Insight, InsightType, InsightMetadata } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { renderTypeContent } from './insight-metadata';

// Re-export from shared module for backward compat (SessionDetailPage, SessionsPage import these)
export { OutcomeBadge, OUTCOME_CONFIG } from './insight-metadata';

interface InsightCardProps {
  insight: Insight;
  showProject?: boolean;
  allInsightIds?: Set<string>;
}

const typeIcons: Record<InsightType, typeof FileText> = {
  summary: FileText,
  decision: GitCommit,
  learning: BookOpen,
  technique: BookOpen,
  prompt_quality: Target,
};

export function InsightCard({ insight, showProject = false, allInsightIds }: InsightCardProps) {
  const Icon = typeIcons[insight.type];
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

  const evidence = Array.isArray(metadata.evidence) ? metadata.evidence : [];

  // Try type-specific rendering; fall back to generic bullets
  const typeContent = renderTypeContent(insight.type, metadata, bullets);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`rounded-md p-1.5 ${INSIGHT_TYPE_COLORS[insight.type]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium line-clamp-2">
                {insight.title}
              </CardTitle>
              {showProject && (
                <p className="text-xs text-muted-foreground">{insight.project_name}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className={INSIGHT_TYPE_COLORS[insight.type]}>
              {INSIGHT_TYPE_LABELS[insight.type]}
            </Badge>
            {recurringCount > 0 && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                Recurring ({recurringCount + 1}x)
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {typeContent || (
          bullets.length > 0 ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {bullets.slice(0, 3).map((bullet, i) => (
                <li key={i} className="line-clamp-1">{bullet}</li>
              ))}
              {bullets.length > 3 && (
                <li className="text-muted-foreground/70">
                  +{bullets.length - 3} more...
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {insight.summary || insight.content}
            </p>
          )
        )}
        {evidence.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
            Evidence: {evidence.join(', ')}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(insight.timestamp), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
