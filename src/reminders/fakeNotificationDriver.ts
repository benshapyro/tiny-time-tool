// Test double for `NotificationDriver` (BUILD_SPEC S8: "Tests (against a
// stubbed notification interface — CI runners have no notification
// permission, and real OS click delivery can't be synthesized)"). Same
// pattern as `fakeShortcutDriver.ts`: records what was sent, and exposes
// `click()` so a test can simulate "the user clicked the notification" by
// invoking the internal handler directly — the CI-safe analogue of a real
// OS click.

import type { NotificationClickHandler, NotificationDriver, NotificationPayload } from "./notificationDriver";

export interface FakeNotificationDriver extends NotificationDriver {
  /** Every payload passed to `notify()`, in call order. */
  readonly calls: NotificationPayload[];
  /** Simulates a notification click: invokes whatever handler is currently
   * registered via `onClick()`. Throws if nothing is registered — a test
   * clicking before registration is a test bug, not a thing to silently
   * no-op (same convention as `fakeShortcutDriver.press()`). */
  click(): void;
}

export function createFakeNotificationDriver(): FakeNotificationDriver {
  const calls: NotificationPayload[] = [];
  let clickHandler: NotificationClickHandler | undefined;

  return {
    calls,

    async notify(payload) {
      calls.push(payload);
    },

    async onClick(handler) {
      clickHandler = handler;
    },

    click() {
      if (!clickHandler) {
        throw new Error("fake driver: no click handler registered");
      }
      clickHandler();
    },
  };
}
