import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRAY_ICON_ASSET, TRAY_STATES } from "./trayState";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_TAURI_DIR = join(HERE, "..", "..", "src-tauri");

describe("tray-state model", () => {
  it("maps all three pinned states to an asset path", () => {
    expect(TRAY_ICON_ASSET.idle).toBe("icons/tray-idle.png");
    expect(TRAY_ICON_ASSET.running).toBe("icons/tray-running.png");
    expect(TRAY_ICON_ASSET.paused).toBe("icons/tray-paused.png");
  });

  it("the three asset paths are distinct", () => {
    const paths = TRAY_STATES.map((state) => TRAY_ICON_ASSET[state]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("the three asset files actually exist on disk", () => {
    for (const state of TRAY_STATES) {
      const assetPath = join(SRC_TAURI_DIR, TRAY_ICON_ASSET[state]);
      expect(existsSync(assetPath), `expected ${assetPath} to exist`).toBe(true);
    }
  });
});
