import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useSessions } from '@/hooks/useSessions';
import { useInsights } from '@/hooks/useInsights';
import { useProjects } from '@/hooks/useProjects';
import { useExportMarkdown } from '@/hooks/useExport';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Calendar, Folder, ChevronRight, Loader2, Copy, Check, BookOpen, Bot } from 'lucide-react';

type ExportType = 'everything' | 'project' | 'daily';
type ExportTemplate = 'knowledge-base' | 'agent-rules';
type WizardStep = 1 | 2 | 3;

export default function ExportPage() {
  const { data: projects = [] } = useProjects();
  const { data: sessions = [] } = useSessions({ limit: 1000 });
  const { data: insights = [] } = useInsights();
  const exportMutation = useExportMarkdown();

  const [step, setStep] = useState<WizardStep>(1);
  const [exportType, setExportType] = useState<ExportType | null>(null);
  const [template, setTemplate] = useState<ExportTemplate>('knowledge-base');
  const [projectId, setProjectId] = useState<string>('');
  const [dailyDate, setDailyDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Compute counts for the current config
  const { filteredSessions, filteredInsights } = useMemo(() => {
    let filteredSessions = sessions;
    let filteredInsights = insights;

    if (exportType === 'project' && projectId) {
      filteredSessions = sessions.filter((s) => s.project_id === projectId);
      filteredInsights = insights.filter((i) => i.project_id === projectId);
    }

    if (exportType === 'daily') {
      const date = dailyDate;
      filteredSessions = sessions.filter((s) => s.started_at.startsWith(date));
      filteredInsights = insights.filter((i) => i.timestamp.startsWith(date));
    }

    return { filteredSessions, filteredInsights };
  }, [sessions, insights, exportType, projectId, dailyDate]);

  const getFilename = (): string => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const suffix = template === 'agent-rules' ? 'agent-rules' : 'knowledge-base';
    if (exportType === 'daily') return `daily-digest-${dailyDate}-${suffix}.md`;
    if (exportType === 'project') {
      const projectName = projects.find((p) => p.id === projectId)?.name || 'project';
      return `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}-${today}.md`;
    }
    return `code-insights-${suffix}-${today}.md`;
  };

  const handleGoToPreview = async () => {
    if (exportType === 'project' && !projectId) {
      toast.error('Please select a project before continuing.');
      return;
    }

    try {
      const body =
        exportType === 'project'
          ? { projectId, template }
          : exportType === 'daily'
            ? {
                sessionIds: filteredSessions.map((s) => s.id),
                template,
              }
            : { template };

      const content = await exportMutation.mutateAsync(body);
      setPreviewContent(content);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleDownload = async () => {
    if (!previewContent) return;

    const blob = new Blob([previewContent], { type: 'text/markdown' });
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
    if (!previewContent) return;
    try {
      await navigator.clipboard.writeText(previewContent);
      setCopied(true);
      toast.success('Copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  };

  const handleReset = () => {
    setStep(1);
    setExportType(null);
    setPreviewContent(null);
    setCopied(false);
  };

  const steps = [
    { n: 1 as WizardStep, label: 'What to export' },
    { n: 2 as WizardStep, label: 'Configure' },
    { n: 3 as WizardStep, label: 'Preview & Download' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-muted-foreground">Download your insights as markdown</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((s, i) => (
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
            {i < steps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: What to export */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">What would you like to export?</p>
          <div className="grid gap-4 md:grid-cols-3">
            <ExportTypeCard
              icon={FileText}
              title="Everything"
              description="All sessions and insights"
              selected={exportType === 'everything'}
              onSelect={() => setExportType('everything')}
            />
            <ExportTypeCard
              icon={Folder}
              title="Project"
              description="All insights from a single project"
              selected={exportType === 'project'}
              onSelect={() => setExportType('project')}
            />
            <ExportTypeCard
              icon={Calendar}
              title="Daily Digest"
              description="Sessions from a specific day"
              selected={exportType === 'daily'}
              onSelect={() => setExportType('daily')}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!exportType}>
              Next: Configure
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configure Export</CardTitle>
              <CardDescription>
                {exportType === 'everything' && 'All sessions and insights will be exported.'}
                {exportType === 'project' && 'Select a project to export its insights.'}
                {exportType === 'daily' && 'Select the date for the daily digest.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {exportType === 'project' && (
                <div>
                  <label className="text-sm font-medium">Project</label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="mt-1">
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

              {exportType === 'daily' && (
                <div>
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}

              {/* Template selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">Template</label>
                <div className="grid gap-3 md:grid-cols-2">
                  <TemplateCard
                    icon={BookOpen}
                    title="Knowledge Base"
                    description="Full insights organized for reading and sharing"
                    selected={template === 'knowledge-base'}
                    onSelect={() => setTemplate('knowledge-base')}
                  />
                  <TemplateCard
                    icon={Bot}
                    title="Agent Rules"
                    description="Imperative instructions for CLAUDE.md and cursor rules"
                    selected={template === 'agent-rules'}
                    onSelect={() => setTemplate('agent-rules')}
                  />
                </div>
              </div>

              {/* Filtered counts */}
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-lg font-bold">{filteredSessions.length}</p>
                  <p className="text-xs text-muted-foreground">Sessions</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{filteredInsights.length}</p>
                  <p className="text-xs text-muted-foreground">Insights</p>
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {filteredInsights.filter((i) => i.type === 'decision').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Decisions</p>
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {filteredInsights.filter((i) => i.type === 'learning').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Learnings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handleGoToPreview} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Preview Export
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Download */}
      {step === 3 && previewContent !== null && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>
                    First ~20 lines of your export &mdash; {filteredSessions.length} session
                    {filteredSessions.length !== 1 ? 's' : ''}, {filteredInsights.length} insight
                    {filteredInsights.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Badge variant="outline">{getFilename()}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {previewContent.split('\n').slice(0, 20).join('\n')}
                {previewContent.split('\n').length > 20 && '\n\n... (truncated preview)'}
              </pre>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
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
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function TemplateCard({
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
      className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
