import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { captureDispatchCalloutDismissed } from '@/lib/telemetry';

interface DispatchDiscoveryCalloutProps {
  onTryIt: () => void;
  onDismiss: () => void;
}

export function DispatchDiscoveryCallout({ onTryIt, onDismiss }: DispatchDiscoveryCalloutProps) {
  const [fading, setFading] = useState(false);

  function dismiss(via: 'x' | 'not_now') {
    captureDispatchCalloutDismissed(via);
    setFading(true);
    setTimeout(() => onDismiss(), 150);
  }

  function handleTryIt() {
    captureDispatchCalloutDismissed('try_it');
    setFading(true);
    onTryIt();
    // Dismiss after a short delay to let drawer open first
    setTimeout(() => onDismiss(), 150);
  }

  return (
    <div
      className={`rounded-lg border bg-muted/40 px-4 py-3 mb-4 transition-opacity duration-150 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Turn this session into a writeup</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your patterns and friction points are ready — generate a blog post or LinkedIn writeup in one click.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" onClick={handleTryIt}>
              Try it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss('not_now')}>
              Not now
            </Button>
          </div>

        </div>
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => dismiss('x')}
          aria-label="Dismiss callout"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
