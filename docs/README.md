# Aka No Claw Web Documentation Map

Last reviewed: 2026-07-17
Status: Current
Owner area: Web application

## Start Here

| Document | Status | Purpose |
|---|---|---|
| [LOCAL_MOBILE_CONSOLE_MVP.md](LOCAL_MOBILE_CONSOLE_MVP.md) | Current | Product, UX, visual, local-only, and mobile layout contract. |
| [AGENT_CONTROL_PLANE_IMPLEMENTATION_PLAN.md](AGENT_CONTROL_PLANE_IMPLEMENTATION_PLAN.md) | Planned | Detailed event-driven Web architecture and execution plan for issue [#12](https://github.com/jojojen/aka_no_claw_web/issues/12). |
| [LEARNING_PATH_FOR_OPENCLAW_WEB.md](LEARNING_PATH_FOR_OPENCLAW_WEB.md) | Current | Learning path for the current frontend stack. |

## Cross-Repository Program Map

The Bridge owns authority and safety; the Web owns projection and interaction.
Implementation order:

1. [`aka_no_claw#84`](https://github.com/jojojen/aka_no_claw/issues/84) — append-only session/run event spine and cursor recovery.
2. [`aka_no_claw_web#12`](https://github.com/jojojen/aka_no_claw_web/issues/12) W1-W4 — event reducer, reconnect, Run Manager, and Task Sheet.
3. [`aka_no_claw#85`](https://github.com/jojojen/aka_no_claw/issues/85) — manifest-bound dynamic-tool approval; then Web W6.
4. [`aka_no_claw#86`](https://github.com/jojojen/aka_no_claw/issues/86) — durable prompt queue and safe interjections; then Web W5.
5. [`aka_no_claw#87`](https://github.com/jojojen/aka_no_claw/issues/87) — grounded context compaction; then Web W7.
6. Web W8 — remove legacy polling/sentinel paths only after compatibility gates pass.

Backend detailed plans live under `jojojen/aka_no_claw/docs/`:

- `WEB_SESSION_RUN_EVENT_SPINE_IMPLEMENTATION_PLAN.md`
- `WEB_DYNAMIC_TOOL_APPROVAL_IMPLEMENTATION_PLAN.md`
- `WEB_PROMPT_QUEUE_IMPLEMENTATION_PLAN.md`
- `WEB_CONVERSATION_COMPACTION_IMPLEMENTATION_PLAN.md`

Planned documents describe intended work, not shipped runtime behavior. The
current production contract remains `LOCAL_MOBILE_CONSOLE_MVP.md` plus the
actual bridge/Web code and tests until each issue is implemented and verified.
