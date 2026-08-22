// S4: the live wiring shell for the "panel" window. Owns the input's local
// text state for immediate, round-trip-free typing (Design principle 1:
// "speed is the aesthetic" — waiting on an IPC round-trip per keystroke
// would be exactly the kind of latency that principle rules out) and talks
// to the "main" window's `QuickEntryController` only over Tauri's
// cross-window event bus (`panelEvents.ts` — the two windows are separate
// webview/JS contexts with no shared memory).
//
// No unit test: `listen`/`emit` invoke Tauri's IPC bridge, which doesn't
// exist under Vitest/jsdom (same reasoning as `tauriShortcutDriver.ts` /
// `tauriSqlDriver.ts` — stubbing the bridge would only prove the stub).
// `QuickEntryPanel`'s rendering is exercised by `QuickEntryPanel.test.tsx`
// against plain props; this file's real behaviour is exercised live, at
// the S14 manual-check gate and the S4 spike.

import { emit, listen } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../i18n";
import QuickEntryPanel from "./QuickEntryPanel";
import { PANEL_COMMIT_EVENT, PANEL_INPUT_EVENT, PANEL_STATE_EVENT } from "./panelEvents";
import { panelHeightFor } from "./panelHeight";
import type { PanelState } from "./quickEntryController";

// S4 placeholder, same convention as App.tsx/bootstrap.ts: language comes
// from Settings (`language`) once S12 lands.
const LOCALE: Locale = "en";

const PANEL_WIDTH = 480;

const CLOSED: PanelState = { mode: "closed", text: "", suggestions: [], notice: null };

function QuickEntryPanelContainer() {
  const [text, setText] = useState("");
  const [remote, setRemote] = useState<PanelState>(CLOSED);
  const previousMode = useRef<PanelState["mode"]>("closed");

  useEffect(() => {
    const unlisten = listen<PanelState>(PANEL_STATE_EVENT, (event) => {
      const next = event.payload;
      // A fresh open (closed -> naming/switching) resets the local input —
      // it's a new task, not a continuation of whatever was last typed.
      if (previousMode.current === "closed" && next.mode !== "closed") {
        setText("");
      }
      previousMode.current = next.mode;
      setRemote(next);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Design-review fix (S4): grow the window to its content so suggestion
  // rows are never sliced by the window edge. Width is fixed; only height
  // tracks what is actually rendered.
  useEffect(() => {
    const height = panelHeightFor({
      suggestionCount: remote.suggestions.length,
      hasNotice: remote.notice !== null,
    });
    void getCurrentWindow().setSize(new LogicalSize(PANEL_WIDTH, height));
  }, [remote.suggestions.length, remote.notice]);

  const handleTextChange = (value: string) => {
    setText(value);
    void emit(PANEL_INPUT_EVENT, { text: value });
  };

  const handleCommit = () => {
    void emit(PANEL_COMMIT_EVENT, { text });
  };

  return (
    <QuickEntryPanel
      locale={LOCALE}
      mode={remote.mode}
      text={text}
      suggestions={remote.suggestions}
      notice={remote.notice}
      onTextChange={handleTextChange}
      onCommit={handleCommit}
    />
  );
}

export default QuickEntryPanelContainer;
