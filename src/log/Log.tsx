// S6/S7 Dashboard Log tab — the presentational shell (BUILD_SPEC S6+S7
// rows). Pure props in, no Tauri IPC here — the live cross-window-free
// wiring lives in `LogContainer.tsx`, exercised at the S14 manual-check
// gate, same "no unit test for the IPC glue" pattern as
// `Popover.tsx`/`PopoverContainer.tsx`.
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`log.css`) — no literals (BUILD_SPEC advisory
// rule + Design principle 4). Design principle 6 ("every state is
// designed"): the empty day names the shortcut; a rejected edit renders a
// real inline error, not a thrown exception or a bare string; the running
// entry's missing end-time control is EXPLAINED (a note), not a silent
// gap; a delete shows an undo toast rather than a confirmation dialog (this
// app's established pattern — see the Switch action in `panelController`).
// Design principle 2 (keyboard-first): every control — nav, edit, save,
// cancel, delete, undo, dismiss — is a real <button>, never a div with a
// click handler.
//
// `EditForm` holds its own local, uncommitted draft state (the typed text
// before Save) — the one piece of state this otherwise-pure component is
// allowed, same reasoning as any controlled form: LogController has no
// business knowing what's mid-keystroke in a field nobody has saved yet.

import { useId, useState } from "react";
import type { Locale } from "../i18n";
import { formatLongDate, interpolate, t } from "../i18n";
import { dayKeyToDate } from "../timer/dayAttribution";
import { combineDateAndTime, toTimeInputValue } from "./editTimeFields";
import type { LogEditError, LogEntryView, LogState } from "./logController";
import "./log.css";

export interface LogSaveFields {
  name: string | null;
  client: string | null;
  project: string | null;
  start: string;
  end?: string;
}

export interface LogProps {
  locale: Locale;
  state: LogState;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onBeginEdit: (entryId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (entryId: string, fields: LogSaveFields) => void;
  onDelete: (entryId: string) => void;
  onUndo: () => void;
  onDismissUndo: () => void;
}

interface EditFormProps {
  locale: Locale;
  entry: LogEntryView;
  error: LogEditError | null;
  onSave: (fields: LogSaveFields) => void;
  onCancel: () => void;
}

function EditForm({ locale, entry, error, onSave, onCancel }: EditFormProps) {
  const idBase = useId();
  const [name, setName] = useState(entry.rawName ?? "");
  const [client, setClient] = useState(entry.client ?? "");
  const [project, setProject] = useState(entry.project ?? "");
  const [startTime, setStartTime] = useState(toTimeInputValue(entry.startIso));
  const [endTime, setEndTime] = useState(entry.endIso ? toTimeInputValue(entry.endIso) : "");

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedClient = client.trim();
    const trimmedProject = project.trim();
    const fields: LogSaveFields = {
      name: trimmedName === "" ? null : trimmedName,
      client: trimmedClient === "" ? null : trimmedClient,
      project: trimmedProject === "" ? null : trimmedProject,
      start: combineDateAndTime(entry.startIso, startTime),
    };
    // BUILD_SPEC: the running entry's end time is not editable — there is
    // no control for it (below), so there is nothing here to include.
    if (!entry.isRunning && entry.endIso !== null) {
      fields.end = combineDateAndTime(entry.endIso, endTime);
    }
    onSave(fields);
  };

  return (
    <div className="log__editForm">
      <div className="log__editRow">
        <label className="log__editLabel" htmlFor={`${idBase}-name`}>
          {t(locale, "log.edit.nameLabel")}
        </label>
        <input
          id={`${idBase}-name`}
          className="log__editInput"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="log__editRow">
        <label className="log__editLabel" htmlFor={`${idBase}-client`}>
          {t(locale, "log.edit.clientLabel")}
        </label>
        <input
          id={`${idBase}-client`}
          className="log__editInput"
          type="text"
          value={client}
          onChange={(event) => setClient(event.target.value)}
        />
      </div>
      <div className="log__editRow">
        <label className="log__editLabel" htmlFor={`${idBase}-project`}>
          {t(locale, "log.edit.projectLabel")}
        </label>
        <input
          id={`${idBase}-project`}
          className="log__editInput"
          type="text"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        />
      </div>
      <div className="log__editRow">
        <label className="log__editLabel" htmlFor={`${idBase}-start`}>
          {t(locale, "log.edit.startLabel")}
        </label>
        <input
          id={`${idBase}-start`}
          className="log__editInput log__editInput--time"
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </div>
      {entry.isRunning ? (
        <p className="log__editRunningNote">{t(locale, "log.edit.runningNote")}</p>
      ) : (
        <div className="log__editRow">
          <label className="log__editLabel" htmlFor={`${idBase}-end`}>
            {t(locale, "log.edit.endLabel")}
          </label>
          <input
            id={`${idBase}-end`}
            className="log__editInput log__editInput--time"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="log__editError" role="alert">
          {error.message}
        </p>
      )}
      <div className="log__editActions">
        <button type="button" className="log__editSave" onClick={handleSave}>
          {t(locale, "log.edit.save")}
        </button>
        <button type="button" className="log__editCancel" onClick={onCancel}>
          {t(locale, "log.edit.cancel")}
        </button>
      </div>
    </div>
  );
}

function Log({
  locale,
  state,
  onToday,
  onPrevious,
  onNext,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onUndo,
  onDismissUndo,
}: LogProps) {
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

      {state.pendingUndo && (
        <div className="log__undoToast" role="status">
          <span className="log__undoMessage">
            {interpolate(t(locale, "log.undo.deleted"), { name: state.pendingUndo.label })}
          </span>
          <div className="log__undoActions">
            <button type="button" className="log__undoAction" onClick={onUndo}>
              {t(locale, "log.undo.action")}
            </button>
            <button
              type="button"
              className="log__undoDismiss"
              onClick={onDismissUndo}
              aria-label={t(locale, "log.undo.dismiss")}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {state.entries.length === 0 ? (
        <p className="log__empty">{state.emptyStateTeachLine}</p>
      ) : (
        <ul className="log__entries" aria-label={t(locale, "log.entriesLabel")}>
          {state.entries.map((entry) =>
            entry.id === state.editingEntryId ? (
              <li key={entry.id} className="log__entry log__entry--editing">
                <EditForm
                  locale={locale}
                  entry={entry}
                  error={state.editError && state.editError.entryId === entry.id ? state.editError : null}
                  onSave={(fields) => onSaveEdit(entry.id, fields)}
                  onCancel={onCancelEdit}
                />
              </li>
            ) : (
              <li key={entry.id} className="log__entry">
                <div className="log__entryMain">
                  <span className="log__entryName">{entry.name}</span>
                  {(entry.client !== null || entry.project !== null) && (
                    <span className="log__entryTags">
                      {entry.client !== null && (
                        <span className="log__tag log__tag--client">{`@${entry.client}`}</span>
                      )}
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
                <div className="log__entryActions">
                  <button
                    type="button"
                    className="log__actionButton"
                    onClick={() => onBeginEdit(entry.id)}
                    aria-label={interpolate(t(locale, "log.entry.editAria"), { name: entry.name })}
                  >
                    {t(locale, "log.entry.edit")}
                  </button>
                  <button
                    type="button"
                    className="log__actionButton log__actionButton--danger"
                    onClick={() => onDelete(entry.id)}
                    disabled={entry.isRunning}
                    aria-label={interpolate(t(locale, "log.entry.deleteAria"), { name: entry.name })}
                    title={entry.isRunning ? t(locale, "log.entry.deleteRunningHint") : undefined}
                  >
                    {t(locale, "log.entry.delete")}
                  </button>
                </div>
              </li>
            ),
          )}
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
