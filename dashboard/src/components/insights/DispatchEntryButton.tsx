import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionCharacter } from '@/lib/types';

const QUALIFYING_TYPES = new Set<SessionCharacter>(['feature_build', 'deep_focus', 'bug_hunt', 'refactor']);

interface DispatchEntryButtonProps {
  sessionCharacter: SessionCharacter | null | undefined;
  facetsLoaded: boolean;
  onClick: () => void;
}

export function DispatchEntryButton({ sessionCharacter, facetsLoaded, onClick }: DispatchEntryButtonProps) {
  if (!sessionCharacter || !QUALIFYING_TYPES.has(sessionCharacter) || !facetsLoaded) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <PenLine className="h-4 w-4 mr-1.5" />
      Write about this
    </Button>
  );
}
