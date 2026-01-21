// Analysis prompts for extracting insights from sessions

import type { Message } from '../types';

/**
 * Format messages for LLM consumption
 */
export function formatMessagesForAnalysis(messages: Message[]): string {
  return messages
    .map((m) => {
      const role = m.type === 'user' ? 'User' : m.type === 'assistant' ? 'Assistant' : 'System';
      const toolInfo = m.toolCalls.length > 0
        ? `\n[Tools used: ${m.toolCalls.map(t => t.name).join(', ')}]`
        : '';
      return `### ${role}:\n${m.content}${toolInfo}`;
    })
    .join('\n\n');
}

/**
 * System prompt for session analysis
 */
export const SESSION_ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing software development conversations and extracting valuable insights. Your task is to analyze a Claude Code session (a conversation between a user and an AI coding assistant) and extract structured insights.

You will identify:
1. **Summary**: A high-level narrative of what was accomplished
2. **Decisions**: Technical choices made, including reasoning and alternatives considered
3. **Learnings**: Technical discoveries, gotchas, or transferable knowledge
4. **Techniques**: Problem-solving approaches and debugging strategies used

Guidelines:
- Be specific and concrete, not vague
- Focus on actionable insights that would be valuable to recall later
- Include code patterns, API usage, and architectural choices
- Capture "aha moments" and non-obvious discoveries
- Note debugging strategies that worked well

Respond with valid JSON only.`;

/**
 * Generate the user prompt for session analysis
 */
export function generateSessionAnalysisPrompt(
  projectName: string,
  sessionSummary: string | null,
  formattedMessages: string
): string {
  return `Analyze this Claude Code session and extract insights.

Project: ${projectName}
${sessionSummary ? `Session Summary: ${sessionSummary}\n` : ''}
--- CONVERSATION ---
${formattedMessages}
--- END CONVERSATION ---

Extract insights in this JSON format:
{
  "summary": {
    "title": "Brief title describing main accomplishment (max 60 chars)",
    "content": "2-3 sentence narrative of what was accomplished",
    "bullets": ["Key point 1", "Key point 2", "Key point 3"]
  },
  "decisions": [
    {
      "title": "The decision made (max 60 chars)",
      "content": "Detailed explanation of the decision",
      "reasoning": "Why this choice was made",
      "alternatives": ["Alternative 1 considered", "Alternative 2 considered"]
    }
  ],
  "learnings": [
    {
      "title": "What was learned (max 60 chars)",
      "content": "Detailed explanation",
      "context": "When/where this applies"
    }
  ],
  "techniques": [
    {
      "title": "The technique/approach (max 60 chars)",
      "content": "How it was applied",
      "applicability": "When to use this technique"
    }
  ]
}

Only include insights that are genuinely valuable and specific. It's better to have fewer high-quality insights than many generic ones. If a category has no meaningful insights, return an empty array for it.

Respond with valid JSON only, no other text.`;
}

/**
 * Interface for parsed analysis response
 */
export interface AnalysisResponse {
  summary: {
    title: string;
    content: string;
    bullets: string[];
  };
  decisions: Array<{
    title: string;
    content: string;
    reasoning: string;
    alternatives?: string[];
  }>;
  learnings: Array<{
    title: string;
    content: string;
    context: string;
  }>;
  techniques: Array<{
    title: string;
    content: string;
    applicability: string;
  }>;
}

/**
 * Parse the LLM response into structured insights
 */
export function parseAnalysisResponse(response: string): AnalysisResponse | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in analysis response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as AnalysisResponse;

    // Validate structure
    if (!parsed.summary || typeof parsed.summary.title !== 'string') {
      console.error('Invalid analysis response structure');
      return null;
    }

    // Ensure arrays exist
    parsed.decisions = parsed.decisions || [];
    parsed.learnings = parsed.learnings || [];
    parsed.techniques = parsed.techniques || [];

    return parsed;
  } catch (error) {
    console.error('Failed to parse analysis response:', error);
    return null;
  }
}
