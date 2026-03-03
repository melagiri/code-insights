import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AGENT_PARTICIPANT_COLORS, AGENT_DEFAULT_COLOR } from '@/lib/constants/colors';
import type { ToolCall, ToolResult } from '@/lib/types';
import { parseToolInput } from '../utils';
import { usePreviewText } from '../usePreview';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';

interface AgentToolPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

function getAgentDisplayName(input: Record<string, unknown>): string {
  return (input.name as string) || (input.subagent_type as string) || 'Agent';
}

function getAgentInitials(name: string): string {
  const parts = name.split(/[-_\s]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AgentToolPanel({ toolCall, result }: AgentToolPanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const input = parseToolInput(toolCall.input);

  const description = (input.description as string) || '';
  const subagentType = (input.subagent_type as string) || '';
  const model = (input.model as string) || '';
  const prompt = (input.prompt as string) || '';
  const agentName = getAgentDisplayName(input);
  const initials = getAgentInitials(agentName);
  const avatarColor = AGENT_PARTICIPANT_COLORS[subagentType] || AGENT_DEFAULT_COLOR;

  const PREVIEW_LINES = 20;
  const resultText = result?.output || '';
  const { hasMore, previewText, resultLines, showFull, toggle } = usePreviewText(resultText, PREVIEW_LINES);

  const descriptionPreview = description.length > 60
    ? description.slice(0, 60) + '...'
    : description;

  const summary = (
    <>
      {descriptionPreview && (
        <span className="text-xs text-muted-foreground truncate">{descriptionPreview}</span>
      )}
      {subagentType && (
        <Badge variant="outline" className="text-[10px] py-0 shrink-0">{subagentType}</Badge>
      )}
    </>
  );

  return (
    <div className="my-3">
      <CollapsibleToolPanel
        icon={<Users className="h-3.5 w-3.5 text-purple-500 shrink-0" />}
        label="Agent"
        summary={summary}
        className="border-purple-500/20"
      >
        <div className="px-3 py-2 space-y-2">
          {description && (
            <p className="text-sm font-medium text-foreground">&quot;{description}&quot;</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {subagentType && (
              <Badge variant="outline" className="text-[10px]">{subagentType}</Badge>
            )}
            {model && (
              <Badge variant="outline" className="text-[10px]">{model}</Badge>
            )}
          </div>

          {prompt && (
            <div>
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPrompt ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>Prompt ({prompt.length.toLocaleString()} chars)</span>
              </button>
              {showPrompt && (
                <pre className="mt-1 px-3 py-2 bg-muted/40 rounded text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-64">
                  {prompt}
                </pre>
              )}
            </div>
          )}
        </div>
      </CollapsibleToolPanel>

      {resultText && (
        <div className="mt-2 pl-4 border-l-2 border-purple-400/40">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={cn('shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold', avatarColor)}>
              {initials}
            </div>
            <span className="font-medium text-xs text-foreground">{agentName}</span>
            <span className="text-[10px] text-muted-foreground">responded</span>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
            <ReactMarkdown>{previewText}</ReactMarkdown>
            {hasMore && (
              <button
                onClick={toggle}
                className="text-xs text-purple-500 hover:text-purple-600 mt-1 not-prose"
              >
                {showFull ? 'Show less' : `Show full response (${resultLines.length} lines)`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
