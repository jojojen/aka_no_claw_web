# Local Mobile OpenClaw Console MVP

## Purpose

This document is the product, UX, visual, and implementation contract for the first `aka_no_claw_web` MVP.

The goal is to build a dedicated local-only Web App for OpenClaw that is optimized for one operator using a phone or browser on the same machine / LAN.

This document intentionally mirrors and expands the scope from:

```text
jojojen/aka_no_claw_web#1
jojojen/aka_no_claw#30
```

The Web App owns the UI and interaction model.

The core repo `jojojen/aka_no_claw` owns the local command bridge and existing command behavior.

---

## Product Positioning

`aka_no_claw_web` is a local mobile console for OpenClaw.

It is not a cloud product.
It is not a SaaS product.
It is not a multi-user dashboard.
It is not a login-based system.

The intended usage is:

```text
Desktop runs local OpenClaw services
Phone or browser connects through localhost or same-LAN address
One operator controls OpenClaw through a mobile-first UI
```

The app should feel like a clean local tool, not a public web platform.

---

## Core Product Principle

The interface should be:

```text
chat-first
mode-switching second
button-assisted
mobile-first
local-only
single-user
```

The user should not need to remember slash commands such as:

```text
/zh
/research
```

Instead, the active mode determines what the shared input box means.

The UX model is:

```text
Select mode
Type or upload content
App routes the request to the correct OpenClaw behavior
Result appears in one shared conversation stream
```

---

## Non-goals

Do not add these in the MVP:

- login
- OAuth
- cloud deployment
- public hosting
- multi-user state
- account system
- SaaS architecture
- remote database
- dashboard-heavy layout
- PWA / push notification
- camera integration
- watchlist
- full opportunity feed
- full result-card redesign
- complex analytics dashboards
- role-based permissions
- admin settings panels

This MVP is only about the first local mobile console with three modes:

```text
Chat
Translation
Investment Research
```

---

## Visual Direction

The visual style should follow `jojojen/jlpt-preparation-app`.

Use the same general design language:

```text
flat
simple
mobile-friendly
low-shadow
light background
large tappable buttons
small-radius rounded corners
muted gray-blue primary color
mint accent color
```

The UI should avoid looking like a generic SaaS dashboard.

Avoid:

- glossy gradients
- dense admin panels
- complex sidebars
- tiny desktop-first controls
- excessive shadows
- over-styled shadcn/default SaaS appearance
- noisy charts on the first screen

The app should look simple, calm, and utilitarian.

---

## Design Tokens

Use these as the initial design tokens:

```ts
export const theme = {
  text: "#333333",
  surface: "#f9f9f9",
  muted: "#e0e0e0",
  mutedHover: "#d1d1d1",
  primary: "#666b7a",
  accent: "#39d1b4",
  radius: "5px",
  maxContentWidth: "800px",
}
```

Suggested usage:

- `#333333`: primary text
- `#f9f9f9`: main surface / container background
- `#e0e0e0`: inactive buttons, option backgrounds
- `#d1d1d1`: hover / pressed muted state
- `#666b7a`: primary action background
- `#39d1b4`: active mode, selected state, progress accent
- `5px`: default border radius
- `800px`: max content width on desktop/tablet

---

## Layout Model

The app has one main screen.

Mobile-first layout:

```text
┌──────────────────────────────┐
│ OpenClaw                     │
├──────────────────────────────┤
│ [ Chat ] [ 翻譯 ] [ 投資研究 ] │
├──────────────────────────────┤
│                              │
│ Shared conversation stream   │
│                              │
│ user / assistant messages    │
│ mode results                 │
│ warnings                     │
│                              │
├──────────────────────────────┤
│ Mode-specific controls       │
├──────────────────────────────┤
│ input box              send  │
└──────────────────────────────┘
```

The top mode selector is always visible.

Only one mode can be active at a time.

Default mode:

```text
Chat
```

All modes share the same conversation stream.

---

## Main Interaction Model

The app has three top-level modes:

```text
Chat | 翻譯 | 投資研究
```

The mode selector is a segmented control, not a dashboard menu.

When a mode is active:

- its segment uses the accent color `#39d1b4`
- inactive segments use muted gray
- the input placeholder changes
- mode-specific controls may appear above the input
- the conversation stream remains shared

Mode switching must not clear the conversation.

---

## Mode 1 — Chat Mode

### Default State

When the app opens, it starts in Chat Mode.

Top selector:

```text
[ Chat ] 翻譯 投資研究
```

### Behavior

Text input behaves as normal chat.

The Web App should not automatically add slash commands in Chat Mode.

Example request intent:

```text
最近有什麼值得注意的？
```

Should be routed as a normal OpenClaw chat message.

### UI Requirements

- Chat Mode is the default mode.
- Input placeholder should be general, for example:

```text
輸入訊息...
```

- No image upload button is required in Chat Mode.
- No investment action panel is shown.

### Acceptance Criteria

- [ ] App opens in Chat Mode by default.
- [ ] Text input sends normal chat messages.
- [ ] Chat responses appear in the shared conversation stream.
- [ ] Switching away and back to Chat Mode does not clear the conversation.
- [ ] Chat Mode does not wrap input with `/zh` or `/research`.

---

## Mode 2 — Translation Mode

When the user taps `翻譯`, the selector becomes:

```text
Chat [ 翻譯 ] 投資研究
```

In Translation Mode, the shared input area changes meaning:

```text
all text input = translate to Traditional Chinese
all uploaded images = translate image content to Traditional Chinese
```

### Text Translation Behavior

If the user enters:

```text
これはペンです
```

The backend request should be semantically equivalent to:

```text
/zh これはペンです
```

The user should not need to type `/zh`.

### Text Translation UI

Input placeholder should make the behavior obvious:

```text
翻譯成繁體中文...
```

The conversation stream should visually indicate the result came from Translation Mode.

For example, a small mode label is enough:

```text
翻譯
```

### Image Translation Behavior

Translation Mode should show an image upload button near the input area:

```text
[ 選擇圖片 ]
```

Behavior:

1. User taps the button.
2. Local file picker opens.
3. User selects an image from the local device.
4. Image is sent to the backend as a translation target.
5. Backend translates image content into Traditional Chinese if supported.
6. Result appears in the shared conversation stream.

### Image Translation Constraints

- Use local file picker only.
- Do not add camera integration in this MVP.
- Do not add cloud upload storage.
- If backend support is missing, show a clear unsupported message.

### Unsupported Fallback

If image translation is not available through the local command bridge yet, the UI should render a normal message with something like:

```text
圖片翻譯目前尚未由本地 command bridge 支援。
```

It should not silently fail.

### Acceptance Criteria

- [ ] Text entered in Translation Mode routes to existing `/zh` behavior.
- [ ] The user does not need to type `/zh`.
- [ ] Result appears in the shared conversation stream.
- [ ] UI clearly indicates Translation Mode is active.
- [ ] Image upload button appears only when Translation Mode is active.
- [ ] User can select a local image file.
- [ ] Selected image is sent to backend.
- [ ] If image translation is unsupported, UI shows a clear message.
- [ ] No camera integration is required.
- [ ] No cloud upload service is introduced.

---

## Mode 3 — Investment Research Mode

When the user taps `投資研究`, the selector becomes:

```text
Chat 翻譯 [ 投資研究 ]
```

Investment Mode shows a small mode-specific action area above the input box.

Initial buttons:

```text
[ 商品深入研究 ]
[ 賣家信譽快照 ]
```

Only these two buttons are required for this MVP.

---

## Investment Submode A — 商品深入研究

When the user taps:

```text
商品深入研究
```

The UI enters `Deep Product Research` submode.

### Input Meaning

The input box now means:

```text
Paste a product URL or type a product name to run deep product research.
```

Placeholder:

```text
貼上商品 URL 或輸入商品名稱...
```

### Routing Behavior

If the user pastes a URL:

```text
https://jp.mercari.com/item/...
```

It should route as:

```text
/research https://jp.mercari.com/item/...
```

If the user enters plain text:

```text
寶可夢 黑炎支配者 BOX
```

It should route as:

```text
/research 寶可夢 黑炎支配者 BOX
```

The user should not need to type `/research`.

### UI Requirements

- The active submode should be visually clear.
- `商品深入研究` should look selected when active.
- Results should appear in the shared conversation stream.
- Long outputs must remain readable on mobile.
- Errors should appear as messages, not browser alerts.

### Acceptance Criteria

- [ ] `商品深入研究` button appears in Investment Mode.
- [ ] Tapping it changes the input placeholder and active submode.
- [ ] URL input routes to existing `/research <url>` behavior.
- [ ] Text input routes to existing `/research <text>` behavior.
- [ ] The user does not need to type `/research`.
- [ ] Result appears in shared conversation stream.
- [ ] Errors are shown clearly in the conversation stream.

---

## Investment Submode B — 賣家信譽快照

When the user taps:

```text
賣家信譽快照
```

The UI enters `Seller Reputation Snapshot` submode.

### Input Meaning

The input box now means:

```text
Paste a seller URL or seller identifier to run a seller reputation snapshot.
```

Placeholder:

```text
貼上賣家 URL 或輸入賣家識別資訊...
```

### Routing Behavior

Input should be routed to the existing seller reputation / snapshot capability if available.

This MVP should not invent a new seller reputation engine.

If backend support is missing, the UI should show a structured unsupported response.

Example message:

```text
賣家信譽快照目前尚未由本地 command bridge 支援。
```

### Acceptance Criteria

- [ ] `賣家信譽快照` button appears in Investment Mode.
- [ ] Tapping it changes the input placeholder and active submode.
- [ ] Input is sent as a seller reputation snapshot request.
- [ ] If backend support is missing, the UI displays a clear unsupported message.
- [ ] The app does not silently fail.

---

## Shared Conversation Stream

All modes write into one shared conversation stream.

The user should be able to do this:

```text
1. Chat normally
2. Switch to Translation Mode
3. Translate text or an image
4. Switch to Investment Mode
5. Run 商品深入研究
6. Switch back to Chat Mode
7. Ask follow-up questions
```

The stream should not be cleared by mode switching.

### Message Metadata

Each assistant result should be able to indicate the producing mode:

```text
Chat
翻譯
商品深入研究
賣家信譽快照
```

The label should be visually subtle but clear.

### Error Handling

Errors and warnings appear as messages in the stream.

Do not use browser alerts for normal command errors.

### Acceptance Criteria

- [ ] Mode switching does not clear messages.
- [ ] Each result visually indicates which mode produced it.
- [ ] Errors and warnings appear as messages, not browser alerts.
- [ ] Long responses are readable on mobile.
- [ ] User can scroll the stream naturally on mobile.

---

## Dynamic Actions

The MVP does not need full dynamic UI generation yet, but the response model should leave room for it.

The frontend should support a basic response shape like:

```ts
type CommandResponse = {
  status: "ok" | "partial" | "error" | "unsupported"
  message: string
  mode?: "chat" | "translation" | "investment"
  submode?: string | null
  actions?: Array<{
    label: string
    command: string
    input?: string
  }>
  warnings?: string[]
  sources?: Array<{
    source_id?: string
    title?: string
    url?: string
    domain?: string
  }>
}
```

For MVP, rendering `message` is enough.

If `actions` are present, render them as simple flat buttons.

Unknown actions should not crash the UI.

### Acceptance Criteria

- [ ] Frontend has a response type that can later support dynamic actions.
- [ ] Unknown actions do not crash the UI.
- [ ] MVP can render plain text responses reliably.
- [ ] Optional action buttons use the same flat visual style.

---

## Backend Contract

The frontend should talk to a local backend endpoint provided by `aka_no_claw`.

Suggested endpoint:

```text
POST /api/command
```

Text-only requests can use JSON.

Image requests can use multipart upload.

The semantic contract should remain equivalent to the examples below.

### Chat Request

```json
{
  "mode": "chat",
  "submode": null,
  "input": "最近有什麼值得注意的？",
  "attachments": [],
  "source": "aka_no_claw_web"
}
```

### Text Translation Request

```json
{
  "mode": "translation",
  "submode": "text_translation",
  "input": "これはペンです",
  "attachments": [],
  "source": "aka_no_claw_web"
}
```

### Image Translation Request

```json
{
  "mode": "translation",
  "submode": "image_translation",
  "input": "",
  "attachments": [
    {
      "type": "image",
      "filename": "example.jpg",
      "content_type": "image/jpeg"
    }
  ],
  "source": "aka_no_claw_web"
}
```

### Product Research Request

```json
{
  "mode": "investment",
  "submode": "deep_product_research",
  "input": "https://jp.mercari.com/item/...",
  "attachments": [],
  "source": "aka_no_claw_web"
}
```

### Seller Snapshot Request

```json
{
  "mode": "investment",
  "submode": "seller_reputation_snapshot",
  "input": "seller url or id",
  "attachments": [],
  "source": "aka_no_claw_web"
}
```

### Acceptance Criteria

- [ ] Frontend can send text command requests.
- [ ] Frontend can send image attachment requests.
- [ ] Backend returns structured JSON.
- [ ] Backend errors are surfaced in UI.
- [ ] The Web App does not import unstable internal handlers directly.

---

## Local-only Runtime

The app is local-only.

Allowed runtime modes:

```text
127.0.0.1 only
LAN mode for phone access
```

Expected usage:

```text
desktop runs local server
phone connects via same Wi-Fi / LAN IP
```

Examples:

```text
http://127.0.0.1:<port>
http://192.168.x.x:<port>
```

### Runtime Requirements

- Default host should be localhost.
- LAN binding must be explicit.
- Documentation should explain phone access on the same Wi-Fi.
- No cloud deployment instructions are required for MVP.

### Acceptance Criteria

- [ ] Default host is localhost.
- [ ] LAN binding is opt-in.
- [ ] Documentation explains how to open the app from a phone on the same Wi-Fi.
- [ ] No cloud deployment instructions are required.

---

## Suggested Tech Stack

Frontend:

```text
React
Vite
TypeScript
Tailwind CSS with custom jlpt-inspired tokens
```

Backend:

```text
FastAPI-compatible local server
Pydantic-style response/request models
local command bridge to OpenClaw
```

Streaming is not required for this issue.

SSE can be added later.

Rust is not recommended for the first MVP because the primary work is UI iteration and integration with Python-based OpenClaw behavior.

Rust can be considered later for performance-critical workers or local services if needed.

---

## Required UI Components

Minimum components:

```text
ModeToggle
ConversationStream
MessageBubble
InputBar
AttachmentButton
InvestmentActionPanel
FlatActionButton
ErrorMessage
```

### ModeToggle

- three options: Chat / 翻譯 / 投資研究
- active mode uses accent color `#39d1b4`
- inactive modes use muted gray background
- always visible near top
- should be easy to tap on phone

### ConversationStream

- shared across all modes
- scrollable
- readable long messages
- supports mode labels
- supports error/warning messages

### MessageBubble

- user messages visually distinct from assistant messages
- keep styling flat and readable
- avoid heavy shadows
- support long text wrapping

### InputBar

- fixed near bottom on mobile
- placeholder changes by mode/submode
- supports submit button
- supports image upload button only in Translation Mode

### AttachmentButton

- visible in Translation Mode
- opens local file picker
- accepts image files
- no camera integration in MVP

### InvestmentActionPanel

- visible only in Investment Mode
- shows two flat buttons:
  - 商品深入研究
  - 賣家信譽快照
- selected submode should be visually clear

### FlatActionButton

- large tappable target
- primary color for main submit buttons
- accent color for active/selected state
- muted gray for inactive states

### ErrorMessage

- rendered inside conversation stream
- user-readable
- no raw stack traces

---

## Suggested File Structure

This is only a suggested structure. Agents may adjust if justified.

```text
aka_no_claw_web/
  README.md
  docs/
    LOCAL_MOBILE_CONSOLE_MVP.md
  frontend/
    package.json
    index.html
    src/
      main.tsx
      App.tsx
      components/
        ModeToggle.tsx
        ConversationStream.tsx
        MessageBubble.tsx
        InputBar.tsx
        AttachmentButton.tsx
        InvestmentActionPanel.tsx
        FlatActionButton.tsx
        ErrorMessage.tsx
      api/
        commandClient.ts
      types/
        command.ts
      styles/
        theme.ts
        index.css
  backend/
    app.py
    models.py
    command_bridge.py
```

---

## MVP Acceptance Criteria

- [ ] App starts in Chat Mode.
- [ ] Top mode toggle includes Chat / 翻譯 / 投資研究.
- [ ] Chat Mode sends normal chat input.
- [ ] Translation Mode routes text as `/zh` behavior.
- [ ] Translation Mode supports selecting a local image file for image translation.
- [ ] Investment Mode shows `商品深入研究` and `賣家信譽快照`.
- [ ] 商品深入研究 routes input as `/research <input>`.
- [ ] 賣家信譽快照 has a UI route and clear backend-not-ready fallback if unsupported.
- [ ] All modes share one conversation stream.
- [ ] Mode switching does not clear conversation.
- [ ] UI follows `jlpt-preparation-app` inspired flat style.
- [ ] No login, cloud, public hosting, or multi-user state is introduced.
- [ ] Local-only usage is documented.
- [ ] The Web App communicates through the local command bridge contract.

---

## Definition of Done

A user can open the local mobile web console, leave it in Chat Mode by default, switch to Translation Mode to translate text or a local image, and switch to Investment Mode to run deep product research without typing slash commands.

The UI is mobile-friendly, flat, and visually aligned with `jlpt-preparation-app`.

The app remains local-only and single-user.

The frontend talks to OpenClaw through a stable local command bridge rather than directly coupling itself to unstable internal handlers.
