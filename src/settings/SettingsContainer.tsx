// S12: the live wiring shell for the Dashboard's Settings tab — same
// architecture as `ExportContainer.tsx`/`LogContainer.tsx`. Talks to the
// "main" window's `SettingsController` (owns the real `ShortcutController`/
// `ReminderController`, via `bootstrap.ts`) only over Tauri's event bus
// (`settingsEvents.ts`); this component itself holds no business logic.
//
// Locale comes from `useLocale()` (the S12 live-locale seam —
// `LiveSettingsProvider.tsx`), not a hardcoded per-file constant: this is
// the one container whose whole job is to let that setting change, so it
// would be a contradiction for it to still hardcode "en" the way every
// other *Container.tsx did before this slice.
//
// No unit test: `listen`/`emit` invoke Tauri's IPC bridge, which doesn't
// exist under Vitest/jsdom — same "no unit test for the IPC glue" pattern
// as every other *Container.tsx in this project. `Settings.tsx`'s own
// rendering is what's exercised by `Settings.test.tsx` against plain props,
// and `SettingsController`'s own state computation by
// `settingsController.test.ts` against real composed controllers.

import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { currentAcceleratorPlatform } from "../shortcuts/formatAccelerator";
import type { ShortcutId } from "../shortcuts/shortcutController";
import Settings from "./Settings";
import { SETTINGS_ACTION_EVENT, SETTINGS_STATE_EVENT } from "./settingsEvents";
import type { SettingsActionKind } from "./settingsEvents";
import type { SettingsState } from "./settingsController";
import type { LanguageSetting } from "./languageSetting";
import type { ThemeSetting } from "./themeSetting";
import { useLocale } from "./useLocale";

const IDLE_STATE: SettingsState = {
  shortcutPrimary: "",
  shortcutStop: "",
  shortcutWarnings: [],
  reminderMinutes: 60,
  language: "system",
  theme: "system",
  autostart: true,
  autostartError: false,
  version: "",
  updateStatus: "idle",
};

function SettingsContainer() {
  const locale = useLocale();
  const [state, setState] = useState<SettingsState>(IDLE_STATE);

  const dispatch = (action: SettingsActionKind) => {
    void emit(SETTINGS_ACTION_EVENT, { action });
  };

  useEffect(() => {
    let cancelled = false;
    const unlisten = listen<SettingsState>(SETTINGS_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    // Review finding (S12): request the current state ONLY after the
    // listener above is actually registered (the listener's own promise
    // resolving is the real signal — not merely having called `listen()`),
    // so bootstrap.ts's re-emitted reply can never arrive before anything
    // is listening for it.
    void unlisten.then(() => {
      if (!cancelled) dispatch({ type: "requestState" });
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <Settings
      locale={locale}
      platform={currentAcceleratorPlatform()}
      state={state}
      onRebindShortcut={(id: ShortcutId, accelerator: string) => dispatch({ type: "rebindShortcut", id, accelerator })}
      onReminderMinutesChange={(minutes: number) => dispatch({ type: "setReminderMinutes", minutes })}
      onLanguageChange={(language: LanguageSetting) => dispatch({ type: "setLanguage", language })}
      onThemeChange={(theme: ThemeSetting) => dispatch({ type: "setTheme", theme })}
      onAutostartChange={(enabled: boolean) => dispatch({ type: "setAutostart", enabled })}
      onCheckForUpdates={() => dispatch({ type: "checkForUpdates" })}
    />
  );
}

export default SettingsContainer;
