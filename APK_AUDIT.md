# Native HOT APK audit for the Chrome implementation

Baseline: Chrome compatibility version 1.5.0. This audit excludes credentials, tokens, signed media URLs, and device-private data.

## 1.5.0 implementation status

The immediate correctness work identified by the native audit is implemented: complete preroll transition/bookmark isolation, trailer-only errors, seek-and-play and Start Over resume, stream MIME selection, LLC gating, Go To Live, and behind-live-window handling. A single bounded starvation watchdog with position preservation and offline reconnect debounce is also implemented. Eleven lifecycle unit tests pass, alongside browser tests for encrypted live, clear HEVC, Start Over/resume, rapid zaps, and Go To Live.

Player reuse across zaps and native live/LLC latency tuning remain test-first items; no latency problem has been established, so they were not changed.

## Evaluation criteria

Each native behavior is classified as:

- **Implement:** likely to improve Chrome playback or feature correctness with acceptable complexity.
- **Test first:** potentially useful, but needs a measured playback comparison before changing the stable path.
- **Keep native:** depends on ExoPlayer/Android DRM, secure surfaces, native windowing, or other behavior that does not map safely to Chrome.
- **Already covered:** current 1.4.1 behavior already matches or intentionally exceeds the native path.

## Baseline already verified in Chrome

- AndroidTV H.264/Widevine playback for encrypted live content.
- AndroidTV clear-play HEVC without an EME session.
- Standard H.264 catchup asset for Start Over, including channel 12.
- Playback generation guards, deterministic OpenTV disposal, duplicate-video prevention, and stale timer cleanup.
- Sequential preroll/feature playback, including preroll failure fallback.
- CMD launcher, hidden helper, session backup, and helper shutdown watchdog.

## Native playback and DRM findings

### Core Chrome decisions confirmed

The native code supports keeping the current raw Widevine protocol, encrypted H.264 route, clear HEVC/no-EME route, sequential prerolls, and clean per-generation player construction. Native fresh initialization also rebuilds codec/renderer/license configuration (`p052w1/E.java:287–315`), while native player reuse can retain stale configuration (`p052w1/E.java:116–126`). Chrome's clean generation-specific initialization is therefore a strength, not a problem to remove blindly.

### Saved-position resume must seek and play

Native ordinary seek and saved-position seek are different (`p052w1/E.java:385–407`). Saved-position resume seeks and calls `play()`, uses milliseconds, applies the initial position once on READY, and uses `-1` as the no-seek sentinel (`p052w1/z.java:191–220`; `models/Asset.java:22–24,42–44`). Chrome's bridge currently aliases saved-position seek to ordinary seek without resuming (`inject.js:129–139`).

Recommendation: make saved-position resume seek and then play, subject to generation/autoplay guards. Reset pending seeks for each new asset and apply them to the feature, never the preroll.

### Go To Live must use the real browser live timeline

Native error 1002 is specifically behind-live-window and invokes go-to-live rather than generic failure (`p052w1/z.java:249–257`; `PlaybackException.java:5–18`). Native seeks to the timeline default position and resumes; its numeric argument is unused (`p052w1/o.java:52–59,171–174`).

Recommendation: use active Shaka/OpenTV live timeline/default target, or seekable live edge as fallback, then resume. Generation-scope recovery and apply it only to actual live content, never to Start Over, catchup, PVR, or VOD merely because the origin channel is live. If seeking cannot recover, reload the current live feature with its original URL and actual container type. Do not equate `duration()` with live default position.

### Native MIME preference is not a server codec request

Fresh native initialization prefers HEVC then H.264 for ordinary content and H.264 for LLC (`p052w1/E.java:305–307`). This is local track scoring among manifest tracks (`DefaultTrackSelector.java:1648–1678`), not a server transcode request. It does not justify a new server codec parameter.

Chrome should retain H.264-first for encrypted content because of Widevine capability limitations and clear HEVC without EME where authorized. If a future encrypted manifest offers both codecs, prefer H.264 based on actual EME capability; current verified H.264 responses need no change.

### Native decoder fallback is not an asset/codec fallback

Extension renderers and decoder fallback (`p052w1/E.java:305`; `DefaultRenderersFactory.java:134–213`) fall back to another decoder for the same format. They do not convert encrypted HEVC to H.264, repair EME rejection, or select another CDN. Keep the authorized H.264 strategy.

### Native JSON license wrapping is unnecessary

Native posts base64 challenges in JSON and decodes JSON/base64 licenses (`p052w1/A.java:55–105`). Browser raw EME challenge/raw license responses already work. Do not port the wrapper; it cannot change HEVC EME capability.

The media item's default license URI/`forceDefaultLicenseUri(false)` is effectively bypassed by the custom DRM provider (`p052w1/E.java:209–240`; `C0705d.java:5–17`), and the custom callback discards the manifest-provided license URL (`p052w1/A.java:56–60`). A separately created stock provider is immediately discarded (`p052w1/E.java:297–305`). Do not start honoring manifest license URLs to imitate dead native configuration.

### Redirects, sessions, and CDN routing

- Native's manual five-hop 307/308 loop is used only for provisioning (`p052w1/A.java:16–52,108–115`), not normal key requests (`A.java:74–105`). Do not port it.
- Media connect/read timeouts and cross-protocol redirects apply to media data, not the custom key request (`p052w1/E.java:287–290`). Leave browser request timeout/redirect handling to Shaka/CDM.
- Native multi-session supports changing keys/scheme data (`C0705d.java:14–17`; `DefaultDrmSessionManager.java:527–568`), not offline licensing or cross-zap persistence. Keep fresh browser DRM sessions; do not persist MediaKeys/session IDs.
- Clear native formats can avoid unnecessary license acquisition (`DefaultDrmSessionManager.java:44–47,356–370`). Skipping EME for clear HEVC is therefore consistent with native behavior.
- `NLisCdnActive` selects configured license routing, not media-host rewriting or automatic CDN-to-direct failover (`p052w1/E.java:287–303,328–345`). Keep the working route and let Shaka handle manifest-provided alternatives.
- DRM/entitlement HTTP 400 remains fatal for that asset, not a reason for media/host retry loops.

### Container type and Start Over terminology

Native supports DASH, HLS, MP3, and source inference (`p052w1/E.java:209–268`), separately from live/LLC classification (`E.java:151–159`; `Asset.java:4–16`). Preserve actual asset container type in any future recovery rather than forcing DASH.

The current Start Over fix uses the standard H.264 **DASH catchup manifest** (`index.mpd`). The variable name `HLSurlSimple` does not make that response HLS. This is distinct from genuine HLS support required for Outside Video/other non-DASH sources.

### Prerolls and disposal

Native builds a concatenating playlist and reports item transitions (`p052w1/E.java:328–345`; `p052w1/z.java:150–168`). Chrome's sequential preroll/feature implementation is a valid equivalent and should remain. Continue applying feature bookmarks/live state only after preroll completion; the WebView findings above identify missing transition side effects to complete.

### Conditional live-latency tuning

Fresh native values are normal-live target 15 seconds/minimum 10/maximum 45 and LLC target 8/minimum 6/maximum 10 (`p052w1/E.java:231–238`). Despite a microsecond-oriented constant name, the numeric value passed to millisecond setters is 10000 ms (10 seconds), so these values are coherent. They are requested offsets clamped by Media3 (`DashMediaSource.java:656–725`), not absolute seek positions.

Use these only as test values if current latency is demonstrably wrong, using actual content classification and final URL. Otherwise leave Shaka live-sync alone. Never apply them to Start Over or VOD-like assets.

## Recovery, buffering, and lifecycle findings

### P1 — Use one generation-scoped starvation watchdog

Native starts monitoring 5 seconds after playback begins, samples every second, and treats two consecutive no-progress samples with less than 500 ms buffered as starvation (`B0/i.java:435–466`; `p052w1/z.java:103–135`). Recovery is cancelled when playback resumes and native retries only while IDLE (`p052w1/E.java:129–149`; `p052w1/o.java:62–80`).

Recommended browser behavior:

- Arm/re-arm after `playing`, `seeked`, or completed recovery; first sample after 5 seconds, later samples after 1 second.
- Abort on generation change, disposal, user pause, seeking, lost playback intent, or recovery already in flight.
- Use actual `currentTime` advancement as authoritative; `!video.paused` alone is not progress.
- Measure buffered time ahead only in the buffered range containing `currentTime`.
- Start exactly one recovery on the second low-buffer sample. Do not emit `ended` for starvation.
- Keep only one recovery owner; if OpenTV already supplies an equivalent no-progress mechanism, consume it rather than adding a duplicate timer/load.

### P1 — Recover only the current content item and preserve position

Native recovers live from the last configured URL (`p052w1/E.java:141–149,328–345`), but blindly choosing the last URL would be wrong for Chrome's sequential prerolls. Retry the current preroll or main-content item explicitly; never replay completed prerolls after ordinary network recovery.

Native considers content near live when default position minus current position is at most 25 seconds (`p052w1/E.java:362–376`). Browser recovery should instead use the actual seekable range: `seekRange().end - currentTime <= 25s`.

Before a required reload, preserve main-content position and restore it after the new seekable range is available:

- Near-live: use the existing configured live target, clamped to the new range.
- Start Over/timeshift more than 25 seconds behind: restore the saved main-content position.
- VOD: restore position unless ended or generation changed.
- Never use a preroll timestamp as a feature timestamp.

Handle behind-live-window separately: seek to the live target when possible, reload only if seeking cannot recover, and do not silently jump an expired Start Over session to live.

### P1 — Bound outer recovery and debounce reconnects

Native media retry backoff is 2,000–2,499 ms on the first retry and 3,500 ms thereafter (`p052w1/D.java:23–48`; Media3 `Loader.java:146–157`). Apply only after Shaka/OpenTV request retries finish:

- Initial watchdog recovery: immediate and single-flight.
- Outer recovery failure 1: 2,000–2,499 ms.
- Failure 2: 3,500 ms.
- Failure 3: surface fatal playback state rather than retry forever.
- Cancel on playing, zap, disposal, or generation change; reset after sustained stable playback.

Native connectivity recovery reloads after 1 second only when the no-network dialog is displayed (`W0/U1.java:106–130`). Browser offline/online handling should be less destructive: preserve player/buffers/position, avoid reload while buffered playback progresses, mark recovery-needed on starvation, and perform at most one single-flight recovery 1 second after reconnect if progress has not resumed.

### P2 — Measure player reuse across zaps

Native reuses player, track selector, load control, and bandwidth history while replacing the source (`p052w1/x.java:35–49`; `p052w1/E.java:116–127,287–325`). Browser can potentially retain Shaka/video elements and useful ABR history across zaps while incrementing generation and cancelling old work.

This is a **test-first** optimization, not an immediate replacement for Chrome's deterministic disposal. Measure startup latency and memory/leaks; retain disposal if OpenTV requires it. Chrome's generation guards remain superior to native channel-fetch behavior and must not be removed.

### Native recovery behavior not to copy

- The apparent `C0706e` custom buffer values are not reliably delegated; actual defaults remain active (`C0706e.java:20–40`; Media3 `DefaultLoadControl.java:104–105,177–280`). Keep Shaka/OpenTV buffer control.
- Native live-offset constants have confusing microsecond-oriented names, but the numeric setter values are coherent (10 seconds where applicable). They are still optional requested offsets, not values to copy blindly; use Shaka `liveSync`, not another speed controller (`p052w1/E.java:231–238`; `Renderer.java:1–8`; `DashMediaSource.java:656–725`).
- Reactive bandwidth caps can impose 800 kbps immediately because the initial estimate is 1 Mbps (`B0/i.java:375–432`; `p052w1/E.java:293–295`). Keep Shaka ABR; do not layer caps without hysteresis.
- Native permits effectively unlimited media retries (`p052w1/D.java:15–48`). Keep bounded status-aware browser retries; do not make every 503 instantly fatal or retry permanent 404/DRM/parser errors forever.
- Do not add a separate 10-second browser abort timer mirroring native HTTP (`p052w1/E.java:287–290`); Shaka/OpenTV owns request timeouts/cancellation.
- Never turn a six-second stall into `ended`; final ended belongs only to actual final main-content completion.
- Do not reproduce the 1 ms telemetry loop (`p052w1/G.java:15–21`; `B0/i.java:472–502`) or its algebraically invalid buffer-duration value (`B0/i.java:477–495`). Use events or low-rate/on-demand sampling.

### Recovery acceptance tests

1. Two low-buffer samples cause exactly one recovery; a transient one-sample stall causes none.
2. `playing`, pause, seek, zap, and disposal cancel only the intended generation's watchdog/timers.
3. Rapid A→B→C zaps produce no stale load/callback on C.
4. Main-content recovery does not replay completed prerolls; preroll recovery resumes the current preroll.
5. Start Over more than 25 seconds behind restores saved main-content position; near-live returns to the configured live target.
6. Buffered offline playback continues untouched; reconnect causes at most one debounced recovery.
7. Permanent HTTP/DRM/parser failures do not create infinite retry loops or duplicate Shaka/OpenTV recovery owners.

## WebView and feature-contract findings

### P0 — Preserve native stream-type semantics

Native `playvideo` receives `streamType` and supports DASH, HLS, MP3, and Media3 auto-detection (`p052w1/E.java:209–268`). The web selects HLS for eligible Outside Video channels and can override Kibuz (`UTILS.js:6098–6118`), but browser OpenTV always declares `application/dash+xml` (`UTILS.js:6808–6814`). Non-DASH sources can therefore be mistyped even when their URL is valid.

Recommendation: derive HTML5 source MIME from the same Outside Video/Kibuz rules; use HLS and `audio/mpeg` where appropriate, retain DASH as default, and review unnecessary DRM initialization for clear audio/HLS. Validate Outside Video, Kibuz, HOTMUSIC, and RADIO.

### P0 — Complete preroll transition semantics and isolate the ad from bookmarks

Native playlist transition `androidStreamStarted(1)` advances preroll count, clears/rearms preroll state, restores VOD controls, reports completion, sends feature CDR, runs feature bookmark logic, and rearms the feature timeout (`UTILS.js:13689–13706`; native transition at `p052w1/z.java:150–168`). Current `startFeatureAfterPreroll()` only changes flags and starts the feature.

There are also two bookmark hazards:

- Clearing `isPreerollPlayingNow` before disposing the ad can allow the ad timestamp to be saved as the feature position.
- The preroll's `loadstart` calls `onOTVPlayingStart`, which can schedule feature saved-position restoration on the ad (`UTILS.js:7081–7085`).

Recommendation: implement the web-safe completion/CDR/UI/bookmark side effects, suppress bookmark saving during ad disposal, and suppress feature initialization/`GoToSaveAssets()` while the preroll is active. Extend unit tests to prove no ad timestamp is saved or sought and that preroll limits and feature CDR run once.

### P1 — Restore STARTOVER/CATCHUP saved positions

Native calculates a resume offset in milliseconds using saved event position, duration, padding, and near-end rules (`UTILS.js:6156–6185,6206`; `p052w1/y.java:100–112`; `p052w1/E.java:409–430`). Browser `GoToSaveAssets()` explicitly skips STARTOVER/CATCHUP (`UTILS.js:7046–7051`), and Start Over setup always forces start time zero (`UTILS.js:6825–6833`). Chrome already saves these positions on close, so save/restore is currently one-sided.

Recommendation: restore valid saved event offsets after the catchup manifest is available, using native duration/padding/near-end rules. Test new playback, mid-event resume, near-end reset, and CATCHUP binge padding.

### P1 — Implement HTML5 Go To Live and live-edge recovery

Native `goToLive(long)` ignores its argument, seeks to the default live position, and resumes (`JavaScriptClass.java:195–203`; `p052w1/o.java:52–60`). Browser `TV_api.goToLive()` is empty (`TV_api.js:570–587`), and the live pause menu exposes Go To Live only in Android mode (`PlayerLive.js:918–929`). Adding only an Android bridge method would not make it reachable in Chrome.

Recommendation: implement HTML5 Go To Live using Shaka's default live position, falling back to the seekable live edge with the configured presentation delay; resume playback and expose the menu action for live content. Add internal behind-live-window recovery rather than relying on the absent `androidGoToLive` global.

### P1 — Trailer errors need trailer-only cleanup

Native trailer failure closes/hides only the trailer and performs end-of-trailer UI handling (`UTILS.js:12977–12985,13156–13165`). Current lifecycle error handling treats trailer failure like feature failure and can close the owning VOD module/show a feature error.

Recommendation: when `isTrailerPlayingNow` is true, dispose only the trailer and restore prior UI through trailer-specific cleanup. Add a trailer-error lifecycle test.

### P1 — Add nonfatal stalled-playback recovery

Native monitors repeated stalls with less than 500 ms buffered, calls `bufferAsEnded`, schedules recovery, resets near-live playback from the latest DASH URL where appropriate, and reports resume (`B0/i.java:435–466`; `p052w1/E.java:129–149`; `p052w1/z.java:103–135`; `UTILS.js:13550–13603`). Chrome currently handles fatal errors but has no `waiting`/`stalled` watchdog.

Recommendation: add generation-scoped waiting/stalled handling with conservative thresholds and loading UI, clear it on `playing`, and test temporary network loss for live, VOD, and Start Over.

### P2 — Gate LLC configuration by current content type

Native applies live/LLC configuration only when `videoType` is live (`p052w1/E.java:151–159,231–238`). Browser chooses the 6-second LLC configuration from `GlobalChannelPlaying.DASHLLC` for every content type (`UTILS.js:6808–6820`), which can leak live state into Start Over or other content.

Recommendation: use LLC configuration only when current application is LIVE and the playing channel is actually LLC.

### P2 — Bridge fallback details

Unknown Android bridge methods currently return undefined; native numeric/boolean getters use zero/false/empty fallbacks. Missing methods include `goToLive`, `FastForward`, `Rewind`, `getDefaultPositionMs`, `getWindowBufferStartMS`, and buffer getters. `seekToSaveAssetPosition` should seek and resume, not only seek (`p052w1/E.java:398–407`). `closeplayer` should stop/release rather than merely pause. Normal HTML5 playback bypasses most bridge calls, so these are lower priority than the HTML5 fixes.

Native `getCurrentTrack`/next/previous are playlist controls, not dubbing/audio-track APIs; no browser audio-track callback is required. Dubbing remains a URL-profile concern.

### P3 — Optional page metadata initialization

Native invokes `AndroidLoadPage` on page completion (`p052w1/w.java:13–38`; `UTILS.js:13397–13440`) to initialize RTL, local IP, OS/middleware version, trailer dimensions, and load completion. Chrome already supplies the important app version/client identity. Review only if trailer sizing/layout differs; hardware serial/MAC/IP and native surface/window APIs are not needed.

### Native-only behavior to keep out of Chrome

Lite Mode is a separate native ExoPlayer fallback that hides/destroys the WebView (`p052w1/k.java:30–75`; `p056y1/b.java:19–32`; `p052w1/r.java:28–101`). No browser work is indicated for it, native PIP/surface sizing, HDMI/audio focus, secure SurfaceView, app launching, remote-key dispatch, native ABR constants, or JSON Widevine challenge wrapping.

## Prioritized implementation/test plan

### Immediate correctness work

1. Complete preroll completion count, analytics/CDR, controls, and bookmark isolation; test with real VOD preroll when available.
2. Add trailer-specific failure cleanup and tests.
3. Make saved-position resume seek and play once on the feature; add STARTOVER/CATCHUP resume/near-end tests and PVR in-progress/completed coverage.
4. Add stream-type handling for Outside Video HLS and Kibuz/MP3 routes.
5. Implement paused-live Go To Live and behind-live-window recovery using the actual browser timeline.

### Measured robustness work

6. Add one conservative starvation watchdog with cancellation, position-preserving single-flight recovery, bounded outer retries, and reconnect debounce. Gate LLC configuration by actual content type.
7. Measure whether retaining Shaka/ABR state across zaps improves startup without leaks; otherwise retain deterministic per-generation disposal.
8. Tune native live/LLC offset targets only if current latency is demonstrably wrong.

### Leave unchanged

Raw Widevine protocol, encrypted H.264 selection, clear HEVC/no EME, standard H.264 DASH Start Over, sequential prerolls, fresh DRM sessions, generation guards, and media/license host routing.
