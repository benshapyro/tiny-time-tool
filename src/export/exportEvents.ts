// S10: the wire contract between the "main" window (owns `ExportController`,
// wired in `bootstrap.ts` alongside `LogController`) and the Dashboard's
// Export section — same push/dispatch event-bus shape as `logEvents.ts`.

export const EXPORT_STATE_EVENT = "export:state";
export const EXPORT_ACTION_EVENT = "export:action";

export type ExportActionKind =
  | { type: "copyForAi" }
  | { type: "setRangeStart"; value: string }
  | { type: "setRangeEnd"; value: string }
  | { type: "exportCsv" }
  | { type: "exportJson" };

export interface ExportActionPayload {
  action: ExportActionKind;
}
