// S11 Dashboard Insights tab — the presentational shell (BUILD_SPEC S11 row;
// decisions.md #27: "exactly three views ... no date-range builder", "first
// thing cut if polish is at risk"). Pure props in, no Tauri IPC here — the
// live wiring lives in `InsightsContainer.tsx`, same "no unit test for the
// IPC glue" pattern as every other *Container.tsx in this project.
//
// This component renders EXACTLY three top-level views inside
// `.insights__views` — `insights-week-bars`, `insights-tag-share`,
// `insights-top-tasks` — and nothing else. `Insights.test.tsx` asserts this
// as a POSITIVE count (`.insights__views` has exactly 3 children) rather
// than only checking each expected testid is present, so a fourth view
// added later fails the count even if it doesn't match any "known bad"
// selector — same shape as S7's "no end-time control" absence test, which
// asserts a control that SHOULD exist is found rather than only that a
// specific bad one is absent (a typo in either selector can't silently pass
// either way). It also renders NO `<input>`/`<button>` anywhere at all: this
// is a pure read surface over the current week (no mutating actions, and
// critically no date-range builder — decisions.md #27's explicit scope
// limit) — see the same test file for that assertion.
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`insights.css`) — no literals (BUILD_SPEC
// advisory rule + Design principle 4). Design principle 6 ("every state is
// designed"): a week with zero tracked time renders the designed empty
// state instead of three blank sections; an untagged/unnamed-only week
// renders each view's own smaller empty state instead of a bare gap. Design
// principle 3 ("calm surfaces"): three views, generous space, no chrome
// beyond what a glance needs — nothing to click, nothing to configure.

import type { Locale } from "../i18n";
import { t } from "../i18n";
import type { InsightsState, InsightsTagView } from "./insightsController";
import "./insights.css";

export interface InsightsProps {
  locale: Locale;
  state: InsightsState;
}

interface TagShareListProps {
  title: string;
  emptyLabel: string;
  rows: readonly InsightsTagView[];
  tagPrefix: "@" | "#";
}

function TagShareList({ title, emptyLabel, rows, tagPrefix }: TagShareListProps) {
  return (
    <div className="insights__tagGroup">
      <h4 className="insights__tagGroupTitle">{title}</h4>
      {rows.length === 0 ? (
        <p className="insights__tagGroupEmpty">{emptyLabel}</p>
      ) : (
        <ul className="insights__tagList">
          {rows.map((row) => (
            <li key={row.tag} className="insights__tagRow">
              <span className="insights__tagName">{`${tagPrefix}${row.tag}`}</span>
              <span className="insights__tagPercent">{row.percentLabel}</span>
              <span className="insights__tagDuration">{row.durationLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Insights({ locale, state }: InsightsProps) {
  const maxDaySeconds = state.maxDaySeconds;

  return (
    <section className="insights" aria-label={t(locale, "insights.sectionLabel")}>
      <p className="insights__weekLabel">{t(locale, "insights.weekLabel")}</p>

      {state.isEmpty && <p className="insights__empty">{t(locale, "insights.emptyState")}</p>}

      <div className="insights__views">
        <section
          className="insights__view"
          data-testid="insights-week-bars"
          aria-label={t(locale, "insights.weekBars.title")}
        >
          <h3 className="insights__viewTitle">{t(locale, "insights.weekBars.title")}</h3>
          <ul className="insights__bars">
            {state.days.map((day) => (
              <li key={day.dayKey} className="insights__barRow">
                <span className="insights__barLabel">{day.weekdayLabel}</span>
                <span className="insights__barTrack">
                  <span
                    className="insights__barFill"
                    style={{ width: `${maxDaySeconds === 0 ? 0 : (day.seconds / maxDaySeconds) * 100}%` }}
                  />
                </span>
                <span className="insights__barValue">{day.durationLabel}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="insights__view"
          data-testid="insights-tag-share"
          aria-label={t(locale, "insights.tagShare.title")}
        >
          <h3 className="insights__viewTitle">{t(locale, "insights.tagShare.title")}</h3>
          <div className="insights__tagGroups">
            <TagShareList
              title={t(locale, "insights.tagShare.byClient")}
              emptyLabel={t(locale, "insights.tagShare.empty")}
              rows={state.clientShares}
              tagPrefix="@"
            />
            <TagShareList
              title={t(locale, "insights.tagShare.byProject")}
              emptyLabel={t(locale, "insights.tagShare.empty")}
              rows={state.projectShares}
              tagPrefix="#"
            />
          </div>
        </section>

        <section
          className="insights__view"
          data-testid="insights-top-tasks"
          aria-label={t(locale, "insights.topTasks.title")}
        >
          <h3 className="insights__viewTitle">{t(locale, "insights.topTasks.title")}</h3>
          {state.biggestTasks.length === 0 ? (
            <p className="insights__tasksEmpty">{t(locale, "insights.topTasks.empty")}</p>
          ) : (
            <ol className="insights__tasks">
              {state.biggestTasks.map((task, index) => (
                <li key={`${task.name}-${task.client ?? ""}-${task.project ?? ""}-${index}`} className="insights__task">
                  <span className="insights__taskName">{task.name}</span>
                  {(task.client !== null || task.project !== null) && (
                    <span className="insights__taskTags">
                      {task.client !== null && (
                        <span className="insights__tag insights__tag--client">{`@${task.client}`}</span>
                      )}
                      {task.project !== null && (
                        <span className="insights__tag insights__tag--project">{`#${task.project}`}</span>
                      )}
                    </span>
                  )}
                  <span className="insights__taskDuration">{task.durationLabel}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}

export default Insights;
