(() => {
    "use strict";

    window.installHotLifecycle = function installHotLifecycle(utils, state, log) {
        const generationTimers = new Set();
        state.generation = 0;
        Object.defineProperties(state, {
            activePlayer: { value: null, writable: true, enumerable: false },
            pendingPreroll: { value: null, writable: true, enumerable: false }
        });
        state.activeGeneration = 0;
        state.disposedPlayers = 0;
        state.ignoredStaleCallbacks = 0;
        state.recoveries = 0;
        state.recoveryAttempts = 0;
        let watchdog = null;
        let recovery = null;
        let pendingRecovery = null;
        let currentMedia = null;
        let reconnectTimer = null;

        function isCurrent(generation, player) {
            return generation === state.generation &&
                player === state.activePlayer &&
                player === window.player;
        }

        function currentAppName() {
            return typeof mainApp !== "undefined" ? mainApp.CurrentApplication?.AppName : undefined;
        }

        function sourceMimeType(url) {
            const channel = utils.GlobalChannelPlaying;
            const appName = currentAppName();
            if (appName === utils.Config.Apps.LIVE && channel) {
                if (channel.Type === utils.Config.ChannelType.OutsideVideo && channel.isDashOutsideVideo === "") {
                    return "application/x-mpegURL";
                }
                if (channel.LCN === utils.Config.KibuzChannel) {
                    const streamType = String(channel.streamType || "").toLowerCase();
                    if (streamType === "hls") return "application/x-mpegURL";
                    if (streamType === "mp3") return "audio/mpeg";
                }
            }
            const path = String(url || "").split("?")[0].toLowerCase();
            if (path.endsWith(".m3u8")) return "application/x-mpegURL";
            if (path.endsWith(".mp3")) return "audio/mpeg";
            return "application/dash+xml";
        }

        function patchSourceAndConfiguration(player) {
            if (!player || player.__hotChromeSourcePatched) {
                return;
            }
            Object.defineProperty(player, "__hotChromeSourcePatched", {
                value: true,
                enumerable: false
            });

            if (typeof player.src === "function") {
                const originalSrc = player.src;
                player.src = function (source, ...args) {
                    if (source && typeof source === "object" && source.src) {
                        source = { ...source, type: sourceMimeType(source.src) };
                    }
                    return originalSrc.call(this, source, ...args);
                };
            }

            const toolkit = player.otvtoolkit?.();
            if (toolkit && typeof toolkit.configure === "function" && !toolkit.__hotChromeLatencyGuard) {
                Object.defineProperty(toolkit, "__hotChromeLatencyGuard", {
                    value: true,
                    enumerable: false
                });
                const originalConfigure = toolkit.configure;
                toolkit.configure = function (configuration, ...args) {
                    if (configuration && typeof configuration === "object" && configuration.manifest?.defaultPresentationDelay != null) {
                        const isLlc = currentAppName() === utils.Config.Apps.LIVE && utils.GlobalChannelPlaying?.DASHLLC === true;
                        configuration = {
                            ...configuration,
                            manifest: {
                                ...configuration.manifest,
                                defaultPresentationDelay: isLlc ? 6 : 10
                            }
                        };
                    }
                    return originalConfigure.call(this, configuration, ...args);
                };
            }
        }

        function trackedSetTimeout(callback, delay, generation) {
            const id = window.setTimeout(() => {
                generationTimers.delete(id);
                if (generation !== state.generation) {
                    state.ignoredStaleCallbacks += 1;
                    return;
                }
                callback();
            }, delay);
            generationTimers.add(id);
            return id;
        }

        function cancelWatchdog() {
            if (watchdog?.timer) {
                clearTimeout(watchdog.timer);
            }
            watchdog = null;
        }

        function cancelRecoverySchedule() {
            if (recovery?.timer) {
                clearTimeout(recovery.timer);
            }
            recovery = null;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        }

        function clearPlaybackTimers() {
            cancelWatchdog();
            cancelRecoverySchedule();
            for (const id of generationTimers) {
                clearTimeout(id);
            }
            generationTimers.clear();
            for (const name of [
                "timerPlayVideo",
                "timerPlayPreRoll",
                "showTrailerPlayer",
                "timeoutExitPlayer",
                "CdrTimeOut",
                "networkConnectionLoaderTimeout",
                "networkConnectionPopupTimeout"
            ]) {
                clearTimeout(utils[name]);
                utils[name] = null;
            }
            clearInterval(utils.metricsTimer);
            utils.metricsTimer = 0;
        }

        function patchOpenTvDisposal(player, generation) {
            try {
                const tech = player?.tech_;
                if (tech && typeof tech._reinjectErrorToListeners === "function" && !tech.__hotChromeErrorGuard) {
                    Object.defineProperty(tech, "__hotChromeErrorGuard", {
                        value: true,
                        enumerable: false
                    });
                    const original = tech._reinjectErrorToListeners;
                    tech._reinjectErrorToListeners = function (error) {
                        if (generation !== state.generation || state.activePlayer !== player || player.isDisposed?.()) {
                            state.ignoredStaleCallbacks += 1;
                            return undefined;
                        }
                        return original.call(this, error);
                    };
                }
            } catch (_) {
                // The tech may not have been created yet; retry from on-ready.
            }

            try {
                const security = player?.otvtoolkit?.().drmSecurityLevel;
                if (security && typeof security.dispose === "function" && !security.__hotChromeDisposeGuard) {
                    Object.defineProperty(security, "__hotChromeDisposeGuard", {
                        value: true,
                        enumerable: false
                    });
                    const original = security.dispose;
                    security.dispose = function (...args) {
                        const result = original.apply(this, args);
                        // Its in-flight getDrmInfo() promise may outlive disposal.
                        this.log = () => undefined;
                        return result;
                    };
                }
            } catch (_) {
                // Older OpenTV builds may not expose drmSecurityLevel.
            }

            try {
                const timeline = player?.otvtoolkit?.().timeline;
                if (!timeline || timeline.__hotChromeDisposalGuard) {
                    return;
                }
                Object.defineProperty(timeline, "__hotChromeDisposalGuard", {
                    value: true,
                    enumerable: false
                });
                const original = timeline._removeListeners;
                timeline._removeListeners = function (...args) {
                    if (!this.player) {
                        return undefined;
                    }
                    return original.apply(this, args);
                };
            } catch (_) {
                // Playback can continue if an older OpenTV build lacks timeline.
            }
        }

        function disposePlayerInstance(player) {
            if (!player) {
                return;
            }
            try {
                player.pause?.();
            } catch (_) {
                // The player may already be disposed.
            }
            try {
                if (player.player_ != null) {
                    player.dispose?.();
                }
            } catch (_) {
                // OpenTV can throw while disposing an already-torn-down tech.
            }
            state.disposedPlayers += 1;
        }

        function removeVideoElements() {
            const container = utils.VideoContainer || document.getElementById("videoContainer");
            if (!container?.querySelectorAll) {
                return;
            }
            for (const video of container.querySelectorAll("video")) {
                try {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                    video.remove();
                } catch (_) {
                    // A disposed Video.js element may already be detached.
                }
            }
        }

        function closeActivePlayer(isFromError) {
            cancelWatchdog();
            cancelRecoverySchedule();
            const player = state.activePlayer || utils.VideoPlayer?.player || window.player;
            try {
                utils.DestroyArtimediaPlayer?.();
            } catch (_) {
                // Advertising cleanup is independent of playback cleanup.
            }

            try {
                const appName = mainApp?.CurrentApplication?.AppName;
                const canSavePosition = !isFromError && !utils.isTrailerPlayingNow &&
                    !utils.isPreerollPlayingNow && utils.userCredential != null &&
                    (appName === utils.Config.Apps.VOD || appName === utils.Config.Apps.PVR ||
                        appName === utils.Config.Apps.STARTOVER || appName === utils.Config.Apps.CATCHUP) &&
                    utils.VideoPlayer?.IsPalyingNow;
                if (canSavePosition && utils.tv_api.VideoApi.getCurrentTime() > 0) {
                    utils.SavedAssetsAdd(utils.GlobalVodPlayingItem, utils.tv_api.VideoApi.getCurrentTime());
                }
            } catch (_) {
                // Bookmark failures must not prevent player disposal.
            }

            state.activePlayer = null;
            if (utils.VideoPlayer && utils.VideoPlayer.player === player) {
                utils.VideoPlayer.player = null;
            }
            if (window.player === player) {
                window.player = null;
            }
            if (utils.VideoPlayer) {
                utils.VideoPlayer.IsPalyingNow = false;
            }
            disposePlayerInstance(player);
            removeVideoElements();
        }

        function beginGeneration() {
            state.generation += 1;
            state.pendingPreroll = null;
            currentMedia = null;
            pendingRecovery = null;
            clearPlaybackTimers();
            closeActivePlayer(false);
            return state.generation;
        }

        function guardCallback(callback, generation) {
            if (typeof callback !== "function") {
                return callback;
            }
            return function (...args) {
                if (generation !== state.generation) {
                    state.ignoredStaleCallbacks += 1;
                    return undefined;
                }
                return callback.apply(this, args);
            };
        }

        function wrapPlayback(name) {
            const original = utils[name];
            if (typeof original !== "function") {
                return;
            }
            utils[name] = function (...args) {
                beginGeneration();
                return original.apply(this, args);
            };
        }

        for (const name of [
            "PlayLinearChannelNoSrm",
            "PlayPVRNoSrm",
            "PlayStartOver",
            "PlayHotMusic",
            "playVodTrailer",
            "PlayVodAsset",
            "PlayVodAssetNoSrm"
        ]) {
            wrapPlayback(name);
        }

        function wrapCallbacks(name, successIndex, errorIndex) {
            const original = utils[name];
            if (typeof original !== "function") {
                return;
            }
            utils[name] = function (...args) {
                const generation = state.generation;
                args[successIndex] = guardCallback(args[successIndex], generation);
                if (errorIndex != null) {
                    args[errorIndex] = guardCallback(args[errorIndex], generation);
                }
                return original.apply(this, args);
            };
        }

        wrapCallbacks("getUniqeURL", 3, 4);
        wrapCallbacks("getUniqeURL_StartOver", 4, 5);
        wrapCallbacks("OttAddAssetEntitlement", 2, 3);
        wrapCallbacks("getPreroll", 2, 3);

        const originalOtvPlayer = window.otvplayer;
        if (typeof originalOtvPlayer === "function") {
            window.otvplayer = function (elementId, options, loadedCallback) {
                const generation = state.generation;
                let instance;
                instance = originalOtvPlayer(elementId, options, function (...args) {
                    if (generation !== state.generation || instance !== state.activePlayer) {
                        state.ignoredStaleCallbacks += 1;
                        disposePlayerInstance(instance);
                        return undefined;
                    }
                    patchSourceAndConfiguration(instance);
                    patchOpenTvDisposal(instance, generation);
                    return loadedCallback?.apply(this, args);
                });
                if (generation === state.generation) {
                    patchSourceAndConfiguration(instance);
                    patchOpenTvDisposal(instance, generation);
                    state.activePlayer = instance;
                    state.activeGeneration = generation;
                } else {
                    disposePlayerInstance(instance);
                }
                return instance;
            };
        }

        function startoverResumeSeconds() {
            if (currentAppName() === utils.Config.Apps.CATCHUP && utils.isfromCatchupBing) {
                return Math.max(0, (Number(utils.catchupBingBufferPadding) - 2000) / 1000);
            }

            const item = utils.GlobalVodPlayingItem;
            const saved = item?.EventId ? utils.isSaveAsset(item.EventId) : null;
            if (!saved?.length) {
                return 0;
            }
            const position = parseInt(saved[0].position, 10);
            if (!Number.isFinite(position) || position <= 0) {
                return 0;
            }
            const channel = utils.LiveChannels?.find(candidate => candidate.LCN == item.ZapNumber);
            const padding = (Number(channel?.PaaddingStart) || 0) + (Number(channel?.PaaddingEnd) || 0);
            const duration = parseInt(item.EventDuration, 10) + padding;
            if (!Number.isFinite(duration) || position + 60 > duration || duration - 20 <= position) {
                return 0;
            }
            return position;
        }

        function patchStartoverResume(player) {
            const appName = currentAppName();
            if (appName !== utils.Config.Apps.STARTOVER && appName !== utils.Config.Apps.CATCHUP) {
                return;
            }
            const shaka = player.tech_?.shaka_;
            if (!shaka || shaka.__hotChromeStartoverResume) {
                return;
            }
            Object.defineProperty(shaka, "__hotChromeStartoverResume", {
                value: true,
                enumerable: false
            });

            if (typeof shaka.updateStartTime === "function") {
                const originalUpdateStartTime = shaka.updateStartTime;
                let consumed = false;
                shaka.updateStartTime = function (defaultStartTime) {
                    if (consumed) {
                        return originalUpdateStartTime.call(this, defaultStartTime);
                    }
                    consumed = true;
                    const resume = startoverResumeSeconds();
                    return originalUpdateStartTime.call(this, resume > 0 ? resume : defaultStartTime);
                };
            } else {
                let consumed = false;
                player.on("loadedmetadata", () => {
                    if (consumed) return;
                    consumed = true;
                    const resume = startoverResumeSeconds();
                    if (resume > 0) {
                        player.currentTime(resume);
                    }
                });
            }
        }

        function seekableRange(player) {
            try {
                const seekable = player?.seekable?.();
                if (seekable && Number.isFinite(seekable.start()) && Number.isFinite(seekable.end())) {
                    return { start: seekable.start(), end: seekable.end() };
                }
            } catch (_) {
                // Try Shaka's native range below.
            }
            try {
                const range = player?.tech_?.shaka_?.seekRange?.();
                if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
                    return range;
                }
            } catch (_) {
                // A live range may not be available yet.
            }
            return null;
        }

        function liveTargetSeconds(player) {
            const range = seekableRange(player);
            if (!range) {
                return null;
            }
            const delay = utils.GlobalChannelPlaying?.DASHLLC === true ? 6 : 10;
            return Math.max(range.start, range.end - delay);
        }

        function goToLive() {
            if (currentAppName() !== utils.Config.Apps.LIVE) {
                return false;
            }
            const player = state.activePlayer || window.player;
            const target = liveTargetSeconds(player);
            if (!player || target == null) {
                return false;
            }
            try {
                player.currentTime(target);
                Promise.resolve(player.play?.()).catch(() => undefined);
                return true;
            } catch (_) {
                return false;
            }
        }

        function isBehindLiveWindow(player) {
            if (currentAppName() !== utils.Config.Apps.LIVE) {
                return false;
            }
            const range = seekableRange(player);
            if (!range) {
                return false;
            }
            const currentTime = Number(player.currentTime());
            return Number.isFinite(currentTime) && (currentTime < range.start - 1 || currentTime > range.end + 1);
        }

        function bufferedAhead(player, currentTime) {
            try {
                const buffered = player.buffered();
                for (let index = 0; index < buffered.length; index++) {
                    if (currentTime >= buffered.start(index) && currentTime <= buffered.end(index)) {
                        return Math.max(0, buffered.end(index) - currentTime);
                    }
                }
            } catch (_) {
                // No containing range means no measurable buffer ahead.
            }
            return 0;
        }

        function showRecoveryUi() {
            if (typeof window.bufferAsEnded === "function") {
                window.bufferAsEnded();
            } else {
                utils.showLoadingMain?.(true, { LoaderId: "dvLoaderMain" });
            }
        }

        function clearRecoveryUi() {
            if (typeof window.playbackResume === "function") {
                window.playbackResume();
            } else {
                utils.showLoadingMain?.(false, { LoaderId: "dvLoaderMain" });
            }
        }

        function armWatchdog(player, generation, delay = 5000) {
            cancelWatchdog();
            const context = {
                player,
                generation,
                lastTime: Number(player.currentTime()) || 0,
                lowSamples: 0,
                timer: null
            };
            watchdog = context;

            function sample() {
                if (watchdog !== context || !isCurrent(generation, player) || recovery?.inFlight) {
                    return;
                }
                const paused = typeof player.paused === "function" ? player.paused() : player.paused;
                if (paused) {
                    cancelWatchdog();
                    return;
                }
                if (player.seeking?.()) {
                    context.timer = window.setTimeout(sample, 1000);
                    return;
                }

                const currentTime = Number(player.currentTime()) || 0;
                if (currentTime > context.lastTime + 0.05) {
                    context.lastTime = currentTime;
                    context.lowSamples = 0;
                } else if (bufferedAhead(player, currentTime) < 0.5) {
                    context.lowSamples += 1;
                } else {
                    context.lowSamples = 0;
                }

                if (context.lowSamples >= 2) {
                    cancelWatchdog();
                    startRecovery(player, generation);
                } else {
                    context.timer = window.setTimeout(sample, 1000);
                }
            }

            context.timer = window.setTimeout(sample, delay);
        }

        function startRecovery(player, generation, attempt = 1) {
            if (recovery?.inFlight || !currentMedia || currentMedia.generation !== generation) {
                return;
            }
            state.recoveryAttempts += 1;
            recovery = {
                player,
                generation,
                attempt,
                inFlight: true,
                waitingOnline: false,
                timer: null
            };
            showRecoveryUi();
            const delay = attempt === 1 ? 0 : attempt === 2 ? 2000 + Math.floor(Math.random() * 500) : 3500;
            recovery.timer = window.setTimeout(() => performRecovery(recovery), delay);
        }

        function performRecovery(context) {
            if (recovery !== context || !context.inFlight || context.generation !== state.generation) {
                return;
            }
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
                context.waitingOnline = true;
                return;
            }

            const media = currentMedia;
            if (!media || media.generation !== context.generation) {
                recovery = null;
                return;
            }
            const player = context.player;
            const position = Number(player?.currentTime?.()) || 0;
            const range = seekableRange(player);
            const nearLive = currentAppName() === utils.Config.Apps.LIVE && range && range.end - position <= 25;
            const preroll = state.pendingPreroll ? {
                ...state.pendingPreroll,
                playerArgs: [...state.pendingPreroll.playerArgs]
            } : null;

            beginGeneration();
            recovery = {
                player: null,
                generation: state.generation,
                attempt: context.attempt,
                inFlight: true,
                waitingOnline: false,
                timer: null
            };
            pendingRecovery = {
                generation: state.generation,
                position,
                nearLive,
                applied: false
            };

            try {
                if (preroll) {
                    state.pendingPreroll = { ...preroll, generation: state.generation };
                    utils.prerollUrl = media.url;
                    utils.SetPlayerUrl(preroll.featureUrl, preroll.playerArgs[0], preroll.playerArgs[1], true);
                } else {
                    utils.SetPlayerUrl(media.url, ...media.playerArgs);
                }
            } catch (_) {
                handleRecoveryError(state.activePlayer, state.generation);
            }
        }

        function handleRecoveryError(player, generation) {
            if (!recovery?.inFlight || recovery.generation !== generation) {
                return false;
            }
            const attempt = recovery.attempt;
            pendingRecovery = null;
            recovery = null;
            if (attempt >= 3) {
                clearRecoveryUi();
                handleFatalPlaybackError(player, generation);
                return true;
            }
            startRecovery(player, generation, attempt + 1);
            return true;
        }

        function applyPendingRecovery(player, generation) {
            if (!pendingRecovery || pendingRecovery.generation !== generation || pendingRecovery.applied) {
                return;
            }
            if (pendingRecovery.nearLive) {
                if (!goToLive()) {
                    return;
                }
            } else {
                const range = seekableRange(player);
                const position = range
                    ? Math.min(Math.max(pendingRecovery.position, range.start), range.end)
                    : pendingRecovery.position;
                player.currentTime(position);
            }
            pendingRecovery.applied = true;
        }

        window.addEventListener("offline", () => {
            if (recovery) {
                recovery.waitingOnline = true;
            }
        });

        window.addEventListener("online", () => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }
            const generation = state.generation;
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                if (!recovery || recovery.generation !== generation || !recovery.waitingOnline) {
                    return;
                }
                recovery.waitingOnline = false;
                performRecovery(recovery);
            }, 1000);
        });

        window.__hotGoToLive = goToLive;
        window.__hotCloseActivePlayer = closeActivePlayer;
        utils.tv_api.VideoApi.goToLive = goToLive;
        window.__hotGetDefaultPositionMs = () => {
            const target = liveTargetSeconds(state.activePlayer || window.player);
            return target == null ? 0 : target * 1000;
        };

        function patchLivePauseMenu() {
            const live = typeof mainApp !== "undefined" ? mainApp.CurrentApplication?.modules?.PLAYERLIVE?.obj : null;
            if (!live || typeof live.InitializeLive !== "function" || live.__hotChromeGoToLiveMenu) {
                return;
            }
            Object.defineProperty(live, "__hotChromeGoToLiveMenu", {
                value: true,
                enumerable: false
            });
            const originalInitializeLive = live.InitializeLive;
            live.InitializeLive = function (...args) {
                const result = originalInitializeLive.apply(this, args);
                const exit = this.PauseButtons?.find(button => button.type === "Exit");
                if (exit) {
                    exit.text = utils.ResourceVod.VideoPlayer.PopupPause.GoToLive;
                    exit.action = () => {
                        goToLive();
                        if (typeof $ === "function") {
                            $("#mod_PlayerLive_Container").removeClass("paused");
                            $("#" + this.name + "_PauseBlock").addClass("hidden");
                        }
                    };
                    if (typeof $ === "function") {
                        const index = this.PauseButtons.indexOf(exit);
                        $("#" + this.name + "_PauseBlock .actionButton").eq(index).text(exit.text);
                    }
                }
                return result;
            };
        }

        function startFeatureAfterPreroll(generation, completed) {
            const pending = state.pendingPreroll;
            if (!pending || pending.generation !== generation || generation !== state.generation) {
                return;
            }

            state.pendingPreroll = null;
            // Keep isPreerollPlayingNow true while disposing the ad so its
            // timestamp can never be saved as the feature bookmark.
            beginGeneration();
            utils.isPreerollPlayingNow = false;
            utils.isAfterPreroll = true;

            if (completed) {
                utils.numberOfWatchedPreroll = (Number(utils.numberOfWatchedPreroll) || 0) + 1;
                try {
                    utils.endPrerollViewing();
                } catch (_) {
                    // Analytics must not block the feature.
                }
            }

            try {
                mainApp?.CurrentApplication?.modules?.PLAYERVOD?.obj?.showIconButtons?.();
            } catch (_) {
                // UI restoration is best-effort and must not block playback.
            }
            utils.IsPlayingSamsungNow = false;
            utils.AndroidPlayOk = false;
            clearTimeout(utils.timerPlayVideo);

            try {
                utils.SendCDR(utils.GlobalVodPlayingItem);
            } catch (_) {
                // CDR is independent of media initialization.
            }
            utils.SetPlayerUrl(pending.featureUrl, ...pending.playerArgs);
            try {
                mainApp?.CurrentApplication?.modules?.PLAYERVOD?.obj?.checkToSaveAsset?.();
            } catch (_) {
                // The normal on-playing path also handles saved positions.
            }
        }

        function handleFatalPlaybackError(player, generation) {
            trackedSetTimeout(() => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                utils.otvPrepareCloseAllModules(true);
                utils.ShowPopupMessage(
                    utils.ResourceVod.GlobalTexts.Popup.Title,
                    utils.ResourceVod.LoadData.Error,
                    false,
                    null,
                    null,
                    0,
                    null,
                    5000,
                    true
                );
            }, 5000, generation);
        }

        // Replace shared-global event handlers with generation/player-scoped ones.
        utils.setEventListeners = function () {
            const player = state.activePlayer || window.player;
            const generation = state.activeGeneration;
            if (!player?.on) {
                return;
            }
            patchStartoverResume(player);

            player.on("pause", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                cancelWatchdog();
                if (recovery) {
                    cancelRecoverySchedule();
                    pendingRecovery = null;
                    clearRecoveryUi();
                }
                if (utils.isTrailerPlayingNow || state.pendingPreroll) {
                    return;
                }
                if (player.duration?.() === 0) {
                    utils.otvPrepareCloseAllModules(true);
                }
            });

            player.on("loadstart", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                // Never apply the dormant PC path's maxHeight=1 restriction.
                player.otvtoolkit?.().configure("abr.restrictions.maxHeight", undefined);
                if (!state.pendingPreroll) {
                    patchLivePauseMenu();
                    utils.onOTVPlayingStart();
                }
            });

            player.on("loadedmetadata", () => {
                if (isCurrent(generation, player)) {
                    applyPendingRecovery(player, generation);
                }
            });

            player.on("seeked", () => {
                if (isCurrent(generation, player)) {
                    armWatchdog(player, generation);
                }
            });

            player.on("playing", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                player.otvtoolkit?.().configure("abr.restrictions.maxHeight", undefined);
                applyPendingRecovery(player, generation);
                if (recovery) {
                    state.recoveries += 1;
                    recovery = null;
                    pendingRecovery = null;
                }
                if (utils.isOnBufferEndedEvent) {
                    clearRecoveryUi();
                }
                armWatchdog(player, generation);
            });

            player.on("ended", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                if (state.pendingPreroll?.generation === generation) {
                    startFeatureAfterPreroll(generation, true);
                    return;
                }
                utils.changePlayerWindowForTrailers(true);
                if (utils.isTrailerPlayingNow) {
                    utils.endTrailerStream();
                } else {
                    utils.otvPrepareCloseAllModules();
                }
            });

            player.on("error", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                if (utils.isTrailerPlayingNow) {
                    closeActivePlayer(true);
                    try {
                        if (utils.isOnlyVodVisible()) {
                            mainApp.CurrentApplication.ModuleInView.OnEndOfTrailerPlayEvent();
                        }
                    } catch (_) {
                        // Trailer cleanup must not close the owning VOD module.
                    }
                    utils.VideoContainer.className = "hidden";
                    utils.isTrailerPlayingNow = false;
                    utils.isTrailerPlayingOnTheWay = false;
                    return;
                }
                if (state.pendingPreroll?.generation === generation) {
                    // A failed preroll must not block the requested feature.
                    startFeatureAfterPreroll(generation, false);
                    return;
                }
                if (isBehindLiveWindow(player) && goToLive()) {
                    return;
                }
                if (handleRecoveryError(player, generation)) {
                    return;
                }
                if (player.error?.()?.code === 2) {
                    startRecovery(player, generation);
                    return;
                }
                handleFatalPlaybackError(player, generation);
            });
        };

        const originalSetPlayerUrl = utils.SetPlayerUrl;
        utils.SetPlayerUrl = function (url, ...args) {
            const isPreroll = args[2] === true;
            if (!isPreroll) {
                currentMedia = {
                    generation: state.generation,
                    url,
                    playerArgs: args,
                    kind: "feature"
                };
                return originalSetPlayerUrl.call(this, url, ...args);
            }

            const prerollUrl = utils.prerollUrl;
            utils.prerollUrl = "";
            if (!prerollUrl) {
                utils.isPreerollPlayingNow = false;
                currentMedia = {
                    generation: state.generation,
                    url,
                    playerArgs: [args[0], args[1], false],
                    kind: "feature"
                };
                return originalSetPlayerUrl.call(this, url, args[0], args[1], false);
            }

            state.pendingPreroll = {
                generation: state.generation,
                featureUrl: url,
                playerArgs: [args[0], args[1], false]
            };
            utils.isPreerollPlayingNow = true;
            currentMedia = {
                generation: state.generation,
                url: prerollUrl,
                playerArgs: [args[0], args[1], false],
                kind: "preroll"
            };
            // Play the preroll as item one. The scoped ended/error handlers
            // start item two instead of passing a native comma list to Shaka.
            return originalSetPlayerUrl.call(this, prerollUrl, args[0], args[1], false);
        };

        utils.OtvClosePlayer = function (isFromError) {
            closeActivePlayer(isFromError);
        };

        const originalEndPlayerStream = utils.endPlayerStream;
        utils.endPlayerStream = function (...args) {
            try {
                return originalEndPlayerStream.apply(this, args);
            } finally {
                closeActivePlayer(args[0]);
            }
        };

        state.lifecyclePatched = true;
        log("Lifecycle hardening active: generation guards, disposal, timers, and sequential prerolls.");
    };
})();
