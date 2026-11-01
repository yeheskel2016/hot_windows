# HOT Chrome playback audit — current state

## Working build

- Launcher: `Launch-HOT-Chrome.cmd` (brief console flash, hidden helper, visible Chrome window).
- Current version: 1.4.1. Rollback backups exist under `hot-chrome-stable-1.2.0` and `hot-chrome-stable-1.3.0`; the hardened build is saved under `hot-chrome-stable-1.4.0`.
- Network identity: Android user agent supplied by Chrome's command-line override.
- Login/device identity: AndroidTV (`ClientID=7`), retained independently of the HTML5 playback backend.
- No browser extension is installed. `bootstrap.mjs` installs `inject.js` into the HOT tab through loopback-only CDP and exits with the tab.

## Verified playback routes

| Content | Server request | Browser handling | Result |
|---|---|---|---|
| Encrypted live channel 0 | AndroidTV, normal DASH | H.264 + Widevine | 1080p playback, licenses HTTP 200 |
| Clear-play live channel 12 | AndroidTV, `isClearForceNeeded=true` | Native Chrome HEVC, no EME/DRM | 1080p playback, manifest has no ContentProtection |
| Encrypted live channel 16 | AndroidTV, normal DASH | H.264 + Widevine | 1080p playback |
| Unsubscribed channel 51 | AndroidTV, normal DASH | H.264 manifest downloads; license server returns HTTP 400 | Expected entitlement denial; not a codec problem |

Channel switching was verified in both directions after using HOT's normal stream cleanup. AndroidTV is the default everywhere; LG remains only a diagnostic fallback.

The account currently exposes 233 live channels. Thirteen carry `DASHHEVC` metadata and six have clear-play mappings. That metadata is not a guaranteed manifest codec: channels 16 and 51 are marked HEVC-capable but returned H.264.

## Why encrypted Android HEVC is not a viable Chrome route

Chrome's Widevine EME rejected every tested HEVC configuration: `hvc1` and `hev1`, full and short codec strings, and empty/software/hardware robustness values. This happens before a license request. Native ExoPlayer's JSON license wrapper cannot fix that EME capability rejection. Clear HEVC works because this PC supports native HEVC decoding without Widevine.

## Request parameters confirmed in `UTILS.js`

Normal playback (`getUniqeURL`, lines 7454–7557):

- `PropUrl`: asset/channel identifier; clear-play may replace it with a server-listed clear ID.
- `appName`: LIVE, VOD, PVR, HOTMUSIC, RADIO, CommercialChannel, etc.
- `DeviceType`: server profile selector (ANDROID, LG, SAMSUNG, HISENSE).
- `LiveDubPlaying`: audio/dubbing variant.
- `PlayUrlType`: 0 normal DASH; 1 eligible low-latency DASH.
- `isTrailer`: trailer or preroll marker.
- `IsHotStreamer`: actually `IsHotStreamer && IsHTTPEnable`; requests HTTP for eligible Streamer configurations.
- `isClearForceNeeded`: set only after the server-provided clear-play list selects a clear asset.

Startover/catchup adds `NetworkLocation`, `encryptedData`, ISO `StartTime`/`EndTime`, `NLisCdnActive`, and `LiveDubPlaying`. In-progress PVR uses this route; completed PVR uses normal playback.

There is no general client parameter for codec, H.264, HEVC, HLS, SD, bitrate, or alternate CDN host. VOD `Definition` is read but not sent. `DASHHEVC` is metadata, not a request field. `PlayUrlType` is latency selection, not codec selection.

## Native/browser DRM differences

Browser OpenTV sends raw EME bytes with `application/octet-stream` and expects raw license bytes. Native ExoPlayer wraps the challenge as base64 in JSON and parses a base64 license from JSON. Both use the existing application-data authorization header. The browser route works for entitled H.264 content, so changing the wrapper is unnecessary.

## Lifecycle hardening implemented in 1.4

`lifecycle.js` wraps the compatibility layer without changing HOT's server files:

1. Playback generation IDs guard URL, entitlement, preroll, OpenTV-ready, and error callbacks. Stale callbacks increment `ignoredStaleCallbacks` and cannot start older content.
2. Every zap disposes the previous OpenTV instance and removes old video elements before another is created. Event handlers capture their generation-specific player.
3. Playback/error/trailer timers and metrics intervals are cleared during generation changes. The five-second error close is generation-scoped.
4. OpenTV's timeline double-cleanup, stale Shaka error reinjection, and post-disposal DRM logger are guarded at their actual library failure points.
5. VOD preroll and feature URLs play sequentially. Preroll `ended` starts the feature; preroll `error` also falls through instead of blocking it. No native comma-concatenated URL reaches Shaka.
6. Catchup/startover callbacks use the same generation guards, and normal stream disposal remains responsible for bookmark preservation.

Validation completed:

- Encrypted H.264/Widevine and clear HEVC playback both pass after hardening.
- Rapid `0 → 12 → 16` zaps finish on channel 16 with one video element, no exceptions, no player error, and stale callbacks ignored.
- `node --test tests/lifecycle.test.cjs`: three tests pass for stale URL responses, preroll completion, and preroll failure.
- Start Over on channels 12 and 0 passes in 1.4.1: disabling `EnableClearCU` only for that call selects the standard catchup asset, yielding H.264, successful Widevine licenses, and 1080p playback from each event's start. Normal live clear-play remains enabled.

## PC-specific notes

The original PC branch is intentionally nonfunctional: it has placeholder URL acquisition and a second demo-URL replacement. Both must remain bypassed. Keep HTTP/HOT Streamer mode off to avoid mixed content. Autoplay must follow a user gesture. Encrypted HEVC-only assets, if encountered later, will require an authorized H.264/clear alternative or the native app.

## Completed service-wrapper audit

The public `data_ref_Ott.js` and `data_ref_Vod.js` wrappers were reviewed separately. Copies are retained in `workaudio\audit` for troubleshooting.

### HTTP and authorization

`getUniqueUrlClient` and `GetUniqeURL_StartOverClient` issue GET requests with no body. They add no hidden quality or codec fields. Authentication/device/session metadata is carried in custom headers, principally `client-Token`, `x-hot-esn`, `x-hot-fwversion`, `x-hot-browserversion`, `x-hot-host`, `x-hot-applicationname`, `x-hot-platform`, `x-hot-requestid`, and `x-hot-context`. No `Authorization` header or credentialed-Cookies mode is used.

Responses are JSON-decoded, including one ASMX-style `data.d` string when present. A JSON parser failure with HTTP 200 falls back to the raw response text.

### Profile selection

- Ordinary LIVE Android and LG both use `NAGRA-WV-THUM-LIVE`; LLC uses `NAGRA-WV-LLC-2B`.
- Android clear-force changes those to `NAGRA-CLR-THUM-LIVE` and `NAGRA-CLR-LLC-2B`; LG does not make the ordinary LIVE clear substitution.
- VOD Android/LG uses `NAGRA-WV-MAIN-VOD-CDN`; trailers/prerolls use `DASHTRAILER`.
- Startover Android/LG uses `NAGRA-WV-THUM-LIVE`; Hisense/Samsung use PlayReady variants.
- PVR Android/LG uses `NAGRA-WV-THUM-LIVE`, but only Android's wrapper branch is complete.

These are DRM/content profile names, not explicit codec selectors. There remains no H.264/HEVC, HLS, SD, bitrate, resolution, or quality request option. `IsHotStreamer` changes `x-hot-host` routing rather than directly providing a codec option.

Startover ignores the supplied `encryptedData` and `NLisCdnActive` fields. Its actual request uses `NetworkLocation`, `DeviceType`, start/end times, dubbing, and headers.

### Wrapper defects relevant to the implementation

Samsung/Hisense LIVE, Samsung VOD, and Hisense/Samsung/LG PVR branches assign an undeclared `url` instead of `streamURL`. Only Android PVR is complete, which is another reason to keep Android as the default rather than switching the whole browser session to LG.

`data_ref_Vod.js` adds no alternative playback profile logic. Its generic ASMX JSON POST helper is separate from these two GET-based playback wrappers.
