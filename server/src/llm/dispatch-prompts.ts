// Prompt construction and output parsing for the Dispatch blog post generator.

import type { DispatchTone, DispatchInsight } from '@code-insights/cli/types';

// --- System prompt ---

const TONE_INSTRUCTIONS: Record<DispatchTone, string> = {
  'technical': 'Write for senior engineers. Precise vocabulary, specific trade-offs, do not over-explain fundamentals. Favor depth over accessibility.',
  'accessible': 'Write for a mixed technical and non-technical audience. Define terms on first introduction, use analogies where helpful, keep sentences short. Favor clarity over density.',
  'quick-tips': 'Write in a tips format. Each body section opens with a bold actionable tip, followed by 2-4 sentences of context. Favor scanability over narrative.',
};

const SYSTEM_PROMPT_BASE = `You are a technical ghostwriter helping a software engineer publish their learnings.
The engineer has selected specific learnings and provided context about the story.

Write a blog post of 800-1000 words in markdown (body only, excluding frontmatter).
Structure: opening paragraph, 2-4 body sections each with an H2 heading, closing takeaway paragraph.
Use plain, direct prose — write like an engineer sharing hard-won knowledge, not a content marketer.
Do not use the words: "leveraged", "utilized", "seamlessly", "delve".
Do not invent facts not present in the insights.
Do not mention AI coding sessions, Code Insights, or any tool names.
Synthesize — do not enumerate insights one by one as a list.

Output a markdown document only — no preamble, no meta-commentary.
Begin with a YAML frontmatter block in exactly this format:
---
title: "A concise title (10 words max)"
tags: [tag1, tag2, tag3]
tldr: "One sentence summary of the post"
---

Then write the blog post body (H2 sections, no H1 — title is in the frontmatter).`;

export function buildDispatchSystemPrompt(tone: DispatchTone): string {
  return `${SYSTEM_PROMPT_BASE}\n\n${TONE_INSTRUCTIONS[tone]}`;
}

// --- User context builder ---

export interface DispatchInput {
  userContext: string;
  insights: DispatchInsight[];
}

export function buildDispatchContext(input: DispatchInput): string {
  const insightBlocks = input.insights.map((insight, i) => {
    const typeLabel = insight.type.charAt(0).toUpperCase() + insight.type.slice(1);
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
  frontmatter?: {
    title: string;
    tags: string[];
    tldr: string;
  };
  error?: 'missing-frontmatter' | 'malformed-frontmatter';
  raw?: string;
}

const PROHIBITED_WORDS = ['leveraged', 'utilized', 'seamlessly', 'delve'];

export function parseDispatchOutput(raw: string): DispatchParseResult {
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

  // Reconstruct full markdown with frontmatter
  const markdown = `---\ntitle: ${titleMatch[1]}\ntags: [${tags.join(', ')}]\ntldr: ${tldrMatch[1]}\n---\n\n${body}`;

  return {
    ok: true,
    markdown,
    frontmatter: {
      title: titleMatch[1],
      tags,
      tldr: tldrMatch[1],
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
    frontmatter: {
      title,
      tags: [],
      tldr: '',
    },
  };
}
