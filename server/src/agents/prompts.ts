import type {
  ClarifyAnswer,
  DocumentArtifact,
  DocumentKind,
  RefinementRound,
  Specialist,
} from "../types.js";

/* ────────────────────────────────────────────────────────────────────────── *
 * Shared building blocks
 * ────────────────────────────────────────────────────────────────────────── */

export function personaBlock(agent: Specialist): string {
  return `You are ${agent.name}${agent.tagline ? ` — ${agent.tagline}` : ""}.

ROLE
${agent.roleDescription}

VOICE & TONE
${agent.tone}`;
}

export function documentBlock(
  docs: { filename: string; text: string }[],
): string {
  if (!docs.length) return "No user-provided source documents.";
  const parts = docs.map((d, i) => {
    const truncated =
      d.text.length > 12_000 ? d.text.slice(0, 12_000) + "\n…[truncated]…" : d.text;
    return `### Source ${i + 1}: ${d.filename}\n${truncated}`;
  });
  return `USER-PROVIDED SOURCE DOCUMENTS (treat as primary evidence when relevant):\n\n${parts.join("\n\n")}`;
}

/** Compact prior refinement transcript so the Analyst can build on it. */
export function refinementHistoryBlock(rounds: RefinementRound[]): string {
  if (!rounds.length) return "No prior refinement rounds — this is round 1.";
  return rounds
    .map((r) => {
      const qa = r.questions
        .map((q) => {
          const a = r.answers.find((x) => x.questionId === q.id);
          return `  Q[${q.importance}][${q.category}] ${q.question}\n  A: ${a?.answer?.trim() || "(no answer)"}`;
        })
        .join("\n");
      return `--- ROUND ${r.n} (completeness: ${r.completeness}%) ---
Interpretation:
${r.interpretation}

Q&A:
${qa}${r.note ? `\n\nAnalyst note: ${r.note}` : ""}`;
    })
    .join("\n\n");
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Analyst — idea refinement (market-research flavor)
 * ────────────────────────────────────────────────────────────────────────── */

export function refinePrompt(
  analyst: Specialist,
  idea: string,
  priorRounds: RefinementRound[],
  latestAnswers: ClarifyAnswer[],
  docs: { filename: string; text: string }[],
): { system: string; user: string } {
  const roundN = priorRounds.length + 1;

  const system = `${personaBlock(analyst)}

TASK
You run a targeted refinement loop on a raw market-research idea from a
Market Researcher who is scoping a new factory or business expansion in
one of these industries: **chemical, pharmaceutical, or semiconductor**.
Each round you:
  1. Read the raw idea, prior rounds, and the user's latest answers.
  2. Produce a NEUTRAL interpretation of the idea in one paragraph
     (business language, no jargon, no invented details).
  3. Estimate a COMPLETENESS SCORE 0-100 for the idea:
       ≥ 85 → ready for downstream departments (Market / Procedure /
              Procurement / IP / Finance / Presentation).
       60-84 → viable but has meaningful gaps.
       < 60 → still too vague — critical basics are missing.
     Base the score on how well the following are pinned down:
       - **Product** (specific chemical / compound / drug / semiconductor
         device — molecular structure, grade, product family, or wafer
         node / process node)
       - **Industry** (chemical vs pharma vs semiconductor; sub-vertical
         such as agrochemical / API / bulk drug / MEMS / analog / power)
       - **Scale** (lab scale in g/kg, pilot scale, industrial scale in
         tonnes/year, wafers/month, or units/year — with a target volume)
       - **Geography** (target manufacturing location, target markets;
         India-first is the default but confirm)
       - **Budget ceiling / CAPEX** (order of magnitude — lakhs / crores /
         USD millions — and whether greenfield vs brownfield)
       - **Timeline** (target commissioning / launch date)
       - **Regulatory posture** (GMP / cGMP / ISO / REACH / FDA / DCGI /
         Fab facility class / environmental clearances — which apply)
       - **Constraints** (existing capabilities, IP owned, offtake
         agreements, partners) and **major risks** (raw material scarcity,
         patent walls, environmental)
  4. Ask ONLY the highest-value clarifying questions still needed to get
     to ≥ 85 completeness. Prefer 3-6 questions per round; never more
     than 8.
     - Categorize each: product, industry, scale, geography, budget,
       timeline, regulatory, constraints, risks, other.
     - Mark importance: high (blocks progress), medium (materially
       improves artifacts), low (nice-to-have).
     - Do NOT re-ask a question that was already answered clearly. If an
       earlier answer was vague, ask a sharper follow-up instead.
     - Do NOT invent facts. If the user hasn't said something, ask —
       don't assume.
     - When guessing a category or number, prefer the India-first default
       (INR, DCGI/CDSCO for pharma, Indian environmental clearance regime,
       Indian raw-material suppliers) but confirm with the user.
  5. Add a short "note" (≤ 3 sentences) on what changed since the last
     round and what's still weak. This is round ${roundN}.

OUTPUT
Return STRICT JSON only, with this exact shape and no extra keys:
{
  "interpretation": "string — one paragraph, neutral business language",
  "completeness": <integer 0-100>,
  "note": "string, <= 3 sentences, may be empty in round 1",
  "questions": [
    {
      "id": "q1",
      "category": "product" | "industry" | "scale" | "geography" | "budget" | "timeline" | "regulatory" | "constraints" | "risks" | "other",
      "importance": "high" | "medium" | "low",
      "question": "string",
      "whyItMatters": "string — one sentence",
      "hint": "string — optional, may be omitted"
    }
  ]
}`;

  const latestAnswersBlock = latestAnswers.length
    ? `USER'S LATEST ANSWERS (submitted since last round):\n${latestAnswers
        .map((a) => `  ${a.questionId}: ${a.answer.trim() || "(skipped)"}`)
        .join("\n")}`
    : "No new answers submitted.";

  const user = `RAW IDEA (as originally submitted by the market researcher):
${idea}

${documentBlock(docs)}

PRIOR REFINEMENT ROUNDS:
${refinementHistoryBlock(priorRounds)}

${latestAnswersBlock}

Produce round ${roundN}. Return JSON now.`;

  return { system, user };
}

export function refinedConceptPrompt(
  analyst: Specialist,
  idea: string,
  rounds: RefinementRound[],
  docs: { filename: string; text: string }[],
): { system: string; user: string } {
  const system = `${personaBlock(analyst)}

TASK
The market researcher has locked the idea. Produce the REFINED CONCEPT —
a single Markdown document that captures everything the downstream
departments (Market Analysis, Procedure, Procurement, Intellectual
Property, Finance, Presentation) will need. It must be self-contained;
they will NOT see the raw Q&A transcript.

USE EXACTLY THIS STRUCTURE:

# <concise idea title>

## 1. Executive Summary
   3-4 sentences: what will be manufactured, at what scale, where, for whom.

## 2. Product Definition
   - Product name(s) / compound / device
   - Industry: chemical | pharmaceutical | semiconductor
   - Sub-vertical (e.g. agrochemical, API, bulk drug, MEMS, analog IC, power semiconductor)
   - Grade / purity / node / spec target

## 3. Target Buyers & B2B Segments
   Who buys this (formulators, OEMs, foundries, distributors) —
   never consumer / retail.

## 4. Scale & Capacity
   - Lab / pilot scale (grams, kg)
   - Industrial scale (target tonnes/year, wafers/month, units/year)
   - Greenfield vs brownfield

## 5. Geography
   - Manufacturing location(s)
   - Target markets (India-first + international)

## 6. Timeline & Budget Ceiling
   - Target commissioning / launch date
   - CAPEX order of magnitude (INR ₹, with USD reference)
   - Whether external funding is required

## 7. Regulatory Posture
   Which regimes apply (GMP / cGMP / ISO / REACH / FDA / DCGI-CDSCO /
   environmental clearance / fab facility class / others).

## 8. Existing Assets & Capabilities
   IP owned, sites available, staff, partnerships, offtake agreements.

## 9. Known Constraints
## 10. Major Risks
## 11. Success Metrics
## 12. Assumptions
## 13. Open Questions (deferred)

RULES
- Ground every claim in either the raw idea, a user answer, or an explicit
  assumption you flag in §12.
- Do NOT invent product specs, buyers, capacity targets, geographies, or
  offtake agreements the user did not confirm.
- Where the user was vague and you must proceed, use "TBD — see §13" and
  add the item to Open Questions.
- Default to India-first (INR ₹ with USD reference, Indian regulatory
  regime) unless the user specified otherwise.
- Use plain business language. No implementation details.
- Return Markdown only. No preamble.`;

  const user = `RAW IDEA:
${idea}

${documentBlock(docs)}

REFINEMENT TRANSCRIPT:
${refinementHistoryBlock(rounds)}

Produce the Refined Concept now.`;

  return { system, user };
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Per-artifact structure blocks
 * ────────────────────────────────────────────────────────────────────────── */

export const TITLES: Record<DocumentKind, string> = {
  market: "Market Analysis",
  procedure: "Procedure & Route of Synthesis",
  procurement: "Procurement Plan",
  ip: "Intellectual Property Analysis",
  finance: "Financial Projection",
  presentation: "Presentation Package",
};

function structureFor(kind: DocumentKind): string {
  switch (kind) {
    case "market":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Market Analysis — <product / expansion title>

## 1. Executive Summary
   3-4 sentences: opportunity size, geography, top buyer segments, verdict on demand.

## 2. Product & Positioning
   What is being sold; where it sits in the value chain (B2B ONLY — no B2C).

## 3. Market Sizing (B2B)
   ### 3.1 TAM (Total Addressable Market) — global, with source basis
   ### 3.2 SAM (Serviceable Addressable Market) — reachable geography + segments
   ### 3.3 SOM (Serviceable Obtainable Market) — realistic 3-5 yr capture
   Include units (₹ Cr / USD Mn), the base year, and the assumption behind each number.

## 4. Demand Drivers & Growth Rate
   Named drivers (regulation, tech shift, substitution, capex cycles) and a CAGR range with confidence.

## 5. Buyer Segments (B2B)
   For each segment: buyer archetype, purchase volume, price sensitivity, decision-making unit, contract length.

## 6. Geographic Insights
   Top 5 geographies ranked, with:
     - Demand size / share
     - Import-export flow (net importer / exporter)
     - Regulatory / tariff notes
     - Local competition intensity
   India-first analysis with international context.

## 7. Competitive Landscape
   Top 5-10 producers globally + top 3-5 in India. For each: rough capacity, geographic footprint, moat.

## 8. Substitutes & Threats
## 9. Pricing Reference Range
   Recent transaction / listed pricing per unit (kg / wafer / device) — with source basis and date.

## 10. Regulatory & Trade Environment
   Duties, standards, environmental clearances that gate market entry.

## 11. Market Entry Recommendation
   Go / Conditional Go / Not Recommended, with 3-4 sentence rationale.

## 12. Assumptions & Confidence
## 13. Open Questions

REQUIREMENT ID RULES:
  - Market findings:     MKT-FIND-001, MKT-FIND-002, …
  - Assumptions:         MKT-ASSUMP-001, …
  - Open questions:      MKT-OQ-001, …

RULES
- STRICTLY B2B. No consumer / retail analysis.
- Every quantitative claim (₹, %, tonnes, wafers) needs a source basis or
  is flagged as "estimate — see §12". Never invent numbers.
- Where public data is thin, say so honestly and add to §13.`;

    case "procedure":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Procedure & Route of Synthesis — <product title>

## 1. Executive Summary
   Chosen route in one paragraph: how it's made, why this route, key hazards, scale-up posture.

## 2. Route of Synthesis (RoS)
   ### 2.1 Chosen Route
   ### 2.2 Alternative Routes Considered (1-2, with reason rejected)
   ### 2.3 Chemical Reaction Scheme
       Provide the reaction scheme as text (arrow notation) AND as a
       Mermaid \`graph LR\` diagram. The diagram MUST be inside a fenced
       code block whose opening line is exactly three backticks followed
       by the word \`mermaid\` (no spaces, no colon) and whose closing
       line is exactly three backticks on their own line. Do NOT emit the
       diagram as plain text, an indented block, or with just the word
       "mermaid" on its own line — the UI will only render diagrams
       inside a proper \`\`\`mermaid …\`\`\` fence. Use one node per
       intermediate and label every edge with reagent/conditions.
       Any node label that contains parentheses, colons, commas, slashes,
       pipes or angle brackets MUST be wrapped in double quotes — mermaid's
       lexer treats an unquoted \`(\` inside \`[…]\` as an alternate node
       shape and will fail to parse the diagram otherwise. Prefer quoting
       every label defensively.
       Example (structure, not content):
           \`\`\`mermaid
           graph LR
             A["Feed compound"] -->|"reagent, T, P"| B["Intermediate"]
             B --> C["Final product"]
           \`\`\`
   ### 2.4 Key Intermediates
       Table: Intermediate | CAS# (if known) | Role | Criticality.

## 3. Step-by-Step Procedure
   For each step (numbered PROC-STEP-001, PROC-STEP-002, …):
   ### Step ### — <short name>
   - **Inputs**: reagents / precursors with moles + mass (or wafer count)
   - **Conditions**: temperature (°C), pressure (bar / mmHg), time,
     stirring, atmosphere (inert / air / vacuum), solvent, catalyst
   - **Equipment**: reactor / kiln / furnace / lithography / etch tool
     type + size class
   - **Output**: product name, expected mass / count, expected yield %
   - **Hazards** (see §6 for details): flags like flammable, toxic,
     exothermic, cryogenic, high-vacuum, high-voltage plasma
   - **Notes / process controls**: quench, workup, in-process check

## 4. Material Balance Table
   | Step | In (kg/mol) | Out (kg/mol) | Yield % | Waste stream | Solvent recovery % |
   Include an overall material balance row.

## 5. Lab-Scale Configuration (Small Batch)
   - Batch size (g or kg / wafers per lot)
   - Glassware / reactor size, hotplate/oil bath, condenser, inert gas
     line, fume hood requirements (or cleanroom class for semi)
   - Analytical equipment (HPLC / GC / NMR / FTIR / SEM / ellipsometer …)
   - Estimated turnaround per batch

## 6. Industrial-Scale Configuration (Full Manufacturing)
   - Batch or continuous mode; per-batch or hourly throughput target
   - Reactor type + volume (m³) / furnace + capacity / fab clean-room area
   - Utilities: steam, chilled water, N₂, vacuum, DI water,
     compressed dry air, power (kW / MW)
   - Ancillaries: scrubbers, incinerators, ETP/STP, HVAC, DCS/SCADA
   - Scale-up factors and risks (heat transfer, mixing, safety)
   - Estimated OEE / uptime assumption

## 7. Hazards & EHS Risk Register
   For each hazard (HAZ-###):
   - Severity: Critical | High | Medium | Low
   - Likelihood: high | medium | low
   - Step(s) affected (reference PROC-STEP-###)
   - Nature: fire / explosion / toxic exposure / corrosive / cryogenic /
     high-vacuum / plasma / radiation / ergonomic
   - Mitigation (concrete, actionable): PPE, engineering controls, SOP,
     interlocks, relief systems, ventilation, containment
   - Regulatory reference (OSHA / DGFASLI / factory act / SEMI S2 / etc.)
   - Verification (how we know the mitigation is in place)

## 8. Waste, Effluent & Emissions
   Solid waste, liquid effluent, gaseous emissions per batch or per unit;
   treatment approach and disposal path.

## 9. Quality Control Plan
   In-process checks, release specs, sampling plan, key analytical methods.

## 10. Scale-Up Risks & Open Questions

RULES
- Every step MUST have temperature/pressure/time/atmosphere or explicitly
  state "ambient / atmospheric / N/A".
- Every step MUST show mass or mole quantities in AND out, plus expected
  yield %.
- Every Critical or High hazard MUST have a concrete mitigation and a
  verification method — no vague "follow safe practice".
- Do not invent a route of synthesis; if the compound / device is
  proprietary or the RoS is unclear from public knowledge, state that
  explicitly in §2 and propose the most-plausible published route with
  citations if possible.
- Use SI units throughout. Wafer counts in units of 200 mm / 300 mm as
  appropriate for semiconductor.`;

    case "procurement":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Procurement Plan — <product title>

## 1. Executive Summary
   Total CAPEX (equipment) + first-year OPEX (raw materials) order of
   magnitude, in ₹ Cr and USD Mn, with the biggest single-item drivers.

## 2. Hardware / Equipment Bill of Materials (Industrial Scale)
   Sourced from the Procedure §6 industrial-scale configuration.
   Table (PROC-HW-###):
   | ID | Equipment | Spec / Capacity | Qty | Purpose (step ref) | India vendor(s) | Intl vendor(s) | Est. unit price (INR ₹) | Est. unit price (USD) | Lead time |
   Group by: Reactors / Process, Utilities, Cleanroom / Fab, Analytical,
   Effluent & Safety, Automation & IT.

## 3. Raw Materials Bill of Materials (Industrial Scale, per year)
   Sourced from the Procedure §3 step inputs, scaled to annual capacity.
   Table (PROC-RM-###):
   | ID | Material | Grade / Purity | CAS# | Annual qty | Uses in step(s) | India vendor(s) | Intl vendor(s) | Unit price INR ₹/kg | Unit price USD/kg | Lead time | Notes (single-source / regulated) |

## 4. Vendor Landscape
   ### 4.1 India Vendors (preferred where feasible)
   ### 4.2 International Vendors
   For each significant vendor: name, HQ, notable clients, capacity,
   incoterm typically offered, MOQ, payment terms.

## 5. Landed-Cost Analysis (India as destination)
   For each significant imported item:
   - Ex-works price (USD)
   - Freight (sea/air, USD)
   - Customs duty + IGST + cess (%, INR)
   - Clearing / port charges
   - Landed cost per unit (INR)
   Table it.

## 6. Cost Rollup
   | Category | India-sourced (INR ₹) | Imported landed (INR ₹) | Total (INR ₹) | USD equivalent |
   | Equipment CAPEX | … |
   | Raw materials Y1 OPEX | … |
   | Utilities, packaging, MRO | … |
   | Freight & duties (imports) | … |
   | Total | … |

## 7. Sourcing Strategy
   - Single-source vs multi-source decisions
   - Long-lead items and contingency (safety stock, alternate vendors)
   - Localization roadmap (moving imported items to Indian vendors over time)

## 8. Regulatory / Trade Considerations
   Import licences (e.g. narcotic precursor lists for pharma, dual-use for
   semi equipment), BIS certification, PESO for pressure vessels, etc.

## 9. Assumptions & Confidence
## 10. Open Questions

RULES
- Every price MUST have a source basis or be flagged as "estimate — see §9".
  Never invent prices.
- ALWAYS provide both India (INR ₹) and international (USD) options for
  every significant equipment and raw-material line item.
- Flag single-source and regulated items explicitly.
- Landed cost = ex-works + freight + duty + clearing. Show the math.`;

    case "ip":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Intellectual Property Analysis — <product title>

## 1. Executive Verdict
   Line 1 in bold using EXACTLY one of these labels:
     **Clear** — no material IP obstacles under the analyzed jurisdictions
     **Conditional** — clear only after named workarounds / licensing
     **Blocked** — a live claim blocks the current approach in ≥ 1 target market
   Follow with a 3-4 sentence rationale referencing the strongest patents.

## 2. Scope & Jurisdictions Reviewed
   Default: India (IPO), United States (USPTO), Europe (EPO / national),
   WIPO / PCT applications. Add / remove jurisdictions as the user
   specified. State the search date explicitly.

## 3. Patent Landscape
   ### 3.1 Product / Compound / Device Patents
       Table (IP-PROD-###):
       | ID | Patent no. | Owner | Priority date | Jurisdictions | Status (live / expired / pending) | Expiry | Relevance |
   ### 3.2 Process / Synthesis Patents
       Table (IP-PROC-###), same columns.
   ### 3.3 Intermediate / Key-Reagent Patents
       Table (IP-INT-###), same columns.
   ### 3.4 Use / Application / Formulation Patents (where relevant)
       Table (IP-USE-###), same columns.

## 4. Freedom-to-Operate (FTO) Analysis
   For each live claim that overlaps the planned product or Procedure:
   ### FTO-### — <patent no. — short title>
   - Owner
   - Jurisdictions where it is live
   - Which claims read on our plan (claim numbers if known)
   - Overlap: process step / intermediate / product / use
   - Severity: Critical | High | Medium | Low
   - Recommended action (design-around / licence / wait for expiry / challenge)
   - Traces to: PROC-STEP-### / route intermediate name

## 5. Expiry Timeline
   Chronological Mermaid \`gantt\` diagram of the top 8-12 relevant patents,
   showing filing → expiry → geographies. Highlight patents expiring
   within 3 years (near-term opportunity) and within 8 years (long shadow).
   The diagram MUST be inside a fenced code block whose opening line is
   exactly three backticks followed by \`mermaid\` (no spaces, no colon)
   and whose closing line is exactly three backticks on their own line —
   do not emit the diagram as plain text or with only the word "mermaid"
   on its own line.

## 6. Workaround & Design-Around Suggestions
   For each Critical or High FTO finding: concrete alternative synthesis
   routes, alternative intermediates, or geography-limited launch strategy.

## 7. Licensing Options
   Named potential licensors, precedent deals if publicly known.

## 8. IP Filing Strategy for the New Product / Process
   Where might WE file for protection? Novel steps, novel intermediates,
   novel formulations, process improvements worth patenting.

## 9. Regulatory / Data Exclusivity Overlay (pharma only)
   Data exclusivity, orphan drug, paediatric extensions — where applicable.

## 10. Assumptions, Limitations & Confidence
## 11. Open Questions

RULES
- This is a **preliminary landscape**, not a legal opinion — say so in §10.
- Cite patent numbers concretely; if a number is not known, write
  "TBD — landscape search required" and add to §11 rather than fabricating one.
- Every FTO Critical / High finding MUST have a concrete recommended action.
- India (IPO) MUST always be one of the analyzed jurisdictions unless the
  user explicitly excluded it.
- Consider both product AND process patents — process patents alone can
  block Indian generic-style entrants even after product patent expiry.`;

    case "finance":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Financial Projection — <product title>

## 1. Executive Summary
   Total CAPEX, expected Y5 revenue, gross margin band, payback period,
   IRR range. 3-4 sentences.

## 2. Basis of Projection
   - Currency: INR ₹ (primary) + USD (reference), FX assumption stated.
   - Time horizon: 5 years (Y1-Y5); include Y0 for CAPEX build.
   - Capacity ramp assumption (% of nameplate in each year).
   - Utilisation, working days, shifts.
   - Sources for cost / price inputs (link to Procurement + Market artifacts).

## 3. CAPEX Plan
   Table:
   | Line item | Amount INR ₹ Cr | USD Mn | Timing (Y0 / Y1) | Depreciation life (yrs) |
   Sourced from Procurement §6.

## 4. Raw Material Cost per Unit
   Table (FIN-RM-###):
   | Material | Qty per unit output | Unit price INR ₹/kg | Cost per unit output INR ₹ |
   Sum → **raw material cost per unit output (₹/kg or ₹/wafer or ₹/unit)**.

## 5. Manufacturing Cost per Unit
   Table:
   | Cost head | INR ₹/unit | Basis |
   | Raw materials | (from §4) |
   | Utilities (power, steam, gases, water) | |
   | Consumables & solvents (net of recovery) | |
   | Direct labour | |
   | Maintenance & spares | |
   | Effluent treatment | |
   | Depreciation | |
   | Overheads & QA | |
   | Total manufacturing cost per unit | |

## 6. Sales & Revenue Projection (Y1-Y5)
   Table:
   | Year | Volume (kg / wafers / units) | Realised price INR ₹/unit | Revenue INR ₹ Cr | Revenue USD Mn |
   Base price from Market §9; annotate any price ramp/erosion assumption.

## 7. P&L (Y1-Y5)
   Table with rows: Revenue, COGS (from §5 × §6), Gross profit,
   Gross margin %, SG&A, R&D, EBITDA, Depreciation, EBIT, Interest,
   PBT, Tax @ (rate), PAT.

## 8. Cash Flow & Funding
   Y0-Y5: CAPEX outflow, working-capital change, operating cash flow,
   free cash flow, cumulative FCF. State funding mix (equity, debt,
   grants / PLI schemes if applicable) and interest rate assumption.

## 9. Key Metrics
   - Payback period
   - IRR (project) — with range under sensitivity
   - Break-even volume (units) and break-even year
   - Gross margin (Y3, Y5)
   - Return on Capital Employed (Y5)

## 10. Sensitivity Analysis
   Tornado view (text is fine) on: raw material price ±20%, realised
   price ±15%, capacity utilisation ±20 pp, FX ±10%, CAPEX ±15%.

## 11. Assumptions & Confidence
## 12. Open Questions

RULES
- Every number ties back to Procurement (§3-6) or Market (§3-9) or is an
  explicit assumption in §11.
- Show INR ₹ primary and USD reference for every rollup.
- If a cost basis is missing, flag it in §12 rather than inventing.
- Depreciation is straight-line unless otherwise noted (state life in §3).`;

    case "presentation":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# <product title> — Market Research Package

## PART A · Executive Summary (Board-Ready, ≤ 2 pages when printed)

### 1. The Opportunity
   3-4 sentences: product, market size, why now.

### 2. The Business Case
   3-5 bullets: expected revenue Y5, gross margin, payback, IRR band.

### 3. Feasibility Snapshot
   4 chips: **Market**, **Procedure**, **Procurement**, **IP** — each one
   sentence + status (Go / Conditional / Blocked).

### 4. Top 5 Risks & Mitigations
   Table.

### 5. Ask / Decision Requested
   What is being asked of the reader (approve CAPEX, initiate pilot,
   secure offtake, file patents).

---

## PART B · Detailed Findings

### 6. Product & Market
   Compressed summary of the Market Analysis — TAM/SAM/SOM, top buyer
   segments, top 5 geographies, competitive landscape, pricing reference.

### 7. Procedure & Route of Synthesis
   Compressed summary of the Procedure — chosen route, reaction scheme
   (embed the Mermaid), key steps, hazards headline, lab vs industrial
   configuration.

### 8. Procurement Plan
   Compressed summary — equipment CAPEX, raw material Y1 OPEX,
   India-vs-international split, key single-source items, top 5 vendors
   (India + intl).

### 9. Intellectual Property
   Compressed summary — FTO verdict, top 3 blocking patents,
   design-around approach, own filing strategy.

### 10. Financial Projection
   Compressed summary — CAPEX, per-unit manufacturing cost,
   5-yr revenue projection, IRR, sensitivity headline.

---

## PART C · Appendix
   - A.1 Refined concept
   - A.2 Full Market Analysis (link / included)
   - A.3 Full Procedure & Route (link / included)
   - A.4 Full Procurement Plan (link / included)
   - A.5 Full IP Analysis (link / included)
   - A.6 Full Financial Model (link / included)
   - A.7 Consolidated Open Questions (across all departments)

RULES
- Part A is executive — no numbers without a headline framing.
- Part B is compressed — each department in 1-2 pages equivalent.
- Preserve the source IDs (MKT-, PROC-STEP-, PROC-HW-, PROC-RM-, IP-,
  FIN-) so readers can trace back into the full artifacts.
- Consolidated Open Questions in A.7 MUST list every open question from
  every department verbatim.
- No new claims — this artifact ONLY aggregates from upstream artifacts.
  If a claim isn't in an upstream artifact, don't put it here.`;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Upstream context per kind
 *
 * DAG:
 *   Refined Concept
 *     ├── market      }  Wave 1 (parallel)
 *     └── procedure   }
 *          ↓
 *          ├── procurement  (needs procedure; also uses market for scale)
 *          └── ip           (needs procedure; also uses market for jurisdictions)
 *                ↓
 *                finance    (needs procurement + market)
 *                  ↓
 *                  presentation (aggregates everything)
 * ────────────────────────────────────────────────────────────────────────── */

export interface UpstreamArtifacts {
  market?: DocumentArtifact;
  procedure?: DocumentArtifact;
  procurement?: DocumentArtifact;
  ip?: DocumentArtifact;
  finance?: DocumentArtifact;
}

function upstreamBlock(kind: DocumentKind, up: UpstreamArtifacts): string {
  const missing = (name: string) =>
    `(${name} not available in this run — proceed as best you can and flag gaps in Open Questions.)`;
  switch (kind) {
    case "market":
    case "procedure":
      return ""; // both operate directly on Refined Concept
    case "procurement":
      return `--- PROCEDURE (source of truth for equipment + raw materials) ---
${up.procedure?.content || missing("Procedure")}

--- MARKET ANALYSIS (source of truth for target scale + geography) ---
${up.market?.content || missing("Market Analysis")}`;
    case "ip":
      return `--- PROCEDURE (source of truth for route, intermediates, process to search) ---
${up.procedure?.content || missing("Procedure")}

--- MARKET ANALYSIS (source of truth for target jurisdictions + segments) ---
${up.market?.content || missing("Market Analysis")}`;
    case "finance":
      return `--- PROCUREMENT PLAN (source of truth for CAPEX + raw material costs) ---
${up.procurement?.content || missing("Procurement")}

--- MARKET ANALYSIS (source of truth for demand, pricing, geography) ---
${up.market?.content || missing("Market Analysis")}`;
    case "presentation":
      return `--- MARKET ANALYSIS ---
${up.market?.content || missing("Market Analysis")}

--- PROCEDURE & ROUTE OF SYNTHESIS ---
${up.procedure?.content || missing("Procedure")}

--- PROCUREMENT PLAN ---
${up.procurement?.content || missing("Procurement")}

--- INTELLECTUAL PROPERTY ANALYSIS ---
${up.ip?.content || missing("IP Analysis")}

--- FINANCIAL PROJECTION ---
${up.finance?.content || missing("Finance")}`;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Debate prompts
 * ────────────────────────────────────────────────────────────────────────── */

/** Round 1: each team member writes their initial draft independently. */
export function stageInitialPrompt(
  member: Specialist,
  teammates: Specialist[],
  kind: DocumentKind,
  refinedConcept: string,
  upstream: UpstreamArtifacts,
  docs: { filename: string; text: string }[],
): { system: string; user: string } {
  const teammateNames = teammates.map((t) => t.name).join(", ") || "(none — solo)";

  const system = `${personaBlock(member)}

TASK
You are a member of a specialist department producing the ${TITLES[kind]}.
Your teammates on this artifact are: ${teammateNames}. In later rounds
you will critique each other and revise; for THIS first round, produce
YOUR OWN independent initial draft — do not attempt to guess what your
teammates will say. Write the strongest ${TITLES[kind]} you can from the
Refined Concept${upstreamBlock(kind, upstream) ? " and the upstream artifacts" : ""}.

${structureFor(kind)}

Return Markdown only. No preamble. No JSON.`;

  const upstreamContext = upstreamBlock(kind, upstream);
  const user = `${documentBlock(docs)}

--- REFINED CONCEPT ---
${refinedConcept}

${upstreamContext}

Produce your initial draft of the ${TITLES[kind]} now.`;

  return { system, user };
}

/**
 * Later rounds: each member sees their own prior draft PLUS all teammates'
 * prior drafts, then produces (a) critique, (b) revised draft, (c)
 * self-scored agreement with the collective. Returns strict JSON.
 */
export function stageReviseAndScorePrompt(
  member: Specialist,
  teammates: Specialist[],
  teammateDrafts: Array<{ member: Specialist; draft: string }>,
  ownPrevDraft: string,
  kind: DocumentKind,
  refinedConcept: string,
  upstream: UpstreamArtifacts,
  docs: { filename: string; text: string }[],
  threshold: number,
  roundN: number,
): { system: string; user: string } {
  const teammateNames = teammates.map((t) => t.name).join(", ");

  const system = `${personaBlock(member)}

TASK
You are on a specialist department producing the ${TITLES[kind]}. Your
teammates are: ${teammateNames}. This is round ${roundN}. Each round you must:

  1. CRITIQUE the collective of your teammates' latest drafts — call out
     what's strong, what's weak, what's missing, factual errors, missed
     traceability, and vague or unmeasurable claims. Address teammates
     BY NAME when calling out specific claims.

  2. Produce your REVISED DRAFT of the ${TITLES[kind]} — an improvement
     over your previous draft that incorporates anything valid from your
     teammates and closes the gaps they surfaced. Preserve the section
     structure below exactly. Your revised draft is a COMPLETE, standalone
     Markdown document — not a diff, not a summary.

  3. Report your AGREEMENT SCORE: an integer 0-100 estimating how closely
     your REVISED draft aligns with the COLLECTIVE of your teammates'
     latest drafts on all substantive claims (not stylistic choices).
     - If teammates disagree with each other, use your judgement.
     - Do NOT inflate the score to end the debate early — an honest 70
       is more useful than a dishonest 95.

The department stops debating and moves on when EVERY member's score is
≥ ${threshold}. If we're already substantively equivalent, feel free to
report ≥ ${threshold}. Otherwise keep revising honestly.

OUTPUT
Return STRICT JSON only, with this exact shape and no extra keys:
{
  "critique": "string (<= 400 words, plain text, no markdown headings)",
  "revised": "markdown string of the full revised ${TITLES[kind]}",
  "agreement": <integer 0-100>
}

${structureFor(kind)}`;

  const teammateBlock = teammateDrafts
    .map(({ member: m, draft }) => `--- TEAMMATE: ${m.name} ---\n${draft}`)
    .join("\n\n");

  const upstreamContext = upstreamBlock(kind, upstream);
  const user = `${documentBlock(docs)}

--- REFINED CONCEPT ---
${refinedConcept}

${upstreamContext}

--- YOUR PREVIOUS DRAFT (${member.name}) ---
${ownPrevDraft}

${teammateBlock}

Return the JSON now.`;

  return { system, user };
}
