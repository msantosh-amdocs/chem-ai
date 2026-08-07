import { config, type LogLevelName, type PayloadMode } from "./env.js";

/**
 * Dependency-free structured logger.
 *
 * Two output shapes, chosen with `LOG_FORMAT`:
 *
 *   pretty (default) — one human-readable line per event, with any long
 *     or multi-line field (an LLM prompt, a stack trace) rendered as an
 *     indented block underneath it so `.logs/server.log` stays readable.
 *   json — one JSON object per line, for piping into a log tool.
 *
 * Loggers are scoped (`llm`, `orchestrator`, `http`, …) and can carry
 * bound context via `child()`, which is how a single LLM call keeps its
 * `callId` / `sessionId` / `stage` on every line it produces.
 */

export type LogLevel = LogLevelName;

export type LogFields = Record<string, unknown>;

export interface Logger {
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
  /** A logger with the same scope plus permanently-attached fields. */
  child(fields: LogFields): Logger;
  /** True if this level would actually be written — guard expensive field building. */
  enabled(level: LogLevel): boolean;
}

const SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const threshold = SEVERITY[config.log.level];

const RESET = "\u001b[0m";
const DIM = "\u001b[2m";
const LEVEL_COLOR: Record<LogLevel, string> = {
  error: "\u001b[31m",
  warn: "\u001b[33m",
  info: "\u001b[36m",
  debug: "\u001b[90m",
  trace: "\u001b[90m",
};

/** Field names whose value never belongs in a log file. */
const SECRET_KEY = /(api[-_]?key|authorization|secret|password|cookie|bearer)/i;

/** Beyond this, a string field is rendered as its own block rather than inline. */
const INLINE_MAX = 120;

function paint(text: string, color: string): string {
  return config.log.color ? `${color}${text}${RESET}` : text;
}

function scrub(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key) && value !== undefined && value !== null) return "[redacted]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/** JSON.stringify that survives circular references and BigInt. */
function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
    }
    return v;
  });
}

/** Render one field value for the inline `key=value` part of a pretty line. */
function inlineValue(value: unknown): string {
  if (typeof value === "string") {
    return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return safeJson(value) ?? String(value);
}

function isBlockValue(value: unknown): value is string {
  return typeof value === "string" && (value.includes("\n") || value.length > INLINE_MAX);
}

function renderBlock(key: string, body: string): string {
  const head = paint(`  ╭─ ${key} (${body.length} chars)`, DIM);
  const lines = body.split("\n").map((l) => `${paint("  │", DIM)} ${l}`);
  return [head, ...lines, paint("  ╰─", DIM)].join("\n");
}

function sinkFor(level: LogLevel): (line: string) => void {
  if (level === "error") return console.error;
  if (level === "warn") return console.warn;
  return console.log;
}

function write(level: LogLevel, scope: string, message: string, fields: LogFields): void {
  if (SEVERITY[level] > threshold) return;

  const clean: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    clean[k] = scrub(k, v);
  }

  const ts = new Date().toISOString();
  const out = sinkFor(level);

  if (config.log.format === "json") {
    out(safeJson({ ts, level, scope, msg: message, ...clean }));
    return;
  }

  const inline: string[] = [];
  const blocks: string[] = [];
  for (const [k, v] of Object.entries(clean)) {
    if (isBlockValue(v)) blocks.push(renderBlock(k, v));
    else inline.push(`${k}=${inlineValue(v)}`);
  }

  const head =
    `${paint(ts, DIM)} ` +
    `${paint(level.toUpperCase().padEnd(5), LEVEL_COLOR[level])} ` +
    `${paint(scope.padEnd(12), DIM)} ${message}`;
  const tail = inline.length ? `  ${paint(inline.join(" "), DIM)}` : "";
  out(blocks.length ? `${head}${tail}\n${blocks.join("\n")}` : `${head}${tail}`);
}

function build(scope: string, bound: LogFields): Logger {
  const at =
    (level: LogLevel) =>
    (message: string, fields?: LogFields): void =>
      write(level, scope, message, fields ? { ...bound, ...fields } : bound);

  return {
    error: at("error"),
    warn: at("warn"),
    info: at("info"),
    debug: at("debug"),
    trace: at("trace"),
    child: (fields: LogFields) => build(scope, { ...bound, ...fields }),
    enabled: (level: LogLevel) => SEVERITY[level] <= threshold,
  };
}

export function createLogger(scope: string, fields: LogFields = {}): Logger {
  return build(scope, fields);
}

/**
 * Prepare a large payload (prompt, completion) for a log field according
 * to the configured mode. Returns `undefined` when the payload should be
 * omitted entirely, so callers can spread it into a fields object and
 * have it disappear.
 */
export function payloadField(
  text: string,
  mode: PayloadMode,
  /** Env var named in the truncation hint, so it points at the right knob. */
  envVar = "LOG_PROMPTS",
  limit: number = config.log.previewChars,
): string | undefined {
  if (mode === "off" || !text) return undefined;
  if (mode === "full" || text.length <= limit) return text;
  const hidden = text.length - limit;
  return `${text.slice(0, limit)}\n… [+${hidden} more chars — set ${envVar}=full to log the whole payload]`;
}

/** Rough token estimate for logs only — never used for billing. */
export function approxTokens(chars: number): number {
  return Math.round(chars / 4);
}

export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: err.message, errorType: err.name, stack: err.stack };
  }
  return { error: String(err) };
}
