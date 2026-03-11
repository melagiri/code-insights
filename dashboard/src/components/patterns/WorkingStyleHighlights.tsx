/**
 * WorkingStyleHighlights — auto-generated bullet summary of the week's working style.
 * Bullets are derived from props (no LLM call here). The full LLM narrative is
 * available via an expandable "Show full analysis" toggle below the bullets.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

  // Build bullet list from available data
  const bullets: string[] = [];

  if (topCharacter) {
    bullets.push(`Mostly ${formatCharacterName(topCharacter.name)} sessions (${topCharacter.percentage}%)`);
  }

  if (totalSessions > 0) {
    bullets.push(`${successCount}/${totalSessions} sessions completed successfully`);
  }

  if (topFriction) {
    bullets.push(`Top friction: ${topFriction.category} (${topFriction.count} occurrence${topFriction.count !== 1 ? 's' : ''})`);
  }

  if (topPattern) {
    bullets.push(`Strongest pattern: ${topPattern.label} (${topPattern.frequency}x)`);
  }

  if (bullets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {/* Expandable narrative — only shown when it exists */}
      {narrative && (
        <div className="mt-3">
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
