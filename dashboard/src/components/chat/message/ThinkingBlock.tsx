import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';

interface ThinkingBlockProps {
  thinking: string;
}

function formatCharCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K chars`;
  }
  return `${count} chars`;
}

/**
 * Collapsed-by-default block showing Claude's internal reasoning (thinking content).
 * Shows a compact header with char count when collapsed.
 */
export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3 rounded-lg bg-amber-500/5 border border-amber-400/20 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-1.5 w-full px-4 py-2 text-left hover:bg-amber-500/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Brain className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Thinking</span>
        {!expanded && (
          <span className="text-xs text-amber-600/60 dark:text-amber-400/60">
            &middot; {formatCharCount(thinking.length)}
          </span>
        )}
        <div className="ml-auto shrink-0 text-amber-600/60 dark:text-amber-400/60">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <div className="text-sm text-muted-foreground italic prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_strong]:not-italic [&_strong]:text-amber-700 dark:[&_strong]:text-amber-300">
            <ReactMarkdown>{thinking}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
