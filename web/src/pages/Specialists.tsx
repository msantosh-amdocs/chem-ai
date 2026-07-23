import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { SpecialistEditor, SpecialistAvatar } from "../business";
import {
  useSpecialists,
  useModels,
  useGenSettings,
  useConnectorActions,
  useStore,
  KIND_LABELS,
  KIND_MIN_MEMBERS,
  KIND_SHORT,
  PRODUCER_KINDS,
  type DocumentKind,
  type SpecialistPersona,
  type SpecialistRole,
  type AgentAccent,
} from "../connector";

/**
 * The Specialists page renders a compact tile grid for every team, with a
 * modal drawer that opens when you click a tile so you can edit the full
 * persona (model, params, role, tone, etc.) without pushing the rest of the
 * page around.
 */

type Selection =
  | { kind: "analyst" }
  | { kind: "team"; team: DocumentKind; memberId: string };

export function SpecialistsPage() {
  const specialists = useSpecialists();
  const { models, modelsLoading, modelsError } = useModels();
  const genSettings = useGenSettings();
  const {
    loadModels,
    updateAnalyst,
    updateMember,
    addMember,
    removeMember,
    resetSpecialists,
    updateGenSettings,
    resetGenSettings,
  } = useConnectorActions();

  const [selection, setSelection] = useState<Selection | null>(null);

  const selected = useMemo<
    | {
        persona: SpecialistPersona;
        onChange: (patch: Partial<SpecialistPersona>) => void;
        onRemove?: () => void;
        removable: boolean;
        roleLabel: string;
      }
    | null
  >(() => {
    if (!selection) return null;
    if (selection.kind === "analyst") {
      return {
        persona: specialists.analyst,
        onChange: updateAnalyst,
        removable: false,
        roleLabel: "Analyst — asks clarifying questions, writes the Refined Concept",
      };
    }
    const team = specialists.teams.find((t) => t.kind === selection.team);
    if (!team) return null;
    const idx = team.members.findIndex((m) => m.id === selection.memberId);
    if (idx < 0) return null;
    const m = team.members[idx]!;
    const canRemove = team.members.length > KIND_MIN_MEMBERS[team.kind];
    return {
      persona: m,
      onChange: (patch) => updateMember(team.kind, m.id, patch),
      onRemove: canRemove
        ? () => {
            removeMember(team.kind, m.id);
            setSelection(null);
          }
        : undefined,
      removable: canRemove,
      roleLabel:
        idx === 0
          ? `Lead · ${labelForRole(m.role)} — ${KIND_LABELS[team.kind]}`
          : `${labelForRole(m.role)} — ${KIND_LABELS[team.kind]}`,
    };
  }, [selection, specialists, updateAnalyst, updateMember, removeMember]);

  const openAnalyst = () => setSelection({ kind: "analyst" });
  const openMember = (team: DocumentKind, memberId: string) =>
    setSelection({ kind: "team", team, memberId });

  const addAndOpen = (kind: DocumentKind) => {
    const before = new Set(
      (specialists.teams.find((t) => t.kind === kind)?.members ?? []).map((m) => m.id),
    );
    addMember(kind);
    queueMicrotask(() => {
      const team = useStore.getState().specialists.teams.find((t) => t.kind === kind);
      const fresh = team?.members.find((m) => !before.has(m.id));
      if (fresh) setSelection({ kind: "team", team: kind, memberId: fresh.id });
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Specialists</h1>
          <p className="text-slate-600 mt-1">
            Configure your intake analyst and each specialist department. Every artifact is
            produced by a department of {KIND_MIN_MEMBERS.market}–4 specialists who debate
            until they reach agreement. Click any tile to edit that specialist.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost text-sm"
            onClick={() => loadModels(true)}
            disabled={modelsLoading}
            title="Reload the list of available models from the Cursor SDK"
          >
            {modelsLoading ? "Loading models…" : "↻ Reload models"}
          </button>
          <button
            className="btn btn-ghost text-sm text-rose-600"
            onClick={() => {
              if (
                confirm(
                  "Reset all specialists to defaults? Your customizations will be lost.",
                )
              )
                resetSpecialists();
            }}
          >
            Reset specialists
          </button>
        </div>
      </div>

      {modelsError && (
        <div className="border border-amber-200 bg-amber-50 text-amber-900 text-sm px-3 py-2 rounded-lg">
          {modelsError}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-xl text-slate-900">Debate settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Applied to every stage. Debate stops as soon as every member's self-scored
              agreement hits the threshold, or the max rounds cap is reached.
            </p>
          </div>
          <button
            className="text-xs text-slate-500 hover:text-slate-800 underline"
            onClick={resetGenSettings}
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
              Agreement threshold ({genSettings.threshold}%)
            </label>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={genSettings.threshold}
              onChange={(e) => updateGenSettings({ threshold: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              How aligned members must be before the team moves on. Default 95%.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
              Max rounds ({genSettings.maxRounds})
            </label>
            <input
              type="range"
              min={2}
              max={6}
              step={1}
              value={genSettings.maxRounds}
              onChange={(e) => updateGenSettings({ maxRounds: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Debate hard-stops after this many rounds even if agreement is below the
              threshold. Default 4.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl text-slate-900">Intake</h2>
          <span className="text-sm text-slate-500">1 analyst · runs before the teams</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <SpecialistTile
            persona={specialists.analyst}
            tag="Analyst"
            onOpen={openAnalyst}
          />
        </div>
      </section>

      {PRODUCER_KINDS.map((kind) => {
        const team = specialists.teams.find((t) => t.kind === kind);
        if (!team) return null;
        const min = KIND_MIN_MEMBERS[kind];
        return (
          <section key={kind}>
            <TeamHeader
              kind={kind}
              min={min}
              count={team.members.length}
              onAdd={() => addAndOpen(kind)}
              canAdd={team.members.length < 6}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {team.members.map((m, idx) => (
                <SpecialistTile
                  key={m.id}
                  persona={m}
                  tag={idx === 0 ? `${KIND_SHORT[kind]} · Lead` : KIND_SHORT[kind]}
                  lead={idx === 0}
                  onOpen={() => openMember(kind, m.id)}
                />
              ))}
              <AddTile onClick={() => addAndOpen(kind)} disabled={team.members.length >= 6} />
            </div>
          </section>
        );
      })}

      {selected && (
        <SpecialistModal onClose={() => setSelection(null)}>
          <SpecialistEditor
            persona={selected.persona}
            models={models}
            onChange={selected.onChange}
            onRemove={selected.onRemove}
            removable={selected.removable}
            roleLabel={selected.roleLabel}
          />
        </SpecialistModal>
      )}
    </div>
  );
}

function SpecialistTile({
  persona,
  tag,
  lead,
  onOpen,
}: {
  persona: SpecialistPersona;
  tag: string;
  lead?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={clsx(
        "card p-4 text-left flex items-start gap-3 transition-all hover:shadow-pop hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 border-l-4 relative",
        persona.accent.border.replace("border-", "border-l-"),
      )}
      title={`Click to edit ${persona.name}`}
    >
      {lead && (
        <span className="absolute -top-2 left-3 text-[9px] uppercase tracking-wider font-semibold text-indigo-700 bg-white px-1.5 rounded">
          Lead
        </span>
      )}
      <SpecialistAvatar persona={persona} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={clsx("font-display font-semibold text-lg truncate", persona.accent.text)}>
            {persona.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
            {tag}
          </span>
        </div>
        <div className="text-xs text-slate-600 italic line-clamp-2 min-h-[2.2em]">
          {persona.tagline || "(no tagline)"}
        </div>
        <div className="text-[10px] font-mono text-slate-500 truncate mt-1">
          {persona.model}
        </div>
        <div className="text-[10px] text-slate-400 mt-1">Click to configure →</div>
      </div>
    </button>
  );
}

function AddTile({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "rounded-xl border-2 border-dashed p-4 text-slate-500 hover:text-slate-800 flex flex-col items-center justify-center gap-1 transition-all",
        disabled
          ? "border-slate-200 opacity-40 cursor-not-allowed"
          : "border-slate-300 hover:border-slate-500 hover:bg-slate-50",
      )}
      title={disabled ? "Maximum team size reached (6)" : "Add another specialist to this team"}
    >
      <span className="text-2xl leading-none">+</span>
      <span className="text-xs font-medium">Add specialist</span>
    </button>
  );
}

function TeamHeader({
  kind,
  min,
  count,
  onAdd,
  canAdd,
}: {
  kind: DocumentKind;
  min: number;
  count: number;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const short = KIND_SHORT[kind];
  const full = KIND_LABELS[kind];
  const belowMin = count < min;
  return (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl text-slate-900">{short} team</h2>
        <span className="text-sm text-slate-500">{full}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className={belowMin ? "text-rose-600 font-medium" : "text-slate-500"}>
          {count} member{count === 1 ? "" : "s"} · minimum {min}
        </span>
        <button
          className="btn btn-ghost text-xs"
          onClick={onAdd}
          disabled={!canAdd}
          title={canAdd ? "Add another team member" : "Maximum team size reached"}
        >
          + Add specialist
        </button>
      </div>
    </div>
  );
}

function SpecialistModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-[900px] my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-400 flex items-center justify-center text-lg font-medium"
          title="Close (Esc)"
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function labelForRole(role: SpecialistRole): string {
  return {
    analyst: "Analyst",
    market_analyst: "Market Analyst",
    process_engineer: "Process Engineer",
    procurement_specialist: "Procurement Specialist",
    finance_analyst: "Finance Analyst",
    ip_analyst: "IP Analyst",
    presenter: "Presenter",
  }[role];
}

export function TeamAvatarStack({
  members,
  active,
}: {
  members: Array<{
    id: string;
    name: string;
    avatarId: string;
    accent: AgentAccent;
  }>;
  active?: Set<string>;
}) {
  return (
    <div className="flex -space-x-2">
      {members.map((m) => {
        const pulse = active?.has(m.id);
        return (
          <div
            key={m.id}
            className={clsx(
              "relative rounded-full ring-2 ring-white",
              pulse && "animate-pulse",
            )}
            title={m.name}
          >
            <SpecialistAvatar persona={m} size="sm" />
          </div>
        );
      })}
    </div>
  );
}
