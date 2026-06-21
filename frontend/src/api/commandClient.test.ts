import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSession, loadSession, saveSession } from "./commandClient";
import { emptySnapshot } from "../session";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl as typeof fetch));
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadSession", () => {
  it("returns the parsed session on success", async () => {
    const session = { ...emptySnapshot(), messages: [{ id: "1", role: "user", text: "hi" }] };
    mockFetch(async () => jsonResponse({ status: "ok", session }));
    const res = await loadSession();
    expect(res.status).toBe("ok");
    expect(res.session.messages).toHaveLength(1);
  });

  it("fails soft to an empty session on HTTP error", async () => {
    mockFetch(async () => jsonResponse({}, false, 500));
    const res = await loadSession();
    expect(res.status).toBe("error");
    expect(res.session).toEqual(emptySnapshot());
  });

  it("fails soft on a network throw (never raises)", async () => {
    mockFetch(async () => {
      throw new Error("offline");
    });
    const res = await loadSession();
    expect(res.status).toBe("error");
    expect(res.session).toEqual(emptySnapshot());
    expect(res.message).toContain("offline");
  });

  it("fails soft when the payload has no session", async () => {
    mockFetch(async () => jsonResponse({ status: "ok" }));
    const res = await loadSession();
    expect(res.status).toBe("error");
    expect(res.session).toEqual(emptySnapshot());
  });
});

describe("saveSession", () => {
  it("POSTs the snapshot and returns the result", async () => {
    const seen: { url?: string; body?: string; method?: string } = {};
    mockFetch(async (url, init) => {
      seen.url = url;
      seen.method = init?.method;
      seen.body = init?.body as string;
      return jsonResponse({ status: "ok", updated_at: 123 });
    });
    const res = await saveSession({ ...emptySnapshot(), mode: "chat" });
    expect(res.status).toBe("ok");
    expect(seen.url).toBe("/api/command/session");
    expect(seen.method).toBe("POST");
    expect(JSON.parse(seen.body!).mode).toBe("chat");
  });

  it("returns an error instead of throwing when the save fails mid-chat", async () => {
    mockFetch(async () => {
      throw new Error("boom");
    });
    const res = await saveSession(emptySnapshot());
    expect(res.status).toBe("error");
    expect(res.message).toContain("boom");
  });
});

describe("clearSession", () => {
  it("sends a DELETE and returns ok", async () => {
    let method: string | undefined;
    mockFetch(async (_url, init) => {
      method = init?.method;
      return jsonResponse({ status: "ok" });
    });
    const res = await clearSession();
    expect(method).toBe("DELETE");
    expect(res.status).toBe("ok");
  });

  it("fails soft on a network error", async () => {
    mockFetch(async () => {
      throw new Error("nope");
    });
    const res = await clearSession();
    expect(res.status).toBe("error");
  });
});
