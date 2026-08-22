// Production `ShortcutDriver`, backed by the official
// `@tauri-apps/plugin-global-shortcut` (verified npm name/version 2.3.2 —
// see docs/build-log.md). Talks over Tauri's IPC bridge to the Rust
// `tauri_plugin_global_shortcut` plugin registered in `src-tauri/src/lib.rs`.
//
// No unit test: `register`/`unregister` invoke Tauri's IPC bridge, which
// doesn't exist under Vitest/jsdom (same reasoning as `tauriSqlDriver.ts` —
// stubbing the bridge would only prove the stub, not this glue).
// `ShortcutController`'s real behaviour is exercised against
// `fakeShortcutDriver.ts` instead. A later slice that wires a
// `ShortcutController` into the running app is what actually exercises this
// path, at the S14 manual-check gate (real OS key presses).

import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { ShortcutDriver, ShortcutHandler } from "./shortcutDriver";

export function createTauriShortcutDriver(): ShortcutDriver {
  return {
    async register(accelerator: string, handler: ShortcutHandler): Promise<void> {
      await register(accelerator, (event) => {
        // The plugin fires on both press and release (`event.state`); only
        // "Pressed" should drive the state machine, or every shortcut
        // would fire its action twice per physical key press.
        if (event.state === "Pressed") {
          void handler();
        }
      });
    },

    async unregister(accelerator: string): Promise<void> {
      await unregister(accelerator);
    },
  };
}
