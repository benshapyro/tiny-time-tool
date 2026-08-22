import type { Locale } from "./i18n";
import { t } from "./i18n";

export interface AppProps {
  /**
   * S1 placeholder: the main window is a stub until S6 builds the real
   * Dashboard. Language will come from Settings (`language`) and OS
   * detection once S12 lands; default "en" for now.
   */
  locale?: Locale;
}

/**
 * Root component for the (future) Dashboard window. S1 only needs it to
 * prove the app boots, mounts, and reads every user-visible string through
 * the i18n layer — no hardcoded text.
 */
function App({ locale = "en" }: AppProps) {
  return (
    <main>
      <h1>{t(locale, "app.name")}</h1>
      <p>{t(locale, "tray.openDashboard")}</p>
    </main>
  );
}

export default App;
