'use client';

import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Cog } from 'lucide-react';
import { ToolCallBadge } from './ToolCallBadge';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  return (
    <div className={cn(
      'flex gap-3 p-4',
      isUser ? 'bg-muted/50' : 'bg-background'
    )}>
      {/* Avatar */}
      <div className={cn(
        'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        isUser ? 'bg-blue-500' : isSystem ? 'bg-gray-500' : 'bg-purple-500'
      )}>
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isSystem ? (
          <Cog className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {isUser ? 'You' : isSystem ? 'System' : 'Claude'}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(message.timestamp, 'h:mm a')}
          </span>
        </div>

        {/* Message content with markdown */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            components={{
              code(props) {
                const { children, className, ...rest } = props;
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match;
                return !isInline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Tool calls */}
        {message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
