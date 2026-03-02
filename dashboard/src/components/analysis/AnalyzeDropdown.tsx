import { useState } from 'react';
import { Sparkles, Loader2, X, ChevronDown, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface AnalyzeDropdownProps {
  session: Session;
  hasExistingInsights?: boolean;
  insightCount?: number;
  hasExistingPromptQuality?: boolean;
}

export function AnalyzeDropdown({
  session,
  hasExistingInsights,
  insightCount,
  hasExistingPromptQuality,
}: AnalyzeDropdownProps) {
  const [confirmSessionOpen, setConfirmSessionOpen] = useState(false);
  const [confirmPromptOpen, setConfirmPromptOpen] = useState(false);
  const { state: analysisState, startAnalysis, cancelAnalysis } = useAnalysis();
  const { data: llmConfig } = useLlmConfig();

  const configured = !!(llmConfig?.provider && llmConfig?.model);

  const isAnalyzingThisSession =
    analysisState.status === 'analyzing' && analysisState.sessionId === session.id;
  const isAnalyzingOther =
    analysisState.status === 'analyzing' && analysisState.sessionId !== session.id;
  const isCompleteForSession =
    analysisState.status === 'complete' &&
    analysisState.sessionId === session.id &&
    analysisState.type === 'session';

  const handleSessionAnalyze = () => {
    startAnalysis(session, 'session');
  };

  const handlePromptAnalyze = () => {
    startAnalysis(session, 'prompt_quality');
  };

  const handleSessionClick = () => {
    if (hasExistingInsights && !isCompleteForSession) {
      setConfirmSessionOpen(true);
    } else {
      handleSessionAnalyze();
    }
  };

  const handlePromptClick = () => {
    const isCompleteForPrompt =
      analysisState.status === 'complete' &&
      analysisState.sessionId === session.id &&
      analysisState.type === 'prompt_quality';

    if (hasExistingPromptQuality && !isCompleteForPrompt) {
      setConfirmPromptOpen(true);
    } else {
      handlePromptAnalyze();
    }
  };

  if (!configured) {
    return (
      <Link
        to="/settings"
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Configure AI in Settings
      </Link>
    );
  }

  if (isAnalyzingThisSession) {
    return (
      <div className="flex items-center gap-1.5">
        <Button disabled variant="outline" size="sm" className="h-8 gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">
            {analysisState.progress?.message || 'Analyzing...'}
          </span>
          <span className="sm:hidden">Analyzing...</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-muted-foreground hover:text-foreground"
          onClick={cancelAnalysis}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">Cancel</span>
        </Button>
      </div>
    );
  }

  if (isAnalyzingOther) {
    return (
      <div className="flex items-center gap-1.5">
        <Button disabled variant="outline" size="sm" className="h-8 gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analysis in progress...
        </Button>
        <span className="text-xs text-muted-foreground">
          Waiting for &quot;{analysisState.sessionTitle}&quot;
        </span>
      </div>
    );
  }

  const showPromptOption = session.user_message_count >= 2;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Analyze
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSessionClick}>
            <Sparkles className="h-4 w-4" />
            {hasExistingInsights ? 'Re-analyze Session' : 'Analyze Session'}
          </DropdownMenuItem>
          {showPromptOption && (
            <DropdownMenuItem onClick={handlePromptClick}>
              <Target className="h-4 w-4" />
              {hasExistingPromptQuality ? 'Re-analyze Prompt Quality' : 'Analyze Prompt Quality'}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmSessionOpen} onOpenChange={setConfirmSessionOpen}>
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
            <AlertDialogAction onClick={handleSessionAnalyze}>Re-analyze</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPromptOpen} onOpenChange={setConfirmPromptOpen}>
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
            <AlertDialogAction onClick={handlePromptAnalyze}>Re-analyze</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
