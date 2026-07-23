import { useMemo } from "react";
import clsx from "clsx";
import { CompletenessDial, Spinner } from "../sandbox";
import { SpecialistAvatar } from "../business";
import {
  useCurrentSession,
  useDraftAnswers,
  useLive,
  useConnectorActions,
  useStore,
  type ClarifyQuestion,
} from "../connector";

export function RefinePage() {
  const currentSession = useCurrentSession();
  const draftAnswers = useDraftAnswers();
  const live = useLive();
  const { setDraftAnswer, submitRefinement, lockIdea } = useConnectorActions();

  if (!currentSession) {
    if (live.running || live.refining) {
      return (
        <div className="max-w-[900px] mx-auto py-16">
          <div className="card p-10 flex items-center justify-center gap-3 text-slate-600">
            <Spinner /> Starting your session…
          </div>
        </div>
      );
    }
    if (live.error) {
      return (
        <div className="max-w-[900px] mx-auto py-16 space-y-3">
          <div className="card p-6 bg-rose-50 border-rose-200 text-rose-800">
            <div className="font-medium mb-1">Couldn't start the session.</div>
            <div className="text-sm">{live.error}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => useStore.setState({ tab: "new" })}>
            ← Back to New Idea
          </button>
        </div>
      );
    }
    return (
      <div className="max-w-[900px] mx-auto text-center py-16 text-slate-500">
        No session started yet. Head to <span className="font-medium">New Idea</span> to begin.
      </div>
    );
  }

  const analyst = currentSession.specialists.analyst;
  const rounds = currentSession.refinement;
  const latest = rounds[rounds.length - 1];

  const busy = live.refining || live.concepting;
  const readyForLock = latest && latest.completeness >= 85;

  const highUnanswered = useMemo(() => {
    if (!latest) return 0;
    return latest.questions.filter(
      (q) => q.importance === "high" && !(draftAnswers[q.id] ?? "").trim(),
    ).length;
  }, [latest, draftAnswers]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {live.error && (
        <div className="card p-4 bg-rose-50 border-rose-200 text-rose-800 flex items-start gap-3">
          <div className="text-lg leading-none">⚠</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">Something went wrong.</div>
            <div className="text-sm text-rose-700 mt-0.5 whitespace-pre-wrap">
              {live.error}
            </div>
          </div>
          <button
            className="text-xs text-rose-700 hover:text-rose-900 underline"
            onClick={() =>
              useStore.setState((s) => ({ live: { ...s.live, error: null } }))
            }
          >
            dismiss
          </button>
        </div>
      )}

      <div className="card p-5 flex items-start gap-5">
        <SpecialistAvatar persona={analyst} size="xl" ring />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">
            Intake · Round {rounds.length || 1}
          </div>
          <h1 className={clsx("font-display text-2xl", analyst.accent.text)}>
            {analyst.name} is refining the idea
          </h1>
          <p className="text-sm text-slate-600 italic mt-0.5">{analyst.tagline}</p>
        </div>
        {latest && <CompletenessDial value={latest.completeness} />}
      </div>

      <details className="card p-4" open={!rounds.length}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900">
          Your original idea
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-slate-800 leading-relaxed">
          {currentSession.idea}
        </p>
      </details>

      {latest ? (
        <>
          {live.refining && (
            <div className="card p-4 flex items-center gap-3 text-slate-600 text-sm bg-amber-50 border-amber-200">
              <Spinner /> {analyst.name} is running the next round with your answers…
            </div>
          )}
          <section className="card p-5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
              {analyst.name}'s current interpretation
            </div>
            <p className="text-slate-800 leading-relaxed">{latest.interpretation}</p>
            {latest.note && (
              <p className="mt-3 text-sm text-slate-600 border-l-2 border-slate-300 pl-3 italic">
                {latest.note}
              </p>
            )}
          </section>

          {latest.questions.length > 0 ? (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-display text-xl text-slate-900">
                  Open questions ({latest.questions.length})
                </h2>
                <div className="text-xs text-slate-500">
                  Answer the important ones. Skip low-importance ones if you're unsure.
                </div>
              </div>
              <div className="space-y-3">
                {sortQuestions(latest.questions).map((q, idx) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    idx={idx + 1}
                    value={draftAnswers[q.id] ?? ""}
                    onChange={(v) => setDraftAnswer(q.id, v)}
                    disabled={busy}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="card p-5 text-slate-600 text-sm">
              {analyst.name} has no more questions. Lock the idea when you're ready to hand it
              to the specialist team.
            </div>
          )}
        </>
      ) : (
        <div className="card p-8 flex flex-col items-center justify-center gap-3 text-slate-600">
          <div className="flex items-center gap-3">
            <Spinner /> {analyst.name} is reading the idea…
          </div>
          <div className="text-xs text-slate-500 max-w-md text-center">
            First-round refinement usually takes 20–40 seconds while{" "}
            {analyst.name} interrogates the idea and surfaces the highest-value
            questions. This tab will update automatically.
          </div>
        </div>
      )}

      <div className="sticky bottom-4 z-10">
        <div className="card p-3 flex items-center gap-3 shadow-pop">
          <div className="flex-1 text-sm text-slate-600">
            {readyForLock ? (
              <span className="text-emerald-700 font-medium">
                Completeness {latest!.completeness}% — the idea is ready. You can lock it now,
                or answer more questions to raise quality further.
              </span>
            ) : latest ? (
              <span>
                Completeness <span className="font-medium">{latest.completeness}%</span>.{" "}
                {highUnanswered > 0
                  ? `${highUnanswered} high-priority question${highUnanswered === 1 ? "" : "s"} still unanswered.`
                  : "Submit your answers to run the next round."}
              </span>
            ) : (
              <span>Waiting for the first round of questions…</span>
            )}
          </div>
          <button
            className="btn btn-ghost"
            onClick={submitRefinement}
            disabled={busy || !latest || latest.questions.length === 0}
          >
            {live.refining ? "Refining…" : "Submit answers → next round"}
          </button>
          <button
            className="btn btn-primary"
            onClick={lockIdea}
            disabled={busy || !latest}
            title={
              readyForLock
                ? "Lock the idea and generate the artifact pack"
                : "You can lock the idea at any completeness — but low scores yield weaker artifacts"
            }
          >
            {live.concepting ? "Locking…" : "Lock idea & generate →"}
          </button>
        </div>
      </div>

      {rounds.length > 1 && (
        <section>
          <h2 className="font-display text-lg text-slate-900 mb-3">Prior rounds</h2>
          <div className="space-y-3">
            {rounds.slice(0, -1).map((r) => (
              <details key={r.n} className="card p-4">
                <summary className="cursor-pointer flex items-baseline justify-between gap-3">
                  <span className="font-medium text-slate-800">Round {r.n}</span>
                  <span className="text-xs text-slate-500">
                    Completeness {r.completeness}% · {r.questions.length} questions
                  </span>
                </summary>
                <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {r.interpretation}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {r.questions.map((q) => {
                    const ans = r.answers.find((a) => a.questionId === q.id);
                    return (
                      <li key={q.id} className="border-l-2 border-slate-200 pl-3">
                        <div className="text-slate-700 font-medium">{q.question}</div>
                        <div className="text-slate-600 mt-0.5">
                          {ans?.answer.trim() ? ans.answer : <span className="italic text-slate-400">Skipped</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Pure helper: sort questions by importance (high → medium → low). Exported
 * for unit testing.
 */
export function sortQuestions(qs: ClarifyQuestion[]): ClarifyQuestion[] {
  const rank: Record<ClarifyQuestion["importance"], number> = { high: 0, medium: 1, low: 2 };
  return [...qs].sort((a, b) => rank[a.importance] - rank[b.importance]);
}

function QuestionCard({
  q,
  idx,
  value,
  onChange,
  disabled,
}: {
  q: ClarifyQuestion;
  idx: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const importanceColor = {
    high: "bg-rose-100 text-rose-800 border-rose-200",
    medium: "bg-amber-100 text-amber-900 border-amber-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  }[q.importance];

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="text-slate-400 font-mono text-xs pt-1 w-6 shrink-0">
          Q{idx}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${importanceColor}`}>
              {q.importance}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
              {q.category}
            </span>
          </div>
          <div className="text-[15px] text-slate-900 font-medium">{q.question}</div>
          {q.whyItMatters && (
            <div className="text-xs text-slate-600 mt-1 italic">
              Why: {q.whyItMatters}
            </div>
          )}
          {q.hint && (
            <div className="text-xs text-slate-500 mt-1">
              Hint: {q.hint}
            </div>
          )}
          <textarea
            className="field mt-2 text-sm min-h-[70px] resize-y"
            placeholder="Your answer (skip by leaving blank)…"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
