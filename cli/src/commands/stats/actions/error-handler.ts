// ──────────────────────────────────────────────────────
// Shared error handler for all stats action handlers
// ──────────────────────────────────────────────────────

import {
  ProjectNotFoundError,
  InvalidPeriodError,
} from '../data/types.js';
import { colors } from '../render/colors.js';

/**
 * Handle known stats errors with user-friendly output.
 * Rethrows unknown errors.
 */
export function handleStatsError(err: unknown): never {
  if (err instanceof InvalidPeriodError) {
    console.error(`\n  ${colors.error(err.message)}`);
    console.log(colors.hint('Expected: 7d, 30d, 90d, or all'));
    process.exit(1);
  }
  if (err instanceof ProjectNotFoundError) {
    console.error(`\n  ${colors.error(`Project "${err.projectName}" not found.`)}`);
    if (err.suggestions.length > 0) {
      console.log(`\n  Did you mean?`);
      for (const s of err.suggestions) {
        console.log(`    ${colors.success('\u25CF')} ${s}`);
      }
    }
    console.log(`\n  Available projects:`);
    for (const p of err.availableProjects) {
      console.log(`    ${colors.success('\u25CF')} ${p.name}`);
    }
    process.exit(1);
  }
  throw err;
}
