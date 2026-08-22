// S6: the wire contract between the "main" window (owns `LogController` +
// the real `TimerEngine`, per `bootstrap.ts`) and the Dashboard's Log tab
// content. Same event-bus shape as `popoverEvents.ts`/`panelEvents.ts` for
// consistency, even though the Log tab happens to render in the same
// window as `bootstrap.ts` runs in (unlike the popover/panel, which are
// genuinely separate webviews) — using the identical push/dispatch pattern
// means there is exactly one way this app wires a controller to a live
// window, not two, and `LogContainer.tsx` stays exercisable the same way
// (live, at the S14 gate) as its siblings.

export const LOG_STATE_EVENT = "log:state";
export const LOG_ACTION_EVENT = "log:action";

export type LogActionKind = "today" | "previous" | "next";

export interface LogActionPayload {
  action: LogActionKind;
}
