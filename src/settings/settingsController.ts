// S12: business logic for the Dashboard's Settings tab (BUILD_SPEC S12 row).
// Mirrors this project's established controller shape (`ExportController`,
// `ReminderController`) — a plain state object, an `onStateChange` push,
// side effects injected behind small driver interfaces so this class is
// unit-testable without a live Tauri bridge.
//
// Composes rather than duplicates: shortcut rebinding is S3's
// `ShortcutController.rebind()` (this controller ONLY adds persistence
// around it — the accelerator-swap logic itself is not re-implemented);
// the reminder interval is S8's `ReminderController.setMinutes()` plus
// `reminderSettings.ts`'s existing persistence (already built for exactly
// this seam — see that module's doc comment: "S12 will build the Settings
// UI that calls setReminderMinutes"). Language/theme/autostart/update-check
// are new to this slice, each its own small module
// (`languageSetting.ts`/`themeSetting.ts`/`autostartSetting.ts`/
// `updateOpener.ts`) for the same reason `firstLaunchFlag.ts` is its own
// file: one persisted concern per module.
//
// "Without restart" (BUILD_SPEC's hard acceptance criterion) is NOT this
// controller's job to apply — this controller only persists the setting and
// pushes it out via `onStateChange`. `LiveSettingsProvider.tsx` (every
// window, via the `settings:state` event `SettingsContainer.tsx` re-emits)
// is what actually swaps `[data-theme]` (`applyTheme.ts`) and re-renders
// with the new `Locale` (`resolveLocale.ts`) live. Splitting it this way
// keeps the "apply theme to the real DOM" step out of a class that needs to
// run identically under Vitest.

import type { ReminderController } from "../reminders/reminderController";
import { getReminderMinutes, setReminderMinutes } from "../reminders/reminderSettings";
import type { ShortcutController, ShortcutId, ShortcutWarning } from "../shortcuts/shortcutController";
import type { SqlDriver } from "../timer/sqlDriver";
import type { AutostartDriver } from "./autostartDriver";
import { getAutostartSetting, setAutostartSetting } from "./autostartSetting";
import type { LanguageSetting } from "./languageSetting";
import { getLanguageSetting, setLanguageSetting } from "./languageSetting";
import { getShortcutSetting, setShortcutSetting } from "./shortcutSettings";
import type { ThemeSetting } from "./themeSetting";
import { getThemeSetting, setThemeSetting } from "./themeSetting";
import { PINNED_UPDATE_URL } from "./updateOpener";
import type { UpdateOpener } from "./updateOpener";

export interface SettingsState {
  shortcutPrimary: string;
  shortcutStop: string;
  shortcutWarnings: ShortcutWarning[];
  reminderMinutes: number;
  language: LanguageSetting;
  theme: ThemeSetting;
  autostart: boolean;
  version: string;
  /** Result of the most recent `checkForUpdates()` call — `"idle"` until
   * first attempted. Same "designed state, not a silent no-op" pattern as
   * `ExportState.copyStatus`. */
  updateStatus: "idle" | "opened" | "error";
}

export interface SettingsControllerOptions {
  driver: SqlDriver;
  shortcuts: ShortcutController;
  reminders: ReminderController;
  /** No default — same convention as `ShortcutController`'s/
   * `ReminderController`'s own mandatory `driver` option: a real OS-facing
   * driver is constructed explicitly in `bootstrap.ts`, never defaulted
   * inside a class that must stay Tauri-import-free for Vitest. */
  autostart: AutostartDriver;
  openUpdatePage: UpdateOpener;
  getVersion: () => Promise<string>;
  onStateChange?: (state: SettingsState) => void;
}

export class SettingsController {
  readonly #driver: SqlDriver;
  readonly #shortcuts: ShortcutController;
  readonly #reminders: ReminderController;
  readonly #autostart: AutostartDriver;
  readonly #openUpdatePage: UpdateOpener;
  readonly #onStateChange?: (state: SettingsState) => void;
  #state: SettingsState;

  private constructor(options: SettingsControllerOptions, initial: SettingsState) {
    this.#driver = options.driver;
    this.#shortcuts = options.shortcuts;
    this.#reminders = options.reminders;
    this.#autostart = options.autostart;
    this.#openUpdatePage = options.openUpdatePage;
    this.#onStateChange = options.onStateChange;
    this.#state = initial;
  }

  /** Reads every persisted setting, reconciles live behaviour to match
   * (reminders' interval, and the OS autostart registration — the latter
   * unconditionally, every boot, so a registration that drifted outside the
   * app, e.g. removed via the OS's own login-items UI, is corrected rather
   * than only handled on first-ever-launch), and returns the constructed
   * controller with its initial `state` already reflecting all of it. */
  static async create(options: SettingsControllerOptions): Promise<SettingsController> {
    const [language, theme, autostart, reminderMinutes, shortcutPrimary, shortcutStop] = await Promise.all([
      getLanguageSetting(options.driver),
      getThemeSetting(options.driver),
      getAutostartSetting(options.driver),
      getReminderMinutes(options.driver),
      getShortcutSetting(options.driver, "primary"),
      getShortcutSetting(options.driver, "stop"),
    ]);

    if (autostart) {
      await options.autostart.enable();
    } else {
      await options.autostart.disable();
    }

    options.reminders.setMinutes(reminderMinutes);

    const version = await options.getVersion();

    const state: SettingsState = {
      // Reflects whatever the ShortcutController was actually constructed
      // with (bootstrap.ts passes these same persisted values as its
      // `accelerators` override), not a second source of truth — if the two
      // ever disagreed, the controller's own live accelerator wins for
      // display purposes below, but at boot they match by construction.
      shortcutPrimary: options.shortcuts.accelerator("primary") || shortcutPrimary,
      shortcutStop: options.shortcuts.accelerator("stop") || shortcutStop,
      shortcutWarnings: options.shortcuts.warnings,
      reminderMinutes,
      language,
      theme,
      autostart,
      version,
      updateStatus: "idle",
    };

    return new SettingsController(options, state);
  }

  get state(): SettingsState {
    return this.#state;
  }

  /** Persists the new accelerator AND drives the live rebind through S3's
   * `ShortcutController.rebind()` — a failed OS registration surfaces as a
   * warning in `state.shortcutWarnings` exactly the way it does at initial
   * `registerAll()` time (S3 row already tested; this reuses the same
   * `warnings` getter, not a parallel implementation). */
  async rebindShortcut(id: ShortcutId, accelerator: string): Promise<void> {
    await this.#shortcuts.rebind(id, accelerator);
    await setShortcutSetting(this.#driver, id, accelerator);
    this.#setState({
      shortcutPrimary: this.#shortcuts.accelerator("primary"),
      shortcutStop: this.#shortcuts.accelerator("stop"),
      shortcutWarnings: this.#shortcuts.warnings,
    });
  }

  /** Persists `reminder.minutes` AND updates the live `ReminderController`
   * (`0` is a fully valid, meaningful value — "off" — and round-trips like
   * any other, same as `reminderSettings.ts` already guarantees). */
  async setReminderMinutes(minutes: number): Promise<void> {
    await setReminderMinutes(this.#driver, minutes);
    this.#reminders.setMinutes(minutes);
    this.#setState({ reminderMinutes: minutes });
  }

  /** Persists `language` only. Applying it live (re-resolving `Locale` and
   * re-rendering every open surface) is `LiveSettingsProvider.tsx`'s job,
   * driven by the `settings:state` event this controller's `onStateChange`
   * feeds — see this module's doc comment. */
  async setLanguage(language: LanguageSetting): Promise<void> {
    await setLanguageSetting(this.#driver, language);
    this.#setState({ language });
  }

  /** Persists `theme` only — same split as `setLanguage`. */
  async setTheme(theme: ThemeSetting): Promise<void> {
    await setThemeSetting(this.#driver, theme);
    this.#setState({ theme });
  }

  /** Persists the user's intent AND reconciles the real OS registration to
   * match, immediately (not just at next boot). */
  async setAutostart(enabled: boolean): Promise<void> {
    await setAutostartSetting(this.#driver, enabled);
    if (enabled) {
      await this.#autostart.enable();
    } else {
      await this.#autostart.disable();
    }
    this.#setState({ autostart: enabled });
  }

  /** Opens the pinned download page via the injected opener — an OPENER
   * call, never a fetch/XHR (see `updateOpener.ts`'s doc comment for why
   * that distinction is the whole point of this method). Never throws: a
   * rejected `openUrl` (no default browser configured, OS refusal) sets
   * `updateStatus: "error"` for the UI to render as a designed state,
   * same pattern as `ExportController.copyTodayForAi`. */
  async checkForUpdates(): Promise<void> {
    try {
      await this.#openUpdatePage(PINNED_UPDATE_URL);
      this.#setState({ updateStatus: "opened" });
    } catch {
      this.#setState({ updateStatus: "error" });
    }
  }

  #setState(patch: Partial<SettingsState>): void {
    this.#state = { ...this.#state, ...patch };
    this.#onStateChange?.(this.#state);
  }
}
