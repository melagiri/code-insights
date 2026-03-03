import { type ReactNode, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleToolPanelProps {
  icon: ReactNode;
  label: string;
  summary?: ReactNode;
  className?: string;
  headerClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleToolPanel({
  icon,
  label,
  summary,
  className,
  headerClassName,
  defaultOpen = false,
  children,
}: CollapsibleToolPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('my-2 rounded-lg border border-border overflow-hidden', className)}>
      <button
        type="button"
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors',
          headerClassName
        )}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {icon}
        <span className="text-xs font-medium text-foreground shrink-0">{label}</span>
        {!open && summary && (
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
            {summary}
          </div>
        )}
        <div className="ml-auto shrink-0 text-muted-foreground">
          {open
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {open && children}
    </div>
  );
}
