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

// S7: a second, separate event for the editing surface (rename/tag/time
// edits, delete, undo) rather than folding these into `LogActionKind`
// above. Same reasoning as `panelEvents.ts` using distinct
// PANEL_INPUT/PANEL_COMMIT events instead of one big discriminated kind:
// these actions carry real payloads (an entry id, edited field values),
// and keeping the plain day-nav clicks (`LogActionKind`) untouched avoids
// widening every existing call site for a concern that only the edit UI
// needs.
export const LOG_EDIT_ACTION_EVENT = "log:editAction";

export type LogEditActionKind =
  | { type: "beginEdit"; entryId: string }
  | { type: "cancelEdit" }
  | {
      type: "saveEdit";
      entryId: string;
      name: string | null;
      client: string | null;
      project: string | null;
      start: string;
      end?: string;
    }
  | { type: "delete"; entryId: string }
  | { type: "undoDelete" }
  | { type: "dismissUndo" };

export interface LogEditActionPayload {
  action: LogEditActionKind;
}
