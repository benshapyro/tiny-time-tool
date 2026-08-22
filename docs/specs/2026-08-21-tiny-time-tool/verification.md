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

*Interim — S1, S2 and S3. Rows accumulate as slices land; this section is rewritten each time.*

- Checks verified: **25 of 25** (12 in S1, 6 in S2, 7 in S3), every one re-run by the
  coordinator rather than inherited from an implementer's report.
- Found broken and repaired: **3** — F1 (both Windows zero-network gates vacuous),
  F2 (CRLF disabling the Windows test suite), and F3 (unclosed SQLite handles failing
  `rmSync` with EPERM on Windows — invisible on macOS, already copied into S3, caught
  by CI within minutes of the repo going public).
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
