// Production `UpdateOpener`, backed by the official
// `@tauri-apps/plugin-opener` (already a dependency since S1; verified
// 2.5.4). `openUrl` asks the OS to open the URL in the system's default
// browser — the app process itself never connects to anything.
//
// No unit test: this invokes Tauri's IPC bridge, which doesn't exist under
// Vitest/jsdom (same reasoning as every other `tauri*Driver.ts` in this
// project). `SettingsController`'s real behaviour is exercised against a
// plain `vi.fn()` standing in for `UpdateOpener` instead; this file's real
// behaviour (a real browser tab opening) is exercised live, at the S14
// manual-check gate.

import { openUrl } from "@tauri-apps/plugin-opener";
import type { UpdateOpener } from "./updateOpener";

export const tauriUpdateOpener: UpdateOpener = (url: string) => openUrl(url);
