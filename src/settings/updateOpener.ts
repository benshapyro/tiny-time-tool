// S12: "Check for updates" (BUILD_SPEC S12 row; decisions.md #37 — "opens
// the download page in the default browser... Zero in-app network
// preserved"). The app itself never makes a network request: this calls the
// official `tauri-plugin-opener`'s `openUrl`, which asks the OS to hand the
// URL to the user's system browser. That is a real, user-visible OS action
// (a new browser tab appears) but is NOT a network request BY THIS APP —
// exactly the same "opens the system browser" pattern the spec already
// pins for `os_integration.rs`'s doc comment, and precisely why
// `scripts/check-zero-network.mjs`'s forbidden-pattern list does not
// include `openUrl(` at all — there is nothing to allowlist here, the
// mechanism is categorically different from an in-app network call. Tests
// assert this is an OPENER
// call (a mock recording it was invoked with the pinned URL), never any of
// the forbidden network APIs the zero-network scan watches for — see
// `settingsController.test.ts`.
//
// (Deliberately not spelling out those forbidden API names literally in
// this comment: `scripts/check-zero-network.mjs` matches raw substrings
// against the whole file, comments included — see that script's own doc
// comment for why it's a plain scan rather than an AST parse. Naming them
// here would trip the very gate this file is explaining.)
//
// **Load-bearing assumption, not yet confirmed by Ben:** the download page
// itself. decisions.md #33 says installers ship via GitHub Releases;
// decisions.md #38 says the actual team-facing distribution is a shared
// Google Drive folder link. Neither decision pins a literal URL anywhere in
// BUILD_SPEC or decisions.md — there is nothing to copy verbatim. This
// constant uses the GitHub Releases page for the repo BUILD_SPEC's own
// goal-prompt.md names Claude creating (`benshapyro/tiny-time-tool`), since
// that is the one URL actually grounded in a decision already made (#33),
// rather than inventing a Drive link that doesn't exist. **Flag this for
// Ben: confirm this is the right target (GitHub Releases vs. the Drive
// link from #38) before shipping** — swapping it is a one-line change here,
// nothing else in the app depends on the literal value.
export const PINNED_UPDATE_URL = "https://github.com/benshapyro/tiny-time-tool/releases/latest";

/** The seam `SettingsController.checkForUpdates()` calls — injected so
 * tests assert an opener call without touching the real Tauri bridge (same
 * "inject the plugin call, fake it in tests" pattern as every other driver
 * in this project). */
export type UpdateOpener = (url: string) => Promise<void>;
