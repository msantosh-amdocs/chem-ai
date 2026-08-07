import "./env.js";

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { config } from "./env.js";
import { createLogger, errorFields } from "./logger.js";
import { router as sessionRouter } from "./routes/session.js";
import { router as historyRouter } from "./routes/history.js";
import { router as modelsRouter } from "./routes/models.js";
import { sweepInterruptedSessions } from "./agents/orchestrator.js";

const log = createLogger("http");
const boot = createLogger("boot");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// One line per completed request so we can trace what the UI is doing.
// Health checks poll constantly and would drown everything else, so they
// only show up at debug level.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const isHealth = req.path === "/api/health";
  // Routing rewrites `req.url` (and therefore `req.path`) as it descends
  // into mounted routers, so snapshot the request line before that
  // happens — otherwise `/api/history` logs as `/history`.
  const line = `${req.method} ${req.originalUrl}`;
  const startedAt = Date.now();
  // "close" rather than "finish" so aborted requests (and SSE streams the
  // browser drops) still produce exactly one line.
  res.on("close", () => {
    const level = isHealth ? "debug" : res.statusCode >= 500 ? "error" : "info";
    log[level](line, {
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
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

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "unknown error";
  log.error(`Request failed: ${req.method} ${req.originalUrl}`, errorFields(err));
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
    boot.info("Interrupted-session sweep finished", {
      scanned,
      recovered: swept.length,
    });
  } catch (err) {
    boot.warn("Interrupted-session sweep failed — continuing startup", errorFields(err));
  }

  const server = app.listen(config.port, () => {
    boot.info(`Chem AI API listening on http://localhost:${config.port}`, {
      port: config.port,
      logLevel: config.log.level,
      logFormat: config.log.format,
      logPrompts: config.log.prompts,
      logResponses: config.log.responses,
      cursorKeyPresent: !!process.env.CURSOR_API_KEY,
    });
    if (!process.env.CURSOR_API_KEY) {
      boot.warn("CURSOR_API_KEY not set — LLM calls will fail. Add it to .env.");
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      boot.error(`Port ${config.port} is already in use — is another Chem AI already running?`, {
        port: config.port,
      });
    } else {
      boot.error("HTTP server error", errorFields(err));
    }
    process.exit(1);
  });
}

// A rejected promise nobody awaited (a detached pipeline task, an SDK
// callback) would otherwise print a bare stack with no context.
process.on("unhandledRejection", (reason) => {
  boot.error("Unhandled promise rejection", errorFields(reason));
});
process.on("uncaughtException", (err) => {
  boot.error("Uncaught exception — shutting down", errorFields(err));
  process.exit(1);
});

bootstrap();
