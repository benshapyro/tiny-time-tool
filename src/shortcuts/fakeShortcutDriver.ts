// Test double for `ShortcutDriver` (BUILD_SPEC S3: "Put the real
// tauri-plugin-global-shortcut calls behind a small driver ... with a fake
// used in tests" — the same seam pattern S2 used for SQL via `SqlDriver`).
//
// Real OS key presses cannot be synthesized in CI (Playwright cannot drive
// native Tauri windows; BUILD_SPEC's pinned testing strategy). This fake
// stores whatever handler was registered for each accelerator and exposes
// `press()` so a test can simulate "the user pressed this accelerator" by
// invoking the internal handler directly — the CI-safe analogue of a real
// key event.

import type { ShortcutDriver, ShortcutHandler } from "./shortcutDriver";

export interface FakeShortcutDriverOptions {
  /** Accelerators that should reject on `register()`, simulating the OS or
   * another application already owning the combo. A mutable `Set` so a test
   * can flip an accelerator from failing to succeeding mid-test (exercising
   * the rebind path) without constructing a new driver. */
  failingAccelerators?: Set<string>;
}

export interface FakeShortcutDriver extends ShortcutDriver {
  /** Simulates a shortcut press: invokes the handler currently registered
   * for `accelerator` and awaits it. Throws if nothing is registered for
   * it — a test pressing an unregistered accelerator is a test bug, not a
   * thing to silently no-op. */
  press(accelerator: string): Promise<void>;
  /** True if `accelerator` currently has a live registration. */
  isRegistered(accelerator: string): boolean;
}

export function createFakeShortcutDriver(
  options: FakeShortcutDriverOptions = {},
): FakeShortcutDriver {
  const failing = options.failingAccelerators ?? new Set<string>();
  const handlers = new Map<string, ShortcutHandler>();

  return {
    async register(accelerator, handler) {
      if (failing.has(accelerator)) {
        throw new Error(`fake driver: "${accelerator}" is already registered by another application`);
      }
      handlers.set(accelerator, handler);
    },

    async unregister(accelerator) {
      handlers.delete(accelerator);
    },

    isRegistered(accelerator) {
      return handlers.has(accelerator);
    },

    async press(accelerator) {
      const handler = handlers.get(accelerator);
      if (!handler) {
        throw new Error(`fake driver: no handler registered for "${accelerator}"`);
      }
      await handler();
    },
  };
}
