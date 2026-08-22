// S10 Dashboard Export section — the presentational shell (BUILD_SPEC S10
// row). Pure props in, no Tauri IPC here — the live wiring lives in
// `ExportContainer.tsx`, exercised at the S14 manual-check gate, same "no
// unit test for the IPC glue" pattern as every other *Container.tsx.
//
// Every string through i18n, every color/space/type value from
// `src/styles/tokens.css` (`export.css`) — no literals (BUILD_SPEC advisory
// rule + Design principle 4). Design principle 6 ("every state is
// designed"): a successful copy and a failed one both render a real,
// designed status line (`role="status"`), never a silent no-op or a raw
// exception. Design principle 3 ("calm surfaces"): two independent actions
// (Copy for AI; CSV/JSON by range), no more UI than each one strictly
// needs. Design principle 2 (keyboard-first): every control is a real
// <button>/<input>, never a div with a click handler.

import { useId } from "react";
import type { Locale } from "../i18n";
import { t } from "../i18n";
import type { ExportState } from "./exportController";
import "./export.css";

export interface ExportProps {
  locale: Locale;
  state: ExportState;
  onCopyForAi: () => void;
  onRangeStartChange: (value: string) => void;
  onRangeEndChange: (value: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}

function Export({ locale, state, onCopyForAi, onRangeStartChange, onRangeEndChange, onExportCsv, onExportJson }: ExportProps) {
  const idBase = useId();

  return (
    <section className="export" aria-label={t(locale, "export.sectionLabel")}>
      <div className="export__copyRow">
        <button type="button" className="export__copyButton" onClick={onCopyForAi}>
          {t(locale, "export.copyForAi.button")}
        </button>
        {state.copyStatus === "copied" && (
          <span className="export__copyStatus export__copyStatus--success" role="status">
            {t(locale, "export.copyForAi.copied")}
          </span>
        )}
        {state.copyStatus === "error" && (
          <span className="export__copyStatus export__copyStatus--error" role="alert">
            {t(locale, "export.copyForAi.error")}
          </span>
        )}
      </div>

      <div className="export__rangeRow">
        <label className="export__rangeLabel" htmlFor={`${idBase}-start`}>
          {t(locale, "export.range.startLabel")}
        </label>
        <input
          id={`${idBase}-start`}
          className="export__rangeInput"
          type="date"
          value={state.rangeStart}
          onChange={(event) => onRangeStartChange(event.target.value)}
        />
        <label className="export__rangeLabel" htmlFor={`${idBase}-end`}>
          {t(locale, "export.range.endLabel")}
        </label>
        <input
          id={`${idBase}-end`}
          className="export__rangeInput"
          type="date"
          value={state.rangeEnd}
          onChange={(event) => onRangeEndChange(event.target.value)}
        />
        <button type="button" className="export__rangeButton" onClick={onExportCsv}>
          {t(locale, "export.range.csvButton")}
        </button>
        <button type="button" className="export__rangeButton" onClick={onExportJson}>
          {t(locale, "export.range.jsonButton")}
        </button>
      </div>

      {state.rangeError && (
        <p className="export__rangeError" role="alert">
          {t(locale, "export.range.error.invalidOrder")}
        </p>
      )}
    </section>
  );
}

export default Export;
