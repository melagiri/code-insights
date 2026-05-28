import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { analyzeSession } from '@/lib/api';
import { useLlmConfig } from '@/hooks/useConfig';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@/lib/types';

interface BulkAnalyzeButtonProps {
  sessions: Session[];
  onComplete?: () => void;
}

export function BulkAnalyzeButton({ sessions, onComplete }: BulkAnalyzeButtonProps) {
  const [open, setOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<{
    successful: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const { data: llmConfig } = useLlmConfig();
  const queryClient = useQueryClient();

  const configured = !!(llmConfig?.provider && llmConfig?.model);

  const handleAnalyze = async () => {
    if (!configured || sessions.length === 0) return;

    setAnalyzing(true);
    setProgress({ completed: 0, total: sessions.length });
    setResult(null);

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      try {
        await analyzeSession(session.id);
        successful++;
      } catch (error) {
        failed++;
        errors.push(error instanceof Error ? error.message : `Failed: ${session.id}`);
      }
      setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
    }

    // Invalidate all insight queries
    queryClient.invalidateQueries({ queryKey: ['insights'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });

    setResult({ successful, failed, errors });
    setAnalyzing(false);
    onComplete?.();
  };

  const handleClose = () => {
    if (!analyzing) {
      setOpen(false);
      setResult(null);
      setProgress({ completed: 0, total: 0 });
    }
  };

  if (!configured) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Sparkles className="h-4 w-4" />
        Analyze Selected
        <span className="text-xs text-muted-foreground ml-1">(Configure AI first)</span>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={sessions.length === 0}
          onClick={() => setOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          Analyze {sessions.length} Session{sessions.length !== 1 ? 's' : ''}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Analysis</DialogTitle>
          <DialogDescription>
            Generate AI insights for {sessions.length} selected session
            {sessions.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!analyzing && !result && (
            <>
              <p className="text-sm text-muted-foreground">
                This will use your configured LLM provider to analyze each session and generate insights.
              </p>
              <Button onClick={handleAnalyze} className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                Start Analysis
              </Button>
            </>
          )}

          {analyzing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  Analyzing session {progress.completed} of {progress.total}...
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>
                  {result.successful} session{result.successful !== 1 ? 's' : ''} analyzed successfully
                </span>
              </div>
              {result.failed > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    <span>{result.failed} failed</span>
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc list-inside max-h-32 overflow-y-auto">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="truncate">{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
