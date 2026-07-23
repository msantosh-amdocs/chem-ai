import { Agent, CursorAgentError, type ModelSelection } from "@cursor/sdk";

export function assertKey(): string {
  const k = process.env.CURSOR_API_KEY;
  if (!k) {
    throw new Error(
      "CURSOR_API_KEY is not set. Get one at https://cursor.com/dashboard/integrations and set it in .env",
    );
  }
  return k;
}

export async function promptModel(
  modelId: string,
  prompt: string,
  systemHint?: string,
  params?: Record<string, string>,
): Promise<string> {
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
    return (result.result ?? "").toString();
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK: ${err.message} (retryable=${err.isRetryable})`);
    }
    throw err;
  }
}
