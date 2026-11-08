# Lydia private remote access

Approved in chat on 2026-11-08: Tailscale on computer and phone, HTTPS, existing workspace password, Windows sign-in startup and crash recovery.

The backend binds only the computer's Tailscale IPv4 address on TCP 4318. Its origin is the machine's MagicDNS HTTPS URL including port 4318. Direct TLS preserves peer addresses and the existing host, origin, CSRF and local-only checks. No public tunnel or reverse proxy is used. Tailscale issues the certificate; the supervisor renews it daily and requests a TLS context reload without interrupting work.

A current-user logon scheduled task runs a Node supervisor with the existing user profile, Claude login, Ollama and database. It retries after network loss and child crashes, logs to ignored .runtime/remote, and refuses to start alongside another 4318 listener. A loopback guard prevents duplicate supervisors. It must not kill the currently running application or open a second database instance.

An administrator setup command creates a Windows firewall rule limited to the Tailscale local IPv4 address, TCP 4318 and the Tailscale IPv4 range. It registers the task with limited rights under the same Windows account. Password must already be configured locally. The computer must remain awake, online and signed in; locking the screen is supported, signing out is not. Startup before Windows sign-in is outside this approved implementation because the existing Claude credentials belong to the user session.

Verification: TypeScript check, remote address/certificate validation tests, existing authentication tests, PowerShell parse, and live provisioning when the user has installed and authenticated Tailscale. Phone cellular access remains unverified until checked on the phone. Tailscale installation requires user elevation and login; automated installation was rejected by policy, so no alternative automatic installation will be attempted.
