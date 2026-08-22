// S5: the live wiring shell for the "popover" window — same architecture as
// `QuickEntryPanelContainer.tsx`. Talks to the "main" window's
// `PopoverController` (owns the real `TimerEngine`) only over Tauri's
// cross-window event bus (`popoverEvents.ts`); the popover window itself
// holds no business logic, only a thin relay from clicks to `PopoverAction`
// events and from `PopoverState` pushes to rendered props.
//
// Also owns the two close behaviors BUILD_SPEC pins for the popover
// (Esc / click-away) — real window behavior, not unit-tested here, same
// "no unit test for the IPC glue" convention as `tauriShortcutDriver.ts` /
// `tauriSqlDriver.ts`. `Popover.tsx`'s own rendering is what's exercised by
// `Popover.test.tsx` against plain props.
//
// No unit test: `listen`/`emit`/`getCurrentWindow` invoke Tauri's IPC
// bridge, which doesn't exist under Vitest/jsdom.

import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useLocale } from "../settings/useLocale";
import Popover from "./Popover";
import { POPOVER_ACTION_EVENT, POPOVER_STATE_EVENT } from "./popoverEvents";
import type { PopoverActionKind } from "./popoverEvents";
import type { PopoverState } from "./popoverController";

const IDLE_STATE: PopoverState = {
  entries: [],
  totalLabel: "0m",
  timerStatus: "idle",
  elapsedSeconds: 0,
  teachLine: null,
  awayPrompt: null,
};

function PopoverContainer() {
  const locale = useLocale();
  const [state, setState] = useState<PopoverState>(IDLE_STATE);

  useEffect(() => {
    const unlisten = listen<PopoverState>(POPOVER_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Esc and click-away both close the popover (BUILD_SPEC S5: "Esc/click-
  // away closes"). Real anchoring/positioning is the S14 manual check;
  // hiding the window itself is exercised here.
  useEffect(() => {
    const hide = () => {
      void getCurrentWindow().hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", hide);
    };
  }, []);

  const dispatch = (action: PopoverActionKind) => {
    void emit(POPOVER_ACTION_EVENT, { action });
  };

  return (
    <Popover
      locale={locale}
      state={state}
      onStart={() => dispatch("start")}
      onPause={() => dispatch("pause")}
      onResume={() => dispatch("resume")}
      onSwitch={() => dispatch("switch")}
      onStop={() => dispatch("stop")}
      onAwayKeep={() => dispatch("awayKeep")}
      onAwayDiscard={() => dispatch("awayDiscard")}
    />
  );
}

export default PopoverContainer;
