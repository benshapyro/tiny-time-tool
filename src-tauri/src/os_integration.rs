//! OS integration plumbing — the **one** file allowlisted by
//! `scripts/check-zero-network.mjs` to reference OS-facing APIs the scanner
//! otherwise treats as network red flags (`std::net`, `std::process::Command`,
//! `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`).
//!
//! This file itself contains **no network code** — the app is zero-network
//! by design (BUILD_SPEC Constraints). It exists as a deliberate seam for
//! OS-level plumbing that a source scanner can't distinguish from network
//! I/O by pattern alone (e.g. a future `std::process::Command` invocation to
//! shell out to an OS-native picker), so that plumbing stays reviewable in
//! one place instead of scattered through business logic.
//!
//! "Check for updates" (S12) opens the system browser via the official
//! `tauri-plugin-opener` — not through this file, and not a network request
//! made by the app itself.
//!
//! Nothing here yet in S1; later slices (shortcuts, notifications, autostart)
//! add real OS plumbing through their own official Tauri plugins, not this
//! file, unless it's plumbing a source-scan pattern would otherwise flag.

/// Returns a short human-readable label for the current build's target OS.
/// Trivial placeholder proving this module compiles and is wired into
/// `lib.rs`; real plumbing lands as later slices need it.
#[allow(dead_code)]
pub fn target_os_label() -> &'static str {
    std::env::consts::OS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_os_label_is_non_empty() {
        assert!(!target_os_label().is_empty());
    }
}
