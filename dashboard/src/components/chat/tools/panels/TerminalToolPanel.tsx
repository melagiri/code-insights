import { Terminal } from 'lucide-react';
import type { ToolCall, ToolResult } from '@/lib/types';
import { parseToolInput } from '../utils';
import { usePreviewText } from '../usePreview';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';

interface TerminalToolPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

export function TerminalToolPanel({ toolCall, result }: TerminalToolPanelProps) {
  const input = parseToolInput(toolCall.input);
  const command = (input.command as string) || '';
  const description = (input.description as string) || '';

  const PREVIEW_LINES = 10;
  const resultText = result?.output || '';
  const { hasMore, previewText, resultLines, showFull, toggle } = usePreviewText(resultText, PREVIEW_LINES);

  const truncatedCommand = command.length > 60 ? command.slice(0, 60) + '...' : command;

  const summary = (
    <code className="text-xs font-mono text-muted-foreground truncate">
      $ {truncatedCommand}
    </code>
  );

  return (
    <CollapsibleToolPanel
      icon={<Terminal className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
      label="Terminal"
      summary={summary}
      className="border-zinc-700/50"
      headerClassName="bg-zinc-800 dark:bg-zinc-900 hover:bg-zinc-700/80 dark:hover:bg-zinc-800/80"
    >
      <div className="bg-zinc-900 dark:bg-zinc-950 px-3 py-2 font-mono text-xs">
        {description && (
          <div className="text-[10px] text-zinc-500 truncate mb-1.5">{description}</div>
        )}

        <div className="text-green-400">
          <span className="text-zinc-500 select-none">$ </span>
          {command}
        </div>

        {resultText && (
          <>
            <div className="mt-1.5 border-t border-zinc-800 pt-1.5">
              <pre className="text-zinc-300 whitespace-pre-wrap overflow-x-auto max-h-64">
                {previewText}
              </pre>
            </div>
            {hasMore && (
              <button
                onClick={toggle}
                className="text-xs text-zinc-500 hover:text-zinc-400 mt-1"
              >
                {showFull ? 'Show less' : `Show full output (${resultLines.length} lines)`}
              </button>
            )}
          </>
        )}
      </div>
    </CollapsibleToolPanel>
  );
}
