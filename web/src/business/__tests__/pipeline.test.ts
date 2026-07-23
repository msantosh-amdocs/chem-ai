import { describe, it, expect } from "vitest";
import {
  PIPELINE_WAVES,
  derivePipelineNodeStatus,
  canonicalKindOrder,
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
      ["market", "procedure"],
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
    expect(canonicalKindOrder("procurement")).toBe(2);
    expect(canonicalKindOrder("ip")).toBe(3);
    expect(canonicalKindOrder("finance")).toBe(4);
    expect(canonicalKindOrder("presentation")).toBe(5);
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
});
