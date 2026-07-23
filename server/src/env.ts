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

export const config = {
  port: Number(process.env.PORT ?? 5278),
};
