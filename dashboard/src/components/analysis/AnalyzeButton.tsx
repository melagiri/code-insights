import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router';
import { useAnalysis } from './AnalysisContext';
import { useLlmConfig } from '@/hooks/useConfig';
import type { Session } from '@/lib/types';

interface AnalyzeButtonProps {
  session: Session;
  hasExistingInsights?: boolean;
  insightCount?: number;
}

export function AnalyzeButton({ session, hasExistingInsights, insightCount }: AnalyzeButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { state: analysisState, startAnalysis, cancelAnalysis } = useAnalysis();
  const { data: llmConfig } = useLlmConfig();

  const configured = !!(llmConfig?.provider && llmConfig?.model);

  const isAnalyzingThisSession =
    analysisState.status === 'analyzing' && analysisState.sessionId === session.id && analysisState.type === 'session';
  const isAnalyzingOther =
    analysisState.status === 'analyzing' && !isAnalyzingThisSession;
  const isCompleteForThisSession =
    (analysisState.status === 'complete' || analysisState.status === 'error') &&
    analysisState.sessionId === session.id &&
    analysisState.type === 'session';

  const handleAnalyze = () => {
    startAnalysis(session, 'session');
  };

  const handleClick = () => {
    if (hasExistingInsights && !isCompleteForThisSession) {
      setConfirmOpen(true);
    } else {
      handleAnalyze();
    }
  };

  const isReanalyze = hasExistingInsights || isCompleteForThisSession;

  if (!configured) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span>
          Configure an AI provider in{' '}
          <Link to="/settings" className="underline hover:text-foreground">
            Settings
          </Link>{' '}
          to analyze sessions
        </span>
      </div>
    );
  }

  if (isAnalyzingThisSession) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button disabled variant="outline" className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {analysisState.progress?.message || `Analyzing "${analysisState.sessionTitle}"...`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={cancelAnalysis}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (isAnalyzingOther) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button disabled variant="outline" className="gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysis in progress...
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Waiting for &quot;{analysisState.sessionTitle}&quot; to finish
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          onClick={handleClick}
          variant={isReanalyze ? 'outline' : 'default'}
          className="gap-2"
        >
          {isReanalyze ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              Re-analyze Session
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analyze Session
            </>
          )}
        </Button>

        {!isReanalyze && (
          <span className="text-xs text-muted-foreground">
            {session.message_count} messages
          </span>
        )}
      </div>

      {isReanalyze && !isCompleteForThisSession && (
        <p className="text-xs text-muted-foreground">
          Replaces existing insights. Uses LLM tokens.
        </p>
      )}

      {isCompleteForThisSession && analysisState.result?.success && (
        <div className="text-sm text-green-600">
          {analysisState.result.insightCount != null
            ? `Analysis complete! ${analysisState.result.insightCount} insight${analysisState.result.insightCount !== 1 ? 's' : ''} saved.`
            : 'Analysis complete! Insights saved.'}
        </div>
      )}

      {isCompleteForThisSession && !analysisState.result?.success && (
        <div className="flex items-start gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{analysisState.result?.error || 'Analysis failed'}</span>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-analyze this session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace {insightCount ?? 0} existing insight{(insightCount ?? 0) !== 1 ? 's' : ''} with new ones.
              This uses LLM tokens and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAnalyze}>Re-analyze</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
