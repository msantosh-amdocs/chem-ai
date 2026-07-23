import { useEffect } from "react";
import { TopNav } from "./business";
import {
  useTab,
  useConnectorActions,
  useCurrentSession,
  useLive,
  useHealth,
} from "./connector";
import { NewIdeaPage } from "./pages/NewIdea";
import { RefinePage } from "./pages/Refine";
import { PipelinePage } from "./pages/Pipeline";
import { DocumentsPage } from "./pages/Documents";
import { SpecialistsPage } from "./pages/Specialists";
import { HistoryPage } from "./pages/History";

export default function App() {
  const tab = useTab();
  const session = useCurrentSession();
  const live = useLive();
  const health = useHealth();
  const { setTab, loadHealth, loadHistory, loadModels } = useConnectorActions();

  useEffect(() => {
    void loadHealth();
    void loadHistory();
    void loadModels();
  }, [loadHealth, loadHistory, loadModels]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav
        tab={tab}
        onSelectTab={setTab}
        hasSession={!!session}
        hasRefinedIdea={!!session?.refinedIdea}
        running={live.running}
        refining={live.refining}
        sdkConnected={health?.cursorSdk === true}
      />
      <main className="flex-1 px-6 py-6">
        {tab === "new" && <NewIdeaPage />}
        {tab === "refine" && <RefinePage />}
        {tab === "pipeline" && <PipelinePage />}
        {tab === "docs" && <DocumentsPage />}
        {tab === "specialists" && <SpecialistsPage />}
        {tab === "history" && <HistoryPage />}
      </main>
      <footer className="text-center text-xs text-slate-500 py-4">
        Chem AI · local, private, Cursor SDK-powered
      </footer>
    </div>
  );
}
