import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/shared/ProgressRing';
import { Target, AlertTriangle, Lightbulb, TrendingDown, Compass } from 'lucide-react';
import type { Insight } from '@/lib/types';
import { parseJsonField } from '@/lib/types';

interface PromptQualityCardProps {
  insight: Insight;
}

interface AntiPattern {
  name: string;
  description?: string;
  count: number;
  examples: string[];
  fix?: string;
}

interface WastedTurn {
  messageIndex: number;
  whatWentWrong?: string;
  reason?: string;           // legacy v2 field
  originalMessage?: string;
  suggestedRewrite?: string;
  turnsWasted?: number;
}

interface SessionTrait {
  trait: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidence?: string;
  suggestion?: string;
}

const TRAIT_LABELS: Record<string, string> = {
  context_drift: 'Context Drift',
  objective_bloat: 'Objective Bloat',
  late_context: 'Late Context',
  no_planning: 'No Planning',
  good_structure: 'Well Structured',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-red-500 bg-red-500/10 border-red-500/20',
  medium: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  low: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
};

import { getScoreTier, getScoreLabel } from '@/lib/score-utils';

const SCORE_COLORS: Record<string, string> = {
  excellent: 'text-green-500',
  good: 'text-yellow-500',
  fair: 'text-orange-500',
  poor: 'text-red-500',
};

function getScoreColor(score: number): string {
  return SCORE_COLORS[getScoreTier(score)];
}

/** Inner content for prompt quality — used by both PromptQualityCard and InsightListItem. */
export function PromptQualityContent({ insight }: { insight: Insight }) {
  const metadata = parseJsonField<Record<string, unknown>>(insight.metadata, {});
  const bullets = parseJsonField<string[]>(insight.bullets, []);

  const score = typeof metadata.efficiencyScore === 'number' ? metadata.efficiencyScore : 0;
  const wastedTurns = Array.isArray(metadata.wastedTurns) ? metadata.wastedTurns as WastedTurn[] : [];
  const antiPatterns = Array.isArray(metadata.antiPatterns) ? metadata.antiPatterns as AntiPattern[] : [];
  const sessionTraits = Array.isArray(metadata.sessionTraits) ? metadata.sessionTraits as SessionTrait[] : [];
  const reduction = typeof metadata.potentialMessageReduction === 'number' ? metadata.potentialMessageReduction : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <ProgressRing value={score} />
          <p className="text-xs text-muted-foreground mt-1">/100</p>
        </div>
        <div>
          <p className={`text-sm font-medium ${getScoreColor(score)}`}>
            {getScoreLabel(score)}
          </p>
          <p className="text-sm text-muted-foreground">
            {insight.content}
          </p>
        </div>
      </div>

      {reduction > 0 && (
        <div className="flex items-center gap-2 text-sm rounded-md bg-muted/50 p-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>
            Could have been done in <strong>{reduction} fewer</strong> messages
          </span>
        </div>
      )}

      {antiPatterns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            Anti-Patterns Detected
          </div>
          <div className="space-y-1.5">
            {antiPatterns.map((pattern, i) => (
              <div key={i} className="text-sm rounded-md border p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{pattern.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {pattern.count}x
                  </Badge>
                </div>
                {pattern.description && (
                  <p className="text-xs text-muted-foreground">{pattern.description}</p>
                )}
                {pattern.examples.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    e.g. &ldquo;{pattern.examples[0]}&rdquo;
                  </p>
                )}
                {pattern.fix && (
                  <p className="text-xs text-green-600 mt-1">Fix: {pattern.fix}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sessionTraits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Compass className="h-3.5 w-3.5 text-blue-500" />
            Session Traits
          </div>
          <div className="space-y-1.5">
            {sessionTraits.map((t, i) => (
              <div key={i} className="text-sm rounded-md border p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{TRAIT_LABELS[t.trait] || t.trait}</span>
                  <Badge variant="outline" className={`text-xs ${
                    t.trait === 'good_structure'
                      ? 'text-green-500 bg-green-500/10 border-green-500/20'
                      : SEVERITY_COLORS[t.severity] || ''
                  }`}>
                    {t.trait === 'good_structure' ? 'positive' : t.severity}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                {t.evidence && (
                  <p className="text-xs text-muted-foreground italic">{t.evidence}</p>
                )}
                {t.suggestion && (
                  <p className="text-xs text-green-600">Suggestion: {t.suggestion}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {wastedTurns.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Wasted Turns ({wastedTurns.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {wastedTurns.slice(0, 5).map((turn, i) => (
              <div key={i} className="text-sm rounded-md border p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs shrink-0">
                    Msg #{turn.messageIndex + 1}
                    {turn.turnsWasted && turn.turnsWasted > 1 ? ` (${turn.turnsWasted} turns)` : ''}
                  </Badge>
                  <span className="text-muted-foreground">{turn.whatWentWrong || turn.reason}</span>
                </div>
                {turn.originalMessage && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">
                    &ldquo;{turn.originalMessage}&rdquo;
                  </p>
                )}
                {turn.suggestedRewrite && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Better prompt
                    </summary>
                    <p className="mt-1 bg-muted/50 rounded p-1.5">
                      {turn.suggestedRewrite}
                    </p>
                  </details>
                )}
              </div>
            ))}
            {wastedTurns.length > 5 && (
              <p className="text-xs text-muted-foreground">
                +{wastedTurns.length - 5} more wasted turns...
              </p>
            )}
          </div>
        </div>
      )}

      {bullets.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
            Tips
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {bullets.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PromptQualityCard({ insight }: PromptQualityCardProps) {
  return (
    <Card className="border-rose-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1.5 bg-rose-500/10 text-rose-500 border-rose-500/20">
              <Target className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Prompt Quality Analysis</CardTitle>
          </div>
          <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/20">
            Prompt Quality
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <PromptQualityContent insight={insight} />
      </CardContent>
    </Card>
  );
}
