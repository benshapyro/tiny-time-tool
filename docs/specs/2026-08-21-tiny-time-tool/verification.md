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

*Interim — S1 only. Rows accumulate as slices land; this section is rewritten each time.*

- Checks verified: **12 of 12** in S1 scope (all re-run by the coordinator).
- Found broken and repaired: **2** — F1 (both Windows zero-network gates vacuous) and
  F2 (CRLF disabling the Windows test suite). These are the run's real findings so far.
- Unverifiable so far, with reason: **CI green on `windows-latest`** — in flight at time
  of writing; macOS is green with its `.dmg` artifact. The Windows Tauri build has never
  been compiled anywhere yet. Human-rubric and live-app checks (S4/S5/S8 manual, S14,
  S15's Drive step) are exempt per `Done #6` — they are graded by their named human.

Any check that could not be verified is an open risk, not a passing check.
