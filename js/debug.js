// デバッグモード: log, crash detection (did the last visit end cleanly?) and step-by-step diagnosis
// tests for "Safari crashes / reloads the page". Everything stays in this browser's localStorage.

const LOG_KEY = "karitomo.log.v1", SESSION_KEY = "karitomo.session.v1", CRASH_KEY = "karitomo.crashes.v1", DIAG_KEY = "karitomo.diag.v1";
const LOG_MAX = 300; // entries; over the limit the older half is dropped

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const stamp = () => new Date().toLocaleString("ja-JP");

// ------------------------------------------------------------------ log (off unless enabled)
let logOn = false;
export function setLogging(on) { logOn = !!on; }
export function log(msg) {
  if (!logOn) return;
  const L = read(LOG_KEY, []);
  L.push(`${stamp()} ${String(msg).slice(0, 300)}`);
  write(LOG_KEY, L.length > LOG_MAX ? L.slice(L.length - LOG_MAX / 2) : L);
}
export const logText = () => read(LOG_KEY, []).join("\n");
export const clearLog = () => { try { localStorage.removeItem(LOG_KEY); } catch { /* nothing saved */ } };

// ------------------------------------------------------------------ session / crash detection
// state: "open" (visible) / "hidden" (in the background) / "closed" (page left normally).
// On the next start, "open" means the visit ended while on screen (crash or forced quit);
// "hidden" means it ended in the background (iOS may close tabs there when memory runs low,
// or the user swiped the app away — the two cannot be told apart).
let tracking = false, listening = false;
export function startSession(version, page) {
  const prev = read(SESSION_KEY, null);
  const diag = read(DIAG_KEY, null);
  if (prev && prev.state !== "closed") {
    const C = read(CRASH_KEY, []);
    C.push({ at: prev.at, ended: prev.state, page: prev.page, version: prev.version, step: diag?.running || null, found: stamp() });
    write(CRASH_KEY, C.slice(-20));
    log(`前回は${prev.state === "open" ? "表示中" : "裏に回っているあいだ"}に終わりました（${prev.page}）`);
  }
  if (diag?.running) {
    diag.results = [...(diag.results || []), { name: diag.running, result: "この試験の最中に落ちた（または閉じられた）", bad: true, at: diag.startedAt }];
    diag.running = null;
    write(DIAG_KEY, diag);
  }
  tracking = true;
  const set = (state) => write(SESSION_KEY, { state, at: stamp(), page: location.hash || "#", version });
  set(document.visibilityState === "hidden" ? "hidden" : "open");
  if (!listening) {
    listening = true;
    addEventListener("hashchange", () => tracking && set("open"));
    document.addEventListener("visibilitychange", () => tracking && set(document.visibilityState === "hidden" ? "hidden" : "open"));
    addEventListener("pagehide", () => tracking && set("closed"));
  }
  log(`起動 ${version} ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 120)}`);
}
export function stopSession() { tracking = false; try { localStorage.removeItem(SESSION_KEY); } catch { /* nothing saved */ } }
export const crashes = () => read(CRASH_KEY, []);
export const clearCrashes = () => { try { localStorage.removeItem(CRASH_KEY); } catch { /* nothing saved */ } };

// ------------------------------------------------------------------ diagnosis tests
// Each test is written to localStorage *before* it runs; if Safari dies, the next start reports it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;

// After freeing a lot of memory, stay "running" a few seconds: iOS may close the tab a moment later.
async function settle(what) {
  const d = diagState(); d.running = `${what}を返したあとの数秒`; write(DIAG_KEY, d);
  await sleep(4000);
}

export function diagState() { return read(DIAG_KEY, { results: [] }); }
export function clearDiag() { try { localStorage.removeItem(DIAG_KEY); } catch { /* nothing saved */ } }

async function runStep(name, fn) {
  const d = diagState();
  d.running = name; d.startedAt = stamp();
  write(DIAG_KEY, d);
  await sleep(50); // let the write settle before something heavy starts
  let result, bad = false;
  const t0 = performance.now();
  try { result = await fn(); } catch (e) { result = `エラー: ${e && e.message || e}`; bad = true; }
  const ms = Math.round(performance.now() - t0);
  const d2 = diagState();
  d2.running = null;
  d2.results = [...(d2.results || []), { name, result: `${result}（${ms}ms）`, bad, at: stamp() }];
  write(DIAG_KEY, d2);
  log(`診断 ${name}: ${result}`);
  return d2;
}

// ctx: { D, routes, view, version, worker params builder }
export const TESTS = {
  env: { label: "環境（iOS・画面・保存の使用量）", risky: false, run: async () => {
    // Safari 26+ keeps "OS 18_x" in the user agent, so the real iOS number comes from the Safari version
    const ua = navigator.userAgent;
    const ios = (ua.match(/OS (\d+)_(\d+)/) || []).slice(1).join(".");
    const safari = (ua.match(/Version\/([\d.]+)/) || [])[1];
    const osText = !ios ? "iOS以外" : safari && parseInt(safari, 10) >= 26 ? `Safari ${safari}（iOS ${parseInt(safari, 10)}系。ページに伝わるiOSの番号は${ios}で固定）` : `iOS ${ios}${safari ? `・Safari ${safari}` : ""}`;
    let est = "";
    try { const e = await navigator.storage?.estimate?.(); if (e) est = ` / 保存 ${mb(e.usage || 0)} 使用（上限の目安 ${mb(e.quota || 0)}）`; } catch { /* not supported */ }
    let ls = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += (k.length + (localStorage.getItem(k) || "").length) * 2; } } catch { /* blocked */ }
    let cacheN = 0;
    try { for (const k of await caches.keys()) cacheN += (await (await caches.open(k)).keys()).length; } catch { /* no caches */ }
    const sw = navigator.serviceWorker?.controller ? "動作中" : "なし";
    return `${osText} / 画面 ${screen.width}×${screen.height} @${devicePixelRatio}x / ホーム画面から: ${matchMedia("(display-mode: standalone)").matches || navigator.standalone ? "はい" : "いいえ"} / localStorage ${mb(ls)}${est} / オフライン保存 ${cacheN}ファイル・SW ${sw}`;
  } },
  data: { label: "データの読み込み（全部のJSON）", risky: false, run: async () => {
    const names = ["skills", "decos", "armor", "monsters", "maps", "quests", "items", "readings", "weapons", "mix"];
    let bytes = 0;
    for (const n of names) bytes += (await (await fetch(`data/${n}.json`, { cache: "no-cache" })).text()).length * 2;
    return `${names.length}ファイル・メモリ上で約${mb(bytes)}`;
  } },
  pages: { label: "画面を順に開く（重いページを含む）", risky: false, run: async (ctx) => {
    const hashes = ["#progress", "#sim", "#charms", "#find", "#mons", "#maps", "#rank", "#find/ammo", "#sim/list", "#settings"];
    const w = ctx.D.weapons.find((x) => x.levels.length > 3);
    if (w) hashes.push(`#find/weapon/${w.id}/${encodeURIComponent(w.name)}`);
    const q = ctx.D.quests.find((x) => x.mstats?.length > 2);
    if (q) hashes.push(`#find/quest/${q.id}`);
    const back = location.hash;
    for (const h of hashes) {
      const d = diagState(); d.running = `画面を順に開く: ${h}`; write(DIAG_KEY, d);
      location.hash = h; await sleep(400);
    }
    location.hash = back; await sleep(300);
    return `${hashes.length}画面を開けました（いちばん多い要素数 ${document.querySelectorAll("*").length}）`;
  } },
  canvas: { label: "大きなキャンバス（画像のメモリ）", risky: true, run: async () => {
    const ok = [];
    for (const s of [1024, 2048, 4096, 8192]) {
      const d = diagState(); d.running = `キャンバス ${s}×${s}`; write(DIAG_KEY, d); await sleep(30);
      const c = document.createElement("canvas"); c.width = s; c.height = s;
      const g = c.getContext("2d");
      if (!g) return `${s}×${s} で描画できませんでした（できた大きさ: ${ok.join("・") || "なし"}）`;
      g.fillStyle = "#c49a45"; g.fillRect(0, 0, s, s);
      const px = g.getImageData(s - 1, s - 1, 1, 1).data[0];
      c.width = c.height = 0; // free the memory
      if (px === 0) return `${s}×${s} は作れたが中身が空でした（上限の可能性）`;
      ok.push(s);
    }
    await settle("キャンバス");
    return `8192×8192 まで描けました`;
  } },
  memory: { label: "メモリを少しずつ増やす（落ちるところを探す）", risky: true, run: async () => {
    const keep = [];
    let total = 0;
    try {
      for (let i = 1; i <= 24; i++) { // up to 24 × 32MB = 768MB
        const d = diagState(); d.running = `メモリ ${mb(total + 33554432)} まで確保`; write(DIAG_KEY, d); await sleep(30);
        const a = new Uint8Array(33554432); a.fill(i); keep.push(a); total += a.length;
      }
      keep.length = 0;
      await settle("メモリ");
      return `${mb(total)} まで確保できました`;
    } catch (e) {
      keep.length = 0;
      await settle("メモリ");
      return `${mb(total)} まで確保できて、その次で失敗（${e.name}）`;
    }
  } },
  storage: { label: "保存（localStorage にどこまで書けるか）", risky: false, run: async () => {
    const k = "karitomo.diag.fill";
    let n = 0;
    const chunk = "x".repeat(262144); // 512KB in UTF-16
    try { for (; n < 40; n++) localStorage.setItem(`${k}${n}`, chunk); return `20MB 分書けました（上限に余裕あり）`; }
    catch { return `約${mb(n * 524288)} で上限に届きました`; }
    finally { for (let i = 0; i <= n; i++) try { localStorage.removeItem(`${k}${i}`); } catch { /* ignore */ } }
  } },
  sim: { label: "スキルシミュの計算（重い条件）", risky: false, run: async (ctx) => {
    const params = ctx.simParams({ 攻撃: 15, 達人: 10, 斬れ味: 10 });
    const w = new Worker(`js/sim-worker.js?v=${ctx.version}`, { type: "module" });
    const n = await new Promise((res) => {
      let k = 0;
      w.onmessage = (e) => { if (e.data.type === "result") k++; else res(e.data.type === "error" ? `エラー ${e.data.message}` : k); };
      w.postMessage({ ...params, limit: 100, timeoutMs: 20000 });
    });
    w.terminate();
    return `${n}件見つかりました（作れるものだけでなく全部の装備から）`;
  } },
};

export async function runTest(key, ctx) { return runStep(TESTS[key].label, () => TESTS[key].run(ctx)); }
