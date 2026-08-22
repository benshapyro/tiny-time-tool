// S6 Dashboard Log tab — the presentational shell (BUILD_SPEC S6 row). Pure
// props in, no Tauri IPC here — the live cross-window-free wiring lives in
// `LogContainer.tsx`, exercised at the S14 manual-check gate, same "no unit
// test for the IPC glue" pattern as `Popover.tsx`/`PopoverContainer.tsx`.
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`log.css`) — no literals (BUILD_SPEC advisory
// rule + Design principle 4). Design principle 6 ("every state is
// designed"): the empty day names the shortcut, per S6's acceptance check.
// Design principle 2 (keyboard-first): every date-nav control is a real
// <button>, never a div with a click handler.

import type { Locale } from "../i18n";
import { formatLongDate, t } from "../i18n";
import { dayKeyToDate } from "../timer/dayAttribution";
import type { LogState } from "./logController";
import "./log.css";

export interface LogProps {
  locale: Locale;
  state: LogState;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

function Log({ locale, state, onToday, onPrevious, onNext }: LogProps) {
  const dateLabel = state.isToday ? t(locale, "log.nav.today") : formatLongDate(locale, dayKeyToDate(state.dayKey));

  return (
    <section className="log">
      <div className="log__nav">
        <button
          type="button"
          className="log__navButton"
          onClick={onPrevious}
          aria-label={t(locale, "log.nav.previous")}
        >
          ‹
        </button>
        <span className="log__dateLabel">{dateLabel}</span>
        <button
          type="button"
          className="log__navButton"
          onClick={onNext}
          disabled={!state.canGoNext}
          aria-label={t(locale, "log.nav.next")}
        >
          ›
        </button>
      </div>

      {!state.isToday && (
        <button type="button" className="log__todayButton" onClick={onToday}>
          {t(locale, "log.nav.today")}
        </button>
      )}

      {state.entries.length === 0 ? (
        <p className="log__empty">{state.emptyStateTeachLine}</p>
      ) : (
        <ul className="log__entries" aria-label={t(locale, "log.entriesLabel")}>
          {state.entries.map((entry) => (
            <li key={entry.id} className="log__entry">
              <div className="log__entryMain">
                <span className="log__entryName">{entry.name}</span>
                {(entry.client !== null || entry.project !== null) && (
                  <span className="log__entryTags">
                    {entry.client !== null && <span className="log__tag log__tag--client">{`@${entry.client}`}</span>}
                    {entry.project !== null && (
                      <span className="log__tag log__tag--project">{`#${entry.project}`}</span>
                    )}
                  </span>
                )}
              </div>
              <div className="log__entryMeta">
                <span className="log__entryTime">{`${entry.startLabel}–${entry.endLabel}`}</span>
                <span className="log__entryDuration">{entry.durationLabel}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="log__total">
        <span>{t(locale, "log.totalLabel")}</span>
        <span className="log__totalValue">{state.totalLabel}</span>
      </div>
    </section>
  );
}

export default Log;
