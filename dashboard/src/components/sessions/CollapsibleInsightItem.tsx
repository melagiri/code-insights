import { useState } from 'react';
import { parseJsonField } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { Insight, InsightMetadata } from '@/lib/types';
import { LearningContent, DecisionContent } from '@/components/insights/insight-metadata';
import { ChevronRight, ChevronDown } from 'lucide-react';

/** Per-item collapsible for learnings and decisions. Compact row with
 *  expand toggle to reveal full structured metadata. */
export function CollapsibleInsightItem({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false);
  const metadata = parseJsonField<InsightMetadata>(insight.metadata, {});

  const previewText = insight.title || insight.content.slice(0, 120);

  const hasStructured =
    insight.type === 'decision'
      ? !!(metadata.situation || metadata.choice || metadata.reasoning)
      : !!(metadata.symptom || metadata.root_cause || metadata.takeaway);

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex items-center gap-2 w-full text-left py-2 px-3"
        onClick={() => hasStructured && setExpanded(!expanded)}
        aria-expanded={expanded}
        disabled={!hasStructured}
      >
        {hasStructured ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', insight.type === 'decision' ? 'bg-blue-500' : 'bg-green-500')} />
        <p className="flex-1 min-w-0 text-sm font-medium line-clamp-2">{previewText}</p>
      </button>
      {expanded && (
        <div className={cn(
          'ml-6 mr-3 mb-2 pl-3 pr-3 py-2 border-l-2 bg-muted/20 rounded-r-md',
          insight.type === 'decision' ? 'border-blue-500/40' : 'border-green-500/40'
        )}>
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
