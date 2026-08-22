// S12 review fix: `SETTINGS_STATE_EVENT` is emitted once at boot (plus on
// every mutation) — but `SettingsContainer` only mounts when the Settings
// tab is selected, and Log (not Settings) is the default tab. By the time
// this container's `listen()` call resolves, the boot emit already
// happened and Tauri does not replay past events to a late listener, so the
// FIRST time someone opens Settings it renders `IDLE_STATE` (blank
// shortcuts, "Match system", empty version) until they change something
// else. The fix: this container must ask for the current state itself on
// mount, once its listener is actually registered (not before — asking
// before the listener exists risks the reply arriving into a void).
//
// `@tauri-apps/api/event` is mocked rather than left untested: unlike the
// project's usual "no unit test for the IPC glue" convention (which is
// about not stubbing the Tauri BRIDGE itself, since a stub only proves the
// stub), this test is about OUR OWN dispatch logic — the ordering between
// registering a listener and firing a request — which is genuinely
// testable against a fake event bus.

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_ACTION_EVENT } from "./settingsEvents";

const { listenMock, emitMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  emitMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
  emit: emitMock,
}));

let SettingsContainer: (typeof import("./SettingsContainer"))["default"];

beforeEach(async () => {
  vi.resetModules();
  listenMock.mockReset();
  emitMock.mockReset();
  emitMock.mockResolvedValue(undefined);
  ({ default: SettingsContainer } = await import("./SettingsContainer"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsContainer — mount", () => {
  it("requests the current settings state once its listener is registered, so the tab is never stuck on IDLE_STATE defaults", async () => {
    listenMock.mockResolvedValue(() => {});

    render(<SettingsContainer />);

    await waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith(SETTINGS_ACTION_EVENT, { action: { type: "requestState" } });
    });
  });

  it("does not request state before the listener has actually registered (no fire-before-listen race)", async () => {
    let resolveListen!: (unlisten: () => void) => void;
    listenMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListen = resolve;
        }),
    );

    render(<SettingsContainer />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(emitMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveListen(() => {});
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(emitMock).toHaveBeenCalledWith(SETTINGS_ACTION_EVENT, { action: { type: "requestState" } });
    });
  });
});
