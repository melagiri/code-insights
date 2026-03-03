import { useMemo } from 'react';
import { format } from 'date-fns';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot } from 'lucide-react';
import { ToolPanel } from '../tools/ToolPanel';
import { cn } from '@/lib/utils';
import type { Message, ToolCall, ToolResult } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { ThinkingBlock } from './ThinkingBlock';
import { AssistantMarkdown } from './markdown/AssistantMarkdown';
import { UserMarkdown } from './markdown/UserMarkdown';
import { parseAgentMessage } from './preprocess';
import { AgentMessageBubble } from './AgentMessageBubble';

interface MessageBubbleProps {
  message: Message;
  showHeader?: boolean;
  nextToolResults?: ToolResult[];
  sourceTool?: string;
  searchQuery?: string;
}

function getAssistantConfig(sourceTool?: string): { name: string; avatarColor: string } {
  switch (sourceTool) {
    case 'cursor':
      return { name: 'Cursor', avatarColor: 'bg-blue-500' };
    case 'codex-cli':
      return { name: 'Codex', avatarColor: 'bg-green-500' };
    case 'copilot':
      return { name: 'Copilot', avatarColor: 'bg-violet-500' };
    case 'copilot-cli':
      return { name: 'Copilot', avatarColor: 'bg-cyan-500' };
    case 'claude-code':
    default:
      return { name: 'Claude', avatarColor: 'bg-purple-500' };
  }
}

export function MessageBubble({ message, showHeader = true, nextToolResults = [], sourceTool, searchQuery }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';
  const hasContent = message.content?.trim();

  const toolCalls = parseJsonField<ToolCall[]>(message.tool_calls, []);
  const toolResults = parseJsonField<ToolResult[]>(message.tool_results, []);
  const hasToolCalls = toolCalls.length > 0;

  // Build result map from next message's tool_results (passed as prop) or own tool_results
  const allResults = nextToolResults.length > 0 ? nextToolResults : toolResults;
  const resultMap = useMemo(
    () => new Map((allResults || []).map(r => [r.toolUseId, r])),
    [allResults]
  );

  // Use dark code style — dashboard uses light background but code blocks look good dark
  const codeStyle = oneDark;

  // Detect and delegate agent coordination messages (task notifications, teammate messages).
  // Memoized to match the resultMap pattern — parse cost is non-trivial for large tool outputs.
  const agentMessage = useMemo(
    () => (isUser && hasContent) ? parseAgentMessage(message.content) : null,
    [isUser, hasContent, message.content]
  );
  if (agentMessage) {
    return <AgentMessageBubble parsed={agentMessage} timestamp={message.timestamp} />;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center py-2 px-4">
        <span className="text-xs text-muted-foreground italic">{message.content}</span>
      </div>
    );
  }

  if (isUser) {
    if (!hasContent) return null;
    return (
      <div className={cn('flex justify-end px-4', showHeader ? 'pt-4 pb-2' : 'pb-2')}>
        <div className="max-w-[80%]">
          {showHeader && (
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-xs text-muted-foreground">{format(new Date(message.timestamp), 'h:mm a')}</span>
              <span className="font-medium text-sm">You</span>
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-blue-500">
                <User className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
          )}
          <div className="bg-blue-500/10 text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
            <UserMarkdown content={message.content} searchQuery={searchQuery} />
          </div>
        </div>
      </div>
    );
  }

  const { name: assistantName, avatarColor } = getAssistantConfig(sourceTool);

  return (
    <div className={cn('px-4 bg-muted/30', showHeader ? 'pt-4 pb-2' : 'pb-2')}>
      <div>
        {showHeader && (
          <div className="flex items-center gap-2 mb-2">
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${avatarColor}`}>
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-medium text-sm">{assistantName}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(message.timestamp), 'h:mm a')}</span>
          </div>
        )}

        {message.thinking && <ThinkingBlock thinking={message.thinking} />}

        {hasContent ? (
          <AssistantMarkdown content={message.content} codeStyle={codeStyle} searchQuery={searchQuery} />
        ) : null}

        {hasToolCalls && (
          <div className="mt-2">
            {toolCalls.map((tc) => (
              <ToolPanel key={tc.id} toolCall={tc} result={resultMap.get(tc.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
