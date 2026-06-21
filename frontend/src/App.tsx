import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatBackend,
  Message,
  Mode,
  SessionSnapshot,
  Submode,
  WebCommandRequest,
} from "./types/command";
import {
  clearSession,
  loadSession,
  pollJob,
  runAction,
  runMusicAction,
  runMusicCommand,
  saveSession,
  sendCommand,
  startAsyncCommand,
  streamCommand,
} from "./api/commandClient";
import type { ActionResponse } from "./types/command";
import { debounce, fromSnapshot, toSnapshot } from "./session";
import { ModeToggle } from "./components/ModeToggle";
import { ChatBackendSelector } from "./components/ChatBackendSelector";
import { InvestmentActionPanel } from "./components/InvestmentActionPanel";
import { LifeActionPanel } from "./components/LifeActionPanel";
import { ConversationStream } from "./components/ConversationStream";
import { InputBar } from "./components/InputBar";

const SOURCE = "aka_no_claw_web";

// Sentinel jobId marking a 生活-mode music message, so its action buttons stay
// enabled and route back through the music endpoint (not the research action
// endpoint, which needs a real research job id).
const MUSIC_JOB_ID = "__music__";

let _seq = 0;
const uid = () => `m${Date.now()}-${_seq++}`;

const MODE_LABELS: Record<string, string> = {
  chat: "Chat",
  text_translation: "翻譯",
  image_translation: "翻譯",
  deep_product_research: "商品深入研究",
  seller_reputation_snapshot: "賣家信譽快照",
  life: "生活",
};

function placeholderFor(mode: Mode, submode: Submode): string {
  if (mode === "chat") return "輸入訊息...";
  if (mode === "translation") return "翻譯成繁體中文...";
  if (mode === "life") return "輸入歌名播放，或用上方按鈕控制...";
  if (submode === "seller_reputation_snapshot") return "貼上賣家 URL 或輸入賣家識別資訊...";
  return "貼上商品 URL 或輸入商品名稱...";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [chatBackend, setChatBackend] = useState<ChatBackend>("local");
  const [investmentSubmode, setInvestmentSubmode] =
    useState<Submode>("deep_product_research");
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stopPollRef = useRef<(() => void) | null>(null);

  // Debounced writer: a burst of state changes (streaming deltas, rapid taps)
  // collapses into one POST so token streaming doesn't hammer the backend.
  const saverRef = useRef<ReturnType<typeof debounce<[SessionSnapshot]>>>();
  if (!saverRef.current) {
    saverRef.current = debounce((snap: SessionSnapshot) => {
      void saveSession(snap);
    }, 800);
  }

  const placeholder = useMemo(
    () => placeholderFor(mode, investmentSubmode),
    [mode, investmentSubmode],
  );

  // Restore the session from the Mac mini on open. A failure (offline / corrupt
  // payload) fails soft: start blank and show an in-app banner, never an alert.
  // If a research job was active, attempt to reconnect: done → render result,
  // running → resume polling, interrupted/not_found → show notice.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await loadSession();
      if (!alive) return;
      const st = fromSnapshot(res.session);
      setMessages(st.messages);
      setMode(st.mode);
      setChatBackend(st.chatBackend);
      setInvestmentSubmode(st.investmentSubmode);
      if (res.status === "error") {
        setNotice("無法從本機還原工作階段，已開新對話。");
      }
      setRestored(true);

      // Attempt job reconnect. Music sentinel is never pollable.
      const jobId = st.activeJobId;
      if (!jobId || jobId === MUSIC_JOB_ID) return;
      const targetMsg = [...st.messages].reverse().find(
        (m) => m.role === "assistant" && m.jobId === jobId,
      );
      if (!targetMsg) return; // no message to update → skip silently

      let snap;
      try {
        snap = await pollJob(jobId);
      } catch {
        return; // network error at restore time — don't break the session
      }
      if (!alive) return;

      if (snap.job_status === "done") {
        const progressText = (snap.progress ?? []).join("\n");
        setMessages((prev) => prev.map((m) =>
          m.id === targetMsg.id
            ? { ...m, text: snap.message || progressText, status: "ok", generating: false, actions: snap.actions ?? [], jobId }
            : m,
        ));
      } else if (snap.job_status === "error" || snap.not_found) {
        setMessages((prev) => prev.map((m) =>
          m.id === targetMsg.id
            ? { ...m, text: snap.error || snap.message || "研究失敗。", status: "error", generating: false }
            : m,
        ));
      } else if (snap.job_status === "interrupted") {
        setMessages((prev) => prev.map((m) =>
          m.id === targetMsg.id ? { ...m, generating: false } : m,
        ));
        setNotice("研究任務因系統重啟而中斷，請重新執行 /research。");
      } else if (snap.job_status === "running") {
        // Resume the polling loop — marks generating=true, updates progress.
        void resumePolling(jobId, targetMsg.id);
      }
    })();
    return () => {
      alive = false;
    };
  // resumePolling is stable (its only dep is patch which has []). Use [] to
  // avoid a temporal dead zone error from the callback defined later.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist (debounced) whenever the restorable state changes — but only after
  // the initial restore, so the blank startup state can't clobber saved data.
  // Skip when messages is empty: an empty console has no session worth keeping,
  // so a successful clear truly leaves no backend snapshot (not an empty one).
  useEffect(() => {
    if (!restored || messages.length === 0) return;
    saverRef.current?.(toSnapshot({ messages, mode, chatBackend, investmentSubmode }));
  }, [restored, messages, mode, chatBackend, investmentSubmode]);

  // Flush any pending write on unmount so a quick close doesn't drop the last
  // snapshot.
  useEffect(() => () => saverRef.current?.flush(), []);

  const patch = useCallback((id: string, partial: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...partial } : m)));
  }, []);

  const buildRequest = useCallback(
    (text: string): WebCommandRequest => {
      if (mode === "chat") {
        return {
          mode: "chat",
          submode: null,
          input: text,
          chat_backend: chatBackend,
          attachments: [],
          source: SOURCE,
        };
      }
      if (mode === "translation") {
        return {
          mode: "translation",
          submode: "text_translation",
          input: text,
          attachments: [],
          source: SOURCE,
        };
      }
      return {
        mode: "investment",
        submode: investmentSubmode,
        input: text,
        attachments: [],
        source: SOURCE,
      };
    },
    [mode, chatBackend, investmentSubmode],
  );

  const runBlocking = useCallback(
    async (req: WebCommandRequest, assistantId: string, label: string) => {
      setGenerating(true);
      try {
        const res = await sendCommand(req);
        patch(assistantId, {
          text: res.message,
          status: res.status,
          modeLabel: label,
          generating: false,
        });
      } catch (err) {
        patch(assistantId, {
          text: `無法連線到本機 command bridge（${String(err)}）`,
          status: "error",
          generating: false,
        });
      } finally {
        setGenerating(false);
      }
    },
    [patch],
  );

  const runStreaming = useCallback(
    async (req: WebCommandRequest, assistantId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setGenerating(true);
      let acc = "";
      try {
        await streamCommand(
          req,
          (event) => {
            if (event.type === "delta") {
              acc += event.text;
              patch(assistantId, { text: acc });
            } else if (event.type === "done") {
              patch(assistantId, {
                text: event.message || acc,
                status: "ok",
                generating: false,
              });
            } else if (event.type === "error") {
              patch(assistantId, {
                text: acc ? `${acc}\n\n[錯誤] ${event.message}` : event.message,
                status: "error",
                generating: false,
              });
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          patch(assistantId, { generating: false }); // keep partial text
        } else {
          patch(assistantId, {
            text: acc ? `${acc}\n\n[錯誤] ${String(err)}` : `無法連線到本機 command bridge（${String(err)}）`,
            status: "error",
            generating: false,
          });
        }
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    [patch],
  );

  // Long research runs as a background job; we poll for staged progress so the
  // Re-attach to an existing in-progress job after a page reload. Takes over
  // an assistantId that was already rendered by the restore effect.
  const resumePolling = useCallback(
    async (jobId: string, assistantId: string) => {
      setGenerating(true);
      let cancelled = false;
      stopPollRef.current = () => { cancelled = true; };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        let consecutiveFailures = 0;
        while (!cancelled) {
          await sleep(2000);
          if (cancelled) break;
          let snap;
          try {
            snap = await pollJob(jobId);
            consecutiveFailures = 0;
          } catch {
            if (++consecutiveFailures >= 30) {
              patch(assistantId, { text: "與本機 command bridge 失去連線，請稍後重試。", status: "error", generating: false });
              return;
            }
            continue;
          }
          const progressText = (snap.progress ?? []).join("\n");
          if (snap.job_status === "done") {
            patch(assistantId, { text: snap.message || progressText, status: "ok", generating: false, actions: snap.actions ?? [], jobId });
            return;
          }
          if (snap.job_status === "error" || snap.not_found) {
            patch(assistantId, { text: snap.error || snap.message || "研究失敗。", status: "error", generating: false });
            return;
          }
          if (snap.job_status === "interrupted") {
            patch(assistantId, { generating: false });
            setNotice("研究任務因系統重啟而中斷，請重新執行 /research。");
            return;
          }
          patch(assistantId, { text: progressText || "⏳ 研究進行中…" });
        }
        patch(assistantId, { generating: false });
      } catch (err) {
        patch(assistantId, { text: `無法連線到本機 command bridge（${String(err)}）`, status: "error", generating: false });
      } finally {
        setGenerating(false);
        stopPollRef.current = null;
      }
    },
    [patch],
  );

  // result survives a phone screen-lock or a dropped connection (龍蝦-style).
  const runPolling = useCallback(
    async (req: WebCommandRequest, assistantId: string) => {
      setGenerating(true);
      let cancelled = false;
      stopPollRef.current = () => {
        cancelled = true;
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        const start = await startAsyncCommand(req);
        if (start.status !== "accepted" || !start.job_id) {
          patch(assistantId, {
            text: start.message || "無法建立研究任務。",
            status: "error",
            generating: false,
          });
          return;
        }
        const jobId = start.job_id;
        let consecutiveFailures = 0;
        while (!cancelled) {
          await sleep(2000);
          if (cancelled) break;
          let snap;
          try {
            snap = await pollJob(jobId);
            consecutiveFailures = 0;
          } catch {
            // Transient network blip (screen-lock, Wi-Fi handoff) — keep trying.
            if (++consecutiveFailures >= 30) {
              patch(assistantId, {
                text: "與本機 command bridge 失去連線，請稍後重試。",
                status: "error",
                generating: false,
              });
              return;
            }
            continue;
          }
          const progressText = (snap.progress ?? []).join("\n");
          if (snap.job_status === "done") {
            patch(assistantId, {
              text: snap.message || progressText,
              status: "ok",
              generating: false,
              actions: snap.actions ?? [],
              jobId,
            });
            return;
          }
          if (snap.job_status === "error" || snap.not_found) {
            patch(assistantId, {
              text: snap.error || snap.message || "研究失敗。",
              status: "error",
              generating: false,
            });
            return;
          }
          patch(assistantId, { text: progressText || "⏳ 研究進行中…" });
        }
        patch(assistantId, { generating: false }); // stopped by user
      } catch (err) {
        patch(assistantId, {
          text: `無法連線到本機 command bridge（${String(err)}）`,
          status: "error",
          generating: false,
        });
      } finally {
        setGenerating(false);
        stopPollRef.current = null;
      }
    },
    [patch],
  );

  // 生活 mode: run a music interaction (text query or callback button) and
  // render the backend's text + action buttons into the given message. The
  // MUSIC_JOB_ID sentinel keeps the returned buttons live and routes their
  // clicks back through onAction → runMusicAction.
  const runMusic = useCallback(
    async (assistantId: string, call: () => Promise<ActionResponse>) => {
      setGenerating(true);
      try {
        const res = await call();
        patch(assistantId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          modeLabel: MODE_LABELS.life,
          actions: res.actions && res.actions.length ? res.actions : undefined,
          jobId: MUSIC_JOB_ID,
          generating: false,
        });
      } catch (err) {
        patch(assistantId, {
          text: `無法連線到本機 command bridge（${String(err)}）`,
          status: "error",
          generating: false,
        });
      } finally {
        setGenerating(false);
      }
    },
    [patch],
  );

  // A 生活 control-panel button: append a fresh assistant message and fill it
  // with the action result (a new "card" per tap keeps the stream as history).
  const onMusicPanel = useCallback(
    (callbackData: string) => {
      if (generating) return;
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
      ]);
      void runMusic(assistantId, () => runMusicAction(callbackData));
    },
    [generating, runMusic],
  );

  const onSend = useCallback(
    (text: string) => {
      if (generating) return;
      const userMsg: Message = { id: uid(), role: "user", text };
      const label =
        mode === "chat"
          ? MODE_LABELS.chat
          : mode === "translation"
            ? MODE_LABELS.text_translation
            : mode === "life"
              ? MODE_LABELS.life
              : MODE_LABELS[investmentSubmode];
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        modeLabel: label,
        generating: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (mode === "life") {
        void runMusic(assistantId, () => runMusicCommand(text));
        return;
      }

      const req = buildRequest(text);
      if (mode === "chat") {
        void runStreaming(req, assistantId);
      } else if (
        mode === "investment" &&
        investmentSubmode === "deep_product_research"
      ) {
        void runPolling(req, assistantId);
      } else {
        void runBlocking(req, assistantId, label);
      }
    },
    [generating, mode, investmentSubmode, buildRequest, runStreaming, runPolling, runBlocking, runMusic],
  );

  const onSelectImage = useCallback(
    (file: File) => {
      if (generating || mode !== "translation") return;
      const userMsg: Message = { id: uid(), role: "user", text: `🖼 ${file.name}` };
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", text: "", modeLabel: "翻譯", generating: true },
      ]);
      const req: WebCommandRequest = {
        mode: "translation",
        submode: "image_translation",
        input: "",
        attachments: [{ type: "image", filename: file.name, content_type: file.type }],
        source: SOURCE,
      };
      void runBlocking(req, assistantId, "翻譯");
    },
    [generating, mode, runBlocking],
  );

  const onStop = useCallback(() => {
    abortRef.current?.abort();
    stopPollRef.current?.();
  }, []);

  // Clear memory: DELETE the saved snapshot, then wipe the visible stream.
  // The conversation is only cleared AFTER a confirmed successful delete so
  // a backend failure doesn't silently desync runtime state from the server
  // (a failed delete leaves the saved session intact; next reload would
  // restore it, contradicting the blank screen the user just saw).
  const onClearMemory = useCallback(async () => {
    setConfirmClear(false);
    const res = await clearSession();
    if (res.status !== "ok") {
      setNotice(`清除記憶失敗：${res.message ?? "未知錯誤"}`);
      return;
    }
    saverRef.current?.cancel();
    setMessages([]);
    setNotice(null);
  }, []);

  // Click a research follow-up button (摘要 / 看市價 / …): switch the view in
  // place, keeping the buttons so the user can flip between views.
  const onAction = useCallback(
    async (messageId: string, jobId: string, callbackData: string) => {
      patch(messageId, { generating: true });
      // 生活 music buttons: re-render this message in place via the music route
      // (folder/song/favorite navigation, volume), not the research endpoint.
      if (jobId === MUSIC_JOB_ID) {
        await runMusic(messageId, () => runMusicAction(callbackData));
        return;
      }
      try {
        const res = await runAction(jobId, callbackData);
        patch(messageId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          actions: res.actions && res.actions.length ? res.actions : undefined,
          generating: false,
        });
      } catch (err) {
        patch(messageId, {
          text: `動作執行失敗（${String(err)}）`,
          status: "error",
          generating: false,
        });
      }
    },
    [patch, runMusic],
  );

  return (
    <div className="mx-auto flex h-full max-w-content flex-col bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-muted px-4 py-3">
        <h1 className="text-base font-semibold">OpenClaw 本機控制台</h1>
        {confirmClear ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text/70">清除記憶？</span>
            <button
              onClick={onClearMemory}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              確定清除
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
            title="刪除本機已儲存的工作階段並清空對話"
          >
            清除記憶
          </button>
        )}
      </header>

      {notice && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-amber-700/70 hover:text-amber-900"
            aria-label="關閉提示"
          >
            ✕
          </button>
        </div>
      )}

      <div className="border-b border-muted px-3 py-3">
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {mode === "chat" && (
        <div className="border-b border-muted px-3 py-2">
          <ChatBackendSelector
            backend={chatBackend}
            onChange={setChatBackend}
            disabled={generating}
          />
        </div>
      )}

      {mode === "investment" && (
        <div className="border-b border-muted px-3 py-3">
          <InvestmentActionPanel
            submode={investmentSubmode}
            onChange={setInvestmentSubmode}
          />
        </div>
      )}

      {mode === "life" && (
        <div className="border-b border-muted px-3 py-3">
          <LifeActionPanel disabled={generating} onAction={onMusicPanel} />
        </div>
      )}

      <ConversationStream messages={messages} onAction={onAction} />

      <InputBar
        placeholder={placeholder}
        mode={mode}
        generating={generating}
        onSend={onSend}
        onStop={onStop}
        onSelectImage={onSelectImage}
      />
    </div>
  );
}
