import { Router } from "express";
import { Cursor, CursorAgentError, type ModelListItem } from "@cursor/sdk";
import { assertKey } from "../agents/llm.js";
import { createLogger, errorFields } from "../logger.js";

export const router = Router();

const log = createLogger("models");

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
    log.debug("Serving the model list from cache", {
      models: cache.items.length,
      ageMs: now - cache.fetchedAt,
    });
    return res.json({ models: cache.items, cachedAt: new Date(cache.fetchedAt).toISOString() });
  }
  try {
    const apiKey = assertKey();
    const items = await Cursor.models.list({ apiKey });
    cache = { fetchedAt: now, items };
    log.info("Fetched the model list from the Cursor SDK", {
      models: items.length,
      durationMs: Date.now() - now,
      forced: force,
    });
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
      log.warn("Model list fetch failed — serving the stale cache", {
        staleAgeMs: now - cache.fetchedAt,
        ...errorFields(err),
      });
      return res.status(200).json({
        models: cache.items,
        cachedAt: new Date(cache.fetchedAt).toISOString(),
        warning: msg,
      });
    }
    log.error("Model list fetch failed with no cache to fall back on", errorFields(err));
    res.status(502).json({ error: msg });
  }
});
