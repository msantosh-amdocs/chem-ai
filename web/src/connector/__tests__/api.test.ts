import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../api";

const originalFetch = global.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  const response = {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  } as unknown as Response;
  const fetchMock = vi.fn().mockResolvedValueOnce(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe("connector/api", () => {
  it("health() GETs /api/health and returns the parsed body", async () => {
    const fetchMock = mockFetchOnce({ ok: true, cursorSdk: true, version: "1.0.0" });
    const res = await api.health();
    expect(fetchMock).toHaveBeenCalledWith("/api/health");
    expect(res).toEqual({ ok: true, cursorSdk: true, version: "1.0.0" });
  });

  it("listModels(refresh=true) sends the refresh flag", async () => {
    const fetchMock = mockFetchOnce({ models: [], cachedAt: "now" });
    await api.listModels(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/models?refresh=1");
  });

  it("getSession() encodes ids and returns the session envelope", async () => {
    const fetchMock = mockFetchOnce({ session: { id: "abc/def" } });
    await api.getSession("abc/def");
    expect(fetchMock).toHaveBeenCalledWith("/api/history/abc%2Fdef");
  });

  it("deleteSession() uses DELETE and tolerates the {ok:true} envelope", async () => {
    const fetchMock = mockFetchOnce({ ok: true });
    await api.deleteSession("s1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/history/s1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("startSession() posts a multipart body with idea/specialists/settings", async () => {
    const fetchMock = mockFetchOnce({ sessionId: "s1", session: { id: "s1" } });
    await api.startSession({
      idea: "test",
      specialists: {
        analyst: { name: "A" } as never,
        teams: [{ kind: "market", minMembers: 2, members: [] } as never],
      },
      settings: {
        threshold: 90,
        maxRounds: 3,
        terminationPolicy: "threshold_or_max",
      },
      documents: [],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/session/start");
    expect(init.method).toBe("POST");
    const fd = init.body as FormData;
    expect(fd.get("idea")).toBe("test");
    expect(JSON.parse(fd.get("settings") as string)).toEqual({
      threshold: 90,
      maxRounds: 3,
      terminationPolicy: "threshold_or_max",
    });
    expect(JSON.parse(fd.get("specialists") as string).analyst.name).toBe("A");
  });

  it("refineRound() POSTs JSON with the answers", async () => {
    const fetchMock = mockFetchOnce({ round: {}, session: {} });
    await api.refineRound("s1", [{ questionId: "q1", answer: "yes" }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/session/s1/refine");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      answers: [{ questionId: "q1", answer: "yes" }],
    });
  });

  it("throws with the body text when the response is not ok", async () => {
    mockFetchOnce("boom", { ok: false, status: 500 });
    await expect(api.health()).rejects.toThrow(/boom/);
  });
});
