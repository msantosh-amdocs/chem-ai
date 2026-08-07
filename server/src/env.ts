// Loads .env from the project root (../ relative to this file) BEFORE anything
// else imports process.env at module load time. Import this file first.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// server/src -> server -> project root
const envPath = resolve(here, "../../.env");

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2] ?? "";
    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // strip trailing comment (unquoted)
    const hash = value.indexOf(" #");
    if (hash >= 0) value = value.slice(0, hash);
    if (process.env[key] === undefined) process.env[key] = value.trim();
  }
}

export type LogLevelName = "error" | "warn" | "info" | "debug" | "trace";
export type LogFormat = "pretty" | "json";
/**
 * How much of a large payload (an LLM prompt or its completion) ends up
 * in the log: nothing, a leading slice, or the whole thing.
 */
export type PayloadMode = "off" | "preview" | "full";

function pick<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = (raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 5278),
  log: {
    level: pick<LogLevelName>(
      process.env.LOG_LEVEL,
      ["error", "warn", "info", "debug", "trace"],
      "info",
    ),
    format: pick<LogFormat>(process.env.LOG_FORMAT, ["pretty", "json"], "pretty"),
    /**
     * ANSI colour is off whenever stdout is a file (which is how
     * `start.sh` runs us) so `.logs/server.log` stays greppable.
     */
    color: bool(process.env.LOG_COLOR, !!process.stdout.isTTY),
    /** What to log of the prompt we send to the model. */
    prompts: pick<PayloadMode>(process.env.LOG_PROMPTS, ["off", "preview", "full"], "preview"),
    /** What to log of the text the model sends back. */
    responses: pick<PayloadMode>(process.env.LOG_RESPONSES, ["off", "preview", "full"], "preview"),
    /** Character budget for a single payload when the mode is `preview`. */
    previewChars: positiveInt(process.env.LOG_PREVIEW_CHARS, 1200),
  },
};
