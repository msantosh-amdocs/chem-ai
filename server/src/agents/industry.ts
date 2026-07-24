/**
 * Industry classification for a locked session.
 *
 * The analyst's `refinedConceptPrompt` mandates a §2 Product Definition
 * block that declares `Industry: chemical | pharmaceutical |
 * semiconductor`. That structured line is our primary signal — if it
 * says "semiconductor" (or matches the pharma / chemical keywords),
 * we trust it verbatim. If the analyst's output is malformed or omits
 * the tag (older concepts, edge cases), we fall back to a keyword
 * scan across the whole document.
 *
 * The classifier is deterministic and side-effect-free so it can be
 * unit-tested without an LLM. Its output feeds `runGeneration` to pick
 * between the Procedure and Semiconductor Manufacturing departments in
 * Wave 1 of the pipeline.
 *
 * Split out from `orchestrator.ts` so tests can import it without
 * pulling in the entire server orchestration surface.
 */

import type { SessionIndustry } from "../types.js";

const SEMI_HITS = [
  "semiconductor",
  "wafer",
  "silicon wafer",
  "foundry",
  "photolithograph",
  "photomask",
  "cmos ",
  "finfet",
  "gate-all-around",
  "gaa transistor",
  "euv",
  "duv lithograph",
  "hbm",
  "chiplet",
  "cowos",
  "fowlp",
  "gan-on-si",
  "silicon carbide",
  "mems",
  "power semiconductor",
  "analog ic",
  "logic ic",
  "sram",
  "dram",
  "wafer-level packaging",
  "die stacking",
  "tsmc",
  "asml",
  "cleanroom class",
];

const PHARMA_HITS = [
  " api ",
  "active pharmaceutical ingredient",
  "cgmp",
  "gmp compliance",
  "us fda",
  "dcgi",
  "cdsco",
  "drug master file",
  "orange book",
  " anda ",
  " nda ",
  "bulk drug",
  "formulation",
  "excipient",
  "sterile injectable",
];

const CHEM_HITS = [
  "agrochemical",
  "pesticide",
  "specialty chemical",
  "bulk chemical",
  "petrochemical",
  "polymer resin",
  "distillation column",
  "reaction scheme",
  "route of synthesis",
  "solvent recovery",
];

/**
 * See file-level docstring. Returns `"other"` only when literally no
 * signal fires — the orchestrator treats `"other"` as `"chemical"`
 * (runs Procedure) so nothing silently disappears.
 */
export function classifyIndustryFromConcept(text: string): SessionIndustry {
  if (!text) return "other";

  // 1. Structured `Industry:` line — tolerate bullet / bold markers.
  const structured = text.match(
    /^\s*(?:[-*]\s*)?(?:\*\*)?industry(?:\*\*)?\s*[:\-]\s*([^\n]+)$/im,
  );
  if (structured?.[1]) {
    const decl = structured[1].toLowerCase();
    if (/\bsemi[-\s]?conductor\b|\bsemi\b/.test(decl)) return "semiconductor";
    if (/\bpharma(?:ceutical)?\b|\bapi\b|\bdrug\b/.test(decl)) return "pharmaceutical";
    if (/\bchemical\b|\bagrochem\b|\bspecialty chem/.test(decl)) return "chemical";
  }

  // 2. Keyword scan.
  const t = text.toLowerCase();
  const semiHits = SEMI_HITS.filter((k) => t.includes(k)).length;
  const pharmaHits = PHARMA_HITS.filter((k) => t.includes(k)).length;
  const chemHits = CHEM_HITS.filter((k) => t.includes(k)).length;

  // Prefer semiconductor when it fires at least TWO distinct hits AND
  // dominates the other two — a passing mention of "silicon" in a
  // chemical concept must NOT hijack the run.
  if (semiHits >= 2 && semiHits >= pharmaHits && semiHits >= chemHits) {
    return "semiconductor";
  }
  if (pharmaHits > 0 && pharmaHits >= chemHits) return "pharmaceutical";
  if (chemHits > 0) return "chemical";

  return "other";
}
