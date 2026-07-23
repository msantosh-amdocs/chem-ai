/**
 * Business layer: domain-aware React components + pure domain helpers.
 *
 * Rules:
 * - May import from `sandbox/` and type-only (or hooks) from `connector/`.
 * - Must NOT call `fetch`, `EventSource`, `WebSocket`, `setInterval` etc.
 */
export { TopNav } from "./TopNav";
export { SpecialistEditor } from "./SpecialistEditor";
export { SpecialistAvatar } from "./SpecialistAvatar";
export { PipelineNode } from "./PipelineNode";
export { DebateRounds } from "./DebateRounds";
export {
  PIPELINE_WAVES,
  derivePipelineNodeStatus,
  canonicalKindOrder,
  type PipelineNodeStatus,
} from "./pipeline";
export { buildSolutionPack, slugifySessionTitle } from "./exporter";
