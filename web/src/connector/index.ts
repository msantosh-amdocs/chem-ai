/**
 * Connector layer: the ONLY place that touches the network, browser storage,
 * or holds mutable global state.
 */
export type {
  UploadedDoc,
  SpecialistSnapshot,
  StageTeamSnapshot,
  GenerationSettings,
  ClarifyQuestion,
  ClarifyAnswer,
  RefinementRound,
  RefinedIdea,
  StageRoundDraft,
  StageRound,
  DocumentArtifact,
  SessionStatus,
  SessionDurations,
  ArchitectureSession,
  HistorySummary,
  HistoryAverages,
  SdkModel,
  SdkModelParameterDefinition,
  SessionEvent,
  StageCost,
  SessionCosts,
  TerminationPolicy,
} from "./types";
export * from "./personas";
export {
  loadSpecialists,
  saveSpecialists,
  resetSpecialists,
  loadGenerationSettings,
  saveGenerationSettings,
  resetGenerationSettings,
  type SpecialistsSettings,
} from "./settings";
export { api, type HealthResponse } from "./api";
export {
  useStore,
  applyEvent,
  personaToSnapshot,
  teamsToSnapshot,
  initialLive,
  type Tab,
  type LiveState,
  type StoreState,
} from "./store";
export * from "./hooks";
export {
  DEFAULT_TAB,
  canonicalUrlForTab,
  isHelpTab,
  isSessionTab,
  pathMatchesTab,
  pathToRoute,
  pathToTab,
  routeToPath,
  tabToPath,
} from "./paths";
export type { Route, SessionSub, SessionTab, StaticTab } from "./paths";
export { useTabRouting } from "./useTabRouting";
