import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, GitCommit, BookOpen, Target, CheckCircle2, AlertCircle, XCircle, Ban } from 'lucide-react';
import { INSIGHT_TYPE_COLORS, INSIGHT_TYPE_LABELS } from '@/lib/constants/colors';
import type { Insight, InsightType, InsightMetadata } from '@/lib/types';
import { parseJsonField } from '@/lib/types';

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

const OUTCOME_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'Success', className: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle2 },
  partial: { label: 'Partial', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: AlertCircle },
  abandoned: { label: 'Abandoned', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: XCircle },
  blocked: { label: 'Blocked', className: 'bg-red-500/10 text-red-600 border-red-500/20', icon: Ban },
};

function MetadataSection({ label, children, prominent }: { label: string; children: React.ReactNode; prominent?: boolean }) {
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

function DecisionContent({ metadata }: { metadata: InsightMetadata }) {
  const hasStructured = metadata.situation || metadata.choice || metadata.reasoning;
  if (!hasStructured) return null;

  return (
    <div className="space-y-2.5">
      {metadata.situation && <MetadataSection label="Situation">{metadata.situation}</MetadataSection>}
      {metadata.choice && <MetadataSection label="Choice" prominent>{metadata.choice}</MetadataSection>}
      {metadata.reasoning && <MetadataSection label="Reasoning">{metadata.reasoning}</MetadataSection>}
      {metadata.alternatives && metadata.alternatives.length > 0 && (
        <MetadataSection label="Alternatives Considered">{formatAlternatives(metadata.alternatives)}</MetadataSection>
      )}
      {metadata.trade_offs && <MetadataSection label="Trade-offs">{metadata.trade_offs}</MetadataSection>}
      {metadata.revisit_when && metadata.revisit_when !== 'N/A' && (
        <MetadataSection label="Revisit When">{metadata.revisit_when}</MetadataSection>
      )}
    </div>
  );
}

function LearningContent({ metadata }: { metadata: InsightMetadata }) {
  const hasStructured = metadata.symptom || metadata.root_cause || metadata.takeaway;
  if (!hasStructured) return null;

  return (
    <div className="space-y-2.5">
      {metadata.symptom && <MetadataSection label="What Happened">{metadata.symptom}</MetadataSection>}
      {metadata.root_cause && <MetadataSection label="Why">{metadata.root_cause}</MetadataSection>}
      {metadata.takeaway && <MetadataSection label="Takeaway" prominent>{metadata.takeaway}</MetadataSection>}
      {metadata.applies_when && <MetadataSection label="Applies When">{metadata.applies_when}</MetadataSection>}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const config = OUTCOME_CONFIG[outcome];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function SummaryContent({ metadata, bullets }: { metadata: InsightMetadata; bullets: string[] }) {
  return (
    <div className="space-y-2">
      {metadata.outcome && (
        <div>
          <OutcomeBadge outcome={metadata.outcome} />
        </div>
      )}
      {bullets.length > 0 && (
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
      )}
    </div>
  );
}

function renderTypeContent(type: InsightType, metadata: InsightMetadata, bullets: string[]) {
  switch (type) {
    case 'decision':
      return <DecisionContent metadata={metadata} />;
    case 'learning':
    case 'technique':
      return <LearningContent metadata={metadata} />;
    case 'summary':
      return <SummaryContent metadata={metadata} bullets={bullets} />;
    default:
      return null;
  }
}

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

export { OutcomeBadge, OUTCOME_CONFIG };
