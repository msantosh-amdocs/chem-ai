import {
  Agent,
  CursorAgentError,
  type ModelSelection,
  type TokenUsage,
} from "@cursor/sdk";

export function assertKey(): string {
  const k = process.env.CURSOR_API_KEY;
  if (!k) {
    throw new Error(
      "CURSOR_API_KEY is not set. Get one at https://cursor.com/dashboard/integrations and set it in .env",
    );
  }
  return k;
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
}

export async function promptModel(
  modelId: string,
  prompt: string,
  systemHint?: string,
  params?: Record<string, string>,
): Promise<PromptResult> {
  const apiKey = assertKey();
  const selection: ModelSelection = { id: modelId };
  if (params && Object.keys(params).length) {
    selection.params = Object.entries(params).map(([id, value]) => ({ id, value }));
  }
  try {
    const result = await Agent.prompt(
      systemHint ? `${systemHint}\n\n---\n\n${prompt}` : prompt,
      {
        apiKey,
        model: selection,
        local: { cwd: process.cwd(), settingSources: [] },
      },
    );
    if (result.status === "error") {
      throw new Error(`agent run failed: ${result.id}`);
    }
    return {
      text: (result.result ?? "").toString(),
      usage: result.usage,
      model: modelId,
    };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK: ${err.message} (retryable=${err.isRetryable})`);
    }
    throw err;
  }
}
