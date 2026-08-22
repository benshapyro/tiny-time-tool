# Decisions — tiny-time-tool

Provenance tags: `[HUMAN]` = Ben said it · `[DOC: source]` = named source · `[INFERRED — CONFIRM]` = worked out, not yet agreed.

## Triage (2026-08-21)

- **Tier 3** — cross-platform desktop app (macOS + Windows), global hotkeys, tray/menubar UI, notifications, local storage, export, explicit world-class-UI bar. Real build, multiple decisions worth pinning. `[INFERRED — CONFIRM]` (recommended, awaiting Ben's confirm)
- **Consequence row: low** — local-only data, no client data, no external sends, no payments; wrong output is reversible. Default autonomy: run automatically, easy undo. `[INFERRED — CONFIRM]`
- **Deterministic code**, not model behavior — no eval set needed.

## Settled in Ben's brief (2026-08-21, this session)

1. **Core interaction**: a global keyboard shortcut starts time tracking; hit again to pause; double-tap to stop. Ben later agreed to "two related shortcuts" in a prior exchange (transcript partially garbled — exact scheme needs confirmation). `[HUMAN]`
2. **Task naming is optional**: a text box appears at start (and/or stop); hitting return with nothing typed dismisses it. If a name was entered at start, don't force re-entry at stop. `[HUMAN]`
3. **Unnamed timers** get an auto-name: date + time window. `[HUMAN]`
4. **Task entry**: free text with optional client/project tags; recent tasks autocomplete after a few characters. `[HUMAN]`
5. **Reminders**: light periodic ping, customizable interval, default 60 minutes; actions like Continue / Switch / Stop. `[HUMAN]`
6. **No activity detection in v1.** `[HUMAN]`
7. **Platforms**: macOS and Windows both required. Everyone on the team is on one of the two. `[HUMAN]`
8. **Local-only to start**: nothing reported or sent outside the app without user approval or request. `[HUMAN]`
9. **World-class UX and UI** despite the minimal surface — explicitly important. `[HUMAN]`
10. **v1 viewing**: a keyboard shortcut / menu-bar-tray icon / app window showing time across tasks. `[HUMAN]`
11. **Export**: recorded time feeds project costing; need a readable export of a day's time. ClickUp push is deferred (name-matching mess, tasks may not exist there) → Future work. `[HUMAN]`
12. **Raycast**: considered as a delivery vehicle; not everyone uses it; Ben open to it if it makes things considerably easier, otherwise standalone app. Open decision. `[HUMAN]`

## Outcome (settled 2026-08-21, interview batch 1)

13. **Users**: Ben first; then at least one person per solution-side role — project manager, AI strategist, AI engineer, forward-deployed engineer, possibly director of AI solutions. `[HUMAN]`
14. **Today's behavior being replaced**: ranges from one meticulous engineer hand-tracking in a notepad then entering into ClickUp, to people asking Claude to estimate their time (inaccurate), to end-of-day/end-of-week reconstruction. Cost: inaccurate time data for project costing. `[HUMAN]`
15. **Outcome bar**: time-to-first-value < 1 minute (install → setup → first tracked task); starting a timer takes ~2–3 seconds (shortcut, type or skip, enter). `[HUMAN]`
16. **UI sign-off**: Ben signs off personally. The spec will define project-specific world-class design principles; the build session reviews its own completed work against them as it goes, and they become the landing check's visual rubric. `[HUMAN]`

## Batch 2 — stack & shortcuts (settled 2026-08-21)

17. **Stack: Tauri v2** — standalone tray/menubar app, Rust core + TypeScript/React UI, Vite. Chosen over Electron (size/RAM) and Raycast (Windows immaturity, UI ceiling). Verified this session against Tauri v2 docs: official plugins cover global shortcuts (Win+mac) and tray with menus. `[HUMAN]` choice on `[DOC: Tauri v2 docs via context7]` facts.
18. **Shortcuts: two related** — primary = start / pause / resume (opens quick entry on start, Enter skips naming); Shift+primary = stop. Both customizable. No double-tap timing gestures. `[HUMAN]`
19. **Notification actions constraint**: Tauri notification action buttons are mobile-only (`[DOC: Tauri v2 notification plugin docs]`); Electron actions are macOS-only. Therefore reminders are light nudges; clicking one opens the quick panel containing Continue / Switch / Stop. Ben did not object when presented. `[HUMAN]` (accepted)
20. **Storage: SQLite** via Tauri official SQL plugin — durable, queryable for summaries/exports. Minor call, stated in passing. `[INFERRED — CONFIRM]` (unobjected)

## Batch 3 — data lifecycle (settled 2026-08-21)

21. **Corrections: full editing** — rename, adjust start/stop, delete, any day, from the summary UI. Rationale: accurate costing data is the outcome; uncorrectable data reproduces the disease. `[HUMAN]`
22. **Export**: Ben reopened CSV-only. Wants: possibly CSV, possibly JSON, and — key — **copy in an AI-pasteable format** so a teammate can paste the day into Claude/ChatGPT (possibly ClickUp-connected) and have the AI file the time. `[HUMAN]`
23. **UI adds a minimal dashboard/report**: a log view plus a historical trends/patterns view. `[HUMAN]` — scope watch: trends view is v1-lite only (see below).
24. **Full light + dark mode**, real design system, user-selectable mode or OS sync. `[HUMAN]`
25. **Quality bar framing**: build as if by a world-class PM/designer/engineer; reference the principles of Anthropic, Linear, Notion, Vercel; "would they give it an award" test. Goes into the spec's design principles and the goal prompt. `[HUMAN]`

## Batch 3b — UI architecture & scope calls (recommended by Claude, accepted 2026-08-21)

26. **Two-surface UI**: tray/menubar popover = glance surface (live timer, today's entries, day total); Dashboard window = Log / Insights / Settings tabs. `[HUMAN]` (accepted recommendation)
27. **Insights v1-lite**: exactly three views — week's hours by day, split by client/project tag, biggest tasks. No date-range builders. First thing cut if polish is at risk; more goes to Future work. `[HUMAN]` (accepted with scope-watch flag)
28. **Export trio**: Copy-for-AI (self-describing markdown block for pasting into Claude/ChatGPT to file into ClickUp), CSV by date range, JSON alongside. No PDF. `[HUMAN]`
29. **Launch at login default on**; setting to disable. Minor call, unobjected. `[INFERRED — CONFIRM]`
30. **No auto-pause on sleep in v1** — nudges + full editing cover forgotten timers; auto-detection → Future work. Minor call, unobjected. `[INFERRED — CONFIRM]`
31. **Enforced constraint: zero network requests by the app** — local-only promise as a test the build must prove. `[INFERRED — CONFIRM]` (proposed as enforced; awaiting explicit confirm)

## Batch 4 — distribution (settled 2026-08-21)

32. **Code signing: neither platform for now.** Both platforms get bypass instructions; install doc becomes a first-class UX artifact to protect the sub-minute install bar. Cert costs/lead time avoided for the pilot. `[HUMAN]`
33. **GitHub + Releases**: git init, private Cadre GitHub repo, installers via GitHub Releases. Manual updates in v1; auto-updater → Future work (consistent with zero-network constraint). `[HUMAN]`
34. **Cross-platform builds via GitHub Actions** (macOS + Windows runners, standard tauri-action approach) since Ben develops on a Mac. Windows landing verification requires a human with a Windows machine — named at landing. `[INFERRED — CONFIRM]`

## Batch 5 — closing corrections (settled 2026-08-21)

35. **Spanish localization, first-class**: full en + es UI, i18n layer from first commit, language setting defaults to follow OS. Landing includes a complete Spanish walkthrough. Supersedes the English-only assumption. `[HUMAN]`
36. **Away-gap recovery replaces "no sleep handling"**: app heartbeats a timestamp ~every 30s; on wake, a detected gap retroactively pauses the entry at gap start with a calm "Away Xh Ym — add it back?" prompt. Covers sleep/shutdown/crash in one deterministic testable mechanism; explicitly NOT activity/input monitoring. Timer state persists to disk. `[HUMAN]` (asked for the feature; mechanism is Claude's call, presented with rationale)
37. **Check for updates**: Settings shows version + "Check for updates" opens the download page in the default browser. Zero in-app network preserved. No auto-update, no telemetry — confirmed. `[HUMAN]`
38. **Team distribution without GitHub accounts**: private Cadre GitHub repo for code/CI; installers copied to a shared Google Drive folder with a stable link (manual ~1-min step per release); install guide + update check point there. `[HUMAN]` (requirement) / mechanism `[INFERRED — CONFIRM]`
39. **Windows landing smoke test: Ben**, on his own Windows device. `[HUMAN]`
40. Inferred list from closing review otherwise confirmed by non-objection: single-user/no sync, one timer at a time, SQLite, launch-at-login default on, zero-network enforced constraint, CI builds both platforms. `[HUMAN]` (reviewed as a list)

## Batch 6 — assumption confirmations + switch UX (settled 2026-08-21)

41. **All five inferred assumptions confirmed by Ben**: tag syntax, default shortcuts, 5-min away gap, Drive distribution (with future Slack-channel or Cadre One distribution parked to Future work), switch semantics. `[HUMAN]`
42. **Switch has no confirmation dialog** — quick-entry panel shows a passive "Will stop: {name} ({elapsed})" notice; Enter executes. Rationale: a modal breaks the 2–3s hot path; visibility + editing/undo covers mistakes. Claude's recommendation, presented and accepted. `[HUMAN]` (accepted)
43. **Crosscheck approved** — 4 Sonnet subagents: QA, Adversarial, Engineer, UX. `[HUMAN]`
44. Cold-read findings 1–10 patched (see findings.md) — all mechanical; minor embedded calls: 24h clock in auto-names both locales; top-5 biggest tasks; round-half-up percentages; Quit-while-running persists without prompt. `[INFERRED — CONFIRM]` (listed in findings.md, unobjected)

## Batch 7 — launch decisions (settled 2026-08-22)

45. **Deny rules declined** — Ben chose advisory-only for the spec-is-canonical rule; Claude flagged the enforcement gap once; spec wording updated to say advisory honestly. `[HUMAN]`
46. **Bundle committed pre-launch** — git init + initial commit of spec bundle, CLAUDE.md, review workflow. `[HUMAN]`
47. **Repo: `benshapyro/tiny-time-tool`** (private, personal account; transferable later). `[HUMAN]`
48. **Level 2 CI review: yes** — workflow file shipped in initial commit; Ben runs `/install-github-app` after the run creates the repo. Cost expectation set: ~$0.05–0.40/PR, triggers on every push. `[HUMAN]`
49. Cold read 2's seven findings patched (see findings.md), incl. the primary-shortcut-while-running contradiction resolved: silent pause; Switch via popover/reminder or stop-then-start. `[HUMAN]` (unobjected patches)

## Open decisions (interview agenda)

- Outcome + how we know it landed (stranger test)
- Delivery vehicle + tech stack (standalone app vs Raycast; Tauri vs Electron)
- Exact shortcut semantics + customization + conflict handling
- Where the quick-entry input appears; the summary view's contents
- Can users edit/delete past entries in v1 (forgotten-timer recovery)
- Export format + who consumes it
- Reminder notification mechanics per-platform
- Distribution/install for the team (code signing, notarization — pre-launch checklist)
- Who signs off on the UI, against what reference
