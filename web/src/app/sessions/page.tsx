'use client';

import { useState } from 'react';
import { useProjects, useSessions, fetchMessages } from '@/lib/hooks/useFirestore';
import { SessionCard } from '@/components/sessions/SessionCard';
import { BulkAnalyzeButton } from '@/components/analysis/BulkAnalyzeButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';
import type { SessionFilters } from '@/lib/types';

export default function SessionsPage() {
  const { projects } = useProjects();
  const [filters, setFilters] = useState<SessionFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { sessions, loading, error } = useSessions(filters, 50);

  // Filter sessions by search term (client-side)
  const filteredSessions = sessions.filter((session) => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return (
      session.summary?.toLowerCase().includes(searchLower) ||
      session.generatedTitle?.toLowerCase().includes(searchLower) ||
      session.projectName.toLowerCase().includes(searchLower)
    );
  });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map(s => s.id)));
    }
  };

  const selectedSessions = sessions.filter(s => selectedIds.has(s.id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">Browse your Claude Code sessions</p>
        </div>
        {filteredSessions.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.size === filteredSessions.length && filteredSessions.length > 0}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all sessions"
            />
            <span className="text-sm text-muted-foreground">Select All</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.projectId || 'all'}
          onValueChange={(value) =>
            setFilters({ ...filters, projectId: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            className="pl-9"
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
      </div>

      {/* Session List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Error loading sessions: {error}</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No sessions found.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1">claudeinsight sync</code> to sync your sessions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <div key={session.id} className="flex items-start gap-3">
              <Checkbox
                checked={selectedIds.has(session.id)}
                onCheckedChange={() => toggleSelection(session.id)}
                className="mt-4"
                aria-label={`Select session ${session.summary || session.generatedTitle || 'Untitled'}`}
              />
              <div className="flex-1">
                <SessionCard session={session} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <BulkAnalyzeButton
            sessions={selectedSessions}
            getMessages={fetchMessages}
            onComplete={() => setSelectedIds(new Set())}
          />
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
