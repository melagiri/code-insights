import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/shared/ProgressRing';
import { Target, AlertTriangle, Lightbulb, TrendingDown, Compass, ArrowRight, BarChart3 } from 'lucide-react';
import type { Insight } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { getPQCategoryLabel, getPQCategoryType } from '@/lib/prompt-quality-utils';
import { extractPQScore } from '@/lib/score-utils';

interface PromptQualityCardProps {
  insight: Insight;
}

// ── New schema types ──────────────────────────────────────────────────────────

interface PQFinding {
  category: string;
  type: 'deficit' | 'strength';
  description: string;
  message_ref: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  suggested_improvement?: string;
}

interface PQTakeaway {
  type: 'improve' | 'reinforce';
  category: string;
  label: string;
  message_ref: string;
  // improve fields
  original?: string;
  better_prompt?: string;
  why?: string;
  // reinforce fields
  what_worked?: string;
  why_effective?: string;
}

interface PQDimensionScores {
  context_provision: number;
  request_specificity: number;
  scope_management: number;
  information_timing: number;
  correction_quality: number;
}

// ── Legacy schema types ───────────────────────────────────────────────────────

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

// ── Score styling ─────────────────────────────────────────────────────────────

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

// ── Category badges ───────────────────────────────────────────────────────────

function CategoryBadge({ category, type: typeProp }: { category: string; type?: 'deficit' | 'strength' }) {
  // Use the finding's own type field as truth; fall back to category-based lookup for novel categories
  const type = typeProp ?? getPQCategoryType(category);
  const label = getPQCategoryLabel(category);
  const className = type === 'strength'
    ? 'text-green-500 bg-green-500/10 border-green-500/20'
    : 'text-red-500 bg-red-500/10 border-red-500/20';
  return (
    <Badge variant="outline" className={`text-xs shrink-0 ${className}`}>
      {label}
    </Badge>
  );
}

// ── Dimension scores bar ──────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  context_provision: 'Context Provision',
  request_specificity: 'Request Specificity',
  scope_management: 'Scope Management',
  information_timing: 'Information Timing',
  correction_quality: 'Correction Quality',
};

function DimensionScores({ scores }: { scores: PQDimensionScores }) {
  const entries = Object.entries(scores) as [keyof PQDimensionScores, number][];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
        Dimension Scores
      </div>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{DIMENSION_LABELS[key] ?? key}</span>
              <span className={`font-medium ${getScoreColor(value)}`}>{value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  value >= 80 ? 'bg-green-500' :
                  value >= 60 ? 'bg-yellow-500' :
                  value >= 40 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New schema rendering ──────────────────────────────────────────────────────

function NewSchemaContent({
  score,
  overhead,
  takeaways,
  findings,
  dimensionScores,
  content,
}: {
  score: number;
  overhead: number;
  takeaways: PQTakeaway[];
  findings: PQFinding[];
  dimensionScores: PQDimensionScores | null;
  content: string;
}) {
  return (
    <div className="space-y-4">
      {/* Score + assessment */}
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
            {content}
          </p>
        </div>
      </div>

      {overhead > 0 && (
        <div className="flex items-center gap-2 text-sm rounded-md bg-muted/50 p-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>
            Could have been done in <strong>{overhead} fewer</strong> messages
          </span>
        </div>
      )}

      {/* Takeaways */}
      {takeaways.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
            Takeaways
          </div>
          <div className="space-y-2">
            {takeaways.map((t, i) => (
              <div key={i} className="text-sm rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{t.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t.message_ref}
                    </Badge>
                    <CategoryBadge category={t.category} />
                  </div>
                </div>

                {t.type === 'improve' && (
                  <>
                    {t.original && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        &ldquo;{t.original}&rdquo;
                      </p>
                    )}
                    {t.why && (
                      <p className="text-xs text-muted-foreground">{t.why}</p>
                    )}
                    {t.better_prompt && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          Better prompt
                        </summary>
                        <p className="mt-1.5 bg-muted/50 rounded p-2 font-mono text-xs leading-relaxed">
                          {t.better_prompt}
                        </p>
                      </details>
                    )}
                  </>
                )}

                {t.type === 'reinforce' && (
                  <>
                    {t.what_worked && (
                      <p className="text-xs text-green-600 dark:text-green-400">{t.what_worked}</p>
                    )}
                    {t.why_effective && (
                      <p className="text-xs text-muted-foreground">{t.why_effective}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings (collapsed summary by category) */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
            Findings ({findings.length})
          </div>
          <div className="space-y-1.5">
            {findings.map((f, i) => (
              <div key={i} className="text-sm rounded-md border p-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <CategoryBadge category={f.category} type={f.type} />
                  <Badge variant="outline" className={`text-xs shrink-0 ${
                    f.impact === 'high' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                    f.impact === 'medium' ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' :
                    'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                  }`}>
                    {f.impact}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{f.description}</p>
                {f.suggested_improvement && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Improve: {f.suggested_improvement}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimension scores */}
      {dimensionScores && (
        <DimensionScores scores={dimensionScores} />
      )}
    </div>
  );
}

// ── Legacy schema rendering ───────────────────────────────────────────────────

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

function LegacyContent({
  score,
  reduction,
  wastedTurns,
  antiPatterns,
  sessionTraits,
  bullets,
  content,
}: {
  score: number;
  reduction: number;
  wastedTurns: WastedTurn[];
  antiPatterns: AntiPattern[];
  sessionTraits: SessionTrait[];
  bullets: (string | { tip?: string; example?: string })[];
  content: string;
}) {
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
          <p className="text-sm text-muted-foreground">{content}</p>
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
          <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
            {bullets.map((bullet, i) => {
              if (typeof bullet === 'string') {
                return <li key={i}>{bullet}</li>;
              }
              const text = bullet.tip || bullet.example;
              if (!text) return null;
              return (
                <li key={i}>
                  {text}
                  {bullet.tip && bullet.example && (
                    <p className="ml-5 mt-0.5 text-xs italic">{bullet.example}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Inner content for prompt quality — used by both PromptQualityCard and InsightListItem. */
export function PromptQualityContent({ insight }: { insight: Insight }) {
  const metadata = parseJsonField<Record<string, unknown>>(insight.metadata, {});

  // Detect schema version: new schema has 'findings' array; legacy has 'wastedTurns'
  const isNewSchema = Array.isArray(metadata.findings);

  if (isNewSchema) {
    const score = extractPQScore(metadata) ?? 0;
    const overhead = typeof metadata.message_overhead === 'number' ? metadata.message_overhead : 0;
    const takeaways = Array.isArray(metadata.takeaways) ? metadata.takeaways as PQTakeaway[] : [];
    const findings = metadata.findings as PQFinding[];
    const dimensionScores = metadata.dimension_scores && typeof metadata.dimension_scores === 'object'
      ? metadata.dimension_scores as PQDimensionScores
      : null;

    return (
      <NewSchemaContent
        score={score}
        overhead={overhead}
        takeaways={takeaways}
        findings={findings}
        dimensionScores={dimensionScores}
        content={insight.content}
      />
    );
  }

  // Legacy schema
  const score = extractPQScore(metadata) ?? 0;
  const reduction = typeof metadata.potentialMessageReduction === 'number' ? metadata.potentialMessageReduction : 0;
  const wastedTurns = Array.isArray(metadata.wastedTurns) ? metadata.wastedTurns as WastedTurn[] : [];
  const antiPatterns = Array.isArray(metadata.antiPatterns) ? metadata.antiPatterns as AntiPattern[] : [];
  const sessionTraits = Array.isArray(metadata.sessionTraits) ? metadata.sessionTraits as SessionTrait[] : [];
  const bullets = parseJsonField<(string | { tip?: string; example?: string })[]>(insight.bullets, []);

  return (
    <LegacyContent
      score={score}
      reduction={reduction}
      wastedTurns={wastedTurns}
      antiPatterns={antiPatterns}
      sessionTraits={sessionTraits}
      bullets={bullets}
      content={insight.content}
    />
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
