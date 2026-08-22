// Test double for `AutostartDriver` — same pattern as
// `fakeNotificationDriver.ts`/`fakeShortcutDriver.ts`: an in-memory boolean
// standing in for the real OS registration, with every call recorded so a
// test can assert not just the end state but that the reconciliation calls
// (`enable()`/`disable()` at boot) actually happened.

import type { AutostartDriver } from "./autostartDriver";

export interface FakeAutostartDriver extends AutostartDriver {
  /** "enable" | "disable" for every call, in order. */
  readonly calls: Array<"enable" | "disable">;
}

export function createFakeAutostartDriver(initiallyEnabled = false): FakeAutostartDriver {
  let enabled = initiallyEnabled;
  const calls: Array<"enable" | "disable"> = [];

  return {
    calls,
    async isEnabled() {
      return enabled;
    },
    async enable() {
      enabled = true;
      calls.push("enable");
    },
    async disable() {
      enabled = false;
      calls.push("disable");
    },
  };
}
