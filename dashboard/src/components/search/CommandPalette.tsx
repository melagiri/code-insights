import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router';
import {
  LayoutDashboard,
  MessageSquare,
  Lightbulb,
  BarChart3,
  Sparkles,
  Settings,
  Download,
  Search,
  SearchX,
  Clock,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearch } from '@/hooks/useSearch';
import { SessionSearchResult, InsightSearchResult } from './SearchResult';
import type { SearchSessionResult, SearchInsightResult } from '@/lib/api';

const RECENT_KEY = 'code-insights:recent-searches';
const MAX_RECENT = 5;

interface RecentItem {
  id: string;
  title: string;
  type: 'session' | 'insight';
  href: string;
  timestamp: number;
}

function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(item: Omit<RecentItem, 'timestamp'>): void {
  const existing = readRecent().filter((r) => r.id !== item.id);
  const next = [{ ...item, timestamp: Date.now() }, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

const NAV_ITEMS = [
  { label: 'Go to Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Go to Sessions', href: '/sessions', icon: MessageSquare },
  { label: 'Go to Insights', href: '/insights', icon: Lightbulb },
  { label: 'Go to Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Go to Patterns', href: '/patterns', icon: Sparkles },
  { label: 'Go to Export', href: '/export', icon: Download },
  { label: 'Go to Settings', href: '/settings', icon: Settings },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type ResultItem =
  | { kind: 'session'; data: SearchSessionResult }
  | { kind: 'insight'; data: SearchInsightResult }
  | { kind: 'nav'; label: string; href: string; icon: typeof LayoutDashboard }
  | { kind: 'recent'; item: RecentItem };

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: searchData, isLoading } = useSearch(deferredQuery, 20);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery('');
      setActiveIndex(0);
      setShowAllSessions(false);
      setShowAllInsights(false);
    }
  }, [isOpen]);

  const recent = isOpen && !query ? readRecent() : [];

  // Build the flat list of navigable items for keyboard nav
  const sessions = searchData?.sessions ?? [];
  const insights = searchData?.insights ?? [];
  const INITIAL_SHOW = 3;

  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, INITIAL_SHOW);
  const visibleInsights = showAllInsights ? insights : insights.slice(0, INITIAL_SHOW);

  // Filter nav items when query is present (partial match)
  const filteredNav = query
    ? NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS;

  const flatItems: ResultItem[] = [];
  if (!query) {
    for (const item of recent) {
      flatItems.push({ kind: 'recent', item });
    }
    for (const n of filteredNav) {
      flatItems.push({ kind: 'nav', label: n.label, href: n.href, icon: n.icon });
    }
  } else {
    for (const s of visibleSessions) {
      flatItems.push({ kind: 'session', data: s });
    }
    for (const i of visibleInsights) {
      flatItems.push({ kind: 'insight', data: i });
    }
    for (const n of filteredNav) {
      flatItems.push({ kind: 'nav', label: n.label, href: n.href, icon: n.icon });
    }
  }

  const handleNavigate = useCallback(
    (href: string, item?: { id: string; title: string; type: 'session' | 'insight' }) => {
      if (item) {
        pushRecent({ id: item.id, title: item.title, type: item.type, href });
      }
      navigate(href);
      onClose();
    },
    [navigate, onClose]
  );

  const activateItem = useCallback(
    (item: ResultItem) => {
      if (item.kind === 'session') {
        handleNavigate(`/sessions?session=${item.data.id}`, {
          id: item.data.id,
          title: item.data.title,
          type: 'session',
        });
      } else if (item.kind === 'insight') {
        handleNavigate(`/insights?insight=${item.data.id}&view=timeline`, {
          id: item.data.id,
          title: item.data.title,
          type: 'insight',
        });
      } else if (item.kind === 'nav') {
        handleNavigate(item.href);
      } else if (item.kind === 'recent') {
        handleNavigate(item.item.href);
      }
    },
    [handleNavigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query) {
          setQuery('');
          setActiveIndex(0);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) activateItem(item);
      }
    },
    [query, flatItems, activeIndex, activateItem, onClose]
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  const hasResults = sessions.length > 0 || insights.length > 0;
  const showNoResults = query.trim().length >= 2 && !isLoading && !hasResults && filteredNav.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="p-0 gap-0 max-w-[540px] w-[calc(100vw-2rem)] overflow-hidden"
        onKeyDown={handleKeyDown}
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 border-b h-12">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions, insights, projects..."
            className="border-0 shadow-none focus-visible:ring-0 h-10 text-base px-0"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setActiveIndex(0); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[60vh]">
          {isLoading && query.trim().length >= 2 ? (
            <div className="px-4 py-3 space-y-2">
              {[0.8, 0.6, 0.7].map((w, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="h-4 w-4 rounded shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={`h-3.5 rounded`} style={{ width: `${w * 100}%` }} />
                    <Skeleton className="h-3 rounded w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : showNoResults ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6 space-y-2">
              <SearchX className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-muted-foreground">Try different keywords or check spelling.</p>
            </div>
          ) : (
            <div>
              {/* No query: Recent items */}
              {!query && recent.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent
                    </span>
                  </div>
                  {recent.map((item, i) => {
                    const flatIdx = flatItems.findIndex((f) => f.kind === 'recent' && f.item.id === item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleNavigate(item.href)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          flatIdx === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                      >
                        {item.type === 'session' ? (
                          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <Lightbulb className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-muted-foreground truncate">{item.title}</div>
                          <div className="text-xs text-muted-foreground/50 capitalize">{item.type}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sessions results */}
              {query && sessions.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sessions ({sessions.length})
                  </div>
                  {visibleSessions.map((s) => {
                    const flatIdx = flatItems.findIndex((f) => f.kind === 'session' && f.data.id === s.id);
                    return (
                      <SessionSearchResult
                        key={s.id}
                        result={s}
                        query={query}
                        isActive={flatIdx === activeIndex}
                        onClick={() =>
                          handleNavigate(`/sessions?session=${s.id}`, {
                            id: s.id,
                            title: s.title,
                            type: 'session',
                          })
                        }
                      />
                    );
                  })}
                  {!showAllSessions && sessions.length > INITIAL_SHOW && (
                    <button
                      onClick={() => setShowAllSessions(true)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 px-4 text-left transition-colors"
                    >
                      +{sessions.length - INITIAL_SHOW} more sessions...
                    </button>
                  )}
                </div>
              )}

              {/* Insights results */}
              {query && insights.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Insights ({insights.length})
                  </div>
                  {visibleInsights.map((ins) => {
                    const flatIdx = flatItems.findIndex((f) => f.kind === 'insight' && f.data.id === ins.id);
                    return (
                      <InsightSearchResult
                        key={ins.id}
                        result={ins}
                        query={query}
                        isActive={flatIdx === activeIndex}
                        onClick={() =>
                          handleNavigate(`/insights?insight=${ins.id}&view=timeline`, {
                            id: ins.id,
                            title: ins.title,
                            type: 'insight',
                          })
                        }
                      />
                    );
                  })}
                  {!showAllInsights && insights.length > INITIAL_SHOW && (
                    <button
                      onClick={() => setShowAllInsights(true)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 px-4 text-left transition-colors"
                    >
                      +{insights.length - INITIAL_SHOW} more insights...
                    </button>
                  )}
                </div>
              )}

              {/* Quick Actions (nav items) — always shown when query is empty; filtered when query present */}
              {filteredNav.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Quick Actions
                    </span>
                  </div>
                  {filteredNav.map((n) => {
                    const flatIdx = flatItems.findIndex(
                      (f) => f.kind === 'nav' && f.href === n.href
                    );
                    const NavIcon = n.icon;
                    return (
                      <div
                        key={n.href}
                        onClick={() => handleNavigate(n.href)}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          flatIdx === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                      >
                        <NavIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{n.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
