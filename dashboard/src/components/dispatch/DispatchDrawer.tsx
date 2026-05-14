import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, AlertCircle, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { generateDispatch } from '@/lib/api';
import { PostPreview } from './PostPreview';
import type { Insight } from '@/lib/types';
import type { DispatchTone, DispatchFormat, DispatchResponse } from '@/lib/api';

const FORMAT_OPTIONS: { value: DispatchFormat; label: string; description: string }[] = [
  { value: 'blog', label: 'Blog post', description: 'Full narrative, 800-1000 words, markdown ready to paste to dev.to / Hashnode' },
  { value: 'linkedin', label: 'LinkedIn', description: 'Hook-first, 150-250 words, optimized for LinkedIn feed' },
];

const TONE_OPTIONS: { value: DispatchTone; label: string; description: string }[] = [
  { value: 'technical', label: 'Technical deep-dive', description: 'For senior engineers — precise, depth-first' },
  { value: 'accessible', label: 'Accessible', description: 'Broader audience — clear, with analogies' },
  { value: 'quick-tips', label: 'Quick tips', description: 'Scannable — bold tips + brief context' },
];

const INSIGHT_TYPE_COLORS: Record<string, string> = {
  learning: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  decision: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  technique: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  summary: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
  prompt_quality: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
};

interface SortableInsightItemProps {
  insight: Insight;
  onRemove: (id: string) => void;
}

function SortableInsightItem({ insight, onRemove }: SortableInsightItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: insight.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const colorClass = INSIGHT_TYPE_COLORS[insight.type] ?? INSIGHT_TYPE_COLORS.summary;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm"
    >
      <button
        className="mt-0.5 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        aria-description="Press Space or Enter to pick up, arrow keys to move, Space or Enter to drop"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass}`}>
            {insight.type.replace('_', ' ')}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{insight.summary || insight.title}</p>
      </div>
      <button
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
        onClick={() => onRemove(insight.id)}
        aria-label="Remove insight"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface DispatchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInsights: Insight[];
  onReorder: (insights: Insight[]) => void;
  onRemove: (id: string) => void;
}

export function DispatchDrawer({
  open,
  onOpenChange,
  selectedInsights,
  onReorder,
  onRemove,
}: DispatchDrawerProps) {
  const [context, setContext] = useState('');
  const [format, setFormat] = useState<DispatchFormat>('blog');
  const [tone, setTone] = useState<DispatchTone>('technical');
  const [result, setResult] = useState<DispatchResponse | null>(null);

  const mutation = useMutation({
    mutationFn: generateDispatch,
    onSuccess: (data) => setResult(data),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedInsights.findIndex((i) => i.id === active.id);
    const newIndex = selectedInsights.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(selectedInsights, oldIndex, newIndex));
  }, [selectedInsights, onReorder]);

  function handleGenerate() {
    mutation.mutate({
      insightIds: selectedInsights.map((i) => i.id),
      context,
      tone,
      format,
    });
  }

  function handleClose() {
    onOpenChange(false);
    // Reset generation result when drawer closes so next open starts fresh
    setResult(null);
    mutation.reset();
  }

  const canGenerate = selectedInsights.length >= 3 && context.trim().length > 0 && !mutation.isPending;
  const contextTooLong = context.length > 500;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[480px] flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle>Create Post</SheetTitle>
          <SheetDescription>
            Curate insights and context, then generate a publishable post.
          </SheetDescription>
        </SheetHeader>

        {result ? (
          <PostPreview result={result} />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Selected insights with drag-to-reorder */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Selected ({selectedInsights.length})
                {selectedInsights.length > 0 && (
                  <span className="ml-1 normal-case font-normal">— drag to reorder</span>
                )}
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={selectedInsights.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {selectedInsights.map((insight) => (
                      <SortableInsightItem
                        key={insight.id}
                        insight={insight}
                        onRemove={onRemove}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {selectedInsights.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No insights selected. Close this panel and select at least 3 from the list.
                </p>
              )}
            </div>

            {/* Context textarea */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {"What's the story?"}
              </label>
              <Textarea
                rows={4}
                maxLength={500}
                placeholder="2-3 sentences framing the narrative. What did you build or discover? Why does it matter?"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="resize-none"
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-muted-foreground">
                  This shapes the arc — the model reads it before the insights.
                </p>
                <span className={`text-xs ${contextTooLong ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {context.length}/500
                </span>
              </div>
            </div>

            {/* Format selector */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Format</p>
              <div className="space-y-1.5">
                {FORMAT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                      format === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispatch-format"
                      value={opt.value}
                      checked={format === opt.value}
                      onChange={() => setFormat(opt.value)}
                      className="mt-0.5 shrink-0 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Tone selector */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tone</p>
              <div className="space-y-1.5">
                {TONE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                      tone === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispatch-tone"
                      value={opt.value}
                      checked={tone === opt.value}
                      onChange={() => setTone(opt.value)}
                      className="mt-0.5 shrink-0 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Error */}
            {mutation.isError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{mutation.error instanceof Error ? mutation.error.message : 'Generation failed. Please try again.'}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!result && (
          <div className="shrink-0 px-4 py-3 border-t">
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={!canGenerate || contextTooLong}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Post'
              )}
            </Button>
            {!context.trim() && selectedInsights.length >= 3 && (
              <p className="text-xs text-muted-foreground text-center mt-1.5">
                Add a context paragraph to enable generation
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="shrink-0 px-4 py-3 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setResult(null); mutation.reset(); }}
            >
              Regenerate
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
