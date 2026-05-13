import { describe, it, expect } from 'vitest';
import {
  buildDispatchSystemPrompt,
  buildDispatchContext,
  parseDispatchOutput,
  buildDegradedResponse,
} from './dispatch-prompts.js';
import type { DispatchInsight } from '@code-insights/cli/types';

// --- buildDispatchSystemPrompt ---

describe('buildDispatchSystemPrompt', () => {
  it('includes tone instruction for technical', () => {
    const prompt = buildDispatchSystemPrompt('technical');
    expect(prompt).toContain('senior engineers');
    expect(prompt).toContain('depth over accessibility');
  });

  it('includes tone instruction for accessible', () => {
    const prompt = buildDispatchSystemPrompt('accessible');
    expect(prompt).toContain('mixed technical and non-technical');
  });

  it('includes tone instruction for quick-tips', () => {
    const prompt = buildDispatchSystemPrompt('quick-tips');
    expect(prompt).toContain('tips format');
    expect(prompt).toContain('bold actionable tip');
  });

  it('always includes banned word list', () => {
    const prompt = buildDispatchSystemPrompt('technical');
    expect(prompt).toContain('leveraged');
    expect(prompt).toContain('seamlessly');
    expect(prompt).toContain('delve');
  });

  it('always includes frontmatter format instructions', () => {
    const prompt = buildDispatchSystemPrompt('accessible');
    expect(prompt).toContain('title:');
    expect(prompt).toContain('tags:');
    expect(prompt).toContain('tldr:');
  });

  it('instructs not to invent facts', () => {
    const prompt = buildDispatchSystemPrompt('technical');
    expect(prompt).toContain('Do not invent facts');
  });

  it('instructs to synthesize, not enumerate', () => {
    const prompt = buildDispatchSystemPrompt('technical');
    expect(prompt).toContain('Synthesize');
  });
});

// --- buildDispatchContext ---

const sampleInsights: DispatchInsight[] = [
  {
    id: 'i1',
    type: 'learning',
    summary: 'SQLite WAL mode enables concurrent reads',
    content: 'WAL mode decouples reads from writes at the file level, allowing multiple readers while a single writer commits.',
    bullets: [],
  },
  {
    id: 'i2',
    type: 'decision',
    summary: 'Skipped ORM migrations entirely',
    content: 'Ran raw SQL migrations instead.',
    bullets: ['Faster iteration', 'No ORM overhead'],
  },
  {
    id: 'i3',
    type: 'technique',
    summary: 'Incremental builds cut CI time',
    content: 'Only changed packages are rebuilt.',
    bullets: [],
  },
];

describe('buildDispatchContext', () => {
  it('puts user context before insights', () => {
    const result = buildDispatchContext({ userContext: 'My story here.', insights: sampleInsights });
    const contextIdx = result.indexOf('Context from the author');
    const insightsIdx = result.indexOf('INSIGHTS');
    expect(contextIdx).toBeLessThan(insightsIdx);
  });

  it('includes the correct insight count', () => {
    const result = buildDispatchContext({ userContext: 'story', insights: sampleInsights });
    expect(result).toContain('3 selected by author');
  });

  it('title-cases type labels and numbers them', () => {
    const result = buildDispatchContext({ userContext: 'story', insights: sampleInsights });
    expect(result).toContain('[LEARNING 1]');
    expect(result).toContain('[DECISION 2]');
    expect(result).toContain('[TECHNIQUE 3]');
  });

  it('includes summary and content', () => {
    const result = buildDispatchContext({ userContext: 'story', insights: sampleInsights });
    expect(result).toContain('SQLite WAL mode enables concurrent reads');
    expect(result).toContain('WAL mode decouples reads from writes');
  });

  it('includes bullets only when content is sparse (< 40 words)', () => {
    const result = buildDispatchContext({ userContext: 'story', insights: sampleInsights });
    // i2 content is sparse (5 words) → bullets should appear
    expect(result).toContain('- Faster iteration');
    expect(result).toContain('- No ORM overhead');
    // i1 content is not sparse → no bullet check needed (it has no bullets anyway)
  });

  it('omits bullets when content is not sparse (>= 40 words)', () => {
    const longInsight: DispatchInsight = {
      id: 'long',
      type: 'learning',
      summary: 'A long learning',
      content: 'word '.repeat(41).trim(),
      bullets: ['should not appear'],
    };
    const result = buildDispatchContext({ userContext: 'story', insights: [longInsight] });
    expect(result).not.toContain('should not appear');
  });

  it('does not include evidence field', () => {
    const result = buildDispatchContext({ userContext: 'story', insights: sampleInsights });
    // We just verify the function doesn't crash with our known inputs and doesn't have
    // the word "evidence" from any of our test data
    expect(result).not.toContain('[EVIDENCE');
  });
});

// --- parseDispatchOutput ---

const VALID_OUTPUT = `---
title: "What SQLite Taught Me"
tags: [sqlite, architecture, backend]
tldr: "Three weeks, five surprises."
---

## WAL Mode Is Not Optional

SQLite WAL mode enables concurrent reads without locking out writers. This matters when you have a server reading while a CLI writes.

## The Migration Lesson

Running raw SQL gave us full control over schema evolution without ORM abstractions getting in the way.

## Final Thoughts

These lessons shaped how we approach embedded databases now.`;

describe('parseDispatchOutput', () => {
  it('parses valid output correctly', () => {
    const result = parseDispatchOutput(VALID_OUTPUT);
    expect(result.ok).toBe(true);
    expect(result.frontmatter?.title).toBe('What SQLite Taught Me');
    expect(result.frontmatter?.tags).toEqual(['sqlite', 'architecture', 'backend']);
    expect(result.frontmatter?.tldr).toBe('Three weeks, five surprises.');
    expect(result.markdown).toContain('## WAL Mode');
  });

  it('returns missing-frontmatter error when no frontmatter', () => {
    const result = parseDispatchOutput('Just a blog post without frontmatter.');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing-frontmatter');
    expect(result.raw).toBe('Just a blog post without frontmatter.');
  });

  it('returns malformed-frontmatter when title is missing', () => {
    const bad = `---
tags: [sqlite]
tldr: "A summary."
---

## Section

Body text.`;
    const result = parseDispatchOutput(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('malformed-frontmatter');
  });

  it('returns malformed-frontmatter when tldr is missing', () => {
    const bad = `---
title: "Some title"
tags: [sqlite]
---

## Section

Body text.`;
    const result = parseDispatchOutput(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('malformed-frontmatter');
  });

  it('handles missing tags gracefully (empty array)', () => {
    const noTags = `---
title: "Post Without Tags"
tldr: "A summary."
---

## Section

Body text here. This ends with a period.`;
    const result = parseDispatchOutput(noTags);
    expect(result.ok).toBe(true);
    expect(result.frontmatter?.tags).toEqual([]);
  });

  it('includes body in reconstructed markdown', () => {
    const result = parseDispatchOutput(VALID_OUTPUT);
    expect(result.markdown).toContain('## WAL Mode Is Not Optional');
    expect(result.markdown).toContain('## The Migration Lesson');
  });
});

// --- buildDegradedResponse ---

describe('buildDegradedResponse', () => {
  it('extracts H1 as title when present', () => {
    const raw = '# My Post Title\n\nSome content here.';
    const result = buildDegradedResponse(raw);
    expect(result.ok).toBe(true);
    expect(result.frontmatter?.title).toBe('My Post Title');
  });

  it('uses Untitled when no H1 present', () => {
    const raw = 'Some content without a heading.';
    const result = buildDegradedResponse(raw);
    expect(result.ok).toBe(true);
    expect(result.frontmatter?.title).toBe('Untitled');
  });

  it('always returns empty tags and tldr', () => {
    const result = buildDegradedResponse('# Title\n\nContent.');
    expect(result.frontmatter?.tags).toEqual([]);
    expect(result.frontmatter?.tldr).toBe('');
  });

  it('returns the raw content as markdown', () => {
    const raw = '# Title\n\nContent.';
    const result = buildDegradedResponse(raw);
    expect(result.markdown).toBe(raw);
  });
});
