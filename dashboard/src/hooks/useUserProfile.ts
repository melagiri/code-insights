import { useState, useCallback } from 'react';

const STORAGE_KEY = 'code-insights:user-profile';

export interface UserProfile {
  name: string;
  githubUsername: string;
  avatarDataUrl?: string; // base64-cached avatar for Canvas export (no CORS issues)
}

function readStorage(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function writeStorage(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Returns true when both name and githubUsername are non-empty. */
export function isProfileComplete(profile: UserProfile | null): boolean {
  return !!(profile?.name.trim() && profile?.githubUsername.trim());
}

/** Normalize a GitHub username: strip leading @ and strip full URLs down to username. */
export function normalizeGithubUsername(raw: string): string {
  const trimmed = raw.trim();
  // Strip leading @
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  // Strip https://github.com/ prefix
  const githubUrlMatch = withoutAt.match(/^(?:https?:\/\/)?github\.com\/([^/]+)/);
  if (githubUrlMatch) return githubUrlMatch[1];
  return withoutAt;
}

/**
 * Fetch a GitHub avatar and return it as a base64 data URL for Canvas use.
 * Uses avatars.githubusercontent.com directly (supports CORS) instead of
 * github.com/{user}.png (which redirects and strips CORS headers).
 * Returns undefined if the fetch fails (invalid username, network error).
 */
export async function fetchAvatarAsDataUrl(username: string): Promise<string | undefined> {
  if (!username) return undefined;
  try {
    const res = await fetch(`https://avatars.githubusercontent.com/${username}?size=128`, {
      redirect: 'follow',
    });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/**
 * localStorage-backed user profile (name + GitHub username + cached avatar).
 * Returns current profile and a save function.
 * Uses a version counter to trigger re-renders after writes (same pattern as useSavedFilters).
 */
export function useUserProfile() {
  const [, setVersion] = useState(0);
  const forceUpdate = useCallback(() => setVersion((v) => v + 1), []);

  const profile = readStorage();

  const saveProfile = useCallback(
    async (name: string, githubUsername: string): Promise<UserProfile> => {
      const normalized = normalizeGithubUsername(githubUsername);
      // Fetch and cache avatar as base64 — updates localStorage when done
      const avatarDataUrl = await fetchAvatarAsDataUrl(normalized);
      const saved: UserProfile = {
        name: name.trim(),
        githubUsername: normalized,
        avatarDataUrl,
      };
      writeStorage(saved);
      forceUpdate();
      return saved;
    },
    [forceUpdate]
  );

  return { profile, saveProfile };
}
