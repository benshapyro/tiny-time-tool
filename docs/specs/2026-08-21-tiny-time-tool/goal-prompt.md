# Goal prompt — tiny-time-tool

**Model plan: barbell.** Keep your session on the strongest model (check `/model`) — it coordinates: dispatches workhorse-model (Sonnet) subagents to implement each slice, reviews every diff and test result against the spec at the joints, re-dispatches when something falls short. Escalation valve: if the same slice fails twice, the coordinator stops retrying and escalates that slice to the strongest model — repeated failure means the slice needed judgment the spec didn't pre-package.

**Run surface: local** (Ben's Mac). CI carries the Windows build; nothing here needs cloud. Add Remote Control if you want to watch gates from your phone.

**Measurement note:** on a barbell run, `/cost` sees only the coordinator — on a previous real run it captured 4% of the lines actually written. Size the build from the git diff, never `/cost`.

**Recommended first move — plan mode.** Before the goal, run in plan mode: *"Read docs/specs/2026-08-21-tiny-time-tool/BUILD_SPEC.md and propose the file layout, slice order, and how you'll honor the enforced constraints. Don't write code yet."* A confused plan finds a spec gap for the price of a few minutes' reading. If the plan conflicts with the spec, reconcile to one source of truth before launching — never let the plan silently win.

**Before pasting:** switch to auto-accept edits (the gated spec, the sandbox, and the human gates do the containment — deny rules were declined, so spec-is-canonical is advisory). Launch with `--max-turns 70` at the harness — the prompt's cap is advisory; the harness cap is the real wall.

Paste into Claude Code:

```
/goal Build every slice in docs/specs/2026-08-21-tiny-time-tool/BUILD_SPEC.md,
test-first, in dependency order (the Needs column). First: create the private
GitHub repo benshapyro/tiny-time-tool via gh and push the existing initial
commit (the repo is already initialized locally with the bundle committed). For each slice, dispatch a workhorse-model (Sonnet) subagent to
implement it, then review its diff and test results against the spec yourself
before moving on; re-dispatch with corrections if it falls short. If the same
slice fails twice, escalate it to the strongest model; if it fails again, stop
and flag it for the user. The spec is canonical — never edit files under
docs/specs/; if you believe the spec is wrong, stop and say so. Done when the
spec's Done = section holds: npm test and cargo test green (tests written
failing first), CI green on macOS + Windows with both installer artifacts, the
S15 golden-path script exits 0, the zero-network and i18n-coverage checks pass,
and verification.md records every machine-verifiable check deliberately broken,
observed failing, and restored. Honor every constraint in the spec, enforced
and advisory. PR strategy: per-slice PRs on feature branches into main; commit
after each slice passes its check; never let a diff outgrow ~400 changed lines
without opening a PR. For each PR: after CI is green, read the AI review's
findings via gh, fix the legitimate ones, contest the rest in
REVIEW-CONTESTED.md (never silently dismiss), cycle cap 3, never force-push,
then merge it yourself and continue. Run S1→S13b without stopping for a human;
each UI slice ends with screenshots reviewed by an agent against the spec's
Design principles, findings fixed before merge. Stop only at the [HUMAN GATE]
at S14 and wait for Ben's approval line in decisions.md.
Stop after 70 turns even if not done. When the run finishes, tell the user:
"come back to launch-prep and say CHECK THE LANDING."
```

**Gate schedule (revised 2026-08-22):** one human gate only, at S14 near the end — full design sign-off + live manual checks. Everything before it runs unattended: autonomous per-slice design review and the per-PR review-fix loop replace the former mid-run gates. Wall time ≈ 5× thinking time; plan for a full day.
