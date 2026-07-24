import { describe, it, expect } from "vitest";
import {
  computeSessionDurationMs,
  filterHistory,
  hasAnyAverageData,
  isSessionRunning,
} from "../History";
import type { HistoryAverages, HistorySummary } from "../../connector";

function makeSummary(overrides: Partial<HistorySummary> = {}): HistorySummary {
  return {
    id: "s1",
    title: "Chloropyridine 500 t/yr Gujarat",
    idea: "Set up a 500 t/yr chloropyridine plant in Gujarat.",
    createdAt: "",
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
    artifacts: [
      {
        kind: "market",
        title: "Market Analysis",
        hasContent: true,
        error: null,
        rounds: 2,
        terminatedBy: "agreement",
        finalAgreements: {},
        startedAt: null,
        endedAt: null,
        durationMs: null,
      },
    ],
    ...overrides,
  };
}

describe("filterHistory", () => {
  const list: HistorySummary[] = [
    makeSummary({ id: "a", title: "Chloropyridine", idea: "Chloropyridine plant in Gujarat" }),
    makeSummary({ id: "b", title: "300 mm Analog IC Fab", idea: "MEMS + power semiconductor foundry" }),
    makeSummary({ id: "c", title: "Bulk Drug API Site", idea: "Metformin bulk drug" }),
  ];

  it("returns everything on an empty query", () => {
    expect(filterHistory(list, "")).toHaveLength(3);
    expect(filterHistory(list, "   ")).toHaveLength(3);
  });

  it("matches on title (case-insensitive)", () => {
    const out = filterHistory(list, "MEMS");
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });

  it("matches on idea text", () => {
    const out = filterHistory(list, "metformin");
    expect(out.map((s) => s.id)).toEqual(["c"]);
  });

  it("matches on artifact short-kind (market)", () => {
    const out = filterHistory(list, "market");
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterHistory(list, "zzz-nope")).toEqual([]);
  });
});

describe("isSessionRunning", () => {
  it.each([
    ["refining", true],
    ["locked", true],
    ["generating", true],
    ["completed", false],
    ["error", false],
    ["cancelled", false],
  ] as const)("%s -> %s", (status, expected) => {
    expect(isSessionRunning(makeSummary({ status: status as never }))).toBe(expected);
  });
});

describe("computeSessionDurationMs", () => {
  const NOW = 1_800_000_000_000;

  it("prefers server-stamped durations.totalMs when available", () => {
    const s = makeSummary({
      status: "completed",
      createdAt: new Date(NOW - 60_000).toISOString(),
      endedAt: new Date(NOW - 55_000).toISOString(),
      durations: { perTeam: {}, totalMs: 4_000 },
    });
    // Even though endedAt-createdAt would give 5000ms, the server-
    // stamped totalMs takes precedence — that value was measured
    // against the same clock that owns the truth.
    expect(computeSessionDurationMs(s, NOW)).toBe(4_000);
  });

  it("falls back to endedAt - createdAt when totalMs is not set", () => {
    const s = makeSummary({
      status: "completed",
      createdAt: new Date(NOW - 10_000).toISOString(),
      endedAt: new Date(NOW - 4_000).toISOString(),
      durations: null,
    });
    expect(computeSessionDurationMs(s, NOW)).toBe(6_000);
  });

  it("uses live wall-clock delta when the session is still running", () => {
    const s = makeSummary({
      status: "generating",
      createdAt: new Date(NOW - 12_500).toISOString(),
      endedAt: null,
      durations: null,
    });
    expect(computeSessionDurationMs(s, NOW)).toBe(12_500);
  });

  it("returns null for a completed session with no endedAt and no durations", () => {
    const s = makeSummary({
      status: "completed",
      createdAt: new Date(NOW - 1000).toISOString(),
      endedAt: null,
      durations: null,
    });
    expect(computeSessionDurationMs(s, NOW)).toBeNull();
  });
});

describe("hasAnyAverageData", () => {
  it("is false when all channels are empty", () => {
    const empty: HistoryAverages = { perTeam: {}, session: null, analyst: null };
    expect(hasAnyAverageData(empty)).toBe(false);
  });

  it("is true when a session average exists", () => {
    const a: HistoryAverages = {
      perTeam: {},
      session: { avgMs: 10_000, samples: 3 },
      analyst: null,
    };
    expect(hasAnyAverageData(a)).toBe(true);
  });

  it("is true when at least one per-team average has samples", () => {
    const a: HistoryAverages = {
      perTeam: { market: { avgMs: 5_000, samples: 2 } },
      session: null,
      analyst: null,
    };
    expect(hasAnyAverageData(a)).toBe(true);
  });

  it("is false when per-team buckets exist but have zero samples", () => {
    const a: HistoryAverages = {
      perTeam: { market: { avgMs: 0, samples: 0 } },
      session: null,
      analyst: null,
    };
    expect(hasAnyAverageData(a)).toBe(false);
  });
});
