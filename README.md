# Chem AI

A local, private, single-user tool for **market researchers scoping new
factories or business expansions** in the **chemical, pharmaceutical, and
semiconductor** industries. You give it a rough idea; six specialist
departments — Market Analysis, Procedure, Procurement, Intellectual
Property, Finance, and Presentation — debate their way to a full
research pack.

## The flow

1. **You submit a rough factory / expansion idea.** One or two paragraphs;
   upload any relevant context PDFs or Word docs (existing feasibility
   notes, patent search reports, vendor quotes).
2. **Aarav (the Analyst)** reads it and asks the smallest set of clarifying
   questions needed — product, industry, target scale, geography, budget
   ceiling, timeline, regulatory posture, existing capabilities. You answer
   inline. Loop until the idea is sharp enough — Aarav tracks a completeness
   score. **If the idea is vague, Aarav will keep asking until it's not.**
3. **You lock the idea.** Aarav writes a structured *Refined Concept*.
4. **Six specialist departments debate their artifacts one at a time,
   with you as the gatekeeper between every department.** Each department
   writes independent initial drafts, then in each subsequent round
   critiques teammates' drafts and revises its own, self-scoring
   agreement 0-100. Debate stops as soon as every member's score hits the
   threshold (default 95%) or the max round cap (default 4). The
   department lead's final draft becomes the artifact of record, at
   which point the pipeline halts and shows you an **Approve / Revise**
   panel:

   - **Approve** → the next department starts immediately.
   - **Revise (with feedback)** → the same department re-runs from
     round 1 with your feedback baked into every prompt. You can revise
     as many times as needed; each cycle is logged.

   Departments can also halt themselves mid-debate: if a member hits
   a genuine ambiguity in round 1, the department raises a
   **Clarification** panel with the specific questions it needs
   answered. Blank answers are allowed — the department will document
   them as assumptions. Once you submit, the debate resumes from
   round 2 with your answers as ground truth.

   - **Market Analysis (3)** — Ananya (lead) + Karthik + Meera →
     *B2B Market Analysis*: TAM/SAM/SOM, buyer segments, top 5 geos,
     competitors, pricing reference, Go / Conditional / Not-Recommended verdict.
   - **Procedure (5)** — Dr. Prakash (lead) + Sneha + Ravi + Aditi +
     Dr. Nikhil → *Procedure & Route of Synthesis*: chosen route, reaction
     scheme (Mermaid), step-by-step conditions (T / P / moles / yield),
     material balance, lab-scale + industrial-scale configuration, organic-
     chemistry mechanism / stereochemistry / impurity review, hazards & EHS
     register, waste/effluent plan.
   - **Procurement (3)** — Vikram (lead) + Rohit + Priya → *Procurement Plan*:
     Equipment BOM + Raw Material BOM (India + international vendors,
     landed cost analysis, single-source flags).
   - **Intellectual Property (2)** — Arjun (lead) + Kavya → *IP Analysis*:
     Product / process / intermediate patent landscape (India + US + EU +
     WIPO), FTO verdict, design-around suggestions, own filing strategy.
   - **Finance (3)** — Neha (lead) + Suresh + Divya → *Financial Projection*:
     CAPEX + 5-yr P&L + cash flow, per-unit manufacturing cost, sales
     projection, IRR, sensitivity analysis (INR ₹ primary + USD reference).
   - **Presentation (2)** — Ishaan (lead) + Tara → *Presentation Package*:
     Board-ready executive summary + full detailed report + appendix with
     consolidated Open Questions.

5. **Read the pack.** Each artifact is a proper Markdown document with the
   right sections, requirement IDs (MKT-, PROC-STEP-, PROC-HW-, PROC-RM-,
   IP-, FIN-), and traceability. Drill down into the debate rounds for
   critique and per-member drafts.

## Pipeline (sequential, per-department Approve gate)

Only one department runs at a time. After every department finishes its
debate you are prompted to Approve or Revise before the next department
starts — the pipeline never proceeds without an explicit "yes" from you.

```
Refined Concept (Aarav — asks clarifying Qs if vague, loops until ready)
    │
    ▼
  1. Market Analysis                    ← Approve to continue
    │
    ▼
  2. Procedure OR Semiconductor Mfg     ← Approve to continue
     (one runs per session, chosen by session.industry)
    │
    ▼
  3. Procurement  (uses Procedure + Market)      ← Approve to continue
    │
    ▼
  4. Intellectual Property  (uses Procedure + Market)   ← Approve to continue
    │
    ▼
  5. Finance    (uses Procurement + Market)      ← Approve to continue
    │
    ▼
  6. Presentation   (aggregates everything)      ← Approve to complete
```

Each department may also raise mid-debate **Clarification** questions
after round 1; the pipeline pauses there too until you answer.

### Stop / Retry (recovery controls)

- **Stop pipeline** (header button, visible while a run is in flight):
  cancels the current run. The in-flight LLM call finishes in the
  background (the Cursor SDK can't interrupt a call mid-flight), but
  the session flips to `cancelled` immediately and the department
  that was running is recorded as `Cancelled by user`.
- **Retry stage** (button on any errored / cancelled tile): re-runs
  just that department. Prior revision history and clarification
  Q&A are preserved so context is not lost. Once the retried stage
  finishes, the pipeline continues from there.
- **Start over** (only visible after a cancel): wipes every artifact
  and re-runs from department 1.

Together these cover the "network glitch mid-run" recovery path: if
a stage fails (or you Stop and want to resume), click Retry on the
red tile and the pipeline picks up where it left off.

Every specialist is fully configurable — name, model, tone, role
description, model parameters, avatar, accent — and persisted to your
browser's localStorage. Add or remove department members freely, as long
as the per-department min/max are respected (**min 2, max 4 per
department; Procedure is capped at 5 to accommodate a dedicated organic-
chemistry expert**).

## Defaults

- **India-first**: INR ₹ (with USD reference), Indian regulatory regime
  (BIS, PESO, CPCB, DCGI-CDSCO), IP jurisdictions include India + US +
  EU + WIPO. Any of these can be overridden by the Analyst per session.
- **Generic Procedure department**: the same 5 specialists adapt to
  chemical / pharma / semiconductor from the Refined Concept — they
  don't need a per-industry configuration.
- **B2B only**: Market Analysis is strictly B2B (formulators, OEMs,
  foundries, distributors) — no consumer / retail analysis.

## Requirements

- Node.js 22 or newer
- A Cursor API key (see `.env.example`)

## Run it

```bash
./start.sh
```

- Web UI: <http://localhost:5277>
- API: <http://localhost:5278/api/health>

Stop with `Ctrl+C` or `./stop.sh`.

> **Coexisting with `architecture-group/`**: this app runs on ports
> **5277 (web) / 5278 (api)**, while `architecture-group/` uses **5275 /
> 5276** — you can run both at once.

## UI tabs

- **New Idea** — start a session.
- **Refine** — interactive Q&A loop with Aarav.
- **Pipeline** — live view of the currently-running department, the
  Approve/Revise panel when a department is waiting on you, and the
  Clarification panel when a department raised mid-debate questions.
  The full DAG is always visible so you can see what's approved, what's
  running, and what's queued.
- **Documents** — final artifacts, one tab per document, plus a
  collapsible drill-down into every debate round.
- **My Team** — configure departments (2-4 members each; Procedure 2-5) and the
  debate settings (agreement threshold + max rounds).
- **History** — every past session with its full artifact pack and how
  each department terminated (converged vs. max rounds).

## Data

- History and session state → `server/.data/`
- Specialist config + debate settings → browser `localStorage`
  (keys `mr.specialists.v1`, `mr.settings.v1`)
- Logs → `.logs/`

Nothing leaves your machine except LLM calls, which go directly to the
Cursor SDK.

## Requirement-ID conventions

Downstream departments trace claims back to these IDs. If a claim has no
source, it's flagged as an assumption or open question rather than
invented.

| Department | ID prefixes |
| --- | --- |
| Market Analysis | `MKT-FIND-###`, `MKT-ASSUMP-###`, `MKT-OQ-###` |
| Procedure | `PROC-STEP-###`, `HAZ-###` |
| Procurement | `PROC-HW-###`, `PROC-RM-###` |
| IP | `IP-PROD-###`, `IP-PROC-###`, `IP-INT-###`, `IP-USE-###`, `FTO-###` |
| Finance | `FIN-RM-###` |
