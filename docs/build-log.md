# Build log — tiny-time-tool

Durable record of the autonomous build run. The spec at
`docs/specs/2026-08-21-tiny-time-tool/BUILD_SPEC.md` is canonical; this file records
what the run *did*, decisions it had to make, and environment facts worth not
rediscovering. Nothing here overrides the spec.

## Run start — 2026-08-22

Coordinator: Opus 5 (1M context). Slice implementers: Sonnet subagents, serialized
(one writer at a time in the shared tree — no parallel writers).

### Repository

- `benshapyro/tiny-time-tool` created private, `main` pushed. (Spec: Context bundle →
  Repository; decisions.md #47.)
- **Remote uses SSH, not HTTPS.** The `gh` OAuth token has scopes
  `gist, read:org, repo` — no `workflow` scope — so an HTTPS push of any commit
  touching `.github/workflows/**` is rejected by GitHub. SSH (`git@github.com`)
  is not subject to that restriction and authenticates as `benshapyro`.
  `gh` is still used for API calls (repo/PR/run queries).

### Environment facts verified this session (2026-08-22)

| Thing | Value | Note |
|---|---|---|
| node / npm | v26.7.0 / 11.19.0 | |
| cargo / rustc | 1.98.0 / 1.98.0 | PRE-LAUNCH recorded 1.88.0; newer is present |
| Xcode CLT | Xcode 17 | `.dmg` build prerequisite |
| gh | 2.98.0, authed `benshapyro` | token in macOS keychain → **gh calls must run unsandboxed** |

**npm under the sandbox.** `~/.npm/_cacache` is not sandbox-writable, so npm failed
with `EPERM`. Fixed with a machine-local, gitignored `.npmrc` pointing `cache=` at
`./.npm-cache`. npm therefore runs *inside* the sandbox. `.npmrc` and `.npm-cache/`
are gitignored — this is local config, never committed, and CI is unaffected.

**cargo under the sandbox.** crates.io *is* reachable from the sandbox (index
resolution succeeds), but `~/.cargo/registry` is not sandbox-writable, so downloads
fail with `Operation not permitted`. Rather than duplicate the whole crate cache,
**cargo commands run unsandboxed** against the real `~/.cargo`. This was the one
PRE-LAUNCH "need" row (crates.io in the sandbox allowlist) and it did not require
Ben — the network was never the blocker, the cache directory was.

### Plugin names — spec gotcha resolved

The spec's Context bundle flagged the autostart/opener plugin names as "recalled, not
verified — verify against the plugins workspace docs before S1 pins them." Verified
against the npm registry itself (authoritative, not docs) on 2026-08-22:

| Package | Version |
|---|---|
| `@tauri-apps/api` | 2.11.1 |
| `@tauri-apps/cli` | 2.11.4 |
| `@tauri-apps/plugin-opener` | 2.5.4 |
| `@tauri-apps/plugin-autostart` | 2.5.1 |
| `@tauri-apps/plugin-global-shortcut` | 2.3.2 |
| `@tauri-apps/plugin-sql` | 2.4.0 |
| `@tauri-apps/plugin-notification` | 2.3.3 |

Both recalled names are correct. No spec change needed.

### One spec tension, resolved and flagged

The advisory constraint says *never edit `docs/specs/**`*. `Done #6` says the run must
record break-it evidence in `verification.md`, which lives **inside** `docs/specs/`,
and that file's own table contains the placeholder row "(filled by the build run per
Done #6)". The specific instruction wins over the general one: the run writes to
`verification.md` **only** — its evidence table and Verdict section — and touches no
other file under `docs/specs/`. Gate approval lines in `decisions.md` are Ben's to
write, not the run's. Flagged to the user at run start.

## Slice ledger

| Slice | Branch | Status | Notes |
|---|---|---|---|
| S1 | `slice/s1-scaffold` | implemented, awaiting [HUMAN GATE] | 43 TS tests, 9 Rust tests, local `.dmg` built |

## S1 — coordinator review (2026-08-22)

Implemented by a Sonnet subagent, reviewed and re-verified independently by the
coordinator. **Every number below was re-run by the coordinator, not taken from the
implementer's report.**

| Check | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | clean |
| `npm test` | 0 | 7 files, 43 tests |
| `cargo test` | 0 | 9 passed |
| `scripts/check-zero-network.mjs` | 0 | clean |
| `scripts/check-deps-allowlist.mjs` | 0 | clean |
| `npm run tauri build` | — | `Tiny Time Tool_0.1.0_aarch64.dmg`, ~3.0 MB |

**Method note — exit codes.** A first pass at these used bash `${PIPESTATUS[0]}` in a
fish shell and printed empty strings. Those non-results were nearly read as passes.
Re-run unpiped reading fish's `$status`. A gate that cannot observe failure is not a
gate.

### Mid-slice spec amendment

Ben amended the spec (206e8d3) while S1 was in flight: macOS tray title text
(running → ticking elapsed, paused → `⏸ {elapsed}`, idle → empty; Windows gets icon
state + tooltip), plus locale-aware display times. The implementer's first "S1 done"
report **omitted the tray-title work entirely** — caught on review, re-dispatched,
now implemented with the `set_title` call guarded to `#[cfg(target_os = "macos")]`
and idle passing `None` so the title genuinely clears.

### Test-first: deviation, accepted deliberately

The implementer substituted a **sabotage drill** for strict red-then-green ordering on
the first pass, on the argument that in an empty repo every "failing" test fails with
*module not found*, which proves nothing about the assertion. That reasoning is sound
and the drill is what `Done #6` requires anyway, so it was accepted — but it is a
deviation from the literal "written failing first" instruction and is recorded as one.
The addendum round was true TDD (import-resolution failures first, then implement).

**Coordinator reproduced one drill independently** rather than trusting the transcript:
broke the CSP to `default-src 'self' https://evil.example.com`, ran `npm test` → exit 1
with 7 failures on the two intended assertions (golden-file compare and direct CSP
equality); restored from backup, `diff` byte-identical, back to exit 0. The guard is
real. Nine further drills are recorded in the implementer's transcript and feed
`verification.md`.

**Process error, coordinator's:** that sabotage ran while the subagent was still active
in the shared tree, after it had reported done. Its own test run in that window would
have shown a CSP failure the coordinator caused. Warned explicitly; no phantom fix was
made. Two writers in one tree, exactly the hazard flagged to the peer session an hour
earlier.

### Findings carried forward

1. **`reqwest` in `Cargo.lock`** — transitive via `tauri`'s mobile bridge, not added by
   us. Coordinator verified with `cargo tree -i reqwest` against all three shipping
   targets (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`):
   **absent from every one**; it appears only under `--target all`. Allowlisted with
   this finding documented inline. Not a zero-network hole.
2. ~~**Elapsed-format is an inferred call — needs Ben.**~~ **RESOLVED 2026-08-22.**
   Ben pinned the implementer's choice as canonical (a872e4f, decisions #52):
   ticking timer is `M:SS` under one hour, `H:MM:SS` at and beyond, **tray title and
   popover must agree**, paused shows `⏸ ` plus the same format. S5 inherits this
   rather than choosing.
3. ~~**Spanish quality nit** — `tray.tooltip.running` is `"rastreando"`.~~
   **RESOLVED 2026-08-22.** Ben pinned it in the spec (a872e4f, decisions #53):
   running state is `en curso`, never `rastreando`, and S13a now reviews *idiom*,
   not just key coverage. Applied to `src/i18n/es.ts`.
4. **Tray art is placeholder-quality** — hand-generated PNGs (ring / disc / pause bars)
   via a small zlib encoder, since no image tooling exists in the sandbox. Genuinely
   distinguishable in silhouette and valid as template images, but they need a design
   pass before S14.
5. **Tray menu labels + tooltips are hardcoded English in Rust.** The native menu is
   built before the webview JS runtime exists, so it cannot call `t()`. The `tray.*`
   keys already exist in both catalogs; S12 wires `set_text`. This is a real
   i18n-coverage gap that the S13a check must not be allowed to score as passing.
6. **Main window is visible at launch** (800×600, no `"visible": false`). For a tray
   app whose menu offers *Open Dashboard*, and given S5 pins "on first launch the
   popover auto-opens once", the dashboard probably should not be open at boot.
   Left for S5 to settle rather than pre-empted here.
7. **CI is unexercised.** Every step was run locally and is green, but no real
   `macos-latest` / `windows-latest` run has happened yet, and the Windows build has
   never been compiled anywhere. That is precisely what the S1 gate exists to check.

## S1 — first CI run (32548859884): what only real runners could find

macOS passed end to end in 5m42s and uploaded `tiny-time-tool-macos-dmg` (3,103,436
bytes). Windows failed. Two defects, both invisible on a Mac. This is the entry that
justifies the S1 gate existing at all.

### Defect 1 — CRLF broke the Windows test suite

`SyntaxError: Invalid or unexpected token` on both `scripts/*.test.ts` suites; 25 tests
passed, 2 suites never loaded. No `.gitattributes` existed, and Git for Windows checks
out with `autocrlf=true` (the `windows-latest` default), so the `.mjs` check scripts
arrived with CRLF and Vite's shebang handling could not parse them.

**Reproduced locally before fixing** — converted the four files to CRLF on macOS and got
the byte-identical error, then converted back and confirmed `git diff` empty. Fixed with
a `.gitattributes` pinning `* text=auto eol=lf`, which closes the whole class rather
than these four files.

### Defect 2 — both zero-network CI gates were vacuous on Windows

Far more serious, and it would have passed silently and *looked green forever*.

Both check scripts guarded their CLI entry with:

```js
if (import.meta.url === `file://${process.argv[1]}`) main();
```

That comparison is false for any path needing URL encoding and for **every** Windows
path (`file://C:\...` never equals `file:///C:/...`). When false, `main()` never runs,
the process exits 0, and CI records a passing zero-network check **that scanned
nothing**. Mechanism (b) and mechanism (c) — two of the three enforced constraints —
were both dead on `windows-latest`, and nothing in the run would ever have said so.

Windows never reached those steps (it died at Vitest first), so this was found by
reading the mechanism rather than by watching it fail. **Proven locally** by copying the
scanner to a directory whose name contains a space and running it against a tree with a
real `WebSocket` violation: exit 0 instead of 1 — the gate never ran.

Fixed to `pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url` in both
scripts. `realpathSync` is load-bearing, not defensive: Node's ESM loader resolves
symlinks when building `import.meta.url` while `process.argv[1]` stays literal, so on
macOS (`/tmp` → `/private/tmp`) the first attempt at the fix *still* failed. Caught
because the regression test was watched going red, then green — the intermediate fix
looked correct and was not.

**Regression test added** (`still detects a violation when its own path contains a
space`): verified red against the old guard with exactly one failure on the intended
assertion, green against the new one. 43 → 44 tests.

Recorded as rows in `verification.md`: these are the run's real findings so far.

## S4 — focus-grab spike (2026-08-22)

BUILD_SPEC S4 requires proving, before the rest of the slice is built, that the quick-entry
panel receives keystrokes immediately when summoned over a frontmost third-party app. This
session has **no macOS Accessibility grant** for the process running its shell — `osascript`
confirmed with `System Events`: `keystroke "hello"` fails with *"osascript is not allowed to
send keystrokes" (-1002)*, and reading the UI tree (`get name of every window`) fails with
*"osascript is not allowed assistive access" (-1728)*. Neither can be granted without a human
clicking through System Settings → Privacy & Security → Accessibility, which this session
cannot do. **A literal synthesized keypress was not possible here.**

Given that constraint, the spike was scoped to prove the two facts a physical keypress
actually depends on, using signals that don't require Accessibility:

1. **macOS app/window activation** — does `panel.show()` + `panel.setFocus()` on an
   `alwaysOnTop: true, decorations: false, visible: false` window (declared in
   `src-tauri/tauri.conf.json`, label `"panel"`) actually take frontmost/key-window status
   away from another app, with zero user click? Queried via
   `System Events → name of first process whose frontmost is true` (an Automation-only
   query already permitted, no Accessibility needed).
2. **DOM/webview focus** — at the instant the OS window becomes key, is the panel's
   `<input aria-label="Quick entry" autoFocus>` genuinely `document.activeElement`, with
   `document.hasFocus() === true`? Reported by the panel's own JS via a temporary
   `debug_write` Tauri command that appended to a log file — no Accessibility needed, pure
   IPC the app already has.

**Procedure and result**, reproduced from a clean state:
```
hide the panel                                    → hide=Ok(())
activate TextEdit, new empty doc, confirm frontmost → "TextEdit"
clear log; touch trigger → panel.show()+panel.setFocus()
                                                    → show=Ok(()) set_focus=Ok(())
frontmost process after                            → "tiny-time-tool"
panel's own JS, at the native focus event:
  window focus event: document.hasFocus()=true activeElement=INPUT[aria-label=Quick entry]
TextEdit's document text                            → unchanged (empty)
```
Both facts hold together: the OS actually moved keyboard ownership from TextEdit to the app
(fact 1, confirmed by an independent OS query, not the app's own claim), and at that exact
moment the input already held DOM focus (fact 2). macOS routes physical key events to the key
window's first responder, and WKWebView routes them to the focused DOM element — both links
in that chain are now proven live. This is not a substitute for a literal keypress test, and
the true "type a character and see it land" step is deferred to the S14 manual-check gate (and
the L3 landing check) as the spec's own testing-strategy section anticipates for exactly this
kind of native-input case — but it is a real result, not an assumption: **the spike passed**,
scoped as above. **Windows behavior remains untested here** — BUILD_SPEC already names that a
residual risk deferred to the S14 manual check on Ben's Windows device.

**A real, load-bearing defect was found and fixed while running the spike.** S4 is the first
slice whose frontend bundle actually imports `TimerEngine` (via a new `src/app/bootstrap.ts`
that wires it into the running app — S2/S3 built and tested it, but nothing ever *ran* it
outside Vitest). `src/timer/timerEngine.ts` imported `randomUUID` from `"node:crypto"` — a
Node.js builtin. That resolves fine under Vitest (a Node test environment) and type-checks
fine under `tsc` (`@types/node` provides it), but **breaks the moment it reaches a real
browser/webview runtime**: importing it in the real app silently aborted the entire `main.tsx`
module graph before a single line of the importing module ran (ES module semantics — a
throwing import blocks the importer's own top-level code), so *neither* window's React tree
rendered and no `invoke()` call ever reached Rust. Diagnosed by adding an unconditional
`debug_write` call as the very first statement of a minimal, import-free `main.tsx`: it
worked; reintroducing the real imports one at a time isolated it to `bootstrap.ts` →
`timerEngine.ts` → `node:crypto`. Fixed by switching to the standard `crypto.randomUUID()`
(Web Crypto API), which is available identically in the real webview, in Vitest/jsdom, and in
plain Node — no environment-specific branching needed. `npm test` (84/84) and `cargo test`
(9/9) both still green after the fix; this defect had no test coverage before because nothing
before S4 ever loaded `timerEngine.ts` outside a test runner.

**Also wired live for the first time, verified to compile and run (not exercised by a shortcut
press yet, pending the S14 manual gate):** `src/app/bootstrap.ts` constructs the real
`TimerEngine` + `ShortcutController` against the production Tauri plugins and connects S3's
`onPanelOpenRequested` seam to `panel.show()`/`panel.setFocus()`, and `onTrayStateChange` to a
new `set_tray_state` Tauri command wrapping the S1 tray code that had been dead code since S1
(`src-tauri/src/lib.rs`, `src-tauri/src/tray.rs`'s `TrayState` now derives `serde::Deserialize`
with `rename_all = "lowercase"` to match the TS union on the wire).

All spike-only scaffolding (the `debug_write` command, the file-poll trigger thread, the
diagnostic `useEffect`/`onFocus` logging in the panel component) was removed after the result
was recorded; only the permanent wiring (`bootstrap.ts`, the panel window config/capabilities,
`set_tray_state`) remains.
