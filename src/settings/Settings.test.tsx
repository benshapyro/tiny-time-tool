import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import type { SettingsState } from "./settingsController";

const BASE_STATE: SettingsState = {
  shortcutPrimary: "CmdOrCtrl+Shift+Space",
  shortcutStop: "CmdOrCtrl+Shift+Alt+Space",
  shortcutWarnings: [],
  reminderMinutes: 60,
  language: "system",
  theme: "system",
  autostart: true,
  version: "0.1.0",
  updateStatus: "idle",
};

function noop() {}

function renderSettings(overrides: Partial<Parameters<typeof Settings>[0]> = {}) {
  return render(
    <Settings
      locale="en"
      platform="other"
      state={BASE_STATE}
      onRebindShortcut={noop}
      onReminderMinutesChange={noop}
      onLanguageChange={noop}
      onThemeChange={noop}
      onAutostartChange={noop}
      onCheckForUpdates={noop}
      {...overrides}
    />,
  );
}

describe("Settings — shortcuts", () => {
  it("renders the current primary and stop accelerators, formatted for humans (never the raw CmdOrCtrl token)", () => {
    renderSettings();
    expect(screen.getByText("Ctrl+Shift+Space")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+Alt+Space")).toBeInTheDocument();
    expect(screen.queryByText(/CmdOrCtrl/)).not.toBeInTheDocument();
  });

  const CHANGE_PRIMARY = "Change the Start / pause / resume shortcut";

  it("clicking Change enters listening mode", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: CHANGE_PRIMARY }));
    expect(screen.getByText("Press a key combination…")).toBeInTheDocument();
  });

  it("pressing a complete combination while listening calls onRebindShortcut with the built accelerator, and exits listening mode", () => {
    const onRebindShortcut = vi.fn();
    renderSettings({ onRebindShortcut });
    fireEvent.click(screen.getByRole("button", { name: CHANGE_PRIMARY }));
    const listening = screen.getByRole("button", { name: "Press a key combination…" });
    fireEvent.keyDown(listening, { key: "p", ctrlKey: true });
    expect(onRebindShortcut).toHaveBeenCalledWith("primary", "Ctrl+P");
    expect(screen.queryByText("Press a key combination…")).not.toBeInTheDocument();
  });

  it("pressing a bare modifier while listening does nothing yet — stays in listening mode", () => {
    const onRebindShortcut = vi.fn();
    renderSettings({ onRebindShortcut });
    fireEvent.click(screen.getByRole("button", { name: CHANGE_PRIMARY }));
    const listening = screen.getByRole("button", { name: "Press a key combination…" });
    fireEvent.keyDown(listening, { key: "Shift", shiftKey: true });
    expect(onRebindShortcut).not.toHaveBeenCalled();
    expect(screen.getByText("Press a key combination…")).toBeInTheDocument();
  });

  it("Escape cancels listening without calling onRebindShortcut", () => {
    const onRebindShortcut = vi.fn();
    renderSettings({ onRebindShortcut });
    fireEvent.click(screen.getByRole("button", { name: CHANGE_PRIMARY }));
    const listening = screen.getByRole("button", { name: "Press a key combination…" });
    fireEvent.keyDown(listening, { key: "Escape" });
    expect(onRebindShortcut).not.toHaveBeenCalled();
    expect(screen.queryByText("Press a key combination…")).not.toBeInTheDocument();
  });

  it("clicking Cancel exits listening mode without calling onRebindShortcut", () => {
    const onRebindShortcut = vi.fn();
    renderSettings({ onRebindShortcut });
    fireEvent.click(screen.getByRole("button", { name: CHANGE_PRIMARY }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRebindShortcut).not.toHaveBeenCalled();
    expect(screen.queryByText("Press a key combination…")).not.toBeInTheDocument();
  });

  it("renders a failed-registration warning for the affected shortcut — the required failure state", () => {
    renderSettings({
      state: {
        ...BASE_STATE,
        shortcutWarnings: [
          {
            id: "primary",
            accelerator: "Ctrl+Shift+Space",
            messageKey: "shortcuts.warning.primaryFailed",
            driverError: "already registered",
          },
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't set the start\/pause\/resume shortcut/i);
  });
});

describe("Settings — reminders", () => {
  it("selecting a preset interval calls onReminderMinutesChange with that number", () => {
    const onReminderMinutesChange = vi.fn();
    renderSettings({ onReminderMinutesChange });
    fireEvent.change(screen.getByLabelText("Remind me every"), { target: { value: "15" } });
    expect(onReminderMinutesChange).toHaveBeenCalledWith(15);
  });

  it("0 (off) is a real, selectable preset — not indistinguishable from 'not yet set'", () => {
    renderSettings({ state: { ...BASE_STATE, reminderMinutes: 0 } });
    expect(screen.getByLabelText("Remind me every")).toHaveValue("0");
  });

  it("a non-preset value shows the custom number field with the current value", () => {
    renderSettings({ state: { ...BASE_STATE, reminderMinutes: 45 } });
    expect(screen.getByLabelText("Remind me every")).toHaveValue("custom");
    expect(screen.getByLabelText("Minutes")).toHaveValue(45);
  });

  it("editing the custom number field calls onReminderMinutesChange with the typed value", () => {
    const onReminderMinutesChange = vi.fn();
    renderSettings({ state: { ...BASE_STATE, reminderMinutes: 45 }, onReminderMinutesChange });
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "20" } });
    expect(onReminderMinutesChange).toHaveBeenCalledWith(20);
  });

  // Live-review finding (S12): a plain `render()` with a FIXED `state` prop
  // cannot distinguish "selecting Custom actually works" from "the select
  // just snaps back to the old value" — both look identical against a
  // prop that never changes. `renderSettings()`'s test double
  // (`onReminderMinutesChange`) never fed a real state update back in, so
  // every test above it exercised the custom field only by ALREADY
  // starting in a non-preset state, never by choosing "Custom…" from a
  // preset one. A real controlled wrapper (state genuinely re-rendering,
  // same shape `SettingsContainer.tsx` provides in production) is the only
  // way to catch this — and it did: the first version of this component
  // derived the select's value purely from `state.reminderMinutes`, so
  // choosing "Custom…" from "60 minutes" had nothing to switch the
  // underlying value to and the dropdown immediately reverted to showing
  // "60 minutes" — the custom field never appeared, and "Custom…" was
  // unreachable from any preset. Fixed with local `customMode` state, the
  // same "ephemeral UI state the presentational component owns" pattern
  // `listening` already uses for shortcut rebinding.
  function StatefulSettings() {
    const [minutes, setMinutes] = useState(60);
    return (
      <Settings
        locale="en"
        platform="other"
        state={{ ...BASE_STATE, reminderMinutes: minutes }}
        onRebindShortcut={noop}
        onReminderMinutesChange={setMinutes}
        onLanguageChange={noop}
        onThemeChange={noop}
        onAutostartChange={noop}
        onCheckForUpdates={noop}
      />
    );
  }

  it("selecting Custom… from a PRESET value (real state wiring) reveals the number field instead of snapping back", () => {
    render(<StatefulSettings />);
    expect(screen.getByLabelText("Remind me every")).toHaveValue("60");
    fireEvent.change(screen.getByLabelText("Remind me every"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Remind me every")).toHaveValue("custom");
    expect(screen.getByLabelText("Minutes")).toBeInTheDocument();
  });

  it("after selecting Custom…, typing a number actually commits it end-to-end", () => {
    render(<StatefulSettings />);
    fireEvent.change(screen.getByLabelText("Remind me every"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "45" } });
    expect(screen.getByLabelText("Minutes")).toHaveValue(45);
    expect(screen.getByLabelText("Remind me every")).toHaveValue("custom");
  });

  it("switching from Custom back to a preset hides the number field again", () => {
    render(<StatefulSettings />);
    fireEvent.change(screen.getByLabelText("Remind me every"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Minutes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Remind me every"), { target: { value: "30" } });
    expect(screen.queryByLabelText("Minutes")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Remind me every")).toHaveValue("30");
  });
});

describe("Settings — language", () => {
  it("renders the current language selection", () => {
    renderSettings({ state: { ...BASE_STATE, language: "es" } });
    expect(screen.getByLabelText("Language")).toHaveValue("es");
  });

  it("changing the language select calls onLanguageChange", () => {
    const onLanguageChange = vi.fn();
    renderSettings({ onLanguageChange });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "es" } });
    expect(onLanguageChange).toHaveBeenCalledWith("es");
  });

  it("always shows the F10 date/time-picker locale note near the language control", () => {
    renderSettings();
    expect(screen.getByText(/date and time fields follow your computer's language setting/i)).toBeInTheDocument();
  });
});

describe("Settings — appearance", () => {
  it("renders the current theme selection", () => {
    renderSettings({ state: { ...BASE_STATE, theme: "dark" } });
    expect(screen.getByLabelText("Appearance")).toHaveValue("dark");
  });

  it("changing the theme select calls onThemeChange", () => {
    const onThemeChange = vi.fn();
    renderSettings({ onThemeChange });
    fireEvent.change(screen.getByLabelText("Appearance"), { target: { value: "dark" } });
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });
});

describe("Settings — autostart", () => {
  it("renders checked when autostart is true", () => {
    renderSettings({ state: { ...BASE_STATE, autostart: true } });
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("toggling the checkbox calls onAutostartChange with the new value", () => {
    const onAutostartChange = vi.fn();
    renderSettings({ state: { ...BASE_STATE, autostart: true }, onAutostartChange });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onAutostartChange).toHaveBeenCalledWith(false);
  });
});

describe("Settings — about / check for updates", () => {
  it("renders the version", () => {
    renderSettings({ state: { ...BASE_STATE, version: "0.3.1" } });
    expect(screen.getByText("Version 0.3.1")).toBeInTheDocument();
  });

  it("clicking Check for updates calls onCheckForUpdates", () => {
    const onCheckForUpdates = vi.fn();
    renderSettings({ onCheckForUpdates });
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it("renders a success status after a successful check", () => {
    renderSettings({ state: { ...BASE_STATE, updateStatus: "opened" } });
    expect(screen.getByRole("status")).toHaveTextContent("Opened the download page in your browser");
  });

  it("renders an error status after a failed check", () => {
    renderSettings({ state: { ...BASE_STATE, updateStatus: "error" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't open the download page/i);
  });

  it("never advertises click-to-open behaviour for the reminder notification (F9 — the plugin can't deliver it on desktop)", () => {
    renderSettings();
    expect(screen.queryByText(/click/i)).not.toBeInTheDocument();
  });
});

describe("Settings — es locale", () => {
  it("renders distinct, idiomatic es literals, not raw CmdOrCtrl", () => {
    renderSettings({ locale: "es" });
    expect(screen.getByText("Configuración")).toBeInTheDocument();
    expect(screen.getByText("Atajos")).toBeInTheDocument();
    expect(screen.queryByText(/CmdOrCtrl/)).not.toBeInTheDocument();
  });
});
