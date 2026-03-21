import { useState } from 'react';
import { Target, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
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
import { useAnalysis } from './AnalysisContext';
import { useLlmConfig } from '@/hooks/useConfig';
import type { Session } from '@/lib/types';

interface AnalyzePromptQualityButtonProps {
  session: Session;
  hasExistingScore?: boolean;
}

export function AnalyzePromptQualityButton({ session, hasExistingScore }: AnalyzePromptQualityButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { getAnalysisState, startAnalysis, cancelAnalysis } = useAnalysis();
  const { data: llmConfig } = useLlmConfig();

  const configured = !!(llmConfig?.provider && llmConfig?.model);

  const analysisState = getAnalysisState(session.id, 'prompt_quality');
  const isAnalyzingThisSession = analysisState?.status === 'analyzing';
  const isCompleteForThisSession =
    analysisState?.status === 'complete' || analysisState?.status === 'error';

  const handleAnalyze = () => {
    startAnalysis(session, 'prompt_quality');
  };

  const handleClick = () => {
    if (hasExistingScore && !isCompleteForThisSession) {
      setConfirmOpen(true);
    } else {
      handleAnalyze();
    }
  };

  const isReanalyze = hasExistingScore || isCompleteForThisSession;

  if (!configured) {
    return null;
  }

  if (session.user_message_count < 2) {
    return null;
  }

  if (isAnalyzingThisSession) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button disabled variant="outline" size="sm" className="gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {analysisState?.progress?.message || 'Analyzing prompts...'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => cancelAnalysis(session.id, 'prompt_quality')}
          >
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        variant={isReanalyze ? 'outline' : 'secondary'}
        size="sm"
        className="gap-2"
      >
        {isReanalyze ? (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            Re-analyze Prompts
          </>
        ) : (
          <>
            <Target className="h-3.5 w-3.5" />
            Analyze Prompt Quality
          </>
        )}
      </Button>

      {isReanalyze && !isCompleteForThisSession && (
        <p className="text-xs text-muted-foreground">
          Replaces current score. Uses LLM tokens.
        </p>
      )}

      {isCompleteForThisSession && !analysisState?.result?.success && (
        <div className="flex items-start gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{analysisState?.result?.error || 'Analysis failed'}</span>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-analyze prompt quality?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current prompt quality score with a new one.
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
