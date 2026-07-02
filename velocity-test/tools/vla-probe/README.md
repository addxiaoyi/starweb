# VLA Probe

Local defensive probes for `velocity-test`.

Sources used:

- `mineflayer`: GitHub [`PrismarineJS/mineflayer`](https://github.com/PrismarineJS/mineflayer)
- `minecraft-protocol`: GitHub [`PrismarineJS/node-minecraft-protocol`](https://github.com/PrismarineJS/node-minecraft-protocol)

Install:

```powershell
npm install
```

Run against the local Velocity test server:

```powershell
npm run compat
$env:VLA_LOAD_CLIENTS="25"; npm run load
npm run http
```

Current default behavior:

- auto-load `velocity-test/.env.velocity.generated`
- then auto-load `velocity-test/.env.velocity`
- auto-read `velocity-test/velocity.toml` bind port as `VLA_MC_HOST` / `VLA_MC_PORT`

So in the common local workflow, the probes can run without manually exporting host / port / API key.

Forced-host / handshake-host testing:

- `VLA_MC_HOST` / `VLA_MC_PORT` remain the real TCP endpoint to connect to.
- `VLA_MC_FAKE_HOST` is optional and, when set, is passed through as `fakeHost` to `mineflayer` / `minecraft-protocol`.
- This lets the probe send a different hostname in the initial handshake while still connecting to the same local Velocity port.
- It is useful for reproducing:
  - Velocity `forced-hosts`
  - `resume-original` / virtual-host routing
  - host-specific handoff regressions that do not reproduce when every probe connects as `127.0.0.1`

Examples:

```powershell
$env:VLA_MC_FAKE_HOST="factions.local"; npm run compat
$env:VLA_MC_FAKE_HOST="minigames.local"; npm run load:auth
Remove-Item Env:VLA_MC_FAKE_HOST
```

The local `velocity-test/velocity.toml` now ships with a small `[forced-hosts]` test mapping:

- `lobby.local` -> `lobby`
- `factions.local` -> `factions`
- `minigames.local` -> `minigames`

So a local probe can verify non-default downstream selection without requiring DNS changes or extra listeners.

For forced-host handoff verification, treat `spawned` as necessary but not enough. Check Velocity logs for:

```text
[VLA] auth handoff forced-host candidates ... virtualHost=factions.local targets=[factions]
[server connection] <probe-user> -> factions has connected
```

The 2026-06-10 proof run is recorded in [`../../../docs/STAR_VELOCITY_HANDOFF_VALIDATION_2026-06-10.md`](../../../docs/STAR_VELOCITY_HANDOFF_VALIDATION_2026-06-10.md).

Keep targets local or explicitly owned. These probes are for compatibility, capacity smoke testing, and auth/API regression checks.

Notes:

- `mock:lobby` is a protocol smoke stub, not a full Paper backend. A disconnect after the VLA auth flow can be caused by incomplete downstream packet handling in the stub.
- `compat` / `load` now enforce a real-backend precheck by default: they resolve targets from `VLA_REAL_BACKEND_TARGETS` or `velocity-test/velocity.toml` `[servers]`, fail fast if any target is unreachable, and reject the built-in `VLA mock lobby` stub as a substitute for Paper.
- Full Velocity compatibility must be confirmed with a real backend such as [`PaperMC/Paper`](https://github.com/PaperMC/Paper), with `velocity-test/real-backend-check.ps1` or `.sh` passing before `compat` / `load`.
- If you intentionally want stub-only smoke behavior, set `VLA_SKIP_REAL_BACKEND_CHECK=1` for that run and treat the result as non-authoritative.
- Keep `VLA_LOAD_CLIENTS` conservative on developer machines; treat this as local capacity smoke testing, not internet-facing stress testing.
