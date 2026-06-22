import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  loadSession,
  restartAll,
  runBluetoothAction,
  runBluetoothScan,
  runMusicAction,
  runMusicCommand,
  saveSession,
} from "./commandClient";
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

describe("restartAll", () => {
  it("POSTs the restart request and returns ok", async () => {
    const seen: { url?: string; method?: string } = {};
    mockFetch(async (url, init) => {
      seen.url = url;
      seen.method = init?.method;
      return jsonResponse({ status: "ok", message: "已排程重啟" });
    });

    const res = await restartAll();

    expect(seen.url).toBe("/api/command/restartall");
    expect(seen.method).toBe("POST");
    expect(res.status).toBe("ok");
    expect(res.message).toContain("重啟");
  });

  it("fails soft on a network error", async () => {
    mockFetch(async () => {
      throw new Error("offline");
    });

    const res = await restartAll();

    expect(res.status).toBe("error");
    expect(res.message).toContain("offline");
  });
});

// --- music routes (web#3 / #4) --------------------------------------------
// Backend-returned action buttons (folder nav, song detail, favorites) all
// route through runMusicAction so the bridge re-runs the same handlers as the
// Telegram bot. Panel buttons call the same function.

describe("runMusicAction", () => {
  it("POSTs callback_data to /api/command/music", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "正在播放", actions: [] });
    });
    const res = await runMusicAction("music:rnd");
    expect(seenUrl).toBe("/api/command/music");
    expect(JSON.parse(seenBody).callback_data).toBe("music:rnd");
    expect(res.status).toBe("ok");
    expect(res.message).toBe("正在播放");
  });

  it("backend error response is returned (not thrown) so UI can render it", async () => {
    mockFetch(async () =>
      jsonResponse({ status: "error", message: "未知的 callback", actions: [] }),
    );
    const res = await runMusicAction("bogus:cb");
    expect(res.status).toBe("error");
    expect(res.message).toContain("未知");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runMusicAction("music:stop");
    expect(res.status).toBe("error");
  });
});

describe("runMusicCommand", () => {
  it("POSTs input to /api/command/music", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "搜尋中", actions: [] });
    });
    await runMusicCommand("蒼のワルツ");
    expect(JSON.parse(seenBody).input).toBe("蒼のワルツ");
  });

  it("empty input sends empty string (returns music menu from backend)", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "選單", actions: [] });
    });
    await runMusicCommand("");
    expect(JSON.parse(seenBody).input).toBe("");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runMusicCommand("test");
    expect(res.status).toBe("error");
  });
});

// --- bluetooth routes (aka_no_claw#38 / web#7) -----------------------------
// Same remote-controller model as music: an empty body scans devices, a
// callback_data connects/refreshes. Device buttons carry backend opaque tokens
// (never MACs), so the UI just forwards whatever callback_data it was handed.

describe("runBluetoothScan", () => {
  it("POSTs an empty body to /api/command/bluetooth", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "藍牙裝置", actions: [] });
    });
    const res = await runBluetoothScan();
    expect(seenUrl).toBe("/api/command/bluetooth");
    expect(JSON.parse(seenBody)).toEqual({});
    expect(res.status).toBe("ok");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runBluetoothScan();
    expect(res.status).toBe("error");
  });
});

describe("runBluetoothAction", () => {
  it("POSTs callback_data to /api/command/bluetooth", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "已連線：XGIMI Z8X", actions: [] });
    });
    const res = await runBluetoothAction("bt:c:deadbeefdeadbeef");
    expect(seenUrl).toBe("/api/command/bluetooth");
    expect(JSON.parse(seenBody).callback_data).toBe("bt:c:deadbeefdeadbeef");
    expect(res.status).toBe("ok");
    expect(res.message).toContain("已連線");
  });

  it("backend error response is returned (not thrown)", async () => {
    mockFetch(async () =>
      jsonResponse({ status: "error", message: "請重新掃描", actions: [] }),
    );
    const res = await runBluetoothAction("bt:c:stale");
    expect(res.status).toBe("error");
    expect(res.message).toContain("重新掃描");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runBluetoothAction("bt:scan");
    expect(res.status).toBe("error");
  });
});
