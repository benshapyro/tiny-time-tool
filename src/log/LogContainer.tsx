// S6: the live wiring shell for the Dashboard's Log tab content — same
// architecture as `PopoverContainer.tsx`. Talks to the "main" window's
// `LogController` (owns the real `TimerEngine`, via `bootstrap.ts`) only
// over Tauri's event bus (`logEvents.ts`); this component itself holds no
// business logic, only a thin relay from clicks to `LogActionKind` events
// and from `LogState` pushes to rendered props.
//
// No unit test: `listen`/`emit` invoke Tauri's IPC bridge, which doesn't
// exist under Vitest/jsdom — same "no unit test for the IPC glue" pattern
// as every other *Container.tsx in this project. `Log.tsx`'s own rendering
// is what's exercised by `Log.test.tsx` against plain props, and
// `LogController`'s own state computation by `logController.test.ts`
// against a real engine.

import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { Locale } from "../i18n";
import Log from "./Log";
import { LOG_ACTION_EVENT, LOG_STATE_EVENT } from "./logEvents";
import type { LogActionKind } from "./logEvents";
import type { LogState } from "./logController";

// S6 placeholder, same convention as App.tsx/PopoverContainer.tsx: language
// comes from Settings (`language`) once S12 lands.
const LOCALE: Locale = "en";

const IDLE_STATE: LogState = {
  dayKey: "",
  isToday: true,
  canGoNext: false,
  entries: [],
  totalLabel: "0m",
  emptyStateTeachLine: null,
};

function LogContainer() {
  const [state, setState] = useState<LogState>(IDLE_STATE);

  useEffect(() => {
    const unlisten = listen<LogState>(LOG_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const dispatch = (action: LogActionKind) => {
    void emit(LOG_ACTION_EVENT, { action });
  };

  return (
    <Log
      locale={LOCALE}
      state={state}
      onToday={() => dispatch("today")}
      onPrevious={() => dispatch("previous")}
      onNext={() => dispatch("next")}
    />
  );
}

export default LogContainer;
