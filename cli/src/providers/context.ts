/**
 * Lightweight runtime context for providers.
 * Avoids changing the SessionProvider interface for cross-cutting concerns like verbose logging.
 * Node.js CLI is single-threaded, so module-level state is safe here.
 */
let _verbose = false;

export function setProviderVerbose(v: boolean): void {
  _verbose = v;
}

export function isVerbose(): boolean {
  return _verbose;
}
