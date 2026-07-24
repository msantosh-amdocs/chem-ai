import type {
  DocumentArtifact,
  SessionIndustry,
  StageTeamSnapshot,
} from "../connector/types";
import type { DocumentKind } from "../connector/personas";

/**
 * The canonical DAG for the market-research pipeline:
 *
 *   Refined Concept
 *      ├── Market                                }  Wave 1 (parallel)
 *      └── Procedure OR Semiconductor Mfg        }
 *           ↓                                        (one runs per session,
 *                                                     chosen by session.industry)
 *           ├── Procurement  }  Wave 2 (parallel — both need the Wave 1 process artifact)
 *           └── IP           }
 *                 ↓
 *                Finance     Wave 3 (needs Procurement + Market)
 *                  ↓
 *                Presentation Wave 4 (aggregates everything)
 *
 * The visualisation includes BOTH `procedure` and `semiconductor` in
 * Wave 1 so the user sees a stable topology; the tile for the one that
 * isn't running on this session is rendered as "disabled".
 */
export const PIPELINE_WAVES: DocumentKind[][] = [
  ["market", "procedure", "semiconductor"],
  ["procurement", "ip"],
  ["finance"],
  ["presentation"],
];

/**
 * Which of `procedure` / `semiconductor` will run for a given industry.
 * Mirrors `processKindFor()` on the server. Sessions with no industry
 * yet (still refining) resolve to `procedure` — the safe default.
 */
export function processKindForIndustry(
  industry: SessionIndustry | null | undefined,
): DocumentKind {
  return industry === "semiconductor" ? "semiconductor" : "procedure";
}

/**
 * True when a kind is the ACTIVE process artifact for a run. Used by
 * the pipeline UI to grey out the inactive one (procedure vs
 * semiconductor). Non-process kinds are always considered active.
 */
export function isProcessKindActive(
  kind: DocumentKind,
  industry: SessionIndustry | null | undefined,
): boolean {
  if (kind !== "procedure" && kind !== "semiconductor") return true;
  return kind === processKindForIndustry(industry);
}

export type PipelineNodeStatus =
  | "disabled"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "skipped";

interface DerivedNodeInput {
  kind: DocumentKind;
  team: StageTeamSnapshot | undefined;
  artifact: DocumentArtifact | undefined;
  liveGenerating: Set<DocumentKind>;
  liveDone: Set<DocumentKind>;
  liveErrors: Partial<Record<DocumentKind, string>>;
  /**
   * Session-level industry classification. When set, the inactive
   * process kind (`procedure` on semiconductor runs, `semiconductor`
   * on chemical / pharma runs) resolves to `"skipped"` — rendered as
   * an "n/a" tile so the pipeline topology stays stable across runs.
   */
  industry?: SessionIndustry | null;
}

/**
 * Pure domain function: derive the status of a single pipeline node from
 * team configuration, artifact state, and live SSE flags. Extracted for
 * unit testing.
 */
export function derivePipelineNodeStatus(input: DerivedNodeInput): PipelineNodeStatus {
  const { kind, team, artifact, liveGenerating, liveDone, liveErrors, industry } = input;
  if (!team) return "disabled";
  // If this is the inactive process kind for the run, treat it as
  // skipped (not disabled — the team IS configured, we just don't
  // execute it because §2 Industry says otherwise). Only classify as
  // skipped if we actually have an industry decision AND no artifact
  // is present — a session where we somehow ran both keeps its real
  // status.
  if (
    industry &&
    !isProcessKindActive(kind, industry) &&
    !liveDone.has(kind) &&
    !(artifact?.content && !artifact.error)
  ) {
    return "skipped";
  }
  if (liveErrors[kind]) return "error";
  if (liveGenerating.has(kind)) return "running";
  if (liveDone.has(kind) || (artifact?.content ?? "").length > 0) return "done";
  return "queued";
}

/**
 * Sort artifact kinds into their canonical pipeline order.
 */
export function canonicalKindOrder(kind: DocumentKind): number {
  return [
    "market",
    "procedure",
    "semiconductor",
    "procurement",
    "ip",
    "finance",
    "presentation",
  ].indexOf(kind);
}
