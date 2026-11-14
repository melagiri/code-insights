import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/useProjects';
import { useInsights } from '@/hooks/useInsights';
import { useExportGenerate } from '@/hooks/useExport';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  Bot,
  BookOpen,
  Layers,
  Zap,
  Library,
  Folder,
  Globe,
  NotebookPen,
  StickyNote,
} from 'lucide-react';
import type { ExportGenerateFormat, ExportGenerateScope, ExportGenerateDepth } from '@/lib/api';

type WizardStep = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1 as WizardStep, label: 'Scope' },
  { n: 2 as WizardStep, label: 'Configure' },
  { n: 3 as WizardStep, label: 'Generate' },
  { n: 4 as WizardStep, label: 'Review' },
];

const DEPTH_CAPS: Record<ExportGenerateDepth, number> = {
  essential: 25,
  standard: 80,
  comprehensive: 200,
};

export default function ExportPage() {
  const { data: projects = [] } = useProjects();
  const { data: allInsights = [] } = useInsights();
  const { state: exportState, generate, cancel, reset: resetExport } = useExportGenerate();

  const [step, setStep] = useState<WizardStep>(1);
  const [scope, setScope] = useState<ExportGenerateScope | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [format_, setFormat] = useState<ExportGenerateFormat>('agent-rules');
  const [depth, setDepth] = useState<ExportGenerateDepth>('standard');
  const [copied, setCopied] = useState(false);

  // Compute insight counts for the stat bar in Step 2
  const { scopedInsights, depthCappedCount } = useMemo(() => {
    // Exclude summaries — they're per-session artifacts, not cross-session knowledge
    const nonSummary = allInsights.filter((i) => i.type !== 'summary');

    const scopedInsights = scope === 'project' && projectId
      ? nonSummary.filter((i) => i.project_id === projectId)
      : nonSummary;

    const depthCap = DEPTH_CAPS[depth];
    const depthCappedCount = Math.min(scopedInsights.length, depthCap);

    return { scopedInsights, depthCappedCount };
  }, [allInsights, scope, projectId, depth]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const hasInsights = scopedInsights.length > 0;

  const getFilename = (): string => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const projectSlug = selectedProject?.name
      ? selectedProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : 'all-projects';
    const scopeSlug = scope === 'project' ? projectSlug : 'all-projects';
    return `${scopeSlug}-${format_}-${today}.md`;
  };

  const handleGoToStep2 = () => {
    if (scope === 'project' && !projectId) {
      toast.error('Please select a project before continuing.');
      return;
    }
    setStep(2);
  };

  const handleStartGeneration = async () => {
    if (!scope) return;
    setStep(3);

    await generate({
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      format: format_,
      depth,
    });
  };

  // Auto-advance to Step 4 when generation completes
  const isComplete = exportState.status === 'complete';
  const isError = exportState.status === 'error';

  const handleGoToReview = () => {
    if (isComplete) setStep(4);
  };

  const handleDownload = () => {
    if (!exportState.content?.trim()) return;
    const blob = new Blob([exportState.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Export downloaded.');
  };

  const handleCopy = async () => {
    if (!exportState.content?.trim()) return;
    try {
      await navigator.clipboard.writeText(exportState.content);
      setCopied(true);
      toast.success('Copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  };

  const handleStartOver = () => {
    cancel();
    resetExport();
    setStep(1);
    setScope(null);
    setProjectId('');
    setFormat('agent-rules');
    setDepth('standard');
    setCopied(false);
  };

  const handleCancelGeneration = () => {
    cancel();
    setStep(2);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-muted-foreground">Synthesize insights across sessions using AI</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                step === s.n
                  ? 'bg-primary text-primary-foreground'
                  : step > s.n
                    ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <span>{s.n}</span>
              <span>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Scope ── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose what to synthesize. The AI will read across sessions and produce curated, deduplicated knowledge.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <ExportTypeCard
              icon={Globe}
              title="All Projects"
              description="Synthesize insights from all your sessions. Rules are labeled by scope (universal vs. project-specific)."
              selected={scope === 'all'}
              onSelect={() => { setScope('all'); setProjectId(''); }}
            />
            <ExportTypeCard
              icon={Folder}
              title="Single Project"
              description="Focus on one project's insights. All rules are implicitly scoped to that project."
              selected={scope === 'project'}
              onSelect={() => setScope('project')}
            />
          </div>

          {scope === 'project' && (
            <div className="max-w-sm">
              <label className="text-sm font-medium mb-1.5 block">Project</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleGoToStep2}
              disabled={!scope || (scope === 'project' && !projectId)}
            >
              Next: Configure
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Configure ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Format */}
          <div>
            <p className="text-sm font-medium mb-3">Output Format</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <ExportTypeCard
                icon={Bot}
                title="Agent Rules"
                description="Imperative instructions for CLAUDE.md or .cursorrules"
                selected={format_ === 'agent-rules'}
                onSelect={() => setFormat('agent-rules')}
              />
              <ExportTypeCard
                icon={BookOpen}
                title="Knowledge Brief"
                description="Readable markdown — decisions, learnings, and techniques"
                selected={format_ === 'knowledge-brief'}
                onSelect={() => setFormat('knowledge-brief')}
              />
              <ExportTypeCard
                icon={NotebookPen}
                title="Obsidian"
                description="Markdown with YAML frontmatter and wikilinks"
                selected={format_ === 'obsidian'}
                onSelect={() => setFormat('obsidian')}
              />
              <ExportTypeCard
                icon={StickyNote}
                title="Notion"
                description="Notion-compatible markdown with toggle blocks and callouts"
                selected={format_ === 'notion'}
                onSelect={() => setFormat('notion')}
              />
            </div>
          </div>

          {/* Depth */}
          <div>
            <p className="text-sm font-medium mb-3">Depth</p>
            <div className="grid gap-3 md:grid-cols-3">
              <ExportTypeCard
                icon={Zap}
                title="Essential"
                description="Top rules only. Fast and focused."
                selected={depth === 'essential'}
                onSelect={() => setDepth('essential')}
              />
              <ExportTypeCard
                icon={Layers}
                title="Standard"
                description="Key decisions, learnings, and techniques."
                selected={depth === 'standard'}
                onSelect={() => setDepth('standard')}
              />
              <ExportTypeCard
                icon={Library}
                title="Comprehensive"
                description="Everything available. Most thorough."
                selected={depth === 'comprehensive'}
                onSelect={() => setDepth('comprehensive')}
              />
            </div>
          </div>

          {/* Stat bar */}
          <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-lg font-bold">{scopedInsights.length}</p>
              <p className="text-xs text-muted-foreground">Total insights</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {depthCappedCount < scopedInsights.length
                  ? `~${depthCappedCount} of ${scopedInsights.length}`
                  : scopedInsights.length}
              </p>
              <p className="text-xs text-muted-foreground">Insights to synthesize</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {scopedInsights.filter((i) => i.type === 'decision').length}
              </p>
              <p className="text-xs text-muted-foreground">Decisions</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {scopedInsights.filter((i) => i.type === 'learning').length}
              </p>
              <p className="text-xs text-muted-foreground">Learnings</p>
            </div>
          </div>

          {!hasInsights && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No insights found for this scope. Run analysis on some sessions first.
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handleStartGeneration} disabled={!hasInsights}>
              Generate with AI
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Generate ── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                {(exportState.status === 'loading_insights' || exportState.status === 'synthesizing') && (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="space-y-1">
                      <p className="font-medium">
                        {exportState.status === 'loading_insights'
                          ? 'Loading insights...'
                          : 'Synthesizing with AI...'}
                      </p>
                      {exportState.status === 'loading_insights' && exportState.insightCount !== null && (
                        <p className="text-sm text-muted-foreground">
                          {exportState.totalInsights !== null && exportState.insightCount < exportState.totalInsights
                            ? `Using ${exportState.insightCount} of ${exportState.totalInsights} insights`
                            : `${exportState.insightCount} insights`}
                        </p>
                      )}
                      {exportState.status === 'synthesizing' && (
                        <p className="text-sm text-muted-foreground">
                          This may take 10–30 seconds depending on your LLM provider.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {isComplete && (
                  <>
                    <div className="h-8 w-8 rounded-full bg-green-500/15 flex items-center justify-center">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Generation complete</p>
                      <p className="text-sm text-muted-foreground">
                        {exportState.metadata?.insightCount} insight{exportState.metadata?.insightCount !== 1 ? 's' : ''} synthesized
                      </p>
                    </div>
                  </>
                )}

                {isError && (
                  <>
                    <div className="h-8 w-8 rounded-full bg-destructive/15 flex items-center justify-center">
                      <span className="text-destructive font-bold text-sm">!</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-destructive">Generation failed</p>
                      <p className="text-sm text-muted-foreground">{exportState.error}</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            {(exportState.status === 'loading_insights' || exportState.status === 'synthesizing') && (
              <>
                <Button variant="outline" onClick={handleCancelGeneration}>
                  Cancel
                </Button>
                <span />
              </>
            )}
            {isComplete && (
              <>
                <Button variant="outline" onClick={handleCancelGeneration}>
                  Back
                </Button>
                <Button onClick={handleGoToReview}>
                  Review Export
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            )}
            {isError && (
              <>
                <Button variant="outline" onClick={handleCancelGeneration}>
                  Back
                </Button>
                <Button onClick={handleStartGeneration}>
                  Try Again
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Export ── */}
      {step === 4 && !!exportState.content?.trim() && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Generated Export</CardTitle>
                  <CardDescription>
                    {exportState.metadata && (
                      <>
                        {exportState.metadata.sessionCount} session{exportState.metadata.sessionCount !== 1 ? 's' : ''}{' '}
                        &bull;{' '}
                        {exportState.metadata.insightCount} insight{exportState.metadata.insightCount !== 1 ? 's' : ''} synthesized
                        {exportState.metadata.insightCount < exportState.metadata.totalInsights && (
                          <> of {exportState.metadata.totalInsights} available</>
                        )}
                      </>
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline">{getFilename()}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[32rem] overflow-y-auto">
                {exportState.content}
              </pre>
            </CardContent>
          </Card>

          <div className="flex justify-between flex-wrap gap-2">
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download .md
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared card component ────────────────────────────────────────────────────

function ExportTypeCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
