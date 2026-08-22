// English catalog — the source of truth for translation keys.
// Flat dotted namespace (e.g. "tray.openDashboard") per BUILD_SPEC's i18n rule.
// `es.ts` is typed against `TranslationKey` derived from this file, so a
// missing Spanish translation is a TypeScript compile error, not a runtime gap.
export const en = {
  "app.name": "Tiny Time Tool",
  "tray.openDashboard": "Open Dashboard",
  "tray.quit": "Quit",
  "tray.tooltip.idle": "Tiny Time Tool — idle",
  "tray.tooltip.running": "Tiny Time Tool — tracking",
  "tray.tooltip.paused": "Tiny Time Tool — paused",
} as const;

export type TranslationKey = keyof typeof en;
