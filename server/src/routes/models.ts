import { Router } from "express";
import { Cursor, CursorAgentError, type ModelListItem } from "@cursor/sdk";
import { assertKey } from "../agents/llm.js";

export const router = Router();

interface CacheEntry {
  fetchedAt: number;
  items: ModelListItem[];
}
let cache: CacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000;

router.get("/models", async (req, res) => {
  const force = req.query.refresh === "1";
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < TTL_MS) {
    return res.json({ models: cache.items, cachedAt: new Date(cache.fetchedAt).toISOString() });
  }
  try {
    const apiKey = assertKey();
    const items = await Cursor.models.list({ apiKey });
    cache = { fetchedAt: now, items };
    res.json({ models: items, cachedAt: new Date(now).toISOString() });
  } catch (err) {
    const msg =
      err instanceof CursorAgentError
        ? `Cursor SDK: ${err.message}`
        : err instanceof Error
          ? err.message
          : "unknown error";
    // Serve stale cache if we have one, so the UI doesn't break on transient failures.
    if (cache) {
      return res.status(200).json({
        models: cache.items,
        cachedAt: new Date(cache.fetchedAt).toISOString(),
        warning: msg,
      });
    }
    res.status(502).json({ error: msg });
  }
});
