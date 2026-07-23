import { describe, it, expect } from "vitest";
import { buildSolutionPack, slugifySessionTitle } from "../exporter";
import type { ArchitectureSession } from "../../connector/types";

function makeSession(overrides: Partial<ArchitectureSession> = {}): ArchitectureSession {
  return {
    id: "s1",
    title: "Chloropyridine 500 t/yr Gujarat",
    idea: "Set up a 500 t/yr chloropyridine plant in Gujarat.",
    status: "completed",
    createdAt: new Date("2026-05-01T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-05-02T00:00:00Z").toISOString(),
    settings: { threshold: 95, maxRounds: 4 },
    specialists: {
      analyst: {
        id: "aarav",
        role: "analyst",
        name: "Aarav",
        tagline: "-",
        model: "gpt-4",
        avatarId: "aarav",
        accent: {
          solid: "bg-indigo-500",
          bg: "bg-indigo-50",
          border: "border-indigo-200",
          text: "text-indigo-700",
          ring: "ring-indigo-200",
        },
        params: {},
        roleDescription: "",
        tone: "",
      },
      teams: [],
    },
    documents: [],
    refinement: [],
    refinedIdea: { content: "Refined concept body.", createdAt: new Date().toISOString() },
    artifacts: [
      {
        kind: "market",
        title: "Market Analysis",
        producedBy: "ananya",
        content: "Market body.",
        createdAt: new Date().toISOString(),
        streaming: false,
        rounds: [
          { n: 1, drafts: [], startedAt: "", endedAt: "" },
          { n: 2, drafts: [], startedAt: "", endedAt: "" },
        ],
        terminatedBy: "agreement",
        finalAgreements: {},
      },
      {
        kind: "finance",
        title: "Financial Projection",
        producedBy: "neha",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: false,
        rounds: [],
        terminatedBy: "error",
        error: "boom",
        finalAgreements: {},
      },
    ],
    ...overrides,
  };
}

describe("slugifySessionTitle", () => {
  it("lowercases, dashes, and trims", () => {
    expect(slugifySessionTitle("Chloropyridine 500 t/yr Plant!")).toBe(
      "chloropyridine-500-t-yr-plant",
    );
  });
  it("returns a stable fallback for empty titles", () => {
    expect(slugifySessionTitle("")).toBe("session");
    expect(slugifySessionTitle("!!!")).toBe("session");
  });
  it("caps length at 60", () => {
    expect(slugifySessionTitle("x".repeat(120)).length).toBeLessThanOrEqual(60);
  });
});

describe("buildSolutionPack", () => {
  it("includes title, original idea, refined concept, and each artifact", () => {
    const md = buildSolutionPack(makeSession());
    expect(md).toContain("# Chloropyridine 500 t/yr Gujarat — Market Research Pack");
    expect(md).toContain("## Original Idea");
    expect(md).toContain("Set up a 500 t/yr chloropyridine plant");
    expect(md).toContain("## Refined Concept");
    expect(md).toContain("Refined concept body.");
    expect(md).toContain("## Market Analysis");
    expect(md).toContain("Market body.");
    expect(md).toContain("## Financial Projection");
  });

  it("annotates artifacts with debate outcome and errors", () => {
    const md = buildSolutionPack(makeSession());
    expect(md).toContain("terminated by agreement");
    expect(md).toContain("⚠ Generation error: boom");
  });

  it("skips artifact kinds that aren't present", () => {
    const md = buildSolutionPack(makeSession({ artifacts: [] }));
    expect(md).not.toContain("## Market Analysis");
    expect(md).toContain("Refined Concept");
  });

  it("omits the Refined Concept section when refinedIdea is absent", () => {
    const md = buildSolutionPack(makeSession({ refinedIdea: undefined }));
    expect(md).not.toContain("Refined Concept");
    expect(md).toContain("Original Idea");
  });
});
