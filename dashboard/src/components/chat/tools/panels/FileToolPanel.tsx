import { FileText, FilePen, FilePlus2 } from 'lucide-react';
import type { ToolCall, ToolResult } from '@/lib/types';
import { parseToolInput } from '../utils';
import { usePreviewText } from '../usePreview';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';
import { Badge } from '@/components/ui/badge';

interface FileToolPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function detectLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', rs: 'Rust', go: 'Go', md: 'Markdown', json: 'JSON',
    css: 'CSS', html: 'HTML', yaml: 'YAML', yml: 'YAML', sh: 'Shell',
    sql: 'SQL', toml: 'TOML',
  };
  return ext ? map[ext] || null : null;
}

export function FileToolPanel({ toolCall, result }: FileToolPanelProps) {
  const input = parseToolInput(toolCall.input);
  const filePath = (input.file_path as string) || '';
  const fileName = getFileName(filePath);
  const lang = detectLanguage(filePath);

  const isRead = toolCall.name === 'Read';
  const isEdit = toolCall.name === 'Edit';
  const isWrite = toolCall.name === 'Write';

  const Icon = isRead ? FileText : isEdit ? FilePen : FilePlus2;
  const label = isRead ? 'Read' : isEdit ? 'Edited' : 'Wrote';

  const oldString = isEdit ? (input.old_string as string) || '' : '';
  const newString = isEdit ? (input.new_string as string) || '' : '';

  const resultText = result?.output || '';
  const PREVIEW_LINES = 8;
  const { hasMore, previewText, resultLines, showFull, toggle } = usePreviewText(resultText, PREVIEW_LINES);

  const summary = (
    <>
      <code className="text-xs text-muted-foreground font-mono truncate" title={filePath}>
        {fileName || 'file'}
      </code>
      <Badge variant="outline" className="text-[10px] py-0 shrink-0">{label}</Badge>
      {lang && <span className="text-[10px] text-muted-foreground/60 shrink-0">{lang}</span>}
    </>
  );

  return (
    <CollapsibleToolPanel
      icon={<Icon className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
      label="File"
      summary={summary}
    >
      {isEdit && (oldString || newString) && (
        <div className="text-xs font-mono overflow-x-auto">
          {oldString && (
            <div className="bg-red-500/8 px-3 py-1.5 border-b border-border">
              <span className="text-red-500/60 select-none mr-2">-</span>
              <span className="text-red-700 dark:text-red-400 whitespace-pre-wrap">{oldString.length > 500 ? oldString.slice(0, 500) + '...' : oldString}</span>
            </div>
          )}
          {newString && (
            <div className="bg-green-500/8 px-3 py-1.5">
              <span className="text-green-500/60 select-none mr-2">+</span>
              <span className="text-green-700 dark:text-green-400 whitespace-pre-wrap">{newString.length > 500 ? newString.slice(0, 500) + '...' : newString}</span>
            </div>
          )}
        </div>
      )}

      {isRead && resultText && (
        <div className="px-3 py-2">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-64">
            {previewText}
          </pre>
          {hasMore && (
            <button
              onClick={toggle}
              className="text-xs text-blue-500 hover:text-blue-600 mt-1"
            >
              {showFull ? 'Show less' : `Show full output (${resultLines.length} lines)`}
            </button>
          )}
        </div>
      )}

      {isWrite && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          Created {fileName ? <code className="font-mono">{fileName}</code> : 'file'}
        </div>
      )}
    </CollapsibleToolPanel>
  );
}
