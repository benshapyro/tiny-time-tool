// S8: reminders (BUILD_SPEC S8 row). Business logic lives here in TS, not
// Rust — exactly like S2's `TimerEngine` / S3's `ShortcutController` — so
// it's unit-testable without a native harness and driven by a mocked clock,
// never real time.
//
// **Notification action buttons do not exist on desktop Tauri** (mobile-
// only API, per BUILD_SPEC's Context bundle gotcha). This controller never
// registers any: it sends a plain nudge (title + body) and relies on the
// notification's own click event to open the popover — Continue / Switch /
// Stop already live there (S5's `PopoverController`), never on the
// notification itself.
//
// **"Exactly one notify call" — how it's guaranteed.** Elapsed time toward
// the next nudge is measured via `TimerEngine.durationSeconds()`, which
// sums only the entry's RUNNING segments (BUILD_SPEC: "duration = sum of
// segments") — not wall-clock time since the entry started. That single
// choice does three jobs at once:
//   1. Paused time never counts toward the interval (`tick()` also has an
//      explicit `state !== "running"` guard, belt-and-suspenders — the
//      elapsed measure alone would already exclude paused time, but the
//      guard makes "no nudge while paused" true even at the instant
//      resume() hasn't happened yet, not just "eventually true").
//   2. A boundary is never double-fired: after firing, `#elapsedAtLastNudge`
//      is set to the elapsed value AT THE MOMENT OF FIRING. The next fire
//      requires `elapsed - #elapsedAtLastNudge >= intervalSeconds` again, so
//      any number of ticks that land on/near the same elapsed reading (a
//      real periodic ticker calling this every 30s will do exactly that)
//      see a delta of ~0 and don't refire.
//   3. It never re-fires "while the same nudge is unacknowledged": nothing
//      about acknowledgment is tracked at all, because it doesn't need to
//      be — the next fire is gated purely on the engine's own running-time
//      total advancing by a full interval, which a click, an ignored
//      nudge, or a totally silent background app all leave equally true.
//
// A "catch-up" tick (e.g. after being backgrounded) that finds elapsed time
// past MULTIPLE intervals fires exactly one nudge, not one per skipped
// interval — `#elapsedAtLastNudge` snaps to the current elapsed reading,
// not to the nearest interval boundary, so it never "remembers" skipped
// intervals to replay.
//
// Switching tasks resets tracking: `TimerEngine.currentEntryId` changes on
// every `start()` (a fresh entry id), so a new entry always begins its own
// interval from zero rather than inheriting the outgoing entry's progress.

import type { Locale } from "../i18n";
import { interpolate, t } from "../i18n";
import { formatEntryDisplayName } from "../timer/entryDisplayName";
import { formatDurationHM } from "../timer/formatDuration";
import type { TimerEngine } from "../timer/timerEngine";
import type { NotificationDriver } from "./notificationDriver";
import { DEFAULT_REMINDER_MINUTES } from "./reminderSettings";

export interface ReminderControllerOptions {
  engine: TimerEngine;
  driver: NotificationDriver;
  locale: Locale;
  clock?: () => Date;
  /** `reminder.minutes` setting's current value. Defaults to
   * `DEFAULT_REMINDER_MINUTES` (60); `0` means off. */
  minutes?: number;
  /** Fires when the user clicks a nudge this controller sent — wired to
   * `bootstrap.ts`'s `showPopover()` in the real app. */
  onOpenPopover?: () => void | Promise<void>;
}

export class ReminderController {
  readonly #engine: TimerEngine;
  readonly #driver: NotificationDriver;
  readonly #locale: Locale;
  readonly #clock: () => Date;
  readonly #onOpenPopover?: () => void | Promise<void>;
  #minutes: number;
  #trackedEntryId: string | null = null;
  #elapsedAtLastNudgeSeconds = 0;

  constructor(options: ReminderControllerOptions) {
    this.#engine = options.engine;
    this.#driver = options.driver;
    this.#locale = options.locale;
    this.#clock = options.clock ?? (() => new Date());
    this.#minutes = options.minutes ?? DEFAULT_REMINDER_MINUTES;
    this.#onOpenPopover = options.onOpenPopover;
  }

  /** The interval currently in effect, in minutes; `0` means off. */
  get minutes(): number {
    return this.#minutes;
  }

  /** Updates the live interval — the seam S12's Settings UI calls after
   * persisting a new `reminder.minutes` value via `setReminderMinutes`
   * (persistence and live behaviour are deliberately separate, same split
   * as `ShortcutController.rebind()` vs. the accelerator settings keys). */
  setMinutes(minutes: number): void {
    this.#minutes = minutes;
  }

  /** Registers this controller to open the popover when the user clicks a
   * nudge it sent (BUILD_SPEC: "clicking it opens the popover"). Real OS
   * click delivery can't be synthesized in CI; tests invoke the registered
   * handler directly via `fakeNotificationDriver.click()`, the same pattern
   * `ShortcutController`'s `fakeShortcutDriver.press()` uses for shortcut
   * presses. */
  async registerClickHandler(): Promise<void> {
    await this.#driver.onClick(() => {
      void this.#onOpenPopover?.();
    });
  }

  /** Call periodically (real app: every 30s via `setInterval`, wired in
   * `bootstrap.ts`) with the engine's current state. Fires at most one
   * notification per call — see the module doc comment above for exactly
   * how "exactly one" is guaranteed across every boundary/catch-up/repeat
   * case BUILD_SPEC's acceptance check names. */
  async tick(): Promise<void> {
    if (this.#minutes <= 0) return; // off
    if (this.#engine.state !== "running") return; // paused/idle: no nudge

    const entryId = this.#engine.currentEntryId;
    if (!entryId) return; // defensive: "running" always implies a current entry

    if (entryId !== this.#trackedEntryId) {
      this.#trackedEntryId = entryId;
      this.#elapsedAtLastNudgeSeconds = 0;
    }

    const elapsedSeconds = await this.#engine.durationSeconds(entryId);
    const intervalSeconds = this.#minutes * 60;
    if (elapsedSeconds - this.#elapsedAtLastNudgeSeconds < intervalSeconds) return;

    this.#elapsedAtLastNudgeSeconds = elapsedSeconds;
    await this.#fireNudge(entryId, elapsedSeconds);
  }

  async #fireNudge(entryId: string, elapsedSeconds: number): Promise<void> {
    const entry = await this.#engine.entry(entryId);
    const segments = await this.#engine.segmentsFor(entryId);
    const name = entry ? formatEntryDisplayName(entry, segments, this.#locale, this.#clock()) : "";

    await this.#driver.notify({
      title: t(this.#locale, "reminder.notification.title"),
      body: interpolate(t(this.#locale, "reminder.notification.body"), {
        name,
        elapsed: formatDurationHM(elapsedSeconds),
      }),
    });
  }
}
