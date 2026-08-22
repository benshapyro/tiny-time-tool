// S11: the live wiring shell for the Dashboard's Insights tab content — same
// architecture as `LogContainer.tsx`/`ExportContainer.tsx`. Talks to the
// "main" window's `InsightsController` (owns the real `TimerEngine`, via
// `bootstrap.ts`) only over Tauri's event bus (`insightsEvents.ts`); this
// component itself holds no business logic. Unlike `LogContainer`/
// `ExportContainer`, there is nothing here to DISPATCH — Insights has no
// user-triggered actions (BUILD_SPEC S11: three read-only views, no
// date-range builder) — so this component only ever listens.
//
// No unit test: `listen` invokes Tauri's IPC bridge, which doesn't exist
// under Vitest/jsdom — same "no unit test for the IPC glue" pattern as every
// other *Container.tsx in this project. `Insights.tsx`'s own rendering is
// what's exercised by `Insights.test.tsx` against plain props, and
// `InsightsController`'s own state computation by
// `insightsController.test.ts` against a real engine.

import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { Locale } from "../i18n";
import Insights from "./Insights";
import { INSIGHTS_STATE_EVENT } from "./insightsEvents";
import type { InsightsState } from "./insightsController";

// S11 placeholder, same convention as App.tsx/LogContainer.tsx: language
// comes from Settings (`language`) once S12 lands.
const LOCALE: Locale = "en";

const IDLE_STATE: InsightsState = {
  days: [],
  maxDaySeconds: 0,
  clientShares: [],
  projectShares: [],
  biggestTasks: [],
  isEmpty: true,
};

function InsightsContainer() {
  const [state, setState] = useState<InsightsState>(IDLE_STATE);

  useEffect(() => {
    const unlisten = listen<InsightsState>(INSIGHTS_STATE_EVENT, (event) => {
      setState(event.payload);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return <Insights locale={LOCALE} state={state} />;
}

export default InsightsContainer;
