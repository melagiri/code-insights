import type { SessionProvider } from './types.js';
import { ClaudeCodeProvider } from './claude-code.js';
import { CursorProvider } from './cursor.js';
import { CodexProvider } from './codex.js';

const providers = new Map<string, SessionProvider>();

// Register built-in providers
const claudeCode = new ClaudeCodeProvider();
providers.set(claudeCode.getProviderName(), claudeCode);

const cursor = new CursorProvider();
providers.set(cursor.getProviderName(), cursor);

const codex = new CodexProvider();
providers.set(codex.getProviderName(), codex);

/**
 * Get a provider by name
 */
export function getProvider(name: string): SessionProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

/**
 * Get all registered providers
 */
export function getAllProviders(): SessionProvider[] {
  return [...providers.values()];
}
