import type { TranslationKey } from "./en";

// Spanish catalog. `Record<TranslationKey, string>` forces every key from
// en.ts to be present here — an omission fails `tsc`, not just a runtime
// coverage test. This is the seed of the S13a i18n-coverage check.
export const es: Record<TranslationKey, string> = {
  "app.name": "Tiny Time Tool",
  "tray.openDashboard": "Abrir panel",
  "tray.quit": "Salir",
  "tray.tooltip.idle": "Tiny Time Tool — inactivo",
  "tray.tooltip.running": "Tiny Time Tool — en curso",
  "tray.tooltip.paused": "Tiny Time Tool — en pausa",
  "shortcuts.warning.primaryFailed":
    "No se pudo asignar el atajo de inicio/pausa/reanudar — es posible que otra app ya lo esté usando. Elige otro en Configuración.",
  "shortcuts.warning.stopFailed":
    "No se pudo asignar el atajo para detener — es posible que otra app ya lo esté usando. Elige otro en Configuración.",
};
