# HOT Chrome launcher

Requirements: Windows, Google Chrome, and Node.js 22 or newer. No packages need to be installed with npm.

Double-click **Launch-HOT-Chrome.cmd**. The launcher console may flash briefly, then only the HOT Chrome video window remains visible. No extension installation is needed. The helper console is hidden and exits when that window closes.

The launcher:

- starts Chrome with a proper Android `--user-agent` override so HOT's server accepts the page;
- uses the dedicated `hot-chrome-profile` and its saved login;
- runs a small local bootstrap over Chrome's loopback-only DevTools port (`127.0.0.1:9223`) to install the player compatibility script in the HOT tab.

The compatibility script selects the site's HTML5 OpenTV player, replaces its placeholder stream branches, and prevents the dormant PC player from filtering out all video representations. Playback keeps HOT's AndroidTV profile: clear-play HEVC without DRM for unencrypted channels, and AndroidTV H.264 with Widevine for encrypted channels. It also maintains `hotChromeSessionBackupV1` in the profile and restores the session if HOT clears its standard login keys. Credentials are never printed or transmitted by the bootstrap.

Version 1.4 adds lifecycle hardening: generation-scoped callbacks and timers, deterministic OpenTV disposal, duplicate-video prevention, stale-library callback guards, and sequential preroll/feature playback. Version 1.4.1 also uses the standard H.264 catchup asset for Start Over instead of HOT's encrypted HEVC-only substitution.

Run the lifecycle tests with:

```bat
node --test tests\lifecycle.test.cjs
```

Use **arrow keys** to navigate, **Enter** to select, and **Backspace/Escape** to go back. Playback controls are the web app's own keyboard controls.

Close existing HOT windows in this dedicated profile before launching again. Do not use this profile for general browsing while its loopback DevTools port is active. To stop everything, close the HOT Chrome window; the bootstrap exits with it.

Chrome process logging is written to `hot-chrome-profile\hot-chrome.log` at fatal-only level, so harmless Chrome updater IPC errors do not spam the terminal.

See **AUDIT.md** for verified playback coverage, request/profile details, and DRM differences. See **APK_AUDIT.md** for the native APK comparison and prioritized improvement plan.

For diagnostics, open DevTools with **Ctrl+Shift+J**. Messages from the compatibility script start with `[HOT Chrome]`, and `window.__hotChrome` reports its status. Do not share `userCredential_NOLIMITS`, `ClientToken`, license bodies, or the session-backup value; they are account secrets.
