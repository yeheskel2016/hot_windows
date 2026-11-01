import fs from "node:fs";

const DEBUG_URL = "http://127.0.0.1:9223";
const source = [
    "lifecycle.js",
    "inject.js"
].map(file => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n\n");

async function findTarget() {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const targets = await (await fetch(`${DEBUG_URL}/json/list`)).json();
            const target = targets.find(item => item.type === "page" && item.url.includes("androidplay.hot.net.il"));
            if (target) return target;
        } catch (_) {
            // Chrome may still be starting.
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("Timed out waiting for the HOT Chrome window");
}

const target = await findTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
});

function call(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
}

await call("Page.enable");
await call("Page.addScriptToEvaluateOnNewDocument", { source });
await call("Page.reload", { ignoreCache: false });

let watchdogFailures = 0;
const watchdog = setInterval(async () => {
    try {
        const targets = await (await fetch(`${DEBUG_URL}/json/list`)).json();
        if (!targets.some(item => item.id === target.id)) {
            process.exit(0);
        }
        watchdogFailures = 0;
    } catch (_) {
        watchdogFailures += 1;
        if (watchdogFailures >= 3) {
            process.exit(0);
        }
    }
}, 5000);

ws.addEventListener("close", () => {
    clearInterval(watchdog);
    process.exit(0);
});
