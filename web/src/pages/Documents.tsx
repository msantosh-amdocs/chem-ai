import { useState } from "react";
import clsx from "clsx";
import { Markdown } from "../sandbox";
import {
  SpecialistAvatar,
  DebateRounds,
  buildSolutionPack,
  buildArtifactWord,
  buildSessionPackWord,
  slugifySessionTitle,
} from "../business";
import {
  useCurrentSession,
  useConnectorActions,
  KIND_LABELS,
  KIND_SHORT,
  type DocumentKind,
  type DocumentArtifact,
  type SessionIndustry,
  type SpecialistSnapshot,
  type StageTeamSnapshot,
} from "../connector";

const ALL: DocumentKind[] = [
  "market",
  "procedure",
  "semiconductor",
  "procurement",
  "ip",
  "finance",
  "presentation",
];

/**
 * Hide the process artifact that WASN'T selected for this run so the
 * Documents tab stays uncluttered. Semiconductor runs hide Procedure;
 * chemical/pharma/other runs hide Semiconductor. Sessions with no
 * industry set yet (still refining) fall through to showing both
 * placeholders — the pipeline resolves which one runs at lock time.
 */
function isKindActive(kind: DocumentKind, industry: SessionIndustry | undefined): boolean {
  if (kind === "semiconductor") return industry === "semiconductor";
  if (kind === "procedure") return industry !== "semiconductor";
  return true;
}

type DocStatus = "pending" | "streaming" | "done" | "error";

export function DocumentsPage() {
  const currentSession = useCurrentSession();
  const { setTab } = useConnectorActions();
  const [active, setActive] = useState<"concept" | DocumentKind>("concept");

  if (!currentSession || !currentSession.refinedIdea) {
    return (
      <div className="max-w-[900px] mx-auto text-center py-16 text-slate-500">
        No documents yet. Lock the idea on the <span className="font-medium">Refine</span>{" "}
        tab to generate them.
      </div>
    );
  }

  const teamByKind = new Map<DocumentKind, StageTeamSnapshot>(
    currentSession.specialists.teams.map((t) => [t.kind, t]),
  );
  const artByKind = new Map<DocumentKind, DocumentArtifact>(
    currentSession.artifacts.map((a) => [a.kind, a]),
  );

  const activeArtifact = active === "concept" ? undefined : artByKind.get(active);
  const activeTeam = active === "concept" ? undefined : teamByKind.get(active);
  const activeLead =
    active === "concept"
      ? currentSession.specialists.analyst
      : activeTeam?.members[0];

  const activeTitle = active === "concept" ? "Refined Concept" : KIND_LABELS[active];
  const activeBody =
    active === "concept"
      ? currentSession.refinedIdea.content
      : activeArtifact?.content ?? "";
  const activeError = active === "concept" ? undefined : activeArtifact?.error;

  const copyToClipboard = () => {
    void navigator.clipboard.writeText(activeBody).catch(() => {});
  };

  const downloadOne = () => {
    const filename = `${slugifySessionTitle(currentSession.title)}-${
      active === "concept" ? "refined-concept" : active
    }.md`;
    triggerDownload(filename, activeBody);
  };

  const downloadOneWord = () => {
    const { filename, blob } = buildArtifactWord(
      currentSession,
      active,
      activeTitle,
      activeBody,
    );
    triggerBlobDownload(filename, blob);
  };

  const downloadAll = () => {
    const bundle = buildSolutionPack(currentSession);
    triggerDownload(
      `${slugifySessionTitle(currentSession.title)}-market-research-pack.md`,
      bundle,
    );
  };

  const downloadAllWord = () => {
    const { filename, blob } = buildSessionPackWord(currentSession);
    triggerBlobDownload(filename, blob);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-slate-900 max-w-2xl">
            {currentSession.title}
          </h1>
          <p className="text-slate-600 mt-1">
            {ALL.filter(
              (k) =>
                isKindActive(k, currentSession.industry) && artByKind.get(k)?.content,
            ).length}{" "}
            of{" "}
            {ALL.filter(
              (k) => isKindActive(k, currentSession.industry) && teamByKind.has(k),
            ).length}{" "}
            artifacts produced ·{" "}
            <button
              onClick={() => setTab("session-pipeline")}
              className="text-slate-700 underline underline-offset-2 hover:text-slate-900"
            >
              back to pipeline
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button className="btn btn-ghost" onClick={copyToClipboard}>
            Copy this
          </button>
          <button
            className="btn btn-ghost"
            onClick={downloadOne}
            disabled={!activeBody}
            title="Download the current document as Markdown"
          >
            Download .md
          </button>
          <button
            className="btn btn-ghost"
            onClick={downloadOneWord}
            disabled={!activeBody}
            title="Download the current document as a Word document (opens in Word / LibreOffice / Google Docs)"
          >
            Download .doc
          </button>
          <button
            className="btn btn-ghost"
            onClick={downloadAllWord}
            title="Download the full research pack as a single Word document"
          >
            Word pack
          </button>
          <button
            className="btn btn-primary"
            onClick={downloadAll}
            title="Download the full research pack as a single Markdown file"
          >
            Download pack
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap border-b border-slate-200">
        <DocTab
          active={active === "concept"}
          onClick={() => setActive("concept")}
          label="Refined Concept"
          shortLabel="Concept"
          status="done"
          spec={currentSession.specialists.analyst}
        />
        {ALL.filter((k) => teamByKind.has(k) && isKindActive(k, currentSession.industry)).map((k) => {
          const team = teamByKind.get(k)!;
          const lead = team.members[0]!;
          const art = artByKind.get(k);
          const status: DocStatus = art?.error
            ? "error"
            : art?.streaming
              ? "streaming"
              : art?.content
                ? "done"
                : "pending";
          return (
            <DocTab
              key={k}
              active={active === k}
              onClick={() => setActive(k)}
              label={KIND_LABELS[k]}
              shortLabel={KIND_SHORT[k]}
              status={status}
              spec={lead}
            />
          );
        })}
      </div>

      <div className="card overflow-hidden">
        {activeLead && (
          <div
            className={clsx(
              "px-5 py-3 border-b flex items-center gap-3",
              activeLead.accent.bg,
              activeLead.accent.border,
            )}
          >
            <SpecialistAvatar persona={activeLead} size="sm" />
            <div className="flex-1 min-w-0">
              <div className={clsx("font-semibold text-sm", activeLead.accent.text)}>
                {activeTitle}
              </div>
              <div className="text-xs text-slate-600 truncate">
                {activeTeam
                  ? `${activeLead.name} (lead) · ${activeTeam.members.length}-member team`
                  : `${activeLead.name} · ${activeLead.model}`}
              </div>
            </div>
            {activeArtifact && activeArtifact.terminatedBy && (
              <span
                className={clsx(
                  "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium",
                  activeArtifact.terminatedBy === "agreement"
                    ? "bg-emerald-100 text-emerald-800"
                    : activeArtifact.terminatedBy === "maxRounds"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800",
                )}
              >
                {activeArtifact.terminatedBy === "agreement"
                  ? "converged"
                  : activeArtifact.terminatedBy === "maxRounds"
                    ? "max rounds"
                    : "errored"}
              </span>
            )}
          </div>
        )}
        <div className="p-6">
          {activeError ? (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              This artifact failed: {activeError}
            </div>
          ) : !activeBody ? (
            <div className="text-slate-500 text-sm italic">Not produced yet.</div>
          ) : (
            <Markdown source={activeBody} />
          )}
        </div>

        {activeArtifact && activeArtifact.rounds.length > 0 && activeTeam && (
          <details className="border-t border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-6 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center gap-2">
              <span>Debate rounds</span>
              <span className="text-xs text-slate-500 font-normal">
                ({activeArtifact.rounds.length} round
                {activeArtifact.rounds.length === 1 ? "" : "s"} ·{" "}
                {activeArtifact.terminatedBy === "agreement"
                  ? `converged at ${currentSession.settings.threshold}%`
                  : activeArtifact.terminatedBy === "maxRounds"
                    ? `stopped at ${activeArtifact.rounds.length} rounds`
                    : "errored"}
                )
              </span>
            </summary>
            <div className="p-5 border-t border-slate-200 bg-white">
              <DebateRounds
                artifact={activeArtifact}
                team={activeTeam}
                threshold={currentSession.settings.threshold}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function DocTab({
  active,
  onClick,
  label,
  shortLabel,
  status,
  spec,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  shortLabel: string;
  status: DocStatus;
  spec?: SpecialistSnapshot;
}) {
  const dot =
    status === "error"
      ? "bg-rose-500"
      : status === "streaming"
        ? "bg-amber-500 animate-pulse"
        : status === "done"
          ? "bg-emerald-500"
          : "bg-slate-300";
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-4 py-2.5 text-sm border-b-2 -mb-px flex items-center gap-2 transition-colors whitespace-nowrap",
        active
          ? clsx("border-slate-900 text-slate-900 font-medium", spec?.accent.bg)
          : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50",
      )}
      title={label}
    >
      <span className={clsx("w-2 h-2 rounded-full", dot)} />
      <span className="hidden md:inline">{label}</span>
      <span className="inline md:hidden">{shortLabel}</span>
    </button>
  );
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  triggerBlobDownload(filename, blob);
}

/**
 * Shared blob → download helper. Used for both text (Markdown) and
 * binary-ish (Word HTML) downloads. Kept separate so the Word
 * exporter can hand us a pre-built Blob with the correct MIME type
 * instead of stringifying and re-wrapping.
 */
function triggerBlobDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
