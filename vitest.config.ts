import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest config, separate from vite.config.ts because the app's Vite config
// is tailored for `tauri dev`/`tauri build` (fixed port, strictPort, etc.)
// which have no meaning for the test runner.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // S10: the golden export fixtures are written with a FIXED local UTC
    // offset (`-07:00`, `America/Los_Angeles` in August/PDT) — see
    // `fixtures/golden/export.csv`'s `first_start`/`last_end` columns and
    // `src/export/isoOffset.ts`. Without pinning the test process's
    // timezone, `Date#getTimezoneOffset()` reflects whatever machine is
    // running the suite: `-07:00` locally, `+00:00` on a UTC CI runner —
    // silently making the golden comparisons machine-dependent. Vitest
    // applies `test.env` to each worker process before any test file
    // (and therefore any `Date`/`Intl` call) runs, so this is set before
    // Node's timezone cache is ever populated. Also set redundantly at the
    // top of `vitest.setup.ts` — belt and suspenders, see that file's
    // comment — and asserted as actually-in-effect by
    // `src/export/timezonePin.test.ts`.
    env: {
      TZ: "America/Los_Angeles",
    },
    setupFiles: ["./vitest.setup.ts"],
    // scripts/ holds the standalone Node check scripts (deps allowlist,
    // zero-network scan) and their own fixture-based tests; src-tauri is
    // Rust, exercised by `cargo test` instead.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // ~74 of these tests open a REAL SQLite file in a temp dir (the spec
    // requires persistence to be genuinely exercised, not mocked), and each
    // driver applies the migrations on open. Vitest's 5s default is a fine
    // bound for pure-logic tests and an unrealistic one for file I/O on a
    // cold Windows CI runner, where one such test timed out at 5000ms while
    // every other file passed.
    //
    // This is a bound, not a bug being papered over: `commitIfOpen` awaits
    // only real driver calls with no deferred promise, so there is nothing
    // that can hang — the operation is slow, not stuck. Raising the bound
    // keeps a genuine hang detectable (20s is still far below any plausible
    // wait) while not failing on I/O latency the test does not control.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
