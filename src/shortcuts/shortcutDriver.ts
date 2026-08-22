// Persistence-style seam for global shortcuts: `ShortcutController`
// (shortcutController.ts) talks only to this interface, never to a concrete
// OS-shortcut library — same pattern as `SqlDriver` in `../timer/sqlDriver.ts`.
// Two real implementations share it:
//   - `fakeShortcutDriver.ts` — an in-memory fake with a `press()` escape
//     hatch tests use to simulate a shortcut firing (Playwright cannot drive
//     native OS key presses; CI-safe tests drive the internal handler
//     directly instead — BUILD_SPEC's pinned testing strategy).
//   - `tauriShortcutDriver.ts` — the official `@tauri-apps/plugin-global-shortcut`,
//     used by the real app.
//
// `register()` rejects when the OS/another app refuses the accelerator —
// `ShortcutController` catches that per-accelerator and turns it into
// observable warning state (BUILD_SPEC S3: "failed registration surfaces a
// visible warning ... no silent failure").

export type ShortcutHandler = () => void | Promise<void>;

export interface ShortcutDriver {
  /** Registers `accelerator` to call `handler` when pressed. Rejects if the
   * OS/another application already owns the combo — the caller decides what
   * "failure" means, this seam only reports it. */
  register(accelerator: string, handler: ShortcutHandler): Promise<void>;
  /** Unregisters `accelerator`. Safe to call for an accelerator that was
   * never successfully registered (a no-op, not a rejection) — rebinding
   * after a failed registration must not itself throw. */
  unregister(accelerator: string): Promise<void>;
}
