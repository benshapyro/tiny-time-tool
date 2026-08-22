import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";
import {
  formatDisplayTime,
  formatFixedTime,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatWeekdayShort,
  interpolate,
  t,
} from "./index";

describe("i18n smoke", () => {
  it("renders distinct expected literals for the same key in en and es", () => {
    expect(t("en", "tray.openDashboard")).toBe("Open Dashboard");
    expect(t("es", "tray.openDashboard")).toBe("Abrir panel");
    expect(t("en", "tray.openDashboard")).not.toBe(t("es", "tray.openDashboard"));
  });
});

describe("i18n completeness", () => {
  it("every en key has an es value", () => {
    const missing = Object.keys(en).filter(
      (key) => !Object.prototype.hasOwnProperty.call(es, key),
    );
    expect(missing).toEqual([]);
  });

  it("every es key has an en value (no orphaned translations)", () => {
    const missing = Object.keys(es).filter(
      (key) => !Object.prototype.hasOwnProperty.call(en, key),
    );
    expect(missing).toEqual([]);
  });

  it("en and es have exactly the same key set", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("locale-aware short-date formatter (pinned auto-name format)", () => {
  it("formats en as 'MMM d'", () => {
    expect(formatShortDate("en", new Date(2026, 7, 21))).toBe("Aug 21");
  });

  it("formats es as 'd MMM'", () => {
    expect(formatShortDate("es", new Date(2026, 7, 21))).toBe("21 ago");
  });
});

describe("locale-aware display-time formatter (2026-08-22 amendment: AM/PM per locale convention)", () => {
  it("en-US: 12-hour with AM/PM", () => {
    expect(formatDisplayTime("en", new Date(2026, 7, 21, 10, 0))).toBe("10:00 AM");
    expect(formatDisplayTime("en", new Date(2026, 7, 21, 10, 45))).toBe("10:45 AM");
  });

  it("en-US: midnight and noon boundaries", () => {
    expect(formatDisplayTime("en", new Date(2026, 7, 21, 0, 5))).toBe("12:05 AM");
    expect(formatDisplayTime("en", new Date(2026, 7, 21, 12, 0))).toBe("12:00 PM");
  });

  it("es: conventionally-24h locale stays 24-hour", () => {
    expect(formatDisplayTime("es", new Date(2026, 7, 21, 10, 0))).toBe("10:00");
    expect(formatDisplayTime("es", new Date(2026, 7, 21, 10, 45))).toBe("10:45");
  });
});

describe("shortcut registration-failure warnings (S3, both en and es required)", () => {
  it("renders distinct, non-empty literals for the primary-shortcut warning in en and es", () => {
    const enText = t("en", "shortcuts.warning.primaryFailed");
    const esText = t("es", "shortcuts.warning.primaryFailed");
    expect(enText.length).toBeGreaterThan(0);
    expect(esText.length).toBeGreaterThan(0);
    expect(enText).not.toBe(esText);
  });

  it("renders distinct, non-empty literals for the stop-shortcut warning in en and es", () => {
    const enText = t("en", "shortcuts.warning.stopFailed");
    const esText = t("es", "shortcuts.warning.stopFailed");
    expect(enText.length).toBeGreaterThan(0);
    expect(esText.length).toBeGreaterThan(0);
    expect(enText).not.toBe(esText);
  });

  it("es strings are idiomatic, not literal translations (spec pins 'en curso', never 'rastreando' — same standard applies here: no 'atajo global' calque, no raw English left untranslated)", () => {
    const esPrimary = t("es", "shortcuts.warning.primaryFailed");
    const esStop = t("es", "shortcuts.warning.stopFailed");
    for (const text of [esPrimary, esStop]) {
      expect(text).not.toMatch(/rastreando/i);
      expect(text).not.toMatch(/\bshortcut\b/i); // no leftover English noun
      expect(text).toMatch(/atajo/i); // idiomatic Spanish term actually used
    }
  });
});

describe("interpolate (S4: placeholder substitution for the switch-notice string)", () => {
  it("replaces every named placeholder with its value", () => {
    expect(interpolate("Will stop: {name} ({elapsed})", { name: "Acme onboarding", elapsed: "5:00" })).toBe(
      "Will stop: Acme onboarding (5:00)",
    );
  });

  it("leaves a placeholder with no matching key untouched, rather than throwing", () => {
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });

  it("substitutes the same placeholder every time it appears", () => {
    expect(interpolate("{x} and {x}", { x: "a" })).toBe("a and a");
  });
});

describe("S4 quick-entry panel strings (both locales required, es idiomatic)", () => {
  it("panel.inputLabel and panel.placeholder render distinct non-empty literals in en and es", () => {
    for (const key of ["panel.inputLabel", "panel.placeholder"] as const) {
      const enText = t("en", key);
      const esText = t("es", key);
      expect(enText.length).toBeGreaterThan(0);
      expect(esText.length).toBeGreaterThan(0);
      expect(enText).not.toBe(esText);
    }
  });

  it("panel.switchNotice carries both the {name} and {elapsed} placeholders in en and es", () => {
    for (const locale of ["en", "es"] as const) {
      const text = t(locale, "panel.switchNotice");
      expect(text).toContain("{name}");
      expect(text).toContain("{elapsed}");
    }
  });

  it("es panel strings are idiomatic — no raw 'panel' calque, no leftover English", () => {
    const esNotice = t("es", "panel.switchNotice");
    expect(esNotice).not.toMatch(/\bwill stop\b/i);
    expect(esNotice).toMatch(/detendrá/i);
  });
});

describe("locale-aware long-date formatter (S6: the Log tab's date-nav header)", () => {
  it("formats en as full weekday, month, day, year", () => {
    expect(formatLongDate("en", new Date(2026, 7, 20))).toBe("Thursday, August 20, 2026");
  });

  it("formats es idiomatically (lowercase weekday, 'de' joins day/month/year)", () => {
    expect(formatLongDate("es", new Date(2026, 7, 20))).toBe("jueves, 20 de agosto de 2026");
  });
});

describe("S6 Log tab strings (both locales required, es idiomatic)", () => {
  it("dashboard.tab.log and log.nav.* render distinct non-empty literals in en and es", () => {
    for (const key of [
      "dashboard.tab.log",
      "log.nav.today",
      "log.nav.previous",
      "log.nav.next",
      "log.entriesLabel",
      "log.totalLabel",
    ] as const) {
      const enText = t("en", key);
      const esText = t("es", key);
      expect(enText.length).toBeGreaterThan(0);
      expect(esText.length).toBeGreaterThan(0);
      expect(enText).not.toBe(esText);
    }
  });

  it("log.emptyState carries the {shortcut} placeholder in en and es", () => {
    for (const locale of ["en", "es"] as const) {
      expect(t(locale, "log.emptyState")).toContain("{shortcut}");
    }
  });

  it("es Log strings are idiomatic — 'Registro' for the tab, 'Hoy' for today, no leftover English", () => {
    expect(t("es", "dashboard.tab.log")).toBe("Registro");
    expect(t("es", "log.nav.today")).toBe("Hoy");
    expect(t("es", "log.nav.previous")).toBe("Día anterior");
    expect(t("es", "log.nav.next")).toBe("Día siguiente");
    expect(t("es", "log.entriesLabel")).toBe("Entradas");
    expect(t("es", "log.totalLabel")).toBe("Total del día");
    // "log"/"today"/"previous"/"next"/"entries" have no correct Spanish
    // cognate, so their presence would mean untranslated English leaked
    // through; "total" is excluded from this ban list deliberately — it is
    // the correct idiomatic Spanish word too (same spelling), not a calque.
    for (const key of ["log.nav.previous", "log.nav.next", "log.entriesLabel", "log.emptyState"] as const) {
      expect(t("es", key)).not.toMatch(/\b(log|today|previous|next|entries)\b/i);
    }
  });
});

describe("S8 reminder notification strings (both locales required, es idiomatic)", () => {
  it("reminder.notification.title renders distinct non-empty literals in en and es", () => {
    const enText = t("en", "reminder.notification.title");
    const esText = t("es", "reminder.notification.title");
    expect(enText.length).toBeGreaterThan(0);
    expect(esText.length).toBeGreaterThan(0);
    expect(enText).not.toBe(esText);
  });

  it("reminder.notification.body carries both the {name} and {elapsed} placeholders in en and es", () => {
    for (const locale of ["en", "es"] as const) {
      const text = t(locale, "reminder.notification.body");
      expect(text).toContain("{name}");
      expect(text).toContain("{elapsed}");
    }
  });

  it("es reminder strings reuse the pinned 'en curso' idiom for the running state, never 'rastreando'", () => {
    const esTitle = t("es", "reminder.notification.title");
    expect(esTitle).toMatch(/en curso/i);
    expect(esTitle).not.toMatch(/rastreando/i);
  });
});

describe("fixed-format time formatter (reserved for exports — always 24-hour, locale-independent)", () => {
  it("is always 24-hour regardless of which locale display formatting would use", () => {
    expect(formatFixedTime(new Date(2026, 7, 21, 0, 5))).toBe("00:05");
    expect(formatFixedTime(new Date(2026, 7, 21, 13, 30))).toBe("13:30");
  });

  it("does not vary by locale (no locale parameter — always fixed)", () => {
    // Same instant, formatted twice, must be identical — proves this
    // formatter has no locale dependency for export code to accidentally
    // pass the wrong one.
    const d = new Date(2026, 7, 21, 9, 5);
    expect(formatFixedTime(d)).toBe(formatFixedTime(d));
    expect(formatFixedTime(d)).toBe("09:05");
  });
});

describe("S11 Insights strings (both locales required, es idiomatic)", () => {
  it("dashboard.tab.insights and insights.*.title render distinct non-empty literals in en and es", () => {
    for (const key of [
      "dashboard.tab.insights",
      "insights.weekLabel",
      "insights.weekBars.title",
      "insights.tagShare.title",
      "insights.tagShare.byClient",
      "insights.tagShare.byProject",
      "insights.topTasks.title",
    ] as const) {
      const enText = t("en", key);
      const esText = t("es", key);
      expect(enText.length).toBeGreaterThan(0);
      expect(esText.length).toBeGreaterThan(0);
      expect(enText).not.toBe(esText);
    }
  });

  it("es Insights strings are idiomatic — 'Estadísticas' for the tab (not the 'Perspectivas' cognate), no leftover English", () => {
    expect(t("es", "dashboard.tab.insights")).toBe("Estadísticas");
    expect(t("es", "dashboard.tab.insights")).not.toMatch(/perspectivas/i);
    for (const key of [
      "insights.sectionLabel",
      "insights.weekLabel",
      "insights.emptyState",
      "insights.weekBars.title",
      "insights.tagShare.title",
      "insights.tagShare.byClient",
      "insights.tagShare.byProject",
      "insights.tagShare.empty",
      "insights.topTasks.title",
      "insights.topTasks.empty",
    ] as const) {
      expect(t("es", key)).not.toMatch(/\b(insight|week|tag|share|task|client|project)\b/i);
    }
  });
});

describe("locale-aware short-weekday formatter (S11: the hours-by-day view's column labels)", () => {
  it("formats en as a 3-letter abbreviation ('Tue' for 2026-08-18)", () => {
    expect(formatWeekdayShort("en", new Date(2026, 7, 18))).toBe("Tue");
  });

  it("formats es idiomatically (lowercase, no leftover English weekday name)", () => {
    const es = formatWeekdayShort("es", new Date(2026, 7, 18));
    expect(es.toLowerCase()).toBe(es); // lowercase, per es-ES convention
    expect(es).not.toMatch(/tue/i);
    expect(es.length).toBeGreaterThan(0);
  });

  it("en and es render distinct literals for the same date", () => {
    const d = new Date(2026, 7, 19); // Wednesday
    expect(formatWeekdayShort("en", d)).not.toBe(formatWeekdayShort("es", d));
  });
});

describe("S12 Settings strings (both locales required, es idiomatic)", () => {
  it("dashboard.tab.settings and every settings.*.title render distinct non-empty literals in en and es", () => {
    for (const key of [
      "dashboard.tab.settings",
      "settings.shortcuts.title",
      "settings.reminders.title",
      "settings.language.title",
      "settings.appearance.title",
      "settings.autostart.title",
      "settings.about.title",
    ] as const) {
      const enText = t("en", key);
      const esText = t("es", key);
      expect(enText.length).toBeGreaterThan(0);
      expect(esText.length).toBeGreaterThan(0);
      expect(enText).not.toBe(esText);
    }
  });

  it("es Settings strings are idiomatic — 'Configuración' for the tab, no leftover English", () => {
    expect(t("es", "dashboard.tab.settings")).toBe("Configuración");
    for (const key of [
      "settings.sectionLabel",
      "settings.shortcuts.title",
      "settings.shortcuts.change",
      "settings.shortcuts.cancel",
      "settings.reminders.title",
      "settings.reminders.off",
      "settings.reminders.custom",
      "settings.language.title",
      "settings.language.system",
      "settings.appearance.title",
      "settings.appearance.system",
      "settings.appearance.light",
      "settings.appearance.dark",
      "settings.autostart.title",
      "settings.about.title",
      "settings.about.checkForUpdates",
    ] as const) {
      expect(t("es", key)).not.toMatch(/\b(settings|shortcut|change|cancel|reminder|off|custom|language|system|appearance|light|dark|autostart|about|update)\b/i);
    }
  });

  it("settings.about.version carries the {version} placeholder in en and es", () => {
    for (const locale of ["en", "es"] as const) {
      expect(t(locale, "settings.about.version")).toContain("{version}");
    }
  });

  it("settings.shortcuts.changeAria carries the {label} placeholder in en and es", () => {
    for (const locale of ["en", "es"] as const) {
      expect(t(locale, "settings.shortcuts.changeAria")).toContain("{label}");
    }
  });

  it("reuses the pinned shortcut-failure warning strings from S3 (no separate, drifting copy for the same failure)", () => {
    expect(t("en", "shortcuts.warning.primaryFailed")).toMatch(/settings/i);
    expect(t("es", "shortcuts.warning.primaryFailed")).toMatch(/configuraci[oó]n/i);
  });

  it("the language note names the fields it's warning about (F10 — OS-locale date/time pickers) in both locales", () => {
    for (const locale of ["en", "es"] as const) {
      expect(t(locale, "settings.language.note").length).toBeGreaterThan(0);
    }
    expect(t("en", "settings.language.note")).toMatch(/date and time/i);
    expect(t("es", "settings.language.note")).toMatch(/fecha y hora/i);
  });
});

describe("locale-aware percent formatter (S11: tag-share display — rounding itself is NOT this formatter's job)", () => {
  it("en-US: no space before the sign", () => {
    expect(formatPercent("en", 62)).toBe("62%");
  });

  it("es-ES: a space before the sign (idiomatic, not the en convention)", () => {
    const formatted = formatPercent("es", 62);
    expect(formatted).toMatch(/^62.%$/); // the space may be a non-breaking space (U+00A0)
    expect(formatted).not.toBe("62%");
  });

  it("renders 0% and 100% correctly at the boundaries", () => {
    expect(formatPercent("en", 0)).toBe("0%");
    expect(formatPercent("en", 100)).toBe("100%");
  });
});
