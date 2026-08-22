import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React from "react";
import ReactDOM from "react-dom/client";
import { bootstrap } from "./app/bootstrap";
import DashboardContainer from "./app/DashboardContainer";
import QuickEntryPanelContainer from "./panel/QuickEntryPanelContainer";
import PopoverContainer from "./popover/PopoverContainer";
import LiveSettingsProvider from "./settings/LiveSettingsProvider";
import "./styles/tokens.css";

// Three windows share this one entry point (BUILD_SPEC S4: the quick-entry
// panel window, label "panel"; S5: the tray popover, label "popover" — both
// declared in `src-tauri/tauri.conf.json`). Which React tree mounts is
// decided by the window's own label — the "main" window also owns the
// one-time app wiring (global shortcuts -> TimerEngine, panel summon, tray
// sync, popover sync, and S6's Log-tab sync); neither "panel" nor
// "popover" must ever run that wiring itself, or it would double-register
// the OS-level shortcuts.
const label = getCurrentWebviewWindow().label;

if (label === "main") {
  void bootstrap();
}

// S6: "main" now renders the real Dashboard (`DashboardContainer`, which
// wires the pure `App` tab shell to the live `LogController` via
// `LogContainer`) instead of the bare S1 placeholder `App`.
const RootComponent =
  label === "panel" ? QuickEntryPanelContainer : label === "popover" ? PopoverContainer : DashboardContainer;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* S12: every window — "main", "panel", and "popover" alike — needs to
        react live to a language/theme change (BUILD_SPEC's "without
        restart" acceptance criterion), even though only "main" ever
        renders the Settings tab that changes them. See
        `LiveSettingsProvider.tsx`'s doc comment. */}
    <LiveSettingsProvider>
      <RootComponent />
    </LiveSettingsProvider>
  </React.StrictMode>,
);
