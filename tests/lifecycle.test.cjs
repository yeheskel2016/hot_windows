const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const lifecycleSource = fs.readFileSync(require.resolve("../lifecycle.js"), "utf8");

function createHarness() {
    const urls = [];
    const requests = [];
    const calls = {
        showIconButtons: 0,
        checkToSaveAsset: 0,
        endPrerollViewing: 0,
        sendCDR: 0,
        savedAssetsAdd: 0,
        onOTVPlayingStart: 0,
        onEndOfTrailer: 0,
        prepareClose: 0,
        popup: 0,
        play: 0
    };
    const listeners = {};
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        addEventListener(name, callback) {
            (listeners[name] ||= []).push(callback);
        },
        dispatchEvent(name) {
            for (const callback of listeners[name] || []) callback();
        },
        document: {
            getElementById: () => null
        }
    };
    sandbox.window = sandbox;
    sandbox.player = null;
    sandbox.mainApp = {
        CurrentApplication: {
            AppName: "VOD",
            ModuleInView: {
                OnEndOfTrailerPlayEvent() { calls.onEndOfTrailer += 1; }
            },
            modules: {
                PLAYERVOD: {
                    obj: {
                        showIconButtons() { calls.showIconButtons += 1; },
                        checkToSaveAsset() { calls.checkToSaveAsset += 1; }
                    }
                },
                PLAYERLIVE: { obj: {} }
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(lifecycleSource, sandbox);

    const utils = {
        Config: {
            Apps: { LIVE: "LIVE", VOD: "VOD", PVR: "PVR", STARTOVER: "STARTOVER", CATCHUP: "CATCHUP" },
            ChannelType: { OutsideVideo: "OutsideVideo" },
            KibuzChannel: "999"
        },
        ResourceVod: {
            VideoPlayer: { PopupPause: { GoToLive: "Go To Live" } },
            GlobalTexts: { Popup: { Title: "Error" } },
            LoadData: { Error: "Playback error" }
        },
        VideoContainer: { className: "", querySelectorAll: () => [] },
        VideoPlayer: { player: null, IsPalyingNow: false },
        tv_api: { VideoApi: { getCurrentTime: () => 25 } },
        userCredential: null,
        GlobalChannelPlaying: null,
        GlobalVodPlayingItem: {},
        LiveChannels: [],
        catchupBingBufferPadding: 15000,
        isSaveAsset: () => null,
        DestroyArtimediaPlayer() {},
        onOTVPlayingStart() { calls.onOTVPlayingStart += 1; },
        changePlayerWindowForTrailers() {},
        otvPrepareCloseAllModules() { calls.prepareClose += 1; },
        endTrailerStream() {},
        ShowPopupMessage() { calls.popup += 1; },
        endPlayerStream() {},
        endPrerollViewing() { calls.endPrerollViewing += 1; },
        SendCDR() { calls.sendCDR += 1; },
        SavedAssetsAdd() { calls.savedAssetsAdd += 1; },
        isOnlyVodVisible: () => true,
        prerollUrl: "",
        numberOfWatchedPreroll: 0,
        isTrailerPlayingNow: false,
        isTrailerPlayingOnTheWay: false,
        isPreerollPlayingNow: false,
        isAfterPreroll: false
    };

    sandbox.otvplayer = function (elementId, options, loadedCallback) {
        const handlers = {};
        const toolkit = {
            timeline: null,
            drmSecurityLevel: null,
            configCalls: [],
            configure(...args) { this.configCalls.push(args); }
        };
        return {
            player_: {},
            tech_: { shaka_: null },
            disposed: false,
            paused: false,
            time: 0,
            source: null,
            playCalls: 0,
            onLoaded: loadedCallback,
            on(name, callback) {
                (handlers[name] ||= []).push(callback);
            },
            emit(name) {
                for (const callback of handlers[name] || []) callback();
            },
            currentTime(value) {
                if (value !== undefined) this.time = value;
                return this.time;
            },
            duration() { return 100; },
            seekable() {
                return { start: () => 100, end: () => 200 };
            },
            buffered() {
                return { length: 1, start: () => 0, end: () => 200 };
            },
            play() {
                this.playCalls += 1;
                calls.play += 1;
                this.paused = false;
                return Promise.resolve();
            },
            pause() {
                this.paused = true;
            },
            src(source) {
                this.source = source;
                return this;
            },
            dispose() {
                this.disposed = true;
            },
            isDisposed() {
                return this.disposed;
            },
            otvtoolkit() {
                return toolkit;
            }
        };
    };

    utils.SetPlayerUrl = function (url) {
        urls.push(url);
        const instance = sandbox.otvplayer("ng_VideoObject", {}, () => {
            utils.setEventListeners();
        });
        sandbox.player = instance;
        utils.VideoPlayer.player = instance;
        utils.VideoPlayer.IsPalyingNow = true;
        return instance;
    };
    utils.PlayLinearChannelNoSrm = function (channel, isPip, success, error) {
        return utils.getUniqeURL(channel, "LIVE", false, success, error);
    };
    utils.getUniqeURL = function (prop, app, isPreroll, success, error) {
        requests.push({ success, error });
    };

    const state = {};
    sandbox.installHotLifecycle(utils, state, () => {});
    return { sandbox, utils, state, urls, requests, calls, listeners };
}

test("stale stream callbacks cannot start an older channel", () => {
    const { utils, state, urls, requests } = createHarness();
    utils.PlayLinearChannelNoSrm("old.mpd", false, url => utils.SetPlayerUrl(url), null);
    utils.PlayLinearChannelNoSrm("new.mpd", false, url => utils.SetPlayerUrl(url), null);

    requests[0].success("old.mpd");
    assert.equal(urls.length, 0);
    assert.equal(state.ignoredStaleCallbacks, 1);

    requests[1].success("new.mpd");
    assert.deepEqual(urls, ["new.mpd"]);
    assert.equal(state.generation, 2);
});

test("preroll ends into the feature as a sequential playlist", () => {
    const { utils, state, urls, calls } = createHarness();
    utils.userCredential = {};
    utils.prerollUrl = "ad.mpd";
    utils.SetPlayerUrl("feature.mpd", false, { id: 1 }, true);

    assert.deepEqual(urls, ["ad.mpd"]);
    assert.equal(state.pendingPreroll.featureUrl, "feature.mpd");
    assert.equal(utils.isPreerollPlayingNow, true);

    const prerollPlayer = state.activePlayer;
    prerollPlayer.onLoaded();
    prerollPlayer.emit("loadstart");
    prerollPlayer.emit("ended");

    assert.deepEqual(urls, ["ad.mpd", "feature.mpd"]);
    assert.equal(urls.every(url => !url.includes(",")), true);
    assert.equal(state.pendingPreroll, null);
    assert.equal(prerollPlayer.disposed, true);
    assert.notEqual(state.activePlayer, prerollPlayer);
    assert.equal(utils.isPreerollPlayingNow, false);
    assert.equal(utils.isAfterPreroll, true);
    assert.equal(state.generation, 1);
    assert.equal(utils.numberOfWatchedPreroll, 1);
    assert.equal(calls.endPrerollViewing, 1);
    assert.equal(calls.sendCDR, 1);
    assert.equal(calls.showIconButtons, 1);
    assert.equal(calls.checkToSaveAsset, 1);
    assert.equal(calls.savedAssetsAdd, 0);
    assert.equal(calls.onOTVPlayingStart, 0);
});

test("a failed preroll also falls through to the feature", () => {
    const { utils, state, urls, calls } = createHarness();
    utils.userCredential = {};
    utils.prerollUrl = "broken-ad.mpd";
    utils.SetPlayerUrl("feature.mpd", false, { id: 1 }, true);

    const prerollPlayer = state.activePlayer;
    prerollPlayer.onLoaded();
    prerollPlayer.emit("error");

    assert.deepEqual(urls, ["broken-ad.mpd", "feature.mpd"]);
    assert.equal(state.pendingPreroll, null);
    assert.equal(utils.isPreerollPlayingNow, false);
    assert.equal(utils.numberOfWatchedPreroll, 0);
    assert.equal(calls.endPrerollViewing, 0);
    assert.equal(calls.sendCDR, 1);
    assert.equal(calls.savedAssetsAdd, 0);
});

test("trailer errors clean up only the trailer", () => {
    const { sandbox, utils, state, calls } = createHarness();
    utils.isTrailerPlayingNow = true;
    utils.SetPlayerUrl("trailer.mpd", false, {}, false);
    const player = state.activePlayer;
    player.onLoaded();
    player.emit("error");

    assert.equal(player.disposed, true);
    assert.equal(utils.isTrailerPlayingNow, false);
    assert.equal(utils.isTrailerPlayingOnTheWay, false);
    assert.equal(utils.VideoContainer.className, "hidden");
    assert.equal(calls.onEndOfTrailer, 1);
    assert.equal(calls.prepareClose, 0);
    assert.equal(calls.popup, 0);
    assert.equal(sandbox.mainApp.CurrentApplication.AppName, "VOD");
});

test("Start Over restores a valid saved position and resets near the end", () => {
    const { sandbox, utils, state } = createHarness();
    sandbox.mainApp.CurrentApplication.AppName = "STARTOVER";
    utils.GlobalVodPlayingItem = { EventId: "event-1", ZapNumber: "12", EventDuration: 3600 };
    utils.LiveChannels = [{ LCN: "12", PaaddingStart: 10, PaaddingEnd: 20 }];
    let savedPosition = 600;
    utils.isSaveAsset = () => [{ position: savedPosition }];

    utils.SetPlayerUrl("startover.mpd", false, {}, false);
    const player = state.activePlayer;
    const calls = [];
    player.tech_.shaka_ = {
        updateStartTime(value) {
            calls.push(value);
            return value;
        }
    };
    player.onLoaded();
    assert.equal(player.tech_.shaka_.updateStartTime(0), 600);

    savedPosition = 3595;
    const secondHarness = createHarness();
    secondHarness.sandbox.mainApp.CurrentApplication.AppName = "STARTOVER";
    secondHarness.utils.GlobalVodPlayingItem = utils.GlobalVodPlayingItem;
    secondHarness.utils.LiveChannels = utils.LiveChannels;
    secondHarness.utils.isSaveAsset = () => [{ position: savedPosition }];
    secondHarness.utils.SetPlayerUrl("startover.mpd", false, {}, false);
    const secondPlayer = secondHarness.state.activePlayer;
    secondPlayer.tech_.shaka_ = { updateStartTime: value => value };
    secondPlayer.onLoaded();
    assert.equal(secondPlayer.tech_.shaka_.updateStartTime(0), 0);
});

test("source MIME and LLC configuration follow content type", () => {
    const { sandbox, utils, state } = createHarness();
    sandbox.mainApp.CurrentApplication.AppName = "LIVE";
    utils.GlobalChannelPlaying = {
        Type: "OutsideVideo",
        isDashOutsideVideo: "",
        DASHLLC: true
    };
    utils.SetPlayerUrl("outside-video", false, {}, false);
    const player = state.activePlayer;
    player.src({ src: "outside-video", type: "application/dash+xml" });
    assert.equal(player.source.type, "application/x-mpegURL");

    const toolkit = player.otvtoolkit();
    toolkit.configure({ manifest: { defaultPresentationDelay: 6 } });
    assert.equal(toolkit.configCalls.at(-1)[0].manifest.defaultPresentationDelay, 6);

    sandbox.mainApp.CurrentApplication.AppName = "STARTOVER";
    toolkit.configure({ manifest: { defaultPresentationDelay: 6 } });
    assert.equal(toolkit.configCalls.at(-1)[0].manifest.defaultPresentationDelay, 10);
});

test("Go To Live seeks to the configured live target and resumes", () => {
    const { sandbox, utils, state, calls } = createHarness();
    sandbox.mainApp.CurrentApplication.AppName = "LIVE";
    utils.GlobalChannelPlaying = { DASHLLC: false };
    utils.SetPlayerUrl("live.mpd", false, {}, false);
    const player = state.activePlayer;
    player.paused = true;

    assert.equal(utils.tv_api.VideoApi.goToLive(0), true);
    assert.equal(player.time, 190);
    assert.equal(player.paused, false);
    assert.equal(calls.play, 1);

    player.onLoaded();
    player.time = 5;
    player.emit("error");
    assert.equal(player.time, 190);
    assert.equal(calls.prepareClose, 0);
});

function starve(player) {
    player.buffered = () => ({
        length: 1,
        start: () => Math.max(0, player.time - 0.1),
        end: () => player.time + 0.1
    });
}

test("watchdog recovers once after two stalled samples and restores position", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { sandbox, utils, state, urls } = createHarness();
    sandbox.mainApp.CurrentApplication.AppName = "LIVE";
    utils.GlobalChannelPlaying = { DASHLLC: false };
    utils.SetPlayerUrl("live.mpd", false, {}, false);
    const player = state.activePlayer;
    player.time = 100;
    player.onLoaded();
    starve(player);
    player.emit("playing");

    t.mock.timers.tick(5000);
    assert.equal(state.recoveryAttempts, 0);
    t.mock.timers.tick(1000);
    t.mock.timers.tick(0);

    assert.equal(state.recoveryAttempts, 1);
    assert.deepEqual(urls, ["live.mpd", "live.mpd"]);
    assert.equal(state.generation, 1);
    const recovered = state.activePlayer;
    recovered.onLoaded();
    recovered.emit("loadedmetadata");
    assert.equal(recovered.time, 100);
    recovered.emit("playing");
    assert.equal(state.recoveries, 1);
    t.mock.timers.reset();
});

test("watchdog resumes the current preroll without replaying the feature", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { utils, state, urls } = createHarness();
    utils.prerollUrl = "ad.mpd";
    utils.SetPlayerUrl("feature.mpd", false, {}, true);
    const player = state.activePlayer;
    player.time = 30;
    player.onLoaded();
    starve(player);
    player.emit("playing");

    t.mock.timers.tick(5000);
    t.mock.timers.tick(1000);
    t.mock.timers.tick(0);

    assert.deepEqual(urls, ["ad.mpd", "ad.mpd"]);
    assert.equal(state.recoveryAttempts, 1);
    const recoveredAd = state.activePlayer;
    recoveredAd.onLoaded();
    recoveredAd.emit("ended");
    assert.deepEqual(urls, ["ad.mpd", "ad.mpd", "feature.mpd"]);
    assert.equal(utils.numberOfWatchedPreroll, 1);
    t.mock.timers.reset();
});

test("pause cancels watchdog recovery", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { utils, state } = createHarness();
    utils.SetPlayerUrl("live.mpd", false, {}, false);
    const player = state.activePlayer;
    player.onLoaded();
    starve(player);
    player.emit("playing");
    player.emit("pause");

    t.mock.timers.tick(10000);
    assert.equal(state.recoveryAttempts, 0);
    t.mock.timers.reset();
});

test("offline starvation waits for reconnect before reloading", t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { sandbox, utils, state, urls } = createHarness();
    sandbox.navigator = { onLine: false };
    utils.SetPlayerUrl("live.mpd", false, {}, false);
    const player = state.activePlayer;
    player.onLoaded();
    starve(player);
    player.emit("playing");

    t.mock.timers.tick(5000);
    t.mock.timers.tick(1000);
    t.mock.timers.tick(0);
    assert.equal(state.recoveryAttempts, 1);
    assert.deepEqual(urls, ["live.mpd"]);

    sandbox.navigator.onLine = true;
    sandbox.dispatchEvent("online");
    t.mock.timers.tick(1000);
    assert.deepEqual(urls, ["live.mpd", "live.mpd"]);
    assert.equal(state.generation, 1);
    t.mock.timers.reset();
});
