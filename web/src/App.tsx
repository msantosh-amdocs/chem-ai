import { useEffect } from "react";
import { TopNav, SessionShell } from "./business";
import {
  useTab,
  useConnectorActions,
  useCurrentSession,
  useLive,
  useHealth,
  useTabRouting,
} from "./connector";
import { DashboardPage } from "./pages/Dashboard";
import { NewIdeaPage } from "./pages/NewIdea";
import { RefinePage } from "./pages/Refine";
import { PipelinePage } from "./pages/Pipeline";
import { DocumentsPage } from "./pages/Documents";
import { SpecialistsPage } from "./pages/Specialists";
import { SettingsPage } from "./pages/Settings";
import { HowItWorksPage } from "./pages/HowItWorks";

/**
 * Top-level layout. Routing is a two-level flat tab space:
 *   - Static tabs: `dashboard`, `new-idea`, `help-*`.
 *   - Session tabs: `session-refine | session-pipeline | session-documents`
 *     — always rendered inside `SessionShell` which owns the sub-nav.
 * The URL <-> store sync is handled by `useTabRouting`.
 */
export default function App() {
  const tab = useTab();
  const session = useCurrentSession();
  const live = useLive();
  const health = useHealth();
  const { setTab, loadHealth, loadHistory, loadModels } = useConnectorActions();

  useTabRouting();

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
        running={live.running}
        refining={live.refining}
        sdkConnected={health?.cursorSdk === true}
      />
      <main className="flex-1 px-6 py-6">
        {tab === "dashboard" && <DashboardPage />}
        {tab === "new-idea" && <NewIdeaPage />}
        {tab === "help-team" && <SpecialistsPage />}
        {tab === "help-settings" && <SettingsPage />}
        {tab === "help-how-it-works" && <HowItWorksPage />}
        {tab === "session-refine" && (
          <SessionShell>
            <RefinePage />
          </SessionShell>
        )}
        {tab === "session-pipeline" && (
          <SessionShell>
            <PipelinePage />
          </SessionShell>
        )}
        {tab === "session-documents" && (
          <SessionShell>
            <DocumentsPage />
          </SessionShell>
        )}
      </main>
      <footer className="text-center text-xs text-slate-500 py-4">
        Chem AI · local, private, Cursor SDK-powered
      </footer>
    </div>
  );
}
