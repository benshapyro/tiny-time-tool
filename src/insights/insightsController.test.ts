// S11: `InsightsController` against a REAL SQLite-backed `TimerEngine` (same
// pattern as `logController.test.ts`/`exportController.test.ts` — never a
// mock engine). The fixture is deliberately TWO WEEKS: week A (2026-08-10..16)
// must be fully excluded from every one of the three views; week B
// (2026-08-17..23, Monday-Sunday) is "the current week" the injected clock
// sits inside of. A broken current-week filter (e.g. querying all entries
// ever, or bucketing "Tuesday" by day-of-week across all history instead of
// by the specific date) would inflate or corrupt every pinned value below —
// week A is seeded with entries designed to make that drift visible, not
// just present:
//   - a 12h "Acme onboarding"/acme/rollout entry on week A's Tuesday: if the
//     Tuesday bucket were keyed by day-of-week instead of the specific
//     2026-08-18 date, this would land on the SAME "Tue" bar as week B's
//     entries and blow the pinned 6h30m total up to 18h30m.
//   - that same entry, if the range filter leaked it through, would inflate
//     the "Acme onboarding"/acme/rollout tuple from the pinned 9h15m to
//     21h15m and would be the new #1 biggest task.
//   - a 5h "Legacy work"/acme entry on week A's Monday would inflate the
//     acme client share well past the pinned 62%.
//
// BUILD_SPEC S11 acceptance, pinned exactly: "Tue = 6h 30m; @acme = 62%; top
// task = 'Acme onboarding — 9h 15m' as the summed tuple."

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTrackedDrivers, trackDriver } from "../timer/testSqliteSupport";
import { TimerEngine } from "../timer/timerEngine";
import { InsightsController } from "./insightsController";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ttt-s11-insights-"));
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

/** Seeds the two-week fixture described in the module doc comment above.
 * Returns the engine and the clock positioned at the LAST entry's stop time
 * (2026-08-22T17:10:00.000Z, Saturday of week B) — same "reuse the seeding
 * clock's final position as `now`" pattern `exportController.test.ts`
 * already establishes, since any moment inside week B correctly resolves
 * `currentWeekRange` to it. */
async function seedTwoWeekFixture() {
  const driver = trackDriver(dbPath);
  const clock = fixedClock("2026-08-10T16:00:00.000Z"); // Mon week A, 09:00 PDT
  const engine = await TimerEngine.create(driver, clock.now);

  // --- Week A (2026-08-10..16) — must be fully excluded. ---
  await engine.start({ name: "Legacy work", client: "acme", project: "legacy" });
  clock.advanceTo("2026-08-10T21:00:00.000Z"); // 5h
  await engine.stop();

  clock.advanceTo("2026-08-11T15:00:00.000Z"); // Tue week A, 08:00 PDT
  await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
  clock.advanceTo("2026-08-12T03:00:00.000Z"); // 12h, crosses UTC midnight, same local day
  await engine.stop();

  // --- Week B (2026-08-17..23) — the current week. ---
  clock.advanceTo("2026-08-18T16:00:00.000Z"); // Tue week B, 09:00 PDT
  await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
  clock.advanceTo("2026-08-18T20:00:00.000Z"); // 4h
  await engine.stop();

  clock.advanceTo("2026-08-18T20:30:00.000Z"); // Tue week B, 13:30 PDT
  await engine.start({ name: "Beta standup", client: "beta", project: "core" });
  clock.advanceTo("2026-08-18T23:00:00.000Z"); // 2h30m
  await engine.stop();

  clock.advanceTo("2026-08-19T16:00:00.000Z"); // Wed week B, 09:00 PDT
  await engine.start({ name: "Acme onboarding", client: "acme", project: "rollout" });
  clock.advanceTo("2026-08-19T21:15:00.000Z"); // 5h15m
  await engine.stop();

  clock.advanceTo("2026-08-20T16:00:00.000Z"); // Thu week B, 09:00 PDT
  // Same NAME as the acme/rollout entries above, different client/project —
  // proves biggest-tasks groups by the exact tuple, not name alone.
  await engine.start({ name: "Acme onboarding", client: "beta", project: "discovery" });
  clock.advanceTo("2026-08-20T17:00:00.000Z"); // 1h
  await engine.stop();

  clock.advanceTo("2026-08-21T15:00:00.000Z"); // Fri week B, 08:00 PDT
  await engine.start({ name: "Beta standup", client: "beta", project: "core" });
  clock.advanceTo("2026-08-21T16:00:00.000Z"); // 1h
  await engine.stop();

  clock.advanceTo("2026-08-22T16:00:00.000Z"); // Sat week B, 09:00 PDT
  await engine.start({ name: "Internal sync", client: null, project: null });
  clock.advanceTo("2026-08-22T17:10:00.000Z"); // 1h10m
  await engine.stop();

  return { engine, clock };
}

describe("InsightsController", () => {
  it("hours-by-day: Tuesday of the CURRENT week is 6h 30m — week A's Tuesday (which alone would sum to 12h) is excluded", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    expect(controller.state.days).toHaveLength(7);
    expect(controller.state.days.map((d) => d.dayKey)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
    const tue = controller.state.days.find((d) => d.dayKey === "2026-08-18")!;
    expect(tue.durationLabel).toBe("6h 30m");
    expect(tue.seconds).toBe(6.5 * 3600);
    expect(tue.weekdayLabel).toBe("Tue");
  });

  it("days with no entries this week render at 0, not omitted (Monday and Sunday here)", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    const mon = controller.state.days.find((d) => d.dayKey === "2026-08-17")!;
    const sun = controller.state.days.find((d) => d.dayKey === "2026-08-23")!;
    expect(mon.durationLabel).toBe("0m");
    expect(sun.durationLabel).toBe("0m");
  });

  it("share by tag: @acme is 62% of the current week's total — week A's larger acme entries are excluded", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    const acme = controller.state.clientShares.find((c) => c.tag === "acme")!;
    expect(acme).toBeDefined();
    expect(acme.percentLabel).toBe("62%");
    expect(acme.durationLabel).toBe("9h 15m"); // 555 minutes of client=acme time

    const beta = controller.state.clientShares.find((c) => c.tag === "beta")!;
    expect(beta.percentLabel).toBe("30%"); // 270 of 895 minutes
  });

  it("share by tag: project shares are computed independently of client shares", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    const rollout = controller.state.projectShares.find((p) => p.tag === "rollout")!;
    expect(rollout.percentLabel).toBe("62%");
    const core = controller.state.projectShares.find((p) => p.tag === "core")!;
    expect(core.percentLabel).toBe("23%");
    const discovery = controller.state.projectShares.find((p) => p.tag === "discovery")!;
    expect(discovery.percentLabel).toBe("7%");
  });

  it("biggest tasks: the top task is 'Acme onboarding' (acme/rollout) at 9h 15m — week A's 12h entry of the same tuple is excluded", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    expect(controller.state.biggestTasks[0]).toEqual({
      name: "Acme onboarding",
      client: "acme",
      project: "rollout",
      durationLabel: "9h 15m",
    });
  });

  it("biggest tasks: the SAME name with a DIFFERENT client/project is a separate row, not merged into the top task", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    const acmeRollout = controller.state.biggestTasks.find((t) => t.client === "acme" && t.project === "rollout")!;
    const betaDiscovery = controller.state.biggestTasks.find(
      (t) => t.client === "beta" && t.project === "discovery",
    )!;
    expect(acmeRollout.durationLabel).toBe("9h 15m");
    expect(betaDiscovery.durationLabel).toBe("1h 00m");
    expect(betaDiscovery.name).toBe("Acme onboarding"); // same display name, different tuple
  });

  it("biggest tasks: full ranking is by summed duration, descending", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();

    expect(controller.state.biggestTasks.map((t) => t.durationLabel)).toEqual([
      "9h 15m", // Acme onboarding / acme / rollout
      "3h 30m", // Beta standup / beta / core
      "1h 10m", // Internal sync / — / —
      "1h 00m", // Acme onboarding / beta / discovery
    ]);
  });

  it("es locale: weekday labels and percentages render idiomatically (locale-sensitive surfaces, not just en)", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "es", clock: clock.now });
    await controller.refresh();

    const tue = controller.state.days.find((d) => d.dayKey === "2026-08-18")!;
    expect(tue.weekdayLabel).toBe("mar");
    const acme = controller.state.clientShares.find((c) => c.tag === "acme")!;
    expect(acme.percentLabel).toMatch(/^62.%$/); // es-ES: space (possibly non-breaking) before %
    expect(acme.percentLabel).not.toBe("62%");
  });

  it("isEmpty is false when the current week has any tracked time", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });
    await controller.refresh();
    expect(controller.state.isEmpty).toBe(false);
  });

  it("isEmpty is true, and every list is empty, for a week with no entries at all", async () => {
    const driver = trackDriver(dbPath);
    const clock = fixedClock("2026-08-18T16:00:00.000Z");
    const engine = await TimerEngine.create(driver, clock.now);
    const controller = new InsightsController({ engine, locale: "en", clock: clock.now });

    await controller.refresh();

    expect(controller.state.isEmpty).toBe(true);
    expect(controller.state.days).toHaveLength(7);
    expect(controller.state.days.every((d) => d.seconds === 0)).toBe(true);
    expect(controller.state.clientShares).toEqual([]);
    expect(controller.state.projectShares).toEqual([]);
    expect(controller.state.biggestTasks).toEqual([]);
  });

  it("onStateChange fires with the controller's own state after refresh", async () => {
    const { engine, clock } = await seedTwoWeekFixture();
    let pushed: unknown;
    const controller = new InsightsController({
      engine,
      locale: "en",
      clock: clock.now,
      onStateChange: (state) => {
        pushed = state;
      },
    });
    await controller.refresh();
    expect(pushed).toBe(controller.state);
  });
});
