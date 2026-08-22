import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { Locale } from "./i18n";
import { t } from "./i18n";
import "./App.css";

export type DashboardTab = "log" | "insights";

export interface AppProps {
  /**
   * Language will come from Settings (`language`) and OS detection once
   * S12 lands; default "en" until then.
   */
  locale?: Locale;
  /** The Log tab's content (BUILD_SPEC S6 row: entries + day nav, plus S10's
   * Export section docked beneath it). Rendered only while the Log tab is
   * selected. */
  logContent?: ReactNode;
  /** The Insights tab's content (BUILD_SPEC S11 row). Rendered only while
   * the Insights tab is selected — critically, NOT alongside `logContent`:
   * before this slice, `App` rendered whatever `children` it was given
   * unconditionally regardless of which tab button looked selected, which
   * would have made "nothing renders beyond the three views" untestable at
   * this level (Insights content would always be sharing the screen with
   * Log's). Left un-rendered (rather than an S1 placeholder) when omitted,
   * so this component stays pure and testable without a live engine — the
   * real content is wired in by `app/DashboardContainer.tsx`. */
  insightsContent?: ReactNode;
}

/**
 * Root component for the Dashboard ("main") window (BUILD_SPEC S6/S11 rows).
 * Was an S1 placeholder proving only that the app boots and reads every
 * string through i18n, then an S6 shell with exactly one always-selected
 * tab; this is the slice that makes tab SWITCHING real — Log and Insights,
 * with genuine ARIA `tab`/`tabpanel` wiring (`aria-controls`/
 * `aria-labelledby`) rather than a single hardcoded `aria-selected="true"`.
 * Settings (S12) is not stubbed here yet, same "build the shell only as far
 * as the current slice needs" rule S6's own comment established.
 *
 * `activeTab` is local UI-only state (which tab is showing) — the one piece
 * of state this otherwise-pure component owns, same reasoning as
 * `Log.tsx`'s `EditForm` owning its own uncommitted draft text: no
 * controller needs to know which tab button was clicked.
 */
function App({ locale = "en", logContent, insightsContent }: AppProps) {
  const idBase = useId();
  const [activeTab, setActiveTab] = useState<DashboardTab>("log");

  const logTabId = `${idBase}-tab-log`;
  const logPanelId = `${idBase}-panel-log`;
  const insightsTabId = `${idBase}-tab-insights`;
  const insightsPanelId = `${idBase}-panel-insights`;

  return (
    <div className="dashboard">
      <div className="dashboard__tabs" role="tablist" aria-label={t(locale, "dashboard.tabsLabel")}>
        <button
          type="button"
          role="tab"
          id={logTabId}
          aria-selected={activeTab === "log"}
          aria-controls={logPanelId}
          className={`dashboard__tab${activeTab === "log" ? " dashboard__tab--active" : ""}`}
          onClick={() => setActiveTab("log")}
        >
          {t(locale, "dashboard.tab.log")}
        </button>
        <button
          type="button"
          role="tab"
          id={insightsTabId}
          aria-selected={activeTab === "insights"}
          aria-controls={insightsPanelId}
          className={`dashboard__tab${activeTab === "insights" ? " dashboard__tab--active" : ""}`}
          onClick={() => setActiveTab("insights")}
        >
          {t(locale, "dashboard.tab.insights")}
        </button>
      </div>
      {activeTab === "log" ? (
        <div className="dashboard__content" role="tabpanel" id={logPanelId} aria-labelledby={logTabId}>
          {logContent}
        </div>
      ) : (
        <div className="dashboard__content" role="tabpanel" id={insightsPanelId} aria-labelledby={insightsTabId}>
          {insightsContent}
        </div>
      )}
    </div>
  );
}

export default App;
