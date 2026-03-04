import { useMutation } from '@tanstack/react-query';
import { exportMarkdown } from '@/lib/api';

interface ExportParams {
  sessionIds?: string[];
  projectId?: string;
  template?: 'knowledge-base' | 'agent-rules';
}

export function useExportMarkdown() {
  return useMutation({
    mutationFn: (params: ExportParams) => exportMarkdown(params),
  });
}
