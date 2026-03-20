import { useState, useCallback } from 'react';

/**
 * Global command palette open/close state.
 * Only one palette exists in the DOM (mounted in Layout.tsx).
 * The open() callback is passed down via props to Header.
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, setIsOpen, open, close };
}
