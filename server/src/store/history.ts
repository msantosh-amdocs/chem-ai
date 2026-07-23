import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArchitectureSession } from "../types.js";

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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(list: ArchitectureSession[]): Promise<void> {
  // Serialize writes so concurrent updates don't clobber one another.
  writeQueue = writeQueue.then(async () => {
    await ensureFile();
    await writeFile(HISTORY_FILE, JSON.stringify(list, null, 2), "utf8");
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
    return all.find((s) => s.id === id);
  },
  async upsert(session: ArchitectureSession): Promise<void> {
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === session.id);
    session.updatedAt = new Date().toISOString();
    if (idx >= 0) all[idx] = session;
    else all.push(session);
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
