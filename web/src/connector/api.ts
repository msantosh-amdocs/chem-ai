import type {
  ArchitectureSession,
  ClarifyAnswer,
  GenerationSettings,
  HistoryAverages,
  HistorySummary,
  RefinementRound,
  SdkModel,
  SpecialistSnapshot,
  StageTeamSnapshot,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  ok: boolean;
  cursorSdk: boolean;
  version: string;
}

export const api = {
  async health(): Promise<HealthResponse> {
    return json(await fetch("/api/health"));
  },
  async listModels(
    refresh = false,
  ): Promise<{ models: SdkModel[]; cachedAt: string; warning?: string }> {
    return json(await fetch(`/api/models${refresh ? "?refresh=1" : ""}`));
  },
  async listHistory(): Promise<{
    sessions: HistorySummary[];
    /**
     * Running averages across every terminal session on disk. Absent
     * on older servers — callers must treat as optional.
     */
    averages?: HistoryAverages;
  }> {
    return json(await fetch("/api/history"));
  },
  async getSession(id: string): Promise<{ session: ArchitectureSession }> {
    return json(await fetch(`/api/history/${encodeURIComponent(id)}`));
  },
  async deleteSession(id: string): Promise<void> {
    await json(await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
  async clearHistory(): Promise<void> {
    await json(await fetch(`/api/history`, { method: "DELETE" }));
  },

  async startSession(input: {
    idea: string;
    specialists: { analyst: SpecialistSnapshot; teams: StageTeamSnapshot[] };
    settings: GenerationSettings;
    documents: File[];
  }): Promise<{ sessionId: string; session: ArchitectureSession }> {
    const fd = new FormData();
    fd.append("idea", input.idea);
    fd.append("specialists", JSON.stringify(input.specialists));
    fd.append("settings", JSON.stringify(input.settings));
    for (const f of input.documents) fd.append("documents", f);
    return json(await fetch("/api/session/start", { method: "POST", body: fd }));
  },

  async refineRound(
    sessionId: string,
    answers: ClarifyAnswer[],
  ): Promise<{ round: RefinementRound; session: ArchitectureSession }> {
    return json(
      await fetch(`/api/session/${encodeURIComponent(sessionId)}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }),
    );
  },

  async lockIdea(
    sessionId: string,
    answers: ClarifyAnswer[],
    autoGenerate = true,
  ): Promise<{ session: ArchitectureSession }> {
    return json(
      await fetch(`/api/session/${encodeURIComponent(sessionId)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, autoGenerate }),
      }),
    );
  },

  async regenerate(sessionId: string): Promise<{ ok: true; sessionId: string }> {
    return json(
      await fetch(`/api/session/${encodeURIComponent(sessionId)}/generate`, {
        method: "POST",
      }),
    );
  },
};
