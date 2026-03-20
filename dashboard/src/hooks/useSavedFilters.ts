import { useState, useCallback } from 'react';

const STORAGE_KEY = 'code-insights:saved-filters';
const MAX_PER_PAGE = 10;

export interface SavedFilter {
  id: string;
  name: string;
  page: 'sessions' | 'insights';
  filters: Record<string, string>;
  createdAt: string;
}

function readStorage(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedFilter[];
  } catch {
    return [];
  }
}

function writeStorage(filters: SavedFilter[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

/**
 * CRUD operations for saved filters in localStorage.
 * Page-specific: sessions and insights have separate saved filter lists.
 */
export function useSavedFilters(page: 'sessions' | 'insights') {
  const [, setVersion] = useState(0);
  const forceUpdate = useCallback(() => setVersion((v) => v + 1), []);

  const savedFilters = readStorage().filter((f) => f.page === page);

  const saveFilter = useCallback(
    (name: string, filters: Record<string, string>) => {
      const all = readStorage();
      const pageFilters = all.filter((f) => f.page === page);
      if (pageFilters.length >= MAX_PER_PAGE) {
        // Remove the oldest to stay under limit
        const oldest = pageFilters[0];
        const pruned = all.filter((f) => f.id !== oldest.id);
        const newFilter: SavedFilter = {
          id: crypto.randomUUID(),
          name,
          page,
          filters,
          createdAt: new Date().toISOString(),
        };
        writeStorage([...pruned, newFilter]);
      } else {
        const newFilter: SavedFilter = {
          id: crypto.randomUUID(),
          name,
          page,
          filters,
          createdAt: new Date().toISOString(),
        };
        writeStorage([...all, newFilter]);
      }
      forceUpdate();
    },
    [page, forceUpdate]
  );

  const deleteFilter = useCallback(
    (id: string) => {
      const all = readStorage();
      writeStorage(all.filter((f) => f.id !== id));
      forceUpdate();
    },
    [forceUpdate]
  );

  return { savedFilters, saveFilter, deleteFilter };
}
