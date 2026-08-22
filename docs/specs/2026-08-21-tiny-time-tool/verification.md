# Verification — tiny-time-tool

Evidence that each check in this build **can actually fail**. A check nobody has
watched go red is not a check; it's a comment that returns green. A suite of broken
tests and a suite of passing tests look identical from the outside — the only way to
tell them apart is to hold a match under each one.

For every guardrail and acceptance check: break the thing it protects, watch the
check fail, restore, and record it here.

| # | Check | How it was broken | Went red? | Restored | Notes |
|---|-------|-------------------|-----------|----------|-------|
| — | (filled by the build run per Done #6; machine-verifiable checks only) | | | | |

## The three rules this table exists to enforce

**A fake break proves nothing.** Editing a comment, renaming an unused variable, or
touching a line the check never reads produces a green run that is indistinguishable
from a passing test. The break has to change the *behavior under test*. If the check
stays green, the first thing to suspect is your break, not the check.

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
in this table.

## Verdict

- Checks verified: **<n> of <n>**
- Found broken and repaired: **<n>** (list them — these are the run's real findings)
- Unverifiable, with reason: **<n>**

Any check that could not be verified is an open risk, not a passing check. Say which
and why rather than leaving the row blank.
