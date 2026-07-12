import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelJob,
  clearSession,
  confirmVoiceAction,
  getChatSettings,
  getModelRoutes,
  getNowPlaying,
  loadSession,
  restartAll,
  runBluetoothAction,
  runBluetoothScan,
  runIrCommand,
  runMusicAction,
  runMusicCommand,
  runScheduleHomeAction,
  runScheduleHomeCommand,
  runWorkflowAction,
  runWorkflowCommand,
  saveChatSettings,
  saveSession,
  sendCommand,
  streamCommand,
  transcribeAudio,
} from "./commandClient";
import { emptySnapshot } from "../session";
import type { ChatSettings } from "../types/command";

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

function streamResponse(lines: unknown[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        }
        controller.close();
      },
    }),
  } as unknown as Response;
}

function rawStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
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

describe("transcribeAudio", () => {
  it("POSTs the audio Blob as multipart FormData without setting Content-Type", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    mockFetch(async (url, init) => {
      seen.url = url;
      seen.init = init;
      return jsonResponse({ status: "ok", transcript: "明天下午提醒我" });
    });

    const audio = new Blob(["voice"], { type: "audio/webm;codecs=opus" });
    const res = await transcribeAudio(audio);

    expect(seen.url).toBe("/api/command/transcribe");
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.headers).toBeUndefined();
    expect(seen.init?.body).toBeInstanceOf(FormData);
    const file = (seen.init?.body as FormData).get("file") as File;
    expect(file.name).toBe("recording.webm");
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(res).toEqual({ status: "ok", transcript: "明天下午提醒我" });
  });

  it("fails soft when transcription cannot reach the bridge", async () => {
    mockFetch(async () => { throw new Error("offline"); });

    const res = await transcribeAudio(new Blob(["voice"], { type: "audio/mp4" }));

    expect(res.status).toBe("error");
    expect(res.message).toContain("offline");
  });
});

describe("confirmVoiceAction", () => {
  it("POSTs only the action_id to the voice confirm route (#82)", async () => {
    const seen: { url?: string; body?: string } = {};
    mockFetch(async (url, init) => {
      seen.url = url;
      seen.body = String(init?.body);
      return jsonResponse({ status: "ok", message: "已送出", actions: [] });
    });

    const res = await confirmVoiceAction("ir.fan.power");

    expect(seen.url).toBe("/api/command/voice/confirm");
    expect(JSON.parse(seen.body ?? "{}")).toEqual({ action_id: "ir.fan.power" });
    expect(res.status).toBe("ok");
  });

  it("includes the learning token in the body when provided (#82 PR3)", async () => {
    const seen: { body?: string } = {};
    mockFetch(async (_url, init) => {
      seen.body = String(init?.body);
      return jsonResponse({ status: "ok", message: "已送出", actions: [] });
    });

    await confirmVoiceAction("ir.fan.power", "tok-learn-1");

    expect(JSON.parse(seen.body ?? "{}")).toEqual({
      action_id: "ir.fan.power",
      learning_token: "tok-learn-1",
    });
  });

  it("fails soft when the bridge is unreachable", async () => {
    mockFetch(async () => { throw new Error("offline"); });

    const res = await confirmVoiceAction("music.playpause");

    expect(res.status).toBe("error");
    expect(res.message).toContain("offline");
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

describe("cancelJob", () => {
  it("POSTs the job_id to /api/command/cancel and returns the bridge reply", async () => {
    let url: string | undefined;
    let body: unknown;
    mockFetch(async (u, init) => {
      url = u;
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        status: "ok",
        job_status: "interrupted",
        message: "已要求取消，將於下一個安全點停止。",
      });
    });
    const res = await cancelJob("job-1");
    expect(url).toBe("/api/command/cancel");
    expect(body).toEqual({ job_id: "job-1" });
    expect(res.status).toBe("ok");
    expect(res.job_status).toBe("interrupted");
  });

  it("reports the real terminal state of an already-finished job", async () => {
    mockFetch(async () =>
      jsonResponse({ status: "ok", job_status: "done", message: "任務已結束，無需取消。" }),
    );
    const res = await cancelJob("job-done");
    expect(res.status).toBe("ok");
    expect(res.job_status).toBe("done");
  });

  it("fails soft on non-JSON responses", async () => {
    mockFetch(async () =>
      ({ ok: false, status: 500, json: async () => { throw new Error("bad json"); } }) as unknown as Response,
    );
    const res = await cancelJob("job-1");
    expect(res.status).toBe("error");
    expect(res.message).toBe("HTTP 500");
  });

  it("fails soft on a network error", async () => {
    mockFetch(async () => {
      throw new Error("nope");
    });
    const res = await cancelJob("job-1");
    expect(res.status).toBe("error");
  });
});

describe("sendCommand", () => {
  it("accepts a response with no envelope_version (legacy v0)", async () => {
    mockFetch(async () => jsonResponse({ status: "ok", message: "hi" }));
    const res = await sendCommand({ mode: "chat", input: "test", source: "aka_no_claw_web" });
    expect(res).toEqual({ status: "ok", message: "hi" });
  });

  it("accepts a response with the current supported envelope_version", async () => {
    mockFetch(async () => jsonResponse({ status: "ok", message: "hi", envelope_version: 1 }));
    const res = await sendCommand({ mode: "chat", input: "test", source: "aka_no_claw_web" });
    expect(res.status).toBe("ok");
  });

  it("fails soft to an error when envelope_version is unsupported (#77 D2.4 follow-up)", async () => {
    mockFetch(async () => jsonResponse({ status: "ok", message: "hi", envelope_version: 99 }));
    const res = await sendCommand({ mode: "chat", input: "test", source: "aka_no_claw_web" });
    expect(res.status).toBe("error");
    expect((res as { message?: string }).message).toContain("99");
  });
});

describe("streamCommand", () => {
  it("connects directly to the bridge port before falling back to the dev proxy", async () => {
    const seenUrls: string[] = [];
    mockFetch(async (url) => {
      seenUrls.push(String(url));
      return streamResponse([
        { type: "delta", text: "步驟 1/2：/search 查詢中\n" },
        { type: "done", message: "完成" },
      ]);
    });
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(seenUrls[0]).toContain(":8781/api/command/stream");
    expect(events).toEqual([
      { type: "delta", text: "步驟 1/2：/search 查詢中\n" },
      { type: "done", message: "完成" },
    ]);
  });

  it("falls back to the proxied stream endpoint when direct bridge streaming fails", async () => {
    const seenUrls: string[] = [];
    mockFetch(async (url) => {
      seenUrls.push(String(url));
      if (seenUrls.length === 1) throw new Error("direct unavailable");
      return streamResponse([{ type: "done", message: "proxy ok" }]);
    });
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(seenUrls[0]).toContain(":8781/api/command/stream");
    expect(seenUrls[1]).toBe("/api/command/stream");
    expect(events).toEqual([{ type: "done", message: "proxy ok" }]);
  });

  it("surfaces an error event for an event with an unsupported envelope_version (#77 D2.4 follow-up)", async () => {
    mockFetch(async () =>
      streamResponse([{ type: "done", message: "ok", envelope_version: 99 }]),
    );
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    expect((events[0] as { message: string }).message).toContain("99");
  });

  it("passes through an event with the current supported envelope_version", async () => {
    mockFetch(async () =>
      streamResponse([{ type: "done", message: "ok", envelope_version: 1 }]),
    );
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(events).toEqual([{ type: "done", message: "ok", envelope_version: 1 }]);
  });

  it("reports a malformed NDJSON line as corrupt and terminates the stream (#77)", async () => {
    mockFetch(async () =>
      rawStreamResponse([
        '{"type":"delta","text":"partial"}\n',
        '{not-json}\n{"type":"done","message":"must not be delivered"}\n',
      ]),
    );
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(events).toEqual([
      { type: "delta", text: "partial" },
      expect.objectContaining({ type: "error", failure_state: "corrupt" }),
    ]);
    expect((events[1] as { message: string }).message).toContain("毀損");
  });

  it("reports a non-event JSON value as corrupt instead of silently dropping it (#77)", async () => {
    mockFetch(async () => rawStreamResponse(['{"type":"delta","text":"partial"}\nnull\n']));
    const events: unknown[] = [];

    await streamCommand(
      { mode: "chat", input: "test", source: "aka_no_claw_web" },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(events[1]).toMatchObject({ type: "error", failure_state: "corrupt" });
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

describe("getNowPlaying", () => {
  it("returns the song name from /api/command/music/now", async () => {
    let seenUrl = "";
    mockFetch(async (url) => {
      seenUrl = url;
      return jsonResponse({ status: "ok", name: "蒼のワルツ" });
    });
    const name = await getNowPlaying();
    expect(seenUrl).toBe("/api/command/music/now");
    expect(name).toBe("蒼のワルツ");
  });

  it("returns null when nothing is playing", async () => {
    mockFetch(async () => jsonResponse({ status: "ok", name: null }));
    expect(await getNowPlaying()).toBeNull();
  });

  it("fails soft to null on HTTP error", async () => {
    mockFetch(async () => jsonResponse({}, false, 500));
    expect(await getNowPlaying()).toBeNull();
  });

  it("fails soft to null on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    expect(await getNowPlaying()).toBeNull();
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

// --- IR / appliance shortcut ------------------------------------------------

describe("runIrCommand", () => {
  it("POSTs the IR slash command to the dedicated IR bridge route", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "已送出 IR" });
    });
    const res = await runIrCommand("/ir send ceiling_light power");
    expect(seenUrl).toBe("/api/command/ir");
    expect(JSON.parse(seenBody)).toEqual({ input: "/ir send ceiling_light power" });
    expect(res.status).toBe("ok");
    expect(res.message).toContain("IR");
  });

  it("POSTs IR callback actions as callback_data", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "已執行 IR 動作" });
    });
    const res = await runIrCommand("ir:s:abc123");
    expect(JSON.parse(seenBody)).toEqual({ callback_data: "ir:s:abc123" });
    expect(res.status).toBe("ok");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runIrCommand("/ir send ceiling_light power");
    expect(res.status).toBe("error");
  });
});

// --- workflow creation loop (web#8) ------------------------------------------

describe("runWorkflowCommand", () => {
  it("POSTs input to /api/command/workflow", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({
        status: "ok",
        message: "草稿已建立",
        actions: [{ label: "儲存", callback_data: "wfe:save" }],
      });
    });
    const res = await runWorkflowCommand("create 每天早上問候我");
    expect(seenUrl).toBe("/api/command/workflow");
    expect(JSON.parse(seenBody)).toEqual({ input: "create 每天早上問候我" });
    expect(res.status).toBe("ok");
    expect(res.message).toContain("草稿");
  });

  it("POSTs selected chat backend to /api/command/workflow when provided", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "草稿已建立" });
    });
    await runWorkflowCommand("create 每天早上問候我", "gemini");
    expect(JSON.parse(seenBody)).toEqual({
      input: "create 每天早上問候我",
      chat_backend: "gemini",
    });
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runWorkflowCommand("create 每天早上問候我");
    expect(res.status).toBe("error");
  });
});

describe("runWorkflowAction", () => {
  it("POSTs callback_data to /api/command/workflow", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "✅ workflow 已儲存", actions: [] });
    });
    const res = await runWorkflowAction("wfe:save");
    expect(JSON.parse(seenBody)).toEqual({ callback_data: "wfe:save" });
    expect(res.status).toBe("ok");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runWorkflowAction("wfe:save");
    expect(res.status).toBe("error");
  });
});

// --- schedule creation loop (web#9) ------------------------------------------

describe("runScheduleHomeCommand", () => {
  it("POSTs input to /api/command/schedulehome", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({
        status: "ok",
        message: "🕐 設定時間：07:00",
        actions: [{ label: "✅ 下一步", callback_data: "sh:t:07:00:ok" }],
      });
    });
    const res = await runScheduleHomeCommand("add");
    expect(seenUrl).toBe("/api/command/schedulehome");
    expect(JSON.parse(seenBody)).toEqual({ input: "add" });
    expect(res.status).toBe("ok");
    expect(res.message).toContain("設定時間");
  });

  it("POSTs empty string for list command", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "排程列表（空）", actions: [] });
    });
    await runScheduleHomeCommand("");
    expect(JSON.parse(seenBody)).toEqual({ input: "" });
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runScheduleHomeCommand("add");
    expect(res.status).toBe("error");
  });
});

describe("runScheduleHomeAction", () => {
  it("POSTs callback_data to /api/command/schedulehome", async () => {
    let seenBody = "";
    mockFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", message: "已取消", actions: [] });
    });
    const res = await runScheduleHomeAction("sh:cancel");
    expect(JSON.parse(seenBody)).toEqual({ callback_data: "sh:cancel" });
    expect(res.status).toBe("ok");
  });

  it("fails soft on network error", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    const res = await runScheduleHomeAction("sh:cancel");
    expect(res.status).toBe("error");
  });
});

describe("getModelRoutes", () => {
  it("GETs /api/command/model-routes", async () => {
    let seenUrl = "";
    mockFetch(async (url) => {
      seenUrl = url;
      return jsonResponse({
        status: "ok",
        routes: [
          {
            backend: "gemini",
            label: "Gemini",
            requested_provider: "gemini",
            requested_model: "gemini-2.5-pro",
            chain: [
              { provider: "gemini", model: "gemini-2.5-pro" },
              { provider: "gemini", model: "gemini-2.5-flash" },
            ],
            configured: true,
          },
        ],
      });
    });

    const res = await getModelRoutes();

    expect(seenUrl).toBe("/api/command/model-routes");
    expect(res.status).toBe("ok");
    expect(res.routes[0].backend).toBe("gemini");
  });
});

describe("getChatSettings", () => {
  it("GETs /api/command/chat-settings", async () => {
    let seenUrl = "";
    mockFetch(async (url) => {
      seenUrl = url;
      return jsonResponse({
        status: "ok",
        settings: {
          default_chat_provider: "cloud_pool",
          cloud_pool: ["gemini", "mistral", "big_pickle"],
          default_provider_options: [],
          providers: {
            gemini: { label: "Gemini", enabled: true, model: "gemini-2.5-flash", configured: true },
            mistral: { label: "Mistral", enabled: true, model: "mistral-large-latest", configured: false },
            big_pickle: { label: "OpenCode", enabled: true, model: "big-pickle", configured: true },
            local: { label: "本地", enabled: true, model: "qwen3:14b", configured: true },
          },
          model_options: {
            gemini: ["gemini-2.5-flash"],
            mistral: ["mistral-large-latest"],
            big_pickle: ["big-pickle", "deepseek-v4-flash-free"],
            local: ["qwen3:14b"],
          },
        },
      });
    });

    const res = await getChatSettings();

    expect(seenUrl).toBe("/api/command/chat-settings");
    expect(res.status).toBe("ok");
    expect(res.settings?.default_chat_provider).toBe("cloud_pool");
  });
});

describe("saveChatSettings", () => {
  it("POSTs the settings payload", async () => {
    let seenUrl = "";
    let seenBody = "";
    mockFetch(async (url, init) => {
      seenUrl = url;
      seenBody = init?.body as string;
      return jsonResponse({ status: "ok", settings: JSON.parse(seenBody) });
    });

    const payload: ChatSettings = {
      default_chat_provider: "cloud_pool" as const,
      cloud_pool: ["mistral", "gemini", "big_pickle"],
      default_provider_options: [],
      providers: {
        gemini: { label: "Gemini", enabled: true, model: "gemini-2.5-pro", configured: true },
        mistral: { label: "Mistral", enabled: true, model: "mistral-large-latest", configured: true },
        big_pickle: { label: "OpenCode", enabled: true, model: "big-pickle", configured: true },
        nvidia: { label: "NVIDIA", enabled: true, model: "meta/llama-3.1-70b-instruct", configured: true },
        local: { label: "本地", enabled: true, model: "qwen3:14b", configured: true },
      },
      model_options: {
        gemini: ["gemini-2.5-pro"],
        mistral: ["mistral-large-latest"],
        big_pickle: ["big-pickle", "deepseek-v4-flash-free"],
        nvidia: ["meta/llama-3.1-70b-instruct"],
        local: ["qwen3:14b"],
      },
      vision_pool: ["gemini", "mistral", "nvidia", "local"],
      vision_providers: {
        gemini: { label: "Gemini", enabled: true, model: "gemini-2.5-flash", configured: true },
        mistral: { label: "Mistral", enabled: true, model: "pixtral-12b-latest", configured: true },
        big_pickle: { label: "OpenCode", enabled: false, model: "big-pickle", configured: true },
        nvidia: { label: "NVIDIA", enabled: true, model: "meta/llama-3.2-11b-vision-instruct", configured: true },
        local: { label: "本地", enabled: true, model: "qwen2.5vl:7b", configured: true },
      },
      vision_model_options: {
        gemini: ["gemini-2.5-flash"],
        mistral: ["pixtral-12b-latest"],
        big_pickle: ["big-pickle", "mimo-v2.5-free"],
        nvidia: ["meta/llama-3.2-11b-vision-instruct", "meta/llama-3.2-90b-vision-instruct"],
        local: ["qwen2.5vl:7b"],
      },
    };

    const res = await saveChatSettings(payload);

    expect(seenUrl).toBe("/api/command/chat-settings");
    expect(JSON.parse(seenBody).providers.gemini.model).toBe("gemini-2.5-pro");
    expect(res.status).toBe("ok");
  });
});
