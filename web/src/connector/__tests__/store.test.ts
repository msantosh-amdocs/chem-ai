import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useStore,
  applyEvent,
  initialLive,
  personaToSnapshot,
  teamsToSnapshot,
  type LiveState,
} from "../store";
import { defaultAnalyst, defaultTeams, KIND_MAX_MEMBERS } from "../personas";
import type { ArchitectureSession, RefinementRound, SessionEvent } from "../types";

function baseSession(): ArchitectureSession {
  return {
    id: "s1",
    title: "Test Session",
    idea: "-",
    createdAt: "",
    updatedAt: "",
    status: "refining",
    settings: { threshold: 95, maxRounds: 4 },
    specialists: {
      analyst: personaToSnapshot(defaultAnalyst()),
      teams: teamsToSnapshot(defaultTeams()),
    },
    documents: [],
    refinement: [],
    artifacts: [],
  };
}

function baseLive(): LiveState {
  return {
    ...initialLive,
    generating: new Set(initialLive.generating),
    done: new Set(initialLive.done),
    currentRound: { ...initialLive.currentRound },
    activeMembers: { ...initialLive.activeMembers },
    latestAgreement: { ...initialLive.latestAgreement },
    errors: { ...initialLive.errors },
  };
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    tab: "new",
    currentSession: null,
    draftAnswers: {},
    live: baseLive(),
    historyList: [],
    eventSource: null,
    modelsError: null,
    models: [],
    modelsLoading: false,
    health: null,
  });
});

describe("personaToSnapshot / teamsToSnapshot", () => {
  it("drops UI-only fields (nothing extra) and preserves accents", () => {
    const s = personaToSnapshot(defaultAnalyst());
    expect(s.name).toBeTruthy();
    expect(s.accent.solid).toMatch(/^bg-/);
  });

  it("snapshots every team member", () => {
    const teams = teamsToSnapshot(defaultTeams());
    expect(teams.length).toBeGreaterThan(0);
    for (const t of teams) expect(t.members.length).toBeGreaterThan(0);
  });
});

describe("applyEvent (pure reducer)", () => {
  it("replaces the session on 'session' events", () => {
    const s = baseSession();
    const out = applyEvent(
      { session: null, live: baseLive() },
      { type: "session", session: s },
    );
    expect(out.session).toBe(s);
  });

  it("toggles refining flag on refinement.started/completed", () => {
    const s = baseSession();
    const round: RefinementRound = {
      n: 1,
      interpretation: "-",
      completeness: 20,
      questions: [],
      answers: [],
      createdAt: "",
    };
    const started = applyEvent(
      { session: s, live: baseLive() },
      { type: "refinement.started" },
    );
    expect(started.live.refining).toBe(true);
    const completed = applyEvent(
      { session: s, live: started.live },
      { type: "refinement.completed", round },
    );
    expect(completed.live.refining).toBe(false);
    expect(completed.session?.refinement).toHaveLength(1);
  });

  it("is idempotent for duplicate refinement rounds", () => {
    const s = { ...baseSession(), refinement: [{ n: 1 } as RefinementRound] };
    const out = applyEvent(
      { session: s, live: baseLive() },
      {
        type: "refinement.completed",
        round: {
          n: 1,
          interpretation: "-",
          completeness: 0,
          questions: [],
          answers: [],
          createdAt: "",
        },
      },
    );
    expect(out.session?.refinement).toHaveLength(1);
  });

  it("marks concept.started and switches to the pipeline tab", () => {
    const out = applyEvent(
      { session: baseSession(), live: baseLive() },
      { type: "concept.started" },
    );
    expect(out.live.concepting).toBe(true);
    expect(out.nextTab).toBe("pipeline");
  });

  it("adds a streaming artifact placeholder on artifact.started", () => {
    const out = applyEvent(
      { session: baseSession(), live: baseLive() },
      {
        type: "artifact.started",
        kind: "market",
        memberIds: ["m1", "m2"],
        leadId: "m1",
        title: "Market Analysis",
      },
    );
    expect(out.live.generating.has("market")).toBe(true);
    expect(out.session?.artifacts[0]?.kind).toBe("market");
    expect(out.session?.artifacts[0]?.streaming).toBe(true);
    expect(out.session?.status).toBe("generating");
  });

  it("clears generating and marks done on artifact.completed", () => {
    const live = baseLive();
    live.generating.add("market");
    const artifact = {
      kind: "market" as const,
      title: "Market Analysis",
      producedBy: "m1",
      content: "final",
      createdAt: "",
      streaming: false,
      rounds: [{ n: 1, drafts: [], startedAt: "", endedAt: "" }],
      terminatedBy: "agreement" as const,
      finalAgreements: {},
    };
    const out = applyEvent(
      { session: baseSession(), live },
      { type: "artifact.completed", artifact },
    );
    expect(out.live.generating.has("market")).toBe(false);
    expect(out.live.done.has("market")).toBe(true);
  });

  it("records artifact errors without throwing", () => {
    const out = applyEvent(
      { session: baseSession(), live: baseLive() },
      { type: "artifact.error", kind: "market", message: "boom" },
    );
    expect(out.live.errors.market).toBe("boom");
  });

  it("clears live flags and switches to docs on session.completed", () => {
    const finished = { ...baseSession(), status: "completed" as const };
    const out = applyEvent(
      { session: baseSession(), live: { ...baseLive(), running: true } },
      { type: "session.completed", session: finished },
    );
    expect(out.live.running).toBe(false);
    expect(out.nextTab).toBe("docs");
    expect(out.session).toBe(finished);
  });

  it("signals closeStream on stream.end", () => {
    const out = applyEvent(
      { session: baseSession(), live: baseLive() },
      { type: "stream.end" } as SessionEvent,
    );
    expect(out.closeStream).toBe(true);
  });
});

describe("useStore actions", () => {
  it("updateAnalyst persists to storage and updates state", () => {
    useStore.getState().updateAnalyst({ name: "Custom Analyst" });
    expect(useStore.getState().specialists.analyst.name).toBe("Custom Analyst");
    expect(localStorage.getItem("mr.specialists.v1")).toContain("Custom Analyst");
  });

  it("addMember respects the department max cap (4) and removeMember respects the min", () => {
    const kind = "market" as const;
    const before = useStore.getState().specialists.teams.find((t) => t.kind === kind)!;
    const addCount = KIND_MAX_MEMBERS[kind] - before.members.length;
    for (let i = 0; i < addCount + 3; i++) useStore.getState().addMember(kind);
    const after = useStore.getState().specialists.teams.find((t) => t.kind === kind)!;
    expect(after.members.length).toBe(KIND_MAX_MEMBERS[kind]);

    for (const m of [...after.members]) useStore.getState().removeMember(kind, m.id);
    const trimmed = useStore.getState().specialists.teams.find((t) => t.kind === kind)!;
    expect(trimmed.members.length).toBeGreaterThanOrEqual(1);
  });

  it("updateGenSettings persists and merges patch data", () => {
    useStore.getState().updateGenSettings({ threshold: 70 });
    expect(useStore.getState().genSettings.threshold).toBe(70);
    expect(localStorage.getItem("mr.settings.v1")).toContain("70");
  });

  it("setDraftAnswer stores per-question drafts", () => {
    useStore.getState().setDraftAnswer("q1", "hello");
    useStore.getState().setDraftAnswer("q2", "world");
    expect(useStore.getState().draftAnswers).toEqual({ q1: "hello", q2: "world" });
  });

  it("loadHealth surfaces failures via console but leaves health null", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("nope")) as unknown as typeof fetch;
    await useStore.getState().loadHealth();
    expect(useStore.getState().health).toBeNull();
    errSpy.mockRestore();
  });

  it("loadModels captures errors into modelsError", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "server error",
        json: async () => ({}),
      }) as unknown as typeof fetch;
    await useStore.getState().loadModels();
    expect(useStore.getState().modelsError).toBeTruthy();
    expect(useStore.getState().modelsLoading).toBe(false);
  });
});
