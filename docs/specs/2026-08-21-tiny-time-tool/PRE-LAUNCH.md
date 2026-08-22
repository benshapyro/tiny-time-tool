# Pre-launch — tiny-time-tool

What the run needs from a human **before** it starts, derived line-by-line from `Done =`. Rows marked *(verified this session)* were pre-run by the prep session on 2026-08-21; the **need** rows are yours.

## Derivation

| Done line | What it needs | Status | Owner | Due | How to get it | Proof it works |
|---|---|---|---|---|---|---|
| `cargo test` green; local Tauri build | Rust toolchain | have *(verified 2026-08-22: rustup-managed cargo 1.88.0; added to fish PATH via `fish_add_path`)* | — | — | — | `cargo --version` → 1.88.0 in a login shell |
| `npm test` green | Node + npm | have *(verified this session)* | — | — | — | node v26.7.0, npm 11.19.0 |
| local `.dmg` build (S1, S15) | Xcode CLT | have *(verified this session)* | — | — | — | xcode-select → Xcode 17 clang |
| CI green on both platforms | GitHub repo + authed `gh` | have *(verified 2026-08-22: `gh api user` → benshapyro, exit 0)* | — | — | — | Note: gh's token lives in the macOS keychain, which the sandbox can't read — sandboxed `gh` calls report "invalid token" falsely; the run's gh calls need the unsandboxed approval (one prompt, at repo creation) |
| CI produces installers | GitHub Actions enabled on the new private repo | have (default on new repos) | — | — | — | first CI run visible after initial push |
| S15: installers in shared Drive folder | a Drive folder + stable share link | **need** | Ben | before S15 (~end of run) | create folder in Cadre Drive, copy link | link opens for a teammate who isn't Ben |
| Landing L4: Windows smoke test | Ben's Windows device available | have (Ben confirmed owning one) | Ben | at landing | — | performed at landing |
| Landing L1: stranger install test | one teammate volunteered (either OS) | **need** | Ben | by landing day | ask in Slack | teammate named |
| Golden-path e2e + L3 screenshots | screen-capture on this Mac (screencapture is built-in) | have | — | — | — | runs at landing |

Notes: no API keys, no cloud env vars, no dashboard toggles — the zero-network, local-only design deletes those whole categories. Test-runner installs (`npm ci`, vitest/Playwright as devDependencies) happen inside the run itself via S1.

## Added at spec-close (cold read 2 + sandbox check)

| Done line | What it needs | Status | Owner | Due | How to get it | Proof it works |
|---|---|---|---|---|---|---|
| whole run | Rust registries in sandbox network allowlist | **need** | Ben | at launch | allow `crates.io`, `static.crates.io`, `index.crates.io` via `/sandbox` or the first permission prompt | first `cargo fetch` succeeds |
| spec-is-canonical constraint | deny rules | resolved — Ben declined (2026-08-22); constraint is advisory | — | — | — | spec wording updated to match |
| CI green (repo exists) | repo account/org confirmed | have — `benshapyro/tiny-time-tool` (Ben, 2026-08-22) | — | — | — | goal prompt names it |

## Gate schedule (decide to walk away, don't drift away)

- Approval gates in this run: **3** — after S1 (CI green + installers, ~15–30 min in), after S5 (popover screenshots vs. design principles — the cheap moment to catch wrong-looking UI, roughly 2–4 h in), at S14 (full design sign-off, near the end).
- Longest expected unattended stretch: S6–S13, likely several hours.
- Wall time runs roughly 5× thinking time (installs, builds, CI waits). This is plausibly a full-day run; the escalation valve and turn cap bound it.

## Ready to launch

- [ ] Rust installed (`cargo --version` passes)
- [ ] `gh auth status` valid
- [ ] Drive folder link exists (can trail until S15, but don't let it stall the finish)
- [ ] Stranger-test teammate named (needed at landing, not launch)
- [ ] Gate schedule read — you know when you're needed
