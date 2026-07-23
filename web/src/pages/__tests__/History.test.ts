import { describe, it, expect } from "vitest";
import { filterHistory } from "../History";
import type { HistorySummary } from "../../connector";

function makeSummary(overrides: Partial<HistorySummary> = {}): HistorySummary {
  return {
    id: "s1",
    title: "Chloropyridine 500 t/yr Gujarat",
    idea: "Set up a 500 t/yr chloropyridine plant in Gujarat.",
    createdAt: "",
    updatedAt: "",
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
