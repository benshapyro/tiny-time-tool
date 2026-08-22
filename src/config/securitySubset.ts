/**
 * Extracts the security-relevant subset of the real Tauri config (CSP +
 * capability declarations) for the golden-file test in
 * `fixtures/golden/tauri-security.json`. This is mechanism (a) of the
 * zero-network constraint: `default-src 'self'` blocks every remote load
 * (connections, images, fonts — everything), and no capability may declare
 * a `remote` domain allowance.
 */

export interface CapabilitySecuritySubset {
  identifier: string;
  windows: string[];
  remote: unknown;
  permissions: string[];
}

export interface SecuritySubset {
  csp: string | null;
  capabilities: CapabilitySecuritySubset[];
}

interface TauriConfigLike {
  app: {
    security: {
      csp: string | null;
    };
  };
}

interface CapabilityFileLike {
  identifier: string;
  windows: string[];
  remote?: unknown;
  permissions: string[];
}

export function extractSecuritySubset(
  tauriConf: TauriConfigLike,
  capabilityFiles: CapabilityFileLike[],
): SecuritySubset {
  return {
    csp: tauriConf.app.security.csp,
    capabilities: [...capabilityFiles]
      .map((cap) => ({
        identifier: cap.identifier,
        windows: cap.windows,
        remote: cap.remote ?? null,
        permissions: cap.permissions,
      }))
      .sort((a, b) => a.identifier.localeCompare(b.identifier)),
  };
}
