# Approval brief — tiny-time-tool

*Read this instead of the spec. If you want the detail, it's in BUILD_SPEC.md — but you shouldn't need it to say yes.*

**The problem:** your solution-side team reconstructs time from memory (or asks an AI to guess it) at day- or week-end, so project-costing data is inaccurate.

**You're getting:** a tiny, world-class macOS + Windows tray app — one shortcut to start/pause, one to stop, optional task naming with `@client` `#project` tags, hourly nudges, away-gap recovery, full editing, a glance popover plus a Log/Insights/Settings dashboard, Copy-for-AI + CSV + JSON export, complete English and Spanish, light and dark — installers on a Drive link, no GitHub account needed.

**You're explicitly NOT getting (the 9am-surprise list):** no ClickUp integration (Copy-for-AI is the bridge), no sync or team views (each person's data stays on their machine — you cannot see anyone else's time), no auto-update, no telemetry, no activity monitoring, no billing rates, unsigned installers (a documented "Open Anyway" step on first install).

**Decisions I made for you** (already reviewed during the interview; flagged here because reversing after slice three is the expensive kind):

| Decision | Why | What I rejected | Costly to reverse later? |
|---|---|---|---|
| Tauri v2 (Rust core + TS UI) | tiny/fast matches the product; Windows requirement rules out Raycast | Electron (heavy), Raycast (ceiling) | **yes** — framework swap = restart |
| Two shortcuts, no double-tap | no timing window, no accidental stops | double-tap detection | no |
| Reminder = nudge that opens panel | notification buttons don't exist on desktop Tauri (verified) | per-platform notification actions | no |
| Gap recovery via heartbeats | one testable mechanism covers sleep + shutdown + crash | OS sleep-event hooks | no |
| Overnight entries belong to their start day | one simple rule everywhere; gap recovery handles the common case | splitting at midnight | no |
| Zero network, deny-by-default, enforced in CI | your "local-only" promise as a mechanism, not a sentence | trust-the-prose | no |

**What I assumed and couldn't verify:** nothing left — all five inferred assumptions were reviewed and confirmed by you on 2026-08-21 (decisions.md #41). Minor calls embedded during review patches are listed in findings.md and reversible.

**Success looks like** (L1 of the landing check):
> A teammate who is not you installs from the Drive link and tracks their first real task in under 60 seconds, with no help beyond the install guide.

Is that actually the job? If not, everything downstream is aimed wrong.

**If this goes maximally wrong while you're asleep:** a private repo fills with code that doesn't meet the bar, on your Mac, on a branch — nothing external, nothing spent beyond tokens, nothing anyone else sees. You delete the branch and we diagnose. The run also stops itself at three human gates and a 70-turn cap.

**What you can skip:** the slices table, the context bundle, the acceptance checks. Those are written for the agent, and the gate already checked them (13/13).
