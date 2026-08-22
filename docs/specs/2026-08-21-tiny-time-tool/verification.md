# Verification — tiny-time-tool

Evidence that each check in this build **can actually fail**. A check nobody has
watched go red is not a check; it's a comment that returns green. A suite of broken
tests and a suite of passing tests look identical from the outside — the only way to
tell them apart is to hold a match under each one.

For every guardrail and acceptance check: break the thing it protects, watch the
check fail, restore, and record it here.

> **Scope note.** This file is the one thing under `docs/specs/` the build run writes,
> because `Done #6` names it explicitly and its table shipped with the placeholder
> "(filled by the build run per Done #6)". Nothing else under `docs/specs/` is touched
> by the run. Gate approval lines in `decisions.md` remain Ben's to write.
>
> **Provenance.** Every row below was broken, observed red, and restored **by the
> coordinator session itself**, not copied from an implementer subagent's transcript.
> The implementer ran its own parallel drills; those were treated as unverified claims
> and re-run here from scratch. "Restored" means `cmp` against a pre-break backup
> confirmed the file byte-identical, and the tree was confirmed clean against `HEAD`
> after each batch.

## S1 — scaffold, tray, i18n, tokens, zero-network guards, CI

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 1 | **Zero-network (a)** — CSP pinned to `default-src 'self'` | Set `app.security.csp` to `default-src 'self' https://evil.example.com` | Yes — `npm test` exit 1, 7 failures; both the golden-subset compare and the direct equality assertion | Byte-identical | The single highest-value guard in the build |
| 2 | **Zero-network (a)** — no remote-domain capability | Added a `remote: { urls: [...] }` entry to `capabilities/default.json` | Yes — golden-subset mismatch | Byte-identical | Guards an *absence*; would never fire on its own |
| 3 | **Zero-network (b)** — allowlist parses `Cargo.lock` | Neutered the `^name = "…"` regex so no cargo names are extracted | Yes — exit 0 where 1 expected | Byte-identical | Proves the fixture tests exercise detection, not just exit-code plumbing |
| 4 | **Zero-network (c)** — source scan detects forbidden patterns | Emptied `FORBIDDEN_PATTERNS` | Yes | Byte-identical | Same reasoning as #3 |
| 5 | **Zero-network (c)** — the CLI gate actually executes | Reverted the entry guard to ``import.meta.url === `file://${process.argv[1]}` `` | Yes — exactly 1 failure, on the intended assertion | Byte-identical | **A real defect found in shipped code, not a drill.** See findings below |
| 6 | i18n smoke — es must differ from en | Set the es value equal to the en value | Yes | Byte-identical | |
| 7 | i18n completeness — runtime | Deleted `tray.quit` from `es.ts` | Yes — `expected [ 'tray.quit' ] to deeply equal []` | Byte-identical | Separate row from #8 because Vitest does **not** typecheck |
| 8 | i18n completeness — compile time | Deleted `tray.tooltip.paused` from `es.ts` | Yes — `tsc` exit 2, `error TS2741` | Byte-identical | Seed of the S13a coverage check |
| 9 | Tray-state maps to three **distinct** assets (TS) | Collapsed `running` onto idle's asset path | Yes — `expected 'icons/tray-idle.png' to be 'icons/tray-running.png'` | Byte-identical | |
| 10 | Tray asset files exist on disk (TS) | Pointed `paused` at a nonexistent file | Yes — both the mapping **and** the file-existence assertions fired (confirmed individually) | Byte-identical | |
| 11 | Tray-state → icon mapping (Rust) | Collapsed `TrayState::Running` onto Idle's path | Yes — `cargo test` exit 101 | Byte-identical | |
| 12 | Tray title text — paused keeps the `⏸` glyph (Rust) | Dropped the pause glyph from `title_for_state` | Yes — `left: "2:05"`, `right: "⏸ 2:05"` | Byte-identical | Covers the 2026-08-22 spec amendment |

### Findings — checks that were found broken, not merely proven breakable

**F1 — Two of the three enforced zero-network mechanisms were dead on Windows.**
Both check scripts guarded CLI entry with ``import.meta.url === `file://${process.argv[1]}` ``.
That comparison is false for any path needing URL encoding and for **every** Windows
path (`file://C:\…` never equals `file:///C:/…`). When false, `main()` never runs and
the process exits **0** — so `windows-latest` CI would have recorded a passing
zero-network check that scanned nothing, indefinitely, with nothing to indicate it.

Found by reading the mechanism rather than by watching it fail: Windows CI died earlier
in the job (see F2) and never reached those steps. Proven locally by copying the scanner
to a directory whose name contains a space and running it against a tree with a real
`WebSocket` violation — exit 0 instead of 1.

Repaired to `pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url`.
`realpathSync` is load-bearing: Node's ESM loader resolves symlinks when building
`import.meta.url` while `process.argv[1]` stays literal, so on macOS (`/tmp` →
`/private/tmp`) the first repair **still failed**. That was caught only because the
regression test was watched going red *and then actually confirmed green* — a plausible
fix is not a verified one. Row 5 is the regression test guarding it.

**F2 — CRLF silently disabled the Windows test suite.** No `.gitattributes` existed, so
Git for Windows (`autocrlf=true`, the `windows-latest` default) checked the `.mjs` check
scripts out with CRLF and Vite could not parse them: `SyntaxError: Invalid or unexpected
token`, two suites never loaded. Reproduced on macOS by converting the files to CRLF —
byte-identical error — then restored. Repaired with `.gitattributes` pinning
`* text=auto eol=lf`, which closes the class rather than the four affected files.

Both findings share a shape worth naming: **the failure direction was quiet.** Neither
would have produced a red run once Windows got past its first error; F1 in particular
would have reported green forever.

## S2 — timer engine + SQLite persistence

Same provenance rule: every row re-run by the coordinator, not inherited from the
implementer's transcript. The implementer ran seven drills of its own; these are
independent.

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 13 | Pinned fixture: start 10:00 → pause 10:20 → resume 10:30 → stop 10:45 = **35m across two segments** | Made `pause()` stop closing the segment (`ended_at` never written) | Yes — exit 1 | Byte-identical | The slice's headline acceptance check |
| 14 | Rehydration — a running entry survives a fresh engine against the same DB file | Disabled `TimerEngine.create`'s restore path | Yes — exit 1 | Byte-identical | The spec's "kill-and-relaunch" analogue, against a **real** SQLite file, not a mock |
| 15 | Day attribution is **local**, not UTC | Replaced the local `getFullYear/getMonth/getDate` key with `toISOString().slice(0,10)` | Yes — `expected '2026-08-22' not to be '2026-08-22'` | Byte-identical | Machine TZ confirmed `PDT` first — **on a UTC runner this drill proves nothing**, which is itself worth knowing |
| 16 | Open segment counts elapsed to *now* | `segmentDurationSeconds` returns 0 for any open segment | Yes — `expected +0 to be 1200`, `expected +0 to be 450` | Byte-identical | Fired at both unit and integration level |
| 17 | **Dependency allowlist catches a new, unlisted dependency** | Commented `@tauri-apps/plugin-sql` out of `deps-allowlist.txt` | Yes — `npm dependency "@tauri-apps/plugin-sql" is not in deps-allowlist.txt` | Byte-identical | First slice to add a dependency; this is the gate's first real exercise |
| 18 | Capability drift caught by the CSP golden file | Removed `sql:allow-execute` from `capabilities/default.json`, keeping the JSON valid | Yes — golden-subset mismatch naming `sql:allow-execute` | Byte-identical | S1's mechanism still guards S2's own capability change |

### Two drills were invalid on the first attempt — and the harness said so

Worth recording, because it is the failure mode this whole file exists to catch:

- The **day-attribution** sabotage was a **no-op** — the regex didn't match, the file was
  unchanged, and the suite stayed green. Scored as *invalid*, not as a pass, by the
  harness's `cmp`-against-backup guard. Without that guard it would have been recorded
  as "check verified" on the strength of a green run that proved nothing.
- The **capability** sabotage broke the JSON *syntax*, so the test failed with
  `SyntaxError: Unexpected token ']'` — red, but for the wrong reason. A red run is not
  automatically evidence: it has to be red *for the reason under test*. Redone with a
  syntactically valid edit and a required-pattern assertion, and the second harness
  checks the failure text matches the intended cause before scoring a pass.

Both were redone correctly and are rows 15 and 18 above.

### Dependency finding — same shape as S1's `reqwest`

`sqlx-mysql` and `sqlx-postgres` appear in `Cargo.lock` via `sqlx`, but were verified
**absent from both shipping targets** (`aarch64-apple-darwin`, `x86_64-pc-windows-msvc`)
by `cargo tree --target … -i`. Only the SQLite backend compiles in. Allowlisted with the
finding documented inline.

## S3 — global shortcuts

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 19 | Primary pauses a running timer (acceptance sequence) | Replaced `engine.pause()` in the running branch with a no-op | Yes — `expected 'running' to be 'paused'` | Byte-identical | |
| 20 | Registration failure sets a warning | Guarded the `warnings.set(...)` so failures are swallowed | Yes — `expected false to be true` | Byte-identical | "No silent failure" is the whole point of the slice |
| 21 | Panel seam fires **only** on idle→running | Deleted the `onPanelOpenRequested?.()` call | Yes — `expected +0 to be 1` | Byte-identical | Guards the S3/S4 interplay rule |
| 22 | A stray stop press while idle is a no-op, not a thrown error | Made `#handleStop` run unconditionally | Yes — the named no-op test failed | Byte-identical | An `IllegalTransitionError` escaping a live OS handler is the bad outcome |
| 23 | Pinned default accelerators | Changed `primary` to `CmdOrCtrl+Alt+T` | Yes — `expected 'CmdOrCtrl+Alt+T' to be 'CmdOrCtrl+Shift+Space'` | Byte-identical | See the fake-break note below — the first attempt at this drill was invalid |
| 24 | `rebind()` actually swaps the accelerator | Removed the assignment of `newAccelerator` | Yes — `expected true to be false` | Byte-identical | The S12 Settings path |
| 25 | The fake driver's failure simulation is load-bearing | Renamed `failingAccelerators` so simulation is inert | Yes — `expected false to be true` | Byte-identical | Proves the test double drives the tests, rather than decorating them |

### The fake-break trap, caught in the act

The first pass at row 23 **reported the check as unguarded** — the sabotage applied, the
file changed, and the suite stayed green. That looked like a genuine coverage hole.

It was not. `perl -0p` with no `/g` replaces only the **first** match in the slurped
file, which was the accelerator string inside a *comment* on line 9. The executable
constant on line 47 was untouched. The file genuinely changed, so the harness's
`cmp`-against-backup guard passed it as a valid drill — and it was worthless.

This is exactly the failure this document's first rule names: *"Editing a comment …
produces a green run that is indistinguishable from a passing test."* The harness could
detect *a* change but not a **behavioural** change.

Fixed by adding a second guard: the drill now diffs the file with comment lines stripped
and rejects the drill as invalid if only comments moved. Three further sabotages in the
same batch were rejected as outright no-ops by the existing `cmp` guard. Of seven
attempted S3 drills, **four were invalid on the first pass** — and every one of those
four would have been silently recorded as "verified" by a harness without these guards.

Re-run against the real code, all seven go red for their intended reason.

## S4 — quick-entry panel

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 26 | Auto-name uses an **en dash**, per the pinned literal | Swapped the en dash for a hyphen | Yes — `expected 'Aug 21 · 10:00 AM-10:45 AM' to be 'Aug 21 · 10:00 AM–10:45 AM'` | Byte-identical | The fixture is pinned character-for-character |
| 27 | First `@` token is the **client** | Assigned it to `project` instead | Yes — object mismatch on name/client/project | Byte-identical | |
| 28 | Later `@` tokens stay **literal in the name** | Removed the already-claimed guard | Yes — `expected … name: 'deep-dive @beta'` | Byte-identical | The spec's anti-Goodhart second fixture |
| 29 | Autocomplete matches a **prefix**, not a substring | `startsWith` → `includes` | Yes — `expected [ 'Client sync' ] to deeply equal []` | Byte-identical | |
| 30 | **Browser-safety gate** — no Node built-in reachable from the frontend bundle | Neutered both detectors in `check-browser-safe-imports.mjs` | Yes — 3 of its 5 fixture tests failed | Byte-identical | **New gate. Validated against the real historical defect, not a synthetic one** — see F4 |
| 31 | Panel window **grows to its content** (no clipped suggestions) | Removed the per-suggestion height term | Yes — `expected 84 to be greater than 84` | Byte-identical | Guards the design-review finding, F5 |

### F4 — a production-breaking bug that passed every gate we had

S2 merged with `import { randomUUID } from "node:crypto"` in `src/timer/timerEngine.ts`.
`node:crypto` does not exist in a WKWebView, so the import **aborted the entire
`main.tsx` module graph and neither window rendered**. The shipped app could not draw a
pixel.

Every gate was structurally blind to it. Vitest and `tsc` resolve `node:` builtins
happily. `vite build` exited **0**, because Rollup treats an unresolvable builtin as an
external and merely warns. CI was green on both platforms and produced installers. The
defect surfaced only because S4 became the first slice whose frontend bundle actually
imports `TimerEngine` — nothing before it ever executed that file outside a test runner.
Had S4 not needed it, this ships to the pilot.

Repaired to the Web Crypto `crypto.randomUUID()`, which behaves identically in webview,
jsdom and Node. Closed permanently by a new deny-by-default gate,
`scripts/check-browser-safe-imports.mjs`: it fails on any `node:*` or bare-builtin
import under `src/`, exempting only test files and two **named** test-only drivers, so
new offenders are refused by absence rather than by a blocklist someone must remember to
extend. Wired into `npm test` and CI, and it reuses the
`pathToFileURL(realpathSync(...))` entry guard so it cannot silently no-op on Windows
the way F1's scripts did.

**Validated against the real bug, not a stand-in:** run against `main`'s actual shipped
`timerEngine.ts` it reports
`src/timer/timerEngine.ts: imports a Node built-in — from "node:crypto"` and exits 1;
against the fixed tree it exits 0.

### F5 — the design review earned its place on its first outing

The S4 screenshots (light and dark, en and es) showed the second autocomplete suggestion
**sliced in half by the window edge**. The panel was a fixed, non-resizable 480×160 while
its content — input, optional notice, and a variable list — is taller than that, and the
list is `overflow: hidden`. Two suggestions already overflowed.

That breaks Design principle 6 ("every state is designed") and would have failed S13b's
no-clipped-text rule several slices later, in Spanish first, where strings run longer.
Fixed by sizing the window to its content (`panelHeightFor`, a pure and unit-tested
function) with the list scrolling past five rows, plus the
`core:window:allow-set-size` capability and a hand-updated golden fixture.

Worth naming: **no test would ever have caught this.** All 143 tests were green and the
panel's own component tests passed. It took looking at a picture.

## S5 — tray popover

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 32 | Day total pads minutes — the pinned fixture is `2h 05m`, not `2h 5m` | Dropped `padStart(2, "0")` | Yes — `expected '2h 5m' to be '2h 05m'` | Byte-identical | Two formats coexist: ticking `M:SS`, totals `Xh Ym`. Conflating them is the easy mistake |
| 33 | First-launch auto-open fires **exactly once** | Removed the early-return guard in `consumeFirstLaunch` | Yes — `UNIQUE constraint failed: settings.key` | Byte-identical | Persisted in SQLite, so it survives restart — not a per-session flag |
| 34 | Paused entry carries the pinned `⏸` treatment | Removed the glyph prefix from the entry row | Yes — `expected 'Paused task5m' to contain '⏸'` | Byte-identical | Paused must differ from running **and** stopped — three states |
| 35 | **The accelerator is never shown as a raw Tauri token** | Emptied the modifier table so tokens pass through | Yes — `expected 'cmdorctrlshiftspace' not to contain 'cmdorctrl'` | Byte-identical | Guards F6 |

### F6 — the first thing a new user reads was developer-speak

The first-launch teach line interpolated the raw accelerator, so the popover greeted
users with:

```
Pulsa CmdOrCtrl+Shift+Space para empezar a registrar
```

`CmdOrCtrl` is a Tauri internal token — not a key on any keyboard. This is the very
first string the product shows, and it lands hardest on exactly the non-technical,
Spanish-primary teammates ST8 ("install-to-first-tracked-task under a minute without
help") and ST7 are written for. Design principle 9's award test would not survive it.

`BUILD_SPEC` pins the teach line's *template* but not how the accelerator renders, so
formatting it is spec-compliant rather than a spec change. Fixed with a pure,
platform-parameterised `formatAccelerator`: `⌘⇧Space` on macOS, `Ctrl+Shift+Space`
elsewhere. S12's rebind UI needs the same rendering, so it is shared rather than local
to the popover. The strongest test is the invariant, not the literal: **no accelerator
rendering may contain `CmdOrCtrl` on any platform.**

Found by reading a screenshot, like F5 — the implementer flagged it honestly and scoped
it out; the coordinator judged it in scope because it is the product's first impression.
Two existing tests asserted the old raw-token output and were updated: they now assert
the invariant as well as the value, which is a stronger test than what they replaced.

### An observation recorded, deliberately not actioned

The ticking timer renders elapsed time as `M:SS`, so a paused 22-minute entry displays
**`22:00`** — which in a 24-hour locale reads exactly like a wall-clock time of 10 pm.
The format is pinned (decision #52) and the run does not relitigate pinned decisions, so
this is recorded for Ben's S14 rubric rather than changed.

## S6 — Dashboard Log tab

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 36 | Design-token gate detects a literal | Neutered the pixel detector | Yes — `expected [] to have a length of 1` | Byte-identical | New gate; see F7 |
| 37 | Design-token gate detects **unitless** design values | Disabled the `line-height`/`opacity` matcher | Yes | Byte-identical | Added after review found both sitting in a file the gate called clean |
| 38 | The Log follows **today** across midnight | Removed the re-pin in `refresh()` | Yes — `expected '2026-08-21' not to be '2026-08-21'` | Byte-identical | See F8 |

### F7 — three slices of "tokens only" were certified by a check that could not see

The coordinator's own CSS spot-check was `grep … | grep -v "var("`, which drops any
line mentioning a token **even when the same line also carries a literal**. So
`border: 1px solid var(--color-border)` read as clean. **Fourteen literals** accumulated
across four stylesheets while three consecutive slices reported "tokens only, no
literals". A reviewer caught one instance in S5; that was treated as a slip rather than
as evidence the check was blind.

Replaced with `scripts/check-design-tokens.mjs`, wired into `npm test` and CI, and
validated against `main`'s real CSS rather than a self-authored fixture: exit 1 there,
exit 0 on the fixed tree.

**The gate then had the same class of blind spot twice more, both found in review:** its
comment handling was `line.split("/*")[0]`, which hid violations following an inline
comment *and* scanned continuation lines of block comments as CSS; and it looked only
for colours and pixels, missing `line-height: 1` and `opacity: 0.5`. Both fixed with
tests. A first attempt at the unitless matcher was anchored to a whole line and matched
nothing inline — it passed its own fixtures while finding zero violations.

### F8 — the Dashboard showed yesterday after midnight

`#viewedDate` was pinned once at construction. The Dashboard is the app's main window,
so staying open overnight is the normal case — and after midnight it kept repainting the
previous day. A task started after midnight never appeared, and the only recovery was
clicking "Today". Now the view follows today while the user has not navigated away and
stays pinned when they have; both halves are tested, because dragging a user off a past
day they deliberately opened would be a different bug rather than a fix.

## S7 — full editing in the Log

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 39 | delete → undo restores the row **byte-identical** | `restoreEntry` minted a fresh uuid instead of reusing the entry's id | Yes — `FOREIGN KEY constraint failed` | Byte-identical | The DB itself refuses the corrupted restore — a stronger signal than an inequality. The test compares **raw `SELECT *` rows**, not engine-mapped objects |
| 40 | Overlapping-times edit is **rejected** | Removed the `throw new OverlapError()` | Yes — `expected null not to be null` (the designed inline error never appeared) | Byte-identical | Overlap is checked against every other segment in the database, not per-entry or per-day |
| 41 | A running entry exposes **no** end-time control | Inverted the branch so the End input always renders | Yes — `expected document not to contain element, found <input` | Byte-identical | The **absence** is the thing under test; the test also asserts `Start` *is* found, so a typo in the selector cannot fake a pass |
| 42 | Every successful mutation notifies the other surfaces | Removed the `onEngineMutated` calls | Yes — `expected "vi.fn()" to be called 1 times, but got 0` | Byte-identical | Editing history changes day totals the popover and tray display. S5 and S6 both shipped this gap; S7 tests for it |

### Scope decisions recorded for Ben, not silently absorbed

- **Delete is refused on the running or paused entry** (engine-level error plus a
  disabled, explained button). The S7 row says "delete … any day" without carving this
  out, but deleting the entry the engine is actively tracking would corrupt its internal
  pointers. Conservative reading; worth an explicit sign-off since it is a behaviour
  decision.
- **Native `<input type="time">` follows the OS locale, not the app's.** A user who
  picks Spanish in Settings while their OS stays en-US will see AM/PM inside the
  time-picker fields while the rest of the surface is 24-hour. There is no standard HTML
  way to force this; fixing it means a custom picker. Named residual for S12/S13b.
- **Multi-segment entries** expose only first-segment start and last-segment end;
  internal pause/resume boundaries are not editable in this slice.
- **The undo toast has no auto-dismiss timer** — it persists until acted on, is replaced
  by a second delete, or is cleared by day navigation.

## S8 — reminders

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 43 | **Exactly one** nudge at the interval — fires at all | `<` → `<=` in the interval comparison | Yes — `expected +0 to be 1` | Byte-identical | The headline acceptance check, broken in the "too few" direction |
| 44 | **Exactly one** nudge — no boundary re-fire | Stopped advancing the last-nudge mark before firing | Yes — `expected 3 to be 1` | Byte-identical | The "too many" direction. Both are needed: a check that only proves ≥1 would pass a nudge storm |
| 45 | No nudge while **paused** | Removed the `state !== "running"` guard | Yes — `expected 1 to be +0` | Byte-identical | See the note below — this drill was initially green |
| 46 | `reminder.minutes = 0` means off | `<= 0` → `< 0` | Yes — `expected 1 to be +0` | Byte-identical | |
| 47 | The registered click callback opens the popover | Removed the `onOpenPopover` call | Yes — `expected "vi.fn()" to be called 1 times, but got 0` | Byte-identical | Tests the app's own wiring; see F9 for whether the OS ever invokes it |

### A drill that stayed green, and what it was actually saying

The implementer's first attempt at row 45 weakened the running-state guard and **all 19
tests stayed green**. Rather than force the drill red, it investigated and found the
cause: the existing paused test paused at 50 minutes, *under* the 60-minute interval, so
the elapsed arithmetic alone suppressed the nudge and the state guard was never
load-bearing. It added a case that runs past the interval and *then* pauses, which only
passes if the guard itself works, and re-ran the same sabotage — genuinely red.

This is the behaviour the trap list asks for: a drill that will not go red is evidence
about the test, not an obstacle to the drill.

### F9 — the spec assumes a desktop notification click that this plugin cannot deliver

`BUILD_SPEC`'s gotcha says notification **action buttons** are mobile-only and that
"clicking one opens the popover". The second half does not hold for
`tauri-plugin-notification` 2.3.3 on desktop, verified at the mechanism rather than from
docs:

- The installed crate's `src/desktop.rs` exposes exactly `init`, `show`, `builder`,
  `request_permission`, `permission_state`, `body`, `title`, `icon`, `sound`, `notify`.
  There is **no click, action, or activation handling anywhere in the crate's Rust**.
- The JS `onAction(cb)` subscribes to a plugin event named `actionPerformed`.
- That event string appears nowhere in the crate's Rust source — it is emitted only from
  the iOS and Android backends.

So on macOS and Windows, `onAction()` registers a listener for an event that is never
fired. Clicking the notification will do nothing.

**This is not a defect in S8.** The controller wiring is correct and independently
drilled (row 47), the click path is isolated to one file
(`src/reminders/tauriNotificationDriver.ts`), and `onAction` is the only click-related
API the plugin exposes. The feature also degrades gracefully: the nudge still appears,
and the popover remains reachable by tray click or shortcut.

It is a **spec-versus-platform conflict for Ben to settle**, and it must be the *first*
thing checked at S14 — before the "calm nudge" rubric, because if a real click does
nothing the remedy is a different mechanism (a Rust-side click delegate, or a different
notification path), which is an architecture decision rather than a bug fix.

## S9 — away-gap recovery

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 48 | **The boundary is strict**: exactly 5m00s ignored, 5m01s triggers | `>` → `>=` | Yes — `expected 'paused' to be 'running'` | Byte-identical | The highest-value drill in the slice. A `>=` slip passes any loose test and silently steals five minutes of real work |
| 49 | The threshold is pinned at **5 minutes** | `5 * 60 * 1000` → `60 * 1000` | Yes — `expected 60000 to be 300000` | Byte-identical | Guards the constant itself, not just the comparison |
| 50 | The trim lands at the **last heartbeat**, not at *now* | Passed `new Date()` to `pauseAt` instead of the heartbeat | Yes — `expected '2026-08-22T11:33:40.755Z' to be '2026-08-21T09:00:00.000Z'` | Byte-identical | This is the whole point of the slice: the user must not be billed for time they were away |
| 51 | `pauseAt` honours the **given** timestamp | Substituted the clock for the passed value | Yes | Byte-identical | The engine primitive underneath row 50 |

### Two drills that behaved unexpectedly, and were handled rather than forced

The implementer hit trap (f) twice and got both right:

- **The `state !== "running"` early return**: removing it left all 19 tests green. Rather
  than manufacture a failing test, it traced why — the engine's own invariant keeps
  `state` and "current entry has an open segment" in lockstep on every reachable path,
  so a defensive check a few lines below independently catches everything the guard
  would. It kept the guard as a cheap short-circuit but **rewrote the comment to say so
  honestly** instead of implying coverage it does not have.
- **`discard()` must not auto-resume**: the first sabotage stayed green because the
  sabotage was a fire-and-forget async call and the test asserted synchronously, before
  the microtask landed. It identified its own drill as invalid, fixed the test's timing,
  and re-ran — genuinely red. An invalid drill reported as a finding would have been
  worse than no drill.

### Design reading recorded for Ben

**Keep** undoes the trim outright — the away span counts as worked time and the timer
resumes ticking live. **Discard** does nothing further: the segment was already trimmed
at auto-pause, and discard deliberately does **not** auto-resume, because the point of
the prompt is to let the user decide rather than silently restart a clock.

The prompt lives **in the popover**, not a new window, on the same reasoning the spec
already applies to Continue/Switch/Stop. When it is showing, the banner **replaces** the
normal action row rather than layering over it — otherwise a Resume click could open a
new segment underneath a pending prompt.

## S10 — exports

The anti-Goodhart slice. The spec requires the golden fixtures to be hand-authored from
the pinned format rules *before* the export code exists, and says that if code and
fixture disagree, **the code is wrong**.

An implementer writing both the fixture and the code can satisfy that in letter while
defeating it in substance, and the result is indistinguishable from success. So the
authorship was split: **the coordinator hand-wrote all six fixtures from the spec and
committed them in a commit containing no `src/export/` at all**, making the ordering a
fact in git history rather than a claim in a report. Every duration and total was
re-derived by an independent computation before being written down.

Confirmed after the slice: the six fixtures are **byte-identical** to the committed
versions, compared file by file rather than by `git diff` alone.

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 52 | Empty client/project render the pinned `—` (U+2014) | Replaced the em dash with a hyphen | Yes — golden mismatch | Byte-identical | A hyphen is visually near-identical and would never be caught by eye |
| 53 | The `Total:` line is a real **sum** | Made it take the last row's value instead of accumulating | Yes — golden mismatch | Byte-identical | Passes trivially on a one-row fixture; both fixtures have two rows for this reason |
| 54 | ISO offset sign convention | Flipped `+`/`-` | Yes — golden mismatch on the CSV | Byte-identical | `-07:00` vs `+07:00` is a 14-hour error that looks like a typo |

A test genuinely shells out to `diff -q` via `execFileSync`, as the spec names, rather
than only comparing strings in-process.

### Determinism: the timezone had to be pinned, and that was found by authoring

`first_start`/`last_end` are *local-timezone* ISO8601 **with offset**, so the fixtures
carry `-07:00`. On a UTC CI runner that becomes `+00:00` and **every** golden comparison
fails, on both platforms, for a reason that reads as a formatting bug and is not.

Pinning `TZ=America/Los_Angeles` in the vitest environment is therefore part of the
slice, with `timezonePin.test.ts` asserting the pin is actually in effect — offset 420,
resolved zone, and a fixed instant rendering `09:00` — so it cannot silently lapse into
machine-dependence.

### A drill that stayed green, and a limitation that is the coordinator's

**Round-half-up did not go red at the golden level.** The implementer investigated
rather than forcing it, and the diagnosis is correct: **all six fixtures use
whole-minute durations**, so floor and round-half-up agree on every row. The rule is
genuinely covered by unit tests (`5m30s → 6`), but the goldens do not exercise it.

That is a weakness in the **coordinator's fixture authoring**, not in the
implementation — the fixtures should have included a fractional-minute duration. The
spec already anticipates the gap: landing check **L2** has the landing session
hand-author a third, held-out fixture, which is the right place to close it, and this
row is the note to make sure that fixture includes a non-whole-minute duration.

### F10 — native date/time inputs follow the OS locale, and for dates that can mislead

S7 recorded that `<input type="time">` renders in the OS locale rather than the app's,
so choosing Spanish in Settings on an en-US machine shows AM/PM inside the picker while
the surface around it is 24-hour. S10's design review reported the export UI clean, and
its own screenshot shows the same class one step worse: the CSV/JSON range pickers
render **`08/20/2026`** — US `MM/DD/YYYY` — inside an otherwise fully Spanish surface
("Desde", "Hasta", "Exportar CSV").

The time case is cosmetic. **The date case is not.** A Spanish-primary user reading
`08/09/2026` as 9 August when the control means 8 September will export the wrong range
and not know it. The output would be internally consistent and quietly wrong — the same
shape as every other finding in this file.

Both share one cause (a native control's display format comes from the OS, with no
standard HTML way to override it) and one remedy (custom pickers), so they are one
decision, not two. Recorded together for **S12/S13b**, where the language setting and
the Spanish layout audit land.

Worth noting for the record: the automated design review looked directly at this and
called the surface clean. It checked what it was asked to check — truncation, tokens,
state design, focus — and a US date format inside a Spanish UI is none of those. The
finding came from reading the screenshot without a checklist.

## S11 — Insights (v1-lite)

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 55 | Biggest tasks key on the **full `(name, client, project)` tuple** | Grouped by name alone | Yes — `expected […] to have a length of 2 but got 1` | Byte-identical | The fixture deliberately contains two entries named "Acme onboarding" under different tags; grouping by name silently merges real work |
| 56 | Percentages divide by the **week total**, not the tagged subtotal | Forced the percent to 100 | Yes — `expected 100 to be 50` | Byte-identical | Excluding untagged time from the denominator is a plausible-looking bug that inflates every share |
| 57 | The week starts **Monday**, in local time | `daysSinceMonday` → `getDay()` (Sunday-start) | Yes — the whole day list shifts by one | Byte-identical | Deterministic only because S10 pinned `TZ` |

The three pinned values are asserted verbatim, and the two-week fixture does real work:
the Tuesday test notes that week A's Tuesday *alone* would sum to 12h, so a broken
current-week filter cannot pass. The scope limit is tested as a **positive count** —
`.insights__views` must have exactly three children, plus zero text inputs and zero
spinbuttons — so a mistyped selector cannot manufacture a passing absence.

**Arithmetic re-derived independently by the coordinator** from the rendered day totals
rather than trusting the fixture: week total 14h 55m (895 min); @acme 555/895 = 62%,
@beta 270/895 = 30%, #rollout 62%, #core 210/895 = 23%, #discovery 60/895 = 6.7% → 7%
under round-half-up. All five match, and the bar widths are proportional (5h 15m ÷
6h 30m = 81%, rendered at ~80%).

### A drill that was only partly load-bearing, diagnosed rather than forced

Breaking round-half-up to `Math.floor` left the pinned **62%** and **30%** green — those
two values happen to floor to the same integer in this fixture. The implementer noticed
and traced it rather than declaring the rule covered: the **7%** case (6.7 floors to 6)
and the `formatDuration` family caught it for real. Worth recording because it is the
same shape as S10's round-half-up gap — a pinned example can be satisfied by the wrong
rule when the example does not straddle a boundary.

### An open UX question, correctly flagged rather than silently resolved

Client and project shares **do not sum to 100%** when untagged time exists — 62% + 30% =
92% in the fixture, the missing 8% being an untagged entry. This is exactly what the
spec's formula says (denominator = week total), and the implementer left it as specified
rather than inventing a fourth row, since decisions #27 flags Insights as the first thing
cut if polish is at risk. But a user glancing at it may read a math error rather than
"untagged time has no row." **Ben's call at S14** — a one-line note or an "untagged" row
would resolve it, and both are scope additions.

## S12 — Settings

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 58 | Theme applies **live** to the DOM | Removed the `setAttribute("data-theme", …)` | Yes — `expected null to be 'light'` | Byte-identical | "Without restart" is the acceptance criterion; persistence alone would fail it |
| 59 | Language resolves the **explicit** choice over the system locale | Dropped the explicit-choice branch | Yes — `expected 'es' to be 'en'` | Byte-identical | |
| 60 | The update check opens the **pinned URL** | Changed the constant to a wrong address | Yes — **after F11 was fixed**; it stayed green before | Byte-identical | See F11 |
| 61 | The reminder's **Custom…** option stays reachable | Neutered the local `customMode` state | Yes | Byte-identical | The implementer's own find, by using the surface rather than reading it |

### F11 — a test that could not detect the thing it was named for

The update-check test asserted `expect(openUpdatePage).toHaveBeenCalledWith(PINNED_UPDATE_URL)`,
importing the same constant the implementation uses. That is **tautological**: whatever
the constant says, both sides move together and the assertion passes. It proves the
wiring — that *an* opener call happens with *the* constant — but it cannot detect a
**wrong URL**, which is exactly what the spec's acceptance line ("invokes the opener with
the pinned URL") is asking for.

Found by a coordinator drill that changed the constant to `https://example.com/wrong`
and **stayed green**.

This mattered more than usual: the URL is a **placeholder the implementer explicitly
flagged as needing Ben's confirmation**, because neither `BUILD_SPEC` nor `decisions.md`
pins a literal address. A provisional value guarded by a test that cannot see it change
is the worst combination available.

Repaired by asserting a **literal** URL, plus a consistency check that the exported
constant agrees with it. Changing the constant now fails. If the address ever needs to
change, that is a deliberate decision about where users are sent, and it now requires
editing a test.

The same shape recurs throughout this file: F7's `grep -v "var("`, S9's fire-and-forget
drill, S10 and S11's round-half-up. **A check written in terms of the thing it checks
cannot fail.**

### Two items recorded for Ben rather than decided

- **The update URL is unconfirmed.** `https://github.com/benshapyro/tiny-time-tool/releases/latest`
  is inferred from decision #33 (GitHub Releases) and the repo name in `goal-prompt.md`.
  Decision #38 mentions a Drive link instead. Nothing else depends on the literal; it is
  a one-line change plus the test literal above.
- **Teach-line staleness after an in-session rebind.** `LogController` and
  `PopoverController` each cache the primary accelerator at construction, so rebinding
  updates Settings and the OS registration correctly while the popover and empty-Log
  teach lines still name the old shortcut until restart. The S12 acceptance row names
  only language and theme for live-swap, so this was judged scope growth rather than a
  stated requirement — but it is real and findable.

### F12 — five bugs in S12, and the one that proves units cannot see seams

The review found five real bugs in S12. None were contested. The first is the one worth
studying.

**The language setting never reached the controllers.** `bootstrap.ts` still carried
`const LOCALE: Locale = "en"` with a comment saying "until S12 lands" — and this *was*
S12. Five controllers pre-format locale-sensitive strings into their state: the
notification title and body, the Log empty-state teach line and edit errors, the popover
teach line and away prompt, Insights weekday and percent labels. Switching `useLocale()`
in the React layer cannot repair text that was already baked. Choosing Español left all
of it in English — and so did restarting with Spanish already persisted. That is the S12
acceptance criterion, not merely the "without restart" half of it.

**The coordinator's own drills passed.** Rows 58 and 59 broke `applyTheme` and
`resolveLocale` and both went red correctly. Those functions were never the problem. The
wire between them and the controllers did not exist, and **no unit-level drill can see
an absent wire** — the drill proves a function *can* fail, not that anything calls it.

Fixed with a `setLocale` seam on all five controllers, a real `getLanguageSetting` +
`resolveLocale` read at boot, and `applyLocaleLive` invoked from the language action. The
new `applyLocale.test.ts` wires all five against a real SQLite engine and asserts that
**already-baked** state flips — coordinator-drilled by neutering `setLocale` on one
controller: `expected 'Press Ctrl+Shift+Space to start tracking' to match /pulsa/i`,
which is the shipped bug's exact symptom.

The other four, all real:

- **The Settings tab showed defaults on first open.** The state event fires once at boot;
  the tab mounts later (Log is the default tab) and Tauri does not replay to late
  listeners. Fixed with a `requestState` action dispatched *after* the listener resolves.
  The missing handler is now a **compile** error, via the file's exhaustive-`never`
  switch — deleting the case fails `tsc` with `TS2322`.
- **Clearing the reminder field silently turned reminders off** — `parseInt("")` → `NaN`
  → `0`, and `0` means off. Selecting the digits to retype is a normal edit, not a
  request to disable reminders.
- **The shortcut-rebind capture surface could never receive a keypress.** React's
  `autoFocus` only applies to host form elements, not a `<div role="button">`. Every
  existing test passed because they dispatched synthetic events straight at the node; the
  new test asserts `document.activeElement` actually *is* the surface.
- **An autostart rejection escaped unhandled — in two places, not the one reported.** The
  implementer found the second: `SettingsController.create()`'s boot-time reconciliation,
  which `bootstrap` awaits before every other controller. A single denied LaunchAgent
  write would have broken the whole app's boot, not just autostart.

**Five of the last seven findings in this file came from seams, not units** — popover→tray
(S5), switch-commit→tray (S6), away-prompt→shortcut exits (S9), and language→controllers
here. Every one had passing unit tests on both sides of the gap.

## S13a — localization completeness

Two new gates, bringing the mechanical total to six. Both were drilled by the
coordinator **against the real catalogs and real components**, not only fixtures — the
lesson of F7, where a check validated only against its own fixtures passed for three
slices while missing fourteen real violations.

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 62 | An `es` value **identical to `en`** is an untranslated placeholder | Set `tray.quit` to `"Quit"` in the real `es.ts` | Yes — `"tray.quit" is identical to the en value ("Quit") — untranslated, or add it to IDENTITY_ALLOWED with a reason` | Byte-identical | The type system cannot see this: `es.ts` is `Record<TranslationKey, string>`, so a *present but untranslated* value type-checks fine |
| 63 | Hardcoded **JSX text** must come from `t()` | Replaced a real `{t(locale, …)}` child with literal copy | Yes — `Settings.tsx:135: hardcoded text "Press any key now"` | Byte-identical | Parsed with the TypeScript compiler API, not regex, so "child vs attribute" is answered by the grammar |
| 64 | Hardcoded **user-facing attributes** must come from `t()` | Added `placeholder="Type here"` to a real input | Yes — `Settings.tsx:203: hardcoded placeholder="Type here"` | Byte-identical | `className`, `data-testid` and `role` are deliberately not text |

### What the new gates found on their first run against real code

**The hardcoded-strings lint found zero violations** across twelve slices of UI. That is
a genuine zero rather than a vacuous one — the lint was drilled three separate ways
against real components immediately afterwards and fires precisely each time. The rule
held because every slice brief demanded it and the per-slice design reviews checked it;
this makes it mechanical rather than a matter of continued diligence.

**The coverage check found something better than a missing translation.**
`settings.autostart.title` existed in **both** catalogs with **nothing rendering it** —
an orphaned key that turned out to mark a **missing UI element**: the autostart group had
no heading while every other group in Settings had one. Found by the unused-key half of
the check, not by eye. A translation that nothing displays is usually a sign the display
is missing, not the translation.

### The tray gap was closed, not allowlisted

`tray.rs` hardcoded its menu labels and tooltips in English because the native menu is
built before the webview's JS runtime exists. That was defensible until S12 shipped the
language setting and made it reachable: a Spanish app with an English tray menu.

Rather than allowlist it, S13a added a `TrayLabels` struct and a `set_tray_labels`
command, with TS resolving the labels per locale and pushing them at boot and on every
language change. The English strings that remain in `tray.rs` are `Default::default()` —
the pre-JS fallback for the first instants of launch, documented as such.

## S13b — Spanish layout resilience

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| 65 | Real `es` strings fit their surface at its real width | Narrowed the popover constant from 320 to 120 | Yes — `320px popover, .popover__actions: Reanudar / Cambiar / Detener needs 266.3px of 88px` | Byte-identical | The English equivalent needs 223.4px. **A 19% difference, measured** — exactly what principle 7 is about |

### The mechanism, and why it is not vacuous

The obvious implementation of this slice is a trap. **`scrollWidth > clientWidth` is
always false in jsdom** — jsdom does not lay out, so both are `0`. A suite asserting "no
element overflows" would pass on an empty div, a missing component, or a catastrophically
broken one, and would look exactly like a clean audit. That is the F1/F7/F11 shape, and
this slice was the last chance to catch Spanish layout problems before the human gate.

What was built instead: a per-character text-width model **calibrated against real Chrome
measurements of whole strings** — both locales, every font size the components use — with
enforced error bounds (the model may under-report by at most 0.5%, and its upper bound
may never be narrower than Chrome). Surface widths come from `tauri.conf.json` and the
dashboard min-width token. The budgets then compare real `es` catalog strings against
real available space.

It can fail, and was made to: see row 65.

### F13 — the panel's height model had drifted from its own stylesheet

`panelHeight.ts` was written in S4 to fix F5, where the quick-entry panel sliced its
suggestion list in half. It computed the height correctly **for the constants it
believed**. Three of those constants had since stopped matching `quickEntryPanel.css` —
and **all three were wrong in the unsafe direction**. The panel rendered **26px shorter
than its own Spanish content**, slicing the third suggestion row in half again.

Most instructive: `CHILD_GAP` was set to `--space-2` (8px) when the stylesheet uses
`--space-3` (12px), and it was counted **once** when the CSS applies it between *every*
pair of children.

This is F5 recurring in the same component, by a different route. The first fix was
correct when written; nothing kept the arithmetic and the stylesheet in agreement
afterwards. Every constant is now re-derived from the CSS and cross-checked against
Chrome, and documented as an **upper** bound — over-estimating costs a few pixels of
empty panel, under-estimating loses a row.

### A coordinator drill that was itself a fake break

The first attempt at row 65 **stayed green**. The sabotage had changed only a *comment*
naming the width, not the executable constant — `perl -0p` without `/g` replaces the
first match, and the first match was prose. That is traps (b) and (d) from the standing
list, hit simultaneously, by the coordinator who wrote the list, because the drill was
run ad hoc instead of through the harness whose comment-only guard exists to catch it.

Recorded because the lesson is not "be careful": it is that **the guard only works when
it is used**, and convenience is what routes around it.

## The three rules this table exists to enforce

**A fake break proves nothing.** Editing a comment, renaming an unused variable, or
touching a line the check never reads produces a green run that is indistinguishable
from a passing test. The break has to change the *behavior under test*. If the check
stays green, the first thing to suspect is your break, not the check.

*(Enforced mechanically here: the drill harness `cmp`s the file against its backup after
applying each sabotage and aborts the drill as invalid if the file is unchanged, so a
no-op "break" cannot be scored as a passing row.)*

**Never repair a failing check by narrowing it.** The cheapest way to turn red green
is to make the check look at less, and it is almost always wrong. When a check fires,
ask whether it's *imprecise* (fix the check) or *inconvenient* (fix the code).
Narrowing under deadline pressure is how a privacy check that would have caught real
data quietly becomes a field-name blocklist that catches nothing.

**The checks most worth breaking are the ones guarding things that never happen.**
A calculation check runs on every case and exercises itself constantly. A "no client
data in the bundle" check runs against an *absence* — it can be broken for the entire
life of the project and nothing will ever tell you. Compliance, privacy, data-boundary,
and permission checks all have this shape, which is why they're the highest-value rows
in this table. Rows 2, 3, 4 and 5 are exactly that shape, and row 5 was in fact broken.

## Verdict

*Interim — S1 through S13b; all implementation slices complete. Rows accumulate as slices land; this section is rewritten each time.*

- Checks verified: **65 of 65** (12 S1, 6 S2, 7 S3, 6 S4, 4 S5, 3 S6, 4 S7, 5 S8, 4 S9,
  3 S10, 3 S11, 4 S12, 3 S13a, 1 S13b), every one re-run by the coordinator rather than
  inherited from an implementer's report. Six mechanical gates now run in CI:
  zero-network, deps-allowlist, browser-safe imports, design tokens, i18n coverage,
  and no-hardcoded-strings.
- Found broken and repaired: **11** — F1 (both Windows zero-network gates vacuous),
  F2 (CRLF disabling the Windows test suite), and F3 (unclosed SQLite handles failing
  `rmSync` with EPERM on Windows — invisible on macOS, already copied into S3, caught
  by CI within minutes of the repo going public), F4 (`node:crypto` in the frontend
  bundle — the shipped app could not render, and every existing gate passed it), and
  F5 (the panel clipped its own suggestion list, found by looking at a screenshot), and
  F6 (the first-launch teach line showed the raw Tauri token `CmdOrCtrl+Shift+Space`),
  F7 (three slices of "tokens only" certified by a check that could not see literals),
  and F8 (the Dashboard repainted yesterday after midnight).
  **Five of the eight were found by looking at a screenshot, reading a mechanism, or
  reading across module boundaries — not by a failing test.** That ratio has held
  steady for five slices and is the strongest argument for keeping all three practices.
  F7 is the sharpest: the failing check was the coordinator's own, and it had already
  been contradicted once before anyone thought to test the check itself. **F12 is the
  most instructive**: the coordinator's drills all went red correctly and the slice still
  shipped five bugs, because a drill proves a function *can* fail and says nothing about
  whether anything calls it.
- Open, recorded, awaiting Ben: **F9** (desktop notification clicks are not deliverable
  by this plugin) and **F10** (native date/time inputs follow the OS locale, so a
  Spanish user can misread an export range). Neither is a defect in the slice that
  surfaced it; both are decisions rather than fixes.
- Open spec-versus-platform conflict: **F9** — the spec assumes clicking a desktop
  notification opens the popover, and `tauri-plugin-notification` 2.3.3 emits no click
  event on desktop at all. Not a defect in S8; a decision for Ben, to be checked first
  at S14.
- Drills rejected as invalid before scoring: **6** — two in S2 (a no-op sabotage and one
  red for the wrong reason) and four in S3 (three no-ops plus a comment-only "break"
  that made a real check look unguarded). All redone. Recorded because a drill harness
  that cannot reject its own bad drills is the same failure as a check that cannot fail;
  the S3 batch is why the harness now rejects comment-only edits too.
- Unverifiable so far, with reason:
  - **The production SQLite path.** S2's tests run against a real SQLite file through
    Node's `node:sqlite`; the shipped app uses `tauri-plugin-sql` over Tauri IPC, which
    no CI-safe test can reach. Both share one migration file (`0001_init.sql`) and plain
    `?` placeholders, so the dialect surface is identical, but the production driver is
    exercised only by compilation until a later slice wires the UI to it. Named risk,
    not a passing check.
  - **Day attribution on a UTC machine.** Row 15's drill is only meaningful on a
    non-UTC host (verified `PDT` here). A UTC CI runner would pass it vacuously.
  - Human-rubric and live-app checks (S4/S5/S8 manual, S14, S15's Drive step) are
    exempt per `Done #6` — graded by their named human.

Any check that could not be verified is an open risk, not a passing check.
