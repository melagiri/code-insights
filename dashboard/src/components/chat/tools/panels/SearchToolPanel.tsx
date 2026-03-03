import { Search, FolderSearch } from 'lucide-react';
import type { ToolCall, ToolResult } from '@/lib/types';
import { parseToolInput } from '../utils';
import { usePreviewLines } from '../usePreview';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';
import { Badge } from '@/components/ui/badge';

interface SearchToolPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

export function SearchToolPanel({ toolCall, result }: SearchToolPanelProps) {
  const input = parseToolInput(toolCall.input);
  const isGrep = toolCall.name === 'Grep';
  const Icon = isGrep ? Search : FolderSearch;

  const pattern = (input.pattern as string) || '';
  const searchPath = (input.path as string) || '';

  const resultText = result?.output || '';
  const resultLines = resultText.split('\n').filter(l => l.trim());
  const PREVIEW_LINES = 15;
  const { hasMore, previewLines, showFull, toggle } = usePreviewLines(resultLines, PREVIEW_LINES);

  const summary = (
    <>
      <Badge variant="outline" className="text-[10px] py-0 shrink-0 font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
        {pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern}
      </Badge>
      <span className="text-[10px] text-muted-foreground shrink-0">
        {resultLines.length} result{resultLines.length !== 1 ? 's' : ''}
      </span>
    </>
  );

  return (
    <CollapsibleToolPanel
      icon={<Icon className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
      label={isGrep ? 'Search' : 'Find Files'}
      summary={summary}
    >
      {resultText ? (
        <div className="px-3 py-2">
          <div className="space-y-0.5">
            {previewLines.map((line, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground truncate" title={line}>
                {line}
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={toggle}
              className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 mt-1.5"
            >
              {showFull ? 'Show less' : `Show all (${resultLines.length} results)`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
          No matches found
        </div>
      )}
    </CollapsibleToolPanel>
  );
}
