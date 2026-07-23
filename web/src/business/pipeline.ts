import type {
  DocumentArtifact,
  StageTeamSnapshot,
} from "../connector/types";
import type { DocumentKind } from "../connector/personas";

/**
 * The canonical DAG for the market-research pipeline:
 *
 *   Refined Concept
 *      ├── Market       }  Wave 1 (parallel)
 *      └── Procedure    }
 *           ↓
 *           ├── Procurement  }  Wave 2 (parallel — both need Procedure)
 *           └── IP           }
 *                 ↓
 *                Finance     Wave 3 (needs Procurement + Market)
 *                  ↓
 *                Presentation Wave 4 (aggregates everything)
 */
export const PIPELINE_WAVES: DocumentKind[][] = [
  ["market", "procedure"],
  ["procurement", "ip"],
  ["finance"],
  ["presentation"],
];

export type PipelineNodeStatus =
  | "disabled"
  | "queued"
  | "running"
  | "done"
  | "error";

interface DerivedNodeInput {
  kind: DocumentKind;
  team: StageTeamSnapshot | undefined;
  artifact: DocumentArtifact | undefined;
  liveGenerating: Set<DocumentKind>;
  liveDone: Set<DocumentKind>;
  liveErrors: Partial<Record<DocumentKind, string>>;
}

/**
 * Pure domain function: derive the status of a single pipeline node from
 * team configuration, artifact state, and live SSE flags. Extracted for
 * unit testing.
 */
export function derivePipelineNodeStatus(input: DerivedNodeInput): PipelineNodeStatus {
  const { kind, team, artifact, liveGenerating, liveDone, liveErrors } = input;
  if (!team) return "disabled";
  if (liveErrors[kind]) return "error";
  if (liveGenerating.has(kind)) return "running";
  if (liveDone.has(kind) || (artifact?.content ?? "").length > 0) return "done";
  return "queued";
}

/**
 * Sort artifact kinds into their canonical pipeline order.
 */
export function canonicalKindOrder(kind: DocumentKind): number {
  return ["market", "procedure", "procurement", "ip", "finance", "presentation"].indexOf(
    kind,
  );
}
