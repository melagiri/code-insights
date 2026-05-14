// Prompt construction and output parsing for the Dispatch post generator.
// Supports two output formats: 'blog' (markdown + YAML frontmatter) and 'linkedin' (plain text + metadata block).

import type { DispatchTone, DispatchInsight, DispatchFormat } from '@code-insights/cli/types';

// --- System prompt ---

const SHARED_BASE = `You are a technical ghostwriter helping a software engineer publish their learnings.
The engineer has selected specific learnings and provided context about the story.

Do not use the words: "leveraged", "utilized", "seamlessly", "delve".
Do not invent facts not present in the insights.
Do not mention AI coding sessions, Code Insights, or any tool names.
Synthesize — do not enumerate insights one by one as a list.
Output only the requested format — no preamble, no meta-commentary.`;

const FORMAT_INSTRUCTIONS: Record<DispatchFormat, string> = {
  blog: `Write a blog post of 800-1000 words in markdown (body only, excluding frontmatter).
Structure: opening paragraph, 2-4 body sections each with an H2 heading, closing takeaway paragraph.
Use plain, direct prose — write like an engineer sharing hard-won knowledge, not a content marketer.

Begin with a YAML frontmatter block in exactly this format:
---
title: "A concise title (10 words max)"
tags: [tag1, tag2, tag3]
tldr: "One sentence summary of the post"
---

Then write the blog post body (H2 sections, no H1 — title is in the frontmatter).`,

  linkedin: `Write a LinkedIn post of 150-250 words.

Output format — begin with a YAML metadata block (for internal use only, not part of the post):
---
title: "A short title (8 words max)"
---

Then write the post body as plain text. This is what gets copy-pasted to LinkedIn.

Post structure:
- Lines 1-2: The hook. State a concrete insight, counterintuitive observation, or sharp finding. Must stand alone before LinkedIn's "...see more" cutoff (~1,300 characters). Do not open with "I learned" or "Today I".
- Body: 3-6 short paragraphs (1-3 sentences each). One blank line between paragraphs.
- Last line: 3-5 hashtags only. Example: #engineering #typescript #sqlite

LinkedIn rendering rules:
- Bold is supported: **bold text**. Use sparingly — one bold phrase per paragraph at most.
- No headers (## renders as literal ##, not a heading).
- No bullet lists (- renders as a hyphen, not a bullet).
- No YAML in the post body.`,
};

const TONE_INSTRUCTIONS: Record<DispatchFormat, Record<DispatchTone, string>> = {
  blog: {
    technical: 'Write for senior engineers. Precise vocabulary, specific trade-offs, do not over-explain fundamentals. Favor depth over accessibility.',
    accessible: 'Write for a mixed technical and non-technical audience. Define terms on first introduction, use analogies where helpful, keep sentences short. Favor clarity over density.',
    'quick-tips': 'Write in a tips format. Each body section opens with a bold actionable tip, followed by 2-4 sentences of context. Favor scanability over narrative.',
  },
  linkedin: {
    technical: 'Use precise technical vocabulary. Name the specific trade-off or constraint. Do not over-explain — trust the audience knows the fundamentals.',
    accessible: 'Use plain language. If a technical term is unavoidable, follow it immediately with a one-phrase explanation. Keep sentences short.',
    'quick-tips': 'Each paragraph opens with a **bold actionable statement** (no headers — LinkedIn does not render them). Follow with 2-3 sentences of context. Favor scanability.',
  },
};

export function buildDispatchSystemPrompt(tone: DispatchTone, format: DispatchFormat): string {
  return `${SHARED_BASE}\n\n${FORMAT_INSTRUCTIONS[format]}\n\n${TONE_INSTRUCTIONS[format][tone]}`;
}

// --- User context builder ---

export interface DispatchInput {
  userContext: string;
  insights: DispatchInsight[];
}

const TYPE_LABELS: Record<string, string> = {
  learning: 'Learning',
  decision: 'Decision',
  technique: 'Technique',
  summary: 'Summary',
  prompt_quality: 'Observation',
};

export function buildDispatchContext(input: DispatchInput): string {
  const insightBlocks = input.insights.map((insight, i) => {
    const typeLabel = TYPE_LABELS[insight.type]
      ?? (insight.type.charAt(0).toUpperCase() + insight.type.slice(1).replace(/_/g, ' '));
    const wordCount = insight.content.split(' ').length;
    const bulletLines = wordCount < 40 && insight.bullets.length > 0
      ? '\n' + insight.bullets.map(b => `- ${b}`).join('\n')
      : '';
    return `[${typeLabel.toUpperCase()} ${i + 1}]\nSummary: ${insight.summary}\n${insight.content}${bulletLines}`;
  });

  return `Context from the author:\n${input.userContext}\n\n---\n\nINSIGHTS (${input.insights.length} selected by author):\n\n${insightBlocks.join('\n\n')}`;
}

// --- Output parser ---

export interface DispatchParseResult {
  ok: boolean;
  markdown?: string;
  /** The body text without frontmatter — plain post text. Use for character/word count and LinkedIn copy. */
  body?: string;
  frontmatter?: {
    title: string;
    tags: string[];
    tldr: string;
  };
  /** True when the parse failed and we returned raw content with a guessed title. */
  degraded?: boolean;
  error?: 'missing-frontmatter' | 'malformed-frontmatter';
  raw?: string;
}

const PROHIBITED_WORDS = ['leveraged', 'utilized', 'seamlessly', 'delve'];

export function parseDispatchOutput(raw: string, format: DispatchFormat): DispatchParseResult {
  if (format === 'linkedin') {
    return parseLinkedInOutput(raw);
  }
  return parseBlogOutput(raw);
}

function parseBlogOutput(raw: string): DispatchParseResult {
  const fmMatch = raw.match(/^[\s]*---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { ok: false, error: 'missing-frontmatter', raw };
  }

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
  const tldrMatch = fm.match(/^tldr:\s*"?(.+?)"?\s*$/m);
  const tagsMatch = fm.match(/^tags:\s*\[(.+?)\]/m);

  if (!titleMatch || !tldrMatch) {
    return { ok: false, error: 'malformed-frontmatter', raw };
  }

  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''))
    : [];

  // Detect truncation — body should end with a sentence terminator
  const trimmedBody = body.trim();
  if (trimmedBody.length > 0 && !/[.!?]$/.test(trimmedBody)) {
    console.warn('[dispatch-truncation] Generated post may be truncated — does not end with sentence terminator');
  }

  // Log prohibited word leakage without rejecting
  const lowerBody = body.toLowerCase();
  const found = PROHIBITED_WORDS.filter(w => lowerBody.includes(w));
  if (found.length > 0) {
    console.warn(`[dispatch-prohibited-words] Prohibited words found in output: ${found.join(', ')}`);
  }

  // Unescape backslash-escaped quotes — LLM may emit \" inside the quoted YAML value
  const title = titleMatch[1].replace(/\\"/g, '"');
  const tldr = tldrMatch[1].replace(/\\"/g, '"');

  // Escape special YAML characters so the output is valid when pasted into blog platforms.
  // Titles/tldrs with ':' or '[' produce invalid unquoted YAML.
  const escTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escTldr  = tldr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // Reconstruct full markdown with properly quoted frontmatter
  const markdown = `---\ntitle: "${escTitle}"\ntags: [${tags.join(', ')}]\ntldr: "${escTldr}"\n---\n\n${body}`;

  return {
    ok: true,
    markdown,
    body,
    frontmatter: {
      title,
      tags,
      tldr,
    },
  };
}

function parseLinkedInOutput(raw: string): DispatchParseResult {
  // LinkedIn output: ---\ntitle: "..."\n---\n\n<post body>
  const fmMatch = raw.match(/^[\s]*---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { ok: false, error: 'missing-frontmatter', raw };
  }

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
  if (!titleMatch) {
    return { ok: false, error: 'malformed-frontmatter', raw };
  }

  // Extract hashtags from the last line of the body
  const lastLineMatch = body.match(/(?:^|\n)((?:#[a-zA-Z]\w*(?:\s+|$))+)$/);
  const tags = lastLineMatch
    ? lastLineMatch[1].trim().split(/\s+/).map(t => t.replace(/^#/, ''))
    : [];

  // Log prohibited word leakage without rejecting
  const lowerBody = body.toLowerCase();
  const found = PROHIBITED_WORDS.filter(w => lowerBody.includes(w));
  if (found.length > 0) {
    console.warn(`[dispatch-prohibited-words] Prohibited words found in output: ${found.join(', ')}`);
  }

  return {
    ok: true,
    // For LinkedIn, markdown IS the body — no YAML wrapper gets returned to the user
    markdown: body,
    body,
    frontmatter: {
      title: titleMatch[1],
      tags,
      tldr: '',
    },
  };
}

// Degrade gracefully when both the initial parse and retry fail.
// Extracts H1 as title if present, otherwise uses 'Untitled'.
export function buildDegradedResponse(raw: string): DispatchParseResult {
  const h1Match = raw.match(/^#+\s+(.+)$/m);
  const title = h1Match ? h1Match[1] : 'Untitled';
  return {
    ok: true,
    markdown: raw,
    body: raw,
    degraded: true,
    frontmatter: {
      title,
      tags: [],
      tldr: '',
    },
  };
}
