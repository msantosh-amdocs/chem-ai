/**
 * Wall-clock duration formatters shared by the History and Pipeline
 * views. Pure functions so they can be unit-tested and inlined into
 * memoised selectors without dragging in React.
 *
 * The three flavours we need:
 *   - `formatDuration(ms)`    – "3m 24s" or "8h 12m" style rollups
 *   - `formatCompactDuration(ms)` – "3:24" or "1:02:11" for tight table
 *     cells / chips where we can't spare the letter suffixes
 *   - `computeLiveDuration(startedAt, endedAt?)` – helper that returns
 *     the ms delta from a stamped `startedAt` ISO to either `endedAt`
 *     if present or `Date.now()` for live/streaming stages.
 */

/**
 * Human-readable duration. Examples:
 *   0        → "0s"
 *   937      → "0.9s"
 *   4200     → "4s"
 *   64000    → "1m 4s"
 *   3720000  → "1h 2m"
 *   90061000 → "1d 1h"
 * Sub-second is only shown for very short intervals so a header line
 * like "took 1.2s" reads naturally; anything ≥ 10s rounds to whole
 * seconds so timings don't wobble frame-to-frame while a live counter
 * ticks.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const totalHr = Math.floor(totalMin / 60);
  const hr = totalHr % 24;
  const day = Math.floor(totalHr / 24);
  if (day > 0) return `${day}d ${hr}h`;
  if (hr > 0) return `${hr}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  if (totalSec < 10) return `${(ms / 1000).toFixed(1)}s`;
  return `${totalSec}s`;
}

/**
 * Compact "MM:SS" / "HH:MM:SS" formatter. Used on artifact chips and
 * pipeline tiles where we're competing for a handful of pixels. Falls
 * back to the same em-dash placeholder as `formatDuration` so both
 * formatters play the same "missing" tone.
 */
export function formatCompactDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);
  const two = (n: number) => n.toString().padStart(2, "0");
  if (hr > 0) return `${hr}:${two(min)}:${two(sec)}`;
  return `${min}:${two(sec)}`;
}

/**
 * Wall-clock ms between a stage's start ISO and either its end ISO
 * (when it's finished) or `now` (when it's still streaming). Returns
 * `null` if we don't have enough data to measure — the caller decides
 * whether to render the em-dash placeholder or hide the row.
 *
 * `now` is injected so tests can be deterministic; production callers
 * pass `Date.now()` or omit the arg (defaults to `Date.now()`).
 */
export function computeLiveDuration(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}
