/**
 * Parse an integer query parameter with a safe default.
 * Returns the default if the value is missing, NaN, negative, or non-finite.
 */
export function parseIntParam(value: string | undefined, defaultVal: number): number {
  const n = value !== undefined ? parseInt(value, 10) : defaultVal;
  return Number.isFinite(n) && n >= 0 ? n : defaultVal;
}
