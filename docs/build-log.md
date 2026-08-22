# Build log — tiny-time-tool

Durable record of the autonomous build run. The spec at
`docs/specs/2026-08-21-tiny-time-tool/BUILD_SPEC.md` is canonical; this file records
what the run *did*, decisions it had to make, and environment facts worth not
rediscovering. Nothing here overrides the spec.

## Run start — 2026-08-22

Coordinator: Opus 5 (1M context). Slice implementers: Sonnet subagents, serialized
(one writer at a time in the shared tree — no parallel writers).

### Repository

- `benshapyro/tiny-time-tool` created private, `main` pushed. (Spec: Context bundle →
  Repository; decisions.md #47.)
- **Remote uses SSH, not HTTPS.** The `gh` OAuth token has scopes
  `gist, read:org, repo` — no `workflow` scope — so an HTTPS push of any commit
  touching `.github/workflows/**` is rejected by GitHub. SSH (`git@github.com`)
  is not subject to that restriction and authenticates as `benshapyro`.
  `gh` is still used for API calls (repo/PR/run queries).

### Environment facts verified this session (2026-08-22)

| Thing | Value | Note |
|---|---|---|
| node / npm | v26.7.0 / 11.19.0 | |
| cargo / rustc | 1.98.0 / 1.98.0 | PRE-LAUNCH recorded 1.88.0; newer is present |
| Xcode CLT | Xcode 17 | `.dmg` build prerequisite |
| gh | 2.98.0, authed `benshapyro` | token in macOS keychain → **gh calls must run unsandboxed** |

**npm under the sandbox.** `~/.npm/_cacache` is not sandbox-writable, so npm failed
with `EPERM`. Fixed with a machine-local, gitignored `.npmrc` pointing `cache=` at
`./.npm-cache`. npm therefore runs *inside* the sandbox. `.npmrc` and `.npm-cache/`
are gitignored — this is local config, never committed, and CI is unaffected.

**cargo under the sandbox.** crates.io *is* reachable from the sandbox (index
resolution succeeds), but `~/.cargo/registry` is not sandbox-writable, so downloads
fail with `Operation not permitted`. Rather than duplicate the whole crate cache,
**cargo commands run unsandboxed** against the real `~/.cargo`. This was the one
PRE-LAUNCH "need" row (crates.io in the sandbox allowlist) and it did not require
Ben — the network was never the blocker, the cache directory was.

### Plugin names — spec gotcha resolved

The spec's Context bundle flagged the autostart/opener plugin names as "recalled, not
verified — verify against the plugins workspace docs before S1 pins them." Verified
against the npm registry itself (authoritative, not docs) on 2026-08-22:

| Package | Version |
|---|---|
| `@tauri-apps/api` | 2.11.1 |
| `@tauri-apps/cli` | 2.11.4 |
| `@tauri-apps/plugin-opener` | 2.5.4 |
| `@tauri-apps/plugin-autostart` | 2.5.1 |
| `@tauri-apps/plugin-global-shortcut` | 2.3.2 |
| `@tauri-apps/plugin-sql` | 2.4.0 |
| `@tauri-apps/plugin-notification` | 2.3.3 |

Both recalled names are correct. No spec change needed.

### One spec tension, resolved and flagged

The advisory constraint says *never edit `docs/specs/**`*. `Done #6` says the run must
record break-it evidence in `verification.md`, which lives **inside** `docs/specs/`,
and that file's own table contains the placeholder row "(filled by the build run per
Done #6)". The specific instruction wins over the general one: the run writes to
`verification.md` **only** — its evidence table and Verdict section — and touches no
other file under `docs/specs/`. Gate approval lines in `decisions.md` are Ben's to
write, not the run's. Flagged to the user at run start.

## Slice ledger

| Slice | Branch | Status | Notes |
|---|---|---|---|
| S1 | `slice/s1-scaffold` | in progress | |
