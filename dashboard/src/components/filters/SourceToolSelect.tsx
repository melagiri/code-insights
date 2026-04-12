import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SOURCE_TOOL_COLORS } from '@/lib/constants/colors';

export const SOURCE_TOOLS = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'codex-cli', label: 'Codex CLI' },
  { value: 'copilot-cli', label: 'Copilot CLI' },
  { value: 'copilot', label: 'Copilot' },
] as const;

// Extract the dot color class from SOURCE_TOOL_COLORS badge string (e.g. "bg-orange-500/10 text-orange-600 ...")
// We only need the text color for the dot background — use the bg-*-500/10 converted to bg-*-500
const DOT_COLORS: Record<string, string> = {
  'claude-code': 'bg-orange-500',
  'cursor': 'bg-blue-500',
  'codex-cli': 'bg-green-500',
  'copilot-cli': 'bg-cyan-500',
  'copilot': 'bg-violet-500',
};

interface SourceToolSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function SourceToolSelect({ value, onValueChange, className }: SourceToolSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="All Sources" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Sources</SelectItem>
        {SOURCE_TOOLS.map((tool) => (
          <SelectItem key={tool.value} value={tool.value}>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${DOT_COLORS[tool.value]}`} />
              {tool.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
