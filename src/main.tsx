import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrap } from "./app/bootstrap";
import QuickEntryPanelContainer from "./panel/QuickEntryPanelContainer";
import "./styles/tokens.css";

// Two windows share this one entry point (BUILD_SPEC S4: the quick-entry
// panel window, label "panel", declared in `src-tauri/tauri.conf.json`).
// Which React tree mounts is decided by the window's own label — the
// "main" window also owns the one-time app wiring (global shortcuts ->
// TimerEngine, panel summon, tray sync); the "panel" window must never run
// that wiring itself, or it would double-register the OS-level shortcuts.
const label = getCurrentWebviewWindow().label;

if (label === "main") {
  void bootstrap();
}

const RootComponent = label === "panel" ? QuickEntryPanelContainer : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
