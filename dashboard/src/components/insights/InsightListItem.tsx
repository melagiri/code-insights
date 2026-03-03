import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { FileText, GitCommit, BookOpen, Target, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { INSIGHT_TYPE_COLORS, INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import { cn } from '@/lib/utils';
import type { Insight, InsightType, InsightMetadata } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { OutcomeBadge } from './InsightCard';

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

function MetadataField({ label, children, prominent }: { label: string; children: React.ReactNode; prominent?: boolean }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <p className={prominent ? 'text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}>{children}</p>
    </div>
  );
}

function formatAlternatives(alternatives: InsightMetadata['alternatives']): string {
  if (!alternatives || alternatives.length === 0) return '';
  return alternatives.map(a => {
    if (typeof a === 'string') return a;
    return a.rejected_because ? `${a.option} (rejected: ${a.rejected_because})` : a.option;
  }).join('; ');
}

function DecisionExpandedContent({ metadata }: { metadata: InsightMetadata }) {
  const hasStructured = metadata.situation || metadata.choice || metadata.reasoning;
  if (!hasStructured) return null;

  return (
    <div className="space-y-3">
      {metadata.situation && <MetadataField label="Situation">{metadata.situation}</MetadataField>}
      {metadata.choice && <MetadataField label="Choice" prominent>{metadata.choice}</MetadataField>}
      {metadata.reasoning && <MetadataField label="Reasoning">{metadata.reasoning}</MetadataField>}
      {metadata.alternatives && metadata.alternatives.length > 0 && (
        <MetadataField label="Alternatives Considered">{formatAlternatives(metadata.alternatives)}</MetadataField>
      )}
      {metadata.trade_offs && <MetadataField label="Trade-offs">{metadata.trade_offs}</MetadataField>}
      {metadata.revisit_when && metadata.revisit_when !== 'N/A' && (
        <MetadataField label="Revisit When">{metadata.revisit_when}</MetadataField>
      )}
      {metadata.evidence && metadata.evidence.length > 0 && (
        <MetadataField label="Evidence">{metadata.evidence.join(', ')}</MetadataField>
      )}
    </div>
  );
}

function LearningExpandedContent({ metadata }: { metadata: InsightMetadata }) {
  const hasStructured = metadata.symptom || metadata.root_cause || metadata.takeaway;
  if (!hasStructured) return null;

  return (
    <div className="space-y-3">
      {metadata.symptom && <MetadataField label="What Happened">{metadata.symptom}</MetadataField>}
      {metadata.root_cause && <MetadataField label="Why">{metadata.root_cause}</MetadataField>}
      {metadata.takeaway && <MetadataField label="Takeaway" prominent>{metadata.takeaway}</MetadataField>}
      {metadata.applies_when && <MetadataField label="Applies When">{metadata.applies_when}</MetadataField>}
    </div>
  );
}

function SummaryExpandedContent({ metadata, bullets }: { metadata: InsightMetadata; bullets: string[] }) {
  return (
    <div className="space-y-3">
      {metadata.outcome && (
        <div>
          <OutcomeBadge outcome={metadata.outcome} />
        </div>
      )}
      {bullets.length > 0 && (
        <ul className="space-y-1">
          {bullets.map((bullet, i) => (
            <li key={i} className="text-sm text-muted-foreground flex gap-2">
              <span className="shrink-0 mt-0.5">-</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderExpandedTypeContent(type: InsightType, metadata: InsightMetadata, bullets: string[]): React.ReactNode {
  switch (type) {
    case 'decision':
      return <DecisionExpandedContent metadata={metadata} />;
    case 'learning':
    case 'technique':
      return <LearningExpandedContent metadata={metadata} />;
    case 'summary':
      return <SummaryExpandedContent metadata={metadata} bullets={bullets} />;
    default:
      return null;
  }
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
  const expandedTypeContent = renderExpandedTypeContent(insight.type, metadata, bullets);

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
