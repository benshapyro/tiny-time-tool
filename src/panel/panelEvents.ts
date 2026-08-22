// S4: the wire contract between the "main" window (owns `QuickEntryController`
// + the real `TimerEngine`/`ShortcutController`, per `bootstrap.ts`) and the
// "panel" window (a separate webview/JS context — no shared memory, so this
// has to go over Tauri's cross-window event bus, `@tauri-apps/api/event`).
// `core:event:default` (listen/unlisten/emit/emit-to) is already included in
// `core:default`, already granted to both windows — no extra capability
// needed. Named here once so main/panel code can't drift on event-name
// string literals.
//
// The panel keeps its own local input state for immediate, round-trip-free
// typing (BUILD_SPEC design principle 1: "speed is the aesthetic") and only
// tells the main window what was typed (`PANEL_INPUT`) or committed
// (`PANEL_COMMIT`, which carries the text directly rather than trusting the
// last `PANEL_INPUT` to have already arrived). The main window pushes back
// only what the panel can't compute itself — autocomplete suggestions and
// the switch notice — via `PANEL_STATE`.

export const PANEL_STATE_EVENT = "panel:state";
export const PANEL_INPUT_EVENT = "panel:input";
export const PANEL_COMMIT_EVENT = "panel:commit";

export interface PanelInputPayload {
  text: string;
}

export interface PanelCommitPayload {
  text: string;
}
