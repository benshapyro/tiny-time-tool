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
  "shortcuts.warning.primaryFailed":
    "Couldn't set the start/pause/resume shortcut — another app may already be using it. Pick a different one in Settings.",
  "shortcuts.warning.stopFailed":
    "Couldn't set the stop shortcut — another app may already be using it. Pick a different one in Settings.",
} as const;

export type TranslationKey = keyof typeof en;
