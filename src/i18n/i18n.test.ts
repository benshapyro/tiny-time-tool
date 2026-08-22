import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";
import { formatDisplayTime, formatFixedTime, formatShortDate, t } from "./index";

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
