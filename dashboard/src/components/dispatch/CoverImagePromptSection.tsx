import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generateDispatchImagePrompt } from '@/lib/api';
import type { DispatchFormat } from '@/lib/api';

interface CoverImagePromptSectionProps {
  title: string;
  tags: string[];
  tldr: string;
  format: DispatchFormat;
}

export function CoverImagePromptSection({ title, tags, tldr, format }: CoverImagePromptSectionProps) {
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => generateDispatchImagePrompt({ title, tags, tldr, format }),
  });

  function handleCopy() {
    if (!mutation.data) return;
    void navigator.clipboard.writeText(mutation.data.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Prompt copied to clipboard');
    });
  }

  function handleRegenerate() {
    mutation.reset();
    mutation.mutate();
  }

  return (
    <div className="shrink-0 border-t px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cover image prompt</p>

      {!mutation.data && !mutation.isPending && !mutation.isError && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => mutation.mutate()}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Get cover image prompt
        </Button>
      )}

      {mutation.isPending && (
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating prompt...
        </Button>
      )}

      {mutation.isError && (
        <div className="space-y-2">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to generate prompt.'}
            </AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => mutation.mutate()}>
            Retry
          </Button>
        </div>
      )}

      {mutation.data && (
        <div className="space-y-2">
          <Textarea
            readOnly
            rows={4}
            value={mutation.data.prompt}
            className="resize-none text-sm"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={handleRegenerate}
            >
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
