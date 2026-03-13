/**
 * WorkingStyleHighlights — horizontal stat pills showing the week's working style at a glance.
 * Replaces the old bullet list with mini-cards (icon + value + sublabel), color-coded by domain.
 * The full LLM narrative is available via an expandable "Show full analysis" toggle.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Sparkles, User } from 'lucide-react';
import { SESSION_CHARACTER_COLORS } from '@/lib/constants/colors';

interface WorkingStyleHighlightsProps {
  narrative?: string;
  totalSessions: number;
  successCount: number;
  topCharacter?: { name: string; percentage: number };
  topFriction?: { category: string; count: number };
  topPattern?: { label: string; frequency: number };
}

function formatCharacterName(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function WorkingStyleHighlights({
  narrative,
  totalSessions,
  successCount,
  topCharacter,
  topFriction,
  topPattern,
}: WorkingStyleHighlightsProps) {
  const [showNarrative, setShowNarrative] = useState(false);

  // Build pill data from available props
  const pills: Array<{
    icon: React.ReactNode;
    value: string;
    sublabel: string;
    className: string;
  }> = [];

  if (totalSessions > 0) {
    pills.push({
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      value: `${successCount}/${totalSessions}`,
      sublabel: 'completed',
      className: 'bg-emerald-500/10 border-emerald-500/20',
    });
  }

  if (topFriction) {
    pills.push({
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      value: `${topFriction.count}x`,
      sublabel: topFriction.category,
      className: 'bg-red-500/10 border-red-500/20',
    });
  }

  if (topPattern) {
    pills.push({
      icon: <Sparkles className="h-4 w-4 text-blue-500" />,
      value: `${topPattern.frequency}x`,
      sublabel: topPattern.label,
      className: 'bg-blue-500/10 border-blue-500/20',
    });
  }

  if (topCharacter) {
    const charColorClass = SESSION_CHARACTER_COLORS[topCharacter.name] ?? 'bg-muted text-muted-foreground border-border';
    pills.push({
      icon: <User className="h-4 w-4" />,
      value: `${topCharacter.percentage}%`,
      sublabel: formatCharacterName(topCharacter.name),
      // Use the character color classes but override bg/border via className merge
      className: charColorClass,
    });
  }

  if (pills.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Stat pills row */}
      <div className="flex flex-wrap gap-2">
        {pills.map((pill, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${pill.className}`}
          >
            {pill.icon}
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight tabular-nums">{pill.value}</div>
              <div className="text-xs text-muted-foreground leading-tight truncate max-w-[120px]">{pill.sublabel}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Expandable LLM narrative — only shown when it exists */}
      {narrative && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowNarrative(prev => !prev)}
          >
            {showNarrative ? (
              <><ChevronUp className="h-3.5 w-3.5" />Hide full analysis</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" />Show full analysis</>
            )}
          </button>

          {showNarrative && (
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {narrative}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
