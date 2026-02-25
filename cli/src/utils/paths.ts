/**
 * Extract real filesystem path and optional session fragment from a virtual path.
 * Virtual paths use '#' delimiter: "/path/to/state.vscdb#composerId"
 * Regular paths pass through unchanged.
 */
export function splitVirtualPath(filePath: string): { realPath: string; sessionFragment: string | null } {
  const hashIndex = filePath.lastIndexOf('#');
  if (hashIndex > 0) {
    return {
      realPath: filePath.slice(0, hashIndex),
      sessionFragment: filePath.slice(hashIndex + 1),
    };
  }
  return { realPath: filePath, sessionFragment: null };
}
