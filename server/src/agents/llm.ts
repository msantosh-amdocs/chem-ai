import {
  Agent,
  CursorAgentError,
  type ModelSelection,
  type TokenUsage,
} from "@cursor/sdk";
import { nanoid } from "nanoid";
import { config } from "../env.js";
import { approxTokens, createLogger, errorFields, payloadField } from "../logger.js";

const log = createLogger("llm");

export function assertKey(): string {
  const k = process.env.CURSOR_API_KEY;
  if (!k) {
    throw new Error(
      "CURSOR_API_KEY is not set. Get one at https://cursor.com/dashboard/integrations and set it in .env",
    );
  }
  return k;
}

/**
 * Who/what a call belongs to. Purely for logs and cost attribution — it
 * never reaches the model. Every field lands on both the request and the
 * response line so a single call can be followed end-to-end by `callId`.
 */
export interface PromptContext {
  /** Coarse label for the call site, e.g. `analyst.refine`, `stage.round`. */
  purpose: string;
  sessionId?: string;
  /** Department kind for debate calls. */
  stage?: string;
  /** Debate round number for debate calls. */
  round?: number;
  /** Specialist name, so debate logs read like a transcript. */
  speaker?: string;
}

export interface PromptRequest {
  model: string;
  /** The user-side payload — the bulk of the request. */
  prompt: string;
  /** Optional system hint, prepended to `prompt` before sending. */
  system?: string;
  /** Model parameters (temperature, etc.) as configured on the specialist. */
  params?: Record<string, string>;
  context?: PromptContext;
}

export interface PromptResult {
  /** The trimmed text response from the model. Empty string on missing result. */
  text: string;
  /**
   * Per-call token usage as reported by the Cursor SDK. Not every backend
   * reports usage — callers must handle `undefined` gracefully (typically
   * by pricing that call at $0 and marking the session's `usageComplete`
   * flag `false`).
   */
  usage?: TokenUsage;
  /** The model id we actually invoked (for downstream cost attribution). */
  model: string;
  /** Correlation id shared by this call's request and response log lines. */
  callId: string;
  /** Wall-clock time spent inside the SDK call. */
  durationMs: number;
}

/**
 * The SDK takes a single string, so the system hint and the user payload
 * are concatenated with this separator. Logs record the two halves
 * separately (`system` / `user`) — join them with this to reconstruct the
 * exact bytes that went over the wire.
 */
const SYSTEM_SEPARATOR = "\n\n---\n\n";

function composePrompt(prompt: string, systemHint?: string): string {
  return systemHint ? `${systemHint}${SYSTEM_SEPARATOR}${prompt}` : prompt;
}

export async function promptModel(req: PromptRequest): Promise<PromptResult> {
  const { model, prompt, system, params, context } = req;
  const apiKey = assertKey();
  const selection: ModelSelection = { id: model };
  if (params && Object.keys(params).length) {
    selection.params = Object.entries(params).map(([id, value]) => ({ id, value }));
  }

  const callId = nanoid(8);
  const wire = composePrompt(prompt, system);
  const call = log.child({
    callId,
    model,
    purpose: context?.purpose,
    sessionId: context?.sessionId,
    stage: context?.stage,
    round: context?.round,
    speaker: context?.speaker,
  });

  call.info("LLM request", {
    params: params && Object.keys(params).length ? params : undefined,
    systemChars: system?.length ?? 0,
    userChars: prompt.length,
    totalChars: wire.length,
    approxTokens: approxTokens(wire.length),
    system: system ? payloadField(system, config.log.prompts) : undefined,
    user: payloadField(prompt, config.log.prompts),
  });

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof Agent.prompt>>;
  try {
    result = await Agent.prompt(wire, {
      apiKey,
      model: selection,
      local: { cwd: process.cwd(), settingSources: [] },
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof CursorAgentError) {
      call.error("LLM call failed", {
        durationMs,
        retryable: err.isRetryable,
        ...errorFields(err),
      });
      throw new Error(`Cursor SDK: ${err.message} (retryable=${err.isRetryable})`);
    }
    call.error("LLM call failed", { durationMs, ...errorFields(err) });
    throw err;
  }

  const durationMs = Date.now() - startedAt;
  if (result.status === "error") {
    call.error("LLM run returned an error status", { agentRunId: result.id, durationMs });
    throw new Error(`agent run failed: ${result.id}`);
  }

  const text = (result.result ?? "").toString();
  const usage = result.usage;
  call.info("LLM response", {
    durationMs,
    responseChars: text.length,
    // Absent usage means we cannot price this call — the session's cost
    // total gets flagged incomplete downstream.
    usageReported: !!usage,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    cacheReadTokens: usage?.cacheReadTokens,
    cacheWriteTokens: usage?.cacheWriteTokens,
    reasoningTokens: usage?.reasoningTokens,
    totalTokens: usage?.totalTokens,
    response: payloadField(text, config.log.responses, "LOG_RESPONSES"),
  });

  return { text, usage, model, callId, durationMs };
}
