import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { preprocessUserContent } from '../preprocess';
import { highlightText } from './HighlightText';

interface UserMarkdownProps {
  content: string;
  searchQuery?: string;
}

export function UserMarkdown({ content, searchQuery }: UserMarkdownProps) {
  const hl = useMemo(() => {
    if (!searchQuery) return (children: React.ReactNode) => children;
    return (children: React.ReactNode) => highlightText(children, searchQuery);
  }, [searchQuery]);

  const components = useMemo(() => {
    if (!searchQuery) return undefined;
    return {
      p({ children }: { children?: React.ReactNode }) {
        return <p>{hl(children)}</p>;
      },
      li({ children }: { children?: React.ReactNode }) {
        return <li>{hl(children)}</li>;
      },
    };
  }, [searchQuery, hl]);

  return (
    <div className="prose prose-sm max-w-none [&_p]:my-1 dark:prose-invert">
      <ReactMarkdown components={components}>
        {preprocessUserContent(content)}
      </ReactMarkdown>
    </div>
  );
}
