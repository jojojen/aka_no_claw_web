import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Attachment,
  ChatBackend,
  ChatSettings,
  ChatHistoryItem,
  CommandAction,
  Message,
  ModelRoute,
  Mode,
  SessionSnapshot,
  Submode,
  VisionRoute,
  VoiceRequestMetadata,
  WebCommandRequest,
} from "./types/command";
import {
  cancelJob,
  clearSession,
  confirmVoiceAction,
  getChatSettings,
  getModelRoutes,
  getNowPlaying,
  loadSession,
  pollJob,
  runAction,
  runBluetoothAction,
  runBluetoothScan,
  runIrCommand,
  runMusicAction,
  runMusicCommand,
  runWorkflowAction,
  runWorkflowCommand,
  runScheduleHomeAction,
  runScheduleHomeCommand,
  saveSession,
  saveChatSettings,
  sendCommand,
  startAsyncCommand,
  restartAll,
  streamCommand,
  transcribeAudio,
} from "./api/commandClient";
import type { ActionResponse } from "./types/command";
import {
  buildChatHistory,
  CONVERSATION_ID,
  debounce,
  fromSnapshot,
  getOrCreateSessionId,
  toSnapshot,
} from "./session";
import { ModeToggle } from "./components/ModeToggle";
import { ChatBackendSelector } from "./components/ChatBackendSelector";
import { InvestmentActionPanel } from "./components/InvestmentActionPanel";
import { LifeActionPanel } from "./components/LifeActionPanel";
import { ConversationStream } from "./components/ConversationStream";
import type { VoiceClarifySelection } from "./components/MessageBubble";
import { InputBar } from "./components/InputBar";
import { CaptureModeChip } from "./components/CaptureModeChip";
import { ChatSettingsModal } from "./components/ChatSettingsModal";
import type { LifeCategory } from "./components/LifeActionPanel";

const SOURCE = "aka_no_claw_web";

// Sentinel jobIds marking 生活-mode and workflow cards, so their action buttons
// stay enabled and route back through the dedicated endpoints (not the research
// action endpoint, which needs a real research job id). Never pollable as jobs.
const MUSIC_JOB_ID = "__music__";
const BLUETOOTH_JOB_ID = "__bluetooth__";
const APPLIANCE_JOB_ID = "__appliance__";
const WORKFLOW_JOB_ID = "__workflow__";
const SCHEDULE_JOB_ID = "__schedule__";
const LIFE_SENTINELS = new Set([MUSIC_JOB_ID, BLUETOOTH_JOB_ID, APPLIANCE_JOB_ID, WORKFLOW_JOB_ID, SCHEDULE_JOB_ID]);

let _seq = 0;
const uid = () => `m${Date.now()}-${_seq++}`;

// Read a File into base64 (no data: URL prefix) for the bridge's data_base64
// attachment field. FileReader yields "data:<mime>;base64,<payload>"; we keep
// only the payload.
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unexpected file reader result"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });

const MODE_LABELS: Record<string, string> = {
  chat: "Chat",
  text_translation: "翻譯",
  image_translation: "翻譯",
  deep_product_research: "商品深入研究",
  seller_reputation_snapshot: "賣家信譽快照",
  life: "生活",
  workflow: "工作流",
  schedule: "排程",
};

function placeholderFor(mode: Mode, submode: Submode, lifeCategory: LifeCategory): string {
  if (mode === "chat") return "輸入訊息...";
  if (mode === "translation") return "翻譯成繁體中文...";
  if (mode === "life") {
    return lifeCategory === "music"
      ? "輸入歌名播放，或用上方按鈕控制..."
      : "輸入訊息...";
  }
  if (submode === "seller_reputation_snapshot") return "貼上賣家 URL 或輸入賣家識別資訊...";
  return "貼上商品 URL 或輸入商品名稱...";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const [chatBackend, setChatBackend] = useState<ChatBackend>("cloud_pool");
  const [modelRoutes, setModelRoutes] = useState<ModelRoute[]>([]);
  const [visionRoute, setVisionRoute] = useState<VisionRoute | null>(null);
  const [investmentSubmode, setInvestmentSubmode] =
    useState<Submode>("deep_product_research");
  const [messages, setMessages] = useState<Message[]>([]);
  const [generating, setGenerating] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoredChatBackendExplicit, setRestoredChatBackendExplicit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [workflowActive, setWorkflowActive] = useState(false);
  const workflowMsgIdRef = useRef<string | null>(null);
  const [scheduleActive, setScheduleActive] = useState(false);
  const scheduleMsgIdRef = useRef<string | null>(null);
  const [lifeCategory, setLifeCategory] = useState<LifeCategory>("music");
  const [stagedFile, setStagedFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopPollRef = useRef<(() => void) | null>(null);
  // Job id backing the in-flight run (stream-stamped or async-started), so the
  // stop button can ask the bridge to cancel server-side work, not just drop
  // the local connection/poll loop (#81).
  const activeJobIdRef = useRef<string | null>(null);
  // Late-bound handle to resumePolling (declared below runStreaming) so a
  // dropped chat stream can hand off to job polling without a dependency cycle.
  const resumePollingRef = useRef<((jobId: string, assistantId: string) => void) | null>(null);

  // Debounced writer: a burst of state changes (streaming deltas, rapid taps)
  // collapses into one POST so token streaming doesn't hammer the backend.
  const saverRef = useRef<ReturnType<typeof debounce<[SessionSnapshot]>>>();
  if (!saverRef.current) {
    saverRef.current = debounce((snap: SessionSnapshot) => {
      void saveSession(snap);
    }, 800);
  }

  const placeholder = useMemo(() => {
    if (workflowActive) return "工作流編輯中——輸入內容會送到編輯器，按 ✕ 退出";
    if (scheduleActive) return "排程編輯中——輸入內容會送到排程器，按 ✕ 退出";
    return placeholderFor(mode, investmentSubmode, lifeCategory);
  }, [workflowActive, scheduleActive, mode, investmentSubmode, lifeCategory]);

  const refreshModelRoutes = useCallback(async () => {
    const res = await getModelRoutes();
    if (res.status === "ok") {
      setModelRoutes(res.routes);
      setVisionRoute(res.vision ?? null);
    }
  }, []);

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
      const explicitBackend =
        !!res.session &&
        typeof res.session === "object" &&
        typeof res.session.chat_backend === "string" &&
        res.session.chat_backend.length > 0;
      setMessages(st.messages);
      setMode(st.mode);
      setChatBackend(st.chatBackend);
      setRestoredChatBackendExplicit(explicitBackend);
      setInvestmentSubmode(st.investmentSubmode);
      if (res.status === "error") {
        setNotice("無法從本機還原工作階段，已開新對話。");
      }
      setRestored(true);

      // Attempt job reconnect. 生活 sentinels (music/bluetooth) are never pollable.
      const jobId = st.activeJobId;
      if (!jobId || LIFE_SENTINELS.has(jobId)) return;
      const targetMsg = [...st.messages].reverse().find(
        (m) => m.role === "assistant" && m.jobId === jobId,
      );
      if (!targetMsg) {
        setNotice("找到未完成任務，但找不到可更新的訊息，請重新執行 /research。");
        return;
      }

      let snap;
      try {
        snap = await pollJob(jobId);
      } catch {
        setNotice("無法確認未完成任務狀態（連線失敗），請稍後重試。");
        return;
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

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [routesRes, settingsRes] = await Promise.all([getModelRoutes(), getChatSettings()]);
      if (!alive) return;
      if (routesRes.status === "ok") {
        setModelRoutes(routesRes.routes);
        setVisionRoute(routesRes.vision ?? null);
      }
      if (settingsRes.status === "ok" && settingsRes.settings) {
        setChatSettings(settingsRes.settings);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!restored || restoredChatBackendExplicit || !chatSettings) return;
    setChatBackend(chatSettings.default_chat_provider);
  }, [restored, restoredChatBackendExplicit, chatSettings]);

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

  // 生活 mode: poll the now-playing song so the strip reflects auto-advancing
  // continuous playback. Only runs while 生活 is open to avoid idle traffic.
  useEffect(() => {
    if (mode !== "life") {
      setNowPlaying(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const name = await getNowPlaying();
      if (!cancelled) setNowPlaying(name);
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  const patch = useCallback((id: string, partial: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...partial } : m)));
  }, []);

  const buildRequest = useCallback(
    (text: string, history: ChatHistoryItem[] = [], extraAttachments?: Attachment[]): WebCommandRequest => {
      if (mode === "chat") {
        return {
          mode: "chat",
          submode: null,
          input: text,
          chat_backend: chatBackend,
          attachments: extraAttachments || [],
          source: SOURCE,
          history,
          session_id: getOrCreateSessionId(),
          conversation_id: CONVERSATION_ID,
        };
      }
      if (mode === "translation") {
        return {
          mode: "translation",
          submode: "text_translation",
          input: text,
          chat_backend: chatBackend,
          attachments: extraAttachments || [],
          source: SOURCE,
        };
      }
      return {
        mode: "investment",
        submode: investmentSubmode,
        input: text,
        attachments: extraAttachments || [],
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
          modelMetadata: res.model_metadata,
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
    async (
      req: WebCommandRequest,
      assistantId: string,
      onRedirect?: (intent: string, description: string, workflowId?: string) => void,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setGenerating(true);
      let acc = "";
      let procAcc = "";
      // Mutable container instead of a `let` variable: TypeScript's CFA can't
      // track `let` assignments inside async callbacks through try/finally, so
      // it narrows the variable to `never` after the block. Reading off a `const`
      // object property avoids that limitation.
      const rd: {
        redirect: { intent: string; description: string; workflowId?: string } | null;
        jobId: string | null;
        done: boolean;
        handedOff: boolean;
      } = { redirect: null, jobId: null, done: false, handedOff: false };
      try {
        await streamCommand(
          req,
          (event) => {
            if (event.type === "process") {
              procAcc += (procAcc ? "\n" : "") + event.text;
              patch(assistantId, { processText: procAcc });
            } else if (event.type === "job") {
              // Long run backed by a recovery job — stamp the message so a
              // reload (activeJobId) or a mid-stream drop can poll it (#81 PR3).
              rd.jobId = event.job_id;
              activeJobIdRef.current = event.job_id;
              patch(assistantId, { jobId: event.job_id });
            } else if (event.type === "delta") {
              acc += event.text;
              patch(assistantId, { text: acc });
            } else if (event.type === "done") {
              rd.done = true;
              patch(assistantId, {
                text: event.message || acc,
                status: "ok",
                modelMetadata: event.model_metadata,
                chatActions: event.actions,
                // Voice clarification card (#82): keep the originating voice
                // identity so the「都不是」fallback resend preserves it.
                clarification: event.clarification,
                ...(event.clarification
                  ? {
                      voiceUtteranceId: req.voice?.utterance_id,
                      voiceDurationMs: req.voice?.duration_ms,
                    }
                  : {}),
                generating: false,
              });
            } else if (event.type === "error") {
              patch(assistantId, {
                text: acc ? `${acc}\n\n[錯誤] ${event.message}` : event.message,
                status: "error",
                generating: false,
              });
            } else if (event.type === "redirect") {
              rd.redirect = { intent: event.intent, description: event.description, workflowId: event.workflow_id };
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          patch(assistantId, { generating: false }); // keep partial text
        } else if (!rd.done && rd.jobId && resumePollingRef.current) {
          // The stream dropped (e.g. mobile screen-lock kills the held NDJSON
          // connection) but the run is job-backed and still finishing on the
          // server. Recover the final answer by polling instead of surfacing a
          // transport error (#81 PR3).
          rd.handedOff = true;
          resumePollingRef.current(rd.jobId, assistantId);
        } else {
          patch(assistantId, {
            text: acc ? `${acc}\n\n[錯誤] ${String(err)}` : `無法連線到本機 command bridge（${String(err)}）`,
            status: "error",
            generating: false,
          });
        }
      } finally {
        // If redirect detected, keep generating=true — the redirect handler
        // calls runWorkflowCard which will clear it in its own finally.
        // If handed off to polling, resumePolling owns the generating flag.
        if (!rd.redirect && !rd.handedOff) {
          setGenerating(false);
          activeJobIdRef.current = null;
        }
        abortRef.current = null;
      }
      const ri = rd.redirect;
      if (ri !== null && onRedirect) {
        onRedirect(ri.intent, ri.description, ri.workflowId);
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
      activeJobIdRef.current = jobId;
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
            setNotice(snap.message || "研究任務因系統重啟而中斷，請重新執行 /research。");
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
        activeJobIdRef.current = null;
      }
    },
    [patch],
  );
  // Bind the late ref so runStreaming (declared above) can hand a dropped
  // chat stream off to job polling.
  resumePollingRef.current = resumePolling;

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
        activeJobIdRef.current = jobId;
        patch(assistantId, { jobId, generating: true });
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
          if (snap.job_status === "interrupted") {
            patch(assistantId, { generating: false });
            setNotice(snap.message || "任務已中斷。");
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
        activeJobIdRef.current = null;
      }
    },
    [patch],
  );

  // 生活 mode: run a music/bluetooth interaction (text query or callback button)
  // and render the backend's text + action buttons into the given message. The
  // sentinel jobId keeps the returned buttons live and routes their clicks back
  // through onAction → runMusicAction / runBluetoothAction.
  const runLifeCard = useCallback(
    async (
      assistantId: string,
      call: () => Promise<ActionResponse>,
      sentinel: string,
    ) => {
      setGenerating(true);
      try {
        const res = await call();
        patch(assistantId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          modeLabel: MODE_LABELS.life,
          actions: res.actions && res.actions.length ? res.actions : undefined,
          jobId: sentinel,
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

  // Workflow card: fetch an editor card response and patch msgId in place.
  // mayClose=true means this call is terminal (save/cancel) — workflowActive
  // is cleared even when the response carries no wfe: actions. mayClose=false
  // (default) keeps workflowActive=true for capture-mode responses (plain text
  // prompts with no wfe: buttons) so the next user message still routes here.
  const runWorkflowCard = useCallback(
    async (msgId: string, call: () => Promise<ActionResponse>, mayClose = false) => {
      setGenerating(true);
      try {
        const res = await call();
        const hasWfe = (res.actions ?? []).some((a) =>
          a.callback_data.startsWith("wfe:"),
        );
        patch(msgId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          modeLabel: MODE_LABELS.workflow,
          actions: res.actions?.length ? res.actions : undefined,
          jobId: WORKFLOW_JOB_ID,
          generating: false,
        });
        if (hasWfe) {
          setWorkflowActive(true);
        } else if (res.status === "error" || mayClose) {
          setWorkflowActive(false);
          workflowMsgIdRef.current = null;
        } else if (!res.actions?.length) {
          // No actions = editor is prompting for text (id / goal / step name).
          setWorkflowActive(true);
        } else {
          // Has non-wfe actions (e.g. list add_for_wf buttons) — not capture.
          // Keep workflowMsgIdRef so the card can still be updated by actions.
          setWorkflowActive(false);
        }
      } catch (err) {
        patch(msgId, {
          text: `無法連線到本機 command bridge（${String(err)}）`,
          status: "error",
          generating: false,
        });
        setWorkflowActive(false);
        workflowMsgIdRef.current = null;
      } finally {
        setGenerating(false);
      }
    },
    [patch],
  );

  const runWorkflowResultCard = useCallback(
    async (msgId: string, call: () => Promise<ActionResponse>) => {
      setGenerating(true);
      try {
        const res = await call();
        patch(msgId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          modeLabel: MODE_LABELS.workflow,
          actions: res.actions?.length ? res.actions : undefined,
          jobId: WORKFLOW_JOB_ID,
          generating: false,
        });
      } catch (err) {
        patch(msgId, {
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

  // Capture mode (scheduleActive=true) means the bridge is waiting for the user
  // to type slash commands into the chat input. It is ONLY open when the response
  // has no actions (pure text prompt) or only sh:done / sh:cancel buttons.
  // Generic sh:* buttons (list, time picker, run/toggle/delete) are interactive
  // controls that don't require text capture — opening capture there misdirects
  // subsequent chat messages to the schedule endpoint.
  const runScheduleCard = useCallback(
    async (msgId: string, call: () => Promise<ActionResponse>, mayClose = false) => {
      setGenerating(true);
      try {
        const res = await call();
        const actions = res.actions ?? [];
        const isCaptureMode =
          actions.length === 0
            ? res.status !== "error"
            : actions.every(
                (a) => a.callback_data === "sh:done" || a.callback_data === "sh:cancel",
              );
        patch(msgId, {
          text: res.message,
          status: res.status === "error" ? "error" : "ok",
          modeLabel: MODE_LABELS.schedule,
          actions: actions.length ? actions : undefined,
          jobId: SCHEDULE_JOB_ID,
          generating: false,
        });
        if (res.status === "error" || mayClose) {
          setScheduleActive(false);
          scheduleMsgIdRef.current = null;
        } else if (isCaptureMode) {
          setScheduleActive(true);
          scheduleMsgIdRef.current = msgId;
        } else {
          // Interactive sh: buttons (list / picker / management) — no capture.
          // Keep scheduleMsgIdRef so action buttons can re-open capture on the same card.
          setScheduleActive(false);
        }
      } catch (err) {
        patch(msgId, {
          text: `無法連線到本機 command bridge（${String(err)}）`,
          status: "error",
          generating: false,
        });
        setScheduleActive(false);
        scheduleMsgIdRef.current = null;
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
      void runLifeCard(assistantId, () => runMusicAction(callbackData), MUSIC_JOB_ID);
    },
    [generating, runLifeCard],
  );

  // 藍牙 scan button: append a fresh card and fill it with the scanned device
  // buttons (each connects via runBluetoothAction on tap).
  const onBluetoothScan = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
    ]);
    void runLifeCard(assistantId, () => runBluetoothScan(), BLUETOOTH_JOB_ID);
  }, [generating, runLifeCard]);

  // 家電 button: first IR shortcut for the ceiling light power toggle.
  const onAppliancePower = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
    ]);
    void runLifeCard(
      assistantId,
      () => runIrCommand("/ir send ceiling_light power"),
      APPLIANCE_JOB_ID,
    );
  }, [generating, runLifeCard]);

  // 家電 button: electric fan power toggle IR shortcut.
  const onFanPower = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
    ]);
    void runLifeCard(
      assistantId,
      () => runIrCommand("/ir send fan power"),
      APPLIANCE_JOB_ID,
    );
  }, [generating, runLifeCard]);

  // 家電 button: electric fan weaker/stronger IR shortcuts.
  const onFanWeaker = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
    ]);
    void runLifeCard(
      assistantId,
      () => runIrCommand("/ir send fan weaker"),
      APPLIANCE_JOB_ID,
    );
  }, [generating, runLifeCard]);

  const onFanStronger = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.life, generating: true },
    ]);
    void runLifeCard(
      assistantId,
      () => runIrCommand("/ir send fan stronger"),
      APPLIANCE_JOB_ID,
    );
  }, [generating, runLifeCard]);

  // 工作流 list button: shows all saved workflows; each card has "排程執行" buttons
  // (add_for_wf callbacks) dispatched via onAction → runScheduleCard.
  const onWorkflowList = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.workflow, generating: true },
    ]);
    void runWorkflowCard(assistantId, () => runWorkflowCommand("list"));
  }, [generating, runWorkflowCard]);

  // 排程 list button: shows current schedules with sh:* management buttons.
  const onScheduleList = useCallback(() => {
    if (generating) return;
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", modeLabel: MODE_LABELS.schedule, generating: true },
    ]);
    void runScheduleCard(assistantId, () => runScheduleHomeCommand(""));
  }, [generating, runScheduleCard]);

  const onSend = useCallback(
    async (text: string, voiceMeta?: VoiceRequestMetadata) => {
      if (generating) return;
      const lifeRoutesToChat = mode === "life" && lifeCategory !== "music";
      const chatLikeMode = mode === "chat" || lifeRoutesToChat;

      // Workflow capture: while an editor card is open, all input goes to
      // the workflow endpoint. The bridge routes it to the active capture field
      // or treats it as a new subcommand against the existing draft session.
      // The card is updated in place; a user message is appended for history.
      if (workflowActive && workflowMsgIdRef.current) {
        const cardId = workflowMsgIdRef.current;
        const wfUserMsg: Message = { id: uid(), role: "user", text, modeLabel: MODE_LABELS.workflow };
        setMessages((prev) => [...prev, wfUserMsg]);
        patch(cardId, { generating: true });
        void runWorkflowCard(cardId, () => runWorkflowCommand(text, chatBackend));
        return;
      }

      // Schedule capture: while a schedule card is in capture mode, input routes
      // to the schedule endpoint. "完成"/"done"/"結束" closes capture (mayClose=true).
      if (scheduleActive && scheduleMsgIdRef.current) {
        const cardId = scheduleMsgIdRef.current;
        const isDone = ["完成", "done", "結束"].includes(text.trim());
        const shUserMsg: Message = { id: uid(), role: "user", text, modeLabel: MODE_LABELS.schedule };
        setMessages((prev) => [...prev, shUserMsg]);
        patch(cardId, { generating: true });
        void runScheduleCard(cardId, () => runScheduleHomeCommand(text), isDone);
        return;
      }

      const label =
        chatLikeMode
          ? MODE_LABELS.chat
          : mode === "translation"
            ? MODE_LABELS.text_translation
            : mode === "life"
              ? MODE_LABELS.life
              : MODE_LABELS[investmentSubmode];
      const userMsg: Message = { id: uid(), role: "user", text, modeLabel: label };
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        modeLabel: label,
        generating: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (mode === "life" && lifeCategory === "music") {
        void runLifeCard(assistantId, () => runMusicCommand(text), MUSIC_JOB_ID);
        return;
      }

      const history = chatLikeMode ? buildChatHistory(messages) : [];
      let chatAttachments: Attachment[] | undefined;
      if (chatLikeMode && stagedFile) {
        const sf = stagedFile;
        URL.revokeObjectURL(sf.previewUrl);
        setStagedFile(null);
        try {
          const dataBase64 = await fileToBase64(sf.file);
          chatAttachments = [{
            type: "image",
            filename: sf.file.name,
            content_type: sf.file.type,
            data_base64: dataBase64,
          }];
        } catch { /* skip attachment on error */ }
      }
      const req = chatLikeMode
        ? {
            mode: "chat" as const,
            submode: null,
            input: text,
            chat_backend: chatBackend,
            attachments: chatAttachments || [],
            source: SOURCE,
            history,
            session_id: getOrCreateSessionId(),
            conversation_id: CONVERSATION_ID,
            // Voice provenance (#82): lets the bridge's voice-intent gate
            // clarify a short misrecognized control utterance before /search.
            ...(voiceMeta
              ? { input_source: "voice" as const, voice: voiceMeta }
              : {}),
          }
        : buildRequest(text, history);
      if (chatLikeMode) {
        // Backend embedding fast-path may emit a redirect event for workflow
        // creation requests. The onRedirect callback re-routes here without a
        // round-trip to the slow LLM router.
        void runStreaming(req, assistantId, (intent, description, workflowId) => {
          if (intent === "create_workflow") {
            workflowMsgIdRef.current = assistantId;
            void runWorkflowCard(assistantId, () => runWorkflowCommand(`create ${description}`, chatBackend));
          } else if (intent === "create_schedule") {
            scheduleMsgIdRef.current = assistantId;
            const cmd = workflowId ? `add_for_wf ${workflowId}` : "add";
            void runScheduleCard(assistantId, () => runScheduleHomeCommand(cmd));
          }
        });
      } else if (
        mode === "investment" &&
        investmentSubmode === "deep_product_research"
      ) {
        void runPolling(req, assistantId);
      } else {
        void runBlocking(req, assistantId, label);
      }
    },
    [generating, mode, lifeCategory, chatBackend, investmentSubmode, workflowActive, scheduleActive, messages, buildRequest, stagedFile, patch, runStreaming, runPolling, runBlocking, runLifeCard, runWorkflowCard, runScheduleCard],
  );

  const onTranscribe = useCallback(
    async (audio: Blob, durationMs: number) => {
      const res = await transcribeAudio(audio);
      const transcript = res.transcript?.trim();
      if (res.status !== "ok" || !transcript) {
        throw new Error(res.message || "語音轉文字失敗，請再試一次。");
      }
      // Deliberately enter through the same handler as typed input so active
      // mode, workflow/schedule capture, history, and NLP routing stay intact.
      // Voice provenance rides along so the bridge's #82 gate can clarify a
      // short misrecognized control utterance instead of running /search.
      await onSend(transcript, {
        utterance_id: res.utterance_id,
        duration_ms: durationMs > 0 ? Math.round(durationMs) : undefined,
        stt_language: res.language,
        stt_language_probability: res.language_probability,
      });
    },
    [onSend],
  );

  // Voice clarification card selection (#82 PR1). A candidate button submits
  // only the action_id — the bridge re-validates against its registry before
  // dispatching. The「都不是」fallback resends the original transcript as a
  // normal chat turn with clarification_declined so it is not re-gated.
  const onVoiceClarify = useCallback(
    async (messageId: string, selection: VoiceClarifySelection) => {
      if (generating) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.clarification || msg.clarificationResolved) return;
      patch(messageId, { clarificationResolved: true });
      if (selection.kind === "fallback") {
        void onSend(msg.clarification.transcript, {
          utterance_id: msg.voiceUtteranceId,
          duration_ms: msg.voiceDurationMs,
          clarification_declined: true,
        });
        return;
      }
      const userMsg: Message = {
        id: uid(),
        role: "user",
        text: selection.label,
        modeLabel: MODE_LABELS.chat,
      };
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        modeLabel: MODE_LABELS.chat,
        generating: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setGenerating(true);
      try {
        const res = await confirmVoiceAction(selection.actionId);
        patch(assistantId, {
          text: res.message,
          status: res.status,
          generating: false,
        });
      } catch (err) {
        patch(assistantId, {
          text: `動作執行失敗（${String(err)}）`,
          status: "error",
          generating: false,
        });
      } finally {
        setGenerating(false);
      }
    },
    [generating, messages, patch, onSend],
  );

  // Goal-loop control buttons (continue/stop/save) arrive as CommandAction on a
  // "done" stream event, not scoped to a jobId -- clicking one resends
  // action.input as the next chat turn while showing action.label as what the
  // user "said", mirroring onSend's chatLikeMode branch.
  const onChatAction = useCallback(
    (action: CommandAction) => {
      if (generating) return;
      const userMsg: Message = { id: uid(), role: "user", text: action.label, modeLabel: MODE_LABELS.chat };
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        modeLabel: MODE_LABELS.chat,
        generating: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      const history = buildChatHistory(messages);
      const req: WebCommandRequest = {
        mode: "chat",
        submode: null,
        input: action.input ?? action.label,
        chat_backend: chatBackend,
        attachments: [],
        source: SOURCE,
        history,
        session_id: getOrCreateSessionId(),
        conversation_id: CONVERSATION_ID,
      };
      void runStreaming(req, assistantId);
    },
    [generating, messages, chatBackend, runStreaming],
  );

  const onChatBackendChange = useCallback(
    (next: ChatBackend) => {
      setChatBackend(next);
      const route = modelRoutes.find((r) => r.backend === next);
      if (!route) {
        setNotice("已切換模型；實際路由資訊尚未載入。");
        return;
      }
      const configured = route.configured ? "" : "（尚未設定 API key，可能退回本地模型）";
      const vision = visionRoute
        ? `｜視覺池：${visionRoute.requested_provider}/${visionRoute.requested_model}`
        : "";
      setNotice(
        `已切換到 ${route.label}：${route.requested_model}${configured}${vision}`,
      );
    },
    [modelRoutes, visionRoute],
  );

  const onSaveModelSettings = useCallback(
    async (draft: ChatSettings) => {
      const localChanged = chatSettings?.providers.local.model !== draft.providers.local.model;
      if (localChanged && draft.providers.local.enabled) {
        setNotice(`正在重新載入本地模型：${draft.providers.local.model}`);
      }
      setSavingSettings(true);
      const res = await saveChatSettings(draft);
      setSavingSettings(false);
      if (res.status === "error" || !res.settings) {
        setNotice(`模型設定儲存失敗：${res.message ?? "未知錯誤"}`);
        return;
      }
      setChatSettings(res.settings);
      setChatBackend(res.settings.default_chat_provider);
      setSettingsOpen(false);
      await refreshModelRoutes();
      setNotice(res.local_reload?.message ?? res.message ?? "模型設定已儲存。");
    },
    [chatSettings, refreshModelRoutes],
  );

  const onSelectImage = useCallback(
    (file: File) => {
      if (generating) return;
      if (mode === "chat") {
        const previewUrl = URL.createObjectURL(file);
        setStagedFile({ file, previewUrl });
        return;
      }
      if (mode !== "translation") return;
      const userMsg: Message = { id: uid(), role: "user", text: `🖼 ${file.name}` };
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", text: "", modeLabel: "翻譯", generating: true },
      ]);
      void (async () => {
        let dataBase64: string;
        try {
          dataBase64 = await fileToBase64(file);
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: "讀取圖片失敗，請重新選擇。", status: "error", generating: false }
                : m,
            ),
          );
          return;
        }
        const req: WebCommandRequest = {
          mode: "translation",
          submode: "image_translation",
          input: "",
          attachments: [
            {
              type: "image",
              filename: file.name,
              content_type: file.type,
              data_base64: dataBase64,
            },
          ],
          source: SOURCE,
        };
        void runBlocking(req, assistantId, "翻譯");
      })();
    },
    [generating, mode, runBlocking],
  );

  const onStop = useCallback(() => {
    // Ask the bridge to cancel the server-side job FIRST — aborting the local
    // stream/poll alone leaves the goal loop / research worker running for
    // minutes on the Mac mini (#81). Fire-and-forget: the UI stop must not
    // wait on the network.
    const jobId = activeJobIdRef.current;
    if (jobId) {
      void cancelJob(jobId).then((res) => {
        if (res.status === "ok" && res.message) setNotice(res.message);
      });
    }
    abortRef.current?.abort();
    stopPollRef.current?.();
  }, []);

  const onExitWorkflow = useCallback(() => {
    if (generating || !workflowMsgIdRef.current) return;
    void runWorkflowCard(workflowMsgIdRef.current, () => runWorkflowAction("wfe:cancel"), true);
  }, [generating, runWorkflowCard]);

  const onExitSchedule = useCallback(() => {
    if (generating || !scheduleMsgIdRef.current) return;
    void runScheduleCard(scheduleMsgIdRef.current, () => runScheduleHomeAction("sh:cancel"), true);
  }, [generating, runScheduleCard]);

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

  const onRestartAll = useCallback(async () => {
    setConfirmRestart(false);
    const res = await restartAll();
    if (res.status !== "ok") {
      setNotice(`重啟龍蝦失敗：${res.message ?? "未知錯誤"}`);
      return;
    }
    setNotice(res.message ?? "已排程重啟龍蝦，請稍候重新連線。");
  }, []);

  // Click a research follow-up button (摘要 / 看市價 / …): switch the view in
  // place, keeping the buttons so the user can flip between views.
  const onAction = useCallback(
    async (messageId: string, jobId: string, callbackData: string) => {
      patch(messageId, { generating: true });
      // 生活 cards re-render in place via their own route, not the research
      // endpoint: music buttons (folder/song/favorite/volume) and bluetooth
      // buttons (connect a device / re-scan).
      if (jobId === MUSIC_JOB_ID) {
        await runLifeCard(messageId, () => runMusicAction(callbackData), MUSIC_JOB_ID);
        return;
      }
      if (jobId === BLUETOOTH_JOB_ID) {
        await runLifeCard(messageId, () => runBluetoothAction(callbackData), BLUETOOTH_JOB_ID);
        return;
      }
      if (jobId === APPLIANCE_JOB_ID) {
        await runLifeCard(messageId, () => runIrCommand(callbackData), APPLIANCE_JOB_ID);
        return;
      }
      if (jobId === WORKFLOW_JOB_ID) {
        // List buttons use wf:* callbacks; the editor uses wfe:* callbacks.
        if (callbackData.startsWith("wf:schedule:")) {
          const wfId = callbackData.slice("wf:schedule:".length);
          const schedId = uid();
          setMessages((prev) => [
            ...prev,
            { id: schedId, role: "assistant", text: "", modeLabel: MODE_LABELS.schedule, generating: true },
          ]);
          patch(messageId, { generating: false });
          await runScheduleCard(schedId, () => runScheduleHomeCommand(`add_for_wf ${wfId}`));
          return;
        }
        if (callbackData.startsWith("wf:run:")) {
          const wfId = callbackData.slice("wf:run:".length);
          const runId = uid();
          setMessages((prev) => [
            ...prev,
            { id: runId, role: "assistant", text: "", modeLabel: MODE_LABELS.workflow, generating: true },
          ]);
          patch(messageId, { generating: false });
          await runWorkflowResultCard(runId, () => runWorkflowCommand(`run ${wfId}`));
          return;
        }
        if (callbackData.startsWith("wf:rename:")) {
          const wfId = callbackData.slice("wf:rename:".length);
          workflowMsgIdRef.current = messageId;
          await runWorkflowCard(messageId, () => runWorkflowCommand(`rename ${wfId}`));
          return;
        }
        if (callbackData.startsWith("wf:delete:")) {
          const wfId = callbackData.slice("wf:delete:".length);
          await runWorkflowCard(messageId, async () => {
            const deleted = await runWorkflowCommand(`delete ${wfId}`);
            if (deleted.status === "error") return deleted;
            const listed = await runWorkflowCommand("list");
            return {
              ...listed,
              message: `${deleted.message}\n\n${listed.message}`,
              status: listed.status === "error" ? listed.status : deleted.status,
            };
          });
          return;
        }
        const mayClose = callbackData === "wfe:save" || callbackData === "wfe:cancel";
        await runWorkflowCard(messageId, () => runWorkflowAction(callbackData), mayClose);
        return;
      }
      if (jobId === SCHEDULE_JOB_ID) {
        const mayClose = callbackData === "sh:cancel" || callbackData === "sh:done";
        await runScheduleCard(messageId, () => runScheduleHomeAction(callbackData), mayClose);
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
    [patch, runLifeCard, runWorkflowCard, runWorkflowResultCard, runScheduleCard],
  );

  return (
    <div className="mx-auto flex h-full max-w-content flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-muted px-4 py-3">
        <h1 className="min-w-0 flex-1 whitespace-nowrap text-sm font-semibold sm:text-base">
          AkaNoClaw控制台
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-2 overflow-x-auto">
          {/* While one action is in its confirm state, hide the other button so
              the confirm/cancel controls are easier to tap (web UI request). */}
          {!confirmRestart &&
            (confirmClear ? (
              <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                <span className="whitespace-nowrap text-text/70">清除記憶？</span>
                <button
                  onClick={onClearMemory}
                  className="whitespace-nowrap rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  確定清除
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setConfirmRestart(false);
                  setConfirmClear(true);
                }}
                className="whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
                title="刪除本機已儲存的工作階段並清空對話"
              >
                清除記憶
              </button>
            ))}
          {!confirmClear &&
            (confirmRestart ? (
              <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                <span className="whitespace-nowrap text-text/70">重啟龍蝦？</span>
                <button
                  onClick={onRestartAll}
                  className="whitespace-nowrap rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
                >
                  確定重啟
                </button>
                <button
                  onClick={() => setConfirmRestart(false)}
                  className="whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setConfirmClear(false);
                  setConfirmRestart(true);
                }}
                className="whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
                title="安全重啟龍蝦本機服務"
              >
                重啟龍蝦
              </button>
            ))}
          {!confirmClear && !confirmRestart && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium text-text hover:bg-mutedHover"
              title="聊天模型設定"
              aria-label="聊天模型設定"
            >
              ⚙
            </button>
          )}
        </div>
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

      {(mode === "chat" || mode === "translation") && (
        <div className="border-b border-muted px-3 py-2">
          <ChatBackendSelector
            backend={chatBackend}
            onChange={onChatBackendChange}
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

      {mode === "life" && nowPlaying && (
        <div className="flex items-center gap-2 border-b border-muted bg-muted/40 px-4 py-1.5 text-xs text-text/70">
          <span aria-hidden>🎵</span>
          <span className="truncate" title={nowPlaying}>
            正在播放：{nowPlaying}
          </span>
        </div>
      )}

      {mode === "life" && (
        <div className="border-b border-muted px-3 py-3">
          <LifeActionPanel
            disabled={generating}
            category={lifeCategory}
            onMusicAction={onMusicPanel}
            onBluetoothScan={onBluetoothScan}
            onAppliancePower={onAppliancePower}
            onFanPower={onFanPower}
            onFanWeaker={onFanWeaker}
            onFanStronger={onFanStronger}
            onWorkflowList={onWorkflowList}
            onScheduleList={onScheduleList}
            onCategoryChange={setLifeCategory}
          />
        </div>
      )}

      <ConversationStream
        messages={messages}
        onAction={onAction}
        onChatAction={onChatAction}
        onVoiceClarify={onVoiceClarify}
        chatActionsDisabled={generating}
      />

      {stagedFile && mode === "chat" && (
        <div className="flex items-center gap-2 border-t border-muted bg-surface px-3 py-2">
          <img
            src={stagedFile.previewUrl}
            alt="preview"
            className="h-10 w-10 rounded object-cover"
          />
          <span className="flex-1 truncate text-xs text-text/70">{stagedFile.file.name}</span>
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(stagedFile.previewUrl);
              setStagedFile(null);
            }}
            className="rounded bg-muted px-2 py-1 text-xs text-text hover:bg-mutedHover"
          >
            ✕
          </button>
        </div>
      )}
      {workflowActive && (
        <CaptureModeChip mode="workflow" onExit={onExitWorkflow} />
      )}
      {scheduleActive && (
        <CaptureModeChip mode="schedule" onExit={onExitSchedule} />
      )}
      <InputBar
        placeholder={placeholder}
        mode={mode}
        generating={generating}
        onSend={onSend}
        onStop={onStop}
        onSelectImage={onSelectImage}
        onTranscribe={onTranscribe}
      />

      <ChatSettingsModal
        open={settingsOpen}
        settings={chatSettings}
        saving={savingSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveModelSettings}
      />
    </div>
  );
}
