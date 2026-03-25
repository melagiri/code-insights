import { useState } from 'react';
import { Link } from 'react-router';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLlmConfig } from '@/hooks/useConfig';

interface LlmNudgeBannerProps {
  context: 'insights' | 'patterns';
}

const COPY: Record<LlmNudgeBannerProps['context'], { title: string; description: string }> = {
  insights: {
    title: 'Get AI-powered insights',
    description:
      'Configure a provider to extract decisions, learnings, and patterns from your sessions.',
  },
  patterns: {
    title: 'Enable cross-session pattern detection',
    description:
      'An AI provider is required to generate weekly friction and pattern analysis.',
  },
};

function localStorageKey(context: LlmNudgeBannerProps['context']): string {
  return `code-insights:llm-nudge-dismissed-${context}`;
}

export function LlmNudgeBanner({ context }: LlmNudgeBannerProps) {
  const { data: llmConfig, isLoading: configLoading } = useLlmConfig();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(localStorageKey(context)) === 'true';
    } catch {
      return false;
    }
  });

  // Don't render until config has resolved (prevents flash)
  if (configLoading) return null;

  // Don't show if LLM is already configured
  if (llmConfig?.provider) return null;

  // Don't show if user dismissed
  if (dismissed) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(localStorageKey(context), 'true');
    } catch { /* ignore storage errors */ }
    setDismissed(true);
  }

  const { title, description } = COPY[context];

  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5">
          {description}{' '}
          <span className="text-muted-foreground">
            Install{' '}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Ollama
            </a>{' '}
            for free, local analysis — or configure any provider in Settings.
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
          <Link to="/settings">Configure AI Provider</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
