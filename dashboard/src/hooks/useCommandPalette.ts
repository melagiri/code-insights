import { useState, useEffect, useCallback } from 'react';

let globalOpen: ((v: boolean) => void) | null = null;

/**
 * Global command palette open/close state.
 * Only one palette exists in the DOM (mounted in Layout.tsx).
 * useCommandPalette() can be called from any component to open it.
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  // Register global setter so Header search hint can open it without prop drilling
  useEffect(() => {
    globalOpen = setIsOpen;
    return () => {
      if (globalOpen === setIsOpen) globalOpen = null;
    };
  }, [setIsOpen]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, setIsOpen, open, close };
}

/** Open the command palette from anywhere (e.g. Header search hint click). */
export function openCommandPalette() {
  globalOpen?.(true);
}
