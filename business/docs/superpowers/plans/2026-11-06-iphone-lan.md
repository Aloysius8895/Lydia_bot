# iPhone LAN implementation plan

Approved scope: ../specs/2026-11-06-iphone-lan-design.md. Execute inline in this session.

1. Add focused backend phone helpers: private IPv4 discovery, public CA download/fingerprint and authenticated connection details. Preserve host/origin/session boundaries. Test public certificate exposure excludes private files.
2. Add PhoneSettings using existing Settings styles: connection checks, LAN address, CA fingerprint, iPhone trust and Safari install steps; report device observations without claiming real-device acceptance. Add Apple standalone metadata.
3. Improve certificate preparation with Windows OpenSSL fallback and expiry checks. Add phone launcher with port checks, chosen IPv4 binding, certificate-only bootstrap server and child lifecycle cleanup. Add Windows entry point.
4. Build/typecheck; run isolated HTTPS and browser checks. Verify launcher transport locally using explicit CA. Document real-phone steps and record computer verification separately from pending iPhone acceptance.
