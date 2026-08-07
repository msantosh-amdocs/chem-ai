import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArchitectureSession } from "../types.js";
import { migrateSessionSpecialists } from "../agents/modelMigration.js";
import { createLogger, errorFields } from "../logger.js";

const log = createLogger("history");

const here = fileURLToPath(new URL(".", import.meta.url));
// server/src/store -> server -> server/.data
const DATA_DIR = resolve(here, "../../.data");
const HISTORY_FILE = resolve(DATA_DIR, "history.json");

async function ensureFile(): Promise<void> {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(HISTORY_FILE)) await writeFile(HISTORY_FILE, "[]", "utf8");
}

let writeQueue: Promise<void> = Promise.resolve();

async function readAll(): Promise<ArchitectureSession[]> {
  await ensureFile();
  try {
    const raw = await readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      log.warn("History file does not contain an array — treating it as empty", {
        file: HISTORY_FILE,
      });
      return [];
    }
    return parsed;
  } catch (err) {
    // An unreadable/corrupt history file must not take the API down, but
    // it does mean every session on disk is invisible until it's fixed.
    log.error("Could not read the history file — continuing with no history", {
      file: HISTORY_FILE,
      ...errorFields(err),
    });
    return [];
  }
}

async function writeAll(list: ArchitectureSession[]): Promise<void> {
  // Serialize writes so concurrent updates don't clobber one another.
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureFile();
      await writeFile(HISTORY_FILE, JSON.stringify(list, null, 2), "utf8");
      log.trace("History written", { file: HISTORY_FILE, sessions: list.length });
    } catch (err) {
      log.error("Could not write the history file — this update is lost", {
        file: HISTORY_FILE,
        sessions: list.length,
        ...errorFields(err),
      });
    }
  });
  return writeQueue;
}

export const history = {
  async list(): Promise<ArchitectureSession[]> {
    const all = await readAll();
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async get(id: string): Promise<ArchitectureSession | undefined> {
    const all = await readAll();
    const found = all.find((s) => s.id === id);
    if (!found) return undefined;
    const migrated = migrateSessionSpecialists(found);
    if (migrated.changed) {
      const idx = all.findIndex((s) => s.id === id);
      if (idx >= 0) {
        all[idx] = migrated.session;
        await writeAll(all);
      }
    }
    return migrated.session;
  },
  async upsert(session: ArchitectureSession): Promise<void> {
    const migrated = migrateSessionSpecialists(session);
    const next = migrated.session;
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === next.id);
    next.updatedAt = new Date().toISOString();
    if (idx >= 0) all[idx] = next;
    else all.push(next);
    await writeAll(all);
  },
  async remove(id: string): Promise<void> {
    const all = await readAll();
    await writeAll(all.filter((s) => s.id !== id));
  },
  async clear(): Promise<void> {
    await writeAll([]);
  },
  paths: { DATA_DIR, HISTORY_FILE, dirnameFor: (f: string) => dirname(f) },
};
