import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractSecuritySubset } from "./securitySubset";

// Repo root is two levels up from src/config/.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("CSP golden-file test (zero-network mechanism a)", () => {
  it("extracts exactly the hand-authored golden security subset from the real config", () => {
    const tauriConf = readJson(join(REPO_ROOT, "src-tauri", "tauri.conf.json"));
    const capabilitiesDir = join(REPO_ROOT, "src-tauri", "capabilities");
    const capabilityFiles = readdirSync(capabilitiesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson(join(capabilitiesDir, f)));

    const actual = extractSecuritySubset(
      tauriConf as Parameters<typeof extractSecuritySubset>[0],
      capabilityFiles as Parameters<typeof extractSecuritySubset>[1],
    );
    const golden = readJson(join(REPO_ROOT, "fixtures", "golden", "tauri-security.json"));

    expect(actual).toEqual(golden);
  });

  it("pins the CSP to exactly default-src 'self' — blocks every remote load", () => {
    const tauriConf = readJson(join(REPO_ROOT, "src-tauri", "tauri.conf.json")) as {
      app: { security: { csp: string | null } };
    };
    expect(tauriConf.app.security.csp).toBe("default-src 'self'");
  });

  it("declares no remote-domain capabilities", () => {
    const capabilitiesDir = join(REPO_ROOT, "src-tauri", "capabilities");
    const capabilityFiles = readdirSync(capabilitiesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson(join(capabilitiesDir, f)) as { remote?: unknown });

    expect(capabilityFiles.length).toBeGreaterThan(0);
    for (const cap of capabilityFiles) {
      expect(cap.remote).toBeUndefined();
    }
  });
});
