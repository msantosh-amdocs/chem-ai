import { useState } from "react";
import { DocumentDropzone } from "../sandbox";
import {
  useSpecialists,
  useGenSettings,
  useLive,
  useConnectorActions,
} from "../connector";

export function NewIdeaPage() {
  const specialists = useSpecialists();
  const genSettings = useGenSettings();
  const live = useLive();
  const { startSession } = useConnectorActions();

  const [idea, setIdea] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);

  const totalSpecialists =
    1 + specialists.teams.reduce((acc, t) => acc + t.members.length, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || live.running) return;
    await startSession({ idea: idea.trim(), documents });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl text-slate-900">Start with a rough factory / expansion idea</h1>
        <p className="text-slate-600 mt-1">
          {specialists.analyst.name} will read it, ask the smallest set of clarifying questions
          needed (product, industry, scale, geography, budget, regulatory posture), and — once
          you're ready — hand it to {totalSpecialists - 1} specialists organised into{" "}
          {specialists.teams.length} departments. Each department debates until they reach{" "}
          <span className="font-semibold">{genSettings.threshold}% agreement</span> (or{" "}
          {genSettings.maxRounds} rounds) before moving on.
        </p>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-800">Your idea</label>
          <textarea
            className="field mt-1.5 min-h-[140px] resize-y text-[15px]"
            placeholder={
              "e.g. Set up a 500 tonnes/year manufacturing unit in Gujarat for a specialty " +
              "agrochemical intermediate (chloropyridine, Grade 99.5% technical). Target markets " +
              "are Indian formulators and export to South-East Asia. Budget ceiling ~₹80 Cr CAPEX. " +
              "Commissioning target FY27. Greenfield."
            }
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={live.running}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Two or three sentences is plenty — mention product, industry (chemical / pharma /
            semiconductor), target scale, and geography if you have them. {specialists.analyst.name}{" "}
            will interrogate the rest in the next step.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1.5">
            Context documents <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <DocumentDropzone
            files={documents}
            onChange={setDocuments}
            disabled={live.running}
          />
          <p className="text-xs text-slate-500 mt-1.5">
            PDFs or Word docs the team should treat as source material — existing designs,
            requirements notes, competitor teardowns. Cited as [Source N] in the artifacts.
          </p>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            className="btn btn-primary text-base px-6"
            disabled={live.running || idea.trim().length < 10}
          >
            {live.running ? "Starting…" : "Start refinement →"}
          </button>
          {live.error && (
            <span className="text-sm text-rose-600">{live.error}</span>
          )}
        </div>
      </form>
    </div>
  );
}
