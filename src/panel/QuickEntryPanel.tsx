// S4 quick-entry panel — the presentational shell. Pure props in, no Tauri
// IPC here (the live cross-window wiring lives in
// `QuickEntryPanelContainer.tsx`, exercised at the S14 manual-check gate
// and the S4 spike — same "no unit test for the IPC glue" pattern as
// `tauriShortcutDriver.ts`), which is what makes this fully testable with
// Testing Library.
//
// Rendered inside a small, centered, always-on-top, undecorated window
// (declared in `src-tauri/tauri.conf.json`, label "panel"). Proven by the
// S4 spike (docs/build-log.md) to receive keyboard focus immediately when
// summoned over a frontmost third-party app: `panel.show()` +
// `panel.setFocus()` reliably takes macOS app activation away from
// whatever was frontmost, and the `autoFocus` input below holds
// `document.activeElement` throughout (mounted once at app startup —
// window visibility is what toggles around it, never a remount per open).
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`quickEntryPanel.css`) — no literals
// (BUILD_SPEC advisory rule + Design principle 4).

import type { KeyboardEvent } from "react";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import type { PanelMode } from "./quickEntryController";
import "./quickEntryPanel.css";

export interface QuickEntryPanelProps {
  locale: Locale;
  mode: PanelMode;
  text: string;
  suggestions: string[];
  notice: string | null;
  onTextChange: (text: string) => void;
  onCommit: () => void;
}

function QuickEntryPanel({ locale, mode, text, suggestions, notice, onTextChange, onCommit }: QuickEntryPanelProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
  };

  return (
    <main className="quick-entry" data-mode={mode}>
      {notice !== null && <p className="quick-entry__notice">{notice}</p>}
      <input
        aria-label={t(locale, "panel.inputLabel")}
        className="quick-entry__input"
        autoFocus
        placeholder={t(locale, "panel.placeholder")}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {suggestions.length > 0 && (
        <ul className="quick-entry__suggestions" aria-label={t(locale, "panel.suggestionsLabel")}>
          {suggestions.map((suggestion) => (
            <li key={suggestion} className="quick-entry__suggestion">
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default QuickEntryPanel;
