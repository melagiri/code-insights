// Analysis cost indicator — renders below VitalsStrip in the Insights tab.
// Shows what Code Insights' own LLM analysis calls cost for this session.
// Deliberately separated from VitalsStrip (which shows the coding session cost).
// Clicking opens a Popover with per-analysis-type breakdown.

import { Sparkles } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAnalysisCost } from '@/hooks/useAnalysisCost';
import { formatCost } from '@/lib/cost-utils';
import { formatTokenCount } from '@/lib/utils';

interface AnalysisCostLineProps {
  sessionId: string;
  /** True while analysis is in progress — shows placeholder text. */
  isAnalyzing: boolean;
}

/** Human-readable label for each analysis type. */
function analysisTypeLabel(type: string): string {
  switch (type) {
    case 'session': return 'Session Analysis';
    case 'prompt_quality': return 'Prompt Quality';
    case 'facet': return 'Facet Extraction';
    default: return type;
  }
}

/** Format a token count for the sublabel (e.g. "82.4K"). */
function formatTokens(n: number): string {
  return formatTokenCount(n);
}

export function AnalysisCostLine({ sessionId, isAnalyzing }: AnalysisCostLineProps) {
  const { data } = useAnalysisCost(sessionId);

  // While analysis is running, show a placeholder
  if (isAnalyzing) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-1 py-1">
        <Sparkles className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        <span>Analyzing... cost will appear when complete</span>
      </div>
    );
  }

  // No data or empty usage = session has never been analyzed (or pre-V7)
  if (!data || data.usage.length === 0) {
    return null;
  }

  const { usage, totalCostUsd, cacheSavingsUsd } = data;
  const allOllama = usage.every(row => row.provider === 'ollama');

  // Use the model and provider from the first usage row for the sublabel
  const firstRow = usage[0];
  const modelLabel = firstRow.model.replace(/-\d{8}$/, ''); // strip date suffix if present

  // Total token counts across all rows
  const totalInput = usage.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutput = usage.reduce((s, r) => s + r.output_tokens, 0);

  // Build sublabel
  const sublabelParts: string[] = [modelLabel];
  if (totalInput > 0) sublabelParts.push(`${formatTokens(totalInput)} in`);
  if (totalOutput > 0) sublabelParts.push(`${formatTokens(totalOutput)} out`);
  if (cacheSavingsUsd > 0.005) sublabelParts.push(`saved ${formatCost(cacheSavingsUsd)}`);
  const sublabel = sublabelParts.join(' · ');

  // Legacy sessions: usage row exists but cost is 0 and provider is not Ollama
  // This shouldn't happen post-V7, but guard against it gracefully.
  const isLegacy = totalCostUsd === 0 && !allOllama;

  const primaryText = allOllama
    ? 'Analysis: local (free)'
    : isLegacy
      ? 'Analysis cost: not tracked'
      : `Analysis cost: ${formatCost(totalCostUsd)}`;

  const showPopover = usage.length > 0 && !isLegacy;

  const content = (
    <div className="flex flex-col gap-0.5 px-1 py-1 cursor-pointer">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        <span>{primaryText}</span>
      </div>
      {!isLegacy && (
        <div className="text-[10px] text-muted-foreground/60 pl-5">{sublabel}</div>
      )}
    </div>
  );

  if (!showPopover) {
    return <div className="select-none">{content}</div>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="select-none hover:opacity-80 transition-opacity">{content}</div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <p className="text-xs font-semibold text-foreground mb-2">Analysis Cost Breakdown</p>
        <div className="space-y-2">
          {usage.map((row, idx) => {
            const cacheRead = row.cache_read_tokens;
            // Cache savings for this row (Anthropic only)
            let rowCacheSavings = 0;
            if (row.provider === 'anthropic' && cacheRead > 0) {
              // Approximate savings: 90% of what full input price would have been
              // This is a display approximation — exact savings are in cacheSavingsUsd
              rowCacheSavings = cacheSavingsUsd * (cacheRead / usage.reduce((s, r) => s + r.cache_read_tokens, 0));
            }

            return (
              <div key={idx}>
                {idx > 0 && <div className="border-t my-2" />}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {analysisTypeLabel(row.analysis_type)}
                  </span>
                  <span className="text-xs font-medium text-foreground shrink-0">
                    {row.provider === 'ollama' ? 'free' : formatCost(row.estimated_cost_usd)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatTokens(row.input_tokens)} in · {formatTokens(row.output_tokens)} out
                </p>
                {cacheRead > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Cache: {formatTokens(cacheRead)} read
                    {rowCacheSavings > 0.005 && ` (saved ${formatCost(rowCacheSavings)})`}
                  </p>
                )}
              </div>
            );
          })}
          {usage.length > 1 && (
            <>
              <div className="border-t my-2" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Total</span>
                <span className="text-xs font-semibold text-foreground">
                  {allOllama ? 'free' : formatCost(totalCostUsd)}
                </span>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
