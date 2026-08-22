// S6/S11: assembles the real Dashboard ("main" window) for production — the
// pure tab-shell `App` plus the live-wired containers for each tab's
// content. Kept as its own file (rather than inlined in `main.tsx`) for the
// same reason every other window gets a *Container.tsx: `App`/`Log`/
// `Insights` stay fully Tauri-free and testable with plain props, and this
// is the one place that assembles the live tree — not unit tested, same "no
// unit test for the IPC glue" convention as `PopoverContainer.tsx`.

import App from "../App";
import ExportContainer from "../export/ExportContainer";
import InsightsContainer from "../insights/InsightsContainer";
import LogContainer from "../log/LogContainer";
import SettingsContainer from "../settings/SettingsContainer";
import { useLocale } from "../settings/useLocale";

function DashboardContainer() {
  // S12: the live-resolved locale, from `LiveSettingsProvider` (wrapped
  // around this window's root in `main.tsx`) — replaces the hardcoded
  // "en" placeholder every window carried before Settings existed to
  // change it.
  const locale = useLocale();

  return (
    <App
      locale={locale}
      logContent={
        <>
          <LogContainer />
          {/* S10: Copy-for-AI + CSV/JSON export, docked under the Log tab's
              content rather than a separate Dashboard tab — Copy-for-AI acts
              on "today" (no day-nav needed of its own) and the range export
              is a couple of inputs and two buttons; a whole new tab would be
              more chrome than either action needs (Design principle 3,
              "calm surfaces"). */}
          <ExportContainer />
        </>
      }
      // S11: Insights gets its OWN tab (unlike Export) — BUILD_SPEC's S11
      // row names it as a real Dashboard tab, and its three views (plus the
      // "nothing renders beyond" scope limit) only make sense as a distinct
      // surface, not something docked under Log's content the way Export's
      // couple of inputs were.
      insightsContent={<InsightsContainer />}
      // S12: Settings gets its own tab too — decisions.md #26 names the
      // three-tab set explicitly ("Log / Insights / Settings").
      settingsContent={<SettingsContainer />}
    />
  );
}

export default DashboardContainer;
