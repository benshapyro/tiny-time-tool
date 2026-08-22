// S11: the wire contract between the "main" window (owns `InsightsController`
// + the real `TimerEngine`, wired in `bootstrap.ts` alongside `LogController`/
// `ExportController`) and the Dashboard's Insights tab content. Same
// push-only shape as `exportEvents.ts` — Insights has no user-triggered
// mutating actions of its own (no date-range builder, no edit/delete), so
// unlike `logEvents.ts`/`exportEvents.ts` there is no `*_ACTION_EVENT`/
// `*ActionKind` here at all, only the one state push.

export const INSIGHTS_STATE_EVENT = "insights:state";
