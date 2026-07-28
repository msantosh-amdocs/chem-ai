import "./env.js";

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { config } from "./env.js";
import { router as sessionRouter } from "./routes/session.js";
import { router as historyRouter } from "./routes/history.js";
import { router as modelsRouter } from "./routes/models.js";
import { sweepInterruptedSessions } from "./agents/orchestrator.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Concise request log so we can trace what the UI is doing.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    console.log(`→ ${req.method} ${req.path}`);
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    cursorSdk: !!process.env.CURSOR_API_KEY,
    version: "0.1.0",
  });
});

app.use("/api", sessionRouter);
app.use("/api", historyRouter);
app.use("/api", modelsRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "unknown error";
  console.error(err);
  res.status(400).json({ error: msg });
});

// Boot-time recovery: if the previous process died mid-run, any
// session persisted with status "generating" is a zombie. Mark its
// in-flight artifact as errored so the client's Retry button appears,
// then start accepting traffic. See `sweepInterruptedSessions` for
// full semantics.
async function bootstrap(): Promise<void> {
  try {
    const { scanned, swept } = await sweepInterruptedSessions();
    if (swept.length > 0) {
      console.log(
        `↻ Interrupted-session sweep: recovered ${swept.length}/${scanned} session(s).`,
      );
      for (const s of swept) {
        const stages = s.kinds.length > 0 ? s.kinds.join(", ") : "(no in-flight stage)";
        console.log(`   • ${s.title} [${s.id}] — stages: ${stages}`);
      }
    }
  } catch (err) {
    console.warn("↻ Interrupted-session sweep failed (continuing):", err);
  }

  app.listen(config.port, () => {
    console.log(`Chem AI API listening on http://localhost:${config.port}`);
    if (!process.env.CURSOR_API_KEY) {
      console.warn("⚠  CURSOR_API_KEY not set — LLM calls will fail. Add it to .env.");
    }
  });
}

bootstrap();
