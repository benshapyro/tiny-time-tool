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
  },
});
