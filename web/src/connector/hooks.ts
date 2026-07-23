import { useShallow } from "zustand/react/shallow";
import { useStore } from "./store";

/**
 * Thin selector hooks over the Zustand store. Pages/business components
 * should prefer these over calling `useStore()` directly.
 *
 * NOTE: Zustand v5 removed the implicit shallow-equality check on selector
 * results. Any selector that returns a *new* object literal must be wrapped
 * in `useShallow`, otherwise React will re-render on every store update
 * (and, for selectors that themselves live inside render bodies, will
 * enter an infinite update loop and blank the page).
 */

export const useTab = () => useStore((s) => s.tab);
export const useSetTab = () => useStore((s) => s.setTab);

export const useHealth = () => useStore((s) => s.health);
export const useModels = () =>
  useStore(
    useShallow((s) => ({
      models: s.models,
      modelsLoading: s.modelsLoading,
      modelsError: s.modelsError,
    })),
  );

export const useSpecialists = () => useStore((s) => s.specialists);
export const useGenSettings = () => useStore((s) => s.genSettings);

export const useCurrentSession = () => useStore((s) => s.currentSession);
export const useLive = () => useStore((s) => s.live);
export const useHistoryList = () => useStore((s) => s.historyList);
export const useDraftAnswers = () => useStore((s) => s.draftAnswers);

export function useConnectorActions() {
  return useStore(
    useShallow((s) => ({
      setTab: s.setTab,
      loadHealth: s.loadHealth,
      loadModels: s.loadModels,
      loadHistory: s.loadHistory,
      openSession: s.openSession,
      deleteSession: s.deleteSession,
      clearHistory: s.clearHistory,
      updateAnalyst: s.updateAnalyst,
      updateMember: s.updateMember,
      addMember: s.addMember,
      removeMember: s.removeMember,
      resetSpecialists: s.resetSpecialists,
      updateGenSettings: s.updateGenSettings,
      resetGenSettings: s.resetGenSettings,
      setDraftAnswer: s.setDraftAnswer,
      startSession: s.startSession,
      submitRefinement: s.submitRefinement,
      lockIdea: s.lockIdea,
      regenerate: s.regenerate,
    })),
  );
}
