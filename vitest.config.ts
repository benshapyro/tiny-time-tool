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
