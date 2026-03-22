import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserProfile, normalizeGithubUsername } from '@/hooks/useUserProfile';
import type { UserProfile } from '@/hooks/useUserProfile';

interface ProfilePromptDialogProps {
  open: boolean;
  /**
   * Called when the user saves the profile.
   * Receives the just-saved profile so the caller can use it immediately
   * without waiting for a React re-render (avoids stale closure on triggerDownload).
   */
  onSave: (profile: UserProfile) => void;
  /** Called when the user skips — the download should proceed without profile. */
  onSkip: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog shown before share card download when the user profile is incomplete.
 * Collects Display Name + GitHub Username with a live avatar preview.
 * On save, persists to localStorage and calls onSave so the caller can proceed with the download.
 */
export function ProfilePromptDialog({
  open,
  onSave,
  onSkip,
  onOpenChange,
}: ProfilePromptDialogProps) {
  const { profile, saveProfile } = useUserProfile();

  const [name, setName] = useState(profile?.name ?? '');
  const [githubUsername, setGithubUsername] = useState(profile?.githubUsername ?? '');
  const [avatarError, setAvatarError] = useState(false);

  // Reset fields when dialog opens, pre-fill from existing profile if any
  useEffect(() => {
    if (open) {
      setName(profile?.name ?? '');
      setGithubUsername(profile?.githubUsername ?? '');
      setAvatarError(false);
    }
  }, [open, profile?.name, profile?.githubUsername]);

  const normalizedUsername = normalizeGithubUsername(githubUsername);
  const avatarUrl = normalizedUsername ? `https://github.com/${normalizedUsername}.png` : '';

  const canSave = name.trim().length > 0 && normalizedUsername.length > 0;

  async function handleSave() {
    if (!canSave) return;
    // Await saveProfile — it fetches and caches the avatar as base64
    const saved = await saveProfile(name, githubUsername);
    // Pass the saved profile (with cached avatar) directly to the caller
    // to avoid stale closure on triggerDownload
    onSave(saved);
  }

  function handleSkip() {
    onSkip();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your profile to the share card</DialogTitle>
          <DialogDescription>
            Your name and GitHub avatar will appear in the card footer, personalizing it for social sharing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Live avatar preview */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt="GitHub avatar preview"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                  onLoad={() => setAvatarError(false)}
                />
              ) : (
                <span className="text-xl text-muted-foreground select-none">
                  {name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="text-sm">
              <p className="font-medium">{name.trim() || 'Your Name'}</p>
              {normalizedUsername ? (
                <p className="text-muted-foreground text-xs">@{normalizedUsername}</p>
              ) : (
                <p className="text-muted-foreground text-xs italic">Enter your GitHub username</p>
              )}
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="text-sm font-medium">Display Name</label>
            <Input
              className="mt-1"
              placeholder="e.g. Srikanth Rao"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* GitHub username input */}
          <div>
            <label className="text-sm font-medium">GitHub Username</label>
            <Input
              className="mt-1"
              placeholder="e.g. melagiri"
              value={githubUsername}
              onChange={(e) => {
                setGithubUsername(e.target.value);
                setAvatarError(false);
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used to load your GitHub avatar. No @ prefix needed.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip} type="button">
            Skip
          </Button>
          <Button onClick={handleSave} disabled={!canSave} type="button">
            Save & Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
