# tiny-time-tool

A deliberately tiny, world-class cross-platform (macOS + Windows) time tracker for Cadre's solution team. Tauri v2 + React + TypeScript strict + SQLite. Full English **and** Spanish. Light **and** dark.

**The spec is canonical:** `docs/specs/2026-08-21-tiny-time-tool/BUILD_SPEC.md`. Never edit files under `docs/specs/` — if the spec seems wrong, stop and tell the human. Decisions already made live in `decisions.md` there; do not relitigate them.

## Non-negotiables (the ones that change behavior)

1. **Zero network, deny-by-default.** The app never makes a network request. CSP `default-src 'self'`; every new dependency must be added to `deps-allowlist.txt` in the same PR; no `std::net`, `std::process::Command`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` outside `src-tauri/src/os_integration.rs`. "Check for updates" opens the browser via the opener plugin.
2. **Notification action buttons do not exist on desktop Tauri** (mobile-only API). Notifications are nudges; clicking one opens the popover. Do not attempt actions on the notification itself.
3. **Playwright cannot drive native Tauri windows.** CI tests = Vitest + Testing Library against components and internal interfaces; OS-level behavior (real shortcut press, real notification, tray anchoring) = named manual checks at the S14 gate.
4. **Every UI string goes through the i18n layer** (en + es both complete); **every style value comes from the design tokens**. No hardcoded user-visible text, colors, or spacing — the lint enforces the first.
5. **Tests are written failing first**, per slice, and never deleted or narrowed to pass. Commit after each slice passes its check. Stop and end the turn at every `[HUMAN GATE]`.
6. **Speed is the aesthetic.** The timer starts at the shortcut press — before any UI finishes. If polish and speed conflict, speed wins. Design principles: BUILD_SPEC.md § Design principles.

## Commands

- `npm ci` then `npm test` (Vitest) · `cargo test` (in `src-tauri/`)
- `npm run tauri dev` — run the app locally · `npm run tauri build` — local installer
- CI builds both platforms on push (`.github/workflows/`)
