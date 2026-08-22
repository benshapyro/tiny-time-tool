// S10: real DOM download implementation — `ExportController`'s default
// `downloadFile` side effect. A Blob + a temporary `<a download>` click is
// the standard client-side "save this string as a file" pattern; it needs
// no Tauri filesystem/dialog plugin, no new Cargo/npm dependency, and no
// capability change (`src-tauri/capabilities/default.json`,
// `fixtures/golden/tauri-security.json` stay untouched) — it is a plain
// WebView-level browser API, not a network or filesystem call, so it stays
// inside the zero-network CSP (`default-src 'self'`).
//
// No unit test for this file itself: it is real browser I/O (creates a
// blob: URL, appends/clicks/removes a DOM node), exercised live at the S14
// manual-check gate — same "no unit test for the IPC/DOM glue" convention as
// every other *Container.tsx / browser-only helper in this project.
// `exportController.test.ts` injects a mock in place of this function and
// asserts the CONTENT it would have been called with, which is the part
// that's actually worth testing.

export function browserDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
