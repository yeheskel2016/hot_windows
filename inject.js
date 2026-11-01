(() => {
    "use strict";

    // Chrome's command-line UA override handles the server's network check.
    // Keep the JavaScript-facing navigator desktop-like for the OpenTV/Shaka
    // player, while MainStartUp is separately guided into its HTML5 PC branch.
    const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
    try {
        Object.defineProperties(navigator, {
            userAgent: { configurable: true, get: () => DESKTOP_UA },
            appVersion: { configurable: true, get: () => DESKTOP_UA.replace("Mozilla/", "") },
            platform: { configurable: true, get: () => "Win32" },
            vendor: { configurable: true, get: () => "Google Inc." }
        });
    } catch (_) {
        // The app-level platform patch below is sufficient if a browser does
        // not allow these navigator properties to be shadowed.
    }

    const PREFIX = "[HOT Chrome]";
    const state = window.__hotChrome = {
        version: "1.5.0",
        patched: false,
        streamProfile: "ANDROID",
        streamRequests: 0,
        playerRequests: 0,
        lastStreamHost: null,
        lastError: null,
        sessionBackedUp: false,
        sessionRestored: false
    };

    const SESSION_BACKUP_KEY = "hotChromeSessionBackupV1";

    function saveSessionBackup() {
        const credential = localStorage.getItem("userCredential_NOLIMITS");
        const clientCA = localStorage.getItem("ClientCA_SN");
        const deviceId = localStorage.getItem("Client_DeviceID");
        if (!credential || !clientCA || !deviceId) {
            return false;
        }
        localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            credential,
            clientCA,
            deviceId
        }));
        state.sessionBackedUp = true;
        return true;
    }

    function installSessionPersistence() {
        try {
            if (!localStorage.getItem("userCredential_NOLIMITS")) {
                const backup = JSON.parse(localStorage.getItem(SESSION_BACKUP_KEY) || "null");
                if (backup?.version === 1 && backup.credential && backup.clientCA && backup.deviceId) {
                    localStorage.setItem("userCredential_NOLIMITS", backup.credential);
                    localStorage.setItem("ClientCA_SN", backup.clientCA);
                    localStorage.setItem("Client_DeviceID", backup.deviceId);
                    state.sessionRestored = true;
                    log("Restored the saved HOT session backup.");
                }
            }
            saveSessionBackup();
            window.setInterval(saveSessionBackup, 2000);
            window.addEventListener("pagehide", saveSessionBackup);
        } catch (error) {
            log("Could not maintain the local session backup.", error);
        }
    }

    function log(message, error) {
        if (error) {
            console.error(`${PREFIX} ${message}`, error);
        } else {
            console.info(`${PREFIX} ${message}`);
        }
    }

    function installAndroidStorageBridge() {
        if (window.Android) {
            return;
        }

        const video = () => window.player || document.getElementById("ng_VideoObject");
        const noop = () => undefined;
        const bridge = {
            getSavedString(key) {
                return localStorage.getItem(key) || "";
            },
            saveString(key, value) {
                localStorage.setItem(key, value == null ? "" : String(value));
            },
            getAppVersion: () => "10.1.52.18",
            getDeviceModel: () => "Android TV",
            getMac: () => "",
            getMacName: () => "Chrome-PC",
            getLocalIp: () => "",
            getResolutionSize: () => JSON.stringify({
                width: window.screen.width,
                height: window.screen.height
            }),
            getCurrentTime() {
                const player = video();
                const seconds = typeof player?.currentTime === "function"
                    ? player.currentTime()
                    : player?.currentTime;
                return Math.max(0, Number(seconds) || 0) * 1000;
            },
            getDuration() {
                const player = video();
                const seconds = typeof player?.duration === "function"
                    ? player.duration()
                    : player?.duration;
                return Math.max(0, Number(seconds) || 0) * 1000;
            },
            getIsPaused() {
                const player = video();
                return typeof player?.paused === "function" ? player.paused() : Boolean(player?.paused);
            },
            setPlay() {
                const player = video();
                Promise.resolve(player?.play?.()).catch(noop);
            },
            setPause() {
                video()?.pause?.();
            },
            seekTo(milliseconds) {
                const player = video();
                if (typeof player?.currentTime === "function") {
                    player.currentTime((Number(milliseconds) || 0) / 1000);
                } else if (player) {
                    player.currentTime = (Number(milliseconds) || 0) / 1000;
                }
            },
            seekToSaveAssetPosition(milliseconds) {
                this.seekTo(milliseconds);
                const player = video();
                Promise.resolve(player?.play?.()).catch(noop);
            },
            goToLive() {
                return window.__hotGoToLive?.();
            },
            getDefaultPositionMs() {
                return window.__hotGetDefaultPositionMs?.() || 0;
            },
            getWindowBufferStartMS() {
                const player = video();
                try { return (player?.seekable?.().start?.() || 0) * 1000; }
                catch (_) { return 0; }
            },
            playerBufferDurationMS() {
                const player = video();
                try {
                    const current = player?.currentTime?.() || 0;
                    const buffered = player?.buffered?.();
                    for (let index = 0; index < (buffered?.length || 0); index++) {
                        if (current >= buffered.start(index) && current <= buffered.end(index)) {
                            return Math.max(0, buffered.end(index) - current) * 1000;
                        }
                    }
                } catch (_) { }
                return 0;
            },
            FastForward(milliseconds) {
                this.seekTo(milliseconds);
            },
            Rewind(milliseconds) {
                this.seekTo(milliseconds);
            },
            getCurrentTrack: () => 0,
            closeplayer() {
                if (typeof window.__hotCloseActivePlayer === "function") {
                    window.__hotCloseActivePlayer(false);
                } else {
                    video()?.pause?.();
                }
            },
            ExitApp() {
                window.close();
            }
        };

        window.Android = new Proxy(bridge, {
            get(target, property) {
                return property in target ? target[property] : noop;
            }
        });
    }

    function patchUtils(utils) {
        if (!utils || utils.__hotChromePatched) {
            return;
        }

        Object.defineProperty(utils, "__hotChromePatched", {
            value: true,
            enumerable: false
        });

        // The Android UA is needed only at the HTTP layer. In the page, select
        // the existing HTML5/OpenTV branch instead of the native WebView branch.
        utils.IsHisense = false;
        utils.IsHisenseNewVersion = false;
        utils.IsSamsung = false;
        utils.IsLG = false;
        utils.IsAndroid = false;
        utils.IsPC = false; // start.js selects PC mode and creates the video element.
        utils.ClientID = 7; // Keep login/device registration consistent with Android TV.
        utils.AndroidVer = "10.1.52.18";

        function withMode(mode, callback) {
            const names = ["IsAndroid", "IsPC", "IsHotStreamer"];
            const saved = {};
            for (const name of names) {
                saved[name] = utils[name];
            }
            Object.assign(utils, mode);
            try {
                return callback();
            } finally {
                Object.assign(utils, saved);
            }
        }

        function asAndroidUrlRequest(callback) {
            return withMode({ IsAndroid: true, IsPC: false, IsHotStreamer: false }, callback);
        }

        function asHtml5Player(callback) {
            return withMode({ IsAndroid: false, IsPC: false, IsHotStreamer: false }, callback);
        }

        function wrap(name, mode) {
            const original = utils[name];
            if (typeof original !== "function") {
                log(`Could not find ${name}; playback compatibility may be incomplete.`);
                return;
            }

            utils[name] = function (...args) {
                const invoke = () => original.apply(this, args);
                return mode === "url" ? asAndroidUrlRequest(invoke) : asHtml5Player(invoke);
            };
        }

        // Keep HOT's AndroidTV identity throughout. Clear-play channels are
        // unencrypted HEVC and use Chrome's native HEVC decoder. Encrypted
        // DASHHEVC=false channels supply H.264 and use Chrome Widevine.
        // LG remains available as a manual H.264 fallback for diagnostics.
        const service = window.WsVodkaFB_OTT;
        if (service && !service.__hotChromeH264Profile) {
            Object.defineProperty(service, "__hotChromeH264Profile", {
                value: true,
                enumerable: false
            });
            for (const name of ["getUniqueUrlClient", "GetUniqeURL_StartOverClient"]) {
                const original = service[name];
                if (typeof original !== "function") {
                    continue;
                }
                service[name] = function (sendParam, ...args) {
                    const isClearPlay = sendParam.isClearForceNeeded === true;
                    const deviceType = isClearPlay ? "ANDROID" : (window.__hotChromeDeviceType || "ANDROID");
                    state.streamProfile = isClearPlay ? "ANDROID_CLEAR_HEVC" : deviceType;
                    return original.call(this, { ...sendParam, DeviceType: deviceType }, ...args);
                };
            }
        }

        // These functions otherwise return STAM LINK or an expired demo URL in PC mode.
        for (const name of [
            "getUniqeURL",
            "getUniqeURL_StartOver",
            "PlayLinearChannelNoSrm",
            "PlayPVRNoSrm",
            "PlayStartOver",
            "PlayHotMusic",
            "playVodTrailer"
        ]) {
            wrap(name, "url");
        }

        // EnableClearCU replaces the standard catchup asset with an encrypted
        // HEVC-only rendition. Chrome Widevine cannot play that rendition, but
        // the original HLSurlSimple asset provides H.264 with the same entitlements.
        const originalPlayStartOver = utils.PlayStartOver;
        utils.PlayStartOver = function (...args) {
            const saved = utils.EnableClearCU;
            utils.EnableClearCU = false;
            try {
                return originalPlayStartOver.apply(this, args);
            } finally {
                utils.EnableClearCU = saved;
            }
        };

        function isClearPlayback(url) {
            try {
                const device = new URL(url, location.href).searchParams.get("device") || "";
                if (device) {
                    return device.startsWith("NAGRA-CLR-");
                }
            } catch (_) {
                // Fall through to the channel metadata check.
            }

            if (!utils.enableClearPlayForce || utils.IsHotMusicOpen ||
                mainApp?.CurrentApplication?.AppName !== utils.Config.Apps.LIVE ||
                mainApp.CurrentApplication.modules.PLAYERLIVE.obj.isCarryingNetworkOn !== false) {
                return false;
            }
            const channel = utils.GlobalChannelPlaying;
            const zap = channel?.lcn ?? channel?.LCN;
            return [utils.clearPlayChannelsData, utils.clearPlayChannelsDataLLC]
                .some(list => Array.isArray(list) && list.some(item => String(item.zap) === String(zap)));
        }

        const originalSetPlayerUrl = utils.SetPlayerUrl;
        utils.SetPlayerUrl = function (url, ...args) {
            state.playerRequests += 1;
            state.clearPlayback = isClearPlayback(url);
            try {
                const parsed = new URL(url, location.href);
                state.lastStreamHost = parsed.host;
                log(`HTML5 player request ${state.playerRequests}: ${parsed.host} (${state.clearPlayback ? "clear" : "Widevine"})`);
            } catch (_) {
                state.lastStreamHost = null;
            }
            return asHtml5Player(() => originalSetPlayerUrl.call(this, url, ...args));
        };

        const originalOtvPlayerSetPlay = utils.otvPlayerSetPlay;
        utils.otvPlayerSetPlay = function (url, ...args) {
            if (!isClearPlayback(url)) {
                return originalOtvPlayerSetPlay.call(this, url, ...args);
            }
            // otvPlayerSetPlay reads this flag synchronously when constructing
            // its DRM options. Clear HEVC must not initialize a Widevine session.
            const saved = utils.IsLocalDebug;
            utils.IsLocalDebug = true;
            try {
                return originalOtvPlayerSetPlay.call(this, url, ...args);
            } finally {
                utils.IsLocalDebug = saved;
            }
        };

        const originalGetUniqueUrl = utils.getUniqeURL;
        utils.getUniqeURL = function (...args) {
            state.streamRequests += 1;
            return originalGetUniqueUrl.apply(this, args);
        };

        // The dormant PC path configures maxHeight=1 on loadstart. Shaka then
        // filters out every actual representation before playback begins.
        const originalSetEventListeners = utils.setEventListeners;
        utils.setEventListeners = function (...args) {
            const result = originalSetEventListeners.apply(this, args);
            const toolkit = window.player?.otvtoolkit?.();
            if (toolkit && !toolkit.__hotChromeConfigurePatched) {
                Object.defineProperty(toolkit, "__hotChromeConfigurePatched", {
                    value: true,
                    enumerable: false
                });
                const originalConfigure = toolkit.configure;
                toolkit.configure = function (...configureArgs) {
                    if (configureArgs[0] === "abr.restrictions.maxHeight" && configureArgs[1] === 1) {
                        return;
                    }
                    return originalConfigure.apply(this, configureArgs);
                };
            }
            return result;
        };

        if (typeof window.installHotLifecycle === "function") {
            window.installHotLifecycle(utils, state, log);
        } else {
            log("Lifecycle module is unavailable; using the stable playback path.");
        }

        state.patched = true;
        log("Compatibility layer active: AndroidTV clear HEVC plus H.264/Widevine playback.");
    }

    installSessionPersistence();
    installAndroidStorageBridge();

    // start.js assigns GlobalUtils after UTILS.js loads and before document.ready.
    // Capturing that assignment lets us patch it before MainStartUp.Initialize runs.
    let globalUtils;
    Object.defineProperty(window, "GlobalUtils", {
        configurable: true,
        enumerable: true,
        get() {
            return globalUtils;
        },
        set(value) {
            globalUtils = value;
            try {
                patchUtils(value);
            } catch (error) {
                state.lastError = String(error);
                log("Failed to install compatibility layer.", error);
            }
        }
    });

    window.addEventListener("error", (event) => {
        if (event.error) {
            state.lastError = String(event.error);
        }
    });
})();
