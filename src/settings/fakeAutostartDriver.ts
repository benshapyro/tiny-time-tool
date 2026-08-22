// Test double for `AutostartDriver` — same pattern as
// `fakeNotificationDriver.ts`/`fakeShortcutDriver.ts`: an in-memory boolean
// standing in for the real OS registration, with every call recorded so a
// test can assert not just the end state but that the reconciliation calls
// (`enable()`/`disable()` at boot) actually happened.

import type { AutostartDriver } from "./autostartDriver";

export interface FakeAutostartDriver extends AutostartDriver {
  /** "enable" | "disable" for every call, in order. */
  readonly calls: Array<"enable" | "disable">;
  /** S12 review fix: flips whether the NEXT `enable()`/`disable()` call
   * rejects — simulates a denied LaunchAgent write / unsigned build /
   * capability drift, so `SettingsController`'s handling of that rejection
   * (never an unhandled rejection, always a designed state) is testable
   * without a real OS. */
  setFailing(failing: boolean): void;
}

export function createFakeAutostartDriver(
  initiallyEnabled = false,
  options?: { failing?: boolean },
): FakeAutostartDriver {
  let enabled = initiallyEnabled;
  let failing = options?.failing ?? false;
  const calls: Array<"enable" | "disable"> = [];

  return {
    calls,
    setFailing(next) {
      failing = next;
    },
    async isEnabled() {
      return enabled;
    },
    async enable() {
      if (failing) throw new Error("fake driver: enable rejected");
      enabled = true;
      calls.push("enable");
    },
    async disable() {
      if (failing) throw new Error("fake driver: disable rejected");
      enabled = false;
      calls.push("disable");
    },
  };
}
