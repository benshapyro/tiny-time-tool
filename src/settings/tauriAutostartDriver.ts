// Production `AutostartDriver`, backed by the official
// `@tauri-apps/plugin-autostart` (verified npm name/version 2.5.1 against
// the registry and the plugin's own guest-js source — `enable()`,
// `disable()`, `isEnabled()`, no other shape). Talks over Tauri's IPC
// bridge to the Rust `tauri_plugin_autostart` plugin registered in
// `src-tauri/src/lib.rs`.
//
// No unit test: these calls invoke Tauri's IPC bridge, which doesn't exist
// under Vitest/jsdom (same reasoning as `tauriShortcutDriver.ts` /
// `tauriSqlDriver.ts` — stubbing the bridge would only prove the stub).
// `SettingsController`'s real behaviour is exercised against
// `fakeAutostartDriver.ts` instead; this file's real behaviour (the app
// actually appearing in the OS's login-items list) is exercised live, at
// the S14 manual-check gate.

import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { AutostartDriver } from "./autostartDriver";

export function createTauriAutostartDriver(): AutostartDriver {
  return {
    isEnabled,
    enable,
    disable,
  };
}
