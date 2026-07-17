import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Mode } from "../types/command";
import { FlatActionButton } from "./FlatActionButton";
import { AttachmentButton } from "./AttachmentButton";

type Props = {
  placeholder: string;
  mode: Mode;
  generating: boolean;
  onSend: (text: string) => void;
  onQueue?: (text: string) => void;
  onInterject?: (text: string) => void;
  queueAllowed?: boolean;
  onStop: () => void;
  onSelectImage: (file: File) => void;
  // durationMs is measured by the recorder (aka_no_claw#82): the backend's
  // voice-intent gate uses it as a structural short-utterance signal.
  onTranscribe: (audio: Blob, durationMs: number) => Promise<void>;
};

const MAX_RECORDING_MS = 60_000;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export function InputBar({
  placeholder,
  mode,
  generating,
  onSend,
  onQueue = onSend,
  onInterject,
  queueAllowed = true,
  onStop,
  onSelectImage,
  onTranscribe,
}: Props) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Single-line stays at the h-11 baseline (aligned with the buttons);
  // multi-line input grows the box up to max-h-40.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Clear any previous multi-line height first. The CSS min-h-11 is the
    // single-line source of truth, so an empty or one-line composer stays
    // exactly aligned with the neighbouring 44px controls.
    el.style.height = "";
    if (el.scrollHeight > el.offsetHeight) {
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [value]);

  const releaseMicrophone = () => {
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state === "recording") recorder.stop();
    }
    releaseMicrophone();
  }, []);

  useEffect(() => {
    if (!generating || !recording) return;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, [generating, recording]);

  const startRecording = async () => {
    if (generating || transcribing) return;
    setAudioError(null);
    if (
      window.isSecureContext !== true ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setAudioError("此連線無法直接錄音，請改用 HTTPS 開啟 Web UI。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const candidates = isIOS
        ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
        : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = candidates.find(
        (candidate) => typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(candidate),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setAudioError("錄音失敗，請再試一次。");
        setRecording(false);
        releaseMicrophone();
      };
      recorder.onstop = () => {
        setRecording(false);
        releaseMicrophone();
        if (chunks.length === 0) {
          setAudioError("沒有錄到音訊，請再試一次。");
          return;
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (audio.size > MAX_AUDIO_BYTES) {
          setAudioError("音訊檔案過大，請縮短錄音後再試一次。");
          return;
        }
        const durationMs = Date.now() - startedAt;
        setTranscribing(true);
        void onTranscribe(audio, durationMs)
          .catch((err) => {
            setAudioError(err instanceof Error ? err.message : "語音轉文字失敗，請再試一次。");
          })
          .finally(() => setTranscribing(false));
      };
      // A timeslice prevents one large in-memory encoder buffer on longer
      // recordings while still assembling one Blob for the multipart upload.
      recorder.start(1000);
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
      setRecording(true);
    } catch (err) {
      releaseMicrophone();
      const denied = err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setAudioError(denied ? "無法使用麥克風，請允許瀏覽器的麥克風權限。" : "無法啟動麥克風，請再試一次。");
    }
  };

  const toggleRecording = () => {
    if (recording) {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      return;
    }
    void startRecording();
  };

  const submit = (intent: "next_turn" | "interjection" = "next_turn") => {
    const text = value.trim();
    if (!text || (generating && !queueAllowed)) return;
    if (generating && intent === "interjection" && onInterject) onInterject(text);
    else if (generating) onQueue(text);
    else onSend(text);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-muted bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
        <div
          data-testid="input-accessories"
          className={`${inputFocused ? "hidden sm:flex" : "flex"} shrink-0 items-end gap-2`}
        >
          {(mode === "translation" || mode === "chat") && (
            <AttachmentButton onSelect={onSelectImage} disabled={generating} />
          )}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={generating || transcribing}
            aria-label={recording ? "停止錄音" : transcribing ? "語音轉文字中" : "開始語音輸入"}
            title={recording ? "停止錄音" : "開始錄音"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors disabled:cursor-default disabled:opacity-50 ${
              recording ? "animate-pulse bg-red-600 text-white" : "bg-muted text-text hover:bg-mutedHover"
            }`}
          >
            {recording ? (
              <svg
                data-icon="stop-recording"
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
              >
                <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />
              </svg>
            ) : transcribing ? (
              <svg
                data-icon="transcribing"
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 animate-pulse"
              >
                <circle cx="5" cy="12" r="1.7" fill="currentColor" />
                <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                <circle cx="19" cy="12" r="1.7" fill="currentColor" />
              </svg>
            ) : (
              <svg
                data-icon="microphone"
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
                <path d="M12 17.5V21" />
                <path d="M8.5 21h7" />
              </svg>
            )}
          </button>
        </div>
        <textarea
          ref={textareaRef}
          rows={1}
          enterKeyHint="enter"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
            setInputFocused(true);
          }}
          onBlur={() => {
            // Let a pending send-button click complete before the mobile
            // accessories reappear and change the row's geometry.
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
            blurTimerRef.current = setTimeout(() => setInputFocused(false), 0);
          }}
          className="min-w-40 max-h-40 min-h-11 flex-1 resize-none overflow-y-auto rounded border border-muted bg-white px-3 py-2 text-base leading-6 outline-none focus:border-primary sm:min-w-0"
        />
        <div
          data-testid="input-actions"
          className={`flex shrink-0 items-end gap-2 ${generating ? "max-sm:w-full max-sm:justify-between" : ""}`}
        >
          {generating ? (
            <>
              <FlatActionButton variant="muted" className="h-11 shrink-0 max-sm:flex-1" onClick={onStop}>停止</FlatActionButton>
              {onInterject && <FlatActionButton variant="muted" className="h-11 shrink-0 max-sm:flex-1" onClick={() => submit("interjection")}>補充</FlatActionButton>}
              <FlatActionButton variant="primary" className="h-11 shrink-0 max-sm:flex-1" onClick={() => submit("next_turn")}>排隊</FlatActionButton>
            </>
          ) : (
            <FlatActionButton variant="primary" className="h-11 shrink-0" onClick={() => submit()}>
              送出
            </FlatActionButton>
          )}
        </div>
      </div>
      {recording && (
        <p role="status" className="mt-2 text-xs text-red-700">錄音中，再按一次停止並轉成文字。</p>
      )}
      {transcribing && (
        <p role="status" className="mt-2 text-xs text-text/70">正在用本機模型轉成文字…</p>
      )}
      {audioError && (
        <p role="alert" className="mt-2 text-xs text-red-700">{audioError}</p>
      )}
    </div>
  );
}
