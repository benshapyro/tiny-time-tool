// S8: reminders (BUILD_SPEC S8 row). Same seam pattern as `ShortcutDriver`
// (S3) and `SqlDriver` (S2): business logic (`ReminderController`) talks
// only to this interface, never to a concrete notification library, so it's
// unit-testable without a native harness and Rust/the plugin stay swappable
// plumbing.
//
// Deliberately narrow: `notify` sends a plain nudge (title + body only —
// desktop notification *action buttons* are mobile-only in Tauri's
// notification plugin, per BUILD_SPEC's Context bundle gotcha, so this
// interface has no `actions` field to tempt a caller into adding them).
// `onClick` registers the single handler for "the user clicked the
// notification" — the mechanism BUILD_SPEC pins ("clicking it opens the
// popover"), backed by the plugin's `onAction` listener in the real driver
// (`tauriNotificationDriver.ts`), which fires on a plain body click even
// with no action buttons registered. Not a per-notification callback: like
// `ShortcutDriver.register`, the driver holds exactly one handler at a time,
// registered once at startup.

export interface NotificationPayload {
  title: string;
  body: string;
}

export type NotificationClickHandler = () => void;

export interface NotificationDriver {
  /** Sends a nudge. Resolves once the send has been attempted — a denied
   * OS permission is the driver's concern (the real driver swallows it
   * rather than throwing into a live reminder tick), not the caller's. */
  notify(payload: NotificationPayload): Promise<void>;
  /** Registers the handler invoked when the user clicks a notification this
   * driver sent. */
  onClick(handler: NotificationClickHandler): Promise<void>;
}
