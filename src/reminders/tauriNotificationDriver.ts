// Production `NotificationDriver`, backed by the official
// `@tauri-apps/plugin-notification` (verified npm name/version 2.3.3 — see
// docs/build-log.md). `sendNotification`/`isPermissionGranted`/
// `requestPermission` talk to the plugin's native bridge; `onAction` is the
// plugin's click-event listener — it fires on a plain notification body
// click even though this driver never calls `registerActionTypes` (the
// mobile-only action-button API BUILD_SPEC's Context bundle gotcha says not
// to use on desktop).
//
// No unit test: these calls invoke Tauri's IPC bridge / the webview's
// patched `Notification` API, which doesn't exist under Vitest/jsdom (same
// reasoning as `tauriSqlDriver.ts` / `tauriShortcutDriver.ts` — stubbing the
// bridge would only prove the stub, not this glue). `ReminderController`'s
// real behaviour is exercised against `fakeNotificationDriver.ts` instead.
// This file's real behaviour — a real notification appearing, a real click
// opening the popover — is exercised live, at the S14 manual-check gate
// (BUILD_SPEC S8 row).

import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { NotificationDriver } from "./notificationDriver";

export function createTauriNotificationDriver(): NotificationDriver {
  return {
    async notify(payload) {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      // A denied OS permission must not throw out of a live reminder tick —
      // there is no user-facing recovery for a background nudge failing to
      // send, unlike a shortcut registration failure (which gets a visible
      // warning + rebind path). Silently skip.
      if (!granted) return;
      sendNotification({ title: payload.title, body: payload.body });
    },

    async onClick(handler) {
      await onAction(() => {
        handler();
      });
    },
  };
}
