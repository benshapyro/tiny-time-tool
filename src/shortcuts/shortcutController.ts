// S3: global-shortcut → TimerEngine wiring (BUILD_SPEC S3 row). Business
// logic lives here in TS, not Rust — exactly like S2's `TimerEngine` — so
// it's unit-testable without a native harness and Rust stays thin plumbing
// (`tauriShortcutDriver.ts` is the only file that touches the real plugin).
//
// Two separately registered accelerators, no double-tap and no
// modifier-detection scheme (BUILD_SPEC: "Two shortcuts over double-tap —
// no timing window, no accidental stops"):
//   - `primary` (default `CmdOrCtrl+Shift+Space`): idle -> start,
//     running -> pause, paused -> resume.
//   - `stop` (default `CmdOrCtrl+Shift+Alt+Space`): running|paused -> stop.
// A press while idle on the stop accelerator, or any accelerator pressed
// with the engine in a state that has no defined reaction, is a no-op
// rather than letting `TimerEngine`'s `IllegalTransitionError` escape a
// live shortcut handler.
//
// Tracking begins at the shortcut press: handlers call straight into
// `TimerEngine`, which stamps its own injected clock synchronously at the
// moment of the call — no `await` happens before that stamp, so "press
// time" and "the timestamp handed to the engine" are the same instant.
//
// Two seams later slices wire into (BUILD_SPEC S3/S4 interplay + S12):
//   - `onPanelOpenRequested`: fires on primary-from-idle only — S4 opens
//     the quick-entry panel here. Primary-while-running (pause) must NOT
//     fire this ("S3's toggle is sacred" — pausing never opens the panel).
//   - `onTrayStateChange`: fires on every state transition with the tray
//     state and the elapsed seconds at that instant, reusing S1's
//     `trayTitleForState`/`formatElapsed` (not reimplemented here) so a
//     caller can render `⏸ {elapsed}` on pause per the 2026-08-22
//     amendment ("pause must be visible, not modal").
// Failed registration never fails silently: `warnings` carries which
// accelerator failed, and `rebind()` is the path a later Settings slice
// (S12) calls to re-register a different one.

import type { TranslationKey } from "../i18n";
import type { TimerEngine } from "../timer/timerEngine";
import type { TrayState } from "../tray/trayState";
import type { ShortcutDriver } from "./shortcutDriver";

export type ShortcutId = "primary" | "stop";

/** Pinned defaults (BUILD_SPEC "Pinned interfaces" → Settings keys
 * `shortcut.primary` / `shortcut.stop`). Not expressible as a
 * double-tap/modifier variant of one accelerator — two independent
 * registrations by design. */
export const DEFAULT_ACCELERATORS: Readonly<Record<ShortcutId, string>> = {
  primary: "CmdOrCtrl+Shift+Space",
  stop: "CmdOrCtrl+Shift+Alt+Space",
};

export interface ShortcutWarning {
  id: ShortcutId;
  /** The accelerator string that failed to register. */
  accelerator: string;
  /** i18n key for the user-visible warning text (en/es both required —
   * see `src/i18n/en.ts` / `es.ts`). */
  messageKey: TranslationKey;
  /** Raw diagnostic from the driver (e.g. the thrown error's message).
   * Not localized — for logs/debugging, never rendered as-is to the user. */
  driverError: string;
}

export interface ShortcutControllerOptions {
  driver: ShortcutDriver;
  engine: TimerEngine;
  /** Overrides for either accelerator; unspecified ids fall back to
   * `DEFAULT_ACCELERATORS`. */
  accelerators?: Partial<Record<ShortcutId, string>>;
  /** Fires exactly on primary-from-idle (start). S4 seam — do not call
   * this from pause/resume/stop. */
  onPanelOpenRequested?: () => void;
  /** Fires on every transition this controller drives, with the resulting
   * tray state and elapsed seconds at that instant. */
  onTrayStateChange?: (state: TrayState, elapsedSeconds: number) => void;
  /** S4 seam: fires — and is awaited — immediately before a primary-press
   * pause (running -> paused) takes effect; the engine is still "running"
   * when this runs. The quick-entry panel wires this to "commit whatever
   * text is currently typed, if the panel happens to be open" (BUILD_SPEC:
   * "primary press while the panel is open = commit current text (as
   * Enter) then pause"). Does nothing on its own if the panel is closed —
   * that's the callback's job to decide, not this controller's; this seam
   * only guarantees the ordering (commit fully settles before pause). Not
   * called on start or resume — only on the running -> paused transition. */
  onBeforePause?: () => void | Promise<void>;
}

const MESSAGE_KEY: Record<ShortcutId, TranslationKey> = {
  primary: "shortcuts.warning.primaryFailed",
  stop: "shortcuts.warning.stopFailed",
};

export class ShortcutController {
  readonly #driver: ShortcutDriver;
  readonly #engine: TimerEngine;
  readonly #accelerators: Record<ShortcutId, string>;
  readonly #warnings: Map<ShortcutId, ShortcutWarning>;
  readonly #onPanelOpenRequested?: () => void;
  readonly #onTrayStateChange?: (state: TrayState, elapsedSeconds: number) => void;
  readonly #onBeforePause?: () => void | Promise<void>;

  constructor(options: ShortcutControllerOptions) {
    this.#driver = options.driver;
    this.#engine = options.engine;
    this.#accelerators = {
      primary: options.accelerators?.primary ?? DEFAULT_ACCELERATORS.primary,
      stop: options.accelerators?.stop ?? DEFAULT_ACCELERATORS.stop,
    };
    this.#warnings = new Map();
    this.#onPanelOpenRequested = options.onPanelOpenRequested;
    this.#onTrayStateChange = options.onTrayStateChange;
    this.#onBeforePause = options.onBeforePause;
  }

  /** The accelerator currently assigned to `id` (post-rebind if `rebind()`
   * has been called). */
  accelerator(id: ShortcutId): string {
    return this.#accelerators[id];
  }

  get warnings(): ShortcutWarning[] {
    return [...this.#warnings.values()];
  }

  get hasWarning(): boolean {
    return this.#warnings.size > 0;
  }

  /** Registers both accelerators against the driver. Each is attempted
   * independently — one failing does not prevent the other from
   * registering — and failures/successes are reflected in `warnings`.
   * Safe to call again (e.g. after fixing an external conflict) to retry. */
  async registerAll(): Promise<void> {
    await this.#registerOne("primary", () => this.#handlePrimary());
    await this.#registerOne("stop", () => this.#handleStop());
  }

  /** Re-registers `id` under `newAccelerator`: unregisters whatever is
   * currently assigned (a no-op if the prior registration had failed),
   * then registers the new one, updating `warnings` accordingly. The path
   * a later Settings slice (S12) calls after a registration-failure
   * warning is shown. */
  async rebind(id: ShortcutId, newAccelerator: string): Promise<void> {
    await this.#driver.unregister(this.#accelerators[id]);
    this.#accelerators[id] = newAccelerator;
    const handler = id === "primary" ? () => this.#handlePrimary() : () => this.#handleStop();
    await this.#registerOne(id, handler);
  }

  async #registerOne(id: ShortcutId, handler: () => void | Promise<void>): Promise<void> {
    const accel = this.#accelerators[id];
    try {
      await this.#driver.register(accel, handler);
      this.#warnings.delete(id);
    } catch (err) {
      this.#warnings.set(id, {
        id,
        accelerator: accel,
        messageKey: MESSAGE_KEY[id],
        driverError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async #handlePrimary(): Promise<void> {
    switch (this.#engine.state) {
      case "idle": {
        await this.#engine.start();
        this.#onPanelOpenRequested?.();
        this.#onTrayStateChange?.("running", 0);
        return;
      }
      case "running": {
        await this.#onBeforePause?.();
        await this.#engine.pause();
        const elapsed = await this.#elapsedForCurrentEntry();
        this.#onTrayStateChange?.("paused", elapsed);
        return;
      }
      case "paused": {
        await this.#engine.resume();
        const elapsed = await this.#elapsedForCurrentEntry();
        this.#onTrayStateChange?.("running", elapsed);
        return;
      }
      default: {
        const exhaustive: never = this.#engine.state;
        return exhaustive;
      }
    }
  }

  async #handleStop(): Promise<void> {
    if (this.#engine.state === "running" || this.#engine.state === "paused") {
      await this.#engine.stop();
      this.#onTrayStateChange?.("idle", 0);
    }
    // idle: no defined reaction to the stop accelerator — a stray press
    // must not throw IllegalTransitionError out of a live handler.
  }

  async #elapsedForCurrentEntry(): Promise<number> {
    const entryId = this.#engine.currentEntryId;
    if (!entryId) return 0;
    return this.#engine.durationSeconds(entryId);
  }
}
