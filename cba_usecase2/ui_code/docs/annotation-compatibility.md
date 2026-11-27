# Codex annotation style compatibility

The demo's `style-src 'self'` policy blocked the Codex built-in browser's injected shadow-DOM stylesheet. The real IAB supplied the exact 5,539-character stylesheet under `#codex-browser-sidebar-comments-root`. Important diagnostic limitation: CUA's read-only DOM mirror does not expose `HTMLStyleElement.sheet` (nor the app's own `HTMLLinkElement.sheet`); the initial false value was not evidence of a blocked sheet. The reproducible before/after Chromium probe with the captured text establishes CSP causation instead.

`server.mjs` permits only the SHA-256 hash of that exact live stylesheet. Script, network, image, frame and other directives are unchanged. No `unsafe-inline`, `unsafe-eval`, or `unsafe-hashes` is enabled. No browser bundle or injected CSS is stored in this repository.

Captured on 24 November 2026 from the official installed ChatGPT app 26.1117.41037 (29803). SHA-256 hex of the live style is `eb694f694b69be0e3b2abc4f39761cd0a8bc7e413a3cdb1b63923d0e9c84c19e`.

After an app update, if annotations stop styling, use the supported CUA IAB tab API to read the shadow root's style text. Check actual `sheet`/`cssRules` and computed CSS through a real Chromium probe with the captured text, because the CUA DOM mirror omits these sheet properties. Separately check the native review interaction with the user. Hash exact UTF-8 `textContent`, preserving whitespace, and replace the allowlisted hash only after confirming the changed style belongs to the browser overlay. Re-run positive and one-character-negative stylesheet probes plus blocked inline script/event handler and external network probes. A bundle-derived string may cross-check a live hash but is not a substitute for live capture. Do not weaken the whole policy to work around an unknown change.

The native Codex app is unavailable to CUA by policy. Agent verification covers injected DOM text, reproducible synthetic-node Chromium CSP probes and demo app interactions. The user separately confirmed the native Ask for changes flow now works (24 November 2026: “Теперь работает”). This is user-confirmed, not an automated native-toolbar test.
