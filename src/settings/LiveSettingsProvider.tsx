// S12: the ONE place "without restart" (BUILD_SPEC's hard acceptance
// criterion for language + theme) actually gets applied. Wraps whichever
// window's root component in `main.tsx` — "main", "panel", and "popover"
// all mount through the same entry point, and every one of them needs to
// react live to a language/theme change even though only "main" ever
// renders the Settings tab itself (a rebind from the Dashboard must still
// re-render the panel and popover windows, which are separate webview/JS
// contexts with no shared memory — same cross-window reasoning as every
// other `*Events.ts` seam in this project).
//
// Listens to the SAME `settings:state` event `SettingsContainer.tsx`
// listens to (see `settingsEvents.ts`'s doc comment for why one event
// serves both) and does two things on every push:
//   1. `applyTheme` — a pure DOM call (`data-theme` attribute), unit-tested
//      on its own in `applyTheme.test.ts`. Runs synchronously; there is
//      nothing to re-render for it, tokens.css's CSS custom properties do
//      the rest.
//   2. Re-resolves `Locale` via `resolveLocale` (also unit-tested on its
//      own) and pushes it into `LocaleContext`, which every container reads
//      via `useLocale()` — that state change is what makes React actually
//      re-render every string on screen.
//
// No unit test: `listen` invokes Tauri's IPC bridge, which doesn't exist
// under Vitest/jsdom — same "no unit test for the IPC glue" pattern as
// every other *Container.tsx in this project. The pure logic it calls
// (`applyTheme`/`resolveLocale`) is exercised on its own; this file's real
// behaviour (three windows all re-rendering live off one setting change) is
// exercised at the S14 manual-check gate.

import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Locale } from "../i18n";
import { applyTheme } from "./applyTheme";
import { detectSystemLocale, resolveLocale } from "./resolveLocale";
import type { SettingsState } from "./settingsController";
import { SETTINGS_STATE_EVENT } from "./settingsEvents";
import { LocaleContext } from "./useLocale";

interface LiveSettingsProviderProps {
  children: ReactNode;
}

function LiveSettingsProvider({ children }: LiveSettingsProviderProps) {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale("system", detectSystemLocale()));

  useEffect(() => {
    const unlisten = listen<SettingsState>(SETTINGS_STATE_EVENT, (event) => {
      setLocale(resolveLocale(event.payload.language, detectSystemLocale()));
      applyTheme(event.payload.theme);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export default LiveSettingsProvider;
