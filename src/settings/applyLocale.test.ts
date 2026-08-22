// S12 review fix: this is the "seam" test the review specifically asked
// for — a test that proves resolveLocale WORKS does not prove the WIRING
// exists (that gap is exactly how the original bug shipped: bootstrap.ts
// never called `applyLocaleLive`/`setLocale` on anything at all, and
// resolveLocale's own isolated unit test stayed green the whole time). This
// wires QuickEntryController + LogController + InsightsController +
// PopoverController + ReminderController together against a REAL
// SQLite-backed TimerEngine — the same composition `bootstrap.ts` builds —
// and calls the ACTUAL `applyLocaleLive` function bootstrap.ts's
// "setLanguage" action invokes, not a re-description of it. Every
// assertion below is against ALREADY-BAKED controller state (text computed
// by a PRIOR refresh/openForSwitch under the OLD locale), because that is
// precisely what switching `useLocale()` in the React layer cannot fix on
// its own.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogController } from "../log/logController";
import { InsightsController } from "../insights/insightsController";
import { QuickEntryController } from "../panel/quickEntryController";
import { PopoverController } from "../popover/popoverController";
import { createFakeNotificationDriver } from "../reminders/fakeNotificationDriver";
import { ReminderController } from "../reminders/reminderController";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { applyLocaleLive } from "./applyLocale";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s12-applylocale-"));
  dbPath = join(tempDir, "test.db");
});

afterEach(async () => {
  await closeTrackedDrivers();
  rmSync(tempDir, { recursive: true, force: true });
});

function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    advanceTo: (nextIso: string) => {
      current = new Date(nextIso);
    },
  };
}

/** Wires all five locale-aware controllers together exactly the way
 * `src/app/bootstrap.ts` wires the real ones. */
async function wire(dbPath: string, clockNow: () => Date) {
  const driver = trackDriver(dbPath);
  const engine = await TimerEngine.create(driver, clockNow);

  const panel = new QuickEntryController({ engine, locale: "en", clock: clockNow });
  const dashboard = new LogController({
    engine,
    locale: "en",
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    clock: clockNow,
  });
  const insights = new InsightsController({ engine, locale: "en", clock: clockNow });
  const popover = new PopoverController({
    engine,
    locale: "en",
    primaryAccelerator: DEFAULT_ACCELERATORS.primary,
    clock: clockNow,
  });
  const notificationDriver = createFakeNotificationDriver();
  const reminders = new ReminderController({
    engine,
    driver: notificationDriver,
    locale: "en",
    clock: clockNow,
    minutes: 1,
  });

  return { engine, panel, dashboard, insights, popover, reminders, notificationDriver };
}

describe("applyLocaleLive — the real wiring bootstrap.ts's \"setLanguage\" action calls", () => {
  it("switches every locale-baked controller's ALREADY-RENDERED text to the new language, not just future computations", async () => {
    const clock = fixedClock("2026-08-24T09:00:00.000Z"); // a Monday, Pacific-local
    const { engine, panel, dashboard, insights, popover, reminders, notificationDriver } = await wire(
      dbPath,
      clock.now,
    );

    // Baseline: everything renders in English, exactly as it would have
    // shipped under the S1-S11 hardcoded "en" placeholder.
    await dashboard.refresh();
    await popover.refresh();
    await insights.refresh();
    expect(dashboard.state.emptyStateTeachLine).toMatch(/press/i);
    expect(popover.state.teachLine).toMatch(/press/i);
    expect(insights.state.days[0]?.weekdayLabel).toBe("Mon");

    // S13a: the native tray is the sixth target. It is a spy rather than a
    // controller because the real one crosses into Rust — what this has to
    // prove is that the seam REACHES it, which is the half that was missing
    // for twelve slices.
    const trayCalls: string[] = [];
    const tray = (next: "en" | "es") => {
      trayCalls.push(next);
    };

    // The actual "setLanguage" wiring: this is the literal function call
    // `bootstrap.ts` makes, not a hand-rolled substitute.
    await applyLocaleLive("es", { panel, dashboard, insights, popover, reminders, tray });

    // The tray menu and tooltip get the new locale too — the surface that
    // stayed English through every previous slice.
    expect(trayCalls).toEqual(["es"]);

    // Every already-baked piece of state now reads in Spanish — proving the
    // controllers were actually reached, not just that resolveLocale itself
    // can translate a setting into a Locale.
    expect(dashboard.state.emptyStateTeachLine).toMatch(/pulsa/i);
    expect(popover.state.teachLine).toMatch(/pulsa/i);
    expect(insights.state.days[0]?.weekdayLabel).toBe("lun");

    // The panel's one locale-baked field (the switch notice) is built in
    // the new locale the next time it's computed.
    await engine.start({ name: "Acme kickoff", client: null, project: null });
    await panel.openForSwitch();
    expect(panel.state.notice).toContain("Se detendrá");

    // The reminder's next nudge fires in the new locale too.
    clock.advanceTo("2026-08-24T09:02:00.000Z"); // past the 1-minute interval
    await reminders.tick();
    expect(notificationDriver.calls).toHaveLength(1);
    expect(notificationDriver.calls[0]?.title).toBe("Sigues en curso");
  });

  it("leaves untouched controllers exactly as they were (only the five wired targets are affected)", async () => {
    const clock = fixedClock("2026-08-24T09:00:00.000Z");
    const { dashboard, insights, popover, panel, reminders } = await wire(dbPath, clock.now);
    await dashboard.refresh();
    const before = dashboard.state.dayKey;

    await applyLocaleLive("es", { panel, dashboard, insights, popover, reminders, tray: () => {} });

    // The refresh this triggers must not change anything OTHER than the
    // locale-sensitive text — e.g. it must not silently jump the viewed day.
    expect(dashboard.state.dayKey).toBe(before);
  });
});
