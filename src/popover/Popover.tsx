// S5 tray popover — the presentational shell (BUILD_SPEC S5 row). Pure
// props in, no Tauri IPC here — the live cross-window wiring lives in
// `PopoverContainer.tsx`, exercised at the S14 manual-check gate, same "no
// unit test for the IPC glue" pattern as `QuickEntryPanelContainer.tsx`.
//
// Owns exactly one piece of local state: the live per-second tick of the
// elapsed-time display while running. `popoverController.ts` only supplies
// an `elapsedSeconds` snapshot as of the last `refresh()` — re-fetching
// from the database every second would be wasteful and pointless (nothing
// in the day view changes second to second except this one number), so the
// component ticks its own local counter and resyncs whenever the snapshot
// changes underneath it (a fresh `refresh()`, e.g. after start/pause/
// resume/stop). The interval is cleared on every unmount and on every
// `timerStatus` change (paused/idle must freeze, not keep ticking).
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`popover.css`) — no literals (BUILD_SPEC
// advisory rule + Design principle 4). Paused is visually distinct from
// both running and stopped (BUILD_SPEC S5): the pinned pause glyph plus the
// `--color-state-paused` token, applied consistently to the top timer, the
// entry row, and the status word.

import { useEffect, useState } from "react";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import { PAUSE_GLYPH, formatElapsed } from "../tray/trayTitle";
import type { PopoverState } from "./popoverController";
import "./popover.css";

export interface PopoverProps {
  locale: Locale;
  state: PopoverState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSwitch: () => void;
  onStop: () => void;
  /** S9: away-gap recovery — "Keep" (add the away time back). */
  onAwayKeep: () => void;
  /** S9: away-gap recovery — "Discard" (leave it trimmed). */
  onAwayDiscard: () => void;
}

function Popover({ locale, state, onStart, onPause, onResume, onSwitch, onStop, onAwayKeep, onAwayDiscard }: PopoverProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(state.elapsedSeconds);

  // Resync the local tick whenever the controller hands us a fresh
  // snapshot (a new `refresh()` — e.g. after an action, or on open).
  useEffect(() => {
    setElapsedSeconds(state.elapsedSeconds);
  }, [state.elapsedSeconds]);

  // Tick once a second only while running; frozen while paused or idle.
  // Cleanup runs on every dependency change AND on unmount — React
  // guarantees this, which is what keeps this leak-free (BUILD_SPEC S5:
  // "Live ticking must not leak timers").
  useEffect(() => {
    if (state.timerStatus !== "running") return;
    const id = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.timerStatus]);

  const elapsedLabel = state.timerStatus === "idle" ? "" : formatElapsed(elapsedSeconds);
  const statusKey = state.timerStatus === "running" ? "popover.status.running" : "popover.status.paused";

  return (
    <main className="popover" data-timer-status={state.timerStatus}>
      {state.timerStatus !== "idle" && (
        <div className="popover__timer" data-status={state.timerStatus}>
          <span className="popover__elapsed">{elapsedLabel}</span>
          <span className="popover__status">{t(locale, statusKey)}</span>
        </div>
      )}

      {state.entries.length === 0 && state.teachLine !== null ? (
        <p className="popover__teach">{state.teachLine}</p>
      ) : (
        <ul className="popover__entries" aria-label={t(locale, "popover.entriesLabel")}>
          {state.entries.map((entry) => (
            <li key={entry.id} className="popover__entry" data-status={entry.status}>
              <span className="popover__entryName">
                {entry.status === "paused" ? `${PAUSE_GLYPH} ` : ""}
                {entry.name}
              </span>
              <span className="popover__entryDuration">{entry.durationLabel}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="popover__total">
        <span>{t(locale, "popover.totalLabel")}</span>
        <span className="popover__totalValue">{state.totalLabel}</span>
      </div>

      {state.awayPrompt ? (
        // S9: BUILD_SPEC 'shows "Away Xh Ym — add it back?" (keep /
        // discard)'. Replaces the normal action row entirely rather than
        // sitting alongside it: the engine is "paused" for the SAME reason
        // whether the pause was manual or an away-gap auto-pause, so
        // rendering the ordinary Resume/Switch/Stop buttons too would let a
        // click on Resume create a brand-new segment out from under the
        // pending prompt (`TimerEngine.reopenLastSegment`'s guard would
        // then correctly refuse "Keep", but that is a worse experience
        // than never offering the conflicting path in the first place).
        <div className="popover__away" role="alert">
          <p className="popover__awayMessage">{state.awayPrompt.message}</p>
          <div className="popover__awayActions">
            <button type="button" className="popover__action popover__action--primary" onClick={onAwayKeep}>
              {t(locale, "away.prompt.keep")}
            </button>
            <button type="button" className="popover__action" onClick={onAwayDiscard}>
              {t(locale, "away.prompt.discard")}
            </button>
          </div>
        </div>
      ) : (
        <div className="popover__actions">
          {state.timerStatus === "idle" && (
            <button type="button" className="popover__action popover__action--primary" onClick={onStart}>
              {t(locale, "popover.action.start")}
            </button>
          )}
          {state.timerStatus === "running" && (
            <>
              <button type="button" className="popover__action" onClick={onPause}>
                {t(locale, "popover.action.pause")}
              </button>
              <button type="button" className="popover__action" onClick={onSwitch}>
                {t(locale, "popover.action.switch")}
              </button>
              <button type="button" className="popover__action popover__action--danger" onClick={onStop}>
                {t(locale, "popover.action.stop")}
              </button>
            </>
          )}
          {state.timerStatus === "paused" && (
            <>
              <button type="button" className="popover__action popover__action--primary" onClick={onResume}>
                {t(locale, "popover.action.resume")}
              </button>
              <button type="button" className="popover__action" onClick={onSwitch}>
                {t(locale, "popover.action.switch")}
              </button>
              <button type="button" className="popover__action popover__action--danger" onClick={onStop}>
                {t(locale, "popover.action.stop")}
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default Popover;
