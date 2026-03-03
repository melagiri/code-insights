import { useState } from 'react';
import { Terminal } from 'lucide-react';
import type { ToolCall, ToolResult } from '@/lib/types';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';

interface GenericToolPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

export function GenericToolPanel({ toolCall, result }: GenericToolPanelProps) {
  const [showResult, setShowResult] = useState(false);

  let formattedInput = toolCall.input;
  try { formattedInput = JSON.stringify(JSON.parse(toolCall.input), null, 2); } catch { /* keep as-is */ }

  const resultText = result?.output || '';
  const hasResult = resultText.length > 0;

  const inputPreview = formattedInput.length > 60
    ? formattedInput.slice(0, 60) + '...'
    : formattedInput;

  const summary = (
    <>
      <span className="text-xs font-medium text-muted-foreground shrink-0">{toolCall.name}</span>
      <span className="text-[10px] text-muted-foreground/60 truncate">{inputPreview}</span>
    </>
  );

  return (
    <CollapsibleToolPanel
      icon={<Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      label="Tool"
      summary={summary}
    >
      <pre className="px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto max-h-48 whitespace-pre-wrap">
        {formattedInput}
      </pre>
      {hasResult && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowResult(!showResult)}
            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showResult ? 'Hide result' : 'Show result'}
          </button>
          {showResult && (
            <pre className="px-3 pb-2 text-xs font-mono text-muted-foreground overflow-x-auto max-h-48 whitespace-pre-wrap">
              {resultText}
            </pre>
          )}
        </div>
      )}
    </CollapsibleToolPanel>
  );
}
