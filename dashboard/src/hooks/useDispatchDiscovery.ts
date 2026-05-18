import { useState, useCallback } from 'react';

const KEY_DISMISSED = 'ci.dispatch.calloutDismissed';
const KEY_OPENED = 'ci.dispatch.opened';

export function useDispatchDiscovery() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY_DISMISSED) === '1');
  const [opened, setOpened] = useState(() => localStorage.getItem(KEY_OPENED) === '1');

  const markCalloutDismissed = useCallback(() => {
    localStorage.setItem(KEY_DISMISSED, '1');
    setDismissed(true);
  }, []);

  const markDispatchOpened = useCallback(() => {
    localStorage.setItem(KEY_OPENED, '1');
    setOpened(true);
  }, []);

  const shouldShowCallout = !dismissed && !opened;

  return { shouldShowCallout, markCalloutDismissed, markDispatchOpened };
}
