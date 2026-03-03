import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';
import type { Message } from '@/lib/types';

interface ConversationSearchProps {
  messages: Message[];
  onHighlightMessage: (messageId: string | null) => void;
  onSearchQueryChange?: (query: string) => void;
  fetchAllMessages?: () => void;
  isLoadingAll?: boolean;
}

export function ConversationSearch({
  messages,
  onHighlightMessage,
  onSearchQueryChange,
  fetchAllMessages,
  isLoadingAll,
}: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const matches = useMemo(
    () =>
      debouncedQuery
        ? messages
            .filter((m) => m.content.toLowerCase().includes(debouncedQuery.toLowerCase()))
            .map((m) => m.id)
        : [],
    [messages, debouncedQuery]
  );

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setMatchIndex(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    onHighlightMessage(matches[matchIndex] ?? null);
  }, [matches, matchIndex, onHighlightMessage]);

  useEffect(() => {
    onSearchQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onSearchQueryChange]);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (value && fetchAllMessages) fetchAllMessages();
    },
    [fetchAllMessages]
  );

  const prev = useCallback(() => {
    setMatchIndex((i) => (i > 0 ? i - 1 : matches.length - 1));
  }, [matches.length]);

  const next = useCallback(() => {
    setMatchIndex((i) => (i < matches.length - 1 ? i + 1 : 0));
  }, [matches.length]);

  const clear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setMatchIndex(0);
    onHighlightMessage(null);
    onSearchQueryChange?.('');
  }, [onHighlightMessage, onSearchQueryChange]);

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-2 flex items-center gap-2">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        placeholder="Search conversation..."
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        className="h-8 text-sm"
      />
      {isLoadingAll && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
      {debouncedQuery && (
        <>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {matches.length > 0 ? `${matchIndex + 1} of ${matches.length}` : 'No matches'}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={prev} disabled={matches.length === 0}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={next} disabled={matches.length === 0}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clear}>
            <X className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
