import { create } from "zustand";
import { api, type HealthResponse } from "./api";
import type {
  ArchitectureSession,
  ClarifyAnswer,
  DocumentArtifact,
  HistoryAverages,
  HistorySummary,
  SessionEvent,
  SdkModel,
  SpecialistSnapshot,
  StageTeamSnapshot,
} from "./types";
import {
  loadGenerationSettings,
  loadSpecialists,
  resetSpecialists as resetSpecialistsStorage,
  resetGenerationSettings as resetGenerationSettingsStorage,
  saveGenerationSettings,
  saveSpecialists,
  type GenerationSettings as StoredGenerationSettings,
  type SpecialistsSettings,
} from "./settings";
import {
  KIND_MAX_MEMBERS,
  KIND_MIN_MEMBERS,
  newMemberForKind,
  type DocumentKind,
  type SpecialistPersona,
} from "./personas";

export type Tab =
  | "new"
  | "refine"
  | "pipeline"
  | "docs"
  | "specialists"
  | "settings"
  | "history"
  | "help";

export interface LiveState {
  running: boolean;
  sessionId: string | null;
  /** True while the Analyst is running a refinement round. */
  refining: boolean;
  /** True while the Refined Concept is being generated. */
  concepting: boolean;
  /** Which artifact kinds are currently generating (any round). */
  generating: Set<DocumentKind>;
  /** Which artifact kinds finished successfully in this session. */
  done: Set<DocumentKind>;
  /** Per-kind: current round number (from last-completed round.n). */
  currentRound: Partial<Record<DocumentKind, number>>;
  /** Per-kind: member ids currently drafting (for the round in flight). */
  activeMembers: Partial<Record<DocumentKind, string[]>>;
  /** Per-kind: latest self-agreement scores (memberId -> %). */
  latestAgreement: Partial<Record<DocumentKind, Record<string, number>>>;
  /** Errors per artifact kind. */
  errors: Partial<Record<DocumentKind, string>>;
  /** Session-level error. */
  error: string | null;
}

export interface StoreState {
  tab: Tab;
  setTab: (t: Tab) => void;

  health: HealthResponse | null;
  models: SdkModel[];
  modelsLoading: boolean;
  modelsError: string | null;

  specialists: SpecialistsSettings;
  genSettings: StoredGenerationSettings;

  currentSession: ArchitectureSession | null;
  /** Local scratch for answers the user is typing before submitting a round. */
  draftAnswers: Record<string, string>;

  live: LiveState;
  historyList: HistorySummary[];
  /**
   * Rolling averages returned alongside `/history` — used by the
   * History and Pipeline pages to render "typical duration" hints.
   * Null until the first successful `loadHistory` call.
   */
  historyAverages: HistoryAverages | null;
  eventSource: EventSource | null;

  loadHealth: () => Promise<void>;
  loadModels: (refresh?: boolean) => Promise<void>;
  loadHistory: () => Promise<void>;
  openSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;

  updateAnalyst: (patch: Partial<SpecialistPersona>) => void;
  updateMember: (kind: DocumentKind, memberId: string, patch: Partial<SpecialistPersona>) => void;
  addMember: (kind: DocumentKind) => void;
  removeMember: (kind: DocumentKind, memberId: string) => void;
  resetSpecialists: () => void;
  updateGenSettings: (patch: Partial<StoredGenerationSettings>) => void;
  resetGenSettings: () => void;

  setDraftAnswer: (questionId: string, answer: string) => void;

  startSession: (input: { idea: string; documents: File[] }) => Promise<void>;
  submitRefinement: () => Promise<void>;
  lockIdea: () => Promise<void>;
  regenerate: () => Promise<void>;
}

export const initialLive: LiveState = {
  running: false,
  sessionId: null,
  refining: false,
  concepting: false,
  generating: new Set(),
  done: new Set(),
  currentRound: {},
  activeMembers: {},
  latestAgreement: {},
  errors: {},
  error: null,
};

export function personaToSnapshot(p: SpecialistPersona): SpecialistSnapshot {
  return {
    id: p.id,
    role: p.role,
    produces: p.produces,
    name: p.name,
    tagline: p.tagline,
    roleDescription: p.roleDescription,
    tone: p.tone,
    model: p.model,
    params: p.params,
    avatarId: p.avatarId,
    accent: p.accent,
  };
}

export function teamsToSnapshot(teams: SpecialistsSettings["teams"]): StageTeamSnapshot[] {
  return teams.map((t) => ({
    kind: t.kind,
    minMembers: t.minMembers,
    members: t.members.map(personaToSnapshot),
  }));
}

function cloneLive(l: LiveState): LiveState {
  return {
    ...l,
    generating: new Set(l.generating),
    done: new Set(l.done),
    currentRound: { ...l.currentRound },
    activeMembers: { ...l.activeMembers },
    latestAgreement: { ...l.latestAgreement },
    errors: { ...l.errors },
  };
}

/**
 * Pure reducer for SSE session events. Exposed for testing.
 */
export function applyEvent(
  state: { session: ArchitectureSession | null; live: LiveState },
  event: SessionEvent,
): { session: ArchitectureSession | null; live: LiveState; nextTab?: Tab; closeStream?: boolean } {
  const live = cloneLive(state.live);
  let session = state.session;
  let nextTab: Tab | undefined;
  let closeStream = false;

  switch (event.type) {
    case "session":
      session = event.session;
      break;

    case "refinement.started":
      live.refining = true;
      break;
    case "refinement.completed":
      live.refining = false;
      if (session) {
        // Idempotent — the POST response may have already added this round.
        const already = session.refinement.some((r) => r.n === event.round.n);
        session = already
          ? session
          : { ...session, refinement: [...session.refinement, event.round] };
      }
      break;

    case "concept.started":
      live.concepting = true;
      nextTab = "pipeline";
      break;
    case "concept.completed":
      live.concepting = false;
      if (session && !session.refinedIdea) {
        session = {
          ...session,
          status: session.status === "refining" ? "locked" : session.status,
          refinedIdea: { content: event.refinedIdea, createdAt: new Date().toISOString() },
        };
      }
      break;

    case "artifact.started": {
      live.generating.add(event.kind);
      live.currentRound[event.kind] = 0;
      live.activeMembers[event.kind] = [];
      live.latestAgreement[event.kind] = {};
      delete live.errors[event.kind];
      if (session) {
        const placeholder: DocumentArtifact = {
          kind: event.kind,
          title: event.title,
          content: "",
          producedBy: event.leadId,
          createdAt: new Date().toISOString(),
          streaming: true,
          rounds: [],
          finalAgreements: {},
        };
        const idx = session.artifacts.findIndex((a) => a.kind === event.kind);
        const next = [...session.artifacts];
        if (idx >= 0) next[idx] = placeholder;
        else next.push(placeholder);
        session = { ...session, artifacts: next, status: "generating" };
      }
      break;
    }

    case "artifact.round.started": {
      live.generating.add(event.kind);
      live.activeMembers[event.kind] = [...event.memberIds];
      // We show current-round as "round in flight" — the number the round will be.
      live.currentRound[event.kind] = event.n;
      break;
    }

    case "artifact.round.completed": {
      live.activeMembers[event.kind] = [];
      live.currentRound[event.kind] = event.round.n;
      const scores: Record<string, number> = {};
      for (const d of event.round.drafts) scores[d.memberId] = d.agreementWithOthers;
      live.latestAgreement[event.kind] = scores;
      if (session) {
        const idx = session.artifacts.findIndex((a) => a.kind === event.kind);
        if (idx >= 0) {
          const existing = session.artifacts[idx]!;
          const rounds = [...existing.rounds];
          const rIdx = rounds.findIndex((r) => r.n === event.round.n);
          if (rIdx >= 0) rounds[rIdx] = event.round;
          else rounds.push(event.round);
          rounds.sort((a, b) => a.n - b.n);
          // Preview: use lead draft when possible, else first member's.
          const leadDraft =
            event.round.drafts.find((d) => d.memberId === existing.producedBy) ??
            event.round.drafts[0];
          const next = [...session.artifacts];
          next[idx] = {
            ...existing,
            rounds,
            content: leadDraft?.content ?? existing.content,
          };
          session = { ...session, artifacts: next };
        }
      }
      break;
    }

    case "artifact.completed": {
      live.generating.delete(event.artifact.kind);
      live.done.add(event.artifact.kind);
      live.activeMembers[event.artifact.kind] = [];
      const scores: Record<string, number> = {};
      for (const d of event.artifact.rounds[event.artifact.rounds.length - 1]?.drafts ?? []) {
        scores[d.memberId] = d.agreementWithOthers;
      }
      live.latestAgreement[event.artifact.kind] = scores;
      if (session) {
        const idx = session.artifacts.findIndex((a) => a.kind === event.artifact.kind);
        const next = [...session.artifacts];
        const final = { ...event.artifact, streaming: false };
        if (idx >= 0) next[idx] = final;
        else next.push(final);
        session = { ...session, artifacts: next };
      }
      break;
    }

    case "artifact.error":
      live.generating.delete(event.kind);
      live.activeMembers[event.kind] = [];
      live.errors[event.kind] = event.message;
      break;

    case "session.completed":
      session = event.session;
      live.running = false;
      live.concepting = false;
      live.refining = false;
      nextTab = "docs";
      break;
    case "session.error":
      live.running = false;
      live.error = event.message;
      break;
    case "stream.end":
      closeStream = true;
      break;
  }

  return { session, live, nextTab, closeStream };
}

export const useStore = create<StoreState>((set, get) => ({
  tab: "new",
  setTab: (t) => set({ tab: t }),

  health: null,
  models: [],
  modelsLoading: false,
  modelsError: null,

  specialists: loadSpecialists(),
  genSettings: loadGenerationSettings(),

  currentSession: null,
  draftAnswers: {},

  live: initialLive,
  historyList: [],
  historyAverages: null,
  eventSource: null,

  async loadHealth() {
    try {
      set({ health: await api.health() });
    } catch (err) {
      console.error("health check failed", err);
    }
  },

  async loadModels(refresh = false) {
    set({ modelsLoading: true, modelsError: null });
    try {
      const { models, warning } = await api.listModels(refresh);
      set({ models, modelsLoading: false, modelsError: warning ?? null });
    } catch (err) {
      set({
        modelsLoading: false,
        modelsError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async loadHistory() {
    const { sessions, averages } = await api.listHistory();
    set({ historyList: sessions, historyAverages: averages ?? null });
  },

  async openSession(id) {
    const { session } = await api.getSession(id);
    get().eventSource?.close();
    const live: LiveState = { ...initialLive, sessionId: id };
    for (const a of session.artifacts) {
      if (a.content && !a.error) live.done.add(a.kind);
      if (a.error) live.errors[a.kind] = a.error;
      live.currentRound[a.kind] = a.rounds.length;
      live.latestAgreement[a.kind] = { ...a.finalAgreements };
    }
    let nextTab: Tab = "refine";
    if (session.status === "completed") nextTab = "docs";
    else if (session.status === "generating" || session.status === "locked") nextTab = "pipeline";
    set({ currentSession: session, draftAnswers: {}, live, tab: nextTab, eventSource: null });
  },

  async deleteSession(id) {
    await api.deleteSession(id);
    const current = get().currentSession;
    if (current?.id === id) set({ currentSession: null });
    await get().loadHistory();
  },

  async clearHistory() {
    await api.clearHistory();
    set({ historyList: [], historyAverages: null, currentSession: null });
  },

  updateAnalyst(patch) {
    const s = get().specialists;
    const next: SpecialistsSettings = { ...s, analyst: { ...s.analyst, ...patch } };
    saveSpecialists(next);
    set({ specialists: next });
  },

  updateMember(kind, memberId, patch) {
    const s = get().specialists;
    const next: SpecialistsSettings = {
      ...s,
      teams: s.teams.map((t) =>
        t.kind !== kind
          ? t
          : {
              ...t,
              members: t.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
            },
      ),
    };
    saveSpecialists(next);
    set({ specialists: next });
  },

  addMember(kind) {
    const s = get().specialists;
    const target = s.teams.find((t) => t.kind === kind);
    if (!target) return;
    if (target.members.length >= KIND_MAX_MEMBERS[kind]) return;
    const idHint = `${kind}-${target.members.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const fresh = newMemberForKind(kind, idHint);
    const next: SpecialistsSettings = {
      ...s,
      teams: s.teams.map((t) =>
        t.kind === kind ? { ...t, members: [...t.members, fresh] } : t,
      ),
    };
    saveSpecialists(next);
    set({ specialists: next });
  },

  removeMember(kind, memberId) {
    const s = get().specialists;
    const target = s.teams.find((t) => t.kind === kind);
    if (!target) return;
    if (target.members.length <= KIND_MIN_MEMBERS[kind]) return;
    const next: SpecialistsSettings = {
      ...s,
      teams: s.teams.map((t) =>
        t.kind === kind ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t,
      ),
    };
    saveSpecialists(next);
    set({ specialists: next });
  },

  resetSpecialists() {
    const fresh = resetSpecialistsStorage();
    set({ specialists: fresh });
  },

  updateGenSettings(patch) {
    const merged = { ...get().genSettings, ...patch };
    saveGenerationSettings(merged);
    set({ genSettings: merged });
  },

  resetGenSettings() {
    const fresh = resetGenerationSettingsStorage();
    set({ genSettings: fresh });
  },

  setDraftAnswer(questionId, answer) {
    set((state) => ({
      draftAnswers: { ...state.draftAnswers, [questionId]: answer },
    }));
  },

  async startSession(input) {
    const { specialists, genSettings } = get();
    const snapshot = {
      analyst: personaToSnapshot(specialists.analyst),
      teams: teamsToSnapshot(specialists.teams),
    };
    // Client-side pre-check for min members so we get a clean error.
    for (const t of specialists.teams) {
      if (t.members.length < KIND_MIN_MEMBERS[t.kind]) {
        set({
          live: {
            ...initialLive,
            error: `${t.kind.toUpperCase()} team has ${t.members.length} member(s) — minimum is ${KIND_MIN_MEMBERS[t.kind]}. Add a specialist in the My Team tab.`,
          },
        });
        return;
      }
    }
    set({
      currentSession: null,
      draftAnswers: {},
      live: { ...initialLive, running: true, refining: true },
      tab: "refine",
    });
    try {
      const { sessionId, session } = await api.startSession({
        idea: input.idea,
        specialists: snapshot,
        settings: genSettings,
        documents: input.documents,
      });
      set({
        currentSession: session,
        live: { ...initialLive, sessionId, running: true, refining: true },
      });
      openStream(sessionId, set, get);
      const { round } = await api.refineRound(sessionId, []);
      set((s) => {
        if (!s.currentSession) return s;
        const already = s.currentSession.refinement.some((r) => r.n === round.n);
        return {
          currentSession: already
            ? s.currentSession
            : { ...s.currentSession, refinement: [...s.currentSession.refinement, round] },
          live: { ...s.live, refining: false, running: true },
        };
      });
    } catch (err) {
      console.error("startSession failed:", err);
      set((s) => ({
        live: {
          ...s.live,
          running: false,
          refining: false,
          concepting: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  },

  async submitRefinement() {
    const { currentSession, draftAnswers } = get();
    if (!currentSession) return;
    const last = currentSession.refinement[currentSession.refinement.length - 1];
    const answers: ClarifyAnswer[] = (last?.questions ?? []).map((q) => ({
      questionId: q.id,
      answer: (draftAnswers[q.id] ?? "").trim(),
    }));
    set({
      live: { ...get().live, refining: true, error: null },
      draftAnswers: {},
    });
    try {
      const { round } = await api.refineRound(currentSession.id, answers);
      set((s) => {
        if (!s.currentSession) return s;
        const priorLast = s.currentSession.refinement[s.currentSession.refinement.length - 1];
        const patchedRefinement = priorLast
          ? [
              ...s.currentSession.refinement.slice(0, -1),
              { ...priorLast, answers },
            ]
          : [];
        const already = patchedRefinement.some((r) => r.n === round.n);
        return {
          currentSession: {
            ...s.currentSession,
            refinement: already ? patchedRefinement : [...patchedRefinement, round],
          },
          live: { ...s.live, refining: false },
        };
      });
    } catch (err) {
      console.error("submitRefinement failed:", err);
      set({
        live: {
          ...get().live,
          refining: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  async lockIdea() {
    const { currentSession, draftAnswers } = get();
    if (!currentSession) return;
    const last = currentSession.refinement[currentSession.refinement.length - 1];
    const answers: ClarifyAnswer[] = (last?.questions ?? []).map((q) => ({
      questionId: q.id,
      answer: (draftAnswers[q.id] ?? "").trim(),
    }));
    set({
      live: { ...get().live, concepting: true, running: true, error: null },
      tab: "pipeline",
    });
    try {
      const { session } = await api.lockIdea(currentSession.id, answers, true);
      set((s) => ({
        currentSession: session,
        live: { ...s.live, concepting: false },
      }));
    } catch (err) {
      console.error("lockIdea failed:", err);
      set({
        live: {
          ...get().live,
          concepting: false,
          running: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  async regenerate() {
    const { currentSession } = get();
    if (!currentSession) return;
    set({
      live: { ...initialLive, sessionId: currentSession.id, running: true },
      tab: "pipeline",
    });
    openStream(currentSession.id, set, get);
    try {
      await api.regenerate(currentSession.id);
    } catch (err) {
      set({
        live: {
          ...get().live,
          running: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },
}));

/**
 * Attach an EventSource for the session's SSE stream and route events into
 * the store's state machine. Also start a poll fallback so we recover if
 * the SSE stream is disrupted (proxy buffering, network blip, tab
 * throttling).
 */
function openStream(
  sessionId: string,
  set: (
    partial:
      | Partial<StoreState>
      | ((s: StoreState) => Partial<StoreState>),
  ) => void,
  get: () => StoreState,
) {
  get().eventSource?.close();
  const es = new EventSource(`/api/session/${encodeURIComponent(sessionId)}/stream`);
  set({ eventSource: es });

  const finish = () => {
    es.close();
    set({ eventSource: null });
    void get().loadHistory();
  };

  es.onmessage = (msg) => {
    let event: SessionEvent;
    try {
      event = JSON.parse(msg.data) as SessionEvent;
    } catch {
      return;
    }
    const state = get();
    const result = applyEvent({ session: state.currentSession, live: state.live }, event);
    const patch: Partial<StoreState> = {
      currentSession: result.session,
      live: result.live,
    };
    if (result.nextTab) patch.tab = result.nextTab;
    set(patch);

    if (result.closeStream) {
      es.close();
      set({ eventSource: null });
    }
    if (event.type === "session.completed" || event.type === "session.error") {
      finish();
    }
  };
  es.onerror = () => {
    /* EventSource will auto-reconnect; poll fallback keeps us honest. */
  };

  // ── Poll fallback ────────────────────────────────────────────────────────
  const poll = window.setInterval(async () => {
    const state = get();
    if (state.live.sessionId !== sessionId) {
      window.clearInterval(poll);
      return;
    }
    try {
      const { session } = await api.getSession(sessionId);
      set((s) => reconcile(s, session));
      if (
        session.status === "completed" ||
        session.status === "error" ||
        session.status === "cancelled"
      ) {
        window.clearInterval(poll);
        finish();
      }
    } catch {
      /* ignore transient failures */
    }
  }, 4000);
}

/** Merge a fresh server session into the client state without clobbering
 *  optimistic UI updates or the transient `live` flags. */
function reconcile(
  s: StoreState,
  fresh: ArchitectureSession,
): Partial<StoreState> {
  if (!s.currentSession || s.currentSession.id !== fresh.id) {
    return { currentSession: fresh };
  }
  const mergedRefinement =
    fresh.refinement.length > s.currentSession.refinement.length
      ? fresh.refinement
      : s.currentSession.refinement;
  const mergedArtifacts =
    fresh.artifacts.length >= s.currentSession.artifacts.length
      ? fresh.artifacts
      : s.currentSession.artifacts;
  const live = cloneLive(s.live);
  for (const a of mergedArtifacts) {
    if (a.content && !a.error) live.done.add(a.kind);
    if (a.error) live.errors[a.kind] = a.error;
    if (a.rounds.length) {
      live.currentRound[a.kind] = a.rounds.length;
      const last = a.rounds[a.rounds.length - 1]!;
      const scores: Record<string, number> = {};
      for (const d of last.drafts) scores[d.memberId] = d.agreementWithOthers;
      live.latestAgreement[a.kind] = scores;
    }
  }
  return {
    currentSession: {
      ...s.currentSession,
      ...fresh,
      refinement: mergedRefinement,
      artifacts: mergedArtifacts,
    },
    live,
  };
}
