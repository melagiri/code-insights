import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { CopyButton } from '../CopyButton';
import { cn } from '@/lib/utils';
import { preprocessInsightBlocks } from '../preprocess';
import { highlightText } from './HighlightText';

interface AssistantMarkdownProps {
  content: string;
  codeStyle: SyntaxHighlighterProps['style'];
  searchQuery?: string;
}

export function AssistantMarkdown({ content, codeStyle, searchQuery }: AssistantMarkdownProps) {
  const hl = useMemo(() => {
    if (!searchQuery) return (children: React.ReactNode) => children;
    return (children: React.ReactNode) => highlightText(children, searchQuery);
  }, [searchQuery]);

  const components = useMemo(() => ({
    p({ children }: { children?: React.ReactNode }) {
      return <p>{hl(children)}</p>;
    },
    li({ children }: { children?: React.ReactNode }) {
      return <li>{hl(children)}</li>;
    },
    blockquote({ children }: { children?: React.ReactNode }) {
      return (
        <div className="my-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3 not-prose">
          {children}
        </div>
      );
    },
    table({ children }: { children?: React.ReactNode }) {
      return (
        <div className="my-3 overflow-x-auto">
          <table className="min-w-full text-sm border-collapse border border-border">
            {children}
          </table>
        </div>
      );
    },
    th({ children }: { children?: React.ReactNode }) {
      return (
        <th className="border border-border bg-muted/50 px-3 py-1.5 text-left text-xs font-medium">
          {hl(children)}
        </th>
      );
    },
    td({ children }: { children?: React.ReactNode }) {
      return (
        <td className="border border-border px-3 py-1.5 text-sm">
          {hl(children)}
        </td>
      );
    },
    code(props: { children?: React.ReactNode; className?: string; [key: string]: unknown }) {
      const { children, className, ...rest } = props;
      const langMatch = /language-(\w+)/.exec(className || '');
      const isBlock = !!langMatch;
      const codeString = String(children).replace(/\n$/, '');
      if (isBlock) {
        return (
          <div className="relative group/code my-3">
            <div className="flex items-center justify-between px-4 py-1.5 bg-muted rounded-t-lg border-b border-border">
              <span className="text-xs text-muted-foreground">{langMatch[1]}</span>
            </div>
            <CopyButton text={codeString} />
            <SyntaxHighlighter
              style={codeStyle}
              language={langMatch[1]}
              PreTag="div"
              customStyle={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        );
      }
      return (
        <code className={cn('px-1.5 py-0.5 rounded bg-muted text-sm', className)} {...rest}>
          {children}
        </code>
      );
    },
  }), [hl, codeStyle]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {preprocessInsightBlocks(content)}
      </ReactMarkdown>
    </div>
  );
}
