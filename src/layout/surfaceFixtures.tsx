// S13b — the five named surfaces, in every state worth auditing, rendered
// from the REAL components with the REAL catalogs at their REAL window
// widths (BUILD_SPEC S13b row: "popover, quick entry, Log, Insights,
// Settings ... per surface").
//
// This module is shared deliberately by two consumers that must agree on
// what "the Log surface" means:
//   1. `esLayoutFit.test.tsx` — the committed per-surface overflow gate.
//   2. `layoutHarness.test.tsx` — the generator for the screenshot review.
// A surface audited by one and not the other would be exactly the gap
// verification.md keeps recording, so there is one list and both read it.
//
// Widths are not invented here. They are the shipped window widths from
// `src-tauri/tauri.conf.json` (popover 320, panel 480, main 800) plus the
// Dashboard's own `--size-dashboard-min-width` (480) — the narrowest the
// main window's content is allowed to get, and therefore the width Spanish
// has to survive.
//
// No JSX text and no user-visible string literals live in this file: every
// word on screen comes from `t()` inside the components below. The object
// literals here are STATE (entry names, tags, durations) — user data, which
// is what the ellipsis rules in the CSS exist for.

import type { ReactElement } from "react";
import App from "../App";
import type { DashboardTab } from "../App";
import type { Locale } from "../i18n";
import Export from "../export/Export";
import Insights from "../insights/Insights";
import Log from "../log/Log";
import Popover from "../popover/Popover";
import QuickEntryPanel from "../panel/QuickEntryPanel";
import Settings from "../settings/Settings";
import { interpolate, t } from "../i18n";
import { formatAccelerator } from "../shortcuts/formatAccelerator";
import { panelHeightFor } from "../panel/panelHeight";
import { DEFAULT_ACCELERATORS } from "../shortcuts/shortcutController";

/** Shipped window widths, in CSS px. */
export const SURFACE_WIDTH = {
  /** `tauri.conf.json` window "popover". */
  popover: 320,
  /** `tauri.conf.json` window "panel". */
  quickEntry: 480,
  /** `tauri.conf.json` window "main". */
  dashboard: 800,
  /** `--size-dashboard-min-width` — the narrowest the main window's content
   * is allowed to be, and the hardest case for the longer language. */
  dashboardMin: 480,
} as const;

/** `tauri.conf.json` window "popover" height. */
const POPOVER_HEIGHT = 420;
/** `tauri.conf.json` window "main" height. */
const DASHBOARD_HEIGHT = 600;

export type SurfaceId = "popover" | "quickEntry" | "log" | "insights" | "settings";

export interface SurfaceVariant {
  /** Stable id, used for the screenshot filename and the test name. */
  id: string;
  render: (locale: Locale) => ReactElement;
  /** The shipped window height this variant is shown at, in CSS px. The
   * quick-entry panel sizes itself to its content (`panelHeightFor`, the
   * F5 fix), so its variants differ; the other two windows are fixed. */
  height: number;
}

export interface SurfaceSpec {
  id: SurfaceId;
  /** Every width this surface is actually rendered at, in CSS px. */
  widths: number[];
  /** The surface's own root class. Both consumers assert this is present
   * after rendering — the guard that catches a surface which rendered
   * NOTHING. It is not hypothetical: the first draft of these fixtures
   * handed `insightsContent`/`settingsContent` to an `App` still sitting on
   * its default Log tab, so both surfaces rendered an empty tab panel and
   * the browser overflow scan reported them clean. Found by looking at a
   * screenshot, not by the scan — the same way F5 and F10 were found. */
  rootSelector: string;
  /** Which Dashboard tab must be activated before this surface is on
   * screen. `App` owns `activeTab` as local state with no prop to seed it,
   * so consumers click the real tab button — which keeps the tab bar itself
   * inside the audit instead of bypassing the shell. `null` for the two
   * standalone windows, which have no tab bar. */
  tab: DashboardTab | null;
  variants: SurfaceVariant[];
}

/** Click order of the Dashboard tab bar, matching `App.tsx`. */
export const TAB_ORDER: DashboardTab[] = ["log", "insights", "settings"];

const noop = () => {};

// ---------------------------------------------------------------- popover

const popoverEntries = [
  { id: "e1", name: "Revisión del contrato", durationLabel: "1h 05m", status: "stopped" as const },
  { id: "e2", name: "Reunión de planificación", durationLabel: "45m", status: "stopped" as const },
  { id: "e3", name: "Migración de la base de datos", durationLabel: "22m", status: "running" as const },
];

function popoverSurface(locale: Locale, overrides: Partial<Parameters<typeof Popover>[0]["state"]>) {
  return (
    <Popover
      locale={locale}
      state={{
        entries: popoverEntries,
        totalLabel: "2h 12m",
        timerStatus: "running",
        elapsedSeconds: 1320,
        teachLine: null,
        awayPrompt: null,
        ...overrides,
      }}
      onStart={noop}
      onPause={noop}
      onResume={noop}
      onSwitch={noop}
      onStop={noop}
      onAwayKeep={noop}
      onAwayDiscard={noop}
    />
  );
}

// ------------------------------------------------------------ quick entry

function quickEntrySurface(locale: Locale, suggestions: string[], notice: string | null) {
  return (
    <QuickEntryPanel
      locale={locale}
      mode="naming"
      text=""
      suggestions={suggestions}
      notice={notice}
      onTextChange={noop}
      onCommit={noop}
    />
  );
}

// -------------------------------------------------------------------- Log

const logEntries = [
  {
    id: "e1",
    name: "Revisión del contrato de mantenimiento",
    rawName: "Revisión del contrato de mantenimiento",
    startLabel: "9:00",
    endLabel: "10:05",
    durationLabel: "1h 05m",
    client: "Ayuntamiento",
    project: "renovación",
    isRunning: false,
    startIso: "2026-08-21T09:00:00.000-07:00",
    endIso: "2026-08-21T10:05:00.000-07:00",
  },
  {
    id: "e2",
    name: "Reunión de planificación trimestral",
    rawName: "Reunión de planificación trimestral",
    startLabel: "10:15",
    endLabel: "11:00",
    durationLabel: "45m",
    client: null,
    project: "planificación",
    isRunning: false,
    startIso: "2026-08-21T10:15:00.000-07:00",
    endIso: "2026-08-21T11:00:00.000-07:00",
  },
  {
    id: "e3",
    name: "Migración de la base de datos",
    rawName: null,
    startLabel: "11:30",
    endLabel: "—",
    durationLabel: "22m",
    client: "Distribuidora",
    project: null,
    isRunning: true,
    startIso: "2026-08-21T11:30:00.000-07:00",
    endIso: null,
  },
];

function logSurface(
  locale: Locale,
  overrides: Partial<Parameters<typeof Log>[0]["state"]>,
  exportOverrides: Partial<Parameters<typeof Export>[0]["state"]> = {},
) {
  return (
    <App
      locale={locale}
      logContent={
        <>
          <Log
            locale={locale}
            state={{
              dayKey: "2026-08-21",
              isToday: false,
              canGoNext: true,
              entries: logEntries,
              totalLabel: "2h 12m",
              emptyStateTeachLine: null,
              editingEntryId: null,
              editError: null,
              pendingUndo: null,
              ...overrides,
            }}
            onToday={noop}
            onPrevious={noop}
            onNext={noop}
            onBeginEdit={noop}
            onCancelEdit={noop}
            onSaveEdit={noop}
            onDelete={noop}
            onUndo={noop}
            onDismissUndo={noop}
          />
          <Export
            locale={locale}
            state={{
              copyStatus: "copied",
              rangeStart: "2026-08-17",
              rangeEnd: "2026-08-21",
              rangeError: null,
              ...exportOverrides,
            }}
            onCopyForAi={noop}
            onRangeStartChange={noop}
            onRangeEndChange={noop}
            onExportCsv={noop}
            onExportJson={noop}
          />
        </>
      }
    />
  );
}

// --------------------------------------------------------------- Insights

const insightsDays = (locale: Locale) =>
  [
    { dayKey: "2026-08-17", seconds: 7200, durationLabel: "2h 00m" },
    { dayKey: "2026-08-18", seconds: 12600, durationLabel: "3h 30m" },
    { dayKey: "2026-08-19", seconds: 0, durationLabel: "0m" },
    { dayKey: "2026-08-20", seconds: 18000, durationLabel: "5h 00m" },
    { dayKey: "2026-08-21", seconds: 7920, durationLabel: "2h 12m" },
    { dayKey: "2026-08-22", seconds: 0, durationLabel: "0m" },
    { dayKey: "2026-08-23", seconds: 0, durationLabel: "0m" },
  ].map((day) => ({
    ...day,
    weekdayLabel: new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${day.dayKey}T12:00:00Z`)),
  }));

function insightsSurface(locale: Locale, empty: boolean) {
  return (
    <App
      locale={locale}
      insightsContent={
        <Insights
          locale={locale}
          state={
            empty
              ? {
                  days: insightsDays(locale).map((d) => ({ ...d, seconds: 0, durationLabel: "0m" })),
                  maxDaySeconds: 0,
                  clientShares: [],
                  projectShares: [],
                  biggestTasks: [],
                  isEmpty: true,
                }
              : {
                  days: insightsDays(locale),
                  maxDaySeconds: 18000,
                  clientShares: [
                    { tag: "Ayuntamiento", durationLabel: "6h 45m", percentLabel: locale === "es" ? "58 %" : "58%" },
                    { tag: "Distribuidora", durationLabel: "4h 55m", percentLabel: locale === "es" ? "42 %" : "42%" },
                  ],
                  projectShares: [
                    { tag: "renovación", durationLabel: "5h 20m", percentLabel: locale === "es" ? "46 %" : "46%" },
                    { tag: "planificación", durationLabel: "6h 20m", percentLabel: locale === "es" ? "54 %" : "54%" },
                  ],
                  biggestTasks: [
                    {
                      name: "Revisión del contrato de mantenimiento",
                      client: "Ayuntamiento",
                      project: "renovación",
                      durationLabel: "5h 00m",
                    },
                    {
                      name: "Reunión de planificación trimestral",
                      client: null,
                      project: "planificación",
                      durationLabel: "3h 30m",
                    },
                    {
                      name: "Migración de la base de datos",
                      client: "Distribuidora",
                      project: null,
                      durationLabel: "2h 12m",
                    },
                  ],
                  isEmpty: false,
                }
          }
        />
      }
    />
  );
}

// --------------------------------------------------------------- Settings

function settingsSurface(locale: Locale, overrides: Partial<Parameters<typeof Settings>[0]["state"]>) {
  return (
    <App
      locale={locale}
      settingsContent={
        <Settings
          locale={locale}
          platform="macos"
          state={{
            shortcutPrimary: DEFAULT_ACCELERATORS.primary,
            shortcutStop: DEFAULT_ACCELERATORS.stop,
            shortcutWarnings: [],
            reminderMinutes: 60,
            language: "es",
            theme: "system",
            autostart: true,
            autostartError: false,
            version: "0.1.0",
            updateStatus: "idle",
            ...overrides,
          }}
          onRebindShortcut={noop}
          onReminderMinutesChange={noop}
          onLanguageChange={noop}
          onThemeChange={noop}
          onAutostartChange={noop}
          onCheckForUpdates={noop}
        />
      }
    />
  );
}

/**
 * Every surface × every state this slice audits. Ordered as BUILD_SPEC's
 * S13b row names them.
 */
export const SURFACES: SurfaceSpec[] = [
  {
    id: "popover",
    widths: [SURFACE_WIDTH.popover],
    rootSelector: ".popover",
    tab: null,
    variants: [
      {
        id: "idle-teach",
        height: POPOVER_HEIGHT,
        render: (locale) =>
          popoverSurface(locale, {
            entries: [],
            timerStatus: "idle",
            elapsedSeconds: 0,
            totalLabel: "0m",
            teachLine: interpolate(t(locale, "popover.teachLine"), {
              shortcut: formatAccelerator(DEFAULT_ACCELERATORS.primary, "macos", locale),
            }),
          }),
      },
      { id: "running", height: POPOVER_HEIGHT, render: (locale) => popoverSurface(locale, {}) },
      {
        id: "paused",
        height: POPOVER_HEIGHT,
        render: (locale) =>
          popoverSurface(locale, {
            timerStatus: "paused",
            entries: popoverEntries.map((e, i) => (i === 2 ? { ...e, status: "paused" as const } : e)),
          }),
      },
      {
        id: "away-prompt",
        height: POPOVER_HEIGHT,
        render: (locale) =>
          popoverSurface(locale, {
            timerStatus: "paused",
            awayPrompt: {
              entryId: "e3",
              message: interpolate(t(locale, "away.prompt.message"), { elapsed: "1h 20m" }),
            },
          }),
      },
    ],
  },
  {
    id: "quickEntry",
    widths: [SURFACE_WIDTH.quickEntry],
    rootSelector: ".quick-entry",
    tab: null,
    variants: [
      {
        id: "empty",
        height: panelHeightFor({ suggestionCount: 0, hasNotice: false }),
        render: (locale) => quickEntrySurface(locale, [], null),
      },
      {
        id: "switch-notice-suggestions",
        height: panelHeightFor({ suggestionCount: 3, hasNotice: true }),
        render: (locale) =>
          quickEntrySurface(
            locale,
            [
              "Revisión del contrato de mantenimiento @Ayuntamiento #renovación",
              "Reunión de planificación trimestral #planificación",
              "Migración de la base de datos @Distribuidora",
            ],
            interpolate(t(locale, "panel.switchNotice"), {
              name: "Migración de la base de datos",
              elapsed: "22m",
            }),
          ),
      },
    ],
  },
  {
    id: "log",
    widths: [SURFACE_WIDTH.dashboard, SURFACE_WIDTH.dashboardMin],
    rootSelector: ".log",
    tab: "log",
    variants: [
      { id: "entries", height: DASHBOARD_HEIGHT, render: (locale) => logSurface(locale, {}) },
      {
        id: "empty",
        height: DASHBOARD_HEIGHT,
        render: (locale) =>
          logSurface(locale, {
            entries: [],
            isToday: true,
            canGoNext: false,
            totalLabel: "0m",
            emptyStateTeachLine: interpolate(t(locale, "log.emptyState"), {
              shortcut: formatAccelerator(DEFAULT_ACCELERATORS.primary, "macos", locale),
            }),
          }),
      },
      {
        id: "editing-with-error",
        height: DASHBOARD_HEIGHT,
        render: (locale) =>
          logSurface(locale, {
            editingEntryId: "e1",
            editError: {
              entryId: "e1",
              code: "overlap",
              message: t(locale, "log.edit.error.overlap"),
            },
          }),
      },
      {
        id: "undo-toast",
        height: DASHBOARD_HEIGHT,
        render: (locale) =>
          logSurface(
            locale,
            { pendingUndo: { entryId: "e2", label: "Reunión de planificación trimestral" } },
            { copyStatus: "error", rangeError: "invalidOrder" },
          ),
      },
    ],
  },
  {
    id: "insights",
    widths: [SURFACE_WIDTH.dashboard, SURFACE_WIDTH.dashboardMin],
    rootSelector: ".insights",
    tab: "insights",
    variants: [
      { id: "populated", height: DASHBOARD_HEIGHT, render: (locale) => insightsSurface(locale, false) },
      { id: "empty", height: DASHBOARD_HEIGHT, render: (locale) => insightsSurface(locale, true) },
    ],
  },
  {
    id: "settings",
    widths: [SURFACE_WIDTH.dashboard, SURFACE_WIDTH.dashboardMin],
    rootSelector: ".settings",
    tab: "settings",
    variants: [
      { id: "default", height: DASHBOARD_HEIGHT, render: (locale) => settingsSurface(locale, {}) },
      {
        id: "warnings-and-custom",
        height: DASHBOARD_HEIGHT,
        render: (locale) =>
          settingsSurface(locale, {
            reminderMinutes: 45,
            autostartError: true,
            updateStatus: "error",
            shortcutWarnings: [
              {
                id: "primary",
                accelerator: DEFAULT_ACCELERATORS.primary,
                messageKey: "shortcuts.warning.primaryFailed",
                driverError: "already registered",
              },
            ],
          }),
      },
    ],
  },
];
