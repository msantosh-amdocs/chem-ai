/**
 * How it works — an in-app documentation page.
 *
 * Three hand-rolled inline-SVG flowcharts explain:
 *   1. The Refinement Loop (Analyst asks clarifying Qs until completeness >= 85)
 *   2. The 4-Wave Pipeline DAG (six departments running in dependency order)
 *   3. The Debate Loop inside each department (round-based agreement to threshold)
 *
 * SVGs are inline (no external deps like Mermaid) so the doc page ships as
 * plain React + Tailwind, renders instantly, and is easy to keep in sync with
 * server/src/agents/orchestrator.ts and prompts.ts.
 */

// ---------- shared SVG helpers ---------------------------------------------

const COLORS = {
  stroke: "#334155", // slate-700
  fadedStroke: "#94a3b8", // slate-400
  box: "#f8fafc", // slate-50
  boxBorder: "#cbd5e1", // slate-300
  accentBoxFill: "#eef2ff", // indigo-50
  accentBoxBorder: "#818cf8", // indigo-400
  accentBoxText: "#3730a3", // indigo-800
  successFill: "#ecfdf5", // emerald-50
  successBorder: "#34d399", // emerald-400
  successText: "#065f46", // emerald-800
  warningFill: "#fef3c7", // amber-100
  warningBorder: "#f59e0b", // amber-500
  warningText: "#78350f", // amber-900
  gridText: "#475569", // slate-600
  waveLabel: "#7c3aed", // violet-600
} as const;

function Box({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  fill = COLORS.box,
  border = COLORS.boxBorder,
  textColor = COLORS.gridText,
  rx = 8,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  fill?: string;
  border?: string;
  textColor?: string;
  rx?: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        fill={fill}
        stroke={border}
        strokeWidth={1.5}
      />
      <text
        x={x + w / 2}
        y={subtitle ? y + h / 2 - 6 : y + h / 2 + 4}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill={textColor}
        fontFamily="ui-sans-serif, system-ui"
      >
        {title}
      </text>
      {subtitle && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          fontSize={10.5}
          fill={textColor}
          fontFamily="ui-sans-serif, system-ui"
          opacity={0.8}
        >
          {subtitle}
        </text>
      )}
    </g>
  );
}

function Diamond({
  cx,
  cy,
  w,
  h,
  title,
  subtitle,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
}) {
  const pts = [
    [cx, cy - h / 2],
    [cx + w / 2, cy],
    [cx, cy + h / 2],
    [cx - w / 2, cy],
  ]
    .map((p) => p.join(","))
    .join(" ");
  return (
    <g>
      <polygon
        points={pts}
        fill={COLORS.warningFill}
        stroke={COLORS.warningBorder}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={subtitle ? cy - 2 : cy + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={COLORS.warningText}
        fontFamily="ui-sans-serif, system-ui"
      >
        {title}
      </text>
      {subtitle && (
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize={10}
          fill={COLORS.warningText}
          fontFamily="ui-sans-serif, system-ui"
          opacity={0.85}
        >
          {subtitle}
        </text>
      )}
    </g>
  );
}

/**
 * Straight arrow between two points.  Uses an SVG marker for the arrowhead.
 */
function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
  labelOffset = -6,
  color = COLORS.stroke,
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  labelOffset?: number;
  color?: string;
  dashed?: boolean;
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "5,4" : undefined}
        markerEnd="url(#arrow)"
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 + labelOffset}
          textAnchor="middle"
          fontSize={11}
          fill={color}
          fontFamily="ui-sans-serif, system-ui"
          fontWeight={500}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Orthogonal (right-angled) arrow — starts at (x1,y1), goes horizontally to xMid,
 * then vertically to y2, then horizontally to x2.  Used when a diagonal would
 * cross other shapes.
 */
function ElbowArrow({
  x1,
  y1,
  x2,
  y2,
  turnY,
  label,
  color = COLORS.stroke,
  dashed = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  turnY?: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}) {
  const midY = turnY ?? (y1 + y2) / 2;
  const path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "5,4" : undefined}
        markerEnd="url(#arrow)"
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={midY - 6}
          textAnchor="middle"
          fontSize={11}
          fill={color}
          fontFamily="ui-sans-serif, system-ui"
          fontWeight={500}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ArrowMarker() {
  return (
    <defs>
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.stroke} />
      </marker>
    </defs>
  );
}

// ---------- Diagram 1: Refinement Loop --------------------------------------

function RefinementFlow() {
  return (
    <figure className="card p-4 overflow-x-auto">
      <svg
        viewBox="0 0 820 320"
        role="img"
        aria-labelledby="refine-flow-title refine-flow-desc"
        className="w-full h-auto"
      >
        <title id="refine-flow-title">Refinement loop diagram</title>
        <desc id="refine-flow-desc">
          The analyst reads the raw idea and any uploaded documents, scores its
          completeness 0-100, asks clarifying questions when below 85, and
          hands off a refined concept once complete.
        </desc>
        <ArrowMarker />

        <Box x={20} y={135} w={140} h={60} title="Raw idea" subtitle="+ optional PDFs" />

        <Box
          x={220}
          y={135}
          w={160}
          h={60}
          title="Analyst"
          subtitle="reads · interprets · scores"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        <Diamond cx={520} cy={165} w={200} h={80} title="Completeness ≥ 85%?" subtitle="8 dimensions checked" />

        <Box
          x={680}
          y={135}
          w={130}
          h={60}
          title="Refined Concept"
          subtitle="handed to pipeline"
          fill={COLORS.successFill}
          border={COLORS.successBorder}
          textColor={COLORS.successText}
        />

        <Box
          x={370}
          y={30}
          w={200}
          h={55}
          title="You: answer 3–6 questions"
          subtitle="skip low-importance ones"
        />

        <Box
          x={370}
          y={245}
          w={200}
          h={55}
          title="Analyst re-scores"
          subtitle="new round with your answers"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Idea -> Analyst */}
        <Arrow x1={160} y1={165} x2={220} y2={165} />
        {/* Analyst -> Diamond */}
        <Arrow x1={380} y1={165} x2={420} y2={165} />
        {/* Diamond -> Refined Concept (yes) */}
        <Arrow x1={620} y1={165} x2={680} y2={165} label="yes" labelOffset={-8} />
        {/* Diamond -> Ask questions (no, up) */}
        <ElbowArrow x1={520} y1={125} x2={470} y2={85} turnY={95} label="no · needs clarification" color={COLORS.warningBorder} />
        {/* Ask questions -> Re-score (right/down loop) */}
        <path
          d="M 570 57 L 720 57 L 720 272 L 570 272"
          fill="none"
          stroke={COLORS.warningBorder}
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
        {/* Re-score -> Analyst (loop closes) */}
        <path
          d="M 370 272 L 250 272 L 250 195"
          fill="none"
          stroke={COLORS.warningBorder}
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
      </svg>
      <figcaption className="text-xs text-slate-500 mt-2 text-center">
        Refinement loop — the analyst iterates on your idea until the eight-dimension
        completeness score reaches 85, then hands the concept downstream.
      </figcaption>
    </figure>
  );
}

// ---------- Diagram 2: 4-Wave Pipeline DAG ----------------------------------

function PipelineDAG() {
  return (
    <figure className="card p-4 overflow-x-auto">
      <svg
        viewBox="0 0 940 540"
        role="img"
        aria-labelledby="pipeline-dag-title pipeline-dag-desc"
        className="w-full h-auto"
      >
        <title id="pipeline-dag-title">4-wave pipeline DAG</title>
        <desc id="pipeline-dag-desc">
          The refined concept feeds four sequential waves of departments. Wave 1
          runs Market Analysis and Procedure in parallel. Wave 2 runs Procurement
          and IP in parallel once Procedure is done. Wave 3 runs Finance. Wave 4
          runs Presentation, which aggregates everything.
        </desc>
        <ArrowMarker />

        {/* wave labels */}
        {[
          { y: 70, label: "Wave 1 · parallel" },
          { y: 200, label: "Wave 2 · parallel" },
          { y: 330, label: "Wave 3" },
          { y: 445, label: "Wave 4" },
        ].map((w) => (
          <text
            key={w.label}
            x={30}
            y={w.y + 5}
            fontSize={11}
            fontWeight={600}
            fill={COLORS.waveLabel}
            fontFamily="ui-sans-serif, system-ui"
            letterSpacing={0.5}
          >
            {w.label.toUpperCase()}
          </text>
        ))}

        {/* Refined Concept (top center) */}
        <Box
          x={370}
          y={10}
          w={200}
          h={45}
          title="Refined Concept"
          subtitle="from Analyst"
          fill={COLORS.successFill}
          border={COLORS.successBorder}
          textColor={COLORS.successText}
        />

        {/* Wave 1 */}
        <Box
          x={210}
          y={90}
          w={220}
          h={80}
          title="Market Analysis"
          subtitle="TAM · SAM · SOM · geos · verdict"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />
        <Box
          x={510}
          y={90}
          w={220}
          h={80}
          title="Procedure"
          subtitle="route · scheme · balance · lab + industrial · EHS"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Wave 2 */}
        <Box
          x={210}
          y={220}
          w={220}
          h={80}
          title="Procurement"
          subtitle="hardware BOM + raw-material BOM + vendors"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />
        <Box
          x={510}
          y={220}
          w={220}
          h={80}
          title="Intellectual Property"
          subtitle="patent landscape · FTO · design-around"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Wave 3 */}
        <Box
          x={360}
          y={350}
          w={220}
          h={80}
          title="Finance"
          subtitle="CAPEX · 5-yr P&L · IRR · sensitivity"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Wave 4 */}
        <Box
          x={360}
          y={465}
          w={220}
          h={65}
          title="Presentation"
          subtitle="executive summary + full report"
          fill={COLORS.successFill}
          border={COLORS.successBorder}
          textColor={COLORS.successText}
        />

        {/* Refined Concept -> Wave 1 */}
        <ElbowArrow x1={470} y1={55} x2={320} y2={90} turnY={78} />
        <ElbowArrow x1={470} y1={55} x2={620} y2={90} turnY={78} />

        {/* Procedure -> Wave 2 (both Procurement and IP need it) */}
        <ElbowArrow x1={620} y1={170} x2={320} y2={220} turnY={200} />
        <ElbowArrow x1={620} y1={170} x2={620} y2={220} />

        {/* Market -> Procurement (needs market scale) */}
        <ElbowArrow x1={320} y1={170} x2={320} y2={220} />

        {/* Wave 2 -> Finance */}
        <ElbowArrow x1={320} y1={300} x2={470} y2={350} turnY={330} />

        {/* Market -> Finance (dashed: uses market outputs indirectly via projections) */}
        <path
          d="M 250 170 L 250 340 L 400 340 L 400 350"
          fill="none"
          stroke={COLORS.fadedStroke}
          strokeWidth={1.5}
          strokeDasharray="5,4"
          markerEnd="url(#arrow)"
        />

        {/* Finance -> Presentation */}
        <ElbowArrow x1={470} y1={430} x2={470} y2={465} />

        {/* Presentation aggregates everything (dashed rollup from waves 1-2) */}
        <path
          d="M 620 300 L 700 300 L 700 495 L 580 495"
          fill="none"
          stroke={COLORS.fadedStroke}
          strokeWidth={1.5}
          strokeDasharray="5,4"
          markerEnd="url(#arrow)"
        />
      </svg>
      <figcaption className="text-xs text-slate-500 mt-2 text-center">
        Pipeline DAG — solid arrows are hard dependencies; dashed arrows are
        soft inputs the Presentation and Finance departments read as context.
      </figcaption>
    </figure>
  );
}

// ---------- Diagram 3: Debate Loop ------------------------------------------

function DebateLoop() {
  return (
    <figure className="card p-4 overflow-x-auto">
      <svg
        viewBox="0 0 900 340"
        role="img"
        aria-labelledby="debate-title debate-desc"
        className="w-full h-auto"
      >
        <title id="debate-title">Debate loop inside a department</title>
        <desc id="debate-desc">
          In round 1 every member drafts independently. From round 2 onward every
          member critiques the others and revises their own draft. Every member
          self-scores their agreement. The loop stops when the minimum score
          reaches the threshold or the round cap is hit.
        </desc>
        <ArrowMarker />

        {/* Round 1 */}
        <Box
          x={20}
          y={130}
          w={180}
          h={80}
          title="Round 1"
          subtitle="each member drafts independently"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Round N (loop) */}
        <Box
          x={260}
          y={130}
          w={200}
          h={80}
          title="Round N (N ≥ 2)"
          subtitle="critique peers · revise own draft"
          fill={COLORS.accentBoxFill}
          border={COLORS.accentBoxBorder}
          textColor={COLORS.accentBoxText}
        />

        {/* Self-scoring */}
        <Box
          x={510}
          y={130}
          w={170}
          h={80}
          title="Self-score"
          subtitle="every member rates agreement 0-100%"
        />

        {/* Threshold diamond */}
        <Diamond cx={790} cy={170} w={200} h={90} title="min score ≥ threshold" subtitle="(default 95%) OR max rounds" />

        {/* Publish */}
        <Box
          x={330}
          y={280}
          w={280}
          h={40}
          title="Publish lead's final draft as artifact"
          fill={COLORS.successFill}
          border={COLORS.successBorder}
          textColor={COLORS.successText}
        />

        {/* Arrows */}
        <Arrow x1={200} y1={170} x2={260} y2={170} />
        <Arrow x1={460} y1={170} x2={510} y2={170} />
        <Arrow x1={680} y1={170} x2={694} y2={170} />

        {/* Threshold yes -> Publish */}
        <path
          d="M 790 215 L 790 260 L 470 260 L 470 280"
          fill="none"
          stroke={COLORS.successBorder}
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
        <text x={620} y={252} fontSize={11} fontWeight={500} fill={COLORS.successText} fontFamily="ui-sans-serif, system-ui">
          yes → publish
        </text>

        {/* Threshold no -> back to Round N (loop) */}
        <path
          d="M 790 125 L 790 60 L 360 60 L 360 130"
          fill="none"
          stroke={COLORS.warningBorder}
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
        <text x={580} y={50} fontSize={11} fontWeight={500} fill={COLORS.warningText} fontFamily="ui-sans-serif, system-ui">
          no · another round
        </text>
      </svg>
      <figcaption className="text-xs text-slate-500 mt-2 text-center">
        Debate loop — 2-5 specialists per department iterate to a self-reported
        consensus. The threshold (default 95%) and max rounds (default 4) are
        editable under Help → My Team.
      </figcaption>
    </figure>
  );
}

// ---------- Page ------------------------------------------------------------

export function HowItWorksPage() {
  return (
    <div className="max-w-[1000px] mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl text-slate-900">How it works</h1>
        <p className="text-slate-600 mt-1">
          Chem AI turns a raw factory / expansion idea into a full research
          pack in five stages. Everything runs locally against the Cursor SDK —
          no data leaves your machine except the LLM calls themselves.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="font-display text-xl text-slate-900 mb-3">The five stages at a glance</h2>
        <ol className="list-decimal ml-5 space-y-1.5 text-sm text-slate-700">
          <li>
            <span className="font-semibold">Submit</span> — you paste a rough
            idea and (optionally) upload PDF/Word source documents on the{" "}
            <em>New Idea</em> tab.
          </li>
          <li>
            <span className="font-semibold">Refine</span> — the analyst (Aarav
            by default) reads the idea, scores its completeness on 8 dimensions,
            and asks 3-6 targeted clarifying questions per round until the score
            reaches <span className="font-mono">≥ 85</span>.
          </li>
          <li>
            <span className="font-semibold">Pipeline</span> — six specialist
            departments run in a 4-wave DAG: Market Analysis, Procedure,
            Procurement, Intellectual Property, Finance, and Presentation.
          </li>
          <li>
            <span className="font-semibold">Debate</span> — inside each
            department, 2-5 specialists produce competing drafts, critique
            each other, and revise until self-scored agreement hits the
            threshold (default 95%) or the round cap (default 4) is reached.
          </li>
          <li>
            <span className="font-semibold">Pack</span> — the Presentation
            department merges every artifact into a single Markdown pack you
            can download from the <em>Documents</em> tab.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="font-display text-2xl text-slate-900">
          Stage 2 · Refinement loop
        </h2>
        <p className="text-slate-600 my-3">
          The Analyst is the only agent that talks to you. It grades the idea on
          eight dimensions — <em>product, industry, scale, geography, budget,
          timeline, regulatory posture, and constraints/risks</em> — and loops
          until the composite score is high enough to hand off. You can skip
          low-importance questions; the analyst will re-score.
        </p>
        <RefinementFlow />
      </section>

      <section>
        <h2 className="font-display text-2xl text-slate-900">
          Stage 3 · The 4-wave pipeline
        </h2>
        <p className="text-slate-600 my-3">
          Departments run as a directed acyclic graph: waves run in parallel,
          waves that need earlier outputs run afterwards. The DAG lives in{" "}
          <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5">
            server/src/agents/orchestrator.ts
          </code>{" "}
          and mirrors the layout below.
        </p>
        <PipelineDAG />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {DEPARTMENTS.map((d) => (
            <div key={d.name} className="card p-4">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-semibold text-slate-900">{d.name}</span>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  wave {d.wave} · {d.size}
                </span>
              </div>
              <p className="text-xs text-slate-600 italic mb-2">{d.produces}</p>
              <p className="text-xs text-slate-700">{d.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-slate-900">
          Stage 4 · How each department debates
        </h2>
        <p className="text-slate-600 my-3">
          Inside every department, specialists draft in round 1, then
          critique-and-revise for as many rounds as needed. Each member
          self-scores how well their revised draft agrees with the collective.
          When the <em>minimum</em> score across the team meets the threshold,
          the lead's final revision becomes the department's published
          artifact.
        </p>
        <DebateLoop />
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FactCard
            title="Threshold"
            value="95%"
            body="Self-scored agreement all members must reach. Editable on My Team."
          />
          <FactCard
            title="Max rounds"
            value="4"
            body="Hard cap on debate iterations. If reached, the current lead draft is published."
          />
          <FactCard
            title="Team size"
            value="2 – 4 (Procedure 5)"
            body="Every department has 2 to 4 specialists; Procedure has one extra slot for the organic-chemistry expert."
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-slate-900">Under the hood</h2>
        <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-6 mt-3">
          <div>
            <h3 className="font-semibold text-slate-900 mb-1.5">Runtime</h3>
            <ul className="list-disc ml-5 text-sm text-slate-700 space-y-1">
              <li>
                <span className="font-mono">web</span> — Vite + React 18 +
                Zustand v5 on <span className="font-mono">http://localhost:5277</span>
              </li>
              <li>
                <span className="font-mono">server</span> — Node 22 + Express +
                Cursor SDK on <span className="font-mono">http://localhost:5278</span>
              </li>
              <li>
                Live progress via Server-Sent Events (<span className="font-mono">/api/session/:id/events</span>)
              </li>
              <li>
                LLM calls flow only from the server to Cursor via{" "}
                <span className="font-mono">CURSOR_API_KEY</span>.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1.5">Where state lives</h3>
            <ul className="list-disc ml-5 text-sm text-slate-700 space-y-1">
              <li>
                Specialist rosters and models →{" "}
                <span className="font-mono">localStorage.mr.specialists.v1</span>
              </li>
              <li>
                Threshold and max rounds →{" "}
                <span className="font-mono">localStorage.mr.settings.v1</span>
              </li>
              <li>
                Sessions (idea → refinement → artifacts) →{" "}
                <span className="font-mono">.data/sessions/*.json</span> on the
                server host
              </li>
              <li>
                Nothing is uploaded off-machine except the prompts sent to Cursor.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-slate-900">Cheat sheet</h2>
        <div className="card p-5 mt-3 text-sm text-slate-700 space-y-2">
          <p>
            <span className="font-semibold text-slate-900">Stuck at Refine?</span>{" "}
            Answer only <em>high</em>-importance questions and skip the rest.
            The score usually clears 85 after one honest pass.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              Pipeline stopped with a "minimum members" error?
            </span>{" "}
            A department has fewer members than its minimum. Add one on the{" "}
            <em>My Team</em> tab and click <em>Regenerate</em>.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              Want fewer debate rounds?
            </span>{" "}
            Drop the threshold to 85-90% on <em>My Team</em>. Debate ends
            faster but with slightly less internal peer review.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              Want to re-run one department?
            </span>{" "}
            Open the session from the <em>Dashboard</em>, then click <em>Regenerate</em>{" "}
            on the department card in <em>Pipeline</em>.
          </p>
        </div>
      </section>
    </div>
  );
}

// ---------- department reference cards --------------------------------------

const DEPARTMENTS: Array<{
  name: string;
  wave: number;
  size: string;
  produces: string;
  detail: string;
}> = [
  {
    name: "Market Analysis",
    wave: 1,
    size: "3 specialists",
    produces: "B2B Market Analysis",
    detail:
      "TAM / SAM / SOM sizing, top-5 geographies, buyer segments, competitor landscape, pricing reference, and a Go / Conditional / Not-Recommended verdict.",
  },
  {
    name: "Procedure",
    wave: 1,
    size: "5 specialists",
    produces: "Procedure & Route of Synthesis",
    detail:
      "Chosen route, reaction scheme (Mermaid), step-wise conditions (T / P / moles / yield), material balance, lab + industrial configuration, hazards + EHS register, waste + effluent plan. Includes a dedicated organic-chemistry expert (Dr. Nikhil).",
  },
  {
    name: "Procurement",
    wave: 2,
    size: "3 specialists",
    produces: "Procurement Plan",
    detail:
      "Equipment BOM and raw-material BOM (India + international vendors), landed-cost analysis, single-source flags, and per-item lead-time and MOQ notes.",
  },
  {
    name: "Intellectual Property",
    wave: 2,
    size: "2 specialists",
    produces: "IP Analysis",
    detail:
      "Product / process / intermediate patent landscape (India + US + EU + WIPO), FTO verdict, design-around suggestions, and an own filing strategy.",
  },
  {
    name: "Finance",
    wave: 3,
    size: "3 specialists",
    produces: "Financial Projection",
    detail:
      "CAPEX build-up, 5-year P&L, cash-flow, per-unit manufacturing cost, sales projection, IRR, and a sensitivity analysis (INR primary + USD reference).",
  },
  {
    name: "Presentation",
    wave: 4,
    size: "2 specialists",
    produces: "Presentation Package",
    detail:
      "Board-ready executive summary + full detailed report + an appendix with consolidated Open Questions from every upstream department.",
  },
];

function FactCard({
  title,
  value,
  body,
}: {
  title: string;
  value: string;
  body: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {title}
      </div>
      <div className="font-display text-2xl text-slate-900 mt-0.5">{value}</div>
      <div className="text-xs text-slate-600 mt-1">{body}</div>
    </div>
  );
}
