// S12 Dashboard Settings tab — the presentational shell (BUILD_SPEC S12
// row). Pure props in, no Tauri IPC here — the live wiring lives in
// `SettingsContainer.tsx`, same "no unit test for the IPC glue" pattern as
// every other *Container.tsx. Every string through i18n, every color/space/
// type value from `src/styles/tokens.css` (`settings.css`) — no literals
// (BUILD_SPEC advisory rule + Design principle 4).
//
// Shortcut rebind (BUILD_SPEC: "must surface a failed registration"): a
// "Change" button enters a listening state (Design principle 6 — every
// state is designed, this one included) that captures the next key
// combination via the pure `acceleratorFromKeyCombo` and hands it to
// `onRebindShortcut`, which drives S3's already-tested `rebind()` — this
// component never re-implements the rebind or the accelerator-registration
// logic, only the "listen for keys" UI around it. A warning from
// `state.shortcutWarnings` (reusing S3's own pinned copy —
// `shortcuts.warning.primaryFailed`/`stopFailed`, which already says "Pick
// a different one in Settings") renders inline, independent of whether the
// row is currently listening, so a failed rebind stays visible until fixed.
//
// F10 (verification.md): native date/time inputs follow the OS locale, not
// this app's `language` setting — S12 owns the one control that can make
// that mismatch reachable on purpose, so a note sits right under the
// language selector rather than leaving it to be discovered by accident.

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Locale } from "../i18n";
import { interpolate, t } from "../i18n";
import type { AcceleratorPlatform } from "../shortcuts/formatAccelerator";
import { formatAccelerator } from "../shortcuts/formatAccelerator";
import type { ShortcutId } from "../shortcuts/shortcutController";
import { acceleratorFromKeyCombo } from "./acceleratorCapture";
import type { LanguageSetting } from "./languageSetting";
import type { SettingsState } from "./settingsController";
import type { ThemeSetting } from "./themeSetting";
import "./settings.css";

export interface SettingsProps {
  locale: Locale;
  platform: AcceleratorPlatform;
  state: SettingsState;
  onRebindShortcut: (id: ShortcutId, accelerator: string) => void;
  onReminderMinutesChange: (minutes: number) => void;
  onLanguageChange: (language: LanguageSetting) => void;
  onThemeChange: (theme: ThemeSetting) => void;
  onAutostartChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
}

/** BUILD_SPEC's pinned default is 60m; decisions.md #5 names 15/30/60 as
 * the customary presets alongside off/custom. */
const REMINDER_PRESETS = [0, 15, 30, 60];

function Settings({
  locale,
  platform,
  state,
  onRebindShortcut,
  onReminderMinutesChange,
  onLanguageChange,
  onThemeChange,
  onAutostartChange,
  onCheckForUpdates,
}: SettingsProps) {
  const idBase = useId();
  const [listening, setListening] = useState<ShortcutId | null>(null);
  // Live-review finding: selecting "Custom…" from a PRESET value has no
  // committed number to switch to yet, so deriving the select's displayed
  // option purely from `state.reminderMinutes` meant the browser snapped
  // the dropdown straight back to the old preset the instant "Custom…" was
  // chosen — the custom field never appeared, and "Custom…" was reachable
  // only by already being in a non-preset state (e.g. restored from a prior
  // session). Same ephemeral-UI-state pattern as `listening` above: this
  // component remembers "the user asked for custom" locally until a real
  // number commits it.
  const [customMode, setCustomMode] = useState(false);
  // Review finding (S12): selecting the digits in the custom field to
  // retype them leaves it briefly empty — a normal in-progress edit, not a
  // choice of "0 (off)". `Number.parseInt("", 10)` is `NaN`, and the old
  // code folded "not a finite number" straight into 0, silently turning
  // reminders off on every clear-and-retype. This mirrors `customMode`'s
  // own "ephemeral UI state the presentational component owns, not derived
  // from `state`" pattern: while the field is empty, there is no committed
  // number to derive a value from, so this remembers the raw in-progress
  // text instead of guessing one. `null` means "not editing — show
  // `state.reminderMinutes`"; any string (including "") is what the user
  // is currently typing.
  const [customDraft, setCustomDraft] = useState<string | null>(null);

  const warningFor = (id: ShortcutId) => state.shortcutWarnings.find((w) => w.id === id) ?? null;

  const handleKeyDown = (id: ShortcutId) => (event: KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    if (event.key === "Escape") {
      setListening(null);
      return;
    }
    const accelerator = acceleratorFromKeyCombo({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    });
    if (!accelerator) return; // not a complete combination yet — keep listening
    onRebindShortcut(id, accelerator);
    setListening(null);
  };

  const isPresetMinutes = REMINDER_PRESETS.includes(state.reminderMinutes);

  function shortcutRow(id: ShortcutId, label: string, currentAccelerator: string) {
    const warning = warningFor(id);
    return (
      <div className="settings__shortcutRow" key={id}>
        <span className="settings__shortcutLabel">{label}</span>
        {listening === id ? (
          <div
            className="settings__shortcutListening"
            tabIndex={0}
            role="button"
            // Review finding (S12): React's `autoFocus` only auto-focuses
            // host form elements (button/input/select/textarea) — never an
            // arbitrary element like this `<div>`, even with `tabIndex={0}`.
            // A callback ref calls `.focus()` directly the moment this node
            // mounts (i.e. exactly when a row enters listening mode), which
            // works for any focusable element and needs no `useEffect`
            // (this is a plain function, not its own component).
            ref={(node) => {
              node?.focus();
            }}
            aria-label={t(locale, "settings.shortcuts.listening")}
            onKeyDown={handleKeyDown(id)}
          >
            <span>{t(locale, "settings.shortcuts.listening")}</span>
            <button type="button" className="settings__shortcutCancel" onClick={() => setListening(null)}>
              {t(locale, "settings.shortcuts.cancel")}
            </button>
          </div>
        ) : (
          <>
            <span className="settings__shortcutValue">{formatAccelerator(currentAccelerator, platform, locale)}</span>
            <button
              type="button"
              className="settings__shortcutChange"
              aria-label={interpolate(t(locale, "settings.shortcuts.changeAria"), { label })}
              onClick={() => setListening(id)}
            >
              {t(locale, "settings.shortcuts.change")}
            </button>
          </>
        )}
        {warning && (
          <p className="settings__shortcutWarning" role="alert">
            {t(locale, warning.messageKey)}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="settings" aria-label={t(locale, "settings.sectionLabel")}>
      <h2 className="settings__title">{t(locale, "settings.sectionLabel")}</h2>
      <div className="settings__group">
        <h3 className="settings__groupTitle">{t(locale, "settings.shortcuts.title")}</h3>
        {shortcutRow("primary", t(locale, "settings.shortcuts.primaryLabel"), state.shortcutPrimary)}
        {shortcutRow("stop", t(locale, "settings.shortcuts.stopLabel"), state.shortcutStop)}
      </div>

      <div className="settings__group">
        <h3 className="settings__groupTitle">{t(locale, "settings.reminders.title")}</h3>
        <label className="settings__fieldLabel" htmlFor={`${idBase}-reminder`}>
          {t(locale, "settings.reminders.label")}
        </label>
        <select
          id={`${idBase}-reminder`}
          className="settings__select"
          value={customMode || !isPresetMinutes ? "custom" : String(state.reminderMinutes)}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "custom") {
              setCustomMode(true);
              return; // wait for a real number in the field below
            }
            setCustomMode(false);
            setCustomDraft(null); // leaving custom entirely — no in-progress edit to remember
            onReminderMinutesChange(Number.parseInt(value, 10));
          }}
        >
          <option value="0">{t(locale, "settings.reminders.off")}</option>
          <option value="15">{t(locale, "settings.reminders.15")}</option>
          <option value="30">{t(locale, "settings.reminders.30")}</option>
          <option value="60">{t(locale, "settings.reminders.60")}</option>
          <option value="custom">{t(locale, "settings.reminders.custom")}</option>
        </select>
        {(customMode || !isPresetMinutes) && (
          <>
            <label className="settings__fieldLabel" htmlFor={`${idBase}-reminder-custom`}>
              {t(locale, "settings.reminders.customLabel")}
            </label>
            <input
              id={`${idBase}-reminder-custom`}
              className="settings__numberInput"
              type="number"
              min={0}
              value={customDraft ?? state.reminderMinutes}
              onChange={(event) => {
                const raw = event.target.value;
                setCustomDraft(raw);
                if (raw === "") return; // in-progress edit — do not persist 0 for an empty field
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  onReminderMinutesChange(parsed);
                }
              }}
            />
          </>
        )}
      </div>

      <div className="settings__group">
        <h3 className="settings__groupTitle">{t(locale, "settings.language.title")}</h3>
        {/* Visually hidden: the group title above already says "Language" —
            a second visible copy right below it was a real duplication
            (caught in the S12 screenshot review), but the <select> still
            needs its own accessible name. */}
        <label className="settings__visuallyHidden" htmlFor={`${idBase}-language`}>
          {t(locale, "settings.language.title")}
        </label>
        <select
          id={`${idBase}-language`}
          className="settings__select"
          value={state.language}
          onChange={(event) => onLanguageChange(event.target.value as LanguageSetting)}
        >
          <option value="system">{t(locale, "settings.language.system")}</option>
          <option value="en">{t(locale, "settings.language.en")}</option>
          <option value="es">{t(locale, "settings.language.es")}</option>
        </select>
        <p className="settings__note">{t(locale, "settings.language.note")}</p>
      </div>

      <div className="settings__group">
        <h3 className="settings__groupTitle">{t(locale, "settings.appearance.title")}</h3>
        <label className="settings__visuallyHidden" htmlFor={`${idBase}-theme`}>
          {t(locale, "settings.appearance.title")}
        </label>
        <select
          id={`${idBase}-theme`}
          className="settings__select"
          value={state.theme}
          onChange={(event) => onThemeChange(event.target.value as ThemeSetting)}
        >
          <option value="system">{t(locale, "settings.appearance.system")}</option>
          <option value="light">{t(locale, "settings.appearance.light")}</option>
          <option value="dark">{t(locale, "settings.appearance.dark")}</option>
        </select>
      </div>

      <div className="settings__group">
        <label className="settings__checkboxRow" htmlFor={`${idBase}-autostart`}>
          <input
            id={`${idBase}-autostart`}
            type="checkbox"
            checked={state.autostart}
            onChange={(event) => onAutostartChange(event.target.checked)}
          />
          {t(locale, "settings.autostart.label")}
        </label>
        {state.autostartError && (
          <p className="settings__autostartError" role="alert">
            {t(locale, "settings.autostart.error")}
          </p>
        )}
      </div>

      <div className="settings__group">
        <h3 className="settings__groupTitle">{t(locale, "settings.about.title")}</h3>
        <p className="settings__version">
          {interpolate(t(locale, "settings.about.version"), { version: state.version })}
        </p>
        <button type="button" className="settings__updateButton" onClick={onCheckForUpdates}>
          {t(locale, "settings.about.checkForUpdates")}
        </button>
        {state.updateStatus === "opened" && (
          <span className="settings__updateStatus settings__updateStatus--success" role="status">
            {t(locale, "settings.about.updateOpened")}
          </span>
        )}
        {state.updateStatus === "error" && (
          <span className="settings__updateStatus settings__updateStatus--error" role="alert">
            {t(locale, "settings.about.updateError")}
          </span>
        )}
      </div>
    </section>
  );
}

export default Settings;
