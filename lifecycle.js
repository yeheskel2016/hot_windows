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

        function isCurrent(generation, player) {
            return generation === state.generation &&
                player === state.activePlayer &&
                player === window.player;
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

        function clearPlaybackTimers() {
            for (const id of generationTimers) {
                clearTimeout(id);
            }
            generationTimers.clear();
            for (const name of [
                "timerPlayVideo",
                "timerPlayPreRoll",
                "showTrailerPlayer",
                "timeoutExitPlayer",
                "CdrTimeOut"
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
                    patchOpenTvDisposal(instance, generation);
                    return loadedCallback?.apply(this, args);
                });
                if (generation === state.generation) {
                    patchOpenTvDisposal(instance, generation);
                    state.activePlayer = instance;
                    state.activeGeneration = generation;
                } else {
                    disposePlayerInstance(instance);
                }
                return instance;
            };
        }

        function startFeatureAfterPreroll(generation) {
            const pending = state.pendingPreroll;
            if (!pending || pending.generation !== generation || generation !== state.generation) {
                return;
            }
            state.pendingPreroll = null;
            utils.isPreerollPlayingNow = false;
            utils.isAfterPreroll = true;
            beginGeneration();
            utils.SetPlayerUrl(pending.featureUrl, ...pending.playerArgs);
        }

        // Replace shared-global event handlers with generation/player-scoped ones.
        utils.setEventListeners = function () {
            const player = state.activePlayer || window.player;
            const generation = state.activeGeneration;
            if (!player?.on) {
                return;
            }

            player.on("pause", () => {
                if (!isCurrent(generation, player) || utils.isTrailerPlayingNow || state.pendingPreroll) {
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
                utils.onOTVPlayingStart();
            });

            player.on("playing", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                player.otvtoolkit?.().configure("abr.restrictions.maxHeight", undefined);
            });

            player.on("ended", () => {
                if (!isCurrent(generation, player)) {
                    return;
                }
                if (state.pendingPreroll?.generation === generation) {
                    startFeatureAfterPreroll(generation);
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
                if (state.pendingPreroll?.generation === generation) {
                    // A failed preroll must not block the requested feature.
                    startFeatureAfterPreroll(generation);
                    return;
                }
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
            });
        };

        const originalSetPlayerUrl = utils.SetPlayerUrl;
        utils.SetPlayerUrl = function (url, ...args) {
            const isPreroll = args[2] === true;
            if (!isPreroll) {
                return originalSetPlayerUrl.call(this, url, ...args);
            }

            const prerollUrl = utils.prerollUrl;
            utils.prerollUrl = "";
            if (!prerollUrl) {
                utils.isPreerollPlayingNow = false;
                return originalSetPlayerUrl.call(this, url, args[0], args[1], false);
            }

            state.pendingPreroll = {
                generation: state.generation,
                featureUrl: url,
                playerArgs: [args[0], args[1], false]
            };
            utils.isPreerollPlayingNow = true;
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
