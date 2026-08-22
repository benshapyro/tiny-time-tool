// S5: the wire contract between the "main" window (owns `PopoverController`
// + the real `TimerEngine`, per `bootstrap.ts`) and the "popover" window —
// a separate webview/JS context, same reasoning as `panelEvents.ts`: no
// shared memory, so this goes over Tauri's cross-window event bus
// (`@tauri-apps/api/event`). `core:event:default` is already part of
// `core:default`, already granted to every window in
// `src-tauri/capabilities/default.json` — no extra capability needed.
//
// The popover has no local state of its own worth keeping across a
// round-trip (unlike the quick-entry panel's typed text, which must feel
// instant) — every action is a single click that goes straight to the
// engine, so a plain "here's what I'd like to do" event is enough; the main
// window pushes back the recomputed `PopoverState` after handling it.

export const POPOVER_STATE_EVENT = "popover:state";
export const POPOVER_ACTION_EVENT = "popover:action";

export type PopoverActionKind = "start" | "pause" | "resume" | "switch" | "stop";

export interface PopoverActionPayload {
  action: PopoverActionKind;
}
