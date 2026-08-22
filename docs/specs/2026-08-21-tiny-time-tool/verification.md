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

*Interim — S1 through S7. Rows accumulate as slices land; this section is rewritten each time.*

- Checks verified: **42 of 42** (12 S1, 6 S2, 7 S3, 6 S4, 4 S5, 3 S6, 4 S7), every one
  re-run by the coordinator rather than inherited from an implementer's report.
- Found broken and repaired: **8** — F1 (both Windows zero-network gates vacuous),
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
  been contradicted once before anyone thought to test the check itself.
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
