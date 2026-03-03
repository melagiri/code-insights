import { HelpCircle, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ToolCall, ToolResult } from '@/lib/types';
import { parseToolInput } from '../utils';
import { CollapsibleToolPanel } from '../CollapsibleToolPanel';

interface AskUserQuestionPanelProps {
  toolCall: ToolCall;
  result?: ToolResult;
}

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

function parseAnswers(resultText: string): Map<string, string> {
  const answers = new Map<string, string>();
  if (!resultText) return answers;

  const startMarker = 'your questions: ';
  const endMarker = '. You can now';
  const startIdx = resultText.indexOf(startMarker);
  const endIdx = resultText.indexOf(endMarker);

  if (startIdx === -1) return answers;

  const pairsStr = endIdx !== -1
    ? resultText.slice(startIdx + startMarker.length, endIdx)
    : resultText.slice(startIdx + startMarker.length);

  // Match "question"="answer" pairs
  const matches = [...pairsStr.matchAll(/"([^"]+)"="([^"]+)"/g)];
  for (const match of matches) {
    answers.set(match[1], match[2]);
  }

  return answers;
}

export function AskUserQuestionPanel({ toolCall, result }: AskUserQuestionPanelProps) {
  const input = parseToolInput(toolCall.input);
  const questions = (input.questions as Question[]) || [];
  const answers = parseAnswers(result?.output || '');
  const hasAnswers = answers.size > 0;

  if (questions.length === 0) return null;

  const firstQuestion = questions[0].question;
  const questionPreview = firstQuestion.length > 60
    ? firstQuestion.slice(0, 60) + '...'
    : firstQuestion;

  const summary = (
    <>
      <span className="text-xs text-muted-foreground truncate">{questionPreview}</span>
      {hasAnswers && (
        <Badge variant="outline" className="text-[10px] py-0 shrink-0 text-green-600 dark:text-green-400 border-green-500/20">
          <Check className="h-3 w-3 mr-0.5" />
          Answered
        </Badge>
      )}
    </>
  );

  return (
    <CollapsibleToolPanel
      icon={<HelpCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
      label={`Asked ${questions.length === 1 ? 'Question' : `${questions.length} Questions`}`}
      summary={summary}
      className="border-blue-500/20"
    >
      <div className="divide-y divide-border">
        {questions.map((q, i) => {
          const answer = answers.get(q.question);

          return (
            <div key={i} className="px-3 py-2 space-y-1.5">
              {q.header && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  {q.header}
                </span>
              )}

              <p className="text-sm text-foreground">{q.question}</p>

              {q.options && q.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt, j) => {
                    const isSelected = answer === opt.label;
                    return (
                      <Badge
                        key={j}
                        variant={isSelected ? 'default' : 'outline'}
                        className={isSelected ? 'text-[10px] bg-blue-500 hover:bg-blue-500 text-white' : 'text-[10px]'}
                        title={opt.description || undefined}
                      >
                        {opt.label}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {answer && (!q.options || !q.options.some(o => o.label === answer)) && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Answer:</span>
                  <Badge variant="default" className="text-[10px] bg-blue-500 hover:bg-blue-500 text-white">
                    {answer}
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleToolPanel>
  );
}
