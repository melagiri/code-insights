import { type ReactNode, type ReactElement, isValidElement, cloneElement, Children } from 'react';

/**
 * Recursively walks React children and wraps matching text with <mark> tags.
 * Returns children unchanged if query is empty/whitespace.
 */
export function highlightText(children: ReactNode, query: string): ReactNode {
  if (!query || !query.trim()) return children;

  return processNode(children, query.toLowerCase());
}

function processNode(node: ReactNode, lowerQuery: string): ReactNode {
  if (typeof node === 'string') {
    return highlightString(node, lowerQuery);
  }

  if (typeof node === 'number') {
    return highlightString(String(node), lowerQuery);
  }

  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    const elementChildren = element.props.children;
    if (elementChildren == null) return node;
    return cloneElement(element, {
      ...element.props,
      children: processNode(elementChildren, lowerQuery),
    });
  }

  if (Array.isArray(node)) {
    return Children.map(node, (child) => processNode(child, lowerQuery));
  }

  return node;
}

function highlightString(text: string, lowerQuery: string): ReactNode {
  const lower = text.toLowerCase();
  const queryLen = lowerQuery.length;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = lower.indexOf(lowerQuery, lastIndex);
  let key = 0;

  while (matchIndex !== -1) {
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }
    parts.push(
      <mark
        key={key++}
        className="bg-yellow-200 dark:bg-yellow-500/30 rounded-sm"
      >
        {text.slice(matchIndex, matchIndex + queryLen)}
      </mark>
    );
    lastIndex = matchIndex + queryLen;
    matchIndex = lower.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex === 0) return text;

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
