// S12: the wire contract between the "main" window (owns `SettingsController`,
// wired in `bootstrap.ts` alongside every other controller) and the
// Dashboard's Settings tab — same push/dispatch event-bus shape as
// `exportEvents.ts`/`logEvents.ts`.
//
// `SETTINGS_STATE_EVENT` does double duty: `SettingsContainer.tsx` (the
// Settings tab itself) listens for the FULL `SettingsState`, but
// `LiveSettingsProvider.tsx` (every window, including "panel" and
// "popover", which never render the Settings tab at all) also listens to
// this SAME event to pick out just `language`/`theme` and apply them live —
// one event, one source of truth, rather than a second broadcast that could
// drift out of sync with what the Settings tab itself shows.

import type { ShortcutId } from "../shortcuts/shortcutController";
import type { LanguageSetting } from "./languageSetting";
import type { ThemeSetting } from "./themeSetting";

export const SETTINGS_STATE_EVENT = "settings:state";
export const SETTINGS_ACTION_EVENT = "settings:action";

export type SettingsActionKind =
  | { type: "rebindShortcut"; id: ShortcutId; accelerator: string }
  | { type: "setReminderMinutes"; minutes: number }
  | { type: "setLanguage"; language: LanguageSetting }
  | { type: "setTheme"; theme: ThemeSetting }
  | { type: "setAutostart"; enabled: boolean }
  | { type: "checkForUpdates" };

export interface SettingsActionPayload {
  action: SettingsActionKind;
}
