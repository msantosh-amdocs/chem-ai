import { describe, it, expect } from "vitest";
import {
  PIPELINE_WAVES,
  derivePipelineNodeStatus,
  canonicalKindOrder,
  isProcessKindActive,
  processKindForIndustry,
} from "../pipeline";
import type {
  DocumentArtifact,
  StageTeamSnapshot,
} from "../../connector/types";
import type { DocumentKind } from "../../connector/personas";

function makeTeam(kind: DocumentKind): StageTeamSnapshot {
  return {
    kind,
    minMembers: 2,
    members: [
      {
        id: "m1",
        role: "market_analyst",
        name: "Ananya",
        tagline: "-",
        model: "gpt-4",
        avatarId: "ananya",
        accent: {
          solid: "bg-violet-500",
          bg: "bg-violet-50",
          border: "border-violet-200",
          text: "text-violet-700",
          ring: "ring-violet-200",
        },
        params: {},
        roleDescription: "",
        tone: "",
      },
    ],
  };
}

function makeArtifact(kind: DocumentKind, content = ""): DocumentArtifact {
  return {
    kind,
    title: kind,
    producedBy: "m1",
    content,
    createdAt: new Date().toISOString(),
    streaming: false,
    rounds: [],
    finalAgreements: {},
  };
}

describe("PIPELINE_WAVES", () => {
  it("has 4 waves ordered by dependency", () => {
    expect(PIPELINE_WAVES).toEqual([
      ["market", "procedure", "semiconductor"],
      ["procurement", "ip"],
      ["finance"],
      ["presentation"],
    ]);
  });
});

describe("canonicalKindOrder", () => {
  it("orders artifact kinds for rendering", () => {
    expect(canonicalKindOrder("market")).toBe(0);
    expect(canonicalKindOrder("procedure")).toBe(1);
    expect(canonicalKindOrder("semiconductor")).toBe(2);
    expect(canonicalKindOrder("procurement")).toBe(3);
    expect(canonicalKindOrder("ip")).toBe(4);
    expect(canonicalKindOrder("finance")).toBe(5);
    expect(canonicalKindOrder("presentation")).toBe(6);
  });
});

describe("processKindForIndustry", () => {
  it("returns 'semiconductor' only for semiconductor runs", () => {
    expect(processKindForIndustry("semiconductor")).toBe("semiconductor");
  });
  it("returns 'procedure' for chemical / pharma / other / undefined runs", () => {
    expect(processKindForIndustry("chemical")).toBe("procedure");
    expect(processKindForIndustry("pharmaceutical")).toBe("procedure");
    expect(processKindForIndustry("other")).toBe("procedure");
    expect(processKindForIndustry(undefined)).toBe("procedure");
    expect(processKindForIndustry(null)).toBe("procedure");
  });
});

describe("isProcessKindActive", () => {
  it("keeps non-process kinds active regardless of industry", () => {
    for (const industry of [
      undefined,
      null,
      "chemical",
      "pharmaceutical",
      "semiconductor",
      "other",
    ] as const) {
      expect(isProcessKindActive("market", industry)).toBe(true);
      expect(isProcessKindActive("procurement", industry)).toBe(true);
      expect(isProcessKindActive("ip", industry)).toBe(true);
      expect(isProcessKindActive("finance", industry)).toBe(true);
      expect(isProcessKindActive("presentation", industry)).toBe(true);
    }
  });
  it("activates procedure for chemical / pharma / undefined and semiconductor only for semiconductor", () => {
    expect(isProcessKindActive("procedure", "chemical")).toBe(true);
    expect(isProcessKindActive("procedure", "pharmaceutical")).toBe(true);
    expect(isProcessKindActive("procedure", "other")).toBe(true);
    expect(isProcessKindActive("procedure", undefined)).toBe(true);
    expect(isProcessKindActive("procedure", "semiconductor")).toBe(false);

    expect(isProcessKindActive("semiconductor", "semiconductor")).toBe(true);
    expect(isProcessKindActive("semiconductor", "chemical")).toBe(false);
    expect(isProcessKindActive("semiconductor", "pharmaceutical")).toBe(false);
    expect(isProcessKindActive("semiconductor", "other")).toBe(false);
    expect(isProcessKindActive("semiconductor", undefined)).toBe(false);
  });
});

describe("derivePipelineNodeStatus", () => {
  const emptyLive = {
    liveGenerating: new Set<DocumentKind>(),
    liveDone: new Set<DocumentKind>(),
    liveErrors: {} as Partial<Record<DocumentKind, string>>,
  };

  it("returns 'disabled' when no team is configured", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "market",
        team: undefined,
        artifact: undefined,
        ...emptyLive,
      }),
    ).toBe("disabled");
  });

  it("returns 'error' when live errors are set for this kind", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "market",
        team: makeTeam("market"),
        artifact: undefined,
        ...emptyLive,
        liveErrors: { market: "boom" },
      }),
    ).toBe("error");
  });

  it("returns 'running' when live.generating includes the kind", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "procedure",
        team: makeTeam("procedure"),
        artifact: undefined,
        ...emptyLive,
        liveGenerating: new Set(["procedure"]),
      }),
    ).toBe("running");
  });

  it("returns 'done' when live.done includes the kind", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "procurement",
        team: makeTeam("procurement"),
        artifact: undefined,
        ...emptyLive,
        liveDone: new Set(["procurement"]),
      }),
    ).toBe("done");
  });

  it("returns 'done' when the artifact already has content", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "presentation",
        team: makeTeam("presentation"),
        artifact: makeArtifact("presentation", "final content"),
        ...emptyLive,
      }),
    ).toBe("done");
  });

  it("returns 'queued' when a team exists but nothing has happened yet", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "market",
        team: makeTeam("market"),
        artifact: undefined,
        ...emptyLive,
      }),
    ).toBe("queued");
  });

  it("prefers 'error' over 'running' and 'done'", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "market",
        team: makeTeam("market"),
        artifact: makeArtifact("market", "content"),
        liveGenerating: new Set(["market"]),
        liveDone: new Set(["market"]),
        liveErrors: { market: "boom" },
      }),
    ).toBe("error");
  });

  it("marks semiconductor as 'skipped' on chemical / pharma runs", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "semiconductor",
        team: makeTeam("semiconductor"),
        artifact: undefined,
        ...emptyLive,
        industry: "chemical",
      }),
    ).toBe("skipped");
    expect(
      derivePipelineNodeStatus({
        kind: "semiconductor",
        team: makeTeam("semiconductor"),
        artifact: undefined,
        ...emptyLive,
        industry: "pharmaceutical",
      }),
    ).toBe("skipped");
  });

  it("marks procedure as 'skipped' on semiconductor runs", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "procedure",
        team: makeTeam("procedure"),
        artifact: undefined,
        ...emptyLive,
        industry: "semiconductor",
      }),
    ).toBe("skipped");
  });

  it("still shows the active process kind with its normal status", () => {
    expect(
      derivePipelineNodeStatus({
        kind: "procedure",
        team: makeTeam("procedure"),
        artifact: makeArtifact("procedure", "final"),
        ...emptyLive,
        industry: "chemical",
      }),
    ).toBe("done");
    expect(
      derivePipelineNodeStatus({
        kind: "semiconductor",
        team: makeTeam("semiconductor"),
        artifact: undefined,
        ...emptyLive,
        liveGenerating: new Set(["semiconductor"]),
        industry: "semiconductor",
      }),
    ).toBe("running");
  });

  it("does NOT downgrade a completed artifact to skipped (safety valve)", () => {
    // If somehow both artifacts exist (e.g. a mis-classified run that
    // was regenerated), we should still surface the completed one.
    expect(
      derivePipelineNodeStatus({
        kind: "procedure",
        team: makeTeam("procedure"),
        artifact: makeArtifact("procedure", "done"),
        ...emptyLive,
        industry: "semiconductor",
      }),
    ).toBe("done");
  });
});
