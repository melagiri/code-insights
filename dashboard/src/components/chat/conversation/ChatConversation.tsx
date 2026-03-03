import { useEffect, useRef, useMemo } from 'react';
import { MessageBubble } from '../message/MessageBubble';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Message, ToolResult } from '@/lib/types';
import { parseJsonField } from '@/lib/types';
import { DateSeparator } from './DateSeparator';
import { LoadMoreSentinel } from './LoadMoreSentinel';
import { isAgentMessage } from '../message/preprocess';

interface ChatConversationProps {
  messages: Message[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  error?: string | null;
  sourceTool?: string;
  highlightMessageId?: string | null;
  searchQuery?: string;
}

/**
 * Determines if a date separator should be shown before a message.
 * Shows a separator at the start and whenever the hour changes.
 */
function shouldShowDateSeparator(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  const prevHour = new Date(prev.timestamp);
  prevHour.setMinutes(0, 0, 0);
  const currHour = new Date(curr.timestamp);
  currHour.setMinutes(0, 0, 0);
  return prevHour.getTime() !== currHour.getTime();
}

export function ChatConversation({
  messages, loading, loadingMore, hasMore, onLoadMore, error, sourceTool, highlightMessageId, searchQuery,
}: ChatConversationProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  // Only pass searchQuery to messages that actually match, so the highlight
  // walker doesn't run on every message in large conversations (1000+).
  const matchingMessageIds = useMemo(() => {
    if (!searchQuery) return new Set<string>();
    const lowerQuery = searchQuery.toLowerCase();
    return new Set(
      messages
        .filter((m) => m.content.toLowerCase().includes(lowerQuery))
        .map((m) => m.id)
    );
  }, [messages, searchQuery]);

  useEffect(() => {
    if (highlightMessageId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightMessageId]);
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No messages in this session
      </div>
    );
  }

  const shouldShowHeader = (index: number): boolean => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.type !== curr.type) return true;
    // Break grouping when transitioning between real user messages and agent messages
    if (curr.type === 'user' && curr.content && prev.content) {
      const currIsAgent = isAgentMessage(curr.content);
      const prevIsAgent = isAgentMessage(prev.content);
      if (currIsAgent !== prevIsAgent) return true;
    }
    return false;
  };

  return (
    <div className="w-full px-2">
      {messages.map((message, index) => {
        const isHighlighted = highlightMessageId === message.id;
        return (
          <div
            key={message.id}
            id={`msg-${message.id}`}
            ref={isHighlighted ? highlightRef : undefined}
            className={cn(
              'py-1 transition-colors duration-300',
              isHighlighted && 'ring-2 ring-primary rounded-lg bg-primary/5'
            )}
          >
            {shouldShowDateSeparator(messages, index) && (
              <DateSeparator timestamp={message.timestamp} />
            )}
            <MessageBubble
              message={message}
              showHeader={shouldShowHeader(index)}
              sourceTool={sourceTool}
              searchQuery={matchingMessageIds.has(message.id) ? searchQuery : undefined}
              nextToolResults={
                messages[index + 1]?.type === 'user'
                  ? parseJsonField<ToolResult[]>(messages[index + 1].tool_results, [])
                  : []
              }
            />
          </div>
        );
      })}

      {loadingMore && (
        <div className="space-y-4 p-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <LoadMoreSentinel onLoadMore={onLoadMore} loadingMore={loadingMore} />
      )}
    </div>
  );
}
