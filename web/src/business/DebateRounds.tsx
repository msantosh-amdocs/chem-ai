import clsx from "clsx";
import { SpecialistAvatar } from "./SpecialistAvatar";
import { Markdown } from "../sandbox";
import type {
  DocumentArtifact,
  SpecialistSnapshot,
  StageRoundDraft,
  StageTeamSnapshot,
} from "../connector/types";

interface Props {
  artifact: DocumentArtifact;
  team: StageTeamSnapshot;
  threshold: number;
  /**
   * When true, wrap the round-by-round trail in a <details> so callers can
   * hide it behind a summary. When false, always render the rounds.
   */
  collapsible?: boolean;
  /**
   * Optional list of member ids currently drafting — surfaces an inline
   * "round in flight" indicator inside the panel.
   */
  activeMembers?: string[];
  memberLabelById?: (id: string) => string;
}

/**
 * Business component: renders the debate trail (round-by-round drafts,
 * critiques, and agreement bars) for a single artifact team. Extracted so
 * both Pipeline and Documents pages can share it.
 */
export function DebateRounds({
  artifact,
  team,
  threshold,
  collapsible = false,
  activeMembers,
  memberLabelById,
}: Props) {
  const memberById = new Map<string, SpecialistSnapshot>(
    team.members.map((m) => [m.id, m]),
  );
  const leadId = team.members[0]?.id;
  const activeSet = new Set(activeMembers ?? []);
  const nameFor = memberLabelById ?? ((id: string) => memberById.get(id)?.name ?? id);

  const body = (
    <div className="space-y-4">
      {artifact.rounds.map((r) => {
        const converged =
          r.n > 1 && r.drafts.every((d) => d.agreementWithOthers >= threshold);
        return (
          <div key={r.n} className="space-y-2">
            <div className="flex items-baseline gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Round {r.n}</span>
              <span>
                {r.n === 1
                  ? "initial independent drafts"
                  : "critique + revise + self-score"}
              </span>
              {converged && (
                <span className="text-emerald-700 font-medium">
                  ✓ converged (all ≥ {threshold}%)
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {r.drafts.map((d) => (
                <MemberDraftCard
                  key={d.memberId}
                  draft={d}
                  member={memberById.get(d.memberId)}
                  threshold={threshold}
                  isLead={d.memberId === leadId}
                />
              ))}
            </div>
          </div>
        );
      })}
      {activeSet.size > 0 && (
        <div className="text-xs text-slate-500 flex items-center gap-2 py-1">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
          <span>
            Round in flight: {Array.from(activeSet).map(nameFor).join(", ")}
          </span>
        </div>
      )}
    </div>
  );

  if (!collapsible) return body;
  return (
    <details open={!artifact.content}>
      <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center gap-2">
        <span>Debate trail</span>
        <span className="text-xs text-slate-500">
          ({artifact.rounds.length} round{artifact.rounds.length === 1 ? "" : "s"})
        </span>
      </summary>
      <div className="mt-3">{body}</div>
    </details>
  );
}

function MemberDraftCard({
  draft,
  member,
  threshold,
  isLead,
}: {
  draft: StageRoundDraft;
  member: SpecialistSnapshot | undefined;
  threshold: number;
  isLead: boolean;
}) {
  const agreement = draft.agreementWithOthers;
  const hasScore = agreement > 0 || (draft.critique?.length ?? 0) > 0;
  const barColor =
    agreement >= threshold
      ? "bg-emerald-500"
      : agreement >= 80
        ? "bg-lime-500"
        : agreement >= 60
          ? "bg-amber-500"
          : "bg-rose-500";

  return (
    <div
      className={clsx(
        "border rounded-lg p-3 bg-white",
        isLead ? "border-indigo-300 shadow-sm" : "border-slate-200",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {member && <SpecialistAvatar persona={member} size="sm" />}
        <div className="min-w-0 flex-1">
          <div className={clsx("text-xs font-semibold truncate", member?.accent.text)}>
            {member?.name ?? draft.memberId}
            {isLead && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-indigo-700 font-medium">
                lead
              </span>
            )}
          </div>
          {member && (
            <div className="text-[10px] font-mono text-slate-500 truncate">
              {member.model}
            </div>
          )}
        </div>
        {hasScore && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              agreement
            </div>
            <div className="text-sm font-mono text-slate-800">{agreement}%</div>
          </div>
        )}
      </div>

      {hasScore && (
        <div className="h-1.5 rounded bg-slate-100 overflow-hidden mb-2">
          <div
            className={clsx("h-full rounded transition-all", barColor)}
            style={{ width: `${agreement}%` }}
          />
        </div>
      )}

      {draft.critique && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1">
            Critique
          </div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto bg-slate-50 rounded p-2">
            {draft.critique}
          </div>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-800">
          Draft ({draft.content.length.toLocaleString()} chars)
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded border border-slate-200 p-3">
          <Markdown source={draft.content} />
        </div>
      </details>
    </div>
  );
}
