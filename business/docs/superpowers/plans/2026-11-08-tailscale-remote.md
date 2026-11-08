# Tailscale Remote Access Implementation Plan

> **For agentic workers:** Execute inline in this session. User authorized implementation; no delegation is needed.

**Goal:** Provide private cross-network phone access and automatic startup after Windows sign-in.

**Architecture:** Direct TLS on Tailscale IPv4 with a Node supervisor, current-user scheduled task and narrowly scoped firewall rule.

**Tech Stack:** Node 24+, TypeScript, Windows PowerShell, Tailscale CLI.

## Global Constraints

- Preserve existing workspace, credentials and password authentication.
- Never start two application processes using the same database.
- Bind only the Tailscale IPv4; do not open a public tunnel.
- Keep generated certificates, logs and addresses in ignored .runtime.
- Require Windows sign-in and an awake, online computer.

### Task 1: Supervisor and certificate renewal

Files: `scripts/remote-config.ts`, `scripts/start-remote.ts`, `backend/server.ts`, `tests/remote-config.test.ts`.

- [ ] Validate Running Tailscale state, Self.DNSName ending .ts.net and a 100.64.0.0/10 Self.TailscaleIPs IPv4.
- [ ] Validate certificate hostname, expiry and matching key before startup or renewal.
- [ ] Refuse duplicate supervisors via an exclusive 127.0.0.1:4317 guard; check all 4318 listeners before starting the backend.
- [ ] Run `tailscale cert --cert-file <path> --key-file <path> <DNSName>` at startup and daily. Validate temporary files before replacing live files.
- [ ] Spawn backend with explicit HTTPS origin, Tailscale host, passwordless disabled and IPC. Retry failures after 30 seconds. Send LYDIA_RELOAD_TLS after certificate replacement and handle it through setSecureContext.
- [ ] Run `npm.cmd run check` and `node --experimental-strip-types --test tests/remote-config.test.ts tests/local-access.test.ts tests/phone.test.ts`.

### Task 2: Windows deployment entry points

Files: `Start-Lydia-Remote.cmd`, `scripts/setup-remote.ps1`, `docs/REMOTE_ACCESS.md`.

- [ ] Administrator setup validates CLI login and existing password, refuses any current 4318 listener, builds frontend, verifies HTTPS certificate provisioning, and creates only the scoped firewall rule.
- [ ] Register `Lydia Remote` task for the current user's logon with limited rights, unlimited execution time, battery allowed and no duplicate task instances. Start it immediately.
- [ ] Document installation, Tailscale HTTPS enablement, exact setup command, password usage, phone reinstallation at the new origin, log location, stop and uninstall commands.
- [ ] Parse PowerShell, validate command entry point and record any live verification blocked by installation/login.
