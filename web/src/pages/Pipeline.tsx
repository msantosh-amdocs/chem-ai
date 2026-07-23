import clsx from "clsx";
import { Markdown, Spinner, StatusPill } from "../sandbox";
import {
  SpecialistAvatar,
  PipelineNode,
  DebateRounds,
  PIPELINE_WAVES,
  canonicalKindOrder,
  derivePipelineNodeStatus,
} from "../business";
import {
  useCurrentSession,
  useLive,
  useConnectorActions,
  type DocumentArtifact,
  type SpecialistSnapshot,
  type StageTeamSnapshot,
  type DocumentKind,
} from "../connector";

export function PipelinePage() {
  const currentSession = useCurrentSession();
  const live = useLive();
  const { setTab, regenerate } = useConnectorActions();

  if (!currentSession) {
    return (
      <div className="max-w-[900px] mx-auto text-center py-16 text-slate-500">
        No session started yet.
      </div>
    );
  }

  const teamByKind = new Map<DocumentKind, StageTeamSnapshot>(
    currentSession.specialists.teams.map((t) => [t.kind, t]),
  );
  const artByKind = new Map<DocumentKind, DocumentArtifact>(
    currentSession.artifacts.map((a) => [a.kind, a]),
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Pipeline</h1>
          <p className="text-slate-600 mt-1">
            Watch each specialist team debate the artifact until they reach{" "}
            <span className="font-semibold">{currentSession.settings.threshold}%</span>{" "}
            agreement (or {currentSession.settings.maxRounds} rounds).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentSession.status === "completed" && (
            <>
              <button className="btn btn-ghost" onClick={regenerate}>
                ↻ Regenerate
              </button>
              <button className="btn btn-primary" onClick={() => setTab("docs")}>
                Read documents →
              </button>
            </>
          )}
        </div>
      </div>

      <ConceptCard />

      <section>
        <h2 className="font-display text-xl text-slate-900 mb-3">Dependency pipeline</h2>
        <div className="card p-6 overflow-x-auto">
          <div className="flex items-stretch gap-4 min-w-fit">
            {PIPELINE_WAVES.map((wave, i) => (
              <div key={i} className="flex items-stretch gap-3">
                <div className="flex flex-col gap-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium text-center">
                    Wave {i + 1}
                  </div>
                  <div className="flex flex-col gap-3">
                    {wave.map((kind) => {
                      const team = teamByKind.get(kind);
                      const artifact = artByKind.get(kind);
                      const status = derivePipelineNodeStatus({
                        kind,
                        team,
                        artifact,
                        liveGenerating: live.generating,
                        liveDone: live.done,
                        liveErrors: live.errors,
                      });
                      return (
                        <PipelineNode
                          key={kind}
                          kind={kind}
                          team={team}
                          artifact={artifact}
                          status={status}
                          maxRounds={currentSession.settings.maxRounds}
                          activeMembers={live.activeMembers[kind]}
                          error={live.errors[kind]}
                        />
                      );
                    })}
                  </div>
                </div>
                {i < PIPELINE_WAVES.length - 1 && (
                  <div className="self-center text-slate-300 text-2xl px-1">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-slate-900 mb-3">Live debate</h2>
        <div className="space-y-4">
          {currentSession.artifacts.length === 0 && (
            <div className="card p-6 text-center text-slate-500">
              {live.concepting
                ? "Writing the refined concept…"
                : live.running
                  ? "Kicking off the first wave…"
                  : "Waiting on generation."}
            </div>
          )}
          {[...currentSession.artifacts]
            .sort((a, b) => canonicalKindOrder(a.kind) - canonicalKindOrder(b.kind))
            .map((a) => {
              const team = teamByKind.get(a.kind);
              return team ? (
                <StageDebatePanel
                  key={a.kind}
                  artifact={a}
                  team={team}
                  activeMembers={live.activeMembers[a.kind]}
                  threshold={currentSession.settings.threshold}
                  error={a.error ?? live.errors[a.kind]}
                />
              ) : null;
            })}
        </div>
      </section>
    </div>
  );
}

function ConceptCard() {
  const currentSession = useCurrentSession();
  const live = useLive();
  if (!currentSession) return null;

  if (!currentSession.refinedIdea) {
    if (live.concepting) {
      return (
        <div className="card p-5 flex items-center gap-3 text-slate-600">
          <Spinner /> {currentSession.specialists.analyst.name} is writing the Refined Concept…
        </div>
      );
    }
    return null;
  }

  return (
    <details className="card p-4">
      <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900">
        <span>Refined concept</span>
        <span className="text-xs text-slate-500">
          (by {currentSession.specialists.analyst.name} — shared input to every team)
        </span>
      </summary>
      <div className="mt-3">
        <Markdown source={currentSession.refinedIdea.content} />
      </div>
    </details>
  );
}

function StageDebatePanel({
  artifact,
  team,
  activeMembers,
  threshold,
  error,
}: {
  artifact: DocumentArtifact;
  team: StageTeamSnapshot;
  activeMembers?: string[];
  threshold: number;
  error?: string;
}) {
  const activeSet = new Set(activeMembers ?? []);
  const memberById = new Map<string, SpecialistSnapshot>(
    team.members.map((m) => [m.id, m]),
  );
  const leadId = team.members[0]?.id;
  const lead = leadId ? memberById.get(leadId) : undefined;

  return (
    <div className="card overflow-hidden">
      <div
        className={clsx(
          "px-5 py-3 border-b flex items-center gap-3",
          lead?.accent.bg,
          lead?.accent.border,
        )}
      >
        {lead && <SpecialistAvatar persona={lead} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className={clsx("font-semibold text-sm", lead?.accent.text)}>
            {artifact.title}
          </div>
          <div className="text-xs text-slate-600 truncate">
            {team.members.length}-member team ·{" "}
            {team.members.map((m) => m.name).join(" · ")}
          </div>
        </div>
        <StatusPill
          status={
            error
              ? "error"
              : artifact.streaming
                ? "running"
                : artifact.content
                  ? "done"
                  : "queued"
          }
        />
      </div>

      {error ? (
        <div className="p-5">
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {error}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {artifact.rounds.length > 0 && (
            <div className="px-5 py-4">
              <DebateRounds
                artifact={artifact}
                team={team}
                threshold={threshold}
                collapsible
                activeMembers={activeMembers}
              />
            </div>
          )}

          {artifact.content ? (
            <div className="p-5">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
                Final artifact — by {lead?.name ?? artifact.producedBy}
              </div>
              <Markdown source={artifact.content} />
            </div>
          ) : artifact.streaming ? (
            <div className="p-5 flex items-center gap-3 text-slate-500 text-sm">
              <Spinner />{" "}
              {activeSet.size > 0
                ? `${Array.from(activeSet)
                    .map((id) => memberById.get(id)?.name ?? id)
                    .join(", ")} drafting…`
                : "Debate in progress…"}
            </div>
          ) : (
            <div className="p-5 text-slate-500 text-sm italic">Queued.</div>
          )}
        </div>
      )}
    </div>
  );
}
