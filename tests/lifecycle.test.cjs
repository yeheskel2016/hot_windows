const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const lifecycleSource = fs.readFileSync(require.resolve("../lifecycle.js"), "utf8");

function createHarness() {
    const urls = [];
    const requests = [];
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        document: {
            getElementById: () => null
        }
    };
    sandbox.window = sandbox;
    sandbox.player = null;
    vm.createContext(sandbox);
    vm.runInContext(lifecycleSource, sandbox);

    const utils = {
        Config: { Apps: { LIVE: "LIVE", VOD: "VOD", PVR: "PVR", STARTOVER: "STARTOVER", CATCHUP: "CATCHUP" } },
        VideoContainer: null,
        VideoPlayer: { player: null, IsPalyingNow: false },
        tv_api: { VideoApi: { getCurrentTime: () => 0 } },
        userCredential: null,
        DestroyArtimediaPlayer() {},
        onOTVPlayingStart() {},
        changePlayerWindowForTrailers() {},
        otvPrepareCloseAllModules() {},
        endTrailerStream() {},
        ShowPopupMessage() {},
        endPlayerStream() {},
        prerollUrl: "",
        isTrailerPlayingNow: false,
        isPreerollPlayingNow: false,
        isAfterPreroll: false
    };

    sandbox.otvplayer = function (elementId, options, loadedCallback) {
        const handlers = {};
        return {
            player_: {},
            disposed: false,
            paused: false,
            onLoaded: loadedCallback,
            on(name, callback) {
                (handlers[name] ||= []).push(callback);
            },
            emit(name) {
                for (const callback of handlers[name] || []) callback();
            },
            pause() {
                this.paused = true;
            },
            dispose() {
                this.disposed = true;
            },
            isDisposed() {
                return this.disposed;
            },
            otvtoolkit() {
                return { timeline: null, drmSecurityLevel: null };
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
    return { sandbox, utils, state, urls, requests };
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
    const { utils, state, urls } = createHarness();
    utils.prerollUrl = "ad.mpd";
    utils.SetPlayerUrl("feature.mpd", false, { id: 1 }, true);

    assert.deepEqual(urls, ["ad.mpd"]);
    assert.equal(state.pendingPreroll.featureUrl, "feature.mpd");
    assert.equal(utils.isPreerollPlayingNow, true);

    const prerollPlayer = state.activePlayer;
    prerollPlayer.onLoaded();
    prerollPlayer.emit("ended");

    assert.deepEqual(urls, ["ad.mpd", "feature.mpd"]);
    assert.equal(urls.every(url => !url.includes(",")), true);
    assert.equal(state.pendingPreroll, null);
    assert.equal(prerollPlayer.disposed, true);
    assert.notEqual(state.activePlayer, prerollPlayer);
    assert.equal(utils.isPreerollPlayingNow, false);
    assert.equal(utils.isAfterPreroll, true);
    assert.equal(state.generation, 1);
});

test("a failed preroll also falls through to the feature", () => {
    const { utils, state, urls } = createHarness();
    utils.prerollUrl = "broken-ad.mpd";
    utils.SetPlayerUrl("feature.mpd", false, { id: 1 }, true);

    const prerollPlayer = state.activePlayer;
    prerollPlayer.onLoaded();
    prerollPlayer.emit("error");

    assert.deepEqual(urls, ["broken-ad.mpd", "feature.mpd"]);
    assert.equal(state.pendingPreroll, null);
    assert.equal(utils.isPreerollPlayingNow, false);
});
