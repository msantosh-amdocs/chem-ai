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
  semiconductor: "Semiconductor Manufacturing",
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
       Provide the reaction scheme in three parallel forms so the reader
       has plain-text fallback, a rendered flow diagram, AND properly
       typeset stoichiometric equations:

       (a) Text arrow notation for quick scan, e.g.
              "3-methylpyridine → 3-(trichloromethyl)pyridine → 2,3-DCTF".

       (b) A Mermaid \`graph LR\` diagram of the same route. The diagram
           MUST be inside a fenced code block whose opening line is
           exactly three backticks followed by the word \`mermaid\` (no
           spaces, no colon) and whose closing line is exactly three
           backticks on their own line. Do NOT emit the diagram as plain
           text, an indented block, or with just the word "mermaid" on
           its own line. Use one node per intermediate and label every
           edge with reagent/conditions. Any node label that contains
           parentheses, colons, commas, slashes, pipes or angle brackets
           MUST be wrapped in double quotes — mermaid's lexer treats an
           unquoted \`(\` inside \`[…]\` as an alternate node shape and
           will fail to parse the diagram otherwise. Prefer quoting
           every label defensively.
           Example (structure, not content):
               \`\`\`mermaid
               graph LR
                 A["Feed compound"] -->|"reagent, T, P"| B["Intermediate"]
                 B --> C["Final product"]
               \`\`\`

       (c) Every balanced stoichiometric equation for each step, written
           as LaTeX using the mhchem package inside math delimiters so
           the UI can typeset it properly. Use \`$$…$$\` (a whole line)
           for display equations and \`$…$\` for inline mentions inside
           prose. Do NOT emit the equation as plain text such as
           "CH4 + 2 O2 -> CO2 + 2 H2O" — use \`\\ce{…}\` inside math.
           Example (structure, not content):
               $$\\ce{CH4 + 2 O2 -> CO2 + 2 H2O}$$
               Reaction enthalpy: $\\Delta H_{\\text{rxn}} \\approx -890\\,\\text{kJ/mol}$.
           Use mhchem's arrow forms (\`->\`, \`<=>\`, \`<->\`), phase
           labels (e.g. \`(g)\`, \`(l)\`, \`(s)\`, \`(aq)\`), catalysts
           (\`->[H2SO4]\`), and units via \`\\pu{…}\` where relevant.
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

    case "semiconductor":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Semiconductor Manufacturing — <device / product title>

## 1. Executive Summary
   In one paragraph: target device class (logic / analog / RF / power /
   MEMS / image sensor / memory / GPU / AI-accelerator), process node,
   wafer size, capacity target (wafer starts per week / month), key
   yield-limiting risks, and packaging strategy.

## 2. Device Definition
   - Device class + end use (PC / server, mobile, TV / set-top,
     automotive, industrial, night-vision / IR, GPU / AI, medical).
   - Target performance (frequency, current, breakdown voltage, pixel
     pitch, capacity — whichever is relevant).
   - Reliability / quality tier: consumer / industrial / AEC-Q100
     Grade 1-3 (automotive) / space / medical.
   - Design origin: internal design, licensed IP, foundry PDK-based —
     say if TBD.

## 3. Substrate & Starting Wafer
   | Parameter | Choice | Rationale |
   | Wafer material | Si (Cz / FZ / epi) / SOI / SiC / GaN / GaAs / … |
   | Wafer size | 150 / 200 / 300 mm |
   | Crystal orientation | (100) / (111) |
   | Doping | n-type / p-type, resistivity range |
   | Supplier tier | short-list (e.g. Shin-Etsu, SUMCO, Siltronic, GlobalWafers, Wacker for SiC / GaN specialists) |

## 4. Process Node & Technology Choice
   - Node: e.g. 180 nm / 130 / 90 / 65 / 45 / 28 / 22 / 16-14 / 10 /
     7 / 5 / 3 / 2 nm. Prefer conservative choice unless the device
     demands leading edge.
   - Rationale (transistor density, power/perf, cost per mm², IP
     availability, capacity availability at target foundries).
   - Foundry model: own fab (IDM) vs foundry (TSMC / Samsung / GF /
     UMC / SMIC / Tower / Tata Electronics / Powerchip) vs
     fab-lite / fabless.
   - PDK / design-kit path (own, licensed, foundry-provided).

## 5. Process Flow (Front-End of Line — FEOL)
   Numbered unit-process modules SEMI-FEOL-001, SEMI-FEOL-002, …
   For each module: purpose, tool class, target parameter (CD /
   thickness / dose / temperature), and defectivity risk.
   Suggested module sequence (customise per device):
   ### 5.1 Wafer clean (RCA / SC-1 / SC-2)
   ### 5.2 Isolation (LOCOS or STI: pad ox → nitride → etch → gap-fill CVD oxide → CMP)
   ### 5.3 Well formation (n-well / p-well implant + drive-in)
   ### 5.4 Gate stack (thermal / ISSG oxidation for mature nodes;
       hi-k / metal gate — HfO₂ / TiN — for advanced nodes; FinFET or
       GAA transistor geometry at ≤ 14 nm)
   ### 5.5 Poly / metal gate patterning (lithography + etch)
   ### 5.6 Lightly-doped-drain (LDD) implant + spacer
   ### 5.7 Source / drain implant + activation anneal (RTA / laser spike / SPE)
   ### 5.8 Silicidation (NiSi / CoSi₂ / TiSi₂)
   ### 5.9 Contact & first-metal (W plug + Cu damascene or Al metallization on mature nodes)

   Provide the process flow in TWO parallel forms:

   (a) Numbered text list of the module names.

   (b) A Mermaid \`flowchart LR\` diagram of the FEOL sequence. The
       diagram MUST be inside a fenced code block whose opening line is
       exactly three backticks followed by the word \`mermaid\` (no
       spaces, no colon) and whose closing line is exactly three
       backticks on their own line. Any node label containing
       parentheses, colons, commas, slashes, pipes or angle brackets
       MUST be wrapped in double quotes.
       Example (structure, not content):
           \`\`\`mermaid
           flowchart LR
             A["Wafer clean"] --> B["Isolation (STI)"] --> C["Well implant"]
           \`\`\`

## 5a. Process Chemistry (Organic + Inorganic)
   Wafer-fab is a chemistry pipeline. Every deposition, etch, clean,
   and CMP step in §5 / §7 MUST cite its chemistry here. Group by
   family; use SEMI-CHEM-### IDs (shared with §13 hazard register):

   ### 5a.1 Photoresists, PAGs & Developers
   | Layer / node | Resist family (novolac-DNQ i-line / CA DUV KrF / CA ArF 193 dry / ArF-immersion / EUV metal-oxide) | Tone (+/−) | PAG + quencher | Developer (TMAH 2.38 % / NMD-3) | Adhesion promoter (HMDS) | Sensitivity target | LER / LWR target |
   Call out why the resist family fits the node (chemically-amplified
   for DUV; metal-oxide inorganic resist for EUV; classical DNQ novolac
   for mature i-line contact / package litho).

   ### 5a.2 Thin-Film Precursors
   | Film | Deposition method | Precursor system | Co-reactant / oxidant | Temperature / pressure window | Typical vendor tier |
   Must cover at minimum the films used in §5–§7:
     - SiO₂ — TEOS + O₂/O₃ (PECVD/HDP), HTO, thermal
     - Si₃N₄ — DCS + NH₃ (LPCVD), BTBAS + NH₃ (PECVD)
     - TiN — TDMAT / TDEAT (MOCVD) or TiCl₄ + NH₃ (thermal)
     - TaN — PDMAT + NH₃ plasma (ALD)
     - HfO₂ high-k — HfCl₄ + H₂O or Hf-alkylamide (TEMAH / TDMAH) + H₂O / O₃ (ALD)
     - W plug — WF₆ + SiH₄ nucleation → WF₆ + H₂ bulk
     - Cu — PVD seed; ECD from CuSO₄ + accelerator (SPS) + suppressor
       (PEG) + leveller (JGB / Cl⁻)
     - Co / Ru — for advanced-node liners / caps where relevant

   ### 5a.3 Etch Chemistries
   | Etch step (from §5 / §7) | Wet or dry | Chemistry | Selectivity target | Residue / polymer to remove afterwards |
   Typical actors:
     - Oxide / low-k dry etch — CF₄ / CHF₃ / C₄F₈ / C₄F₆ + O₂ + Ar
     - Nitride etch — CH₂F₂ / CHF₃ dry; hot H₃PO₄ 160 °C wet
     - Poly-Si / Si trench — HBr / Cl₂ / O₂
     - Al metal — Cl₂ / BCl₃ / N₂
     - Cu — CMP (no plasma etch); wet strip via BTA-inhibited chemistries
     - Oxide wet — BOE (NH₄F:HF), dHF (100:1)
     - Anisotropic Si — TMAH, KOH

   ### 5a.4 CMP Slurries
   | Step (STI / ILD / W / Cu) | Abrasive (colloidal silica / ceria / alumina) | Oxidiser | Inhibitor (BTA for Cu) | pH window | Post-CMP clean |

   ### 5a.5 Wet Cleans & Wafer Prep
   RCA sequence (SC-1 NH₄OH:H₂O₂:H₂O 1:1:5 for particles / organics;
   SC-2 HCl:H₂O₂:H₂O 1:1:5 for metallic ions), piranha (H₂SO₄:H₂O₂
   ~4:1) for organic strip, dHF for native oxide, ozonated DI water,
   Marangoni IPA-vapor dry. Name every clean's target contaminant.

   ### 5a.6 Resist Strip / Ash
   O₂ downstream plasma ash (isotropic) ± CF₄ for polymer residue;
   SPM piranha wet strip. Flag any step where SPM would attack an
   underlying film (Al, Cu without cap).

   ### 5a.7 Back-End & Packaging Polymers (feeds §9)
   Photo-imageable polyimide (PI), polybenzoxazole (PBO),
   benzocyclobutene (BCB), epoxy underfill (CTE, ionic purity),
   die-attach film (DAF), mold compound / EMC (Tg, CTE, α-particle
   emission for HBM). Cite Tg and CTE where automotive AEC-Q100 or
   3D / HBM warpage matter.

## 6. Photolithography Strategy
   Per critical layer (gate, contact, M1, via1, …). Cross-reference
   the resist / developer entry in §5a.1 for each row.
   | Layer | Target CD | Lithography (i-line / DUV KrF 248 / DUV ArF 193 dry / ArF-i / EUV 13.5) | Resist family + tone (→ §5a.1) | Mask count | Overlay budget | Yield-limiting defect |

## 7. Back-End of Line (BEOL) — Interconnect
   - Number of metal layers (M1 … Mn) + specification.
   - Cu damascene stack: barrier (Ta/TaN) + seed (PVD Cu) + ECD Cu +
     CMP; low-k / ULK dielectric choice (k value).
   - Aluminum metallization + oxide vias for legacy nodes.
   - Redistribution layer (RDL) for chip-scale packaging / fan-out.

## 8. Wafer Test (Wafer Probe / Wafer Sort)
   - Parametric test structures (PCM / scribe-line): threshold voltage,
     Ion / Ioff, contact resistance, sheet resistance.
   - Functional / structural test (scan, BIST, memory BIST).
   - ATE class (e.g. Advantest V93000, Teradyne UltraFLEX / J750),
     probe card technology (cantilever / vertical / MEMS / MicroSpring),
     wafer-map yield target.

## 9. Assembly & Packaging
   ### 9.1 Traditional Packaging
       Die prep (thin / dice) → Die attach (epoxy / eutectic / DAF) →
       Wire bond (Au / Cu / Ag) or Flip-chip (C4 / Cu-pillar bump) →
       Underfill → Mold / encapsulation → Marking → Solder-ball attach
       (BGA) or Lead trim & form (QFN / QFP).
       Package choice: DIP / SOIC / TSSOP / QFN / LGA / BGA / FCBGA /
       WLCSP — pick per pin count, thermal, cost.

   ### 9.2 Advanced Packaging (where required)
       - Fan-Out Wafer-Level Packaging (FOWLP / InFO / RCP)
       - 2.5D silicon interposer (CoWoS-style) or RDL interposer
       - 3D die stacking with Through-Silicon Vias (TSVs)
       - High-Bandwidth Memory (HBM 2 / 2e / 3 / 3e) stacks —
         DRAM dies stacked over a logic base die
       - Chiplet integration standards (UCIe, BoW, AIB) with dedicated
         die-to-die PHY
       - Hybrid bonding (Cu-Cu, SoIC / X-Cube) for advanced 3D
       Cite specific standards / ecosystems only where applicable.

## 10. Final Test, Burn-in & QA
   - Final test flow (open/short → parametric → functional → speed
     binning), ATE program, socket / handler.
   - Burn-in / HTOL / early-life screen — required for automotive,
     medical, or high-reliability parts.
   - JEDEC JESD22 reliability suite; AEC-Q100 for automotive.
   - Outgoing quality level (DPPM / DPB) target.

## 11. Yield Model
   - D0 (defect density per cm²) assumption.
   - Die area (mm²) and gross die per wafer (state formula).
   - Composite yield model (Poisson / Murphy) — show the math.
   - Expected wafer-sort yield, package yield, and final-test yield;
     multiply for overall.
   - Ramp curve: pilot → yield-learning → mature yield.

## 12. Cleanroom & Facilities
   - Cleanroom class per module (ISO 3 / 4 / 5 / 6 = FED-STD-209E Class
     1 / 10 / 100 / 1000). Litho + gate module usually class 1-10.
   - Air changes per hour, filter class (ULPA / HEPA), pressure
     cascade, temperature (± 0.1 °C at critical tools), humidity, ESD
     floor, vibration budget.
   - Utilities: UPW (ultra-pure water — target ≤ 1 ppb metals, TOC ≤ 1 ppb,
     resistivity 18.2 MΩ·cm), bulk N₂ + CDA + HP N₂, process cooling
     water, chilled water, house vacuum, UPS + diesel backup.
   - Power envelope (MW). A 300 mm advanced-node line typically 30–60 MW.
   - Fab footprint (m²) and clean-corridor / SMIF / FOUP / EFEM handling.

## 13. Gases & Chemistries (Hazard Register)
   Table (SEMI-CHEM-###):
   | ID | Species | Class (pyrophoric / toxic / corrosive / GHG) | Use step(s) | Storage / delivery | Abatement | Regulatory reference (SEMI S2 / F5 / NFPA 318 / OSHA / GHG protocol) |
   Cover typical actors: SiH₄, Si₂H₆, NH₃, N₂O, WF₆, TiCl₄, BCl₃, Cl₂,
   HBr, NF₃, SF₆, C₄F₈, PH₃, B₂H₆, AsH₃, F₂; wet: HF, SC-1, SC-2, piranha,
   TMAH, IPA, CMP slurries.

## 14. Environmental Footprint
   Water reclaim %, PFC / GHG abatement approach, energy intensity
   (kWh per wafer-out), effluent path (F-containing, metals, spent
   solvents).

## 15. Tool List & CAPEX (feeds Procurement)
   Grouped table (SEMI-TOOL-###) by module:
   | Category | Tool | Vendor short-list | Qty | Unit price band (USD Mn) | Purpose |
   Litho steppers/scanners (ASML / Nikon / Canon), etch (Applied
   Materials / Lam / TEL), deposition (AMAT / Lam / TEL / ASM / Kokusai /
   Aixtron for GaN/SiC), CMP (AMAT / Ebara), ion implant (AMAT / Axcelis /
   SEN), metrology / inspection (KLA / AMAT / Hitachi / Lasertec),
   test / probe (Advantest / Teradyne / FormFactor), packaging (ASM /
   Shibaura / Kulicke & Soffa / Besi / Disco / Accretech).

## 16. Assumptions, Confidence & Open Questions
   ### 16.1 Assumptions
   ### 16.2 Confidence Statement
   ### 16.3 Open Questions (SEMI-OQ-###) — anything the analyst flagged, plus
       licence gaps, node availability, IP dependence, and any TBD spec.

REQUIREMENT ID RULES
  - Front-end modules:  SEMI-FEOL-001, …
  - Back-end modules:   SEMI-BEOL-001, …
  - Chemistries:        SEMI-CHEM-001, …  (shared IDs across §5a and §13)
  - Tools / CAPEX:      SEMI-TOOL-001, …
  - Open questions:     SEMI-OQ-001, …

RULES
- NEVER invent a foundry / node capability that is not publicly
  documented. When a spec depends on a specific foundry PDK or licensed
  IP, write "TBD — foundry PDK required" and add to §16.3.
- Every FEOL / BEOL module MUST list target CD or thickness or dose,
  plus a measurement technique (SEM / TEM / ellipsometry / SIMS /
  four-point-probe / metrology tool).
- Every deposited film, etch step, clean, CMP slurry, and photoresist
  in §5 / §6 / §7 MUST cite its chemistry entry in §5a. If the
  chemistry is exotic, tag "TBD — chemistry qualification required"
  rather than invent a spec.
- Every pyrophoric or toxic gas MUST have a specific gas-cabinet + excess-
  flow-shutoff + abatement plan and regulatory reference.
- Every back-end / packaging polymer named in §9 MUST appear in
  §5a.7 with Tg / CTE / ionic-purity numbers where reliability tier
  demands them (automotive AEC-Q100, HBM warpage, medical).
- Every advanced-packaging option chosen MUST have a stated need
  (bandwidth / thermal / footprint / cost) — no gratuitous 2.5D / 3D
  for a device that a QFN would serve.
- Use SI units. Wafer counts in 150 / 200 / 300 mm as appropriate.
- Cost bands are ROUGH order-of-magnitude — Procurement will refine.`;

    case "procurement":
      return `USE EXACTLY THIS STRUCTURE (Markdown):

# Procurement Plan — <product title>

## 1. Executive Summary
   Total CAPEX (equipment) + first-year OPEX (raw materials) order of
   magnitude, in ₹ Cr and USD Mn, with the biggest single-item drivers.

## 2. Hardware / Equipment Bill of Materials (Industrial Scale)
   Sourced from the upstream process artifact (Procedure §6 for
   chemical / pharma runs; Semiconductor Manufacturing §15 tool list
   for chip runs).
   Table (PROC-HW-###):
   | ID | Equipment | Spec / Capacity | Qty | Purpose (step ref) | Source (NEW / OEM-REFURB / 3P-REFURB) | India vendor(s) | Intl vendor(s) | Est. unit price (INR ₹) | Est. unit price (USD) | Lead time | Notes (export licence, warranty, spares) |
   Group by: Reactors / Process, Utilities, Cleanroom / Fab, Analytical,
   Effluent & Safety, Automation & IT.
   For semiconductor runs, additionally group fab tools by module
   (Litho / Etch / Deposition / CMP / Implant / Metrology / Test /
   Assembly / Packaging) and — where refurbished tools are a viable
   option (mature nodes, back-end tools) — list a NEW option AND a
   refurbished alternative side by side, naming the refurb house
   (SurplusGlobal / Moov / Peer Group / Sicon / Amtech / etc.) and
   the refurb condition class (OEM-refurbished with warranty vs
   third-party as-is / re-certified). Flag any tool whose destination
   + node combination triggers US EAR, Netherlands, Japan METI, or
   Indian SCOMET export controls, with the expected licence lead time.

## 2a. New vs Refurbished CAPEX Comparison (semiconductor runs only)
   For every fab tool listed in §2 that has a viable refurbished
   option, provide a compact side-by-side:
   | Tool | New price (USD Mn) | Refurb price (USD Mn) | Savings % | Refurb source | Warranty | Recommended | Rationale |
   Also state the aggregate CAPEX reduction achievable if the refurb-
   friendly subset is bought used. Skip this section entirely for
   chemical / pharma runs (Procedure department is upstream) —
   include a single line: "N/A — Procedure department upstream."

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

### 3.1 CAPEX Mix (chart)
   Directly under the §3 table, embed a Mermaid \`pie\` chart titled
   "CAPEX Breakdown (INR ₹<total> Cr)" whose slices are the §3 line items
   (values in ₹ Cr, matching the table exactly). Use the \`showData\`
   modifier so numeric values are printed next to labels. See the
   VISUALISATION POLICY below for the required fence syntax.

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

### 5.1 Manufacturing Cost Mix (chart)
   Directly under the §5 table, embed a Mermaid \`pie\` chart titled
   "Manufacturing Cost per Unit (₹<total>/kg or /unit)" whose slices are
   every non-total row in §5 (values in ₹/unit). Do not include the
   "Total" row as a slice.

## 6. Sales & Revenue Projection (Y1-Y5)
   Table:
   | Year | Volume (kg / wafers / units) | Realised price INR ₹/unit | Revenue INR ₹ Cr | Revenue USD Mn |
   Base price from Market §9; annotate any price ramp/erosion assumption.

### 6.1 Revenue Trajectory (chart)
   Directly under the §6 table, embed a Mermaid \`xychart-beta\` bar chart
   with x-axis \`[Y1, Y2, Y3, Y4, Y5]\` and \`bar\` values from the §6
   "Revenue INR ₹ Cr" column, in that order. Y-axis label:
   "Revenue (INR ₹ Cr)".

## 7. P&L (Y1-Y5)
   Table with rows: Revenue, COGS (from §5 × §6), Gross profit,
   Gross margin %, SG&A, R&D, EBITDA, Depreciation, EBIT, Interest,
   PBT, Tax @ (rate), PAT.

### 7.1 Revenue vs EBITDA (chart)
   Directly under the §7 table, embed a Mermaid \`xychart-beta\` combining
   a \`bar\` series (Revenue) and a \`line\` series (EBITDA) across Y1-Y5.
   Values must match §7 exactly. Y-axis label: "INR ₹ Cr".

## 8. Cash Flow & Funding
   Y0-Y5: CAPEX outflow, working-capital change, operating cash flow,
   free cash flow, cumulative FCF. State funding mix (equity, debt,
   grants / PLI schemes if applicable) and interest rate assumption.

### 8.1 Cumulative Free Cash Flow — Break-even (chart)
   Directly under the §8 table, embed a Mermaid \`xychart-beta\` \`line\`
   chart of cumulative FCF over Y0-Y5. Choose a y-axis range wide enough
   to include the deepest negative value AND the Y5 value with a little
   headroom (round to a nice number). The zero crossing is the visual
   break-even year — mention it in prose right below the chart.

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

VISUALISATION POLICY (charts are MANDATORY, not optional):

Sections §3.1, §5.1, §6.1, §7.1 and §8.1 above EACH require a Mermaid
diagram. Every chart MUST be inside a fenced code block whose opening
line is exactly three backticks followed by the word \`mermaid\` (no
spaces, no colon, no title on the fence line) and whose closing line
is exactly three backticks on their own line. Do NOT emit the chart
as plain text or as an indented code block; do NOT put just the word
"mermaid" on its own line without the opening fence.

Numbers inside every chart MUST match the corresponding table above
it — charts never introduce new numbers. If a table cell is TBD, drop
that slice / point (don't fabricate a value).

Worked examples (structure only — replace numbers with your project's):

Pie chart (used for §3.1 and §5.1):
    \`\`\`mermaid
    pie showData title CAPEX Breakdown (INR ₹80 Cr)
        "Process Equipment" : 45
        "Building & Civil" : 20
        "Utilities & Services" : 8
        "Contingency & Preop" : 4
        "IT & Automation" : 3
    \`\`\`

Bar (used for §6.1):
    \`\`\`mermaid
    xychart-beta
        title "5-Year Revenue (INR ₹ Cr)"
        x-axis [Y1, Y2, Y3, Y4, Y5]
        y-axis "Revenue (INR ₹ Cr)" 0 --> 500
        bar [80, 180, 320, 420, 470]
    \`\`\`

Bar + line overlay (used for §7.1):
    \`\`\`mermaid
    xychart-beta
        title "Revenue (bar) vs EBITDA (line) — INR ₹ Cr"
        x-axis [Y1, Y2, Y3, Y4, Y5]
        y-axis "INR ₹ Cr" -50 --> 500
        bar [80, 180, 320, 420, 470]
        line [-10, 25, 90, 140, 170]
    \`\`\`

Line for cumulative FCF / break-even (used for §8.1):
    \`\`\`mermaid
    xychart-beta
        title "Cumulative FCF (INR ₹ Cr)"
        x-axis [Y0, Y1, Y2, Y3, Y4, Y5]
        y-axis "Cumulative FCF (INR ₹ Cr)" -100 --> 400
        line [-80, -95, -55, 45, 165, 335]
    \`\`\`

RULES
- Every number ties back to Procurement (§3-6) or Market (§3-9) or is an
  explicit assumption in §11.
- Show INR ₹ primary and USD reference for every rollup.
- If a cost basis is missing, flag it in §12 rather than inventing.
- Depreciation is straight-line unless otherwise noted (state life in §3).
- All five mandatory charts (§3.1, §5.1, §6.1, §7.1, §8.1) MUST appear
  in the artifact. A missing chart is a Definition-of-Done failure and
  reviewers should flag it as a Blocker in the debate.
- \`xychart-beta\` y-axis ranges MUST be wide enough to include the
  min AND max of the series (with a small margin) — otherwise the plot
  clips silently.
- Do NOT wrap chart fences inside another fenced block, table cell,
  or blockquote — Mermaid must render at document top level.`;

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
   5-yr revenue projection, IRR, sensitivity headline. Embed at least
   two of the Finance charts verbatim (recommended: the §3.1 CAPEX pie
   and the §8.1 cumulative-FCF line so the board sees the money-in
   and the break-even in one glance). Copy the entire fenced
   \`\`\`mermaid …\`\`\` block; do not re-authoring the values.

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
  semiconductor?: DocumentArtifact;
  procurement?: DocumentArtifact;
  ip?: DocumentArtifact;
  finance?: DocumentArtifact;
}

/**
 * Whichever of `procedure` or `semiconductor` ran for this session —
 * these are mutually exclusive per the industry classifier. Returned
 * as a `{ artifact, label }` pair so downstream prompts can splice
 * either one into the same slot with a consistent header.
 */
function processArtifact(up: UpstreamArtifacts): {
  artifact: DocumentArtifact | undefined;
  label: string;
} {
  if (up.semiconductor?.content) {
    return { artifact: up.semiconductor, label: "SEMICONDUCTOR MANUFACTURING" };
  }
  return { artifact: up.procedure, label: "PROCEDURE & ROUTE OF SYNTHESIS" };
}

function upstreamBlock(kind: DocumentKind, up: UpstreamArtifacts): string {
  const missing = (name: string) =>
    `(${name} not available in this run — proceed as best you can and flag gaps in Open Questions.)`;
  switch (kind) {
    case "market":
    case "procedure":
    case "semiconductor":
      return ""; // all three operate directly on Refined Concept
    case "procurement": {
      const { artifact, label } = processArtifact(up);
      return `--- ${label} (source of truth for equipment + raw materials) ---
${artifact?.content || missing(label)}

--- MARKET ANALYSIS (source of truth for target scale + geography) ---
${up.market?.content || missing("Market Analysis")}`;
    }
    case "ip": {
      const { artifact, label } = processArtifact(up);
      return `--- ${label} (source of truth for route, intermediates, process to search) ---
${artifact?.content || missing(label)}

--- MARKET ANALYSIS (source of truth for target jurisdictions + segments) ---
${up.market?.content || missing("Market Analysis")}`;
    }
    case "finance":
      return `--- PROCUREMENT PLAN (source of truth for CAPEX + raw material costs) ---
${up.procurement?.content || missing("Procurement")}

--- MARKET ANALYSIS (source of truth for demand, pricing, geography) ---
${up.market?.content || missing("Market Analysis")}`;
    case "presentation": {
      // Splice whichever process artifact ran; if neither ran, note it.
      const processBlock = up.semiconductor?.content
        ? `--- SEMICONDUCTOR MANUFACTURING ---\n${up.semiconductor.content}`
        : up.procedure?.content
          ? `--- PROCEDURE & ROUTE OF SYNTHESIS ---\n${up.procedure.content}`
          : `--- PROCESS ARTIFACT ---\n${missing("Procedure / Semiconductor")}`;
      return `--- MARKET ANALYSIS ---
${up.market?.content || missing("Market Analysis")}

${processBlock}

--- PROCUREMENT PLAN ---
${up.procurement?.content || missing("Procurement")}

--- INTELLECTUAL PROPERTY ANALYSIS ---
${up.ip?.content || missing("IP Analysis")}

--- FINANCIAL PROJECTION ---
${up.finance?.content || missing("Finance")}`;
    }
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
