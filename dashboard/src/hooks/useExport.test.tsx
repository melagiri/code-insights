import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportGenerate } from './useExport';
import { exportGenerateStream } from '@/lib/api';

vi.mock('@/lib/api', () => ({ exportGenerateStream: vi.fn(), exportMarkdown: vi.fn() }));
const metadata = { insightCount: 1, totalInsights: 1, sessionCount: 1, projectCount: 1, scope: 'all', depth: 'standard' };

beforeEach(() => vi.mocked(exportGenerateStream).mockReset());

describe('export completion validation', () => {
  it.each(['', ' \n\t'])('shows an error for blank completion content %j', async content => {
    vi.mocked(exportGenerateStream).mockResolvedValue(new Response(
      `event: complete\ndata: ${JSON.stringify({ content, metadata })}\n\n`,
    ));
    const { result } = renderHook(() => useExportGenerate());
    await act(() => result.current.generate({ scope: 'all', format: 'obsidian', depth: 'standard' }));
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.content).toBeNull();
    expect(result.current.state.error).toMatch(/empty|blank/i);
  });

  it('keeps nonblank markdown for review and download', async () => {
    vi.mocked(exportGenerateStream).mockResolvedValue(new Response(
      `event: complete\ndata: ${JSON.stringify({ content: '# Export\nUseful rule', metadata })}\n\n`,
    ));
    const { result } = renderHook(() => useExportGenerate());
    await act(() => result.current.generate({ scope: 'all', format: 'obsidian', depth: 'standard' }));
    expect(result.current.state.status).toBe('complete');
    expect(result.current.state.content).toBe('# Export\nUseful rule');
  });
});
