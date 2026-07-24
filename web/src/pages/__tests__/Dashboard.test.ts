import { describe, it, expect } from "vitest";
import {
  bucketByDay,
  filterHistory,
  hasAnyAverageData,
  summarizeHistory,
} from "../Dashboard";
import type {
  HistoryAverages,
  HistorySummary,
  StageCost,
} from "../../connector";

/** Zero-valued StageCost with optional overrides — the schema is
 *  wide (input/output/cache/etc token counts), and the reducers only
 *  read `estimatedUsd` and `llmCalls`, so a helper keeps fixtures tidy. */
function stage(overrides: Partial<StageCost> = {}): StageCost {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
    llmCalls: 0,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<HistorySummary> = {}): HistorySummary {
  return {
    id: "s1",
    title: "Chloropyridine 500 t/yr Gujarat",
    idea: "Set up a 500 t/yr chloropyridine plant in Gujarat.",
    createdAt: new Date().toISOString(),
    updatedAt: "",
    endedAt: null,
    status: "completed",
    refinementRounds: 1,
    completeness: 90,
    documents: 0,
    hasRefinedIdea: true,
    settings: {
      threshold: 95,
      maxRounds: 4,
      terminationPolicy: "threshold_or_max",
    },
    costs: null,
    durations: null,
    analyst: { id: "aarav", name: "Aarav", model: "gpt-4" },
    teams: [],
    artifacts: [],
    ...overrides,
  };
}

describe("Dashboard reducers", () => {
  describe("summarizeHistory", () => {
    it("returns zero-valued stats for an empty list", () => {
      const s = summarizeHistory([]);
      expect(s.totalRuns).toBe(0);
      expect(s.completedRuns).toBe(0);
      expect(s.runningRuns).toBe(0);
      expect(s.errorRuns).toBe(0);
      expect(s.totalCostUsd).toBe(0);
      expect(s.totalLlmCalls).toBe(0);
      expect(s.costPerTeam).toEqual([]);
      // 14 days of empty buckets.
      expect(s.perDay.length).toBe(14);
      expect(s.perDay.every((b) => b.total === 0)).toBe(true);
    });

    it("counts sessions by status", () => {
      const s = summarizeHistory([
        makeSummary({ id: "1", status: "completed" }),
        makeSummary({ id: "2", status: "completed" }),
        makeSummary({ id: "3", status: "refining" }),
        makeSummary({ id: "4", status: "generating" }),
        makeSummary({ id: "5", status: "locked" }),
        makeSummary({ id: "6", status: "error" }),
      ]);
      expect(s.totalRuns).toBe(6);
      expect(s.completedRuns).toBe(2);
      expect(s.runningRuns).toBe(3); // refining + generating + locked
      expect(s.errorRuns).toBe(1);
    });

    it("sums cost across sessions and aggregates per-team spend", () => {
      const s = summarizeHistory([
        makeSummary({
          id: "1",
          costs: {
            total: stage({ estimatedUsd: 1.5, llmCalls: 12, totalTokens: 12000 }),
            perTeam: {
              market: stage({ estimatedUsd: 0.5, llmCalls: 5, totalTokens: 5000 }),
              procedure: stage({
                estimatedUsd: 1,
                llmCalls: 7,
                totalTokens: 7000,
              }),
            },
            analyst: stage(),
            usageComplete: true,
          },
        }),
        makeSummary({
          id: "2",
          costs: {
            total: stage({ estimatedUsd: 0.25, llmCalls: 4, totalTokens: 4000 }),
            perTeam: {
              market: stage({
                estimatedUsd: 0.25,
                llmCalls: 4,
                totalTokens: 4000,
              }),
            },
            analyst: stage(),
            usageComplete: true,
          },
        }),
      ]);
      expect(s.totalCostUsd).toBeCloseTo(1.75, 5);
      expect(s.totalLlmCalls).toBe(16);
      // Sorted descending by USD.
      expect(s.costPerTeam).toEqual([
        { kind: "procedure", usd: 1, llmCalls: 7 },
        { kind: "market", usd: 0.75, llmCalls: 9 },
      ]);
    });

    it("skips team entries with zero LLM calls", () => {
      const s = summarizeHistory([
        makeSummary({
          costs: {
            total: stage(),
            perTeam: { market: stage() },
            analyst: stage(),
            usageComplete: true,
          },
        }),
      ]);
      expect(s.costPerTeam).toEqual([]);
    });
  });

  describe("bucketByDay", () => {
    it("returns exactly N days of buckets in chronological order", () => {
      const buckets = bucketByDay([], 7);
      expect(buckets.length).toBe(7);
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]!.date > buckets[i - 1]!.date).toBe(true);
      }
    });

    it("puts a session into today's bucket by default", () => {
      const today = makeSummary();
      const buckets = bucketByDay([today], 7);
      const last = buckets[buckets.length - 1]!;
      expect(last.total).toBe(1);
      expect(last.completed).toBe(1);
    });

    it("ignores sessions whose createdAt is older than the window", () => {
      const old = makeSummary({
        createdAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
      });
      const buckets = bucketByDay([old], 7);
      expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(0);
    });

    it("classifies running vs errored sessions correctly", () => {
      const buckets = bucketByDay(
        [
          makeSummary({ id: "a", status: "generating" }),
          makeSummary({ id: "b", status: "error" }),
        ],
        7,
      );
      const last = buckets[buckets.length - 1]!;
      expect(last.total).toBe(2);
      expect(last.running).toBe(1);
      expect(last.errored).toBe(1);
      expect(last.completed).toBe(0);
    });
  });

  describe("filterHistory", () => {
    it("returns the full list when query is empty or whitespace", () => {
      const list = [makeSummary({ id: "1" }), makeSummary({ id: "2" })];
      expect(filterHistory(list, "")).toBe(list);
      expect(filterHistory(list, "   ")).toBe(list);
    });

    it("matches on title", () => {
      const list = [
        makeSummary({ id: "1", title: "Chloropyridine Gujarat" }),
        makeSummary({ id: "2", title: "Semiconductor wafer fab" }),
      ];
      const out = filterHistory(list, "Semiconductor");
      expect(out).toHaveLength(1);
      expect(out[0]!.id).toBe("2");
    });

    it("matches on idea (case-insensitive)", () => {
      const list = [makeSummary({ id: "1", idea: "500 t/yr fluorochemicals" })];
      expect(filterHistory(list, "FLUORO")).toHaveLength(1);
    });
  });

  describe("hasAnyAverageData", () => {
    it("returns false when everything is empty", () => {
      const a: HistoryAverages = {
        session: null,
        analyst: null,
        perTeam: {},
      };
      expect(hasAnyAverageData(a)).toBe(false);
    });

    it("returns true when session averages have samples", () => {
      const a: HistoryAverages = {
        session: { avgMs: 30000, samples: 3 },
        analyst: null,
        perTeam: {},
      };
      expect(hasAnyAverageData(a)).toBe(true);
    });

    it("returns true when at least one team average has samples", () => {
      const a: HistoryAverages = {
        session: null,
        analyst: null,
        perTeam: { market: { avgMs: 10000, samples: 2 } },
      };
      expect(hasAnyAverageData(a)).toBe(true);
    });
  });
});
