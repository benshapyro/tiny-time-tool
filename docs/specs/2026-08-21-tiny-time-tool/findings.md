# Findings — tiny-time-tool spec verification

## Cold read (2026-08-21, workhorse model, spec-only)

Ten findings returned; all verified against the spec text and triaged **mechanical** (pinnable from already-made decisions; no scope or architecture reopened). All patched directly. Changes made, one line each:

1. Auto-name format pinned: `{localized short date} · HH:mm–HH:mm`, 24h, en-dash; en `Aug 21 · 10:00–10:45` / es `21 ago · 10:00–10:45`; rendered at display time. *(minor call by Claude: 24h both locales — reversible)*
2. Stop-shortcut contradiction removed: S3 now says "second registered accelerator, defaults pinned below" — no modifier-detection scheme.
3. Gap-check trigger pinned: every heartbeat tick (now − last stored heartbeat) + once at launch; explicitly no OS sleep/wake events.
4. CSV formats pinned: integer round-half-up minutes; local ISO8601 with offset; `YYYY-MM-DD` date; JSON mirrors.
5. Insights semantics pinned: biggest tasks = sum by (name, client, project) tuple, top 5; percentages round-half-up over current-week total.
6. Tag grammar pinned as a regex: whitespace-delimited `@`/`#` tokens anywhere in string, accented letters/digits/hyphen/underscore, first-of-each wins, later tokens stay literal; second parse fixture added (anti-Goodhart).
7. Done #6 (break-it discipline) scoped to machine-verifiable checks; human-rubric checks exempted with the rubric named as their verifier.
8. S10 now requires golden fixtures **hand-authored from the format rules before export code exists**; fixture-vs-code disagreement = code bug, fixtures never regenerated from output.
9. Quit-while-running pinned: state persists, no prompt; launch-time gap check reconciles. `kill -9` relaunch test replaces the vague "crash mid-run."
10. Copy-for-AI literal example embedded in the spec (duration format `Xh Ym`, empty cells `—`, exact total line).

Cold reader explicitly cleared: TimeEntry/Segment model, shortcut defaults, i18n/zero-network mechanisms, slice dependency ordering.

## Crosscheck panel (2026-08-21/22, 4 Sonnet reviewers, independent)

20 findings; deduped into 6 themes; no cross-reviewer contradictions. Triage: 5 themes mechanical (patched directly), 1 judgment (gate enforcement — recommended mechanism written in, hardening option offered to Ben).

**Theme A — test tooling can't reach native Tauri surfaces (QA1, QA2, QA3, QA4, QA5, ENG4, ENG5 — three reviewers converged):** patched. Two-layer testing strategy pinned (CI-safe component/unit tests via internal interfaces/stubs; live-app manual checks at S14 gate + landing); Playwright removed by name; Done #3 e2e redefined to invoke the internal shortcut handler via a test-only command compiled out of release; S8 tests run against a stubbed notify interface with a real-notification manual check; S13b overflow check pinned to `scrollWidth > clientWidth`-class assertions; kill-9 fixture restated explicitly.

**Theme B — anti-Goodhart hardening (ADV1, ADV4, ADV5):** patched. Landing session hand-authors a third held-out export fixture (L2); landing session independently reviews the S15 e2e script before trusting it (S15 + L3); S9 boundary fixtures 5m00s/5m01s added.

**Theme C — zero-network was an enumerated denylist (ADV2):** patched to deny-by-default: CSP `default-src 'self'`; dependency allowlist file gating Cargo.lock/package-lock changes in CI; source scan for net/process APIs outside one allowlisted plumbing file.

**Theme D — human gates had no enforcement (ADV3):** judgment. Written in: run ends its turn at each gate; approval recorded in decisions.md; gate PRs unmerged until approved; Done unmet while any gate line missing. Offered to Ben: harden further with GitHub branch protection requiring review (adds friction on every slice PR). Recommendation: current mechanism suffices at this consequence level.

**Theme E — UX flow gaps (UX1–UX5):** patched. First-launch popover auto-open with teach line + popover empty state (UX1); day-attribution rule pinned: entry belongs to start day everywhere, with 23:30–00:45 fixture (UX2 — minor call by Claude, reversible); tray icon three visual states + paused-vs-running distinction in popover (UX3); running-entry edit rule: name/tags/start live, end time locked until pause/stop (UX4); re-press-while-panel-open = commit-then-pause, and tracking starts at shortcut press not Enter (UX5).

**Theme F — engineering seams (ENG1, ENG2, ENG3):** patched. S13 split into S13a (i18n, S) + S13b (layout audit, M); S4 begins with a macOS focus-grab spike, Windows verified at S14 on Ben's device (named residual); S3 added to S4's Needs with an explicit shortcut→panel wiring test.

## Cold read 2 (2026-08-22, post-patch, workhorse model, spec-only)

Seven findings; all patched. Changes made:
1. **Contradiction (real, introduced by earlier patching):** primary-while-running semantics. Resolved: primary while running with panel closed = silent pause (S3's toggle is sacred); the switch-with-notice panel opens only via the Switch action (popover button / reminder); keyboard-only switch = stop shortcut then primary. Tests adjusted.
2. First-launch popover teach line moved from S1 (where the popover didn't exist yet) to S5.
3. Repo account/org: confirmed by Ben at launch — PRE-LAUNCH row added; goal prompt carries the name.
4. Design tokens pinned: CSS custom properties in `src/styles/tokens.css`, dark under `[data-theme="dark"]` + `prefers-color-scheme` sync.
5. "Run via: goal" glossary line added to Context bundle.
6. Level 2 CI review marked optional, decided by Ben at launch, not part of Done.
7. Deny rules re-scoped: harness-enforced, applied + verified by Ben pre-launch (PRE-LAUNCH row); test-deletion and agent-network limits marked advisory/sandbox.

Minor embedded calls made while patching (reversible, listed per the rules): day-attribution = start day; running entry end-time locked; re-press = commit-then-pause; first-launch auto-open once; test-only command compiled out of release builds.
