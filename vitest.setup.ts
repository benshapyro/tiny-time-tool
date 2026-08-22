// S10: redundant pin of the test process's timezone, ahead of ANY other
// import in this file (including the jest-dom import below) — belt and
// suspenders alongside `vitest.config.ts`'s `test.env.TZ`. `test.env` is the
// primary mechanism (applied before this file even loads); this line exists
// so the pin survives even if a future refactor drops `test.env` without
// anyone noticing this file also depends on it, and so it's set as early as
// physically possible in THIS process regardless of `test.env` plumbing.
// `src/export/timezonePin.test.ts` asserts the pin is actually in effect —
// see its comment for why a silent drop here is dangerous: the S10 golden
// export fixtures (`fixtures/golden/export.csv`, etc.) are written with a
// fixed `-07:00` (`America/Los_Angeles`, PDT) offset, and a UTC CI runner
// with no pin would silently produce `+00:00` instead, failing every golden
// comparison for a reason that looks like a code bug rather than a config
// regression.
process.env.TZ = "America/Los_Angeles";

import "@testing-library/jest-dom/vitest";
