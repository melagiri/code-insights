import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PostPreview } from './PostPreview';
import { CoverImagePromptSection } from './CoverImagePromptSection';
import type { DispatchResponse } from '@/lib/api';

interface PostOverlayProps {
  open: boolean;
  onClose: () => void;
  result: DispatchResponse;
}

export function PostOverlay({ open, onClose, result }: PostOverlayProps) {
  const { title, tags, tldr } = result.frontmatter;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-none w-screen h-screen rounded-none p-0 sm:rounded-none top-0 left-0 translate-x-0 translate-y-0 flex flex-col gap-0"
      >
        <DialogTitle className="sr-only">{title || 'Post preview'}</DialogTitle>
        <DialogDescription className="sr-only">
          Full-screen preview of the generated post. Use Escape or the close button to dismiss.
        </DialogDescription>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-medium truncate max-w-[80%]">{title || 'Generated post'}</p>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-xs text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable post preview */}
        <div className="flex-1 overflow-hidden">
          <PostPreview result={result} />
        </div>

        {/* Cover image prompt section */}
        <CoverImagePromptSection
          title={title}
          tags={tags}
          tldr={tldr}
          format={result.format}
        />
      </DialogContent>
    </Dialog>
  );
}
