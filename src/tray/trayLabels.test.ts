// S13a: the tray menu and tooltips are the one surface the i18n layer could
// not reach. The native menu is built in Rust at startup, before the
// webview's JS runtime exists, so it cannot call `t()` — for twelve slices
// the `tray.*` keys were fully translated in both catalogs and the actual
// labels were English string literals in `src-tauri/src/tray.rs`. Once S12
// shipped the language setting, that became reachable: a Spanish app with
// an English tray menu.
//
// This module is the pure half of the fix — locale in, the five tray strings
// out — which Rust is then handed over the existing command bridge. Every
// assertion below is a LITERAL, never `t(locale, key)`: an assertion written
// in terms of the catalog it is checking moves with the catalog and cannot
// fail (verification.md F11).

import { describe, expect, it } from "vitest";
import { trayLabels } from "./trayLabels";

describe("tray labels", () => {
  it("returns the English menu and tooltip strings for en", () => {
    expect(trayLabels("en")).toEqual({
      openDashboard: "Open Dashboard",
      quit: "Quit",
      tooltipIdle: "Tiny Time Tool — idle",
      tooltipRunning: "Tiny Time Tool — tracking",
      tooltipPaused: "Tiny Time Tool — paused",
    });
  });

  it("returns the Spanish menu and tooltip strings for es", () => {
    expect(trayLabels("es")).toEqual({
      openDashboard: "Abrir panel",
      quit: "Salir",
      tooltipIdle: "Tiny Time Tool — inactivo",
      tooltipRunning: "Tiny Time Tool — en curso",
      tooltipPaused: "Tiny Time Tool — en pausa",
    });
  });

  it("uses the idiomatic 'en curso' for the running tooltip, never 'rastreando'", () => {
    // BUILD_SPEC decisions: "the running-state tooltip/label is `en curso`
    // (never `rastreando`)". Pinned here because the tray tooltip is the one
    // running-state string no component test renders.
    expect(trayLabels("es").tooltipRunning).toContain("en curso");
    expect(trayLabels("es").tooltipRunning).not.toContain("rastreando");
  });

  it("gives every field a distinct value per locale, so no field is wired to the wrong key", () => {
    for (const locale of ["en", "es"] as const) {
      const values = Object.values(trayLabels(locale));
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("differs between locales on every field except the product name it embeds", () => {
    const en = trayLabels("en");
    const es = trayLabels("es");
    expect(es.openDashboard).not.toBe(en.openDashboard);
    expect(es.quit).not.toBe(en.quit);
    expect(es.tooltipIdle).not.toBe(en.tooltipIdle);
    expect(es.tooltipRunning).not.toBe(en.tooltipRunning);
    expect(es.tooltipPaused).not.toBe(en.tooltipPaused);
  });
});
