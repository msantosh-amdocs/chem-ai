/**
 * Token → USD pricing for the models we can invoke through the Cursor SDK.
 *
 * The Cursor SDK reports `TokenUsage` on each Agent.prompt() call
 * (inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
 * reasoningTokens). We use a prefix-based rate table to estimate a USD
 * cost per call — good enough for the "how much did that idea cost me"
 * question the Pipeline / History pages surface.
 *
 * IMPORTANT: These are *estimates*. Real billing depends on Cursor's
 * per-account pricing (subscription vs pay-as-you-go, credits, discounts)
 * and provider rate changes.  We surface the estimate with an "est." label
 * everywhere in the UI so nobody mistakes it for a bill.
 */

import type { TokenUsage } from "@cursor/sdk";

/** USD per 1,000,000 tokens. */
export interface ModelRate {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Multiplier on inputPerMTok for cache-hit reads. Typical: 0.10 (90% cheaper). */
  cacheReadMultiplier?: number;
  /** Multiplier on inputPerMTok for cache-write tokens. Typical: 1.25. */
  cacheWriteMultiplier?: number;
}

/**
 * Longest-prefix match wins. Keep more-specific keys first when they
 * genuinely have different pricing (e.g. "claude-opus-4-7-thinking" if it
 * ever priced differently from base opus-4).
 */
const RATE_TABLE: Array<{ prefix: string; rate: ModelRate }> = [
  // Anthropic — public list prices, per 1M tokens.
  { prefix: "claude-opus", rate: { inputPerMTok: 15, outputPerMTok: 75 } },
  { prefix: "claude-sonnet", rate: { inputPerMTok: 3, outputPerMTok: 15 } },
  { prefix: "claude-haiku", rate: { inputPerMTok: 1, outputPerMTok: 5 } },

  // OpenAI GPT-5 family — public list prices at time of writing.
  { prefix: "gpt-5", rate: { inputPerMTok: 2.5, outputPerMTok: 10 } },
  { prefix: "gpt-4o", rate: { inputPerMTok: 2.5, outputPerMTok: 10 } },
  { prefix: "gpt-4", rate: { inputPerMTok: 10, outputPerMTok: 30 } },
  { prefix: "o1", rate: { inputPerMTok: 15, outputPerMTok: 60 } },
  { prefix: "o3", rate: { inputPerMTok: 15, outputPerMTok: 60 } },

  // xAI Grok — approximation.
  { prefix: "grok", rate: { inputPerMTok: 3, outputPerMTok: 15 } },

  // Cursor's own small/fast model — very approximate.
  { prefix: "composer", rate: { inputPerMTok: 0.3, outputPerMTok: 1 } },
];

const DEFAULT_RATE: ModelRate = { inputPerMTok: 2, outputPerMTok: 10 };
const DEFAULT_CACHE_READ_MULT = 0.1;
const DEFAULT_CACHE_WRITE_MULT = 1.25;

/**
 * Resolve the rate table entry for a given model id. Case-insensitive
 * longest-prefix match. Returns `DEFAULT_RATE` for unrecognised models so
 * we always attribute *some* cost rather than zero — otherwise a typo in
 * the model id would silently swallow the entire session bill.
 */
export function rateForModel(modelId: string): ModelRate {
  const id = modelId.toLowerCase();
  let best: { prefix: string; rate: ModelRate } | null = null;
  for (const entry of RATE_TABLE) {
    if (id.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  return best?.rate ?? DEFAULT_RATE;
}

/**
 * Estimated USD for one call's TokenUsage against a specific model.
 * Silently tolerates missing usage (returns 0) — some Cursor SDK backends
 * don't always report usage and we don't want to poison a whole session
 * because one call skipped it.
 */
export function priceUsage(
  modelId: string,
  usage: TokenUsage | undefined,
): number {
  if (!usage) return 0;
  const rate = rateForModel(modelId);
  const cacheReadMult = rate.cacheReadMultiplier ?? DEFAULT_CACHE_READ_MULT;
  const cacheWriteMult = rate.cacheWriteMultiplier ?? DEFAULT_CACHE_WRITE_MULT;

  const cost =
    (usage.inputTokens / 1_000_000) * rate.inputPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputPerMTok +
    (usage.cacheReadTokens / 1_000_000) * rate.inputPerMTok * cacheReadMult +
    (usage.cacheWriteTokens / 1_000_000) * rate.inputPerMTok * cacheWriteMult;

  // Reasoning tokens are billed as output on the providers we support.
  const reasoning = usage.reasoningTokens ?? 0;
  return cost + (reasoning / 1_000_000) * rate.outputPerMTok;
}

/**
 * Round to 4 decimals — sub-cent precision is meaningless for our
 * estimate but lots of small calls should still add up correctly.
 */
export function roundUsd(usd: number): number {
  return Math.round(usd * 10_000) / 10_000;
}
