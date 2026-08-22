# The Tiny Time Tool — Build Spec

**Outcome.** Cadre's solution-side team (PM, AI strategist, AI engineers, forward-deployed engineers) reconstructs their time from memory at day- or week-end — or asks an AI to guess it — so project-costing data is inaccurate; give them a tracker so frictionless (one shortcut, 2–3 seconds) that time gets captured live, on the day the work happens.

**Done =**
1. `npm test` and `cargo test` green (all slice acceptance tests below, written failing first).
2. GitHub Actions CI green on `macos-latest` and `windows-latest`, producing a `.dmg` and a Windows `.msi`/`.exe` installer as artifacts.
3. The S15 golden-path script exits 0 on macOS: it drives the flow start → name → pause → resume → stop **by invoking the app's internal shortcut-handler via a test-only Tauri command** (real OS shortcut delivery cannot be synthesized reliably by a script; it is verified by hand at the S14 gate and landing L3), then asserts the entry appears in popover and Log state with the fixture-expected duration, and `diff -q` of the Copy-for-AI output against `fixtures/golden/copy-for-ai.md` exits 0. The test-only command is compiled out of release builds.
4. Zero-network checks pass (see Constraints — three named mechanisms).
5. i18n coverage check passes: every UI string key has both `en` and `es` values; the no-hardcoded-strings lint passes.
6. For each *machine-verifiable* constraint and acceptance check: deliberately break the thing it protects, observe the check fail, restore, and record the result in `verification.md`. A fake break (comment edit, untouched code path) does not count; never repair a failing check by narrowing it. Human-rubric checks (S8's calmness, S14, S15's Drive step) are exempt — they are graded by their named human, not broken mechanically.

**Constraints.**
- *Enforced — zero network requests by the app*, deny-by-default via three mechanisms the tests assert: (a) `tauri.conf.json` CSP pins `default-src 'self'` (blocking all remote loads — connections, images, fonts, everything) with no remote domain capabilities (golden-file test on the config); (b) dependency allowlist: CI fails if `Cargo.lock` or `package-lock.json` gains any dependency not listed in `deps-allowlist.txt` — new deps require a human-reviewed allowlist change in the same PR, and no crate/package providing network I/O is ever added; (c) source scan: CI fails on `std::net`, `std::process::Command`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` anywhere outside `src-tauri/src/os_integration.rs` (the one allowlisted plumbing file, which itself contains no network code). "Check for updates" opens the system browser via the opener plugin — the app itself never connects.
- *Advisory — build agent conduct* (Ben declined harness deny rules 2026-08-22; the spec says so honestly rather than claiming enforcement that doesn't exist): never edit `docs/specs/**` — the spec is canonical and changes come back to the human; no deleting tests; network limited to package registries, GitHub, and official docs (the sandbox allowlist is the one real mechanism here).
- *Advisory:* all UI strings through the i18n layer from the first commit — no hardcoded user-visible text; all styling through design tokens — no ad-hoc colors/spacing; TypeScript strict mode; Rust code stays thin (plumbing + OS integration), business logic in TS where testable.

**Non-goals.** No ClickUp integration (Copy-for-AI is the bridge). No sync, no server, no team/shared views. No activity or input monitoring. No auto-update. No telemetry or analytics. No billing rates or invoicing. No mobile. No PDF export. No code signing in v1 (bypass instructions in the install guide instead).

## Stories

| ID | Story |
|----|-------|
| ST1 | As a solution-team member, I want to start/pause/stop a timer with a keyboard shortcut in 2–3 seconds, so tracking never interrupts my work. |
| ST2 | As the same user, I want to optionally name the task (with autocomplete and client/project tags) or just hit Enter, so naming is never a toll. |
| ST3 | As a forgetful human, I want a light periodic nudge and automatic away-gap handling, so a forgotten timer doesn't poison my data. |
| ST4 | As the person entering time into ClickUp, I want to copy my day in an AI-readable block, so Claude/ChatGPT can file it for me. |
| ST5 | As the PM doing project costing, I want CSV/JSON export by date range, so the numbers land in a spreadsheet. |
| ST6 | As a user who mis-tracked, I want to edit or delete any entry on any day, so the record stays accurate. |
| ST7 | As a Spanish-primary teammate, I want the entire experience in Spanish, first-class, so the tool feels built for me. |
| ST8 | As any teammate, I want install-to-first-tracked-task to take under a minute without a GitHub account, so adoption is trivial. |

## Slices

| ID | Behaviour | Acceptance check (pass condition) | Run via | Verifier | Needs | Size |
|----|-----------|-----------------------------------|---------|----------|-------|------|
| S1 | Scaffold: Tauri v2 + Vite + React + TS strict, tray icon with menu (Open Dashboard, Quit), i18n layer (en+es) wired, design tokens file, CI workflow building both platforms. Tray icon has three pinned visual states — idle, running, paused (distinct at a glance; template-image treatment on macOS). On macOS the tray also shows title text beside the icon: ticking elapsed time while running, `⏸ {elapsed}` while paused, nothing while idle (Windows trays have no title text: icon state + tooltip carry it) | CI run green on both runners with `.dmg` + `.msi`/`.exe` artifacts; app launches to a visible tray icon; i18n smoke test renders one string in en and es; component tests: tray-state model maps idle/running/paused to the three pinned assets, and the title-text model maps running→elapsed, paused→`⏸ {elapsed}`, idle→empty | goal | tests + CI | — | M |
| S2 | Timer engine + SQLite persistence: entry/segment model (pinned below), state machine idle→running→paused→stopped, state survives app restart | Unit tests: fixture sequence start(10:00)→pause(10:20)→resume(10:30)→stop(10:45) yields duration 35m as two segments; kill-and-relaunch mid-run restores running state from disk | goal | tests | S1 | M |
| S3 | Global shortcuts: primary accelerator = start/pause/resume; stop = its own second registered accelerator (both defaults pinned in Pinned interfaces — there is no modifier-detection scheme); failed registration surfaces a visible warning and a rebind path (no silent failure) | Integration test: registered handlers drive the S2 state machine through the fixture sequence; simulated registration failure sets the warning flag | goal | tests | S2 | S |
| S4 | Quick entry panel: small centered always-on-top window on start; free text; Enter with empty input skips (auto-name = date + time window, format pinned below); autocomplete over recent task names after 2 chars; `@client` and `#project` tokens parsed per the pinned grammar. **When the panel opens (resolves S3/S4 interplay):** primary from idle → start + open panel; primary while running with the panel closed → pause without opening the panel (S3's toggle is sacred), with glanceable feedback: the tray flips to its paused state and the macOS tray title shows `⏸ {elapsed}` (Ben, 2026-08-22: pause must be visible, not modal); the panel also opens via the **Switch** action (popover button or reminder), and in that case shows the passive notice "Will stop: {name} ({elapsed})" — Enter switches (stops current, starts new); no confirmation dialog. Keyboard-only switch = stop shortcut, then primary. Tracking begins at the shortcut press, not at Enter — naming never costs time. Primary press while the panel is open = commit current text (as Enter) then pause. Focus-grab is the one researched risk here (macOS activation policy; Windows foreground-lock): S4 *begins* with a spike proving on macOS that the panel receives keystrokes when summoned over a frontmost third-party app, before the rest of the slice is built; Windows focus behavior is verified at the S14 manual check on Ben's Windows device (named residual risk until then) | Tests: empty-Enter creates a null-name entry displaying `Aug 21 · 10:00 AM–10:45 AM` in en-US and `21 ago · 10:00–10:45` in es (locale time formats pinned below); entry start time equals shortcut-press time, not Enter time; typing `Acme onboarding @acme #rollout` yields name/client/project split per pinned parse rules, and a second fixture `@acme deep-dive @beta #x` keeps `@beta` literal in the name; autocomplete returns the 2 matching fixtures for prefix "Ac"; panel opened via Switch with a running fixture timer renders the notice and Enter closes the old entry and opens the new one; primary while running with panel closed pauses without opening the panel; re-press-while-open commits text then pauses; wiring test: the S3 primary handler from idle opens this panel. Manual (both platforms, at S14 gate): panel receives keystrokes immediately when summoned over a frontmost third-party app | goal | tests + human | S2, S3 | M |
| S5 | Tray popover (glance surface): live ticking timer, today's entries with durations, day total, start/pause/**switch**/stop actions, Esc/click-away closes; paused state visually distinct from running and from stopped. On first launch the popover auto-opens once with the teach line "Press {primary shortcut} to start tracking" | Component tests (Vitest + Testing Library — CI-safe; Playwright cannot drive native Tauri windows): seeded fixture day renders 3 entries + correct total `2h 05m`; live timer ticks; empty state renders the teach line naming the shortcut; paused entry shows the pinned paused treatment; first-launch flag test: auto-open fires exactly once; a11y: every control keyboard-reachable with visible focus. Manual (live app, at S14 gate): popover opens anchored to the tray icon; Esc and click-away close it | goal | tests + human | S2, S4 | M |
| S6 | Dashboard · Log tab: today-first, date navigation to any day, entries with times/durations/tags, day total | Component tests: fixture DB renders the seeded day; date nav to a past fixture day shows its 2 entries; empty day shows the designed empty state naming the shortcut | goal | tests | S5 | M |
| S7 | Full editing in Log: rename, edit start/stop times, edit tags, delete (with undo toast), any day. Running entry: name/tags/start editable live; its end time is not editable until paused or stopped | Tests: each edit persists to SQLite and durations recompute; overlapping-times edit is rejected with the designed inline error; delete→undo restores the row byte-identical; running-entry fixture allows name/tag/start edits and exposes no end-time edit | goal | tests | S6 | M |
| S8 | Reminders: interval setting (default 60m, off/15/30/60/custom), native notification nudge while a timer runs; clicking it opens the popover with Continue / Switch / Stop | Tests (against a stubbed notification interface — CI runners have no notification permission, and real OS click delivery can't be synthesized): with a running timer and 60m elapsed (mocked clock) exactly one notify call fires; the registered click callback opens the popover when invoked directly. Manual (live machine, at S14 gate): a real notification appears, clicking it opens the popover, nudge is calm — no sound by default | goal | tests + human | S5 | M |
| S9 | Away-gap recovery: heartbeat timestamp persisted every 30s while running; the gap check runs on every heartbeat tick (wall-clock now − last stored heartbeat) and once at app launch — no OS sleep/wake events. Gap > 5m auto-pauses the entry retroactively at the last heartbeat and shows "Away Xh Ym — add it back?" (keep / discard); gap ≤ 5m ignored. Quit while running leaves state persisted (no prompt); the launch-time check reconciles it | Tests: fixture heartbeat log with a 9h12m gap trims the entry at the last heartbeat and queues the prompt; a 3m gap changes nothing; boundary fixtures — a gap of exactly 5m00s is ignored, 5m01s triggers; kill-9 relaunch reusing the 9h12m fixture trims the entry and queues the same prompt | goal | tests | S2 | M |
| S10 | Exports: Copy-for-AI (pinned markdown block), CSV by date range (pinned columns), JSON alongside. **Golden fixtures are authored by hand from the pinned format rules BEFORE the export code is written**; if code and fixture disagree, the code is wrong — fixtures are never regenerated from output | Golden-file tests: seeded fixture day → `diff -q` against `fixtures/golden/copy-for-ai.md`, `export.csv`, `export.json` exits 0; a second variant fixture (different day, unnamed entry, Spanish task name, null client) also matches its hand-authored goldens — no special-casing fixtures | goal | tests | S7 | M |
| S11 | Dashboard · Insights tab, v1-lite: exactly three views — this week's hours by day; share by tag (per client and per project, percentage = tag duration ÷ current-week total, round-half-up to integer); biggest tasks (entries summed by exact (name, client, project) tuple, top 5 by summed duration). No date-range builder | Tests: seeded two-week fixture yields pinned values (Tue = 6h 30m; @acme = 62%; top task = "Acme onboarding — 9h 15m" as the summed tuple); nothing renders beyond the three views | goal | tests | S6 | M |
| S12 | Dashboard · Settings: shortcut rebind, reminder interval, language (OS/en/es), appearance (OS/light/dark), launch-at-login toggle (default on), version + "Check for updates" (opens download page in system browser) | Tests: each setting persists and applies without restart (language + theme swap live); update-check invokes the opener with the pinned URL — asserted as an opener call, not a network request | goal | tests | S5 | M |
| S13a | Localization completeness: full es translation, no-hardcoded-strings lint | i18n coverage script exits 0 (every key has en + es); lint green | goal | tests | S5–S12 | S |
| S13b | Layout resilience audit in es across popover, quick entry, Log, Insights, Settings | Component-level overflow assertions: no element where `scrollWidth > clientWidth` (or equivalent clipped-text check) with es strings loaded, per surface; agent screenshot review confirms no visual truncation | goal | tests + agent-review | S13a | M |
| S14 | Design-system polish pass + install guide: every surface audited against the Design principles below in light + dark × en + es; install guide (en + es) with per-platform unsigned-app bypass steps, written to the same design bar. This gate also runs the accumulated Manual checks from S4, S5, S8 live, including real OS shortcut presses | Named human rubric: Ben scores each principle pass/fail on a screenshot set (all surfaces × 2 themes × 2 languages); all pass. Manual-check list from S4/S5/S8 all pass live. Guide: a checklist walkthrough succeeds on a clean machine | goal | human | S13b | M |
| S15 | Release v0.1: golden-path e2e script (mechanism pinned in Done #3 — internal shortcut-handler invocation via a test-only command), tag, CI Release with both installers, artifacts copied to the shared Drive folder | E2e script passes on macOS locally; GitHub Release exists with both artifacts; Drive folder contains both installers + install guide (human copies, checks off). The landing session independently reviews the script's assertions against this spec before trusting its green | goal | tests + human | S14 | S |

## Context bundle

- *Always-loaded (`CLAUDE.md` — a deliverable of S1):* build/test/run commands; the zero-network constraint and its three mechanisms; the i18n and design-token advisory rules; the three gotchas below; pointer to this spec as canonical.
- *Gotchas (verified this session against Tauri v2 docs via context7 unless noted):*
  - **Notification action buttons are mobile-only in Tauri's notification plugin** — desktop notifications are nudge-only; Continue/Switch/Stop live in the popover the notification opens. Do not attempt notification actions on desktop.
  - Global shortcuts come from `tauri-plugin-global-shortcut` (official); tray + menus are core Tauri v2 (`TrayIconBuilder`). `CmdOrCtrl` maps Cmd on macOS / Ctrl on Windows.
  - SQLite via the official `tauri-plugin-sql`; launch-at-login via official `tauri-plugin-autostart`; browser-open via official `tauri-plugin-opener`. *(autostart/opener plugin names recalled, not verified — verify against the plugins workspace docs before S1 pins them.)*
- *Pinned interfaces (parallel slices must not diverge):*
  - `TimeEntry { id: string(uuid), name: string | null, client: string | null, project: string | null, createdAt: ISO8601 }` with `Segment { id, entryId, startedAt: ISO8601, endedAt: ISO8601 | null }` — duration = sum of segments; `name: null` displays as the localized `date · start–end` auto-name, stored as null (not baked in), so display stays localized.
  - Parse rules for quick entry: a tag token matches the regex `(?<=^|\s)([@#])([\p{L}\p{N}_-]+)(?=\s|$)` — whitespace-delimited, anywhere in the string; letters (accented included), digits, hyphen, underscore; no multi-word tags. First `@` token → client, first `#` token → project; matched tokens are removed from the name; any later `@`/`#` tokens stay literal in the name. Remainder trimmed → name; empty remainder → null name.
  - Auto-name display format (for null-name entries; rendered at display time, never stored): `{localized short date} · {start}–{end}` with an en-dash. Times on all **display surfaces** follow the user's OS locale and local timezone (en-US: 12-hour with AM/PM; locales that conventionally use 24-hour, incl. es-ES, get 24-hour). en-US: `Aug 21 · 10:00 AM–10:45 AM`; es: `21 ago · 10:00–10:45`. Localized short date via the i18n layer's date formatter (`MMM d` / `d MMM` per locale). **Data exports keep fixed unambiguous formats** (CSV/JSON ISO8601; Copy-for-AI table 24-hour) — display follows the human, data stays machine-stable. (Ben, 2026-08-22.)
  - Copy-for-AI block — the literal shape (the hand-authored golden fixture repeats this exactly; empty client/project cells render `—`; durations as `Xh Ym`, zero hours as `Ym`):

    ```
    Time entries for 2026-08-21 — file these into my time tracking system.

    | task | client | project | duration | start | end |
    |------|--------|---------|----------|-------|-----|
    | Acme onboarding | acme | rollout | 1h 30m | 09:00 | 10:30 |
    | Aug 21 · 11:00–11:45 | — | — | 45m | 11:00 | 11:45 |

    Total: 2h 15m
    ```
  - CSV columns, one row per entry: `date, task, client, project, duration_minutes, first_start, last_end`. `date` = `YYYY-MM-DD` (local); `duration_minutes` = integer, round-half-up; `first_start`/`last_end` = local-timezone ISO8601 with offset (e.g. `2026-08-21T09:00:00-04:00`); empty client/project = empty cell. JSON export mirrors the same fields and formats.
  - Settings keys: `shortcut.primary` (default `CmdOrCtrl+Shift+Space`), `shortcut.stop` (default `CmdOrCtrl+Shift+Alt+Space` — Shift+primary literal is not expressible as a distinct accelerator; this pair keeps the "related shortcuts" intent), `reminder.minutes` (60, 0=off), `language` (`system|en|es`), `theme` (`system|light|dark`), `autostart` (true).
  - SQLite file lives in the OS app-data dir; schema migrations via numbered SQL files from v1.
  - Day attribution: an entry belongs to the local calendar day of its first segment's start, everywhere — Log, Insights, CSV `date`, Copy-for-AI. A rare overnight entry is not split; away-gap recovery already prevents the common forgotten-overnight case. (Fixture: an entry starting 23:30 ending 00:45 appears only on the start day, duration 1h 15m.)
  - Glossary: "Run via **goal**" = the slice is executed by the autonomous `/goal` run defined in this bundle's `goal-prompt.md`; "**human**" rows are performed by the named person.
  - Design tokens: CSS custom properties in `src/styles/tokens.css` (semantic names, e.g. `--color-surface`, `--space-2`), dark values under `[data-theme="dark"]` with OS-sync via `prefers-color-scheme`; components consume tokens only.
  - Repository: private GitHub repo named in `goal-prompt.md`; the account/org is confirmed by Ben at launch (PRE-LAUNCH row).
  - Testing strategy, two layers (pinned so no slice claims tooling that can't reach its target): **CI-safe** = Vitest unit/integration + Testing Library component tests, with OS-integration points (shortcut handlers, notification calls, tray state) exercised through their internal interfaces or stubs; **live-app manual** = the named Manual checks in S4/S5/S8, run at the S14 gate and at landing. Playwright is not used — it cannot drive native Tauri windows.

## Design principles (the build self-reviews every UI slice against these; Ben's landing rubric)

1. **Speed is the aesthetic.** Every interaction feels <100ms; the timer starts before any animation finishes. If polish and speed conflict, speed wins.
2. **Keyboard-first.** Every core action works without a mouse; shortcuts are shown inline where they act.
3. **Calm surfaces.** The popover shows only what a glance needs. Type hierarchy over chrome; generous space; no decoration that doesn't inform.
4. **Tokens or it doesn't ship.** All color/space/type from the token system; light and dark both complete; OS-sync default.
5. **Motion informs.** 150–200ms transitions only to communicate state change (start pulse, stop settle). Never decorative.
6. **Every state is designed.** Empty, loading, error, success — each explicit. The empty log teaches the shortcut; errors say what to do next.
7. **Both languages are first-class.** No truncated Spanish; layouts tolerate 30% longer strings; the es experience is reviewed, not translated-and-hoped.
8. **Accessibility floor: WCAG AA.** Contrast, visible focus states, full keyboard traversal, labeled controls.
9. **The award test.** Reference bar: Linear's settings, Raycast's popover, Things' calm. If a screen wouldn't survive next to those, it isn't done.

## Assumptions to confirm

All five inferred assumptions were reviewed and confirmed by Ben on 2026-08-21 (decisions.md #41): tag syntax `@client`/`#project`; default shortcuts `Cmd/Ctrl+Shift+Space` + `Cmd/Ctrl+Shift+Alt+Space` (rebindable); 5-minute away-gap threshold; Drive-folder distribution; switch-stops-current semantics with a passive in-panel notice, no confirmation dialog. None remain open.

## Why / decisions (full log: decisions.md)

- **Tauri over Electron/Raycast** — tiny/fast matches the product's identity; Raycast's Windows immaturity fails the platform requirement. Rejected: Electron (size), Raycast (ceiling + Windows).
- **Two shortcuts over double-tap** — no timing window, no accidental stops. Rejected: double-tap detection.
- **Notification = nudge that opens the panel** — action buttons are mobile-only in Tauri (verified); one design works identically on both platforms. Rejected: per-platform notification actions.
- **Gap recovery over OS sleep hooks** — one deterministic, testable mechanism covers sleep + shutdown + crash; no platform-specific code. Rejected: `powerMonitor`-style sleep events.
- **Copy-for-AI over ClickUp API** — 80% of the integration value, none of the name-matching mess; the AI does the mapping. Rejected for v1: direct ClickUp push.
- **Unsigned builds** — pilot economics; install guide absorbs the friction. Revisit ($99 Apple cert) if the pilot sticks.

## Success metric

Time tracked live on the day the work happened (vs reconstructed later): today ≈ one meticulous engineer; target — most of the pilot team (≥4 of ~6) tracking on ≥3 days/week by week 2. Measured by Ben asking, since data is local-only by design.

## Rollout & gates

- **[HUMAN GATE] after S1:** Ben eyeballs CI green + both installer artifacts before the build proceeds. (~15 min in.)
- **[HUMAN GATE] after S5:** first styled surface — Ben reviews popover screenshots (light/dark × en/es) against the Design principles *before* the remaining UI is built in that style. This is the cheap moment to catch "horrible UI."
- **[HUMAN GATE] at S14:** full design sign-off on the screenshot set + the live manual-check list.
- **Gate mechanism:** at each gate the run ends its turn and stops — it does not self-certify and continue. Ben's approval is recorded as a line in `decisions.md` (gate name, date, verdict), and `Done` is not met while any gate line is missing. The gate slices' PRs stay unmerged until approved.
- **Run surface:** local (Ben's Mac) — CI covers the Windows build; no cloud need.
- **PR strategy:** per-slice PRs on a feature branch into `main` of the new private repo; commit after each slice passes its check. Level 2 CI review (Claude GitHub Action) is optional wiring decided by Ben at launch — not part of `Done` and owned by no slice.

## Landing check

| # | Check | Who | When |
|---|-------|-----|------|
| L1 | A teammate who is not Ben installs from the Drive link on their own machine and tracks their first real task in under 60 seconds, with no help beyond the install guide | human | immediate |
| L2 | Fresh `git clone` → `npm test` + `cargo test` green; latest CI run green on both platforms; Release holds both installers; zero-network + i18n-coverage checks pass. Anti-Goodhart: the landing session hand-authors a third, held-out export fixture from the pinned format rules (never seen by the build) and the same `diff -q` checks pass against it | machine | immediate |
| L3 | Golden path on macOS run by the landing session itself with REAL OS shortcut presses (human fingers if needed): shortcut → name → pause → resume → stop → entry correct in popover and Log → Copy-for-AI matches pinned format; the landing session first reviews the S15 e2e script's assertions against this spec; screenshots taken of every surface in light/dark × en/es | machine | immediate |
| L4 | Ben's Windows smoke test on his own Windows device: install via bypass instructions, track a task, edit it, export CSV | human | immediate |
| L5 | Copy-for-AI block from a seeded realistic day pasted into Claude yields a correct, complete restatement of every entry (property: no entry dropped, no duration wrong) | machine | immediate |
| L6 | Ben scores the design-principles rubric on the L3 screenshot set: all 9 pass | human | immediate |
| L7 | Adoption: ≥4 of ~6 pilot teammates tracked time on ≥3 days in the past week (Ben polls); Spanish-primary teammate rates the es experience first-class | human | after-soak (2 weeks) |

## Future work (deliberately deferred)

- P2: ClickUp push (deferred: API/name-matching mess; Copy-for-AI bridges).
- P2: Code signing + auto-updater (deferred: cert cost/lead time; revisit on pilot success — the two unlock together).
- P3: Team rollups / shared reporting (deferred: local-only promise comes first).
- P3: Activity/idle detection (deferred: deliberately cut from v1; gap recovery covers the worst case).
- P3: Insights beyond the three views; PDF/report exports.
- P3: Distribution beyond the Drive folder — a Slack channel post per release, or listing in Cadre One (Ben, 2026-08-21).
