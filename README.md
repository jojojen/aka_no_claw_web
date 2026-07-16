# aka_no_claw_web

Local-only mobile console for OpenClaw (龍蝦). A chat-first, mode-switching,
mobile-first single-operator UI. It talks to the **local command bridge** owned
by [`jojojen/aka_no_claw`](https://github.com/jojojen/aka_no_claw) (issue #30) —
it never reimplements command routing.

Contract / product spec: [`docs/LOCAL_MOBILE_CONSOLE_MVP.md`](docs/LOCAL_MOBILE_CONSOLE_MVP.md).

Before changing the web UI, read the contract above first. Mobile layout rules in
that document are part of the implementation boundary, not optional polish.

## Architecture plans

- [`docs/AGENT_CONTROL_PLANE_IMPLEMENTATION_PLAN.md`](docs/AGENT_CONTROL_PLANE_IMPLEMENTATION_PLAN.md)
  is the detailed, phased plan for cursor-replayable session events, multiple
  run projection, the mobile Task Sheet, prompt queue, approval cards, context
  compaction controls, and incremental `App.tsx` decomposition (issue #12).
- [`docs/README.md`](docs/README.md) maps the Web plan to its four backend
  implementation plans in `jojojen/aka_no_claw`.

## Modes

- **Chat** — pure chat (Phase 1, no tool calls). Pick the backend: `本地模型`
  (local Ollama) or `cloud pickle` (big-pickle). Responses stream.
- **翻譯 (Translation)** — text routes to the existing `/zh` handler. Image
  translation is `unsupported` until the bridge exposes a file route.
- **投資研究 (Investment)** — `商品深入研究` routes to `/research`; `賣家信譽快照`
  is `unsupported` for the MVP.

All modes share one conversation stream; switching modes never clears it.

## Run locally

1. Start the backend command bridge (in the `aka_no_claw` repo):

   ```
   # localhost only (default)
   python -m openclaw_adapter command-bridge
   # or, for phone access on the same Wi-Fi:
   python -m openclaw_adapter command-bridge --lan
   ```

   The bridge listens on `http://127.0.0.1:8781` by default.

2. Start the frontend dev server (in this repo):

   ```
   cd frontend
   npm install
   npm run dev
   ```

   Vite serves on `http://127.0.0.1:5173` and proxies `/api/*` to the bridge.
   Override the bridge URL with `OPENCLAW_BRIDGE_URL` if needed.

### Open from a phone (same Wi-Fi)

Run the bridge with `--lan` and start Vite with LAN binding:

```
LAN=1 npm run dev
```

Then open `http://<your-mac-LAN-IP>:5173` from the phone. Both the bridge and the
dev server restrict clients to loopback, the mesh VPN CGNAT range, and (only when
LAN/`--lan` is enabled) the private LAN — never the public internet.

### HTTPS for microphone recording on phones

Phone browsers only expose `getUserMedia({ audio: true })` on a trusted HTTPS
origin. Plain LAN HTTP cannot start microphone-only recording; on iOS, WebKit
may even treat an `audio/*` file capture as video capture. Set up a trusted
local certificate once:

```bash
brew install mkcert
mkcert -install
cd frontend
mkdir -p .cert
mkcert -cert-file .cert/cert.pem -key-file .cert/key.pem \
  localhost 127.0.0.1 <your-mac-LAN-IP>
LAN=1 npm run dev
```

Vite automatically enables HTTPS when `.cert/key.pem` and `.cert/cert.pem`
exist. To keep certificates elsewhere, set `OPENCLAW_HTTPS_KEY` and
`OPENCLAW_HTTPS_CERT`. Install mkcert's `rootCA.pem` on the phone once and enable
full trust for it, then open `https://<your-mac-LAN-IP>:5173`. Certificate files
and private keys stay local and are ignored by git.

## Voice input

Tap the line-style microphone button beside the shared input box to dictate a message. Voice
input follows the same active mode and the same `onSend` path as typed text, so
the returned transcript continues through the existing natural-language
processing, conversation history, and command routing.

- On `localhost` or an HTTPS origin, the browser uses `MediaRecorder`: tap once
  to start and again to stop. Live recording stops automatically after 60
  seconds and always releases the microphone afterward.
- Plain LAN HTTP (for example `http://<your-mac-LAN-IP>:5173`) is not a secure
  browser context, so `getUserMedia` is unavailable. The microphone button will
  show an error instead of opening a file or camera picker; use an HTTPS URL to
  record directly from a phone.
- Audio is limited to 15 MB in the Web UI. Android/Chrome normally records WebM;
  iPhone/iPad Safari normally records MP4/M4A. Both are accepted by the bridge.

Transcription runs locally in the `aka_no_claw` command bridge with the free,
open-source `faster-whisper` model. The first voice request downloads the
configured model into the bridge's local cache and can therefore take longer;
later requests reuse the loaded model. Audio is not sent to a cloud speech API.

This app is local-only and single-user: no login, no cloud, no public hosting.
