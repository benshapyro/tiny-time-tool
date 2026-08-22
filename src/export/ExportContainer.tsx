// S10: the live wiring shell for the Dashboard's Export section — same
// architecture as `LogContainer.tsx`. Talks to the "main" window's
// `ExportController` (owns the real `TimerEngine`, via `bootstrap.ts`) only
// over Tauri's event bus (`exportEvents.ts`); this component itself holds
// no business logic, only a thin relay from clicks to `ExportActionKind`
// events and from `ExportState` pushes to rendered props.
//
// No unit test: `listen`/`emit` invoke Tauri's IPC bridge, which doesn't
// exist under Vitest/jsdom — same "no unit test for the IPC glue" pattern
// as every other *Container.tsx in this project. `Export.tsx`'s own
// rendering is what's exercised by `Export.test.tsx` against plain props,
// and `ExportController`'s own state computation by
// `exportController.test.ts` against a real engine.

import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { Locale } from "../i18n";
import Export from "./Export";
import type { ExportActionKind } from "./exportEvents";
import { EXPORT_ACTION_EVENT, EXPORT_STATE_EVENT } from "./exportEvents";
import type { ExportState } from "./exportController";

// S10 placeholder, same convention as App.tsx/LogContainer.tsx: language
// comes from Settings (`language`) once S12 lands.
const LOCALE: Locale = "en";

const IDLE_STATE: ExportState = {
  copyStatus: "idle",
  rangeStart: "",
  rangeEnd: "",
  rangeError: null,
};

function ExportContainer() {
  const [state, setState] = useState<ExportState>(IDLE_STATE);

  useEffect(() => {
    const unlisten = listen<ExportState>(EXPORT_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const dispatch = (action: ExportActionKind) => {
    void emit(EXPORT_ACTION_EVENT, { action });
  };

  return (
    <Export
      locale={LOCALE}
      state={state}
      onCopyForAi={() => dispatch({ type: "copyForAi" })}
      onRangeStartChange={(value) => dispatch({ type: "setRangeStart", value })}
      onRangeEndChange={(value) => dispatch({ type: "setRangeEnd", value })}
      onExportCsv={() => dispatch({ type: "exportCsv" })}
      onExportJson={() => dispatch({ type: "exportJson" })}
    />
  );
}

export default ExportContainer;
