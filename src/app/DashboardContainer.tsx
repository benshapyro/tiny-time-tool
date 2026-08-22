// S6: assembles the real Dashboard ("main" window) for production — the
// pure tab-shell `App` plus the live-wired `LogContainer` as its one tab's
// content. Kept as its own file (rather than inlined in `main.tsx`) for the
// same reason every other window gets a *Container.tsx: `App`/`Log` stay
// fully Tauri-free and testable with plain props/children, and this is the
// one place that assembles the live tree — not unit tested, same "no unit
// test for the IPC glue" convention as `PopoverContainer.tsx`.

import App from "../App";
import LogContainer from "../log/LogContainer";

// S6 placeholder, same convention as App.tsx/bootstrap.ts: language comes
// from Settings (`language`) once S12 lands.
const LOCALE = "en" as const;

function DashboardContainer() {
  return (
    <App locale={LOCALE}>
      <LogContainer />
    </App>
  );
}

export default DashboardContainer;
