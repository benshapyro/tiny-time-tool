import type { ReactNode } from "react";
import type { Locale } from "./i18n";
import { t } from "./i18n";
import "./App.css";

export interface AppProps {
  /**
   * Language will come from Settings (`language`) and OS detection once
   * S12 lands; default "en" until then.
   */
  locale?: Locale;
  /** The active tab's content. Only one tab exists yet — the Log tab
   * (BUILD_SPEC S6 row) — so this is always the Log's rendered view; when
   * Insights (S11) and Settings (S12) land, this becomes tab-dependent.
   * Left un-rendered (rather than the S1 placeholder text) when omitted,
   * so this component stays pure and testable without a live engine — the
   * real content is wired in by `app/DashboardContainer.tsx`. */
  children?: ReactNode;
}

/**
 * Root component for the Dashboard ("main") window (BUILD_SPEC S6 row).
 * Was an S1 placeholder proving only that the app boots and reads every
 * string through i18n; this is the slice that makes it real.
 *
 * Just the tab shell S6 needs: a single "Log" tab, selected, hosting
 * whatever content is passed in. BUILD_SPEC's Dashboard eventually has
 * Insights (S11) and Settings (S12) tabs too, but the rollout notes say to
 * build the shell only as far as the current slice needs — their content
 * is not stubbed here, and neither is a second tab button for them.
 */
function App({ locale = "en", children }: AppProps) {
  return (
    <div className="dashboard">
      <div className="dashboard__tabs" role="tablist" aria-label={t(locale, "dashboard.tabsLabel")}>
        <button type="button" role="tab" aria-selected="true" className="dashboard__tab dashboard__tab--active">
          {t(locale, "dashboard.tab.log")}
        </button>
      </div>
      <div className="dashboard__content" role="tabpanel">
        {children}
      </div>
    </div>
  );
}

export default App;
