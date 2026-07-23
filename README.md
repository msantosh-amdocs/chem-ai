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
4. **Six specialist departments debate their artifacts** through a
   dependency pipeline. Each department writes independent initial drafts,
   then in each subsequent round critiques teammates' drafts and revises
   its own, self-scoring agreement 0-100. Debate stops as soon as every
   member's score hits the threshold (default 95%) or the max round cap
   (default 4). The department lead's final draft becomes the artifact of
   record.

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

## Pipeline DAG (4 waves)

```
Refined Concept (Aarav — asks clarifying Qs if vague, loops until ready)
    │
    ├── Wave 1  (parallel)
    │     ├── Market Analysis
    │     └── Procedure  (synthesis route, mass balance, hazards, lab + industrial)
    │
    ├── Wave 2  (parallel — both need Procedure)
    │     ├── Procurement   (hardware + raw materials + costs; also uses Market for scale)
    │     └── Intellectual Property   (patents on process, intermediates, product)
    │
    ├── Wave 3  Finance   (needs Procurement + Market Analysis)
    │
    └── Wave 4  Presentation   (aggregates everything into summary + full report)
```

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
- **Pipeline** — live view of each department debating its artifact,
  with per-round agreement bars and the DAG.
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
