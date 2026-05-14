import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Copy, Download, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DispatchResponse } from '@/lib/api';

interface PostPreviewProps {
  result: DispatchResponse;
}

export function PostPreview({ result }: PostPreviewProps) {
  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');
  const [copied, setCopied] = useState(false);

  const isLinkedIn = result.format === 'linkedin';

  // LinkedIn: copy body (no YAML). Blog: copy full markdown with frontmatter.
  const copyText = isLinkedIn ? result.body : result.markdown;

  function handleCopy() {
    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    });
  }

  function handleDownload() {
    const slug = result.frontmatter.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const filename = `${slug || 'dispatch-post'}.md`;
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  }

  // Blog: strip YAML frontmatter for clean prose in preview tab.
  const blogBodyOnly = result.markdown.replace(/^---[\s\S]*?---\n\n?/, '');

  const countLabel = isLinkedIn
    ? `${result.characterCount} chars`
    : `${result.wordCount} words`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b shrink-0">
        {isLinkedIn ? (
          // LinkedIn: no Markdown tab — there is no .md artifact for LinkedIn posts
          <span className="text-sm font-medium">Preview</span>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'preview' | 'markdown')}>
            <TabsList variant="default" className="h-8">
              <TabsTrigger value="preview" className="text-xs px-3">Preview</TabsTrigger>
              <TabsTrigger value="markdown" className="text-xs px-3">Markdown</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{countLabel}</span>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {!isLinkedIn && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Download .md
            </Button>
          )}
        </div>
      </div>

      {result.degraded && (
        <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700 dark:text-amber-400 shrink-0">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>The model returned unexpected formatting — post structure may be incomplete. Review before publishing.</span>
        </div>
      )}

      {!isLinkedIn && result.frontmatter.tldr && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-muted/50 border text-sm text-muted-foreground shrink-0">
          <span className="font-medium text-foreground">TL;DR:</span> {result.frontmatter.tldr}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLinkedIn ? (
          // LinkedIn: plain text with preserved whitespace (blank lines = paragraphs in the feed)
          <pre className="text-sm font-sans whitespace-pre-wrap break-words leading-relaxed">
            {result.body}
          </pre>
        ) : tab === 'preview' ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {blogBodyOnly}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
            {result.markdown}
          </pre>
        )}
      </div>
    </div>
  );
}
