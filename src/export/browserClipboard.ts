// S10: real clipboard-write implementation — `ExportController`'s default
// `copyToClipboard` side effect. Uses the standard Web Clipboard API
// (`navigator.clipboard.writeText`) rather than a Tauri plugin: it needs no
// new Cargo/npm dependency, no capability change
// (`src-tauri/capabilities/default.json`, `fixtures/golden/tauri-security.json`
// stay untouched), and both target WebViews (WKWebView on macOS, WebView2 on
// Windows) support `writeText` from a real user-gesture click handler (the
// only way this is ever called — the Export section's "Copy for AI" button).
//
// No unit test for this file itself: it is real browser I/O, exercised live
// at the S14 manual-check gate. `exportController.test.ts` injects a mock in
// place of this function and asserts what it would have been called with.

export async function browserClipboardWrite(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable");
  }
  await navigator.clipboard.writeText(text);
}
