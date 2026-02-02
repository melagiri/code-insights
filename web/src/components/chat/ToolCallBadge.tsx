'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal, FileText, Edit, FolderSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ToolCall } from '@/lib/types';

const TOOL_ICONS: Record<string, React.ElementType> = {
  Bash: Terminal,
  Read: FileText,
  Write: Edit,
  Edit: Edit,
  Glob: FolderSearch,
  Grep: FolderSearch,
};

const TOOL_DESCRIPTIONS: Record<string, (input: string) => string> = {
  Bash: (input) => {
    try {
      const parsed = JSON.parse(input);
      return parsed.command?.slice(0, 60) || 'Executed command';
    } catch {
      return 'Executed command';
    }
  },
  Read: (input) => {
    try {
      const parsed = JSON.parse(input);
      const path = parsed.file_path || '';
      return `Read ${path.split('/').pop() || 'file'}`;
    } catch {
      return 'Read file';
    }
  },
  Write: (input) => {
    try {
      const parsed = JSON.parse(input);
      const path = parsed.file_path || '';
      return `Wrote ${path.split('/').pop() || 'file'}`;
    } catch {
      return 'Wrote file';
    }
  },
  Edit: (input) => {
    try {
      const parsed = JSON.parse(input);
      const path = parsed.file_path || '';
      return `Edited ${path.split('/').pop() || 'file'}`;
    } catch {
      return 'Edited file';
    }
  },
  Glob: () => 'Searched files',
  Grep: () => 'Searched code',
};

interface ToolCallBadgeProps {
  toolCall: ToolCall;
  expandable?: boolean;
}

export function ToolCallBadge({ toolCall, expandable = true }: ToolCallBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[toolCall.name] || Terminal;
  const getDescription = TOOL_DESCRIPTIONS[toolCall.name] || (() => toolCall.name);

  return (
    <div className="my-1">
      <Badge
        variant="secondary"
        className="cursor-pointer gap-1.5 font-normal"
        onClick={() => expandable && setExpanded(!expanded)}
      >
        <Icon className="h-3 w-3" />
        <span>{getDescription(toolCall.input)}</span>
        {expandable && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </Badge>
      {expanded && (
        <pre className="mt-1 p-2 text-xs bg-muted rounded-md overflow-x-auto max-h-40">
          {toolCall.input}
        </pre>
      )}
    </div>
  );
}
