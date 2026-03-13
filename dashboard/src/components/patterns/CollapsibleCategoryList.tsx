/**
 * CollapsibleCategoryList — shared list component for friction categories
 * and effective patterns. Rows are collapsed by default; click to expand
 * and reveal description sub-items.
 *
 * Used in both the Friction Points card and Effective Patterns card
 * to avoid duplicating list rendering logic.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DRIVER_LABELS, DRIVER_STYLES } from '@/lib/constants/patterns';

export interface CategoryItem {
  category: string;
  count: number;
  severity?: number;       // friction only — used for badge color
  color?: string;          // friction only — hex color from frictionBarColor()
  descriptions: string[];  // examples (friction) or descriptions (patterns)
  driver?: string | null;  // patterns only — dominant driver key
}

interface CollapsibleCategoryListProps {
  items: CategoryItem[];
  variant: 'friction' | 'pattern';
  maxVisible?: number;     // default 5 — items beyond this are hidden behind "+N more"
}

const MAX_DESC_VISIBLE = 3;

export function CollapsibleCategoryList({
  items,
  variant,
  maxVisible = 5,
}: CollapsibleCategoryListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  function toggle(category: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  const visibleItems = showAll ? items : items.slice(0, maxVisible);
  const hiddenCount = items.length - maxVisible;

  return (
    <ul className="divide-y">
      {visibleItems.map((item) => {
        const isExpanded = expanded.has(item.category);
        const hasDescriptions = item.descriptions.length > 0;

        return (
          <li key={item.category} className="py-2 first:pt-0 last:pb-0">
            {/* Row — always a button for accessibility */}
            <button
              type="button"
              className="w-full text-left flex items-center gap-3 hover:bg-muted/50 rounded-md px-2 -mx-2 py-1 transition-colors"
              onClick={() => toggle(item.category)}
              aria-expanded={isExpanded}
            >
              {/* Per-row 2px left color indicator */}
              {variant === 'friction' && item.color ? (
                <span
                  className="w-0.5 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
              ) : variant === 'pattern' ? (
                <span className="w-0.5 h-4 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0" aria-hidden="true" />
              ) : null}

              {/* Count badge */}
              {variant === 'friction' && item.color ? (
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold shrink-0"
                  style={{ backgroundColor: `${item.color}20`, color: item.color }}
                >
                  {item.count}x
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary shrink-0">
                  {item.count}x
                </span>
              )}

              {/* Category name */}
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{item.category}</span>

              {/* Driver badge — patterns only */}
              {variant === 'pattern' && item.driver && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium shrink-0 ${DRIVER_STYLES[item.driver] ?? 'bg-muted text-muted-foreground'}`}>
                  {DRIVER_LABELS[item.driver] ?? item.driver}
                </span>
              )}

              {/* Expand/collapse chevron — only shown when there are descriptions */}
              {hasDescriptions && (
                <span className="shrink-0 text-muted-foreground">
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />
                  }
                </span>
              )}
            </button>

            {/* Expandable description sub-items */}
            {isExpanded && hasDescriptions && (
              <ul className="ml-8 mt-1 space-y-1 pb-1 bg-muted/30 rounded-md p-2">
                {item.descriptions.slice(0, MAX_DESC_VISIBLE).map((desc, j) => (
                  <li key={j} className="text-xs text-muted-foreground">{desc}</li>
                ))}
                {item.descriptions.length > MAX_DESC_VISIBLE && (
                  <li className="text-xs text-muted-foreground italic">
                    +{item.descriptions.length - MAX_DESC_VISIBLE} more
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}

      {/* Show more / less toggle */}
      {!showAll && hiddenCount > 0 && (
        <li className="pt-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAll(true)}
          >
            +{hiddenCount} more
          </button>
        </li>
      )}
      {showAll && items.length > maxVisible && (
        <li className="pt-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAll(false)}
          >
            Show less
          </button>
        </li>
      )}
    </ul>
  );
}
