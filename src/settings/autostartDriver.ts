// S12: the seam between `SettingsController` and the real OS autostart
// registration — same "inject the plugin call behind a small driver
// interface, fake it in tests" pattern as `ShortcutDriver`
// (`shortcuts/shortcutDriver.ts`) and `NotificationDriver`
// (`reminders/notificationDriver.ts`).

export interface AutostartDriver {
  isEnabled(): Promise<boolean>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}
