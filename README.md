# aka_no_claw_web

Local-only mobile console for OpenClaw (龍蝦). A chat-first, mode-switching,
mobile-first single-operator UI. It talks to the **local command bridge** owned
by [`jojojen/aka_no_claw`](https://github.com/jojojen/aka_no_claw) (issue #30) —
it never reimplements command routing.

Contract / product spec: [`docs/LOCAL_MOBILE_CONSOLE_MVP.md`](docs/LOCAL_MOBILE_CONSOLE_MVP.md).

Before changing the web UI, read the contract above first. Mobile layout rules in
that document are part of the implementation boundary, not optional polish.

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

This app is local-only and single-user: no login, no cloud, no public hosting.
