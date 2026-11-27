// ドパ☆ガキ狩友ノート — main UI. Plain ES modules, no build step.
import { norm, reading, match as matchJa } from "./kana.js?v=1.0.0";
import { LANG, setLang, isEn, t, tf, nm, translateDom, watchDom } from "./i18n.js?v=1.0.0";
import { buildSources, obtainable, canMake, canMakeDeco, rankOf, dropUnreachableHikyo, dropQuests } from "./unlock.js?v=1.0.0";
import { activated, totals, TORSO_UP } from "./sim.js?v=1.0.0";
import { parseCharms, charmsToCsv, newCharms } from "./charms.js?v=1.0.0";
import { reachableLevels } from "./rank.js?v=1.0.0";
import { KINDS, encodeShare, decodeShare } from "./share.js?v=1.0.0";
import { TOPICS, renderSpec } from "./spec.js?v=1.0.0";
import { TOPICS_EN } from "./spec-en.js?v=1.0.0";
import { renderCalc } from "./calc.js?v=1.0.0";
import { renderDmgCalc } from "./dmgcalc.js?v=1.0.0";
import { recommendQuests, bundleQuests, charmPotential, weaponTree, ammoIndex, upgradePath, deliveryPlan } from "./plan.js?v=1.0.0";
import * as dbg from "./debug.js?v=1.0.0";
import { adviseQuest, recommendPouch } from "./advice.js?v=1.0.0";

const APP_NAME_JA = "ドパ☆ガキ狩友ノート";
let APP_NAME = APP_NAME_JA; // English name once the GU mode is loaded
const VERSION = "1.0.0";
const BUILD_DATE = "2026年11月28日";
// the build date written the English way ("November 26, 2026")
const buildDateEn = () => { const [y, m, d] = BUILD_DATE.match(/\d+/g).map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
const STORE_KEY = "karitomo.v1";
// ?obs in the address = the page shown on a stream (OBS browser source). It only follows the page opened
// elsewhere with the same address (an OBS custom dock): it never saves, and built-in data leaves out item counts.
const OBS = new URLSearchParams(location.search).has("obs");
const MIRROR_KEY = "karitomo.mirror.v1";
const PARTS = ["頭", "胴", "腕", "腰", "脚"];
const ELEMENTS = ["火", "水", "雷", "氷", "龍"];
const view = document.getElementById("view");
const titleEl = document.getElementById("title");
const backBtn = document.getElementById("back");

// ---------------------------------------------------------------- saved state

const DEFAULT_STATE = { version: 1, cleared: [], charms: [], sets: [], owned: [], ownedW: {}, items: {}, itemSets: [], dl: [], files: [], friends: [], prefs: { type: 1, gender: 1, weaponSlots: 0, onlyMakeable: true, useCharms: true, targets: {}, excluded: [], pinned: {} } };
let state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.version === 1) { const d = structuredClone(DEFAULT_STATE); return { ...d, ...s, prefs: { ...d.prefs, ...s.prefs } }; }
  } catch { /* private mode or broken data: start fresh */ }
  const fresh = structuredClone(DEFAULT_STATE);
  fresh.prefs.lang = "gu"; // first visit: English (saved data from before the switch existed keeps Japanese)
  return fresh;
}
// theme: "auto" follows the phone setting, "light"/"dark" are fixed
function applyTheme() {
  const t = state.prefs.theme || "auto";
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.getElementById("themebtn").textContent = dark ? "☀" : "☾";
  document.getElementById("themebtn").setAttribute("aria-label", dark ? "通常モードにする" : "ダークモードにする");
}
applyTheme();
// 文字の大きさ (whole page zoom) and 背景なし (transparent page background, e.g. for an OBS browser source)
const ZOOMS = [80, 90, 100, 110, 125, 150, 175, 200];
function applyView() {
  const z = OBS ? state.prefs.obsZoom : state.prefs.zoom;
  document.body.style.zoom = z && z !== 100 ? z / 100 : "";
  document.documentElement.classList.toggle("nobg", !!(OBS ? state.prefs.obsNoBg : state.prefs.noBg));
}
applyView();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
document.getElementById("themebtn").onclick = () => {
  state.prefs.theme = document.getElementById("themebtn").textContent === "☀" ? "light" : "dark";
  save(); applyTheme();
  if (location.hash === "#settings") render();
};
let saveTimer = 0;
function save() {
  if (OBS) return; // the stream page only follows; saving here would overwrite what the dock just saved
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (viewAs !== null && dataOf(state) !== viewSnap) { viewSnap = dataOf(state); toast("友達のデータを表示中なので、この変更は保存しません"); }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(viewAs !== null ? realState : state)); } catch { toast("この端末では自動保存できません。設定からエクスポートしてください。"); }
  }, 150);
}

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n).toLocaleString("ja-JP");
function toast(msg, action) {
  if (OBS) return;
  const t = document.getElementById("toast");
  t.innerHTML = `<span class="grow">${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { action.run(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), action ? 6000 : 3000);
}
// Rarity as a badge in the game's colour for that rarity (css .rare[data-r]).
const rareTag = (r) => `<span class="rare" data-r="${r}">${tf("レア{n}", { n: r })}</span>`;
// Capture-only quests (goal is just 〜の捕獲): killing the target fails the quest.
const capMark = (q) => (q && /捕獲/.test(q.goal) && !/狩猟|討伐/.test(q.goal) ? ` <span class="pill cap" title="${t("捕獲のみ（討伐すると失敗）")}">🪤${t("捕獲")}</span>` : "");
// search: kana / kanji as before, and the English name in the GU mode
const match = (q, name, readings) => matchJa(q, name, readings) || (isEn() && nm(name) !== name && nm(name).toLowerCase().includes(String(q).trim().toLowerCase()));
const nameWithRuby = (name, readings) => {
  // GU: the Japanese official name sits where the reading is in XX
  if (isEn()) return `<span>${nm(name) !== name ? `<span class="ruby" lang="ja">${esc(name)}</span>` : ""}${esc(nm(name))}</span>`;
  const r = reading(name, readings);
  return `<span>${r && r !== name ? `<span class="ruby">${esc(r)}</span>` : ""}${esc(name)}</span>`;
};

// ---------------------------------------------------------------- data

let D = null; // loaded data
// GU mode: English UI text and game names (quest and map names come from their own data)
async function loadEnglish() {
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [ui, en] = await Promise.all([get("i18n/en.json"), get("data/en.json")]);
  const names = { ...(en?.names || {}), ...(en?.texts || {}) }; // texts: game texts by their Japanese text (Hunter Art descriptions)
  // quest names: the Switch version's official name
  for (const q of D.quests) { if (en?.quests?.[q.id]) q.en = en.quests[q.id]; if (q.en && q.en !== q.name && !/[ぁ-んァ-ヶ一-龯【]/.test(q.en)) names[q.name] = q.en; }
  for (const m of D.maps) if (m.name && en?.maps?.[m.id]) names[m.name] = en.maps[m.id];
  if (en?.maps?.["586e5"]) names["旧砦跡"] = en.maps["586e5"]; // that map's name is empty in our data, quests still say 旧砦跡
  D.effectDescEn = en?.effectDesc || {};
  // skill effect texts: the Switch version's official English
  for (const tr of D.skills) for (const e of tr.effects) if (D.effectDescEn[e.name]) e.desc = D.effectDescEn[e.name];
  D.goalsEn = en?.goals || {};
  // armor series labels (the shared start of the piece names): Japanese label -> English label
  const bySeries = {};
  for (const ar of D.armor) (bySeries[ar.series] ||= []).push(ar.name);
  for (const list of Object.values(bySeries)) {
    let ja = list[0];
    for (const n of list) while (!n.startsWith(ja)) ja = ja.slice(0, -1);
    const words = list.map((n) => (names[n] || n).split(" "));
    let k = 0;
    while (words.every((w) => w.length > k + 1 && w[k] === words[0][k])) k++;
    if (ja.length >= 2 && k && !names[ja]) names[ja] = words[0].slice(0, k).join(" ");
  }
  setLang("gu", ui || {}, names);
  APP_NAME = t(APP_NAME_JA);
  document.querySelectorAll(".tabs a").forEach((a) => { const n = a.lastChild; if (n?.nodeType === 3) n.textContent = t(n.textContent.trim()); });
  document.getElementById("tabs")?.setAttribute("aria-label", t("メニュー"));
  translateDom(document.body);
  watchDom(document.body); // everything drawn later is translated as it appears
}
let have = null; // obtainable items for current progress
async function loadData() {
  const names = ["skills", "decos", "armor", "monsters", "maps", "quests", "items", "readings", "weapons", "mix", "carry"];
  const got = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  D = Object.fromEntries(names.map((n, i) => [n, got[i]]));
  // quests only given out in Japan: listed in the 仕様メモ; in GU they and the gear only they give are left out
  D.jpOnly = new Set(await fetch("data/jponly.json").then((r) => (r.ok ? r.json() : [])).catch(() => []));
  D.allQuestIds = D.quests.map((q) => q.id);
  D.jpQuests = D.quests.filter((q) => D.jpOnly.has(q.id));
  if (state.prefs.lang === "gu") { await loadEnglish(); dropQuests(D, [...D.jpOnly]); }
  D.readings ||= {};
  D.weapons ||= [];
  D.mix ||= [];
  D.monById = Object.fromEntries(D.monsters.map((m) => [m.id, m]));
  D.questById = Object.fromEntries(D.quests.map((q) => [q.id, q]));
  D.treeByName = Object.fromEntries(D.skills.map((t) => [t.name, t]));
  // gathering spots and 秘境 first: 下位 秘境 items nobody can reach must not count as obtainable
  [D.gather, D.hikyo] = await Promise.all(["gather", "hikyo"].map((n) => fetch(`data/${n}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  dropUnreachableHikyo(D.maps, D.gather, D.hikyo);
  D.sources = buildSources(D);
  D.usedIn = {};
  const use = (id, s) => (D.usedIn[id] ||= []).push(s);
  for (const p of D.armor) for (const [id, qty] of p.mats || []) use(id, { type: "armor", name: p.name, qty });
  for (const d of D.decos) for (const r of d.recipes) for (const [id, qty] of r) use(id, { type: "deco", name: d.name, qty });
  for (const w of D.weapons) for (const l of w.levels) for (const [id, qty] of [...(l.make || []), ...(l.up || [])]) use(id, { type: "weapon", name: `${w.name} LV${l.lv}`, qty, link: `#find/weapon/${w.id}/${encodeURIComponent(w.name)}` });
  D.dupNote = dupNotes();
  refreshHave();
}
// Short notes that tell apart quests sharing a name (story vs replay versions, training per weapon):
// the goal if it differs, else the intruders, else "その1, その2…".
function dupNotes() {
  const groups = {}, out = {};
  for (const q of D.quests) (groups[`${q.vendor}|${q.tab}|${q.name}`] ||= []).push(q);
  const intr = (q) => {
    const xs = (q.mstats || []).filter((s) => s.intrude);
    if (!xs.length) return "乱入なし";
    const nm = (s) => D.monById[s.mon]?.name || s.mon;
    if (xs.length === 1 && xs[0].intrude === 100) return `${nm(xs[0])}が必ず乱入（エリア${xs[0].area}）`;
    return `乱入: ${xs.map((s) => `${nm(s)} ${s.intrude}%`).join("・")}`;
  };
  for (const qs of Object.values(groups)) {
    if (qs.length < 2) continue;
    for (const f of [(q) => q.goal, intr]) {
      const notes = qs.map(f);
      if (new Set(notes).size === qs.length) { qs.forEach((q, i) => (out[q.id] = notes[i])); break; }
    }
    if (!out[qs[0].id]) qs.forEach((q, i) => (out[q.id] = `その${i + 1}`));
  }
  return out;
}
function refreshHave() {
  const base = obtainable(D, D.sources, state.cleared);
  // items the 雑貨屋 sells at the current progress count as obtainable too
  const bought = new Set();
  if (D.shop) for (const r of D.shop.shop) { const id = itemIdByName(r.name); if (id && shopOpen(r.cond)) bought.add(id); }
  have = { has: (id) => bought.has(id) || base.has(id) };
}
const itemName = (id) => nm(D.items[id] || id);
// "ランダム" tag for quests that appear at random (data/randomq.json), shown like キー / 緊急
const randomTag = (q) => (D.randomq?.has(q.id) ? `<span class="pill rnd" title="${t("出現がランダムなクエスト（出るまで何度か画面を出し直す）")}">${t("ランダム")}</span> ` : "");
// "〇〇からの依頼" tag for quest lists (data/clients.json)
const clientTag = (q) => (D.clients?.[q.id] ? ` <span class="muted">${esc(tf("{name}からの依頼", { name: nm(D.clients[q.id]) }))}</span>` : "");

// ---------------------------------------------------------------- router

const routes = {};
function go(hash) { location.hash = hash; }
window.addEventListener("hashchange", render);
// ホーム画面に追加: Chrome / Edge hand over an install prompt; Safari has none (the settings page shows the steps)
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// "▲" button to the top once the page has been scrolled down a screen
const toTop = document.getElementById("totop");
if (toTop && !OBS) { // nobody taps the stream page
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  window.addEventListener("scroll", () => { toTop.hidden = window.scrollY < window.innerHeight; }, { passive: true });
}
backBtn.onclick = () => history.back();
// Scroll: a newly opened page starts at the top (the old position could land on an empty area of a
// shorter page); going back returns to where that page was. Re-draws of the same page keep the position.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const scrollMemo = {}, visited = [];
let lastHash = null;
function render() {
  if (!D) return;
  const hash = location.hash, changed = hash !== lastHash;
  if (changed && lastHash !== null) scrollMemo[lastHash] = window.scrollY;
  const [tab = "progress", ...rest] = hash.slice(1).split("/").map(decodeURIComponent);
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  backBtn.hidden = rest.length === 0;
  drawBar(); drawTour();
  if (viewAs !== null && ["edit", "settings", "share", "debug"].includes(tab)) {
    setTitle("友達のデータを表示中");
    view.innerHTML = `<div class="card"><p>このページは自分のデータで使うページです。友達のデータを表示している間は開けません。</p>
      <div class="row"><button class="primary" id="vb-back">自分に戻す</button></div></div>`;
    view.querySelector("#vb-back").onclick = () => exitView();
  } else (routes[tab] || routes.progress)(...rest);
  view.focus({ preventScroll: true });
  if (changed) {
    const back = visited.length >= 2 && visited[visited.length - 2] === hash;
    if (back) visited.pop(); else visited.push(hash);
    window.scrollTo(0, back ? scrollMemo[hash] || 0 : 0);
    lastHash = hash;
  }
  mirrorOut();
}
// Dock side: tell the stream page which page is open and how far it is scrolled (ratio, since its zoom differs).
let mirrorTimer = 0;
function mirrorOut(extra = {}) {
  if (OBS) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const prev = (() => { try { return JSON.parse(localStorage.getItem(MIRROR_KEY)) || {}; } catch { return {}; } })();
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify({ sim: prev.sim, ...extra, hash: location.hash, y: max > 0 ? scrollY / max : 0, view: viewAs })); } catch { /* storage blocked */ }
  }, 200);
}
if (!OBS) window.addEventListener("scroll", () => mirrorOut(), { passive: true });
// Stream side: follow the saved data, the friend being shown, the page, the scroll and simulator runs.
let lastSim = null;
function mirrorIn() {
  let m;
  try { m = JSON.parse(localStorage.getItem(MIRROR_KEY)); } catch { return; }
  if (!m || !D) return;
  if ((m.view ?? null) !== viewAs) { if (m.view == null) exitView(); else enterView(m.view); }
  const scroll = () => { const max = document.documentElement.scrollHeight - innerHeight; window.scrollTo(0, Math.round((m.y || 0) * max)); };
  if (m.hash !== location.hash) { location.hash = m.hash; setTimeout(scroll, 60); } else scroll();
  if (m.sim && m.sim !== lastSim) { const first = lastSim === null; lastSim = m.sim; if (!first) setTimeout(() => view.querySelector("#run")?.click(), 120); }
}
if (OBS) window.addEventListener("storage", (e) => {
  if (e.key === STORE_KEY && D) { const v = viewAs; if (v !== null) exitView(); state = loadState(); applyTheme(); applyView(); refreshHave(); if (v !== null) enterView(v); else render(); }
  if (e.key === MIRROR_KEY) mirrorIn();
});
function setTitle(s) { s = t(s) !== s ? t(s) : nm(s); titleEl.textContent = s; document.title = s === APP_NAME ? s : `${s} - ${APP_NAME}`; }

// ---------------------------------------------------------------- 進行チェック

function questGroups() {
  const groups = [];
  const byKey = {};
  for (const q of D.quests) {
    const key = `${q.vendor}|${q.tab}`;
    if (!byKey[key]) { byKey[key] = { vendor: q.vendor, tab: q.tab, quests: [] }; groups.push(byKey[key]); }
    byKey[key].quests.push(q);
  }
  return groups;
}

const VENDOR_ORDER = ["集会所", "村", "闘技大会", "訓練", "特殊許可"];
const vendorRank = (v) => (VENDOR_ORDER.includes(v) ? VENDOR_ORDER.indexOf(v) : VENDOR_ORDER.length);
const tabLabel = (g) => (g.vendor === "特殊許可" && /^\d+$/.test(g.tab) ? tf("レベル{n}", { n: g.tab }) : t(g.tab));
// quest badge (キー / 緊急 / ＤＬ / ニャンター …) word by word
// quest main / sub goal in the current language (k = "goal" | "sub")
const qGoal = (q, k = "goal") => (isEn() && D.goalsEn?.[q.id]?.[k]) || q[k];
const badgeText = (b) => b.split(/\s+/).map((w) => t(w)).join(" ");

routes.progress = (groupKey) => {
  setTitle("進行チェック");
  const cleared = new Set(state.cleared);
  const groups = questGroups();
  if (groupKey) {
    const g = groups.find((x) => `${x.vendor}|${x.tab}` === groupKey);
    if (!g) return go("progress");
    setTitle(`${t(g.vendor)} ${tabLabel(g)}`);
    // ハンター / ニャンター filter: only shown quests are listed and changed by the bulk buttons
    const f = (state.prefs.qfilter ||= { hunter: true, nyanter: true });
    const isNyan = (q) => /ニャンター/.test(q.badge || "");
    const hasNyan = g.quests.some(isNyan), hasHunter = g.quests.some((q) => !isNyan(q));
    const shown = g.quests.filter((q) => !hasNyan || !hasHunter || (isNyan(q) ? f.nyanter : f.hunter));
    const tog = (k, icon, label) => `<button class="toggle" data-qf="${k}" aria-pressed="${f[k]}"><span aria-hidden="true">${f[k] ? "☑" : "☐"} ${icon}</span> ${label}</button>`;
    view.innerHTML = `
      ${hasNyan && hasHunter ? `<div class="filterbar" role="group" aria-label="${t("表示するクエスト")}"><span class="muted">${t("表示:")}</span>${tog("hunter", "🗡", t("ハンター"))}${tog("nyanter", "🐾", t("ニャンター"))}</div>` : ""}
      <div class="row"><button id="all" class="primary" ${shown.length ? "" : "disabled"}>${shown.length < g.quests.length ? tf("表示中の{n}件をクリア済みにする", { n: shown.length }) : t("全部クリア済みにする")}</button><button id="none" ${shown.length ? "" : "disabled"}>${shown.length < g.quests.length ? t("表示中を外す") : t("全部外す")}</button></div>
      ${unlockPreview(g, cleared)}
      ${shown.length ? "" : `<p class="muted">${t("表示するクエストがありません。上の「ハンター」「ニャンター」のどちらかをオンにしてください。")}</p>`}
      <ul class="list">${shown.map((q) => `
        <li><label class="item"><input type="checkbox" data-q="${q.id}" ${cleared.has(q.id) ? "checked" : ""}>
          <span class="grow">${q.badge ? `<span class="pill">${esc(badgeText(q.badge))}</span> ` : ""}${randomTag(q)}${nameWithRuby(q.name, D.readings)}${capMark(q)}
          <span class="ruby">${esc(nm(q.map))}・${esc(qGoal(q))}${D.dupNote[q.id] ? ` <b>${esc(D.dupNote[q.id])}</b>` : ""}${clientTag(q)}</span></span>
          <a class="btn qdetail" href="#find/quest/${q.id}" aria-label="${esc(tf("{name}の詳細", { name: nm(q.name) }))}">${t("詳細 ›")}</a></label></li>`).join("")}</ul>`;
    const setAll = (on) => { for (const q of shown) on ? cleared.add(q.id) : cleared.delete(q.id); commit(); routes.progress(groupKey); };
    view.querySelectorAll("[data-qf]").forEach((b) => (b.onclick = () => { f[b.dataset.qf] = !f[b.dataset.qf]; save(); routes.progress(groupKey); }));
    view.querySelector("#all").onclick = () => setAll(true);
    view.querySelector("#none").onclick = () => setAll(false);
    view.querySelectorAll("input[data-q]").forEach((cb) => (cb.onchange = () => { cb.checked ? cleared.add(cb.dataset.q) : cleared.delete(cb.dataset.q); commit(); }));
    function commit() { state.cleared = [...cleared]; save(); refreshHave(); }
    return;
  }
  const vendors = [...new Set(groups.map((g) => g.vendor))].sort((a, b) => vendorRank(a) - vendorRank(b));
  view.innerHTML = `
    <nav class="tiles" aria-label="${t("よく使う画面")}">${[["#sim", "⚙", "スキルシミュ"], ["#maps", "▦", "マップ"], ["#mons", "◆", "モンスター"], ["#find", "⇄", "逆引き"]].map(([h, ic, l]) => `<a class="tile" href="${h}"><span aria-hidden="true">${ic}</span>${t(l)}</a>`).join("")}</nav>
    <p class="muted">${t("クリアしたクエストに印を付けると、作れる装備だけでシミュや逆引きができます。星ごとにまとめて付けられます。")}</p>
    ${vendors.map((v) => { const qs = groups.filter((g) => g.vendor === v).flatMap((g) => g.quests), n = qs.filter((q) => cleared.has(q.id)).length;
      return `<h2>${esc(t(v))} <span class="muted">${Math.floor((100 * n) / qs.length)}%（${n}/${qs.length}）</span></h2><ul class="list">${groups.filter((g) => g.vendor === v).map((g) => {
      const n = g.quests.filter((q) => cleared.has(q.id)).length;
      const key = encodeURIComponent(`${g.vendor}|${g.tab}`);
      return `<li><a href="#progress/${key}"><span class="grow">${esc(tabLabel(g))}</span>
        <span class="muted">${n}/${g.quests.length}</span>
        <span style="width:60px" class="bar"><i style="width:${(100 * n) / g.quests.length}%"></i></span>›</a></li>`;
    }).join("")}</ul>`; }).join("")}`;
};

// What clearing every quest in this group would newly unlock (materials and armor).
function unlockPreview(g, cleared) {
  if (g.quests.every((q) => cleared.has(q.id))) return "";
  const after = obtainable(D, D.sources, [...cleared, ...g.quests.map((q) => q.id)]);
  const items = Object.keys(D.sources).filter((id) => !have.has(id) && after.has(id));
  const armor = D.armor.filter((a) => !canMake(a.mats, have) && canMake(a.mats, after));
  if (!items.length && !armor.length) return "";
  const series = [...new Map(armor.sort((a, b) => b.rare - a.rare).map((a) => [a.series, a])).values()];
  return `<details class="card"><summary>全部クリアすると増えるもの（素材${items.length}種・防具${armor.length}部位）</summary>
    <h3>防具</h3><div class="chips">${series.slice(0, 20).map((a) => `<a class="chip" href="#find/armor/${encodeURIComponent(a.name)}">${esc(a.name)} ${rareTag(a.rare)}</a>`).join("") || `<span class="muted">なし</span>`}${series.length > 20 ? `<span class="muted">ほか${series.length - 20}シリーズ</span>` : ""}</div>
    <h3>素材</h3><div class="chips">${items.slice(0, 30).map((id) => `<a class="chip" href="#find/item/${id}">${esc(itemName(id))}</a>`).join("")}${items.length > 30 ? `<span class="muted">ほか${items.length - 30}種</span>` : ""}</div>
    <p class="muted">防具はシリーズごとに1つだけ出しています。</p></details>`;
}


// ---------------------------------------------------------------- 護石

routes.charms = (edit) => {
  setTitle("護石");
  if (edit === "help") return charmHelp();
  if (edit === "review") return charmReview();
  if (edit !== undefined) return charmForm(edit === "new" ? null : +edit);
  view.innerHTML = `
    <div class="row"><button class="primary" id="add">護石を追加</button><a class="btn" href="#edit">まとめて編集・名前を付けて保存 ›</a><a class="btn" href="#charms/help">護石えらび ›</a></div>

    ${state.charms.length ? "" : `<p class="muted">持っている護石を登録すると、シミュで使えます。</p>`}
    ${state.charms.some((c) => c.chk) ? `<p class="muted"><span class="pill hi">要確認</span> は動画がぼやけていて推定で入れた護石です（${state.charms.filter((c) => c.chk).length}個）。ゲームで見比べて、開いて「保存」すると印が消えます。</p>
      <div class="row"><a class="btn primary" href="#charms/review">要確認の護石を1個ずつ確かめる ›</a></div>` : ""}
    ${state.charms.length > 1 ? `<label class="muted">並び <select id="csort">${CHARM_SORTS.map(([v, l]) => `<option value="${v}" ${(state.prefs.charmSort || "add") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
    <ul class="list">${charmOrder().map((i) => [state.charms[i], i]).map(([c, i]) => `<li><a href="#charms/${i}">
      <span class="grow">${c.chk ? `<span class="pill hi" title="${esc(c.chk)}">要確認</span> ` : ""}${Object.entries(c.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ") || "スキルなし"}</span>
      <span class="muted">スロット${"◯".repeat(c.slots)}${"―".repeat(3 - c.slots)}</span>›</a></li>`).join("")}</ul>
    ${(() => { const ps = comparePeople().filter((x) => x.key !== "me" && x.d.charms?.length); return ps.length ? `<details class="card"><summary>ほかの人の護石を取り込む（友達・最初から入っているデータ）</summary>
      <p class="muted">選んだ人の護石を、自分の護石に足します（同じ護石はもう一度は足しません）。シミュで試すだけなら、シミュの「使う護石」でその人を選べます（自分の護石はそのまま）。</p>
      <div class="row"><select id="cfrom">${ps.map((x) => `<option value="${esc(x.key)}">${esc(x.name)}（${x.d.charms.length}個）</option>`).join("")}</select><button class="primary" id="cfromgo">自分の護石に足す</button></div></details>` : ""; })()}
    <details class="card"><summary>ほかのスキルシミュとやりとり</summary>
      <p class="muted">ほかのスキルシミュのお守りエクスポート（「,0,匠,5,重撃,5」の形）か、お守りデータ（[{"skills":…}] の形）を貼り付けてください。すでに登録してある護石は足しません。</p>
      <textarea id="ctext" rows="6" style="width:100%" placeholder=",0,寒冷適応,4,運気,7"></textarea>
      <div class="row"><button class="primary" id="cimp">読み込む</button><button id="cexp" ${state.charms.length ? "" : "disabled"}>同じ形でコピー</button></div>
    </details>`;
  const $ = (s) => view.querySelector(s);
  $("#add").onclick = () => go("charms/new");
  $("#csort")?.addEventListener("change", (e) => { state.prefs.charmSort = e.target.value; save(); routes.charms(); });
  $("#cfromgo")?.addEventListener("click", () => {
    const x = comparePeople().find((y) => y.key === $("#cfrom").value);
    if (!x) return;
    const add = newCharms(state.charms, structuredClone(x.d.charms));
    if (!add.length) return toast("新しい護石はありませんでした");
    const before = state.charms.length;
    state.charms.push(...add);
    save(); routes.charms();
    toast(`${x.name} の護石を${add.length}個足しました`, { label: "元に戻す", run: () => { state.charms.splice(before); save(); render(); } });
  });
  $("#cimp").onclick = () => {
    const { charms, bad } = parseCharms($("#ctext").value, D.skills.map((t) => t.name));
    const add = newCharms(state.charms, charms);
    if (!add.length) return toast(bad ? `読み込めませんでした（読めない行${bad}件）` : "新しい護石はありませんでした");
    const before = state.charms.length;
    state.charms.push(...add);
    save(); routes.charms();
    toast(`護石を${add.length}個追加しました${bad ? `（読めない行${bad}件）` : ""}`,
      { label: "元に戻す", run: () => { state.charms.splice(before); save(); render(); } });
  };
  $("#cexp").onclick = async () => {
    const text = charmsToCsv(state.charms);
    try { await navigator.clipboard.writeText(text); toast("コピーしました。もう一方のシミュのインポート欄に貼り付けてください。"); }
    catch { $("#ctext").value = text; $("#ctext").select(); toast("コピーできなかったので、上の欄に出しました。長押しでコピーしてください。"); }
  };
};

// charm list order (prefs.charmSort): registration order, skill 1 name (五十音), points of skill 1, slots, 要確認 first
const CHARM_SORTS = [["add", "登録した順"], ["skill", "スキル名（五十音）"], ["pts", "ポイントの高い順"], ["slots", "スロットの多い順"], ["chk", "要確認を先に"]];
function charmOrder() {
  const idx = state.charms.map((_, i) => i), first = (c) => Object.entries(c.skills)[0] || ["", 0];
  const key = (t) => norm(reading(t, D.readings) || t);
  const by = { skill: (a, b) => key(first(state.charms[a])[0]).localeCompare(key(first(state.charms[b])[0]), "ja") || first(state.charms[b])[1] - first(state.charms[a])[1],
    pts: (a, b) => first(state.charms[b])[1] - first(state.charms[a])[1] || state.charms[b].slots - state.charms[a].slots,
    slots: (a, b) => state.charms[b].slots - state.charms[a].slots || first(state.charms[b])[1] - first(state.charms[a])[1],
    chk: (a, b) => (state.charms[b].chk ? 1 : 0) - (state.charms[a].chk ? 1 : 0) || a - b }[state.prefs.charmSort];
  return by ? idx.sort(by) : idx;
}
// 要確認 charms one by one: the reading, where it was in the video, and 合ってる / 直す / 消す / あとまわし.
let reviewSkip = new Set();
function charmReview() {
  setTitle("要確認の護石");
  const all = state.charms.map((c, i) => ({ c, i })).filter((x) => x.c.chk);
  const left = all.filter((x) => !reviewSkip.has(x.c));
  if (!all.length) { view.innerHTML = `<div class="card"><p>要確認の護石はもうありません。</p><a class="btn" href="#charms">護石の一覧へ ›</a></div>`; return; }
  if (!left.length) {
    view.innerHTML = `<div class="card"><p>あとまわしにした護石が${all.length}個あります。</p><div class="row"><button class="primary" id="rvagain">もう一度はじめから</button><a class="btn" href="#charms">護石の一覧へ ›</a></div></div>`;
    view.querySelector("#rvagain").onclick = () => { reviewSkip = new Set(); charmReview(); };
    return;
  }
  const { c, i } = left[0];
  const sk = Object.entries(c.skills);
  view.innerHTML = `<p class="muted">のこり ${left.length}個（あとまわし ${all.length - left.length}個）。ゲームの護石の一覧と見比べてください。</p>
    <div class="card"><div style="font-size:18px"><b>${sk.map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ") || "スキルなし"}</b></div>
      <div>スロット ${"◯".repeat(c.slots)}${"―".repeat(3 - c.slots)}</div>
      <p class="muted">${esc(c.chk)}</p></div>
    <div class="row"><button class="primary" id="rvok">合ってる</button><button id="rvfix">違うので直す</button><button class="danger" id="rvdel">違うので消す</button><button id="rvskip">あとまわし</button></div>`;
  const $ = (x) => view.querySelector(x);
  $("#rvok").onclick = () => { delete state.charms[i].chk; save(); toast("印を消しました", { label: "元に戻す", run: () => { state.charms[i].chk = c.chk; save(); render(); } }); charmReview(); };
  $("#rvfix").onclick = () => go(`charms/${i}`);
  $("#rvdel").onclick = () => { const [rm] = state.charms.splice(i, 1); if (typeof state.prefs.pinnedCharm === "number") delete state.prefs.pinnedCharm; save(); toast("消しました", { label: "元に戻す", run: () => { state.charms.splice(i, 0, rm); save(); render(); } }); charmReview(); };
  $("#rvskip").onclick = () => { reviewSkip.add(c); charmReview(); };
}

// 護石えらび: which registered charm (with decorations in its slots) gets a skill highest.
function charmHelp() {
  setTitle("護石えらび");
  const p = state.prefs;
  const tree = p.helpTree || "", goal = p.helpGoal || 10;
  const decos = D.decos.filter((d) => !p.onlyMakeable || canMakeDeco(d, have));
  const rows = tree ? state.charms.map((c, i) => ({ c, i, ...charmPotential(c, tree, decos) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total || b.c.slots - a.c.slots) : [];
  const label = (c) => Object.entries(c.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ") || "スキルなし";
  view.innerHTML = `<div class="card">
      <label>上げたいスキル<select id="ht">${treeOptions(tree)}</select></label> ${treeSortSelect()}
      <label>目標ポイント <input id="hg" type="number" inputmode="numeric" min="1" max="30" value="${goal}" style="width:6em"></label>
      <p class="muted">護石のポイントと、護石のスロットに入る装飾品（${p.onlyMakeable ? "いまの進行で作れるもの" : "全部"}）を足した最大値です。防具の分は入っていません。</p></div>
    ${tree ? (rows.length ? `<ul class="list">${rows.map((r) => `<li class="item"><span class="grow">${label(r.c)} <span class="muted">${"◯".repeat(r.c.slots)}</span>
        <span class="ruby">${esc(tree)} 護石${r.own} ＋ 装飾品${r.total - r.own} ＝ <b>${r.total}</b> ${r.total >= goal ? "✓ 目標に届く" : `あと${goal - r.total}は防具で`}</span></span>
        <button class="mini" data-pc="${r.i}">この護石でシミュ</button></li>`).join("")}</ul>` : `<p class="muted">このスキルを上げられる護石がありません。</p>`) : `<p class="muted">スキルを選ぶと、登録した護石（${state.charms.length}個）を強い順に並べます。</p>`}`;
  const $ = (x) => view.querySelector(x);
  $("#ht").onchange = () => { p.helpTree = $("#ht").value; save(); charmHelp(); };
  bindTreeSort(charmHelp);
  $("#hg").onchange = () => { p.helpGoal = Math.max(1, parseInt($("#hg").value, 10) || 10); save(); charmHelp(); };
  view.querySelectorAll("[data-pc]").forEach((b) => (b.onclick = () => { p.pinnedCharm = +b.dataset.pc; p.useCharms = true; save(); toast("この護石だけを使って検索します"); go("sim"); }));
}

const kanaSort = (ts) => {
  const key = (t) => norm(reading(t.name, D.readings) || t.name);
  return [...ts].sort((a, b) => key(a).localeCompare(key(b), "ja"));
};
const SORTS = [["data", "ゲームの順"], ["kana", "五十音順"], ["cat", "種類別"], ["catkana", "種類別（五十音）"]];
// Skill tree <select> options in the order chosen with treeSortSelect(): game data, 五十音, or by category.
function treeOptions(sel) {
  const trees = D.skills.filter((t) => t.effects.length);
  const opt = (t) => `<option value="${esc(t.name)}" ${t.name === sel ? "selected" : ""}>${esc(t.name)}</option>`;
  const how = state.prefs.treeSort || "data";
  let body;
  if (how === "kana") {
    body = kanaSort(trees).map(opt).join("");
  } else if (how === "cat" || how === "catkana") {
    const listed = new Set(SKILL_CATS.flatMap(([, l]) => l));
    body = SKILL_CATS.map(([name, list], i) => {
      let ts = i === SKILL_CATS.length - 1 ? trees.filter((t) => !listed.has(t.name)) : list.map((n) => D.treeByName[n]).filter((t) => t?.effects.length);
      if (how === "catkana") ts = kanaSort(ts);
      return ts.length ? `<optgroup label="${esc(name)}">${ts.map(opt).join("")}</optgroup>` : "";
    }).join("");
  } else body = trees.map(opt).join("");
  return `<option value="">（なし）</option>${body}`;
}
const treeSortSelect = () => `<label class="muted">スキルの並び <select class="tsort">${SORTS.map(([v, l]) => `<option value="${v}" ${(state.prefs.treeSort || "data") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
// re-draws the page; values typed into the form are kept by the caller where needed
function bindTreeSort(redraw) {
  view.querySelectorAll(".tsort").forEach((s) => (s.onchange = () => { state.prefs.treeSort = s.value; save(); redraw(); }));
}
// Numeric detail of one effect (data/skilldetails.json), shown after its description.
// Effects named in a description (「早食い+2」と「高級耳栓」を合わせた効果) get their own description below it.
let effIndex = null;
const effKey = (x) => x.normalize("NFKC").replace(/\s/g, "");
function effByName(name) {
  if (!effIndex) { effIndex = new Map(); for (const t of D.skills) for (const e of t.effects) effIndex.set(effKey(e.name), { ...e, tree: t.name }); }
  return effIndex.get(effKey(name));
}
const effNum = (name) => (D.skillDetails?.[name] ? `<div class="detail">${esc(D.skillDetails[name])}</div>` : "");
// 耳栓・風圧・耐震: which large monsters each one covers (data/hazards.json, two sources compared;
// a value [a, b] means the sources disagree and both are shown).
function hazardList(name) {
  const H = D.hazards;
  if (!H) return "";
  const KEY = { 耳栓: "roar", 高級耳栓: "roar", "風圧【小】無効": "wind", "風圧【大】無効": "wind", 耐震: "quake" }[name];
  if (!KEY) return "";
  const by = {}, split = [];
  for (const [m, v] of Object.entries(H)) {
    const x = v[KEY];
    if (Array.isArray(x)) split.push(`${m}（${x.map((y) => y || "なし").join("／")}）`);
    else if (x) (by[x] ||= []).push(m);
  }
  const line = (label, list) => (list?.length ? `<div><b>${esc(label)}</b>（${list.length}）: ${list.map(esc).join("、")}</div>` : "");
  const body = KEY === "roar"
    ? (name === "耳栓" ? line("防げる：咆哮【小】", by["小"]) + line("防げない：咆哮【大】（高級耳栓が必要）", by["大"]) + line("防げない：咆哮【特大】", by["特大"])
      : line("咆哮【大】", by["大"]) + line("咆哮【特大】", by["特大"]) + line("咆哮【小】（耳栓でも防げる）", by["小"]))
    : KEY === "wind" ? line("風圧【小】", by["小"]) + line("風圧【大】", by["大"]) + line("龍風圧", by["龍"])
    : line("振動を起こす", by["あり"]);
  return `<div class="detail">${body}${split.length ? `<div><b>資料によって違う</b>: ${split.map(esc).join("、")}</div>` : ""}<div class="muted">大型モンスターの資料2つを照らし合わせた一覧です。${KEY === "roar" ? "咆哮しないモンスターは入っていません。" : ""}</div></div>`;
}
function effDetail(name) {
  const refs = [...new Set([...(effByName(name)?.desc || "").matchAll(/「([^」]+)」/g)].map((m) => m[1]))].map(effByName).filter((e) => e && e.name !== name);
  return effNum(name) + hazardList(name) + refs.map((e) => `<div class="detail"><b>${esc(e.name)}</b>（${esc(e.tree)}）: ${esc(e.desc)}${D.skillDetails?.[e.name] ? `<br>${esc(D.skillDetails[e.name])}` : ""}</div>`).join("");
}
// Effect list of skill trees (for decorations / armor pages), so "ガード性能+3 / 体術-1" can be read.
function treeEffects(names) {
  return names.map((n) => D.treeByName[n]).filter(Boolean).map((t) => `<details><summary>${esc(t.name)} の効果</summary>
    <table>${t.effects.map((e) => `<tr><td style="width:3.5em" class="${e.pts > 0 ? "" : "hi"}">${e.pts > 0 ? "+" : ""}${e.pts}</td><td style="text-align:left;white-space:normal"><b>${esc(e.name)}</b> <span class="muted">${esc(e.desc)}</span>${effDetail(e.name)}</td></tr>`).join("")}</table>
    <p class="muted">スキルポイントの合計がこの数字に届くと発動します（マイナスはその数字以下で発動）。</p></details>`).join("");
}
function charmForm(idx, typed = null) {
  const c = typed || (idx === null ? { skills: {}, slots: 0 } : state.charms[idx]);
  if (!c) return go("charms");
  const sk = Object.entries(c.skills);
  view.innerHTML = `
    <div class="card">
      ${[0, 1].map((k) => `<div class="row"><label class="grow">スキル${k + 1}<br><select id="t${k}">${treeOptions(sk[k]?.[0])}</select></label>
        <label>ポイント<br><input id="v${k}" type="number" inputmode="numeric" min="-10" max="20" value="${sk[k]?.[1] ?? ""}" style="width:6em"></label></div>`).join("")}
      <label>スロット<br><select id="slots">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${n === c.slots ? "selected" : ""}>${"◯".repeat(n)}${"―".repeat(3 - n)}</option>`).join("")}</select></label>
      <div style="margin-top:8px">${treeSortSelect()}</div>
      <div class="row" style="margin-top:12px"><button class="primary" id="ok">保存</button><button id="cancel">やめる</button>
      ${idx !== null ? `<span class="grow"></span><button class="danger" id="del">削除</button>` : ""}</div>
    </div>`;
  const $ = (s) => view.querySelector(s);
  $("#ok").onclick = () => {
    const skills = {};
    for (const k of [0, 1]) {
      const t = $(`#t${k}`).value, v = parseInt($(`#v${k}`).value, 10);
      if (t && v) skills[t] = (skills[t] || 0) + v;
    }
    const nc = { skills, slots: +$("#slots").value };
    if (idx === null) state.charms.push(nc); else state.charms[idx] = nc;
    save(); toast("護石を保存しました"); go("charms");
  };
  $("#cancel").onclick = () => history.back();
  bindTreeSort(() => {
    // keep what was typed: two rows can name the same tree, so keep them as pairs
    const rows = [0, 1].map((k) => [$(`#t${k}`).value, parseInt($(`#v${k}`).value, 10)]);
    const skills = {};
    for (const [t, v] of rows) if (t) skills[t] = Number.isNaN(v) ? "" : v;
    charmForm(idx, { skills, slots: +$("#slots").value });
  });
  if (idx !== null) $("#del").onclick = () => {
    const removed = state.charms.splice(idx, 1)[0];
    if (typeof state.prefs.pinnedCharm === "number") delete state.prefs.pinnedCharm; // indexes shift
    save(); go("charms");
    toast("護石を削除しました", { label: "元に戻す", run: () => { state.charms.splice(idx, 0, removed); save(); render(); } });
  };
}

// ---------------------------------------------------------------- スキルシミュ

// Skill picker groups (hand-assigned); trees not listed fall into the last group.
const SKILL_CATS = [
  ["攻撃", "攻撃 達人 痛撃 連撃 特殊会心 属性会心 会心強化 裏会心 本気 闘魂 無傷 チャンス 龍気 底力 逆境 逆上 窮地 我慢 無心 重撃 KO 減気攻撃 剛腕 剛撃 怒 斬術 跳躍 乗り"],
  ["属性・状態異常", "火属性攻撃 水属性攻撃 雷属性攻撃 氷属性攻撃 龍属性攻撃 属性攻撃 特殊攻撃 増幅"],
  ["剣士", "匠 斬れ味 剣術 研ぎ師 研磨術 鈍器 抜刀会心 抜刀減気 納刀 納刀研磨 居合 刃鱗 刀匠 溜め短縮 笛 砲術 ガード性能 ガード強化 盾持 北辰納豆流"],
  ["ガンナー", "装填速度 反動 精密射撃 装填数 速射 射法 変則射撃 弾薬節約 射手 通常弾強化 貫通弾強化 散弾強化 重撃弾強化 通常弾追加 貫通弾追加 散弾追加 榴弾追加 拡散弾追加 毒瓶追加 麻痺瓶追加 睡眠瓶追加 強撃瓶追加 属強瓶追加 接撃瓶追加 減気瓶追加 爆破瓶追加"],
  ["防御・耐性", "防御 体力 根性 頑強 加護 英雄の盾 火耐性 水耐性 雷耐性 氷耐性 龍耐性 属性耐性 毒 麻痺 睡眠 気絶 裂傷 細菌学 状態耐性 狂撃耐性 対防御DOWN 聴覚保護 風圧 耐震 だるま 耐暑 耐寒 寒冷適応 炎熱適応 盗み無効 対鋼龍 対霞龍 対炎龍"],
  ["立ち回り", "スタミナ 体術 気力回復 走行継続 回避性能 回避距離 回避術 泡沫 潔癖 気配 ＳＰ延長 采配 号令 千里眼"],
  ["回復・アイテム", "回復量 回復速度 効果持続 広域 野草知識 腹減り 食いしん坊 食事 節食 肉食 茸食 食欲 調合成功率 調合数 高速設置 職工 爆弾強化"],
  ["採取・報酬", "採取 ハチミツ 運搬 狩人 観察眼 剥ぎ取り 捕獲 運気 祈願 強欲 裏稼業 気まぐれ 護石王 護石収集"],
  ["複合（心・魂ほか）", ""],
].map(([name, list]) => [name, list.split(" ").filter(Boolean)]);

function skillPicker(targets) {
  const listed = new Set(SKILL_CATS.flatMap(([, l]) => l));
  const trees = D.skills.filter((t) => t.effects.some((e) => e.pts > 0));
  const how = state.prefs.pickSort || "cat";
  const groups = how === "kana" ? [["すべて（五十音順）", kanaSort(trees)]]
    : how === "data" ? [["すべて（ゲームの順）", trees]]
    : SKILL_CATS.map(([name, list], i) => {
      const ts = i === SKILL_CATS.length - 1 ? trees.filter((t) => !listed.has(t.name)) : list.map((n) => D.treeByName[n]).filter(Boolean);
      return [name, how === "catkana" ? kanaSort(ts) : ts];
    });
  return groups.map(([name, ts]) => {
    const n = ts.filter((t) => targets[t.name]).length;
    return `<details ${n ? "open" : ""}><summary>${esc(name)}${n ? ` <span class="pill">${n}</span>` : ""}</summary>
      <div class="chips">${ts.map((t) => {
        const e = targets[t.name] && t.effects.find((x) => x.pts === targets[t.name]);
        return `<button class="chip${e ? " on" : ""}" data-tree="${esc(t.name)}">${esc(e ? e.name : t.name)}</button>`;
      }).join("")}</div><div class="pick"></div></details>`;
  }).join("");
}

let worker = null;
routes.sim = (sub, id) => {
  if (sub === "list") return skillList(id);
  if (sub === "sets") return id === undefined ? setsList() : setPage(+id);
  if (sub === "compare") return compareSets(id);
  setTitle("スキルシミュ");
  const p = state.prefs;
  const targets = p.targets;
  const effectChips = Object.entries(targets).map(([tree, pts]) => {
    const e = D.treeByName[tree]?.effects.find((x) => x.pts === pts);
    return `<button class="chip on" data-rm="${esc(tree)}">${esc(e?.name || tree)} ×</button>`;
  }).join("");
  view.innerHTML = `
    <div class="card">
      <label>発動させたいスキル（ひらがなでも探せます）<input type="search" id="q" placeholder="例: こうげき、みきり、業物"></label>
      <div id="cands" class="chips" style="margin-top:6px"></div>
      <div class="chips" style="margin-top:8px">${effectChips || `<span class="muted">まだ選んでいません</span>`}</div>
      ${skillSetsHtml()}
      <p class="muted" style="margin:8px 0 0">一覧から選ぶ（系統をタップすると効果と説明が出ます） <label>並び <select id="psort">${[SORTS[2], SORTS[3], SORTS[1], SORTS[0]].map(([v, l]) => `<option value="${v}" ${(p.pickSort || "cat") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></p>
      <div id="picker">${skillPicker(targets)}</div>
      <p style="margin:8px 0 0"><a href="#sim/list">スキル一覧（読み方・ポイント・効果）›</a></p>
    </div>
    <div class="card">
      <div class="row">
        <select id="type"><option value="1">剣士</option><option value="2">ガンナー</option></select>
        <select id="gender"><option value="1">男性</option><option value="2">女性</option></select>
        <label>武器スロット <select id="ws">${[0, 1, 2, 3].map((n) => `<option>${n}</option>`).join("")}</select></label>
      </div>
      <label class="check"><input type="checkbox" id="mk" ${p.onlyMakeable ? "checked" : ""}>進行チェックで作れる装備・装飾品だけ使う</label>
      <label class="check"><input type="checkbox" id="uc" ${p.useCharms ? "checked" : ""}>登録した護石を使う</label>
      ${state.friends.some((fr) => fr.charms?.length) ? `<label>使う護石 <select id="cf"><option value="">自分（${state.charms.length}個）</option>${state.friends.map((fr, i) => (fr.charms?.length ? `<option value="${i}" ${p.charmFrom === i ? "selected" : ""}>${esc(fr.name)}（${fr.charms.length}個）</option>` : "")).join("")}</select></label>
        <p class="muted">友達の護石にすると、その護石で組めるかを試せます（友達の防具の進行ではなく、自分の進行で判定します）。</p>` : `<span class="muted">（${state.charms.length}個）</span>`}
      ${(() => { const f = [p.minDef ? `防御${p.minDef}以上` : "", p.minSlots ? `スロット${p.minSlots}以上` : "", p.minFree ? `空き${p.minFree}以上` : "", p.ownedOnly ? "作成済みだけ" : "",
          p.rareMin || p.rareMax ? `レア${p.rareMin || 1}〜${p.rareMax || 10}` : "", (p.avoid || []).length ? `出さない${p.avoid.length}` : "", p.hrCap ? `HR: ${p.hrCap}まで` : "", ...ELEMENTS.map((e, i) => (typeof p.minRes?.[i] === "number" ? `${e}耐性${p.minRes[i]}以上` : ""))].filter(Boolean);
        return `<details ${f.length ? "open" : ""}><summary>しぼりこみ${f.length ? ` <span class="pill">${f.join("・")}</span>` : ""}</summary>`; })()}
        <div class="row"><label>防御力（最大）<input id="mind" type="number" inputmode="numeric" min="0" max="999" step="10" value="${p.minDef || ""}" placeholder="0" style="width:6em"> 以上</label>
        <label>防具のスロット合計 <select id="mins">${Array.from({ length: 16 }, (_, n) => `<option value="${n}" ${n === (p.minSlots || 0) ? "selected" : ""}>${n || "指定なし"}</option>`).join("")}</select> 以上</label></div>
        <div class="muted" style="margin-top:6px">防具5つの属性耐性の合計（空欄 = 指定なし、マイナスも入れられます）</div>
        <div class="row">${ELEMENTS.map((e, i) => `<label class="el-${e}">${e}<br><input data-minres="${i}" type="number" inputmode="numeric" min="-50" max="50" value="${typeof p.minRes?.[i] === "number" ? p.minRes[i] : ""}" style="width:4.2em"></label>`).join("")}</div>
        <div class="row" style="margin-top:6px"><label>装飾品を入れたあとの空きスロット <select id="minfree">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === (p.minFree || 0) ? "selected" : ""}>${n || "指定なし"}</option>`).join("")}</select> 以上</label></div>
        <label class="check"><input type="checkbox" id="ownonly" ${p.ownedOnly ? "checked" : ""}>作成済みの防具だけ使う（データ編集・防具ページの「作成済み」）</label>
        <div class="row"><label>防具のレア度 <select id="rmin">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${(p.rareMin || 1) === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select> 〜
          <select id="rmax">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${(p.rareMax || 10) === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label></div>
        <div class="muted" style="margin-top:6px">出したくないスキル（この効果が出る組み合わせは出しません）</div>
        <div class="row"><select id="avsel" class="grow"><option value="">（選ぶ）</option>${negEffects().map((e) => `<option value="${esc(e.name)}">${esc(e.name)}（${esc(e.tree)}）</option>`).join("")}</select><button id="avadd">追加</button></div>
        <div class="chips">${(p.avoid || []).map((n) => `<button class="chip" data-unav="${esc(n)}">${esc(n)} ×</button>`).join("")}</div>
        <label>結果の件数 <select id="lim">${SIM_LIMITS.map((n) => `<option value="${n}" ${(p.limit || 1000) === n ? "selected" : ""}>${n ? fmt(n) + "件まで" : "全部（時間切れまで）"}</option>`).join("")}</select></label>
        <div class="muted">表示は20件ずつなので、多くしても画面は重くなりません。多いほど検索に時間がかかります（最長2分で打ち切り）。</div>
        <label>HRで絞る <select id="hrcap">${HR_CAPS.map(([v, l]) => `<option value="${v}" ${(p.hrCap || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <p class="muted">条件に届かない組み合わせは途中で調べるのをやめるので、検索が速くなります。HRで絞ると、その★までのクエスト（村・特殊許可・DLを含む）を全部クリアした扱いで作れる装備を使います。進行チェックより広く、DLCや全クリア系の装備も出ます。</p></details>
      ${pinForm()}
      ${exForm()}
      <p style="margin:8px 0 0"><a href="#sim/sets">マイセット（${state.sets.length}）と必要な素材 ›</a></p>
    </div>
    <div class="simbar">${pinExChips()}
      <div class="row"><button class="primary" id="run" ${Object.keys(targets).length ? "" : "disabled"}>検索</button><button id="stop" hidden>中止</button>
        ${p.hrCap ? `<span class="muted">HRで絞る: ${esc(p.hrCap)}まで</span>` : `<label class="check" style="margin:0"><input type="checkbox" id="mk2" ${p.onlyMakeable ? "checked" : ""}>作れる装備だけ</label>`}
        <span id="status" class="muted"></span></div></div>
    <div id="extra"></div>
    <div id="results"></div>`;
  const $ = (s) => view.querySelector(s);
  $("#type").value = p.type; $("#gender").value = p.gender; $("#ws").value = p.weaponSlots;
  for (const [id, key] of [["type", "type"], ["gender", "gender"], ["ws", "weaponSlots"]]) $(`#${id}`).onchange = (e) => { p[key] = +e.target.value; save(); };
  $("#mk").onchange = (e) => { p.onlyMakeable = e.target.checked; save(); };
  $("#psort").onchange = (e) => { p.pickSort = e.target.value; save(); routes.sim(); };
  $("#uc").onchange = (e) => { p.useCharms = e.target.checked; save(); };
  $("#cf")?.addEventListener("change", (e) => { if (e.target.value === "") delete p.charmFrom; else p.charmFrom = +e.target.value; save(); });
  $("#mind").onchange = (e) => { p.minDef = Math.max(0, Math.min(999, parseInt(e.target.value, 10) || 0)); save(); };
  $("#mins").onchange = (e) => { p.minSlots = +e.target.value; save(); };
  $("#minfree").onchange = (e) => { p.minFree = +e.target.value; save(); routes.sim(); };
  $("#ownonly").onchange = (e) => { p.ownedOnly = e.target.checked; save(); routes.sim(); };
  $("#rmin").onchange = (e) => { p.rareMin = +e.target.value; if (p.rareMax && p.rareMax < p.rareMin) p.rareMax = p.rareMin; if (p.rareMin === 1) delete p.rareMin; save(); routes.sim(); };
  $("#rmax").onchange = (e) => { p.rareMax = +e.target.value; if (p.rareMin && p.rareMin > p.rareMax) p.rareMin = p.rareMax; if (p.rareMax === 10) delete p.rareMax; save(); routes.sim(); };
  $("#avadd").onclick = () => { const v = $("#avsel").value; if (!v) return; p.avoid = [...new Set([...(p.avoid || []), v])]; save(); routes.sim(); };
  view.querySelectorAll("[data-unav]").forEach((b) => (b.onclick = () => { p.avoid = (p.avoid || []).filter((x) => x !== b.dataset.unav); save(); routes.sim(); }));
  $("#hrcap").onchange = (e) => { p.hrCap = e.target.value; save(); routes.sim(); };
  view.querySelectorAll("[data-minres]").forEach((el) => (el.onchange = () => {
    const v = parseInt(el.value, 10);
    (p.minRes ||= [null, null, null, null, null])[+el.dataset.minres] = Number.isNaN(v) ? null : Math.max(-50, Math.min(50, v));
    save();
  }));
  $("#lim").onchange = (e) => { p.limit = +e.target.value; save(); };
  view.querySelector("#mk2")?.addEventListener("change", (e) => { p.onlyMakeable = e.target.checked; save(); routes.sim(); });
  view.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { delete targets[b.dataset.rm]; save(); routes.sim(); }));
  $("#q").oninput = (e) => {
    const q = e.target.value;
    const hits = [];
    if (norm(q)) for (const t of D.skills) for (const ef of t.effects)
      if (ef.pts > 0 && (match(q, ef.name, D.readings) || match(q, t.name, D.readings))) hits.push([t, ef]);
    $("#cands").innerHTML = hits.slice(0, 30).map(([t, ef]) => `<button class="chip" data-t="${esc(t.name)}" data-p="${ef.pts}" title="${esc(ef.desc)}">${esc(ef.name)} <span class="muted">${esc(t.name)}${ef.pts}</span></button>`).join("");
    $("#cands").querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { targets[b.dataset.t] = +b.dataset.p; save(); routes.sim(); }));
  };
  $("#picker").onclick = (ev) => {
    const tb = ev.target.closest("[data-tree]"), eb = ev.target.closest("[data-eff]");
    if (eb) {
      const t = eb.dataset.eff, pts = +eb.dataset.p;
      if (targets[t] === pts) delete targets[t]; else targets[t] = pts;
      save(); routes.sim(); return;
    }
    if (!tb) return;
    const t = D.treeByName[tb.dataset.tree];
    const box = tb.closest("details").querySelector(".pick");
    const open = box.dataset.tree === t.name;
    view.querySelectorAll("#picker .pick").forEach((b) => { b.innerHTML = ""; delete b.dataset.tree; });
    if (open) return;
    box.dataset.tree = t.name;
    box.innerHTML = `<div class="card" style="margin:8px 0 0"><b>${nameWithRuby(t.name, D.readings)}</b>
      ${t.effects.filter((e) => e.pts > 0).map((e) => `<button class="pickrow${targets[t.name] === e.pts ? " on" : ""}" data-eff="${esc(t.name)}" data-p="${e.pts}">
        <span><b>${nameWithRuby(e.name, D.readings)}</b> <span class="muted">${esc(t.name)}+${e.pts}</span>${targets[t.name] === e.pts ? " ✓" : ""}</span>
        <span class="muted">${esc(e.desc)}</span>${effDetail(e.name)}</button>`).join("")}
      <span class="muted">タップで選ぶ・もう一度タップで外す</span></div>`;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  $("#run").onclick = () => runSim($);
  view.querySelectorAll("[data-unpin]").forEach((b) => (b.onclick = () => { delete p.pinned[b.dataset.unpin]; save(); routes.sim(); }));
  view.querySelector("[data-unpinc]")?.addEventListener("click", () => { delete p.pinnedCharm; save(); routes.sim(); });
  bindPinForm($);
  bindSkillSets($);
  document.documentElement.style.setProperty("--top-h", `${document.querySelector(".top").offsetHeight}px`); // .simbar sticks below the title bar
  // デバッグモード: search on every change so the real count shows right away (heavy, so not for everyone)
  if (p.debug && Object.keys(targets).length) runSim($);
  view.querySelectorAll("[data-unex]").forEach(
(b) => (b.onclick = () => { p.excluded = p.excluded.filter((x) => x !== b.dataset.unex); save(); routes.sim(); }));
  view.querySelectorAll("[data-unexd]").forEach((b) => (b.onclick = () => { p.exDecos = (p.exDecos || []).filter((x) => x !== b.dataset.unexd); save(); routes.sim(); }));
  view.querySelectorAll("[data-unexs]").forEach((b) => (b.onclick = () => { p.exSeries = (p.exSeries || []).filter((x) => x !== b.dataset.unexs); save(); routes.sim(); }));
  bindExForm($);
  $("#results").onclick = (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (!b) return;
    const r = lastFound[+b.dataset.n]?.result;
    if (!r) return;
    const part = +b.dataset.part, name = r.pieces[part]?.name;
    if (b.dataset.act === "pin") { p.pinned[part] = name; save(); toast(`${name}を固定して検索し直します`); routes.sim(); view.querySelector("#run").click(); }
    if (b.dataset.act === "ex") { if (!p.excluded.includes(name)) p.excluded.push(name); save(); toast(`${name}を除外して検索し直します`); routes.sim(); view.querySelector("#run").click(); }
    if (b.dataset.act === "save") {
      state.sets.push({ name: `マイセット${state.sets.length + 1}`, pieces: r.pieces.map((x) => x.name), charm: { skills: r.charm.skills, slots: r.charm.slots },
        decos: r.decos.map(([src, d]) => [src, d.name]), torsoUps: r.torsoUps, weaponSlots: p.weaponSlots, targets: { ...p.targets } });
      save(); toast("マイセットに保存しました", { label: "見る", run: () => go(`sim/sets/${state.sets.length - 1}`) });
    }
  };
  $("#stop").onclick = () => { worker?.terminate(); worker = null; $("#stop").hidden = true; $("#status").textContent = "中止しました"; };
};

function skillList(q0 = "") {
  setTitle("スキル一覧");
  const how = state.prefs.pickSort === "kana" ? "kana" : "data";
  view.innerHTML = `<input type="search" id="q" placeholder="系統名・スキル名・効果（ひらがな可）" value="${esc(q0)}">
    <label class="muted">並び <select id="lsort"><option value="data" ${how === "data" ? "selected" : ""}>ゲームの順</option><option value="kana" ${how === "kana" ? "selected" : ""}>五十音順</option></select></label><div id="out"></div>`;
  const kana = (t) => norm(reading(t.name, D.readings) || t.name);
  const ordered = how === "kana" ? [...D.skills].sort((a, b) => kana(a).localeCompare(kana(b), "ja")) : D.skills;
  const draw = (q) => {
    const hit = (t) => !norm(q) || match(q, t.name, D.readings) || t.effects.some((e) => match(q, e.name, D.readings) || norm(e.desc).includes(norm(q)));
    view.querySelector("#out").innerHTML = ordered.filter((t) => t.effects.length && hit(t)).map((t) => `<div class="card">
      <b>${nameWithRuby(t.name, D.readings)}</b> <span class="muted">スキル系統</span>
      <table style="margin-top:6px">${t.effects.map((e) => `<tr><td style="width:3.5em" class="${e.pts > 0 ? "" : "hi"}">${e.pts > 0 ? "+" : ""}${e.pts}</td>
        <td style="text-align:left;white-space:normal">${nameWithRuby(e.name, D.readings)}<div class="muted">${esc(e.desc)}</div>${effDetail(e.name)}</td></tr>`).join("")}</table></div>`).join("") || `<p class="muted">見つかりませんでした。</p>`;
  };
  view.querySelector("#q").oninput = (e) => draw(e.target.value);
  view.querySelector("#lsort").onchange = (e) => { state.prefs.pickSort = e.target.value === "kana" ? "kana" : "cat"; save(); skillList(view.querySelector("#q").value); };
  draw(q0);
}

// Skill set shortcuts: common picks (by effect name), ones the user saved, and the skills of each マイセット.
const SKILL_PRESETS = [
  ["剣士の火力", "斬れ味レベル+1 見切り+2 弱点特効 攻撃力UP【中】"], ["会心特化", "見切り+3 弱点特効 超会心"],
  ["剣士の快適", "業物 砥石使用高速化 回避性能+1"], ["ガンナー（通常弾）", "通常弾・連射矢UP 見切り+2 弱点特効 装填数UP"],
  ["ガンナー（貫通弾）", "貫通弾・貫通矢UP 見切り+2 弱点特効"], ["耳栓・風圧・耐震", "高級耳栓 風圧【大】無効 耐震"], ["採取・捕獲", "採取+2 捕獲の見極め 捕獲名人"],
];
function presetTargets(effects) {
  const out = {};
  for (const name of effects.split(" ")) for (const t of D.skills) { const e = t.effects.find((x) => x.name === name); if (e) out[t.name] = e.pts; }
  return out;
}
function skillSetsHtml() {
  const p = state.prefs;
  const chip = (attr, label, extra = "") => `<button class="chip" ${attr}>${esc(label)}</button>${extra}`;
  return `<details><summary>スキルセットから選ぶ</summary>
    <div class="muted">定番</div><div class="chips">${SKILL_PRESETS.map(([n], i) => chip(`data-preset="${i}"`, n)).join("")}</div>
    ${(p.skillSets || []).length ? `<div class="muted">保存したセット</div><div class="chips">${p.skillSets.map((s, i) => chip(`data-sset="${i}"`, s.name, `<button class="chip" data-ssdel="${i}" aria-label="${esc(s.name)}を消す">×</button>`)).join("")}</div>` : ""}
    ${state.sets.length ? `<div class="muted">マイセットのスキル</div><div class="chips">${state.sets.map((s, i) => chip(`data-myset="${i}"`, s.name)).join("")}</div>` : ""}
    <div class="row" style="margin-top:6px"><input id="ssname" placeholder="セットの名前" style="flex:1;min-width:8em"><button id="sssave" ${Object.keys(p.targets).length ? "" : "disabled"}>今のスキルを保存</button></div>
    <p class="muted">選ぶと、今選んでいるスキルと入れ替わります。</p></details>`;
}
function bindSkillSets($) {
  const p = state.prefs;
  const use = (t) => { p.targets = { ...t }; save(); routes.sim(); };
  view.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => use(presetTargets(SKILL_PRESETS[+b.dataset.preset][1]))));
  view.querySelectorAll("[data-sset]").forEach((b) => (b.onclick = () => use(p.skillSets[+b.dataset.sset].targets)));
  view.querySelectorAll("[data-myset]").forEach((b) => (b.onclick = () => use(state.sets[+b.dataset.myset].targets || {})));
  view.querySelectorAll("[data-ssdel]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.ssdel, removed = p.skillSets.splice(i, 1)[0];
    save(); routes.sim();
    toast(`「${removed.name}」を消しました`, { label: "元に戻す", run: () => { p.skillSets.splice(i, 0, removed); save(); routes.sim(); } });
  }));
  $("#sssave").onclick = () => {
    const name = $("#ssname").value.trim() || `セット${(p.skillSets || []).length + 1}`;
    (p.skillSets ||= []).push({ name, targets: { ...p.targets } });
    save(); toast(`「${name}」を保存しました`); routes.sim();
  };
}
// The charm chosen for the search: a registered one (index) or one typed in on the sim page ("temp", not registered).
const simCharm = (p) => (p.pinnedCharm === "temp" ? p.tempCharm : state.charms[p.pinnedCharm]);
// series name = common start of its piece names (e.g. "イーオスＸ")
function seriesLabel(id) {
  const ps = D.armor.filter((a) => a.series === id);
  if (!ps.length) return id;
  if (isEn()) {
    // English: the words every piece name starts with ("Rathian X Helm", "Rathian X Mail" -> "Rathian X")
    const words = ps.map((a) => nm(a.name).split(" "));
    let n = 0;
    while (words.every((w) => w.length > n + 1 && w[n] === words[0][n])) n++;
    return n ? words[0].slice(0, n).join(" ") : nm(ps[0].name);
  }
  let pre = ps[0].name;
  for (const a of ps) while (!a.name.startsWith(pre)) pre = pre.slice(0, -1);
  return pre.length >= 2 ? pre : ps[0].name;
}
// effects that can be avoided: every effect with negative points, by name -> {tree, pts}
const avoidEffect = (name) => { for (const t of D.skills) for (const e of t.effects) if (e.name === name) return { tree: t.name, pts: e.pts }; return null; };
const negEffects = () => D.skills.flatMap((t) => t.effects.filter((e) => e.pts < 0).map((e) => ({ name: e.name, tree: t.name })));
// Pick fixed armor pieces and the charm right on the sim page (results' 固定 buttons still work too).
function pinForm() {
  const p = state.prefs, tc = p.tempCharm || { skills: {}, slots: 0 }, sk = Object.entries(tc.skills);
  const n = Object.keys(p.pinned).length + (simCharm(p) ? 1 : 0);
  const armorSel = (part) => {
    const list = D.armor.filter((a) => a.part === part && a.type & p.type && a.gender & p.gender);
    const rares = [...new Set(list.map((a) => a.rare))].sort((a, b) => b - a);
    return `<label>${PARTS[part]}<br><select data-pinp="${part}" style="max-width:100%"><option value="">（固定しない）</option>${rares.map((r) => `<optgroup label="レア${r}">${list.filter((a) => a.rare === r).map((a) => `<option ${a.name === p.pinned[part] ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>`;
  };
  const charmLabel = (c) => `${Object.entries(c.skills).map(([t, v]) => `${t}${v > 0 ? "+" : ""}${v}`).join(" ") || "スキルなし"} ${"◯".repeat(c.slots)}`;
  return `<details ${n ? "open" : ""}><summary>装備・護石を固定${n ? ` <span class="pill">${n}</span>` : ""}</summary>
    <div class="row">${[0, 1, 2, 3, 4].map(armorSel).join("")}</div>
    <label>護石<br><select id="pinc"><option value="">（固定しない）</option>${state.charms.map((c, i) => `<option value="${i}" ${p.pinnedCharm === i ? "selected" : ""}>護石${i + 1}: ${esc(charmLabel(c))}</option>`).join("")}<option value="temp" ${p.pinnedCharm === "temp" ? "selected" : ""}>その場で入力する（登録しない）</option></select></label>
    <div id="tempc" ${p.pinnedCharm === "temp" ? "" : "hidden"}>
      ${[0, 1].map((k) => `<div class="row"><label class="grow">スキル${k + 1}<br><select data-tct="${k}">${treeOptions(sk[k]?.[0])}</select></label>
        <label>ポイント<br><input data-tcv="${k}" type="number" inputmode="numeric" min="-10" max="20" value="${sk[k]?.[1] ?? ""}" style="width:6em"></label></div>`).join("")}
      <label>スロット<br><select id="tcs">${[0, 1, 2, 3].map((s) => `<option value="${s}" ${s === tc.slots ? "selected" : ""}>${"◯".repeat(s)}${"―".repeat(3 - s)}</option>`).join("")}</select></label></div>
    <p class="muted">固定した部位は、その防具だけで探します（まだ作れない防具でも使います）。</p></details>`;
}
function bindPinForm($) {
  const p = state.prefs;
  view.querySelectorAll("[data-pinp]").forEach((s) => (s.onchange = () => { if (s.value) p.pinned[s.dataset.pinp] = s.value; else delete p.pinned[s.dataset.pinp]; save(); routes.sim(); }));
  $("#pinc").onchange = (e) => {
    const v = e.target.value;
    if (v === "") delete p.pinnedCharm; else { p.pinnedCharm = v === "temp" ? "temp" : +v; if (v !== "temp") p.useCharms = true; }
    save(); routes.sim();
  };
  const readTemp = () => {
    const skills = {};
    for (const k of [0, 1]) {
      const t = view.querySelector(`[data-tct="${k}"]`).value, v = parseInt(view.querySelector(`[data-tcv="${k}"]`).value, 10);
      if (t && v) skills[t] = (skills[t] || 0) + v;
    }
    p.tempCharm = { skills, slots: +$("#tcs").value }; save();
  };
  view.querySelectorAll("#tempc select, #tempc input").forEach((el) => (el.onchange = readTemp));
}
// Exclude a piece or a whole series before searching (results' 除外 buttons still work too).
function exForm() {
  const p = state.prefs, n = p.excluded.length + (p.exSeries || []).length + (p.exDecos || []).length;
  return `<details ${n ? "open" : ""}><summary>除外する防具・シリーズ・装飾品${n ? ` <span class="pill">${n}</span>` : ""}</summary>
    <datalist id="dl-simarmor">${[...new Set(D.armor.filter((a) => a.type & p.type && a.gender & p.gender).map((a) => a.name))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
    <div class="row"><input class="grow" id="exin" list="dl-simarmor" placeholder="防具の名前（候補から選べます）"></div>
    <div class="row"><button id="exone">この防具を除外</button><button id="exser">このシリーズを全部除外</button></div>
    <datalist id="dl-simdeco">${D.decos.map((d) => `<option value="${esc(d.name)}">`).join("")}</datalist>
    <div class="row"><input class="grow" id="exdin" list="dl-simdeco" placeholder="装飾品の名前（候補から選べます）"><button id="exdeco">この装飾品を使わない</button></div>
    <p class="muted">除外したものは検索ボタンの上に並びます。×で戻せます。</p></details>`;
}
function bindExForm($) {
  const p = state.prefs;
  const pick = () => { const a = D.armor.find((x) => x.name === $("#exin").value.trim()); if (!a) toast("その名前の防具が見つかりません。候補から選んでください。"); return a; };
  $("#exone").onclick = () => { const a = pick(); if (!a) return; if (!p.excluded.includes(a.name)) p.excluded.push(a.name); save(); routes.sim(); };
  $("#exdeco").onclick = () => { const n = $("#exdin").value.trim(); if (!D.decos.some((d) => d.name === n)) return toast("その名前の装飾品が見つかりません。候補から選んでください。"); p.exDecos = [...new Set([...(p.exDecos || []), n])]; save(); routes.sim(); };
  $("#exser").onclick = () => { const a = pick(); if (!a) return; p.exSeries = [...new Set([...(p.exSeries || []), a.series])]; save(); routes.sim(); toast(`${seriesLabel(a.series)}シリーズを除外しました`); };
}
function pinExChips() {
  const p = state.prefs;
  const pins = Object.entries(p.pinned).map(([part, name]) => `<button class="chip on" data-unpin="${part}">固定 ${PARTS[part]}: ${esc(name)} ×</button>`);
  const pc = simCharm(p);
  if (pc) pins.push(`<button class="chip on" data-unpinc="1">固定 護石: ${Object.entries(pc.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") || "スキルなし"} ${"◯".repeat(pc.slots)} ×</button>`);
  const exs = [...p.excluded.map((name) => `<button class="chip" data-unex="${esc(name)}">除外: ${esc(name)} ×</button>`),
    ...(p.exSeries || []).map((id) => `<button class="chip" data-unexs="${esc(id)}">除外: ${esc(seriesLabel(id))}シリーズ ×</button>`),
    ...(p.exDecos || []).map((n) => `<button class="chip" data-unexd="${esc(n)}">使わない: ${esc(n)} ×</button>`)];
  return pins.length || exs.length ? `<div class="chips" style="margin:6px 0">${pins.join("")}${exs.join("")}</div>` : "";
}

// HRで絞る: pretend every quest up to a 集会所 tab is cleared (village all, special permits and DL
// quests up to that rank). Like other simulators, so DLC / all-clear gear can appear.
const HR_CAPS = [["", "使わない（進行チェックで決める）"], ["★３", "下位（集会所★3まで）"], ["★７", "上位（集会所★7まで）"], ["Ｇ★１", "G★1まで"], ["Ｇ★２", "G★2まで"], ["Ｇ★３", "G★3まで"], ["Ｇ★４", "G★4まで（全部）"]];
const TAB_ORDER = ["★１", "★２", "★３", "★４", "★５", "★６", "★７", "Ｇ★１", "Ｇ★２", "Ｇ★３", "Ｇ★４"];
let hrCache = {};
function hrQuestIds(cap) {
  const lim = TAB_ORDER.indexOf(cap);
  const rankOK = (r) => r === "下位" || (r === "上位" && lim >= 3) || (r === "G級" && cap === "Ｇ★４");
  return D.quests.filter((q) => q.vendor === "村" ||
    (q.vendor === "集会所" && (TAB_ORDER.includes(q.tab) ? TAB_ORDER.indexOf(q.tab) <= lim : lim >= 3)) ||
    (q.vendor === "特殊許可" && rankOK(rankOf(q)))).map((q) => q.id);
}
function haveForHR(cap) {
  return (hrCache[cap] ||= obtainable(D, D.sources, hrQuestIds(cap)));
}

// ---- where to farm: the quest pool chosen with farmBar() (cleared / open tabs / HR), DL quests optional
const isDL = (q) => /ＤＬ/.test(`${q.tab}${q.badge || ""}`);
// Tabs open now (village / hub): up to the highest tab with a cleared quest, plus the next one once a
// 緊急 quest of that tab is cleared. next = quests of the tab right after the open ones.
function openTabs() {
  const done = new Set(state.cleared), open = new Set(state.cleared), next = [];
  for (const [vendor, order] of Object.entries(UNLOCK_ORDER)) {
    const inTab = (i) => D.quests.filter((q) => q.vendor === vendor && q.tab === order[i]);
    let top = 0;
    order.forEach((_, i) => { if (inTab(i).some((q) => done.has(q.id))) top = Math.max(top, i); });
    if (inTab(top).some((q) => done.has(q.id) && (q.badge || "").includes("緊急"))) top = Math.min(top + 1, order.length - 1);
    for (let i = 0; i <= top; i++) for (const q of inTab(i)) open.add(q.id);
    if (top + 1 < order.length) next.push(...inTab(top + 1).map((q) => q.id));
  }
  return { open: [...open], next };
}
// event quests not downloaded cannot be played; an empty list means "not filled in", so all count
const dlOwned = (id) => !state.dl?.length || state.dl.includes(id) || D.questById[id]?.vendor !== "集会所";
function farmPool() {
  const p = state.prefs;
  const ids = p.farmScope === "hr" && p.farmCap ? hrQuestIds(p.farmCap) : p.farmScope === "open" ? openTabs().open : state.cleared;
  const cleared = new Set(state.cleared);
  const pool = new Set(ids.filter((id) => p.farmDL || cleared.has(id) || !isDL(D.questById[id] || {})));
  if (p.farmDL) for (const q of D.quests) if (isDL(q) && dlOwned(q.id)) pool.add(q.id);
  return [...pool];
}
const farmLabel = () => { const p = state.prefs; return `${p.farmScope === "hr" && p.farmCap ? `HR: ${p.farmCap}まで` : p.farmScope === "open" ? "今行ける段" : "クリア済み"}${p.farmDL ? "＋ダウンロード" : ""}`; };
// Scope switch shown above each list of farming tips; changes re-draw the page (delegated handlers below).
function farmBar() {
  const p = state.prefs, sc = p.farmScope || "cleared";
  return `<div class="row farmbar"><span class="muted">探す範囲</span><div class="chips">${[["cleared", "クリア済み"], ["open", "今行ける段"], ["hr", "HRで決める"]].map(([v, l]) => `<button class="chip ${sc === v ? "on" : ""}" data-farm="${v}">${l}</button>`).join("")}</div>
    ${sc === "hr" ? `<select data-farmcap>${HR_CAPS.filter(([v]) => v).map(([v, l]) => `<option value="${v}" ${p.farmCap === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    <label class="check" style="margin:0"><input type="checkbox" data-farmdl ${p.farmDL ? "checked" : ""}>ダウンロードクエストも${state.dl?.length ? "（入れてあるものだけ）" : ""}</label></div>`;
}
view.addEventListener("click", (e) => { const b = e.target.closest("[data-farm]"); if (!b) return; state.prefs.farmScope = b.dataset.farm; if (b.dataset.farm === "hr") state.prefs.farmCap ||= "★７"; save(); render(); });
view.addEventListener("change", (e) => {
  if (e.target.matches("[data-farmcap]")) { state.prefs.farmCap = e.target.value; save(); render(); }
  if (e.target.matches("[data-farmdl]")) { state.prefs.farmDL = e.target.checked; save(); render(); }
});
// Extra lines under a material's best quest: the next tab when it is much better, a gathering spot,
// and friends' cleared quests when my pool has nothing.
function farmExtras(id, best) {
  const out = [];
  if (state.prefs.farmScope !== "hr") {
    const pool = new Set(farmPool());
    const nx = recommendQuests(D, id, openTabs().next.filter((x) => !pool.has(x) && ((state.prefs.farmDL && dlOwned(x)) || !isDL(D.questById[x]))), 1, true)[0];
    if (nx && (!best || nx.rate > best.rate * 1.5)) out.push(`<a class="ruby" href="#find/quest/${nx.q.id}">★ ${esc(nx.q.vendor)}${esc(nx.q.tab)}を開くと「${esc(nx.q.name)}」で1回約${nx.n.toFixed(1)}個</a>`);
  }
  if (!best) {
    for (const b of buyInfo(id)) out.push(`<a class="ruby" href="#find/shop">${esc(b)}</a>`);
    const g = (D.sources[id] || []).filter((x) => x.type === "map").sort((a, b) => b.pct - a.pct)[0];
    if (g) out.push(`<a class="ruby" href="#maps/${encodeURIComponent(g.map)}/${g.area}">採取: ${esc(g.map)} ${g.area === 0 ? "ベースキャンプ" : `エリア${g.area}`}（${esc(g.rank)} ${g.pct}%）</a>`);
    for (const fr of state.friends) {
      const r = fr.cleared && recommendQuests(D, id, fr.cleared, 1)[0];
      if (r) out.push(`<a class="ruby" href="#find/quest/${r.q.id}">${esc(fr.name)}のクリア済み: 「${esc(r.q.name)}」（${esc(r.how)}）</a>`);
    }
  }
  return out.join("");
}
// "まとめて集まるクエスト" box for a list of short materials.
function bundleHtml(ids) {
  if (ids.length < 2) return "";
  const b = bundleQuests(D, ids, farmPool(), 3);
  return b.length ? `<h3>まとめて集まるクエスト（${esc(farmLabel())}）</h3><ul class="list">${b.map((x) => `<li><a href="#find/quest/${x.q.id}"><span class="grow">${nameWithRuby(x.q.name, D.readings)}${capMark(x.q)} <span class="pill">${x.kinds}種類</span>
    <span class="ruby">${x.items.map((it) => `${esc(itemName(it.id))} 約${it.n.toFixed(1)}`).join("、")}</span></span>›</a></li>`).join("")}</ul>` : "";
}
// result count choices; 0 = no limit (stops at the time limit)
const SIM_LIMITS = [100, 500, 1000, 2000, 5000, 10000, 30000, 0];
function simParams() {
  const p = state.prefs;
  // HR cap (when chosen) replaces the progress check; otherwise "作れるものだけ" uses progress
  const hv = p.hrCap ? haveForHR(p.hrCap) : have;
  const limit = !!p.hrCap || p.onlyMakeable;
  const pieces = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  const excluded = new Set(p.excluded), exSeries = new Set(p.exSeries || []), owned = new Set(state.owned);
  for (const a of D.armor) {
    if (!(a.type & p.type) || !(a.gender & p.gender)) continue;
    if (p.pinned[a.part] !== undefined) { if (a.name === p.pinned[a.part]) pieces[a.part].push(a); continue; } // pinned piece is used even if not craftable yet
    if (excluded.has(a.name) || exSeries.has(a.series)) continue;
    if (p.ownedOnly && !owned.has(a.name)) continue;
    if (a.rare && ((p.rareMin && a.rare < p.rareMin) || (p.rareMax && a.rare > p.rareMax))) continue; // rare 0 = unknown (quest-reward pieces), never filtered out
    if (limit && !canMake(a.mats, hv)) continue;
    pieces[a.part].push(a);
  }
  const exDecos = new Set(p.exDecos || []);
  const decos = D.decos.filter((d) => !exDecos.has(d.name) && (!limit || canMakeDeco(d, hv)));
  // charms of a friend (p.charmFrom) instead of our own; a pinned charm index only means our own list
  const cfr = state.friends[p.charmFrom]?.charms?.length ? state.friends[p.charmFrom] : null;
  let charms = p.useCharms ? (cfr ? cfr.charms : state.charms).map((c, i) => ({ skills: c.skills, slots: c.slots, name: cfr ? `${cfr.name}の護石${i + 1}` : `護石${i + 1}`, def: [0, 0] })) : [];
  if (p.pinnedCharm === "temp" && p.tempCharm) charms = [{ ...p.tempCharm, name: "その場の護石", def: [0, 0] }];
  else if (!cfr && p.useCharms && charms[p.pinnedCharm]) charms = [charms[p.pinnedCharm]];
  return { targets: p.targets, pieces, charms, decos, weaponSlots: p.weaponSlots, minDef: p.minDef || 0, minSlots: p.minSlots || 0, minRes: p.minRes || [],
    avoid: (p.avoid || []).map(avoidEffect).filter(Boolean), minFree: p.minFree || 0 };
}

let lastFound = [], lastPieces = null;
// Pieces the search treated as the same (equal target-skill points, slots and torso-up) — the search keeps only one of them.
function swapsHtml(p, i) {
  const trees = Object.keys(state.prefs.targets);
  const alt = (lastPieces?.[i] || []).filter((a) => a.name !== p.name && a.slots === p.slots && !a.skills[TORSO_UP] === !p.skills[TORSO_UP] && trees.every((t) => (a.skills[t] || 0) === (p.skills[t] || 0)));
  return alt.length ? `<div class="muted" title="狙うスキルのポイントとスロットが同じ防具です。ほかのスキルは違うことがあります">入れ替えられる（狙うスキルとスロットが同じ）: ${alt.slice(0, 8).map((a) => esc(a.name)).join("、")}${alt.length > 8 ? ` ほか${alt.length - 8}` : ""}</div>` : "";
}
function runSim($) {
  worker?.terminate();
  worker = new Worker("js/sim-worker.js?v=1.0.0", { type: "module" });
  const out = $("#results");
  out.innerHTML = "";
  $("#extra").innerHTML = "";
  let n = 0;
  const found = [];
  lastFound = found;
  $("#status").textContent = "検索中…";
  $("#stop").hidden = false;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "result") { n++; found.push(m); if (resView() !== "list" && n <= RES_PAGE) out.insertAdjacentHTML("beforeend", resultItem(m, n, n - 1)); $("#status").textContent = `${n}件`; }
    else {
      resShown = RES_PAGE; renderResults($, found);
      $("#stop").hidden = true;
      $("#status").textContent = m.type === "error" ? `エラー: ${m.message}` :
        n ? `${n}件見つかりました${m.timeout ? "（時間切れで打ち切り）" : ""}` :
          `見つかりませんでした。スキルを減らすか、「作れる装備だけ」${state.prefs.minDef || state.prefs.minSlots ? "やしぼりこみの条件" : ""}を外してみてください。`;
      if (!n && m.type !== "error" && !m.timeout) {
        $("#extra").innerHTML = `<div class="card"><button id="vc">こんな護石があれば組める、を探す（仮想護石）</button><div id="vcout"></div></div>`;
        $("#vc").onclick = () => vcharmSearch($);
      }
      if (n && m.type !== "error") {
        $("#extra").innerHTML = `<div class="card"><button id="xs">このスキルに、さらに足せるスキルを探す</button><div id="xsout"></div></div>`;
        $("#xs").onclick = () => extraSearch($);
      }
      worker.terminate(); worker = null;
    }
  };
  const params = simParams();
  lastPieces = params.pieces;
  mirrorOut({ sim: Date.now() });
  worker.postMessage({ ...params, limit: state.prefs.limit === 0 ? Infinity : state.prefs.limit || 1000, timeoutMs: 120000 });
}

// 仮想護石: charms (1-2 target skills, 0-3 slots) that would give results; not a promise the game makes them.
function vcharmSearch($) {
  worker?.terminate();
  worker = new Worker("js/sim-worker.js?v=1.0.0", { type: "module" });
  const box = $("#vcout");
  $("#vc").disabled = true;
  box.innerHTML = `<p class="muted">調べています…（最長30秒）</p>`;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "error") box.innerHTML = `<p class="muted">エラー: ${esc(m.message)}</p>`;
    else if (m.type === "done") {
      const label = (c) => `${Object.entries(c.skills).map(([t, v]) => `${esc(t)}+${v}`).join(" ")} ${"◯".repeat(c.slots)}${"―".repeat(3 - c.slots)}`;
      box.innerHTML = m.charms.length ? `<p class="muted">次のどれか1つを持っていれば組めます（ゲームで出るとは限りません）。押すと、その護石を「その場で入力する」に入れて検索し直します。${m.timeout ? "時間切れで、途中までの結果です。" : ""}</p>
        <div class="chips">${m.charms.map((c, i) => `<button class="chip" data-vc="${i}">${label(c)}</button>`).join("")}</div>`
        : `<p class="muted">護石2スキル（各13ポイントまで）・スロット3まででは組めませんでした。${m.timeout ? "（時間切れ）" : ""}スキルを減らすか、しぼりこみを外してみてください。</p>`;
      box.onclick = (ev) => {
        const b = ev.target.closest("[data-vc]");
        if (!b) return;
        const c = m.charms[+b.dataset.vc];
        Object.assign(state.prefs, { pinnedCharm: "temp", tempCharm: { skills: c.skills, slots: c.slots } }); save(); routes.sim(); view.querySelector("#run").click();
      };
      worker.terminate(); worker = null;
    }
  };
  worker.postMessage({ ...simParams(), mode: "vcharm", totalMs: 30000 });
}

// 追加スキル検索: try each not-yet-chosen skill (or the next level of a chosen one) on top of the current targets.
function extraSearch($) {
  const targets = state.prefs.targets;
  const candidates = [];
  for (const t of D.skills) {
    const lv = t.effects.filter((e) => e.pts > 0).map((e) => e.pts).sort((a, b) => a - b);
    const next = lv.find((v) => v > (targets[t.name] || 0));
    if (next) candidates.push([t.name, next]);
  }
  worker?.terminate();
  worker = new Worker("js/sim-worker.js?v=1.0.0", { type: "module" });
  const box = $("#xsout");
  const hits = [];
  $("#xs").disabled = true;
  box.innerHTML = `<p class="muted" id="xsst">調べています…</p><div class="chips" id="xschips"></div>`;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "extra") {
      const ef = D.treeByName[m.tree].effects.find((x) => x.pts === m.pts);
      hits.push(m);
      box.querySelector("#xschips").insertAdjacentHTML("beforeend", `<button class="chip" data-xt="${esc(m.tree)}" data-xp="${m.pts}" title="${esc(ef.desc)}">＋${esc(ef.name)}</button>`);
    } else if (m.type === "progress") box.querySelector("#xsst").textContent = `調べています… ${m.i}/${m.n}`;
    else {
      box.querySelector("#xsst").textContent = m.type === "error" ? `エラー: ${m.message}` :
        `${hits.length}個のスキルを足せます。タップすると発動させたいスキルに加えます。${m.unknown ? `（${m.unknown}個は時間内に調べきれませんでした）` : ""}`;
      worker.terminate(); worker = null; $("#xs").disabled = false;
    }
  };
  box.onclick = (ev) => {
    const b = ev.target.closest("[data-xt]");
    if (!b) return;
    targets[b.dataset.xt] = +b.dataset.xp; save(); routes.sim();
  };
  worker.postMessage({ ...simParams(), mode: "extra", candidates, perCandidateMs: 250 });
}

// Numbers used for sorting and the table view of one search result.
function resultStats(f) {
  const ps = f.result.pieces;
  return { def: ps.reduce((s, p) => s + p.def[1], 0), slots: ps.reduce((s, p) => s + p.slots, 0),
    res: ELEMENTS.map((_, e) => ps.reduce((s, p) => s + (p.res?.[e] || 0), 0)), owned: ps.filter((p) => state.owned.includes(p.name)).length };
}
// Sort keys for the result list; "t:<tree>" sorts by that skill's total points. Ties keep the higher defense first.
function resultSorts() {
  return [["def", "防御力"], ["slots", "スロット合計"], ["res", "耐性の合計"], ["owned", "作成済みが多い"], ...Object.keys(state.prefs.targets).map((t) => [`t:${t}`, `${t}のポイント`])];
}
function sortFound(found) {
  const how = state.prefs.resSort || "def";
  const key = (f) => { const st = resultStats(f); return how === "slots" ? st.slots : how === "res" ? st.res.reduce((a, b) => a + b, 0) : how === "owned" ? st.owned : how.startsWith("t:") ? f.totals[how.slice(2)] || 0 : st.def; };
  found.sort((a, b) => key(b) - key(a) || resultStats(b).def - resultStats(a).def);
}
// Final list: sort toolbar + cards or table (both keep the 固定 / 除外 / 保存 buttons, found index = data-n).
// Results are drawn RES_PAGE at a time (about 4 phone screens); more come on scroll or with a button (prefs.resMore).
const RES_PAGE = 20;
let resShown = RES_PAGE, moreObs = null;
function renderResults($, found) {
  const p = state.prefs;
  moreObs?.disconnect(); moreObs = null;
  if (!resultSorts().some(([v]) => v === p.resSort)) p.resSort = "def";
  sortFound(found);
  const shown = found.slice(0, resShown), rest = found.length - shown.length;
  const bar = found.length ? `<div class="row resbar"><div class="chips">${[["list", "一覧"], ["table", "表"], ["card", "カード"]].map(([v, l]) => `<button class="chip ${resView() === v ? "on" : ""}" data-rview="${v}">${l}</button>`).join("")}</div>
    <label class="muted">並び <select id="rsort">${resultSorts().map(([v, l]) => `<option value="${esc(v)}" ${p.resSort === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
    <label class="muted">続き <select id="rmore"><option value="auto" ${p.resMore !== "button" ? "selected" : ""}>スクロールで自動</option><option value="button" ${p.resMore === "button" ? "selected" : ""}>ボタンで</option></select></label></div>` : "";
  const more = rest > 0 ? `<div id="resmore" class="row" style="justify-content:center;margin:10px 0"><button id="resmorebtn">もっと見る（あと${rest}件）</button></div>` : "";
  $("#results").innerHTML = bar + (resView() === "list" ? resultList(shown) : shown.map((f, i) => resultItem(f, i + 1, i)).join("")) + more;
  const loadMore = () => { resShown += RES_PAGE; renderResults($, found); };
  $("#results").querySelector("#resmorebtn")?.addEventListener("click", loadMore);
  if (rest > 0 && p.resMore !== "button" && "IntersectionObserver" in window) {
    moreObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: "300px" });
    moreObs.observe($("#results").querySelector("#resmore"));
  }
  $("#results").querySelector("#rmore")?.addEventListener("change", (e) => { p.resMore = e.target.value; save(); renderResults($, found); });
  $("#results").querySelectorAll("tbody.rl").forEach((tb) => (tb.querySelector(".rlhead").onclick = () => {
    const d = tb.querySelector(".rldet"); d.hidden = !d.hidden;
    if (!d.hidden && !d.dataset.done) { const i = +tb.dataset.i; d.firstElementChild.innerHTML = resultCard(found[i].result, found[i].totals, i + 1, i); d.dataset.done = 1; }
  }));
  $("#results").querySelectorAll("[data-rview]").forEach((b) => (b.onclick = () => { p.resView = b.dataset.rview; save(); resShown = RES_PAGE; renderResults($, found); }));
  $("#results").querySelector("#rsort")?.addEventListener("change", (e) => { p.resSort = e.target.value; save(); resShown = RES_PAGE; renderResults($, found); });
}
const resView = () => state.prefs.resView || "list";
const resultItem = (f, n, idx) => (resView() === "table" ? resultTable(f, n, idx) : resultCard(f.result, f.totals, n, idx));
// 一覧: two lines per result in one wide table (scrolls sideways) so many fit on a phone screen; tap a result for its card.
function resultList(found) {
  const head = `<thead><tr><th>#</th>${PARTS.map((p) => `<th>${p}</th>`).join("")}<th>護石</th></tr></thead>`;
  const body = found.map((f, i) => {
    const r = f.result, st = resultStats(f);
    const charm = Object.entries(r.charm.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") || esc(r.charm.name);
    return `<tbody class="rl" data-i="${i}"><tr class="rlhead"><td rowspan="2" class="rln">${i + 1}</td>${r.pieces.map((p) => `<td>${esc(p.name)}${state.owned.includes(p.name) ? " ✓" : ""}${p.slots ? ` <span class="sl sl${p.slots}">${"◯".repeat(p.slots)}</span>` : ""}</td>`).join("")}<td>${charm}</td></tr>
      <tr class="rlhead rlnum"><td>防${st.def}</td>${st.res.map((v, e) => `<td><span class="el-${ELEMENTS[e]}">${ELEMENTS[e]}</span>${resCell(v)}</td>`).join("")}</tr>
      <tr class="rldet" hidden><td colspan="7"><div></div></td></tr></tbody>`;
  }).join("");
  return `<div class="table-wrap rlwrap"><table class="rltable">${head}${body}</table></div><p class="muted">行を押すと、スキル・装飾品と「固定」「除外」「保存」が開きます。表は横にずらせます。</p>`;
}
const resCell = (v) => `<span class="${v > 0 ? "rplus" : v < 0 ? "rminus" : "rzero"}">${v > 0 ? "+" : ""}${v}</span>`;
const slotMarks = (n) => (n ? `<span class="sl sl${n}">${"◯".repeat(n)}</span>` : `<span class="rzero">-</span>`);
// Table view: one row per piece (defense, slots, resistances); tap a row for its skills, materials and buttons.
function resultTable(f, n, idx) {
  const r = f.result, st = resultStats(f), act = activated(f.totals, D.skills);
  const btn = (a, part, label) => `<button class="mini" data-act="${a}" data-n="${idx}" data-part="${part}">${label}</button>`;
  const where = (src) => (src === "weapon" ? "武器" : src === "charm" ? "護石" : PARTS[src]);
  const decoList = {};
  for (const [src, d] of r.decos) { const k = `${d.name}（${where(src)}）`; decoList[k] = (decoList[k] || 0) + 1; }
  const head = `<div class="rgrid rhead"><span>部位</span><span>防具</span><span>防御</span><span>スロ</span>${ELEMENTS.map((e) => `<span class="el-${e}">${e}</span>`).join("")}</div>`;
  const rows = r.pieces.map((p, i) => {
    const ok = canMake(p.mats, have);
    return `<details class="rrow"><summary class="rgrid"><span>${PARTS[i]}</span><span class="rname">${esc(p.name)}${state.owned.includes(p.name) ? " ✓" : ""}</span><span>${p.def[1]}</span><span>${slotMarks(p.slots)}</span>${(p.res || [0, 0, 0, 0, 0]).map(resCell).join("")}</summary>
      <div class="rdet"><div class="chips">${Object.entries(p.skills).map(([t, v]) => `<span class="chip">${esc(t)}${v > 0 ? "+" : ""}${v}</span>`).join("")}</div>
        <div class="muted">${state.owned.includes(p.name) ? "作成済み" : ok ? "いまの進行で作れます" : "まだ作れません（足りない素材があります）"}：${(p.mats || []).map(([it, q]) => `${esc(itemName(it))}×${q}${have.has(it) ? "" : "⚠"}`).join("、") || "素材データなし"}</div>
        ${swapsHtml(p, i)}<div class="row" style="margin-top:4px">${btn("pin", i, "固定")}${btn("ex", i, "除外")}<a href="#find/armor/${encodeURIComponent(p.name)}">防具のページ ›</a></div></div></details>`;
  }).join("");
  const charmText = Object.entries(r.charm.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") || esc(r.charm.name);
  return `<div class="card result rtable"><div class="row"><b>#${n}</b><span class="muted grow">防御 最大${st.def}・スロット計${st.slots}${st.owned ? `・作成済み${st.owned}/5` : ""}</span>${btn("save", -1, "保存")}</div>
    ${head}${rows}<div class="rgrid rtotal"><span></span><span>合計</span><span>${st.def}</span><span>${st.slots}</span>${st.res.map(resCell).join("")}</div>
    <div class="muted">護石: ${charmText} ${"◯".repeat(r.charm.slots || 0)}${r.decos.length ? ` ／ 装飾品: ${Object.entries(decoList).map(([k, c]) => `${esc(k)}×${c}`).join("、")}` : ""}</div>
    <div class="skills chips">${act.map((e) => `<span class="chip ${e.pts > 0 ? "on" : ""}">${esc(e.name)}</span>`).join("")}</div></div>`;
}
function resultCard(r, sum, n, idx) {
  const def = r.pieces.reduce((s, p) => s + p.def[1], 0);
  const where = (src) => src === "weapon" ? "武器" : src === "charm" ? "護石" : PARTS[src];
  const decoList = {};
  for (const [src, d] of r.decos) { const k = `${d.name}（${where(src)}）`; decoList[k] = (decoList[k] || 0) + 1; }
  const act = activated(sum, D.skills);
  const btn = (act, part, label) => `<button class="mini" data-act="${act}" data-n="${idx}" data-part="${part}">${label}</button>`;
  const charmText = Object.entries(r.charm.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") || esc(r.charm.name);
  // compact card for the simulator list (several per phone screen); pin/exclude and decorations fold away
  if (idx !== undefined) return `<div class="card result compact"><div class="row"><b>#${n}</b><span class="muted grow">防御 最大${def}・防具スロット計${r.pieces.reduce((s, p) => s + p.slots, 0)}</span>${btn("save", -1, "保存")}</div>
    <div class="muted rres">耐性 ${ELEMENTS.map((e, i) => `<span class="el-${e}">${e}</span>${resCell(r.pieces.reduce((s, p) => s + (p.res?.[i] || 0), 0))}`).join(" ")}</div>
    <div class="pcs">${r.pieces.map((p, i) => `<span><i>${PARTS[i]}</i>${esc(p.name)}${state.owned.includes(p.name) ? " ✓" : ""}${p.slots ? `<small>${"◯".repeat(p.slots)}</small>` : ""}</span>`).join("")}<span><i>護石</i>${charmText}</span></div>
    <div class="skills chips">${act.map((e) => `<span class="chip ${e.pts > 0 ? "on" : ""}">${esc(e.name)}</span>`).join("")}</div>
    <details><summary>くわしく（固定・除外・装飾品）</summary>
      <table class="pieces">${r.pieces.map((p, i) => `<tr><td>${PARTS[i]}</td><td style="text-align:left;white-space:normal"><a href="#find/armor/${encodeURIComponent(p.name)}">${esc(p.name)}</a>${swapsHtml(p, i)}</td><td style="text-align:right">${btn("pin", i, "固定")}${btn("ex", i, "除外")}</td></tr>`).join("")}</table>
      ${r.decos.length ? `<div class="muted">装飾品: ${Object.entries(decoList).map(([k, c]) => `${esc(k)}×${c}`).join("、")}</div>` : ""}</details></div>`;
  return `<div class="card result"><div class="row"><b class="grow">#${n}</b><span class="muted">防御 最大${def}</span>${idx === undefined ? "" : btn("save", -1, "マイセットに保存")}</div>
    <table class="pieces">${r.pieces.map((p, i) => `<tr><td>${PARTS[i]}</td><td style="text-align:left;white-space:normal"><a href="#find/armor/${encodeURIComponent(p.name)}">${esc(p.name)}</a> <span class="muted">${"◯".repeat(p.slots)}</span></td>
      ${idx === undefined ? "" : `<td style="text-align:right">${btn("pin", i, "固定")}${btn("ex", i, "除外")}</td>`}</tr>`).join("")}
    <tr><td>護石</td><td style="text-align:left" colspan="2">${Object.entries(r.charm.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") || esc(r.charm.name)}</td></tr></table>
    ${r.decos.length ? `<div class="muted">装飾品: ${Object.entries(decoList).map(([k, c]) => `${esc(k)}×${c}`).join("、")}</div>` : ""}
    <div class="skills chips" style="margin-top:6px">${act.map((e) => `<span class="chip ${e.pts > 0 ? "on" : ""}">${esc(e.name)}</span>`).join("")}</div></div>`;
}

// ---------------------------------------------------------------- マイセット

function setToResult(s) {
  // "" = 装備なし in the game's myset: an empty piece with nothing on it
  const none = (i) => ({ name: "装備なし", part: i, type: 3, gender: 3, def: [0, 0], res: [0, 0, 0, 0, 0], slots: 0, skills: {}, mats: [], zeny: 0, rare: 0 });
  const pieces = s.pieces.map((name, i) => (name ? D.armor.find((a) => a.name === name && a.part === i) : none(i)));
  if (pieces.some((x) => !x)) return null;
  const decoByName = Object.fromEntries(D.decos.map((d) => [d.name, d]));
  const decos = s.decos.map(([src, name]) => [src, decoByName[name]]).filter(([, d]) => d);
  return { pieces, charm: { name: "護石", ...s.charm }, decos, torsoUps: s.torsoUps || 0 };
}

function setsList() {
  setTitle("マイセット");
  view.innerHTML = state.sets.length ? `<ul class="list">${state.sets.map((s, i) => `<li class="item"><input type="checkbox" data-cmp="${i}" aria-label="比べる"><a class="grow" href="#sim/sets/${i}"><span class="grow">${esc(s.name)}
    <span class="ruby">${s.pieces.map(esc).join(" / ")}</span></span>›</a></li>`).join("")}</ul>
    ${state.sets.length > 1 ? `<div class="row"><button class="primary" id="cmp" disabled>チェックしたセットを比べる（2〜3個）</button></div>` : ""}`
    : `<p class="muted">シミュの結果にある「マイセットに保存」で、組み合わせをここに残せます。必要な素材もまとめて見られます。</p>`;
  view.innerHTML += `<p><a href="#share">友達と見せ合う（テキストで送る・読み込む）›</a></p>`;
  const picked = () => [...view.querySelectorAll("[data-cmp]:checked")].map((c) => c.dataset.cmp);
  view.querySelectorAll("[data-cmp]").forEach((c) => (c.onchange = () => { const n = picked().length; view.querySelector("#cmp").disabled = n < 2 || n > 3; }));
  view.querySelector("#cmp")?.addEventListener("click", () => go(`sim/compare/${picked().join(",")}`));
}

// Side-by-side view of 2-3 saved sets.
function compareSets(ids) {
  setTitle("マイセットを比べる");
  const sets = String(ids || "").split(",").map((i) => [+i, state.sets[+i]]).filter(([, s]) => s);
  const cols = sets.map(([i, s]) => {
    const r = setToResult(s);
    if (!r) return { i, s };
    const sum = totals(r);
    const need = {};
    for (const a of r.pieces) if (!state.owned.includes(a.name)) for (const [id, q] of a.mats || []) need[id] = (need[id] || 0) + q;
    for (const [, d] of r.decos) for (const [id, q] of d.recipes[0]) need[id] = (need[id] || 0) + q;
    return { i, s, r, act: activated(sum, D.skills).filter((e) => e.pts > 0).map((e) => e.name),
      def: r.pieces.reduce((t, p) => t + p.def[1], 0), slots: r.pieces.reduce((t, p) => t + p.slots, 0),
      kinds: Object.keys(need).length, short: Object.keys(need).filter((id) => !have.has(id)).length };
  });
  if (cols.length < 2) return go("sim/sets");
  const allSkills = [...new Set(cols.flatMap((c) => c.act || []))];
  const row = (label, f) => `<tr><td>${label}</td>${cols.map((c) => `<td style="white-space:normal">${c.r ? f(c) : "-"}</td>`).join("")}</tr>`;
  view.innerHTML = `<div class="table-wrap"><table>
    <tr><th></th>${cols.map((c) => `<th><a href="#sim/sets/${c.i}">${esc(c.s.name)}</a></th>`).join("")}</tr>
    ${row("防御（最大）", (c) => c.def)}
    ${row("防具スロット", (c) => c.slots)}
    ${PARTS.map((pt, k) => row(pt, (c) => esc(c.r.pieces[k].name))).join("")}
    ${row("護石", (c) => Object.entries(c.s.charm.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" ") + ` ${"◯".repeat(c.s.charm.slots)}`)}
    ${row("素材の種類", (c) => `${c.kinds}${c.short ? ` <span class="hi">（未入手${c.short}）</span>` : ""}`)}
    ${allSkills.map((n) => row(esc(n), (c) => (c.act.includes(n) ? "○" : `<span class="muted">-</span>`))).join("")}
    <tr><td></td>${cols.map((c) => `<td><button class="mini" data-sim="${c.i}">このセットでシミュ</button></td>`).join("")}</tr>
    </table></div>
    <p class="muted">「このセットでシミュ」は、そのセットを保存したときの発動させたいスキルと護石をシミュに入れます。</p>`;
  view.querySelectorAll("[data-sim]").forEach((b) => (b.onclick = () => {
    const s = state.sets[+b.dataset.sim], p = state.prefs;
    if (s.targets) p.targets = { ...s.targets };
    p.weaponSlots = s.weaponSlots ?? p.weaponSlots;
    const ci = state.charms.findIndex((c) => JSON.stringify(c.skills) === JSON.stringify(s.charm.skills) && c.slots === s.charm.slots);
    if (ci >= 0) { p.pinnedCharm = ci; p.useCharms = true; } else delete p.pinnedCharm;
    save(); go("sim");
  }));
}


function setPage(i) {
  const s = state.sets[i];
  if (!s) return go("sim/sets");
  setView(s, new Set(state.owned), `<div class="row" style="margin-top:12px"><button class="danger" id="del">このマイセットを削除</button></div>`, true);
  view.querySelector("#del").onclick = () => {
    const removed = state.sets.splice(i, 1)[0];
    save(); go("sim/sets");
    toast("マイセットを削除しました", { label: "元に戻す", run: () => { state.sets.splice(i, 0, removed); save(); render(); } });
  };
}

// One set with its material totals. `owned` = armor names already made (skipped in the totals);
// `mine` = owned marks can be edited (false for a friend's set).
function setView(s, owned, footer, mine, hv = have, who = "自分") {
  setTitle(s.name);
  const r = setToResult(s);
  const wLine = s.weapon ? `<div class="card">武器: ${esc(s.weapon)}${s.style ? ` / スタイル: ${esc(s.style)}` : ""}${s.charm?.name ? ` / ${esc(s.charm.name)}` : ""}${s.charm?.chk ? ` <span class="pill hi">${esc(s.charm.chk)}</span>` : ""}</div>` : "";
  if (!r) { view.innerHTML = `${wLine}<p class="muted">この組み合わせの防具がデータに見つかりません。</p>${footer}`; return; }
  // materials: armor + recipe A of each decoration (recipe B shown on the item page)
  const need = {};
  const add = (mats, k = 1) => { for (const [id, q] of mats || []) need[id] = (need[id] || 0) + q * k; };
  const todo = r.pieces.filter((a) => a.name !== "装備なし" && !owned.has(a.name));
  todo.forEach((a) => add(a.mats));
  for (const [, d] of r.decos) add(d.recipes[0]);
  const zeny = todo.reduce((t, a) => t + (a.zeny || 0), 0);
  const stock = mine ? state.items : {};
  const left = (id, q) => Math.max(0, q - (stock[id] || 0));
  const rows = Object.entries(need).sort((a, b) => hv.has(a[0]) - hv.has(b[0]) || !left(...b) - !left(...a));
  const missing = rows.filter(([id]) => !hv.has(id)).length;
  // where to farm what is still short: best cleared quest per material
  const pool = mine ? farmPool() : [];
  const tip = (id, q) => {
    if (!mine || !left(id, q)) return "";
    const [r] = recommendQuests(D, id, pool, 1, true);
    return (r ? `<a class="ruby" href="#find/quest/${r.q.id}">→ ${esc(r.q.name)}${capMark(r.q)}（${esc(r.how)}）</a>` : "") + farmExtras(id, r);
  };
  view.innerHTML = wLine + resultCard(r, totals(r), 1).replace("<b class=\"grow\">#1</b>", `<b class="grow">${esc(s.name)}</b>`) + `
    <h2>作成済み</h2><div class="chips">${r.pieces.map((a) => mine
      ? `<label class="chip"><input type="checkbox" data-own="${esc(a.name)}" ${owned.has(a.name) ? "checked" : ""}> ${PARTS[a.part]} ${esc(a.name)}</label>`
      : `<span class="chip ${owned.has(a.name) ? "on" : ""}">${PARTS[a.part]} ${esc(a.name)} ${owned.has(a.name) ? "✓" : "まだ"}</span>`).join("")}</div>
    <h2>必要な素材</h2>
    <p class="muted">まだ作っていない防具${todo.length}つと装飾品（素材Aの場合）の合計。${missing ? `<b class="hi">いまの進行（${esc(who)}）で手に入らない素材が${missing}種類あります。</b>` : `どれもいまの進行（${esc(who)}）で手に入ります。`} 防具の生産費 ${fmt(zeny)}z</p>
    ${mine ? `<p class="muted">「残り」は<a href="#edit">データ編集</a>で入れた所持数を引いた数です。→ は選んだ範囲（${esc(farmLabel())}）でいちばん集めやすいところ（めやす）。</p>${farmBar()}` : ""}
    <div class="table-wrap"><table><tr><th>素材</th><th>数</th>${mine ? "<th>残り</th>" : ""}<th>入手</th></tr>
    ${rows.map(([id, q]) => `<tr><td style="white-space:normal"><a href="#find/item/${id}">${nameWithRuby(itemName(id), D.readings)}</a>${tip(id, q)}</td><td>${q}</td>${mine ? `<td>${left(id, q) || "✓"}</td>` : ""}<td>${hv.has(id) ? "○" : `<span class="hi">まだ</span>`}</td></tr>`).join("")}</table></div>
    ${mine ? bundleHtml(rows.filter(([id, q]) => left(id, q)).map(([id]) => id)) : ""}
    ${footer}`;
  view.querySelectorAll("[data-own]").forEach((cb) => (cb.onchange = () => { toggleOwned(cb.dataset.own, cb.checked); render(); }));
}

// ---------------------------------------------------------------- 逆引き

routes.find = (kind, id, extra) => {
  if (kind === "item") return itemPage(id);
  if (kind === "quest") return questPage(id);
  if (kind === "armor") return armorPage(id);
  if (kind === "weapon") return weaponPage(id, extra);
  if (kind === "wtype") return browseWeapons(id);
  if (kind === "arts") return artsPage(id);
  if (kind === "clients") return clientsPage(id);
  if (kind === "coins") return coinsPage();
  if (kind === "shop") return shopPage(id);
  if (kind === "nyanter") return nyanterPage();
  if (kind === "rare") return browseArmor(+id);
  if (kind === "decos") return browseDecos();
  if (kind === "mix") return mixPage();
  if (kind === "ammo") return ammoPage(id);
  setTitle("逆引き");
  const types = [...new Set(D.weapons.map((w) => w.type))];
  const rares = [...new Set(D.armor.map((a) => a.rare))].sort((a, b) => a - b);
  const browse = `<p class="muted">入力しなくても、下の一覧からたどれます。</p>
    <h3>狩技・依頼主</h3><div class="chips"><a class="chip" href="#find/arts">狩技の取得条件 ›</a><a class="chip" href="#find/clients">〇〇からの依頼（依頼主から探す）›</a><a class="chip" href="#find/coins">闘技大会・訓練のコイン ›</a><a class="chip" href="#find/shop">雑貨屋・交易窓口 ›</a><a class="chip" href="#find/nyanter">ニャンターのサポート行動 ›</a></div>
    <h3>武器（種類から）</h3><div class="chips">${types.map((t) => `<a class="chip" href="#find/wtype/${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>
    <h3>防具（レア度から）</h3><div class="chips">${rares.map((r) => `<a class="chip" href="#find/rare/${r}">${rareTag(r)}</a>`).join("")}</div>
    <h3>そのほか</h3><div class="chips"><a class="chip" href="#find/ammo">ボウガンの弾から探す</a><a class="chip" href="#find/decos">装飾品（スキル順）</a><a class="chip" href="#find/mix">調合リスト</a><a class="chip" href="#mons">モンスター</a>
      <a class="chip" href="#maps">マップ（採取素材）</a><a class="chip" href="#progress">クエスト（進行チェックから）</a></div>`;
  view.innerHTML = `
    <input type="search" id="q" placeholder="素材・スキル・防具・武器・モンスター・クエスト名（ひらがな可）">

    <div id="out">${browse}</div>`;
  const out = view.querySelector("#out");
  view.querySelector("#q").oninput = (e) => {
    const q = e.target.value;
    if (!norm(q)) { out.innerHTML = browse; return; }
    const sec = (title, rows) => rows.length ? `<h3>${title}</h3><ul class="list">${rows.slice(0, 40).join("")}</ul>` : "";
    out.innerHTML =
      sec("素材・アイテム", Object.entries(D.items).filter(([, n]) => match(q, n, D.readings)).map(([i, n]) => `<li><a href="#find/item/${i}"><span class="grow">${nameWithRuby(n, D.readings)}</span>${have.has(i) ? "" : `<span class="pill">未入手</span>`}›</a></li>`)) +
      sec("スキル", D.skills.filter((t) => t.effects.length && (match(q, t.name, D.readings) || t.effects.some((e) => match(q, e.name, D.readings)))).map((t) => `<li><a href="#sim/list/${encodeURIComponent(t.name)}"><span class="grow">${nameWithRuby(t.name, D.readings)} <span class="muted">${t.effects.filter((e) => e.pts > 0).map((e) => esc(e.name)).join("・")}</span></span>›</a></li>`)) +
      sec("ボウガンの弾", [...(D.ammo ||= ammoIndex(D.weapons)).keys()].filter((a) => match(q, a, D.readings)).map((a) => `<li><a href="#find/ammo/${encodeURIComponent(a)}"><span class="grow">${esc(a)} <span class="muted">${D.ammo.get(a).size}丁</span></span>›</a></li>`)) +
      sec("モンスター", D.monsters.filter((m) => match(q, m.name, D.readings)).map((m) => `<li><a href="#mons/${m.id}"><span class="grow">${nameWithRuby(m.name, D.readings)}</span>›</a></li>`)) +
      sec("防具", D.armor.filter((a) => match(q, a.name, D.readings)).map((a) => `<li><a href="#find/armor/${encodeURIComponent(a.name)}"><span class="grow">${nameWithRuby(a.name, D.readings)} <span class="muted">${PARTS[a.part]}</span> ${rareTag(a.rare)}</span>${canMake(a.mats, have) ? `<span class="pill">作れる</span>` : ""}›</a></li>`)) +
      sec("武器", D.weapons.filter((w) => match(q, w.name, D.readings)).map((w) => `<li><a href="#find/weapon/${w.id}/${encodeURIComponent(w.name)}"><span class="grow">${nameWithRuby(w.name, D.readings)} <span class="muted">${esc(w.type)}</span></span>›</a></li>`)) +
      sec("装飾品", D.decos.filter((d) => match(q, d.name, D.readings)).map((d) => `<li><a href="#find/item/${d.id}"><span class="grow">${esc(d.name)}</span>›</a></li>`)) +
      sec("クエスト", D.quests.filter((x) => match(q, x.name, D.readings)).map((x) => `<li><a href="#find/quest/${x.id}"><span class="grow">${nameWithRuby(x.name, D.readings)}${capMark(x)} <span class="muted">${esc(t(x.vendor))} ${esc(t(x.tab))}${D.dupNote[x.id] ? ` ${esc(D.dupNote[x.id])}` : ""}</span>${clientTag(x)}</span>›</a></li>`)) ||
      `<p class="muted">見つかりませんでした。</p>`;
  };
};

function browseWeapons(type) {
  setTitle(type);
  const reach = reachableLevels(D.weapons, have);
  const asTree = state.prefs.wview === "tree";
  const toggle = `<div class="chips">${[["list", "一覧"], ["tree", "派生ツリー全体"]].map(([v, l]) => `<button class="chip ${(asTree ? "tree" : "list") === v ? "on" : ""}" data-wview="${v}">${l}</button>`).join("")}</div>`;
  let body;
  if (asTree) {
    // every series of this weapon type, from its first weapon down through all branches
    D.wtree ||= weaponTree(D.weapons);
    const T = D.wtree;
    const roots = [...T.blocks.values()].filter((b) => b.type === type && !(b.from && T.blocks.has(b.from)));
    const alone = roots.filter((b) => !b.kids.length);
    body = roots.filter((b) => b.kids.length).map((b) => {
      const count = { n: 0 };
      const html = treeNode(T, reach, b, null, null, count);
      return `<details class="card" open><summary>${esc(b.entries[0].name)}から（${count.n}本）</summary><ul class="wtree">${html}</ul></details>`;
    }).join("") + (alone.length ? `<details class="card"><summary>派生のない武器（${alone.length}本）</summary><div class="chips">${alone.map((b) => `<a class="chip" href="#find/weapon/${b.id}/${encodeURIComponent(b.entries[0].name)}">${esc(b.entries.map((e) => e.name).join(" → "))}${(reach[b.id] || 0) > 0 ? " ✓" : ""}</a>`).join("")}</div></details>` : "") +
      `<p class="muted">色の付いた枝は、いまの進行で作れる（強化できる）ものです（派生のない武器は ✓）。名前を押すとその武器へ移ります。</p>`;
  } else body = `<ul class="list">${D.weapons.filter((w) => w.type === type).map((w) => {
    const top = w.levels[w.levels.length - 1];
    return `<li><a href="#find/weapon/${w.id}/${encodeURIComponent(w.name)}"><span class="grow">${nameWithRuby(w.name, D.readings)}
      ${rareTag(top.rare)} <span class="muted">${top.elem ? ` ${esc(top.elem[0])}${top.elem[1]}` : ""}</span></span>${(reach[w.id] || 0) > 0 ? `<span class="pill">作れる</span>` : ""}›</a></li>`;
  }).join("")}</ul>`;
  view.innerHTML = toggle + body;
  view.querySelectorAll("[data-wview]").forEach((b) => (b.onclick = () => { state.prefs.wview = b.dataset.wview; save(); browseWeapons(type); }));
}

function browseArmor(rare) {
  setTitle(`防具 レア${rare}`);
  const series = new Map();
  for (const a of D.armor) if (a.rare === rare) (series.get(a.series) || series.set(a.series, []).get(a.series)).push(a);
  const label = (ps) => { // common prefix of the piece names, e.g. "イーオスＸ"
    let p = ps[0].name;
    for (const a of ps) while (!a.name.startsWith(p)) p = p.slice(0, -1);
    return p.length >= 2 ? p : ps[0].name;
  };
  view.innerHTML = [...series.values()].map((ps) => `<div class="card"><b>${esc(label(ps))}</b>
    <ul class="list">${ps.sort((a, b) => a.part - b.part || a.type - b.type).map((a) => `<li><a href="#find/armor/${encodeURIComponent(a.name)}">
      <span class="muted" style="width:1.5em">${PARTS[a.part]}</span><span class="grow">${nameWithRuby(a.name, D.readings)} <span class="muted">${a.type === 1 ? "剣士" : a.type === 2 ? "ガンナー" : ""}</span></span>
      ${canMake(a.mats, have) ? `<span class="pill">作れる</span>` : ""}›</a></li>`).join("")}</ul></div>`).join("");
}

function browseDecos() {
  setTitle("装飾品");
  const first = (d) => Object.keys(d.skills)[0] || "";
  const decos = [...D.decos].sort((a, b) => first(a).localeCompare(first(b), "ja") || a.slots - b.slots);
  view.innerHTML = `<ul class="list">${decos.map((d) => `<li><a href="#find/item/${d.id}"><span class="grow">${esc(d.name)} <span class="muted">${"◯".repeat(d.slots)}</span>
    <span class="ruby">${Object.entries(d.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ")}</span></span>
    ${canMakeDeco(d, have) ? `<span class="pill">作れる</span>` : ""}›</a></li>`).join("")}</ul>`;
}

function itemPage(id) {
  const name = itemName(id);
  setTitle(name);
  const src = D.sources[id] || [];
  const mons = src.filter((s) => s.type === "mon").sort((a, b) => b.pct - a.pct);
  const maps = src.filter((s) => s.type === "map").sort((a, b) => b.pct - a.pct);
  const qs = src.filter((s) => s.type === "quest");
  const used = D.usedIn[id] || [];
  const deco = D.decos.find((d) => d.id === id);
  view.innerHTML = `
    ${have.has(id) ? `<p class="pill">いまの進行で入手できます</p>` : `<p class="pill">いまの進行ではまだ入手できません</p>`}
    ${buyInfo(id).length ? `<div class="card"><b>お店・交易</b>${buyInfo(id).map((x) => `<div>${esc(x)}</div>`).join("")}<a class="muted" href="#find/shop">雑貨屋・交易窓口 ›</a></div>` : ""}
    ${deco ? `<div class="card"><b>${esc(deco.name)}</b> スロット${"◯".repeat(deco.slots)}<br>${Object.entries(deco.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ")}
      ${deco.recipes.map((r, k) => `<div class="muted">素材${"AB"[k]}: ${r.map(([i, q]) => `<a href="#find/item/${i}">${esc(itemName(i))}</a>×${q}`).join("、")}</div>`).join("")}
      ${treeEffects(Object.keys(deco.skills))}</div>` : ""}
    ${(() => {
      const rec = recommendQuests(D, id, farmPool(), 3);
      return `<h2>おすすめクエスト（${esc(farmLabel())}）</h2>${farmBar()}${rec.length ? `<ul class="list">${rec.map((r) => `<li><a href="#find/quest/${r.q.id}"><span class="grow">${nameWithRuby(r.q.name, D.readings)}${capMark(r.q)}
        <span class="ruby">${esc(r.how)} / 1回で約${r.n.toFixed(1)}個</span></span>›</a></li>`).join("")}</ul>` : `<p class="muted">この範囲のクエストでは集められません。</p>`}
        <div class="farmx">${farmExtras(id, rec[0])}</div>
        <p class="muted">剥ぎ取り3回・捕獲報酬2回・部位破壊などは1回として数えためやすです。</p>`;
    })()}
    ${mons.length ? `<h2>モンスターから</h2>
<div class="table-wrap"><table><tr><th>モンスター</th><th>ランク</th><th>方法</th><th>確率</th></tr>
      ${mons.map((s) => `<tr><td><a href="#mons/${s.mon}">${esc(D.monById[s.mon]?.name)}</a></td><td>${s.rank}</td><td>${esc(s.method)}</td><td>${s.pct}%${s.qty > 1 ? ` ×${s.qty}` : ""}</td></tr>`).join("")}</table></div>` : ""}
    ${maps.length ? `<h2>採取</h2><div class="table-wrap"><table><tr><th>マップ</th><th>エリア</th><th>ランク</th><th>確率</th></tr>
      ${maps.map((s) => `<tr><td><a href="#maps/${encodeURIComponent(s.map)}/${s.area}">${esc(s.map)}</a></td><td>${s.area === 0 ? "ベースキャンプ" : s.area}</td><td>${s.rank}</td><td>${s.pct}%</td></tr>`).join("")}</table></div>` : ""}
    ${qs.length ? `<h2>クエスト報酬</h2><ul class="list">${qs.slice(0, 60).map((s) => { const q = D.questById[s.quest]; return `<li><a href="#find/quest/${q.id}"><span class="grow">${nameWithRuby(q.name, D.readings)}${capMark(q)} <span class="muted">${esc(t(q.vendor))} ${esc(t(q.tab))}</span>${clientTag(q)}</span>›</a></li>`; }).join("")}</ul>` : ""}
    ${mixTable(D.mix.filter((r) => r[0] === id), "調合で作る")}
    ${mixTable(D.mix.filter((r) => r[0] !== id && (r[1] === id || r[2] === id)), "調合の材料になる")}
    ${used.length ? `<h2>使い道</h2><ul class="list">${used.slice(0, 80).map((u) => `<li><a href="${u.type === "armor" ? `#find/armor/${encodeURIComponent(u.name)}` : u.link || `#find/item/${D.decos.find((d) => d.name === u.name)?.id || ""}`}"><span class="grow">${esc(u.name)} <span class="muted">${u.type === "armor" ? "防具" : u.type === "deco" ? "装飾品" : "武器"} ×${u.qty}</span></span>›</a></li>`).join("")}</ul>` : ""}
    ${!src.length && !used.length ? `<p class="muted">入手方法のデータがありません（ショップや交易などの可能性があります）。</p>` : ""}`;
}

// ---------------------------------------------------------------- 調合
// 調合成功率 skill adds to the base rate; 完全調合 (hunter art) makes every mix succeed.
const MIX_BONUS = [[0, "スキルなし"], [20, "調合成功率+20%"], [45, "調合成功率+45%"], [100, "完全調合（狩技）"], [-10, "調合成功率-10%"], [-20, "調合成功率-20%"]];
const mixRate = (base) => Math.max(0, Math.min(100, base + (state.prefs.mixBonus || 0)));
function mixBonusSelect() {
  return `<label>自分の調合スキル <select id="mixb">${MIX_BONUS.map(([v, l]) => `<option value="${v}" ${v === (state.prefs.mixBonus || 0) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
}
function bindMixBonus(redraw) {
  const s = view.querySelector("#mixb");
  if (s) s.onchange = () => { state.prefs.mixBonus = +s.value; save(); redraw(); };
}
function mixTable(rows, title) {
  if (!rows.length) return "";
  const link = (i) => (i ? `<a href="#find/item/${i}">${esc(itemName(i))}</a>` : "");
  return `${title ? `<h2>${title}</h2>` : ""}<div class="table-wrap"><table><tr><th>できるもの</th><th>素材</th><th>成功率</th><th>数</th></tr>
    ${rows.map(([r, a, b, pct, qty]) => { const p = mixRate(pct); return `<tr><td>${link(r)}</td><td style="text-align:left;white-space:normal">${link(a)}${b ? ` ＋ ${link(b)}` : ""}</td>
      <td class="${p < 100 ? "hi" : ""}">${p}%${p !== pct ? ` <span class="muted">(${pct})</span>` : ""}</td><td>${esc(qty)}</td></tr>`; }).join("")}</table></div>
    ${title ? `<p class="muted">成功率は「調合リスト」で選んだ調合スキル込み（${esc(MIX_BONUS.find(([v]) => v === (state.prefs.mixBonus || 0))?.[1])}）。かっこ内は元の確率。</p>` : ""}`;
}
function mixPage() {
  setTitle("調合リスト");
  const draw = (q = view.querySelector("#q")?.value || "") => {
    const rows = D.mix.filter((r) => !norm(q) || r.slice(0, 3).some((i) => i && match(q, itemName(i), D.readings)));
    const fails = D.mix.filter((r) => mixRate(r[3]) < 100).length;
    view.querySelector("#out").innerHTML = `<p>このスキルだと <b>${D.mix.length - fails}/${D.mix.length}</b> 種類が必ず成功します（失敗するかもしれないもの ${fails}種類）。</p>${mixTable(rows)}`;
  };
  view.innerHTML = `<div class="card">${mixBonusSelect()}</div><input type="search" id="q" placeholder="アイテム名（ひらがな可）"><div id="out"></div>`;
  bindMixBonus(() => draw());
  view.querySelector("#q").oninput = () => draw();
  draw();
}

function armorPage(name) {
  const a = D.armor.find((x) => x.name === name);
  if (!a) return go("find");
  setTitle(a.name);
  const ok = canMake(a.mats, have);
  view.innerHTML = `<div class="card">
    <div class="row"><b class="grow">${nameWithRuby(a.name, D.readings)}</b><span class="pill">${PARTS[a.part]}</span>${rareTag(a.rare)}</div>
    <div class="muted">${a.type === 3 ? "剣士・ガンナー" : a.type === 1 ? "剣士" : "ガンナー"} / 防御 ${a.def[0]}〜${a.def[1]} / スロット ${"◯".repeat(a.slots)}${"―".repeat(3 - a.slots)}</div>
    <div class="muted">耐性 ${ELEMENTS.map((e, i) => `<span class="el-${e}">${e}${a.res[i]}</span>`).join(" ")}</div>
    <div class="chips" style="margin-top:6px">${Object.entries(a.skills).map(([t, v]) => `<span class="chip">${esc(t)}${v > 0 ? "+" : ""}${v}</span>`).join("")}</div>
    ${treeEffects(Object.keys(a.skills))}

    <label class="check"><input type="checkbox" id="own" ${state.owned.includes(a.name) ? "checked" : ""}>作成済み（持っている）</label>
    <h3>生産素材 ${ok ? `<span class="pill">作れる</span>` : ""}</h3>
    <ul class="list">${(a.mats || []).map(([i, q]) => `<li><a href="#find/item/${i}"><span class="grow">${esc(itemName(i))} ×${q}</span>${have.has(i) ? "" : `<span class="pill">未入手</span>`}›</a></li>`).join("") || `<li class="muted">素材データなし</li>`}</ul>
    ${a.zeny ? `<div class="muted">${fmt(a.zeny)}z</div>` : ""}</div>`;
  view.querySelector("#own").onchange = (e) => { toggleOwned(a.name, e.target.checked); };
}
function toggleOwned(name, on) {
  const s = new Set(state.owned);
  on ? s.add(name) : s.delete(name);
  state.owned = [...s]; save();
}

// ボウガンの弾から探す: every bowgun that can fire one ammo (normal load, rapid/crouch fire, built-in).
const AMMO_ORDER = ["通常弾", "貫通弾", "散弾", "徹甲榴弾", "拡散弾", "回復弾", "毒弾", "麻痺弾", "睡眠弾", "減気弾", "火炎弾", "水冷弾", "電撃弾", "氷結弾", "滅龍弾"];
function ammoPage(label) {
  D.ammo ||= ammoIndex(D.weapons);
  const labels = [...D.ammo.keys()];
  if (!label || !D.ammo.has(label)) {
    setTitle("ボウガンの弾から探す");
    const base = (l) => l.replace(/ LV\d$/, "");
    const std = AMMO_ORDER.map((n) => [n, labels.filter((l) => base(l) === n).sort()]).filter(([, ls]) => ls.length);
    const other = labels.filter((l) => !AMMO_ORDER.includes(base(l))).sort((a, b) => a.localeCompare(b, "ja"));
    const chip = (l) => `<a class="chip" href="#find/ammo/${encodeURIComponent(l)}">${esc(l)} <span class="muted">${D.ammo.get(l).size}</span></a>`;
    view.innerHTML = `<p class="muted">弾を選ぶと、撃てるボウガンを出します（数字は撃てるボウガンの数）。速射・しゃがみ撃ち・内蔵弾も含みます。</p>
      ${std.map(([n, ls]) => `<h3>${esc(n)}</h3><div class="chips">${ls.map(chip).join("")}</div>`).join("")}
      <h3>内蔵弾・速射などだけで撃てる弾</h3><div class="chips">${other.map(chip).join("")}</div>`;
    return;
  }
  setTitle(label);
  const reach = reachableLevels(D.weapons, have);
  const rows = [...D.ammo.get(label).values()].map((e) => {
    const minLv = Math.min(...e.levels.map((l) => l.lv));
    const top = e.levels.reduce((a, b) => (b.lv > a.lv ? b : a));
    const ways = [...new Set(e.levels.map((l) => l.how))].map((how) => {
      const ls = e.levels.filter((l) => l.how === how), last = ls[ls.length - 1];
      return `${how} ${esc(last.value)}${ls[0].lv !== e.w.levels[0].lv ? ` <span class="muted">(LV${ls[0].lv}〜)</span>` : ""}`;

    });
    return { e, can: (reach[e.w.id] || 0) >= minLv, top, ways, cap: Math.max(...e.levels.map((l) => parseInt(l.value, 10) || 0)) };
  }).sort((a, b) => b.can - a.can || a.e.w.type.localeCompare(b.e.w.type, "ja") || b.cap - a.cap);
  view.innerHTML = `<p class="muted">${rows.length}丁。いまの進行で作れるものを上に出しています。「装填 4」は装填数、「速射 2/100力 大」は1回の発射数/威力と反動、「内蔵 4/20」は1回の装填数/全部の数です。</p>
    <ul class="list">${rows.map((r) => `<li><a href="#find/weapon/${r.e.w.id}/${encodeURIComponent(r.e.w.name)}"><span class="grow">${esc(r.e.w.name)} <span class="muted">${r.e.w.type === "ライトボウガン" ? "ライト" : "ヘビィ"}</span>
      <span class="ruby">${r.ways.join("・")} / リロード ${esc(r.top.reload || "-")}・反動 ${esc(r.top.recoil || "-")}</span></span>${r.can ? `<span class="pill">作れる</span>` : ""}›</a></li>`).join("")}</ul>`;
}

// Bowgun ammo table for the weapon page: rows = ammo, columns = weapon levels.
function bowgunHtml(w) {
  if (!w.levels.some((l) => l.ammo)) return "";
  const names = [];
  for (const l of w.levels) for (const [n, caps] of Object.entries(l.ammo || {})) caps.forEach((c, i) => { const k = `${n} LV${i + 1}`; if (c && !names.includes(k)) names.push(k); });
  names.sort((a, b) => AMMO_ORDER.indexOf(a.replace(/ LV\d$/, "")) - AMMO_ORDER.indexOf(b.replace(/ LV\d$/, "")) || a.localeCompare(b));
  const cap = (l, k) => { const [n, lv] = k.split(" LV"); return l.ammo?.[n]?.[lv - 1] || ""; };
  const sp = w.type === "ライトボウガン" ? "速射" : "しゃがみ撃ち";
  return `<h2>弾</h2><div class="table-wrap"><table><tr><th>弾</th>${w.levels.map((l) => `<th>LV${l.lv}</th>`).join("")}</tr>
    <tr><td>リロード</td>${w.levels.map((l) => `<td>${esc(l.reload || "-")}</td>`).join("")}</tr>
    <tr><td>反動</td>${w.levels.map((l) => `<td>${esc(l.recoil || "-")}</td>`).join("")}</tr>
    <tr><td>ブレ</td>${w.levels.map((l) => `<td>${esc(l.dev || "-")}</td>`).join("")}</tr>
    ${names.map((k) => `<tr><td><a href="#find/ammo/${encodeURIComponent(k)}">${esc(k)}</a></td>${w.levels.map((l) => `<td>${cap(l, k)}</td>`).join("")}</tr>`).join("")}
    <tr><td>${sp}</td>${w.levels.map((l) => `<td style="white-space:normal">${(l.special || []).map(([n, v, r]) => `${esc(n)} ${esc(v)}${r ? ` ${esc(r)}` : ""}`).join("<br>")}</td>`).join("")}</tr>
    <tr><td>内蔵弾</td>${w.levels.map((l) => `<td style="white-space:normal">${(l.builtin || []).map(([n, v]) => `${esc(n)} ${esc(v)}`).join("<br>")}</td>`).join("")}</tr>
    </table></div><p class="muted">数字は装填数。弾の名前を押すと、その弾を撃てるほかのボウガンを出します。<a href="#spec/bowgun">リロードと反動のしくみ ›</a></p>`;
}

// 強化の道のり: every make/upgrade step to this weapon's last level, the material total (minus item
// counts from データ編集), and for each short material the 2 quickest cleared quests to farm it.
function upgradeHtml(w) {
  D.wtree ||= weaponTree(D.weapons);
  const ownedLv = {};
  for (const [k, lv] of Object.entries(state.ownedW)) { const b = k.split("/")[0]; ownedLv[b] = Math.max(ownedLv[b] || 0, lv); }
  const steps = upgradePath(D.wtree, w, ownedLv);
  if (!steps.length) return `<h2>強化の道のり</h2><p class="muted">もう最後のレベルまで持っています。</p>`;
  const need = {};
  for (const s of steps) for (const [id, q] of s.mats) need[id] = (need[id] || 0) + q;
  const short = Object.entries(need).map(([id, q]) => [id, q, Math.max(0, q - (state.items[id] || 0))]).filter(([, , left]) => left > 0);
  const pool = farmPool();
  const tips = short.map(([id, , left]) => {
    const rec = recommendQuests(D, id, pool, 2, true);
    return `<tr><td style="white-space:normal"><a href="#find/item/${id}">${esc(itemName(id))}</a> <span class="muted">あと${left}</span>${have.has(id) ? "" : ` <span class="pill hi">未入手</span>`}</td>
      <td style="text-align:left;white-space:normal">${rec.map((r) => `<a href="#find/quest/${r.q.id}">${esc(r.q.name)}</a>${capMark(r.q)} <span class="muted">${esc(r.how)}・1回で約${r.n.toFixed(1)}個</span>`).join("<br>") || `<span class="muted">この範囲のクエストでは集められません</span>`}${farmExtras(id, rec[0])}</td></tr>`;
  }).join("");
  const start = steps[0];
  return `<details class="card" open><summary>強化の道のり（${steps.length}段階）</summary>
    <p class="muted">${Object.keys(ownedLv).length && start.kind !== "生産" ? "持っている武器（データ編集・武器ページで登録）の次から。" : "系統のはじめから。"}</p>
    <ol class="steps">${steps.map((s) => `<li><b>${esc(s.name)} LV${s.lv}</b> <span class="pill">${s.kind}</span>
      <div class="muted">${s.mats.map(([id, q]) => `${esc(itemName(id))}×${q}`).join("、") || "素材データなし"}${canMake(s.mats, have) ? " ✓" : ""}</div></li>`).join("")}</ol>
    ${short.length ? `<h3>足りない素材と集めやすいクエスト</h3>${farmBar()}<div class="table-wrap"><table><tr><th>素材</th><th>おすすめ（${esc(farmLabel())}から2件）</th></tr>${tips}</table></div>${bundleHtml(short.map(([id]) => id))}
      <p class="muted">「あと」は<a href="#edit">データ編集</a>の所持数を引いた数。おすすめは、1回で手に入る数の見込みを大型モンスターの体力の合計で割った「早く多く集まる順」です（体力が少ないほど早く終わるとみなしためやす）。</p>` : `<p>必要な素材はそろっています。</p>`}</details>`;
}

// Upgrade tree from the root of this weapon's line. Branches craftable with the current
// progress are highlighted; the current weapon is marked.
// One branch of the weapon tree as nested <li> (hereId = the weapon being viewed, if any).
function treeNode(T, reach, b, parent, hereId, count) {
  count.n++;
  const names = b.entries.map((e) => e.name).join(" → ");
  const top = b.entries[0];
  const can = (reach[b.id] || 0) > 0;
  const from = parent ? `<span class="muted">${esc(T.nameAt(parent, b.fromLv))} LV${b.fromLv ?? "?"} から</span>` : "";
  return `<li class="${can ? "can" : ""}${b.id === hereId ? " here" : ""}">
    <a href="#find/weapon/${b.id}/${encodeURIComponent(top.name)}">${esc(names)}</a> ${rareTag(b.entries[b.entries.length - 1].levels.at(-1).rare)}${b.id === hereId ? ` <span class="pill">いまの武器</span>` : ""}${can ? ` <span class="pill">作れる</span>` : ""}
    ${from ? `<br>${from}` : ""}
    ${b.kids.length ? `<ul>${b.kids.map((k) => treeNode(T, reach, k, b, hereId, count)).join("")}</ul>` : ""}</li>`;
}
function weaponTreeHtml(w) {
  D.wtree ||= weaponTree(D.weapons);
  const T = D.wtree, root = T.root(w.id);
  if (!root || (!root.kids.length && root.id === w.id)) return "";
  const count = { n: 0 };
  const html = `<ul class="wtree">${treeNode(T, reachableLevels(D.weapons, have), root, null, w.id, count)}</ul>`;
  return `<details class="card" open><summary>派生ツリー（${count.n}本）</summary>${html}
    <p class="muted">色の付いた枝は、いまの進行で作れる（強化できる）ものです。名前を押すとその武器へ移ります。<a href="#find/wtype/${encodeURIComponent(w.type)}">${esc(w.type)}の派生ツリー全体 ›</a></p></details>`;
}

function weaponPage(block, name) {

  const w = D.weapons.find((x) => x.id === block && x.name === name);
  if (!w) return go("find");
  setTitle(w.name);
  const wkey = `${w.id}/${w.name}`;
  view.innerHTML = `<div class="card"><div class="row"><b class="grow">${nameWithRuby(w.name, D.readings)}</b><span class="pill">${esc(w.type)}</span></div>
    ${D.arts ? `<a class="muted" href="#find/arts/${encodeURIComponent(w.type)}">${esc(w.type)}の狩技と取得条件 ›</a>` : ""}
    <label>持っている <select id="own"><option value="0">持っていない</option>${w.levels.map((l) => `<option value="${l.lv}" ${state.ownedW[wkey] === l.lv ? "selected" : ""}>LV${l.lv}</option>`).join("")}</select></label></div>
    <div class="table-wrap"><table><tr><th>LV</th><th>攻撃</th><th>属性</th><th>会心</th><th>スロット</th><th>レア</th></tr>
    ${w.levels.map((l) => `<tr><td>${l.lv}</td><td>${l.atk}</td><td>${l.elem ? `<span class="el-${l.elem[0]}">${l.elem[0]}${l.elem[1]}</span>` : "-"}</td><td>${l.aff ? `${l.aff > 0 ? "+" : ""}${l.aff}%` : "-"}</td><td>${"◯".repeat(l.slots) || "-"}</td><td>${rareTag(l.rare)}</td></tr>`).join("")}</table></div>
    ${bowgunHtml(w)}
    ${upgradeHtml(w)}
    ${weaponTreeHtml(w)}

    <h2>素材</h2>${w.levels.some((l) => l.make || l.up) ? w.levels.map((l) => {
      const row = (label, mats) => mats ? `<div class="muted">${label}${canMake(mats, have) ? " ✓" : ""}</div><div class="chips">${mats.map(([i, q]) => `<a class="chip" href="#find/item/${i}">${esc(itemName(i))}×${q}${have.has(i) ? "" : " ⚠"}</a>`).join("")}</div>` : "";
      return l.make || l.up ? `<h3>LV${l.lv}</h3>${row("生産", l.make)}${row("強化", l.up)}` : "";
    }).join("") : `<p class="muted">素材データなし</p>`}
    <p class="muted">⚠ = いまの進行ではまだ入手できない素材</p>`;
  view.querySelector("#own").onchange = (e) => { const lv = +e.target.value; if (lv) state.ownedW[wkey] = lv; else delete state.ownedW[wkey]; save(); };
}

const dropChips = (list) => `<div class="chips">${list.map(([i, q, pct]) => `<a class="chip" href="#find/item/${i}">${esc(itemName(i))}${q > 1 ? `×${q}` : ""} ${pct}%</a>`).join("")}</div>`;

// Kill = carve the body; capture = capture reward instead. Uses the target's tables for the quest's rank.
function killOrCapture(q) {
  const rank = rankOf(q);
  if (!rank) return "";
  const rows = [...new Set(q.mons)].map((id) => D.monById[id]).filter((m) => m?.drops[rank]?.["捕獲"]).map((m) => {
    const d = m.drops[rank];
    return `<details><summary>${esc(m.name)}（${rank}）</summary>
      <h3>倒したとき（剥ぎ取り）</h3>${dropChips(d["剥ぎ取り"] || [])}
      <h3>捕獲したとき（捕獲報酬・剥ぎ取りはできません）</h3>${dropChips(d["捕獲"])}</details>`;
  });
  return rows.length ? `<h2>倒す？ 捕獲する？</h2><p class="muted">欲しい素材の確率が高いほうを選べます。部位破壊の報酬はどちらでももらえます。</p>${rows.join("")}` : "";
}

// Bring-item icons for a quest or monster. Trap / flash marks come from data/monnotes.json
// (only well-known facts); no entry = ? (not checked yet).
// fixedGear: 闘技大会・訓練 use the weapon's fixed supply set, so only the effect marks are shown.
function prepIcons(monIds, map, fixedGear = false) {
  const N = D.notes;
  if (!N) return "";
  const mons = [...new Set(monIds)].map((id) => D.monById[id]).filter((m) => m && isLarge(m));
  const notes = mons.map((m) => [m.name, N.mons[m.name] || {}]);
  // per monster: ※ in the data = works only under some condition (shown as △); then false / true
  const state1 = (n, k) => (n.marks?.[k] === "※" ? "cond" : n[k]);
  const verdict = (k) => {
    if (!notes.length) return null;
    const no = notes.filter(([, n]) => state1(n, k) === false).map(([name]) => name);
    if (no.length) return { ok: false, who: no };
    const cond = notes.filter(([, n]) => state1(n, k) === "cond").map(([name]) => name);
    if (cond.length) return { ok: "cond", who: cond };
    return notes.every(([, n]) => n[k] === true) ? { ok: true, sec: notes.map(([, n]) => n.sec?.[k]).filter(Boolean) } : null;
  };
  const icons = [];
  const icon = (sym, label, v, extra = "") => {
    const m = v === null ? "" : v.ok === "cond" ? `<b class="mk cond" aria-hidden="true">△</b>` : v.ok ? `<b class="mk ok" aria-hidden="true">○</b>` : `<b class="mk ng" aria-hidden="true">×</b>`;
    const say = v === null ? "（未確認）" : v.ok === "cond" ? `：条件によって効く（${v.who.join("・")}）` : v.ok ? "：効く" : `：効かない（${v.who.join("・")}）`;
    // sec per monster: [normal, enraged, exhausted]; with several targets show the shortest
    const sec = v?.ok === true && v.sec?.length ? `<small>${Math.min(...v.sec.map((s) => s[0]))}秒${v.sec.every((s) => s[2]) ? `<br>疲れ${Math.min(...v.sec.map((s) => s[2]))}秒` : ""}</small>` : "";
    icons.push(`<span class="prep" role="img" aria-label="${esc(label + say)}" title="${esc(label + say)}"><span class="sym">${sym}${m}${v === null ? `<i class="q" aria-hidden="true">?</i>` : ""}</span><span class="lb">${esc(label)}</span>${sec}${extra}</span>`);
  };
  const plain = (sym, label, note) => icons.push(`<span class="prep" role="img" aria-label="${esc(label + (note ? `（${note}）` : ""))}"><span class="sym">${sym}</span><span class="lb">${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ""}</span>`);
  if (mons.length) {
    icon("🕳️", "落とし穴", verdict("pit"));
    icon("⚡", "シビレ罠", verdict("shock"));
    icon("✴️", "閃光玉", verdict("flash"));
    if (notes.some(([, n]) => n.sonic)) plain("🔔", "音爆弾", notes.filter(([, n]) => n.sonic).map(([x]) => x).join("・"));
    if (!fixedGear && notes.some(([, n]) => n.frog)) plain("🐸", "釣りカエル", `${notes.filter(([, n]) => n.frog).map(([x]) => x).join("・")}を釣り上げる`);
  }
  const st = new Set(fixedGear ? [] : notes.flatMap(([, n]) => n.status || []));
  if (fixedGear) map = null;
  // status (monnotes, hand-written) -> the item that cures it
  const has = (list) => list.filter((s) => st.has(s));
  if (st.has("毒")) plain("🧪", "解毒薬", "毒");
  const elem = has(["火属性やられ", "水属性やられ", "雷属性やられ", "氷属性やられ", "龍属性やられ", "全耐性DOWN", "狂竜ウイルス"]);
  if (elem.length) plain("🍒", "ウチケシの実", elem.map((s) => s.replace("属性やられ", "やられ")).join("・"));
  const blight = has(["雪だるま", "泡", "泥まみれ", "骨まみれ"]);
  if (blight.length) plain("🫧", "消散剤", blight.join("・"));
  const smell = has(["爆破", "悪臭"]);
  if (smell.length) plain("🧴", "消臭玉", smell.map((s) => (s === "爆破" ? "爆破やられ（回避3回でも消える）" : s)).join("・"));
  if (st.has("睡眠")) plain("🥤", "元気ドリンコ", "眠る前に飲む");
  if (st.has("防御力DOWN")) plain("🛡️", "硬化薬・忍耐の種", "防御力DOWN");
  if (N.hot.includes(map)) plain("🧊", "クーラー", "暑い");
  if (N.cold.includes(map)) plain("🔥", "ホット", "寒い");
  if (N.hotcold.includes(map)) { plain("🧊", "クーラー", "昼"); plain("🔥", "ホット", "夜"); }
  if (!icons.length) return "";
  return `<h2>${fixedGear ? "アイテムの効き目" : "持っていくと便利"}</h2>
    ${fixedGear ? `<p class="muted">このクエストは武器ごとに決まった装備・支給品で戦うので、アイテムは持ち込めません。支給品に罠や閃光玉があるときの効き目の目安です。</p>` : ""}
    <div class="preps">${icons.join("")}</div>
    <p class="muted">○ 効く　△ 条件によって効く　× 効かない　? まだ確かめていない。秒数は通常時と疲れているときのめやすです。何度もかけると短くなることがあります。モンスターが何体かいるときは短いほうを出しています。</p>`;

}

// Quest map: where each large monster starts (this quest's data), which areas it moves through
// and where it rests (sleeps), from data/monnotes.json habitat.
function questMapHtml(q, pick = 0) {
  const layout = D.mapLayouts?.[q.map];
  if (!layout || !D.notes) return "";
  const list = [...new Set([...q.mons, ...(q.mstats || []).map((s) => s.mon)])].map((id) => D.monById[id]).filter((m) => m && isLarge(m)).map((m) => {
    const h = D.notes.mons[m.name]?.habitat?.[q.map];
    const area = q.mstats?.find((s) => s.mon === m.id)?.area;
    const start = /^\d+$/.test(area || "") ? [+area] : h?.start || [];
    return { m, start, move: h?.move || [], rest: h?.rest || [] };
  }).filter((x) => x.start.length || x.move.length);
  if (!list.length) return "";
  const cur = list[Math.min(pick, list.length - 1)];
  const n = layout.nodes;
  const cls = (no) => [cur.start.includes(no) ? "start" : "", cur.move.includes(no) ? "move" : "", cur.rest.includes(no) ? "rest" : ""].join(" ");
  const N = D.notes;
  const climate = N.hot.includes(q.map) ? "マップ全体が暑い（クーラードリンク）" : N.cold.includes(q.map) ? "マップ全体が寒い（ホットドリンク）" : N.hotcold.includes(q.map) ? "昼は暑く（クーラードリンク）、夜は寒い（ホットドリンク）" : "";
  return `<div id="qmap"><h2>マップと出現エリア</h2>
    ${list.length > 1 ? `<div class="chips">${list.map((x, i) => `<button class="chip ${x === cur ? "on" : ""}" data-qm="${i}">${esc(x.m.name)}</button>`).join("")}</div>` : ""}
    <svg class="mapsvg hab" viewBox="-8 -8 116 116" role="img" aria-label="${esc(cur.m.name)}の出現エリア">
      ${mapEdges(layout)}
      ${Object.entries(n).map(([no, [x, y]]) => `<g class="${cls(+no)}"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y}">${no === "0" ? "BC" : no}</text>${cur.rest.includes(+no) ? `<text class="zz" x="${x + 7}" y="${y - 7}">zz</text>` : ""}${mapMarks(layout, D.maps.find((m) => m.name === q.map), rankOf(q), +no, x, y)}</g>`).join("")}
    </svg>
    ${mapLegend(layout, D.maps.find((m) => m.name === q.map), rankOf(q))}
    <p class="muted" style="text-align:center">${[cur.start.length ? `<span class="lg start"></span>はじめにいる` : "", cur.move.length ? `<span class="lg move"></span>移動する` : "", cur.rest.length ? "zz 休む（眠る）エリア" : ""].filter(Boolean).join("　")}</p>
    <p>${esc(cur.m.name)}: ${[cur.start.length ? `はじめ ${cur.start.join("・")}` : "", cur.move.length ? `移動 ${cur.move.join("・")}` : "", cur.rest.length ? `休む ${cur.rest.join("・")}` : ""].filter(Boolean).join(" / ")}</p>
    ${climate ? `<p class="muted">${climate}。${layout.cold || layout.hot || layout.hotcold ? "飲み物が要るエリアはマップに 🔥（ホット）🧊（クーラー）で出しています。" : "エリアごとの暑さ・寒さはまだ分かっていません。"}</p>` : ""}
    <p class="muted">はじめのエリアはこのクエストのデータ、移動と休むエリアはそのマップでのいつもの動きのめやすです。食事をするエリアは分かっていません。</p></div>`;
}

// Video search links per weapon type (nothing is sent until a link is tapped).
const TA_WEAPONS = [["大剣", "Great Sword"], ["太刀", "Long Sword"], ["片手剣", "Sword and Shield"], ["双剣", "Dual Blades"], ["ハンマー", "Hammer"],
  ["狩猟笛", "Hunting Horn"], ["ランス", "Lance"], ["ガンランス", "Gunlance"], ["スラッシュアックス", "Switch Axe"], ["チャージアックス", "Charge Blade"],
  ["操虫棍", "Insect Glaive"], ["ライトボウガン", "Light Bowgun"], ["ヘビィボウガン", "Heavy Bowgun"], ["弓", "Bow"]];
function taLinks(q) {
  const game = state.prefs.taGame === "MHGU" ? "MHGU" : "MHXX";
  // MHGU: English quest and weapon names (quest name falls back to Japanese if missing)
  const url = (w) => `https://www.youtube.com/results?search_query=${encodeURIComponent(game === "MHGU" ? `MHGU ${q.en || q.name} ${w[1]} TA` : `MHXX ${q.name} ${w[0]} TA`)}`;
  return `<details class="ta"><summary>武器ごとのTA（タイムアタック）動画をさがす</summary>
    <label class="muted">検索語 <select id="tag"><option ${game === "MHXX" ? "selected" : ""}>MHXX</option><option ${game === "MHGU" ? "selected" : ""}>MHGU</option></select></label>
    <div class="chips">${TA_WEAPONS.map((w) => `<a class="chip" href="${url(w)}" target="_blank" rel="noopener noreferrer">${esc(w[0])}</a>`).join("")}</div>
    <p class="muted">動画サイトの検索結果を開きます（ほかのクエストの動画が出ることもあります）。MHGU は英語版のクエスト名${q.en ? `「${esc(q.en)}」` : ""}と英語の武器名で検索します。</p></details>`;
}

// 納品の道順: trips from base camp to the nearest gathering area and back, with the pouch limit
// (data/carry.json, editable) and return balls (1 carried + ones mixed on the way). Items you can
// hold only one of (eggs, 火薬岩 …) are carried by hand: no return ball, walk back every time.
function deliveryHtml(q) {
  const m = q.goal.match(/^(.+?)([０-９\d]+)(?:個|匹|本)の納品/);
  if (!m) return "";
  const id = Object.keys(D.items).find((k) => D.items[k] === m[1]);
  const need = +m[2].replace(/[０-９]/g, (c) => "０１２３４５６７８９".indexOf(c));
  const layout = D.mapLayouts?.[q.map];
  const mp = D.maps.find((x) => x.name === q.map);
  if (!id || !layout || !mp) return "";
  const rank = rankOf(q) || "下位";
  const areas = mp.areas.map((a) => {
    const rows = (a.items[rank] || []).filter((r) => r[0] === id);
    return rows.length ? { area: a.no, pct: Math.max(...rows.map((r) => r[3])), tries: `${Math.min(...rows.map((r) => r[1]))}〜${Math.max(...rows.map((r) => r[2]))}` } : null;
  }).filter(Boolean);
  const head = `<h2>納品の道順</h2>`;
  if (!areas.length) return `${head}<p class="muted">${esc(m[1])}は${esc(q.map)}（${rank}）の採取では手に入りません（モンスターの剥ぎ取り・釣り・調合など）。<a href="#find/item/${id}">入手方法 ›</a></p>`;
  const dataCarry = D.carry?.[id];
  const carry = state.prefs.carryFix?.[id] || dataCarry || 10;
  const byHand = carry === 1;
  const mix = state.prefs.modoriMix || 0;
  const plan = deliveryPlan({ need, carry, modori: byHand ? 0 : 1 + mix, egg: byHand, areas, layout });
  if (!plan) return "";
  const nm = (n) => (n === "0" ? "BC" : n);
  const recipe = D.mix.find((r) => D.items[r[0]] === "モドリ玉");
  const a = plan.area;
  const known = byHand ? D.carryRoutes?.[q.id] : null;
  const path = (p) => p.map(nm).join(" → ");
  const rules = byHand && D.carryRoutes?._rules ? `<details><summary>運ぶときの決まりと役立つスキル</summary><ul>${D.carryRoutes._rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : "";
  if (known) return `${head}<div class="card">
    <p><b>${esc(m[1])} ${need}個</b>（両手で運ぶもの・1個ずつ・モドリ玉では持ち帰れません）</p>
    ${known.go ? `<p>卵まで: ${path(known.go)}</p>` : ""}
    ${known.trips.length ? `<ol class="steps">${known.trips.map((t, i) => `<li>${i + 1}個目: ${path(t)}</li>`).join("")}</ol>` : ""}
    ${known.alt?.length ? `<p class="muted">ほかの道: ${known.alt.map(path).join(" ／ ")}</p>` : ""}
    <ul>${known.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
    ${rules}
    <p class="muted">実際に遊んだ人の情報をもとにした道順です。1個運ぶと岩で道がふさがるクエストがあるので、2個目からは道が変わります。</p></div>`;
  return `${head}<div class="card">
    <p><b>${esc(m[1])} ${need}個</b> ／ 一度に持てる数 <input id="dvcarry" data-item="${id}" type="number" inputmode="numeric" min="1" max="99" value="${carry}" style="width:4.5em" aria-label="一度に持てる数">
      ${dataCarry && carry !== dataCarry ? `<span class="muted">（データでは${dataCarry}）</span>` : ""}</p>
    ${byHand ? `<p class="hi">両手で運ぶもの（1個ずつ）なので、モドリ玉では持ち帰れません。毎回歩いてベースキャンプまで運びます。</p>`
      : `<p>モドリ玉 <b>1個</b>（持てるのは1個まで）＋ 調合で作る数 <input id="dvmix" type="number" inputmode="numeric" min="0" max="20" value="${mix}" style="width:4.5em" aria-label="調合で作るモドリ玉の数">
        ${recipe ? `<br><span class="muted">調合: ${esc(itemName(recipe[1]))} ＋ ${esc(itemName(recipe[2]))}（成功率 ${mixRate(recipe[3])}%）。材料を持っていけば、使ったあとにその場で作れます。</span>` : ""}</p>`}
    <p>いちばん近い採取エリア: <b>エリア${a.area}</b>（ベースキャンプから ${a.path.length - 1}エリア先・採取1か所で${a.tries}回・この素材は1回${a.pct}%）</p>
    <ol class="steps">${plan.trips.map((t) => `<li>${t.go.map(nm).join(" → ")} で${t.bring}個集める → ${t.back === "モドリ玉" ? "モドリ玉でBCへ" : `歩いて ${t.backPath.map(nm).join(" → ")}`} → 納品</li>`).join("")}</ol>
    ${plan.others.length ? `<p class="muted">集まりきらないときは次に近いエリア: ${plan.others.map((o) => `エリア${o.area}（${o.path.length - 1}エリア先・${o.pct}%）`).join("、")}</p>` : ""}
    ${rules}
    <p class="muted">道順はマップの図のつながりで数えためやすです（エリアの広さや段差は入っていません）。1か所で全部集まるとは限りません。途中で地形が変わるマップ（通れなくなる道など）はまだデータに入っていないので、そのときは次に近いエリアを使ってください。</p></div>`;
}

// How a quest's tab opens, traced back tab by tab: the previous tab's キー quests, then its 緊急 quests.
// Only the usual star progression; quest-specific conditions (村人の依頼, 特殊許可) are not in the data.
const UNLOCK_ORDER = { 村: ["★１", "★２", "★３", "★４", "★５", "★６", "★７", "★８", "★９", "★１０"], 集会所: ["★１", "★２", "★３", "★４", "★５", "★６", "★７", "Ｇ★１", "Ｇ★２", "Ｇ★３", "Ｇ★４"] };
// 闘技大会: the weapons this quest offers, ranked by the fastest TA record (solo), then pair records.
// Each row opens to its details (gap to the fastest, the record holder).
function arenaHtml(q) {
  const A = D.arena?.[q.id];
  if (!A) return "";
  const fmtGap = (s) => `+${Math.floor(s / 60)}'${String(Math.floor(s % 60)).padStart(2, "0")}"${String(Math.round((s % 1) * 100)).padStart(2, "0")}`;
  const ranked = [...A.solo].sort((a, b) => (a.sec ?? 1e9) - (b.sec ?? 1e9));
  const pairs = [...A.pair].filter((r) => r.time).sort((a, b) => a.sec - b.sec);
  const best = ranked[0]?.sec;
  const src = (r) => (r.src ? `<span class="pill" title="${esc(ARENA_SRC[r.src] || r.src)}">${esc(r.src)}</span>` : "");
  const row = (r, i, pair = false) => r.time
    ? `<details class="tarow"><summary><span class="tarank">${pair ? "ペア" : `${i + 1}位`}</span><b>${esc(r.w)}</b> ${src(r)}<span class="grow"></span><span>${esc(r.time)}</span>${A.rank?.t ? arenaRankPill(A.rank.t, r.sec) : ""}</summary>
        <div class="muted">${pair ? "2人で" : "ひとりで"}${esc(r.w)}を使った最速の記録です（${esc(ARENA_SRC[r.src] || "")}）。記録したハンター: ${esc(r.who) || "-"}${!pair && best != null && r.sec > best ? `／1位との差 ${fmtGap(r.sec - best)}` : ""}${pair && / ほか$/.test(r.w) ? "／もう1人の武器は記録にありません" : ""}</div></details>`
    : `<div class="tarow none"><span class="tarank">-</span><b>${esc(r.w)}</b><span class="grow"></span><span class="muted">記録なし</span></div>`;
  const R = A.rank, mm = (s) => `${s / 60}分`;
  return `<div class="card"><b>武器ごとの最速タイム（速い順）</b>
    ${R ? `<p>${R.t ? `<span class="pill tier-S">S</span> ${mm(R.t[0])}未満 <span class="pill tier-A">A</span> ${mm(R.t[1])}未満 <span class="pill">B</span> ${mm(R.t[2])}未満` : `<span class="muted">ランクの基準タイムはまだ調べていません。</span>`}
      <br><span class="muted">ランク報酬　S: ${esc(rewardName(R.S))}　A: ${esc(rewardName(R.A))}${R.note ? `　※${esc(R.note)}` : ""}</span></p>` : ""}
    <h3>ひとり</h3>${ranked.map((r, i) => row(r, i)).join("")}
    ${pairs.length ? `<h3>ペア</h3>${pairs.map((r) => row(r, 0, true)).join("")}` : ""}
    <p class="muted">闘技大会では武器ごとに装備が決まっています。3DS版（XX）・Switch版（GU）・前作（X）の記録をまとめて、武器ごとにいちばん速いものを出しています。押すと記録したハンターなどが出ます。</p></div>`;
}
// "こんがり肉×2": item name in the current language, count kept
const rewardName = (s) => String(s).replace(/^(.+?)(×\d+)?$/, (_, n, c) => nm(n) + (c || ""));
const ARENA_SRC = { XX: "3DS版の記録", GU: "Switch版の記録", X: "前作の記録" };
// S / A / B by the game's time limits for this quest (t = [S, A, B] seconds)
function arenaRankPill(t, sec) {
  const k = sec < t[0] ? "S" : sec < t[1] ? "A" : sec < t[2] ? "B" : "";
  return k ? ` <span class="pill tier-${k}">${k}</span>` : ` <span class="pill" title="Bランクの時間より遅い">B外</span>`;
}
// The condition text with each 「クエスト名」 linked (tab before it, like 集会所G級★4「…」, picks among same names).
function condHtml(text) {
  const N = (x) => x.normalize("NFKC").replace(/[\s・･、。!?！？…‥.~～ー-]/g, "");
  const done = new Set(state.cleared);
  // GU: the sentence is looked up as a pattern ({q} = a quest, {n} = a number); the quests go in as English links
  if (isEn()) {
    const refs = [], nums = [];
    const skel = text.replace(/(村|集会所)?(G級)?(★\d+)?「([^」]+)」/g, (all) => { refs.push(all); return "{q}"; }).replace(/\d+/g, (d) => { nums.push(d); return "{n}"; });
    const en = t(skel);
    if (en !== skel) {
      const links = refs.map((r) => condHtmlRef(r, done, N));
      return en.replace(/\{(q|n)\}/g, (_, k) => (k === "q" ? links.shift() : nums.shift()) ?? "");
    }
  }
  return esc(text).replace(/(村|集会所)?(G級)?(★\d+)?「([^」]+)」/g, (all, v, g, star, name) => {
    let qs = D.quests.filter((x) => N(x.name) === N(name));
    if (v) qs = qs.filter((x) => x.vendor === v) .length ? qs.filter((x) => x.vendor === v) : qs;
    if (star) { const tab = `${g ? "G" : ""}${star}`; const t = qs.filter((x) => N(x.tab) === N(tab)); if (t.length) qs = t; }
    const q = qs[0];
    return q ? `${v || ""}${g || ""}${star || ""}「<a href="#find/quest/${q.id}">${done.has(q.id) ? "✓ " : ""}${name}</a>」` : all;
  });
}
// One 「quest」 of a condition text as an English link with its rank (Village 6★ "Name").
function condHtmlRef(ref, done, N) {
  const [, v, g, star, name] = ref.match(/(村|集会所)?(G級)?(★\d+)?「([^」]+)」/);
  let qs = D.quests.filter((x) => N(x.name) === N(name));
  if (v && qs.some((x) => x.vendor === v)) qs = qs.filter((x) => x.vendor === v);
  if (star) { const tab = `${g ? "G" : ""}${star}`; const t2 = qs.filter((x) => N(x.tab) === N(tab)); if (t2.length) qs = t2; }
  const q = qs[0], rank = star ? `${t(v || "集会所")} ${g ? "G" : ""}${star.slice(1)}★ ` : v ? `${t(v)} ` : "";
  return q ? `${rank}"<a href="#find/quest/${q.id}">${done.has(q.id) ? "✓ " : ""}${esc(nm(q.name))}</a>"` : esc(`${rank}"${name}"`);
}
// Quests named in a condition text (same matching as condHtml).
function condQuests(text) {
  const N = (x) => x.normalize("NFKC").replace(/[\s・･、。!?！？…‥.~～ー-]/g, "");
  const out = [];
  for (const [, v, g, star, name] of text.matchAll(/(村|集会所)?(G級)?(★\d+)?「([^」]+)」/g)) {
    let qs = D.quests.filter((x) => N(x.name) === N(name));
    if (v && qs.some((x) => x.vendor === v)) qs = qs.filter((x) => x.vendor === v);
    if (star) { const tab = `${g ? "G" : ""}${star}`; const t = qs.filter((x) => N(x.tab) === N(tab)); if (t.length) qs = t; }
    if (qs[0]) out.push(qs[0]);
  }
  return out;
}
// Every quest on the way to q, oldest first (each before the quests that need it).
function condPath(q) {
  const seen = new Set([q.id]), out = [];
  const walk = (x, depth) => {
    if (depth > 40) return;
    for (const r of condQuests(D.questcond?.[x.id] || "")) { if (seen.has(r.id)) continue; seen.add(r.id); walk(r, depth + 1); out.push(r); }
  };
  walk(q, 0);
  // keep every quest after the ones it needs, and otherwise go from low ranks to high (village and hall mixed by rank share)
  const rankKey = (x) => { const o = UNLOCK_ORDER[x.vendor]; const i = o ? o.indexOf(x.tab) : -1; return i < 0 ? 1 : i / o.length; };
  const need = new Map(out.map((x) => [x.id, new Set(condQuests(D.questcond?.[x.id] || "").map((r) => r.id).filter((id) => seen.has(id) && id !== q.id))]));
  const sorted = [], left = [...out];
  while (left.length) {
    const ready = left.filter((x) => [...need.get(x.id)].every((id) => sorted.some((y) => y.id === id)));
    const pick = (ready.length ? ready : left).reduce((a, b) => (rankKey(b) < rankKey(a) ? b : a));
    sorted.push(pick); left.splice(left.indexOf(pick), 1);
  }
  return sorted;
}
function unlockChain(q) {
  const order = UNLOCK_ORDER[q.vendor];
  const at = order ? order.indexOf(q.tab) : -1;
  const own = D.questcond?.[q.id];
  const path = own ? condPath(q) : [];
  const doneP = new Set(state.cleared);
  const ownHtml = own ? `<p><b>このクエストが出る条件</b><br>${condHtml(own)}</p>
    ${path.length ? `<details class="step" open><summary>このクエストまでの流れ（最初から） <span class="pill${path.every((x) => doneP.has(x.id)) ? " on" : ""}">${path.filter((x) => doneP.has(x.id)).length}/${path.length} クリア</span></summary>
      <ol class="qpath">${path.map((x) => `<li><a href="#find/quest/${x.id}">${doneP.has(x.id) ? "✓ " : ""}${esc(x.name)}</a> <span class="muted">${esc(t(x.vendor))}${esc(t(x.tab))}</span>${D.questcond?.[x.id] ? `<div class="muted">条件: ${condHtml(D.questcond[x.id])}</div>` : ""}</li>`).join("")}
        <li><b>${esc(q.name)}</b>（このクエスト）</li></ol></details>` : ""}` : "";
  if (at < 0) return `<details class="card" ${own ? "open" : ""}><summary>出現条件</summary>${ownHtml || `<p class="muted">${q.vendor === "集会所" ? "ダウンロードクエストは、ダウンロードすると受けられます。" : `${esc(t(q.vendor))}のクエストの出現条件は、まだデータがありません。`}</p>`}</details>`;
  const done = new Set(state.cleared);
  const link = (x) => `<a class="chip${done.has(x.id) ? " on" : ""}" href="#find/quest/${x.id}">${done.has(x.id) ? "✓ " : ""}${esc(x.name)}${capMark(x)}</a>`;
  const uniq = (list) => list.filter((x, i) => list.findIndex((y) => y.name === x.name) === i);
  const steps = [];
  for (let i = at - 1; i >= 0; i--) {
    const qs = D.quests.filter((x) => x.vendor === q.vendor && x.tab === order[i]);
    const keys = uniq(qs.filter((x) => (x.badge || "").includes("キー"))), urg = uniq(qs.filter((x) => (x.badge || "").includes("緊急")));
    const left = keys.filter((x) => !done.has(x.id)).length + urg.filter((x) => !done.has(x.id)).length;
    steps.push(`<details class="step" ${i === at - 1 ? "open" : ""}><summary>${esc(t(q.vendor))}${esc(order[i])} ${left ? `<span class="pill">のこり${left}</span>` : `<span class="pill on">クリア済み</span>`}</summary>
      ${keys.length ? `<div class="muted">キークエスト（${keys.length}）</div><div class="chips">${keys.map(link).join("")}</div>` : ""}
      ${urg.length ? `<div class="muted">緊急クエスト</div><div class="chips">${urg.map(link).join("")}</div>` : ""}</details>`);
  }
  // no own condition: say when it appears from its tab (the first tab is open from the start, a later tab opens
  // after the urgent quest of the tab before it)
  const prevUrg = at > 0 ? uniq(D.quests.filter((x) => x.vendor === q.vendor && x.tab === order[at - 1] && (x.badge || "").includes("緊急"))) : [];
  const when = own ? "" : at === 0 ? `最初から受けられます。`
    : `${prevUrg.length ? `${esc(t(q.vendor))}${esc(order[at - 1])}の緊急クエスト${prevUrg.map((x) => `「${link(x).replace(/class="chip[^"]*"/, "")}」`).join("・")}をクリアして、` : ""}${esc(t(q.vendor))}${esc(t(q.tab))}が開くと受けられます（めやす）。`;
  const self = (q.badge || "").includes("緊急") ? `このクエストは${esc(t(q.vendor))}${esc(t(q.tab))}の緊急クエストです。同じ段のキークエストを全部クリアすると出ます。`
    : (q.badge || "").includes("キー") ? `このクエストは${esc(t(q.vendor))}${esc(t(q.tab))}のキークエストです。` : "";
  return `<details class="card" ${own ? "open" : ""}><summary>出現条件</summary>${ownHtml}<details class="step"><summary>${esc(t(q.vendor))}${esc(t(q.tab))}が開くまで（段ごと）</summary>
    ${self ? `<p>${self}</p>` : ""}
    ${steps.length ? `<p class="muted">ふつうは、前の段のキークエストを全部クリアすると緊急クエストが出て、それをクリアすると次の段が開きます（めやす）。近い段から順にさかのぼっています。</p>${steps.join("")}` : `<p class="muted">${esc(t(q.vendor))}${esc(t(q.tab))}は最初から受けられます。</p>`}
    </details>${own ? "" : `<p><b>受けられる時期</b><br>${when}</p><p class="muted">このクエストだけの条件はデータにないので、段が開く時期で書いています。</p>`}</details>`;
}
// ニャンター / オトモ support moves (data/nyanter.json). Locked moves open by hunting their monster with an
// オトモ that knows the move (or as ニャンター); the player ticks the ones already open (prefs.nyOpen).
const monIdByName = (n) => D.monsters.find((m) => m.name === n)?.id;
function nyRow(x, open) {
  const mid = x.unlock && monIdByName(x.unlock);
  return `<li class="item"><span class="grow"><b>${esc(x.name)}</b> <span class="pill">ゲージ${x.gauge}</span>${x.effect ? `<div>${esc(x.effect)}</div>` : ""}
    ${x.tend ? `<div class="muted">${esc(x.tend)}</div>` : ""}
    <div class="muted">${x.unlock ? `解放: <a class="inl" href="#mons/${mid}">${esc(x.unlock)}</a>を狩猟する` : "最初から使える（ロックなし）"}</div></span>
    ${x.unlock ? `<label class="check" style="margin:0"><input type="checkbox" data-nyopen="${esc(x.name)}" ${open.has(x.name) ? "checked" : ""}>解放済み</label>` : ""}</li>`;
}
function bindNyOpen(redraw) {
  view.querySelectorAll("[data-nyopen]").forEach((cb) => (cb.onchange = () => {
    const o = new Set(state.prefs.nyOpen || []);
    cb.checked ? o.add(cb.dataset.nyopen) : o.delete(cb.dataset.nyopen);
    state.prefs.nyOpen = [...o]; save(); redraw();
  }));
}
function nyanterPage() {
  setTitle("ニャンターのサポート行動");
  if (!D.nyanter) { view.innerHTML = `<p class="muted">データを読み込めませんでした。</p>`; return; }
  const open = new Set(state.prefs.nyOpen || []);
  const locked = D.nyanter.filter((x) => x.unlock), left = locked.filter((x) => !open.has(x.name)).length;
  view.innerHTML = `<p class="muted">ロックされたサポート行動は、その技を覚えているオトモを連れて（またはニャンターで）決まったモンスターを狩猟すると解放されます。一度解放すると、その技を覚えているオトモ全員が使えます。</p>
    <p>ロックのある技 ${locked.length}個のうち、まだ解放していないのは <b>${left}個</b></p>
    ${[...new Set(D.nyanter.map((x) => x.group))].map((g) => `<h2>${esc(g)}</h2><ul class="list">${D.nyanter.filter((x) => x.group === g).map((x) => nyRow(x, open)).join("")}</ul>`).join("")}
    <p class="muted">効果は短くまとめためやすです。「固有」はその傾向のオトモだけが覚える技です。</p>`;
  bindNyOpen(nyanterPage);
}
// 雑貨屋 (data/shop.json shop) and 交易窓口 (trade). A shop row "村★3（HR2）" is open once 村★3 or 集会所★2 is open.
const itemIdByName = (n) => (D.itemIdByName ||= Object.fromEntries(Object.entries(D.items).map(([id, x]) => [x, id])))[n];
function shopOpen(cond) {
  if (cond === "最初") return true;
  const m = cond.match(/村★(\d+)（HR(\d+)）/);
  if (!m) return false;
  const open = new Set(openTabs().open), tabOpen = (v, n) => D.quests.some((q) => q.vendor === v && Z2H(q.tab) === `★${n}` && open.has(q.id));
  return tabOpen("村", m[1]) || tabOpen("集会所", m[2]);
}
const Z2H = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// Where a name links: item, armor or weapon page (shop rows include gear); plain text when not in the data.
function nameLink(n) {
  const id = itemIdByName(n);
  if (id) return `<a href="#find/item/${id}">${esc(n)}</a>`;
  if (D.armor.some((a) => a.name === n)) return `<a href="#find/armor/${encodeURIComponent(n)}">${esc(n)}</a>`;
  const w = D.weapons.find((x) => x.name === n);
  return w ? `<a href="#find/weapon/${w.id}/${encodeURIComponent(n)}">${esc(n)}</a>` : esc(n);
}
function shopPage(tab = "shop") {
  setTitle("雑貨屋・交易窓口");
  if (!D.shop) { view.innerHTML = `<p class="muted">お店のデータを読み込めませんでした。</p>`; return; }
  const tabs = `<div class="chips">${[["shop", "雑貨屋"], ["trade", "交易窓口"]].map(([v, l]) => `<a class="chip ${tab === v ? "on" : ""}" href="#find/shop/${v}">${l}</a>`).join("")}</div>`;
  if (tab === "trade") {
    const T = D.shop.trade;
    view.innerHTML = tabs + `<p class="muted">ベルナ村の剣ニャン丸（またはマイハウスのルームサービス）で、龍歴院ポイントを使います。${esc(T.carts)}。</p>
      <h2>アイテムを増やす</h2>${T.farms.map((fm) => `<details class="card"><summary>${esc(fm.name)}</summary><p class="muted">使えるようになる条件: ${esc(fm.unlock)}</p>
        <div class="chips">${fm.items.map(([n, p]) => `<span class="chip">${nameLink(n)} <span class="muted">${p}pt</span></span>`).join("")}</div></details>`).join("")}
      <h2>ポイントで交換</h2><div class="table-wrap"><table><tr><th>もの</th><th>ポイント</th><th>並ぶ時期</th></tr>${T.exchange.map(([n, p, c]) => `<tr><td style="text-align:left">${nameLink(n)}</td><td>${p}</td><td style="text-align:left;white-space:normal">${esc(c)}</td></tr>`).join("")}</table></div>
      <p class="muted">「G級？」「条件不明」は、もとの情報でも時期がはっきりしないものです。</p>`;
    return;
  }
  const groups = [...new Set(D.shop.shop.map((r) => r.cond))];
  view.innerHTML = tabs + `<p class="muted">村★と集会所の進み具合で品ぞろえが増えます（「村★3（HR2）」は村★3か集会所★2が開くと並びます）。✓ はいまの進行で買えるものです。</p>
    ${groups.map((c) => { const open = shopOpen(c); const rows = D.shop.shop.filter((r) => r.cond === c);
      return `<details class="card" ${open ? "open" : ""}><summary>${esc(c === "最初" ? "最初から" : c)} ${open ? `<span class="pill on">✓ 買える</span>` : ""}</summary>
        <div class="table-wrap"><table>${rows.map((r) => `<tr><td style="text-align:left">${nameLink(r.name)}</td><td>${fmt(r.price)}z</td></tr>`).join("")}</table></div></details>`; }).join("")}`;
}
// Shop / trade lines for one item id (item page and short-material tips).
function buyInfo(id) {
  if (!D.shop) return [];
  const n = itemName(id), out = [];
  for (const r of D.shop.shop) if (r.name === n) out.push(`雑貨屋 ${fmt(r.price)}z（${r.cond === "最初" ? "最初から" : r.cond}）${shopOpen(r.cond) ? " ✓" : ""}`);
  for (const fm of D.shop.trade.farms) for (const [x, p] of fm.items) if (x === n) out.push(`交易で増やす: ${fm.name} ${p}pt`);
  for (const [x, p, c] of D.shop.trade.exchange) if (x === n) out.push(`交易で交換: ${p}pt（${c}）`);
  return out;
}
// Coins / tickets rewarded by 闘技大会・訓練 quests: where each comes from (rank reward and chance) and
// the gear it is a material for. All from existing quest rewards and recipes.
function coinsPage() {
  setTitle("闘技大会・訓練のコイン");
  const fromArena = (q) => q.vendor === "闘技大会" || q.vendor === "訓練";
  const coins = new Map(); // id -> [{q, label, pct}]
  for (const q of D.quests) if (fromArena(q)) for (const [label, list] of q.rgroups || []) for (const [id, , pct] of list)
    if (/コイン|チケット/.test(itemName(id))) (coins.get(id) || coins.set(id, []).get(id)).push({ q, label, pct });
  const done = new Set(state.cleared);
  const items = [...coins].sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0]), "ja"));
  view.innerHTML = `<p class="muted">闘技大会・訓練でもらえるコインと、それを素材に作れる武器・防具です。コインは交換ではなく、加工屋で素材として使います。</p>
    ${items.map(([id, from]) => {
      const used = D.usedIn[id] || [];
      const qs = [...new Map(from.map((x) => [x.q.id, x])).values()];
      return `<details class="card"><summary>${esc(itemName(id))} <span class="pill">作れる${used.length}</span></summary>
        <div class="muted">もらえるクエスト</div><ul class="list">${qs.map((x) => `<li><a href="#find/quest/${x.q.id}"><span class="grow">${done.has(x.q.id) ? "✓ " : ""}${esc(x.q.name)} <span class="muted">${esc(x.q.vendor)} ${esc(x.label)} ${x.pct}%</span></span>›</a></li>`).join("")}</ul>
        ${used.length ? `<div class="muted">作れるもの</div><div class="chips">${used.map((u) => `<a class="chip" href="${u.type === "armor" ? `#find/armor/${encodeURIComponent(u.name)}` : u.link || "#"}">${esc(u.name)} ×${u.qty}</a>`).join("")}</div>` : `<p class="muted">素材として使う武器・防具はデータにありません。</p>`}
        <p><a href="#find/item/${id}">アイテムのページ ›</a></p></details>`;
    }).join("") || `<p class="muted">データがありません。</p>`}`;
}
// 〇〇からの依頼 (data/clients.json): clients in game order (first quest in the data order), each folding out its quests.
function clientsPage(pick) {
  setTitle(pick ? `${pick}からの依頼` : "〇〇からの依頼");
  if (!D.clients) { view.innerHTML = `<p class="muted">依頼主のデータを読み込めませんでした。</p>`; return; }
  const done = new Set(state.cleared);
  const byClient = new Map();
  for (const q of D.quests) { const c = D.clients[q.id]; if (c) (byClient.get(c) || byClient.set(c, []).get(c)).push(q); }
  const qlink = (q) => `<li><a href="#find/quest/${q.id}"><span class="grow">${done.has(q.id) ? "✓ " : ""}${nameWithRuby(q.name, D.readings)}${capMark(q)} <span class="muted">${esc(t(q.vendor))} ${esc(t(q.tab))}${q.badge ? ` ${esc(badgeText(q.badge))}` : ""}</span></span>›</a></li>`;
  if (pick) {
    const qs = byClient.get(pick) || [];
    view.innerHTML = `<p class="muted">${esc(pick)}からの依頼（${qs.length}件・クリア済み${qs.filter((q) => done.has(q.id)).length}件）。ゲームの順に並べています。</p><ul class="list">${qs.map(qlink).join("")}</ul>
      <p><a href="#find/clients">依頼主の一覧へ ›</a></p>`;
    return;
  }
  const vendors = [...new Set(D.quests.map((q) => q.vendor))];
  view.innerHTML = `<input type="search" id="cq" placeholder="依頼主・クエスト名で絞る（ひらがな可）">
    <p class="muted">クエストの依頼主ごとに、ゲームの順（はじめて出てくるクエストの順）に並べています。名前を押すとクエストの一覧が開きます。</p><div id="cl"></div>`;
  const draw = (q) => {
    view.querySelector("#cl").innerHTML = vendors.map((v) => {
      const list = [...byClient].filter(([, qs]) => qs[0].vendor === v).filter(([c, qs]) => !norm(q) || match(q, c, D.readings) || qs.some((x) => match(q, x.name, D.readings)));
      return list.length ? `<h2>${esc(v)}</h2>${list.map(([c, qs]) => `<details class="card"><summary>${esc(c)}からの依頼 <span class="pill">${qs.filter((x) => done.has(x.id)).length}/${qs.length}</span></summary><ul class="list">${qs.map(qlink).join("")}</ul></details>`).join("")}` : "";
    }).join("") || `<p class="muted">見つかりませんでした。</p>`;
  };
  view.querySelector("#cq").oninput = (e) => draw(e.target.value);
  draw("");
}
// 狩技 (data/huntarts.json): unlock condition per art level; quests named in it link and show ✓ when cleared.
const ART_TYPES = ["共通", "大剣", "太刀", "片手剣", "双剣", "ハンマー", "狩猟笛", "ランス", "ガンランス", "スラッシュアックス", "チャージアックス", "操虫棍", "ライトボウガン", "ヘビィボウガン", "弓"];
function artRow(a) {
  const done = new Set(state.cleared);
  const qs = (a.q || []).map((id) => D.questById[id]).filter(Boolean);
  const got = qs.some((q) => done.has(q.id));
  return `<li class="item"><span class="grow"><b>${esc(a.name)}</b>${got ? ` <span class="pill on">条件のクエストをクリア済み</span>` : ""}${a.desc ? `<div>${esc(a.desc)}</div>` : ""}${a.gauge ? `<div class="muted">狩技ゲージ ${a.gauge}（SP状態 ${a.gaugeSP}）</div>` : ""}<span class="muted">覚える条件: ${esc(a.cond)}${a.hr ? `（${esc(a.hr)}）` : ""}</span>
    ${qs.length ? `<div class="chips">${qs.map((q) => `<a class="chip${done.has(q.id) ? " on" : ""}" href="#find/quest/${q.id}">${done.has(q.id) ? "✓ " : ""}${esc(q.name)} <span class="muted">${esc(t(q.vendor))}${esc(t(q.tab))}</span></a>`).join("")}</div>` : ""}</span></li>`;
}
function artsPage(type = "共通") {
  setTitle("狩技の取得条件");
  if (!D.arts) { view.innerHTML = `<p class="muted">狩技のデータを読み込めませんでした。</p>`; return; }
  view.innerHTML = `<div class="chips">${ART_TYPES.map((t) => `<a class="chip ${t === type ? "on" : ""}" href="#find/arts/${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>
    <ul class="list">${D.arts.filter((a) => a.w === type).map(artRow).join("")}</ul>
    <p class="muted">条件を満たしたあと、ベルナ村のカリスタ教官（条件によってはその村の人）に話しかけると覚えます。条件を満たしても知らせが出ないことがあります。「村4か集3に到達」は、村★4か集会所★3が開いたら、という意味です。</p>`;
}
// 闘技大会・訓練: fixed gear and supplies, so bring-item advice and 眠爆 do not apply
const fixedGearQ = (q) => q.vendor === "闘技大会" || q.vendor === "訓練";
function questPage(id) {
  const q = D.questById[id];
  if (!q) return go("find");
  setTitle(q.name);
  const cleared = state.cleared.includes(id);
  const stats = q.mstats?.length ? q.mstats : q.mons.map((m) => ({ mon: m }));
  view.innerHTML = `<div class="card">
    <div class="muted">${esc(t(q.vendor))} ${esc(t(q.tab))} ${q.badge ? `<span class="pill">${esc(badgeText(q.badge))}</span>` : ""} ${randomTag(q)} / ${esc(nm(q.map))} / ${t(rankOf(q) || "ランク不明")}${capMark(q)}</div>
    ${D.dupNote[q.id] ? `<p class="pill hi">${t("同じ名前のクエストがあります")}: ${esc(D.dupNote[q.id])}</p>` : ""}
    ${D.clients?.[q.id] ? `<div class="muted">${t("依頼主")}: <a href="#find/clients/${encodeURIComponent(D.clients[q.id])}">${esc(tf("{name}からの依頼", { name: nm(D.clients[q.id]) }))} ›</a></div>` : ""}
    <div class="muted"><b>${t("メイン")}</b> ${esc(qGoal(q, "goal"))}</div>
    ${q.sub ? `<p style="margin:4px 0"><b>${t("サブ")}</b> ${esc(qGoal(q, "sub"))}</p>` : ""}
    <label class="check muted"><input type="checkbox" id="cl" ${cleared ? "checked" : ""}>${t("クリア済み")}</label></div>
    ${prepIcons([...q.mons, ...(q.mstats || []).map((s) => s.mon)], q.map, fixedGearQ(q))}
    ${questMapHtml(q)}
    ${hikyoNote(q.map, rankOf(q))}
    <div id="dv">${deliveryHtml(q)}</div>

    ${stats.length ? `<h2>モンスター</h2><div class="table-wrap"><table><tr><th>名前</th><th>乱入</th><th>エリア</th><th>体力</th><th>全体防御率</th><th>攻撃</th></tr>
      ${stats.map((s) => `<tr><td><a href="#mons/${s.mon}">${D.monById[s.mon] ? weakName(D.monById[s.mon].name, weakness(D.monById[s.mon])) : esc(s.mon)}</a></td><td>${s.intrude ? `${s.intrude}%` : ""}</td><td>${s.area === "0" ? "BC" : esc(s.area || "")}</td><td>${s.hp ? fmt(s.hp) : "-"}</td><td>${s.def ? `x${s.def.toFixed(2)}` : "-"}</td><td>${s.atk ? `x${s.atk.toFixed(2)}` : "-"}</td></tr>`).join("")}</table></div>
      ${(() => { const s = !fixedGearQ(q) && q.mstats?.find((x) => canSleep(D.monById[x.mon])); return s ? `<p><a href="#mons/${s.mon}/bomb/${q.id}">眠爆ダメージを計算 ›</a></p>` : ""; })()}` : ""}
    ${q.rgroups?.length ? `<h2>報酬</h2><p class="muted">「報酬1〜4」は倒しても捕獲しても同じ確率です。「討伐時」「撃退時」などはそのときだけ、「サブ」はサブクエストを達成したときの報酬です。</p>
      ${q.rgroups.map(([label, list]) => `<h3>${esc(label)}</h3>${dropChips(list)}`).join("")}`
      : q.rewards?.length ? `<h2>報酬</h2><div class="chips">${q.rewards.map((i) => `<a class="chip" href="#find/item/${i}">${esc(itemName(i))}</a>`).join("")}</div>` : ""}
    ${killOrCapture(q)}
    ${unlockChain(q)}
    <div class="row"><a class="btn primary" href="#advice" id="adv">このクエストの準備（おすすめ）›</a></div>
    ${(() => { const arts = (D.arts || []).filter((a) => a.q?.includes(q.id)); return arts.length ? `<div class="card"><b>このクエストで覚えられる狩技</b><div class="chips">${arts.map((a) => `<a class="chip" href="#find/arts/${encodeURIComponent(a.w)}">${esc(a.w === "共通" ? "" : `${a.w} `)}${esc(a.name)}</a>`).join("")}</div></div>` : ""; })()}
    <div id="ta">${taLinks(q)}</div>
    ${arenaHtml(q)}`;
  view.querySelector("#ta").onchange = (e) => { if (e.target.id === "tag") { state.prefs.taGame = e.target.value; save(); view.querySelector("#ta").innerHTML = taLinks(q); } };
  const dv = view.querySelector("#dv");
  dv.onchange = (e) => {
    const v = Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0));
    if (e.target.id === "dvmix") state.prefs.modoriMix = v;
    if (e.target.id === "dvcarry") (state.prefs.carryFix ||= {})[e.target.dataset.item] = v;
    save(); dv.innerHTML = deliveryHtml(q);
  };
  const bindQm = () => view.querySelectorAll("[data-qm]").forEach((b) => (b.onclick = () => { view.querySelector("#qmap").outerHTML = questMapHtml(q, +b.dataset.qm); bindQm(); }));
  bindQm();
  view.querySelector("#adv").onclick = () => { (state.prefs.advice ||= {}).qid = id; save(); };
  view.querySelector("#cl").onchange = (e) => {

    const s = new Set(state.cleared);
    e.target.checked ? s.add(id) : s.delete(id);
    state.cleared = [...s]; save(); refreshHave();
  };
}

// ---------------------------------------------------------------- モンスター

// Weak elements: every element >= 15 within 5 of the best (アオアシラ 火30・雷30 -> 火・雷).
const weakEls = (w) => { const best = Math.max(...w); return ELEMENTS.filter((_, i) => w[i] >= 15 && best - w[i] <= 5); };
// Splits a name into exactly n pieces (one per colour, so no colour shows twice): 白疾風|ナルガクルガ,
// テオ・|テスカトル; with more colours than that, the longest katakana part is cut by sound into even
// groups, extra sounds at the end: バ|ル|ファ|ルク (small kana, ー and ン stay with the sound before).
// Hand-picked cuts where the even split reads oddly (used when the piece count matches).
const NAME_CUTS = { ジンオウガ: ["ジン", "オウガ"], ダイミョウザザミ: ["ダイミョウ", "ザザミ"], ティガレックス: ["ティガ", "レッ", "クス"],
  バサルモス: ["バサル", "モス"], ハプルボッカ: ["ハプル", "ボッカ"], ベリオロス: ["ベリオ", "ロス"], グラビモス: ["グラビ", "モス"] };
function nameParts(name, n) {
  const runs = name.match(/[゠-ヺー-ヿ]+・?|[^゠-ヿ]+/g) || [name];
  if (runs.length >= n) return [...runs.slice(0, n - 1), runs.slice(n - 1).join("")];
  const isKata = (r) => /^[゠-ヿ]/.test(r);
  const longest = runs.reduce((a, r, i) => (isKata(r) && (a < 0 || r.length > runs[a].length) ? i : a), -1);
  if (longest < 0) return runs;
  const sounds = runs[longest].match(/.[ァィゥェォャュョッヮヵヶーン・]*/g);
  const m = Math.min(n - runs.length + 1, sounds.length), base = Math.floor(sounds.length / m), extra = sounds.length % m;
  const cut = NAME_CUTS[runs[longest]];
  const groups = cut?.length === m ? [...cut] : [];
  if (!groups.length) for (let g = 0, at = 0; g < m; g++) { const len = base + (g >= m - extra ? 1 : 0); groups.push(sounds.slice(at, at + len).join("")); at += len; }
  return [...runs.slice(0, longest), ...groups, ...runs.slice(longest + 1)];
}
// Monster name in clear weakness colours (no gradient: hard to read). One weak element = its plain colour.
function weakName(name, w) {
  const weak = weakEls(w);
  if (isEn()) return `<span class="${weak[0] ? `el-${weak[0]}` : ""}" ${weak.length > 1 ? `title="${t("弱点")}: ${weak.map((e) => t(e)).join(" / ")}"` : ""}>${nm(name) !== name ? `<span class="ruby" lang="ja">${esc(name)}</span>` : ""}${esc(nm(name))}</span>`;
  if (!weak.length) return `<span>${nameWithRuby(name, D.readings)}</span>`;
  if (weak.length === 1) return `<span class="el-${weak[0]}">${nameWithRuby(name, D.readings)}</span>`;
  const r = reading(name, D.readings);
  const body = nameParts(name, weak.length).map((p, i) => `<span class="el-${weak[i]}">${esc(p)}</span>`).join("");
  return `<span class="multi-el" title="弱点: ${weak.join("・")}">${r && r !== name ? `<span class="ruby">${esc(r)}</span>` : ""}${body}</span>`;
}
function weakness(m) {
  const hz = m.hitzones[0]?.parts || [];
  // columns: name, 切 打 弾 火 水 雷 氷 龍 気絶 減
  return ELEMENTS.map((_, i) => Math.max(0, ...hz.map((p) => p[4 + i])));
}
const mark = (v) => (v >= 25 ? "◎" : v >= 15 ? "○" : v >= 10 ? "△" : "×");
const isLarge = (m) => m.hitzones.length > 0;

routes.mons = (id, sub, qid) => {
  if (id) return sub === "bomb" ? bombPage(id, qid) : monPage(id);
  setTitle("モンスター");
  view.innerHTML = `<input type="search" id="q" placeholder="名前（ひらがな可）">
    <p class="muted">属性の弱点早見表（いちばん通りやすい部位の肉質）。◎25以上 ○15以上 △10以上。名前の色はいちばん効く属性です（同じくらい効く属性が2つ以上あるときは、名前を区切って火・水・雷・氷・龍の順に1色ずつ付けています）。</p>
    <div class="table-wrap"><table id="t"></table></div>`;
  const draw = (q) => {
    view.querySelector("#t").innerHTML = `<tr><th>モンスター</th>${ELEMENTS.map((e) => `<th class="el-${e}">${e}</th>`).join("")}</tr>` +
      D.monsters.filter((m) => isLarge(m) && match(q, m.name, D.readings)).map((m) => {
        const w = weakness(m), best = Math.max(...w);
        return `<tr><td><a href="#mons/${m.id}">${weakName(m.name, w)}</a></td>${w.map((v) => `<td class="${v >= 15 && best - v <= 5 ? "hi" : ""}">${mark(v)}<span class="muted">${v}</span></td>`).join("")}</tr>`;
      }).join("");
  };
  view.querySelector("#q").oninput = (e) => draw(e.target.value);
  draw("");
};

// 部位破壊: each breakable part with its number of stages, and the reward table for breaking it per rank
// (drops methods named like 頭部破壊; 尻尾 is the carve of a cut tail). 2-stage parts give the reward
// only after the second stage.
function breakHtml(m) {
  const parts = D.breaks?.[m.name] || [];
  const ranks = Object.keys(m.drops);
  const methods = [...new Set(ranks.flatMap((r) => Object.keys(m.drops[r])))].filter((x) => /破壊$/.test(x) || x === "尻尾");
  const match = (p, meth) => { const b = meth.replace(/破壊$/, ""); return b === p || b.startsWith(p) || p.startsWith(b); };
  const used = new Set();
  const rows = parts.map(([p, st]) => {
    const meths = methods.filter((x) => match(p, x));
    meths.forEach((x) => used.add(x));
    return { p, st, meths };
  });
  for (const x of methods) if (!used.has(x)) rows.push({ p: x.replace(/破壊$/, ""), st: null, meths: [x] });
  if (!rows.length) return "";
  const table = (meth) => ranks.filter((r) => m.drops[r][meth]).map((r) => `<div class="muted">${esc(r)}（${esc(meth === "尻尾" ? "切った尻尾の剥ぎ取り" : meth)}）</div><div class="chips">${m.drops[r][meth].map(([i, q, pct]) => `<a class="chip" href="#find/item/${i}">${esc(itemName(i))}${q > 1 ? `×${q}` : ""} ${pct}%</a>`).join("")}</div>`).join("");
  return `<h2>部位破壊</h2>${rows.map((r) => `<details class="card" ${memOpen(`break:${r.p}`)}><summary>${esc(r.p)} ${r.st > 1 ? `<span class="pill hi">${r.st}段階</span>` : r.st === 1 ? `<span class="pill">1段階</span>` : ""}${r.meths.length ? "" : ` <span class="muted">報酬なし</span>`}</summary>
      ${r.st > 1 ? `<p class="muted">${r.st}回壊すと報酬がもらえます（1回目だけでは報酬なし）。</p>` : ""}${r.meths.map(table).join("") || `<p class="muted">この部位の破壊報酬はデータにありません。</p>`}</details>`).join("")}
    <p class="muted">段階のついていない部位は1回壊せば報酬がもらえます。${parts.length ? "" : "破壊できる部位の段階は、このモンスターはデータにありません。"}</p>`;
}
// Open/closed state of monster-page sections (素材 per rank, 部位破壊 per part) kept across monsters (prefs.monOpen).
const memOpen = (key) => `data-mem="${esc(key)}" ${state.prefs.monOpen?.[key] ? "open" : ""}`;
function bindMemOpen() {
  view.querySelectorAll("details[data-mem]").forEach((d) => d.addEventListener("toggle", () => {
    const o = (state.prefs.monOpen ||= {});
    if (d.open) o[d.dataset.mem] = true; else delete o[d.dataset.mem];
    save();
  }));
}
function monPage(id) {
  const m = D.monById[id];
  if (!m) return go("mons");
  setTitle(m.name);
  const cols = ["切", "打", "弾", ...ELEMENTS, "気絶", "減気"];
  view.innerHTML = `
    ${prepIcons([m.id], null)}
    ${m.hitzones.map((st) => `<h2>肉質 ${esc(st.state)}</h2>
<div class="table-wrap"><table><tr><th>部位</th>${cols.map((c) => `<th class="el-${c}">${c}</th>`).join("")}</tr>
      ${st.parts.map((p) => `<tr><td>${esc(p[0])}</td>${p.slice(1).map((v, i) => `<td class="${(i < 3 && v >= 45) || (i >= 3 && i < 8 && v >= 20) ? "hi" : ""}">${v}</td>`).join("")}</tr>`).join("")}</table></div>`).join("")}
    ${m.parts.length ? `<h2>部位</h2><div class="table-wrap"><table><tr><th>部位</th><th>怯み値</th>${m.parts.some((p) => p[3]) ? "<th>切断</th>" : ""}<th>エキス</th></tr>${m.parts.map((p) => `<tr><td>${esc(p[0])}</td><td>${p[1] ?? "-"}</td>${m.parts.some((x) => x[3]) ? `<td>${p[3] ?? ""}</td>` : ""}<td>${esc(p[2])}</td></tr>`).join("")}</table></div>
      ${m.parts.some((p) => p[3]) ? `<p class="muted">怯み値はその部位にこれだけダメージを与えると怯む（部位破壊につながる）値、切断は尻尾などを切るのに必要な切断ダメージの値です。</p>` : ""}` : ""}
    ${breakHtml(m)}
    ${Object.keys(m.resist).length ? `<h2>状態異常耐性</h2><div class="table-wrap"><table><tr><th></th><th>初期</th><th>上昇</th><th>最大</th><th>ダメージ</th><th>時間</th></tr>${Object.entries(m.resist).map(([k, r]) => `<tr><td>${esc(k)}</td><td>${r[0] ?? ""}</td><td>${r[1] ?? ""}</td><td>${r[2] ?? ""}</td><td>${r[3] ?? ""}</td><td>${esc(r[4])}</td></tr>`).join("")}</table></div>` : ""}
    <h2>素材</h2>${Object.entries(m.drops).map(([rank, methods]) => `<details ${memOpen(`drop:${rank}`)}><summary>${rank}</summary>${Object.entries(methods).map(([meth, list]) => `<h3>${esc(meth)}</h3><div class="chips">${list.map(([i, q, pct]) => `<a class="chip" href="#find/item/${i}">${esc(itemName(i))}${q > 1 ? `×${q}` : ""} ${pct}%</a>`).join("")}</div>`).join("")}</details>`).join("") || `<p class="muted">データなし</p>`}
    ${(() => { const ny = (D.nyanter || []).filter((x) => x.unlock === m.name); return ny.length ? `<div class="card" id="nybox"><b>この狩猟で解放されるサポート行動</b><ul class="list">${ny.map((x) => nyRow(x, new Set(state.prefs.nyOpen || []))).join("")}</ul><a class="muted" href="#find/nyanter">サポート行動の一覧 ›</a></div>` : ""; })()}
    ${m.quests.length ? `<h2>出てくるクエスト（${m.quests.length}）</h2><div class="table-wrap"><table class="monq"><tr><th>クエスト</th><th>場所</th><th>体力</th><th>防御率</th><th></th></tr>
      ${m.quests.map((q) => { const qq = D.questById[q.q]; return `<tr><td><a href="#find/quest/${q.q}">${qq ? nameWithRuby(qq.name, D.readings) + capMark(qq) : esc(q.q)}</a>${qq && D.clients?.[qq.id] ? `<div class="qclient">${esc(D.clients[qq.id])}からの依頼</div>` : ""}</td><td>${esc(q.map)} ${q.area === "0" || q.area === 0 ? "ベースキャンプ" : q.area}</td><td>${fmt(q.hp)}</td><td>x${q.def.toFixed(2)}</td><td>${canSleep(m) ? `<a href="#mons/${m.id}/bomb/${q.q}">眠爆</a>` : ""}</td></tr>`; }).join("")}</table></div>` : ""}`;
  bindNyOpen(() => monPage(id));
  bindMemOpen();
}

// Sleep-bomb calculator. Values: 大タル爆弾G 150, ボマー x1.3, first hit on a sleeping
// monster x3 (only one bomb), all scaled by the quest's overall defense rate.
// Community-sourced numbers.
// Sleep buildup from the game data: [initial, increase per sleep, max, damage, duration, decay].
function sleepResist(m) {
  const [a, up, max, , time, decay] = m.resist["睡"];
  return `<div class="card"><b>眠らせるのに必要な睡眠値</b>
    <p>1回目 <b>${a}</b> → 眠るたびに +${up}（最大 ${max}）<br><span class="muted">眠る時間 ${esc(time)} / 自然に減る量 ${esc(decay)}</span></p>
    <p class="muted">数字が大きいほど眠りにくいモンスターです。睡眠武器・睡眠弾でこの値までためると眠ります。</p>
    <label>1発（1回）の睡眠蓄積値 <input id="sps" type="number" inputmode="numeric" min="1" max="999" value="${state.prefs.sleepPerHit || ""}" placeholder="例: 25" style="width:6em"></label>
    <div id="spsout"></div>
    <p class="muted">睡眠弾や睡眠属性の武器の1発あたりの値は、出典を確かめられていないので自分で入れてください。自然に減る分は入れていません。</p></div>`;
}
// Hits needed for the 1st..3rd sleep with a user-given buildup per hit.
function bindSleepHits(m) {
  const inp = view.querySelector("#sps");
  if (!inp) return;
  const [a, up, max] = m.resist["睡"];
  const draw = () => {
    const per = Math.max(0, parseInt(inp.value, 10) || 0);
    state.prefs.sleepPerHit = per || undefined; save();
    view.querySelector("#spsout").innerHTML = per ? `<p>${[0, 1, 2].map((k) => { const need = Math.min(max, a + up * k); return `${k + 1}回目 <b>${Math.ceil(need / per)}発</b>（${need}）`; }).join("　")}</p>` : "";
  };
  inp.oninput = draw;
  draw();
}
// A monster with no sleep buildup (initial value 0 in the game data) never falls asleep.
const canSleep = (m) => !!m?.resist?.["睡"]?.[0];
function bombPage(monId, qid) {
  const m = D.monById[monId];
  const opts = m?.quests || [];
  const cur = opts.find((q) => q.q === qid) || opts[0];
  if (!m || !cur) return go(`mons/${monId}`);
  setTitle(`${m.name} 眠爆`);
  if (!canSleep(m)) {
    view.innerHTML = `<div class="card"><b>${esc(m.name)}は眠りません</b><p class="muted">睡眠が効かないモンスターなので、眠爆はできません。</p></div>`;
    return;
  }
  const p = state.prefs;
  p.bombs ??= 8; p.bomber ??= false;
  view.innerHTML = `<div class="card">
    <label>クエスト<select id="q">${opts.map((q) => `<option value="${q.q}" ${q === cur ? "selected" : ""}>${esc(D.questById[q.q]?.name || q.q)}</option>`).join("")}</select></label>
    <div class="row" style="margin-top:8px"><label>大タル爆弾G <select id="n">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === p.bombs ? "selected" : ""}>${n}</option>`).join("")}</select> 個</label>
    <label class="check"><input type="checkbox" id="b" ${p.bomber ? "checked" : ""}>ボマー</label></div></div>
    <div class="card" id="res"></div>
    ${sleepResist(m)}
    <p class="muted"><a href="#spec/sleep">眠爆がうまくいかない理由（起爆ミス・3倍は1個目だけ など）›</a></p>
    <p class="muted">計算: 大タル爆弾G 150（ボマーで1.3倍）。眠っている相手への最初の1発だけ3倍、ほかは等倍。全体防御率を掛けた値です。ネコの火薬術は威力を上げません（大タル爆弾がGに変わる効果）。数値はコミュニティ調べです。</p>`;
  const $ = (s) => view.querySelector(s);
  const calc = () => {
    const q = opts.find((x) => x.q === $("#q").value);
    const n = +$("#n").value, bomber = $("#b").checked;
    p.bombs = n; p.bomber = bomber; save();
    const one = 150 * (bomber ? 1.3 : 1) * q.def;
    const total = one * 3 + one * (n - 1);
    const pct = (100 * total) / q.hp;
    $("#res").innerHTML = `<div class="muted">体力 ${fmt(q.hp)} / 全体防御率 x${q.def.toFixed(2)}</div>
      <p>1個: <b>${Math.floor(one)}</b>（睡眠の初撃 ${Math.floor(one * 3)}）</p>
      <p>眠爆 ${n}個: <span class="big">${fmt(Math.floor(total))}</span> <span class="muted">体力の${pct.toFixed(1)}%</span></p>
      <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
      <p class="muted">眠爆だけで倒すには約${Math.ceil(q.hp / total)}回</p>`;
  };
  for (const s of ["#q", "#n", "#b"]) $(s).onchange = calc;
  calc();
  bindSleepHits(m);

}

// ---------------------------------------------------------------- マップ

routes.maps = (name, area) => {
  if (!name) {
    setTitle("マップ");
    // drink needed on the whole map (monnotes); maps without areas (an empty data row) are left out
    const N = D.notes || { hot: [], cold: [], hotcold: [] };
    const drink = (n) => (N.hot.includes(n) ? ["🧊", "クーラードリンク"] : N.cold.includes(n) ? ["🔥", "ホットドリンク"] : N.hotcold.includes(n) ? ["🧊🔥", "昼クーラー・夜ホット"] : null);
    view.innerHTML = `<ul class="list">${D.maps.filter((mp) => mp.name && mp.areas.length).map((mp) => { const d = drink(mp.name);
      return `<li><a href="#maps/${encodeURIComponent(mp.name)}"><span class="grow">${esc(mp.name)}${hikyoOf(mp.name) ? ` <span title="秘境あり">✨</span>` : ""}${d ? ` <span title="${d[1]}" aria-label="${d[1]}">${d[0]}</span> <span class="muted">${d[1]}</span>` : ""}</span><span class="muted">${mp.areas.length}エリア</span>›</a></li>`; }).join("")}</ul>`;
    return;
  }
  const mp = D.maps.find((x) => x.name === name);
  if (!mp) return go("maps");
  setTitle(mp.name);
  const rank = state.prefs.mapRank || "下位";
  const sel = area !== undefined ? +area : null;
  const diagram = D.mapLayouts?.[mp.name];
  view.innerHTML = `
    ${diagram ? mapSvg(diagram, sel, mp, rank) : ""}
    <div class="chips">${["下位", "上位", "G級"].map((r) => `<button class="chip ${r === rank ? "on" : ""}" data-r="${r}">${r}</button>`).join("")}</div>
    ${hikyoNote(mp.name)}
    ${mp.areas.filter((a) => sel === null || a.no === sel).map((a) => `<div class="card"><b>${a.no === 0 ? "ベースキャンプ" : `エリア${a.no}`}</b>${hikyoOf(mp.name)?.from === a.no ? ` <span class="pill on">✨ ${hikyoWhole(mp.name, hikyoOf(mp.name)) ? "秘境" : "秘境の入口"}</span>` : ""} <span class="muted">${[...gatherKinds(a, rank).map(([ic, l]) => `${ic}${l}`), diagram && areaDrink(diagram, a.no) ? `${areaDrink(diagram, a.no)}${{ "🔥": "ホットドリンク", "🧊": "クーラードリンク", "🧊🔥": "昼クーラー・夜ホット" }[areaDrink(diagram, a.no)]}` : ""].filter(Boolean).join(" ")}</span>
      ${spotsHtml(mp.name, a.no, rank) || `<div class="chips" style="margin-top:6px">${(a.items[rank] || []).filter((x, i, arr) => arr.findIndex((y) => y[0] === x[0]) === i).map(([i, , , pct]) => itemChip(i, pct)).join("") || `<span class="muted">採取なし</span>`}</div>`}</div>`).join("")}
    ${sel !== null ? `<p><a href="#maps/${encodeURIComponent(mp.name)}">全エリアを見る ›</a></p>` : ""}`;
  view.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { state.prefs.mapRank = b.dataset.r; save(); routes.maps(name, area); }));
  view.querySelectorAll("[data-area]").forEach((g) => (g.onclick = () => go(`maps/${encodeURIComponent(mp.name)}/${g.dataset.area}`)));
};

// 秘境: reached from one area's high ground (data/hikyo.json); some maps know which gathering spots are in it.
const hikyoOf = (map) => (map && D.hikyo?.[map]?.from !== undefined ? D.hikyo[map] : null);
// whole = every gathering spot of that area number is in the 秘境 (the source data numbers the 秘境 itself)
const hikyoWhole = (map, h) => { const n = D.gather?.[map]?.[h.from]?.["上位"]?.length; return !!n && h.spots?.length === n; };
const hikyoWhere = (h, map) => `${hikyoWhole(map, h) ? `エリア${h.from}がそのまま秘境` : `エリア${h.from}${h.dir ? `の${h.dir}の高い所` : ""}`}。ランダムスタートで秘境から始まることがあります`;
function hikyoNote(map, rank) {
  const h = hikyoOf(map);
  if (h && rank === "下位" && !h.low) return ""; // a 下位 quest here has no 秘境
  return h ? `<p class="muted">✨ 秘境: ${hikyoWhere(h, map)}。${h.low ? "下位のクエストにも秘境があり、上位の秘境と同じ素材が採れます。" : "上位から。"}${h.spots ? `採取はエリア${h.from}の「✨秘境」の採取ポイントです。` : `どの採取ポイントが秘境かは、まだ分けていません（エリア${h.from}の採取に入っています）。`}</p>` : "";
}

// Gathering kinds shown as small icons per area (from the item names in the area's gathering list).
const GATHER_KINDS = [["⛏", "鉱石", /鉱石|石$|石の|結晶|原珠|クリスタル|塊|水晶|化石|鎧玉|原石|琥珀/], ["🐛", "虫", /虫|カナブン|カブト|ヘラクレス|ハチノコ|アリ$|バッタ|コガネ|ビートル|コオロギ|チョウ|蛾|カイコ|蟲|クモの巣/],
  ["🌿", "植物", /草|キノコ|ダケ|タケ|の実|葉|ゼンマイ|エリンギ|シメジ|マツタケ|カズラ|マンドラゴラ|トウガラシ|イチゴ|ドングリ|マタタビ|クルミ|の種|の根|の木|堅木|重木|ハチミツ/],
  ["🐟", "釣り", /魚|マグロ|イワシ|アロワナ|デメキン|キレアジ/], ["🦴", "骨", /骨/]];
function gatherKinds(area, rank) {
  const names = (area?.items[rank] || []).map(([i]) => itemName(i));
  return GATHER_KINDS.filter(([, , re]) => names.some((n) => re.test(n)));
}
// Drink needed in an area, from the hand-written layout data: cold = ホットドリンク, hot = クーラー, hotcold = 昼クーラー・夜ホット.
const areaDrink = (layout, no) => (layout.cold?.includes(no) ? "🔥" : layout.hot?.includes(no) ? "🧊" : layout.hotcold?.includes(no) ? "🧊🔥" : "");
// Edges (two-way lines and one-way arrows) plus fish / drink marks around the area circles.
function mapEdges(layout) {
  const n = layout.nodes, ow = layout.oneway || [];
  const isOw = (a, b) => ow.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const two = layout.edges.filter(([a, b]) => !isOw(a, b)).map(([a, b]) => `<line x1="${n[a][0]}" y1="${n[a][1]}" x2="${n[b][0]}" y2="${n[b][1]}"/>`).join("");
  const one = ow.filter(([a, b]) => n[a] && n[b]).map(([a, b]) => {
    // bowed curve so it does not run under other areas or over a two-way line; ends at the circle edge
    const [x1, y1] = n[a], [x2, y2] = n[b], d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    const cx = (x1 + x2) / 2 - uy * d * 0.3, cy = (y1 + y2) / 2 + ux * d * 0.3;
    const edge = (px, py, tx, ty) => { const l = Math.hypot(tx - px, ty - py) || 1; return [px + ((tx - px) / l) * 8, py + ((ty - py) / l) * 8]; };
    const [sx, sy] = edge(x1, y1, cx, cy), [ex, ey] = edge(x2, y2, cx, cy);
    return `<path class="oneway" d="M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" marker-end="url(#arrow)"/>`;
  }).join("");
  return `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>${two}${one}`;
}
function mapMarks(layout, mp, rank, no, x, y) {
  const fish = mp && gatherKinds(mp.areas.find((a) => a.no === no), rank).some(([ic]) => ic === "🐟");
  const drink = areaDrink(layout, no);
  const hk = hikyoOf(mp?.name)?.from === no;
  return `${hk ? `<text class="mark" x="${x + 8}" y="${y - 7}">✨</text>` : ""}${fish ? `<text class="mark" x="${x - 8}" y="${y - 7}">🐟</text>` : ""}${drink ? `<text class="mark" x="${x - 8}" y="${y + 7}">${drink}</text>` : ""}`;
}
// Legend with only the marks this map shows (one-way, fish in the shown rank, the drinks used).
function mapLegend(layout, mp, rank) {
  const nos = Object.keys(layout.nodes).map(Number);
  const fish = mp && nos.some((no) => gatherKinds(mp.areas.find((a) => a.no === no), rank).some(([ic]) => ic === "🐟"));
  const drinks = new Set(nos.map((no) => areaDrink(layout, no)).join(""));
  const hk = hikyoOf(mp?.name);
  const parts = [hk ? `✨ 秘境（${hikyoWhere(hk, mp?.name)}）` : "", layout.oneway?.length ? `<span class="lg-ow">→</span> 一方通行` : "", fish ? "🐟 釣り" : "", drinks.has("🔥") ? "🔥 ホットドリンク" : "", drinks.has("🧊") ? "🧊 クーラードリンク" : ""].filter(Boolean);
  return parts.length ? `<p class="muted" style="text-align:center">${parts.join("　")}</p>` : "";
}
// One gathered item as a chip; charms (お守り) stand out so they are easy to spot among many items.
const itemChip = (id, pct, qty = 1) => `<a class="chip${/お守り/.test(itemName(id)) ? " charm" : ""}" href="#find/item/${id}">${esc(itemName(id))}${qty > 1 ? `×${qty}` : ""} ${pct}%</a>`;
// Gathering spots of one area (data/gather.json): each spot has its own table; some spots pick one of
// several tables by chance. n = how many times the spot can be gathered.
function spotsHtml(map, no, rank) {
  const spots = D.gather?.[map]?.[no]?.[rank];
  if (!spots?.length) return "";
  const h = hikyoOf(map);
  if (rank === "下位" && h?.from === no && !h.low && spots.every((_, k) => h.spots?.includes(k))) return `<p class="muted">下位ではこの秘境に入れません（上位から）。</p>`;
  return `<div class="spots">${spots.map((sp, k) => {
    const all = sp.tables.flatMap((t) => t.items.map(([id]) => itemName(id)));
    const kinds = GATHER_KINDS.filter(([, , re]) => all.some((n) => re.test(n))).map(([ic]) => ic).join("");
    const hk = hikyoOf(map)?.from === no && hikyoOf(map).spots?.includes(k);
    if (hk && rank === "下位" && !hikyoOf(map).low) return ""; // 秘境 is not reachable in 下位 here
    return `<div class="spot"><div class="muted">${kinds || "・"} ${hk ? "<b>✨秘境</b>の" : ""}採取ポイント${k + 1}（${esc(sp.n)}回）${sp.tables.length > 1 ? "：表が確率で決まる" : ""}</div>
      ${sp.tables.length > 1
        ? sp.tables.map((t, i) => `<div class="gtable"><div class="gthead"><b>表${"ABCDEFGH"[i]}</b>：${t.p}%の確率でこの表 <span class="muted">（中の%は、この表の中で出る確率）</span></div><div class="chips">${t.items.map(([id, q, p]) => itemChip(id, p, q)).join("")}</div></div>`).join("")
        : sp.tables.map((t) => `<div class="chips">${t.items.map(([id, q, p]) => itemChip(id, p, q)).join("")}</div>`).join("")}</div>`;
  }).join("")}</div>`;
}
function mapSvg(layout, sel, mp, rank) {
  // layout: {nodes: {no: [x, y]}, edges: [[a, b]]} in a 0..100 box
  const n = layout.nodes;
  return `<svg class="mapsvg" viewBox="-8 -8 116 116" role="img" aria-label="エリアのつながり">
    ${mapEdges(layout)}
    ${Object.entries(n).map(([no, [x, y]]) => `<g data-area="${no}" class="${+no === sel ? "sel" : ""}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y}">${no === "0" ? "BC" : no}</text>${mapMarks(layout, mp, rank, +no, x, y)}</g>`).join("")}</svg>
    ${mapLegend(layout, mp, rank)}
    <p class="muted" style="text-align:center">エリアの位置とつながりの目安です（BC = ベースキャンプ）。番号を押すとそのエリアの採取素材を出します。一方通行と暑さ・寒さは、分かっているマップだけ出しています。</p>`;
}

// ---------------------------------------------------------------- 武器ランキング

routes.rank = () => {
  setTitle("武器ランキング");
  if (!D.weapons.length) {
    view.innerHTML = `<p class="muted">武器のデータを準備中です。</p>`;
    return;
  }
  weaponRanking();
};
let weaponRanking = () => {}; // replaced by js/rank.js once weapon data exists

// ---------------------------------------------------------------- 友達と見せ合う

// every quest id, including the ones GU leaves out, so GU and XX friends read each other's progress text
const questIds = () => D.allQuestIds;
routes.share = (f, kind, j) => {
  if (f === "compare") return comparePage();
  if (f !== undefined) return friendPage(+f, kind, j === undefined ? undefined : +j);
  setTitle("友達と見せ合う");
  const p = state.prefs;
  p.shareKinds ??= ["sets", "charms", "owned"];
  view.innerHTML = `
    <h2>自分のデータを送る</h2>
    <div class="card">
      <label>自分の名前 <input id="nm" value="${esc(p.myName || "")}" placeholder="Aさん" maxlength="30"></label>
      <div class="chips" style="margin-top:8px">${Object.entries(KINDS).filter(([k]) => k !== "card" || state.card).map(([k, l]) => `<label class="chip"><input type="checkbox" data-k="${k}" ${p.shareKinds.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <div class="row" style="margin-top:8px"><button class="primary" id="mk">テキストを作ってコピー</button></div>
      <textarea id="out" rows="4" style="width:100%" readonly hidden></textarea>
      <p class="muted">1行目は「日付_中身_名前」です。そのまま LINE などに貼ってください。</p></div>
    <h2>友達のデータを読み込む</h2>
    <div class="card"><p class="muted">友達から届いたテキストを丸ごと貼り付けてください。自分のデータは書き換えません（友達ごとに別に保存します）。</p>
      <textarea id="in" rows="4" style="width:100%" placeholder="261122_マイセット_Aさん&#10;KARITOMO1 {…}"></textarea>
      <div class="row"><button class="primary" id="rd">読み込む</button></div>
      ${D.presets?.length ? `<p class="muted" style="margin-top:8px">最初から入っているデータ（動画から読み取ったもの）</p>
      <div class="chips">${D.presets.map((x, i) => `<button class="chip" data-preset-fr="${i}">${esc(x.name)} を読み込む</button>`).join("")}</div>` : ""}</div>
    <h2>友達（${state.friends.length}人）</h2>
    <div class="row"><a class="btn" href="#share/compare">自分・友達のデータを比べる（4人まで）›</a></div>
    ${state.friends.length ? `<ul class="list">${state.friends.map((fr, i) => `<li><a href="#share/${i}"><span class="grow">${esc(fr.name)}
      <span class="ruby">${Object.entries(KINDS).filter(([k]) => fr[k]).map(([k, l]) => `${l} ${esc(fr.at?.[k] || "")}`).join(" / ")}</span></span>›</a></li>`).join("")}</ul>` : `<p class="muted">まだいません。</p>`}`;
  const $ = (x) => view.querySelector(x);
  $("#mk").onclick = async () => {
    const name = $("#nm").value.trim();
    const kinds = [...view.querySelectorAll("[data-k]:checked")].map((c) => c.dataset.k);
    if (!name) return toast("名前を入れてください");
    if (!kinds.length) return toast("送るものを選んでください");
    p.myName = name; p.shareKinds = kinds; save();
    const text = encodeShare(state, kinds, name, questIds());
    const o = $("#out"); o.hidden = false; o.value = text;
    try { await navigator.clipboard.writeText(text); toast(`コピーしました（${fmt(text.length)}文字）`); }
    catch { o.select(); toast("コピーできなかったので、下の欄に出しました。長押しでコピーしてください。"); }
  };
  const readFriend = (text, preset = false) => {
    let d;
    try { d = preset ? presetData(text) : addArenaClears(decodeShare(text, questIds())); }
    catch (e) { return toast(e.message === "quest list differs" ? "相手とアプリの版が違うので進行チェックを読めません。お互い最新にしてからやり直してください。" : "読み込めませんでした。届いたテキストを全部貼り付けたか確かめてください。"); }
    const before = structuredClone(state.friends);
    let fr = state.friends.find((x) => x.name === d.name);
    if (!fr) state.friends.push(fr = { name: d.name, at: {} });
    for (const k of Object.keys(KINDS)) if (d[k]) { fr[k] = d[k]; fr.at[k] = d.date; }
    if (d.ownedW) fr.ownedW = d.ownedW;
    if (d.itemsChk) fr.itemsChk = d.itemsChk; else if (d.items) delete fr.itemsChk;
    save(); routes.share();
    toast(`${d.name} のデータを読み込みました`, { label: "元に戻す", run: () => { state.friends = before; save(); render(); } });
  };
  $("#rd").onclick = () => readFriend($("#in").value);
  view.querySelectorAll("[data-preset-fr]").forEach((b) => (b.onclick = () => readFriend(D.presets[+b.dataset.presetFr].text, true)));
};

function friendPage(i, kind, j) {
  const fr = state.friends[i];
  if (!fr) return go("share");
  // materials are judged by the friend's own progress when they sent it
  const hv = fr.cleared ? obtainable(D, D.sources, fr.cleared) : have;
  const who = fr.cleared ? fr.name : "自分";
  if (kind === "set" && fr.sets?.[j]) {
    setView(fr.sets[j], new Set(fr.owned || []), `<div class="row" style="margin-top:12px"><button id="cp">自分のマイセットにコピー</button></div>`, false, hv, who);
    setTitle(`${fr.name}: ${fr.sets[j].name}`);
    view.querySelector("#cp").onclick = () => { state.sets.push(structuredClone(fr.sets[j])); save(); toast("自分のマイセットにコピーしました", { label: "見る", run: () => go(`sim/sets/${state.sets.length - 1}`) }); };
    return;
  }
  setTitle(fr.name);
  const mine = new Set(state.cleared);
  const ahead = (fr.cleared || []).filter((q) => !mine.has(q)).length;
  const wName = (k) => k.split("/").slice(1).join("/");
  view.innerHTML = `
    <div class="row" ><button class="primary" id="viewas">${esc(fr.name)} のデータで全部のタブを見る</button><a class="btn" href="#share/compare">比べる ›</a></div>
    <div class="row" style="margin-top:12px"><button id="mine">自分のデータにする</button><button class="danger" id="del">${esc(fr.name)} のデータを削除</button></div>
    <p class="muted">「自分のデータにする」は、本人の端末で使うためのものです。今の自分のデータは「データ編集」に名前を付けて残してから置き換えます。</p>
    ${fr.cleared ? `<div class="card">進行チェック ${fmt(fr.cleared.length)}件 <span class="muted">（自分がまだのクエスト ${ahead}件 / ${esc(fr.at.cleared)}）</span>
      <br><span class="muted">${esc(fr.name)} のマイセットの「手に入る素材」は ${esc(fr.name)} の進行で判定します。</span></div>` : ""}
    <div class="row"><a class="btn primary" href="#advice/${i}">${esc(fr.name)} のデータでおすすめを見る ›</a></div>
    ${fr.sets ? `<h2>マイセット（${fr.sets.length}）</h2><ul class="list">${fr.sets.map((s, k) => `<li><a href="#share/${i}/set/${k}"><span class="grow">${esc(s.name)}
      <span class="ruby">${s.weapon ? `${esc(s.weapon)} / ` : ""}${s.pieces.map((p) => esc(p || "装備なし")).join(" / ")}${s.charm?.name ? ` / ${esc(s.charm.name)}` : ""}</span></span>›</a></li>`).join("")}</ul>` : ""}
    ${fr.itemSets ? `<h2>アイテムのマイセット（${fr.itemSets.length}）</h2>${fr.itemSets.map((st) => `<details class="card"><summary>${esc(st.name)}</summary>
      <ul class="list">${st.items.map(([n, c]) => `<li class="item"><span class="grow">${esc(n)}</span><span>${c}</span></li>`).join("")}</ul></details>`).join("")}` : ""}
    ${fr.dl ? `<h2>持っている配信クエスト（${fr.dl.length}）</h2><p class="muted">入れていないもの: ${esc(dlGroups().flatMap(([, qs]) => qs).filter((q) => !fr.dl.includes(q.id)).map((q) => q.name).join("、") || "なし")}</p>` : ""}
    ${fr.charms ? `<h2>護石（${fr.charms.length}）</h2><ul class="list">${fr.charms.map((c) => `<li class="item"><span class="grow">${Object.entries(c.skills).map(([t, v]) => `${esc(t)}${v > 0 ? "+" : ""}${v}`).join(" / ") || "スキルなし"}</span>
      <span class="muted">スロット${"◯".repeat(c.slots)}${"―".repeat(3 - c.slots)}</span></li>`).join("")}</ul>` : ""}
    ${fr.items && Object.keys(fr.items).length ? `<h2>アイテム所持数（${Object.keys(fr.items).length}）</h2>${fr.itemsChk ? `<p class="muted"><span class="pill hi">要確認</span> ${esc(fr.itemsChk)}</p>` : ""}
      <details class="card"><summary>一覧を開く</summary><ul class="list">${Object.entries(fr.items).map(([id, n]) => `<li class="item"><span class="grow">${esc(itemName(id))}</span><span>${n}</span></li>`).join("")}</ul></details>` : ""}
    ${fr.owned ? `<h2>作成済みの防具（${fr.owned.length}）</h2><div class="chips">${fr.owned.map((n) => `<a class="chip" href="#find/armor/${encodeURIComponent(n)}">${esc(n)}</a>`).join("")}</div>` : ""}
    ${fr.ownedW && Object.keys(fr.ownedW).length ? `<h2>持っている武器</h2><div class="chips">${Object.entries(fr.ownedW).map(([k, lv]) => `<span class="chip">${esc(wName(k))} LV${lv}</span>`).join("")}</div>` : ""}`;
  view.querySelector("#viewas").onclick = () => enterView(i);
  view.querySelector("#mine").onclick = () => adoptFriend(i);
  view.querySelector("#del").onclick = () => {
    const removed = state.friends.splice(i, 1)[0];
    save(); go("share");
    toast("削除しました", { label: "元に戻す", run: () => { state.friends.splice(i, 0, removed); save(); render(); } });
  };
}

// Replace own data with friend i's (own data is kept in the データ編集 file list first).
function adoptFriend(i) {
  const fr = state.friends[i];
  if (!fr || !confirm(`${fr.name} のデータで自分のデータを置き換えますか？今の自分のデータは「データ編集」の保存一覧に残します。`)) return;
  {
    const before = structuredClone(state);
    const keep = ["charms", "owned", "ownedW", "items", "itemSets", "dl", "sets", "cleared"];
    state.files.push({ name: `置き換え前 ${new Date().toLocaleString("ja-JP")}`, at: new Date().toLocaleString("ja-JP"), data: structuredClone(Object.fromEntries(keep.map((k) => [k, state[k]]))) });
    for (const k of keep) if (fr[k]) state[k] = structuredClone(fr[k]);
    draft = null; dirty = false; save(); refreshHave(); go("edit");
    toast("置き換えました", { label: "元に戻す", run: () => { state = before; save(); refreshHave(); render(); } });
  }
}

// ---------------------------------------------------------------- おすすめ（クエストの準備・開発目標）
// #advice = own data, #advice/<friend index> = a friend's data. Quest and weapon type are kept in prefs.advice.

const wLink = (w, lv) => `<a href="#find/weapon/${w.id}/${encodeURIComponent(w.name)}">${esc(w.name)}${lv ? ` LV${lv}` : ""}</a>${w.levels.find((l) => l.lv === lv)?.elem ? ` <span class="muted">${esc(w.levels.find((l) => l.lv === lv).elem.join(""))}</span>` : ""}`;
// おすすめのアイテムポーチ: 3 pages x 8 items and 8 ammo / coatings, filled to the pouch limits
function pouchHtml(q, a) {
  const wt = a.weaponType;
  const gun = a.owned[0]?.l || null;
  const P = recommendPouch(D, q, wt, gun, D.notes?.mons || {});
  const cell = ([n, c, why]) => `<div class="pcell" title="${esc(why)}">${n ? `<b>${esc(n)}</b><span>×${c}</span><small>${esc(why)}</small>` : `<small>${esc(why)}</small>`}</div>`;
  const page = (k) => `<div class="ppage"><div class="muted">${k + 1}ページ目</div><div class="pgrid">${P.items.slice(k * 8, k * 8 + 8).map(cell).join("")}</div></div>`;
  return `<h2>おすすめのアイテムポーチ（${esc(wt)}）</h2>
    <p class="muted">アイテム24枠と弾・ビン8枠を、持てる最大の数で全部埋めた例です。マップや相手に合わせて入れ替えています（効かないアイテムは別のものに）。${GUN_TYPES.has(wt) && wt !== "弓" ? (gun ? `弾は${esc(a.owned[0].w.name)}で撃てるものから選んでいます。` : "持っているボウガンが登録されていないので、よく使う弾を並べています。") : ""}</p>
    ${[0, 1, 2].map(page).join("")}
    <div class="ppage"><div class="muted">${wt === "弓" ? "ビン" : "弾"}</div><div class="pgrid">${P.ammo.map(cell).join("")}</div></div>`;
}
const GUN_TYPES = new Set(["ライトボウガン", "ヘビィボウガン", "弓"]);
function adviceHtml(a, q, fi) {
  const top = Math.max(1, ...a.owned.map((o) => o.s), ...a.targets.map((t) => t.s));
  const bar = (v) => `<span class="muted">（めやす ${Math.round((v / top) * 100)}）</span>`;
  const setHref = (i) => (fi === undefined ? `#sim/sets/${i}` : `#share/${fi}/set/${i}`);
  const qa = (x) => `<li><a href="#find/quest/${x.id}"><span class="grow">${esc(x.name)} <span class="muted">${esc(t(x.tab))}</span></span>›</a></li>`;
  if (fixedGearQ(q)) return `<div class="card"><a href="#find/quest/${q.id}"><b>${esc(q.name)}</b></a> <span class="muted">${esc(t(q.vendor))} / ${esc(q.map)}</span>
      <p class="muted">このクエストは武器ごとに装備とアイテムが決まっているので、装備・アイテムポーチのおすすめはありません。</p></div>${arenaHtml(q)}`;
  return `<div class="card"><a href="#find/quest/${q.id}"><b>${esc(q.name)}</b></a> <span class="muted">${esc(t(q.vendor))} ${esc(t(q.tab))} / ${esc(q.map)}</span>
      <div class="muted">${esc(q.goal)}</div>
      ${a.mons.map((m) => { const w = weakness(m); return `<div>${weakName(m.name, w)} <span class="muted">${ELEMENTS.map((e, i) => `${e}${mark(w[i])}`).join(" ")}</span></div>`; }).join("")}</div>
    <h2>持っている武器（強い順）</h2>
    ${a.owned.length ? `<ul class="list">${a.owned.map((o) => `<li class="item"><span class="grow">${wLink(o.w, o.l.lv)}</span>${bar(o.s)}</li>`).join("")}</ul>`
      : `<p class="muted">この武器種の武器が登録されていません（<a href="#edit">データ編集</a>の「持っている武器」）。</p>`}
    <h2>装備のマイセット</h2>
    ${a.sets.length ? `<ul class="list">${a.sets.map((x) => `<li><a href="${setHref(x.i)}"><span class="grow">${esc(x.set.name)} <span class="ruby">${esc(x.set.weapon)}</span></span>${bar(x.s)}›</a></li>`).join("")}</ul>`
      : `<p class="muted">この武器種の武器が入ったマイセットがありません。<a href="#sim">シミュ</a>で組んでみてください。</p>`}
    <h2>アイテムのマイセット</h2>
    <p class="muted">このクエストで要るもの: ${a.needs.map((n) => `${esc(n.any.join(" か "))}（${esc(n.why)}）`).join("、") || "とくになし"}</p>
    ${a.items.length ? `<ul class="list">${a.items.map((x, k) => `<li class="item"><span class="grow">${k === 0 ? "◎ " : ""}${esc(x.set.name)}
      <span class="ruby">${x.lacks.length ? `足りない: ${esc(x.lacks.map((n) => n.any[0]).join("、"))}` : "そろっています"}</span></span></li>`).join("")}</ul>`
      : `<p class="muted">アイテムのマイセットが登録されていません（<a href="#edit">データ編集</a>）。</p>`}
    ${pouchHtml(q, a)}
    <h2>開発目標（今の進行で作れる・強化できる武器）</h2>
    ${a.targets.length ? `<ul class="list">${a.targets.map((t) => `<li class="item"><span class="grow">${wLink(t.w, t.l.lv)}</span>${bar(t.s)}</li>`).join("")}</ul>
      <p class="muted">武器名を押すと、強化の道すじと必要な素材が見られます。</p>`
      : `<p class="muted">持っている武器より強いものは、今の進行では作れません。進行を進めるか、別の武器種も見てみてください。</p>`}
    <h2>防具の開発目標（今の進行で作れる・まだ作っていない）</h2>
    ${a.armor.some((x) => x.list.length) ? `<ul class="list">${a.armor.filter((x) => x.list.length).map((x) => `<li class="item"><span class="grow"><b>${PARTS[x.part]}</b> ${x.list.map((p) => `<a href="#find/armor/${encodeURIComponent(p.name)}">${esc(p.name)}</a> <span class="muted">防御${p.def[1]}${p.slots ? ` ${"◯".repeat(p.slots)}` : ""}</span>`).join("、")}</span>
      <span class="muted">今${x.best || "-"}</span></li>`).join("")}</ul><p class="muted">防御は最大強化のとき。「今」は作った防具のうち、その部位でいちばん高い防御です。スキルで選ぶときはシミュを使ってください。</p>`
      : `<p class="muted">今の進行で作れて、作った防具より防御が高いものはありません。</p>`}
    ${a.dlOpen.length ? `<h2>同じモンスターの配信クエスト（入れてある・まだクリアしていない）</h2><ul class="list">${a.dlOpen.map(qa).join("")}</ul>` : ""}
    ${a.dlMissing.length ? `<h2>同じモンスターの配信クエスト（まだ入れていない）</h2><ul class="list">${a.dlMissing.map(qa).join("")}</ul>` : ""}
    <p class="muted">「めやす」は武器ランキングと同じ計算で、いちばん強いものを100とした比べ方です（スキルや会心は入れていません）。</p>`;
}
routes.advice = (fi) => {
  const fr = fi === undefined ? null : state.friends[+fi];
  if (fi !== undefined && !fr) return go("advice");
  const who = fr || state;
  setTitle(`おすすめ（${fr ? fr.name : "自分"}）`);
  const p = (state.prefs.advice ||= {});
  const types = [...new Set(D.weapons.map((w) => w.type))];
  if (!types.includes(p.type)) p.type = "片手剣";
  const q = D.questById[p.qid];
  view.innerHTML = `<div class="card">
      <div class="row"><label>だれのデータ <select id="who"><option value="">自分</option>${state.friends.map((f, i) => `<option value="${i}" ${f === fr ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>
        <label>武器種 <select id="ty">${types.map((t) => `<option ${t === p.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <input type="search" id="qq" placeholder="クエスト名で探す（ひらがな可）" style="width:100%;margin-top:6px">
      <ul class="list" id="qs"></ul>
      ${!(who.cleared || []).length ? `<p class="muted">進行チェックが空なので、「作れる武器」は最初から作れるものだけで判定しています。</p>` : ""}</div>
    <div id="res">${q ? "" : `<p class="muted">クエストを選んでください。</p>`}</div>`;
  const $ = (x) => view.querySelector(x);
  if (q) {
    const hv = fr ? obtainable(D, D.sources, fr.cleared || []) : have;
    $("#res").innerHTML = adviceHtml(adviseQuest(D, q, p.type, who, reachableLevels(D.weapons, hv), hv, fr ? 3 : state.prefs.gender), q, fi === undefined ? undefined : +fi);
  }
  $("#who").onchange = (e) => go(e.target.value === "" ? "advice" : `advice/${e.target.value}`);
  $("#ty").onchange = (e) => { p.type = e.target.value; save(); render(); };
  $("#qq").oninput = (e) => {
    const t = e.target.value.trim();
    $("#qs").innerHTML = t ? D.quests.filter((x) => x.vendor !== "訓練" && match(t, x.name, D.readings)).slice(0, 20)
      .map((x) => `<li><a href="#" data-q="${x.id}"><span class="grow">${esc(x.name)} <span class="muted">${esc(t(x.vendor))} ${esc(t(x.tab))}</span></span>›</a></li>`).join("") : "";
    $("#qs").querySelectorAll("[data-q]").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); p.qid = a.dataset.q; save(); render(); }));
  };
};

// ---------------------------------------------------------------- データ編集
// Edits a draft of charms / gear / item counts. 上書き保存 writes it to the live data (and to the
// open named file); 名前を付けて保存 keeps a named copy in state.files.

const EDIT_KEYS = ["charms", "owned", "ownedW", "items", "itemSets", "dl", "sets"];
let draft = null, dirty = false, itemSetOpen = -1, setOpen = -1;
const EDIT_TABS = [["charms", "護石"], ["owned", "防具"], ["weapons", "武器"], ["items", "アイテム"], ["sets", "装備のマイセット"], ["itemSets", "アイテムのマイセット"], ["dl", "配信クエスト"]];
// Text formats of the data editor tabs: to(draft) -> text, from(lines, bad) -> value (bad collects unread lines).
const EDIT_TEXT = {
  owned: { key: "owned", help: "1行に1つ、防具の名前。",
    to: (d) => d.owned.join("\n"),
    from: (ls, bad) => [...new Set(ls.filter((l) => (D.armor.some((a) => a.name === l) ? true : (bad.push(l), false))))] },
  weapons: { key: "ownedW", help: "1行に1つ、「武器の名前 レベル」（例：鉄刀 3）。レベルを省くと最後のレベル。",
    to: (d) => Object.entries(d.ownedW).map(([k, lv]) => `${k.split("/").slice(1).join("/")} ${lv}`).join("\n"),
    from: (ls, bad) => { const o = {}; for (const l of ls) { const m = l.match(/^(.+?)(?:\s+(?:LV)?(\d+))?$/i); const w = m && D.weapons.find((x) => x.name === m[1].trim());
      if (!w) { bad.push(l); continue; } const lv = m[2] ? +m[2] : w.levels[w.levels.length - 1].lv; o[`${w.id}/${w.name}`] = w.levels.some((x) => x.lv === lv) ? lv : w.levels[w.levels.length - 1].lv; } return o; } },
  items: { key: "items", help: "1行に1つ、「アイテム名 個数」（例：回復薬 10）。",
    to: (d) => Object.entries(d.items).map(([id, n]) => `${itemName(id)} ${n}`).join("\n"),
    from: (ls, bad) => { const o = {}; for (const l of ls) { const m = l.match(/^(.+?)\s+[x×]?(\d+)$/); const id = m && Object.keys(D.items).find((k) => D.items[k] === m[1].trim());
      if (!id) { bad.push(l); continue; } o[id] = Math.min(9999, +m[2]); } return o; } },
  sets: { key: "sets", help: "1行に1セット、「名前 | 武器 | 頭 | 胴 | 腕 | 腰 | 脚 | 護石の種類 | 護石のスロット数」。部位を外しているときは空のまま。",
    to: (d) => d.sets.map((st) => [st.name, st.weapon || "", ...st.pieces.map((x) => x || ""), st.charm?.name || "", st.charm?.slots | 0].join(" | ")).join("\n"),
    from: (ls, bad) => ls.map((l) => { const f = l.split("|").map((x) => x.trim()); if (f.length < 7) { bad.push(l); return null; }
      const old = draft.sets.find((x) => x.name === f[0]);
      return { ...(old || { decos: [], torsoUps: 0 }), name: f[0].slice(0, 20) || "セット", weapon: f[1], pieces: f.slice(2, 7), charm: { ...(old?.charm || { skills: {} }), name: f[7] || "", slots: Math.max(0, Math.min(3, +f[8] || 0)) } }; }).filter(Boolean) },
  itemSets: { key: "itemSets", help: "1行に1セット、「セット名: アイテム×個数, アイテム×個数, …」（32個まで）。",
    to: (d) => d.itemSets.map((st) => `${st.name}: ${st.items.map(([n, c]) => `${n}×${c}`).join(", ")}`).join("\n"),
    from: (ls, bad) => ls.map((l) => { const m = l.match(/^(.+?)[:：](.*)$/); if (!m) { bad.push(l); return null; }
      return { name: m[1].trim().slice(0, 20) || "セット", items: m[2].split(/[,、]/).map((x) => x.trim()).filter(Boolean).slice(0, 32).map((x) => { const k = x.match(/^(.+?)\s*[x×]\s*(\d+)$/); return k ? [k[1].trim().slice(0, 20), Math.min(99, +k[2])] : [x.slice(0, 20), 1]; }) }; }).filter(Boolean) },
  dl: { key: "dl", help: "1行に1つ、持っている配信クエストの名前。",
    to: (d) => dlGroups().flatMap(([, qs]) => qs).filter((q) => d.dl.includes(q.id)).map((q) => q.name).join("\n"),
    from: (ls, bad) => { const all = dlGroups().flatMap(([, qs]) => qs); return [...new Set(ls.map((l) => { const q = all.find((x) => x.name === l); if (!q) bad.push(l); return q?.id; }).filter(Boolean))]; } },
};
// event quests (hunter, 集会所) grouped by their counter tab, in the game's order
const dlGroups = () => {
  const g = new Map();
  for (const q of D.quests) if (q.badge === "ＤＬ" && q.vendor === "集会所") { if (!g.has(q.tab)) g.set(q.tab, []); g.get(q.tab).push(q); }
  return [...g];
};
const snapshot = () => structuredClone(Object.fromEntries(EDIT_KEYS.map((k) => [k, state[k]])));
function writeDraft(name) {
  const before = structuredClone(state);
  if (JSON.stringify(state.charms) !== JSON.stringify(draft.charms) && typeof state.prefs.pinnedCharm === "number") delete state.prefs.pinnedCharm; // indexes may shift
  Object.assign(state, structuredClone(draft));
  if (name) {
    const f = { name, at: new Date().toLocaleString("ja-JP"), data: structuredClone(draft) };
    const i = state.files.findIndex((x) => x.name === name);
    if (i >= 0) state.files[i] = f; else state.files.push(f);
    state.prefs.fileName = name;
    markBackedUp();
  }
  dirty = false; save(); refreshHave();
  return before;
}

routes.edit = () => {
  setTitle("データ編集");
  if (!dirty || !draft) draft = snapshot(); // pick up changes made in other tabs
  const cur = state.prefs.fileName || "";
  const wByKey = Object.fromEntries(D.weapons.map((w) => [`${w.id}/${w.name}`, w]));
  const lists = `<datalist id="dl-armor">${[...new Set(D.armor.map((a) => a.name))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    <datalist id="dl-weapon">${D.weapons.map((w) => `<option value="${esc(w.name)}">`).join("")}</datalist>
    ${PARTS.map((_, i) => `<datalist id="dl-part${i}">${[...new Set(D.armor.filter((a) => a.part === i).map((a) => a.name))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`).join("")}
    <datalist id="dl-item">${Object.values(D.items).map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
  const tab = EDIT_TABS.some(([k]) => k === state.prefs.editTab) ? state.prefs.editTab : "charms";
  const counts = { charms: draft.charms.length, owned: draft.owned.length, weapons: Object.keys(draft.ownedW).length, items: Object.keys(draft.items).length, sets: draft.sets.length, itemSets: draft.itemSets.length, dl: draft.dl.length };
  // one section at a time; the draft keeps edits made in the other tabs
  const sec = {
    charms: () => `
    ${treeSortSelect()}
    <div class="table-wrap"><table><tr><th>スキル1</th><th>pt</th><th>スキル2</th><th>pt</th><th>スロット</th><th></th></tr>
      ${draft.charms.map((c, i) => { const sk = Object.entries(c.skills); return `<tr data-ci="${i}" ${c.chk ? `class="hi" title="要確認: ${esc(c.chk)}"` : ""}>
        ${[0, 1].map((k) => `<td><select data-f="t${k}" aria-label="スキル${k + 1}">${treeOptions(sk[k]?.[0])}</select></td><td><input data-f="v${k}" type="number" inputmode="numeric" min="-10" max="20" value="${sk[k]?.[1] ?? ""}" style="width:4.5em" aria-label="ポイント${k + 1}"></td>`).join("")}
        <td><select data-f="slots" aria-label="スロット">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${n === c.slots ? "selected" : ""}>${n}</option>`).join("")}</select></td>
        <td><button class="mini danger" data-cdel="${i}" aria-label="この護石を消す">×</button></td></tr>`; }).join("")}</table></div>
    <div class="row"><button id="cadd">護石の行を足す</button></div>
    <details class="card"><summary>テキストでまとめて編集（ほかのスキルシミュと同じ形）</summary>
      <p class="muted">1行に1個、「,スロット,スキル,pt,スキル,pt」の形です。ほかのスキルシミュのお守りの書き出しをそのまま貼り付けられます。この欄の内容で護石を全部入れ替えます（保存するまでは「変更を捨てる」で戻せます）。</p>
      <textarea id="ctext" rows="10" style="width:100%">${esc(charmsToCsv(draft.charms))}</textarea>
      <div class="row"><button class="primary" id="ctextset">この内容にする</button><button id="ctextcopy">コピー</button></div>
    </details>`,
    owned: () => `
    <div class="chips">${draft.owned.map((n, i) => `<button class="chip" data-odel="${i}">${esc(n)} ×</button>`).join("") || `<span class="muted">まだありません</span>`}</div>
    <div class="row" style="margin-top:6px"><input class="grow" id="oadd" list="dl-armor" placeholder="防具の名前を入れて追加"><button id="oaddb">追加</button></div>`,
    weapons: () => `
    <ul class="list">${Object.entries(draft.ownedW).map(([k, lv]) => { const w = wByKey[k]; return `<li class="item"><span class="grow">${esc(w?.name || k.split("/").slice(1).join("/"))}</span>
      <select data-wlv="${esc(k)}" aria-label="レベル">${(w?.levels || [{ lv }]).map((l) => `<option value="${l.lv}" ${l.lv === lv ? "selected" : ""}>LV${l.lv}</option>`).join("")}</select>
      <button class="mini danger" data-wdel="${esc(k)}" aria-label="消す">×</button></li>`; }).join("") || `<li class="muted">まだありません</li>`}</ul>
    <div class="row" style="margin-top:6px"><input class="grow" id="wadd" list="dl-weapon" placeholder="武器の名前を入れて追加"><button id="waddb">追加</button></div>`,
    items: () => `
    <p class="muted">入れておくと、マイセットの「必要な素材」で残りの数が出ます。</p>
    <ul class="list">${Object.entries(draft.items).map(([id, n]) => `<li class="item"><span class="grow">${esc(itemName(id))}</span>
      <input type="number" inputmode="numeric" min="0" max="9999" value="${n}" data-icnt="${id}" style="width:6em" aria-label="${esc(itemName(id))}の数">
      <button class="mini danger" data-idel="${id}" aria-label="消す">×</button></li>`).join("") || `<li class="muted">まだありません</li>`}</ul>
    <div class="row" style="margin-top:6px"><input class="grow" id="iadd" list="dl-item" placeholder="アイテム名を入れて追加"><button id="iaddb">追加</button></div>`,
    sets: () => `
    <p class="muted">ゲームの「装備のマイセット」を写すところです。部位を外しているときは空のままにしてください。護石は種類とスロット数だけでかまいません（スキルが分かれば護石の欄に入れてください）。</p>
    ${draft.sets.map((st, i) => `<details class="card" ${i === setOpen ? "open" : ""} data-eso="${i}"><summary>${esc(st.name)} <span class="muted">${esc(st.weapon || "")}</span></summary>
      <label>名前 <input data-es="${i}/name" value="${esc(st.name)}" maxlength="20"></label>
      <label>武器 <input data-es="${i}/weapon" list="dl-weapon" value="${esc(st.weapon || "")}"></label>
      ${PARTS.map((pn, k) => `<label>${pn} <input data-es="${i}/p${k}" list="dl-part${k}" value="${esc(st.pieces[k] || "")}"></label>`).join("")}
      <label>護石 <input data-es="${i}/charm" value="${esc(st.charm?.name || "")}" placeholder="例: 天の護石" maxlength="20"></label>
      <label>スロット <select data-es="${i}/slots">${[0, 1, 2, 3].map((n) => `<option ${n === (st.charm?.slots | 0) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="row"><button class="mini danger" data-esdel="${i}">このセットを消す</button></div></details>`).join("")}
    <div class="row"><button id="esnew">装備のマイセットを足す</button></div>`,
    itemSets: () => `
    <p class="muted">ゲームの「アイテムのマイセット」と同じ並びで入れてください（1セット32行まで）。おすすめで、クエストに合うセットを選ぶのに使います。</p>
    ${draft.itemSets.map((st, i) => `<details class="card" ${i === itemSetOpen ? "open" : ""} data-iso="${i}"><summary>${esc(st.name)} <span class="muted">${st.items.length}行</span></summary>
      <div class="row"><input class="grow" data-isn="${i}" value="${esc(st.name)}" maxlength="20" aria-label="セット名"><button class="mini danger" data-isdel="${i}">このセットを消す</button></div>
      <ul class="list">${st.items.map(([n, c], k) => `<li class="item"><input class="grow" list="dl-item" data-isi="${i}/${k}" value="${esc(n)}" maxlength="20" aria-label="アイテム名">
        <input type="number" inputmode="numeric" min="0" max="99" value="${c}" data-isc="${i}/${k}" style="width:4.5em" aria-label="数">
        <button class="mini danger" data-isx="${i}/${k}" aria-label="この行を消す">×</button></li>`).join("")}</ul>
      ${st.items.length < 32 ? `<div class="row"><button data-isadd="${i}">行を足す</button></div>` : ""}</details>`).join("")}
    <div class="row">${draft.itemSets.length < 40 ? `<button id="isnew">アイテムのマイセットを足す</button>` : ""}</div>`,
    dl: () => `
    <p class="muted">クエストカウンターの「イベントクエスト」に出ているものに印を付けてください。おすすめで、入れていない配信クエストを教えるのに使います。</p>
    <details class="card"><summary>一覧を開く</summary>
      <div class="row"><button id="dlall">全部つける</button><button id="dlnone">全部外す</button></div>
      ${dlGroups().map(([tab, qs]) => `<h3>${esc(tab)}</h3>${qs.map((q) => `<label class="check"><input type="checkbox" data-dl="${q.id}" ${draft.dl.includes(q.id) ? "checked" : ""}>${esc(q.name)}</label>`).join("")}`).join("")}
    </details>`,
  };
  view.innerHTML = `${lists}
    <div class="card">
      <div>開いているデータ: <b>${esc(cur || "名前なし")}</b> ${dirty ? `<span class="pill hi">保存していない変更あり</span>` : ""}</div>
      <div class="row" style="margin-top:6px"><button class="primary" id="fsave" ${dirty ? "" : "disabled"}>上書き保存</button><button id="fsaveas">名前を付けて保存</button>
        ${dirty ? `<button id="fundo">変更を捨てる</button>` : ""}</div>
      <p class="muted">ここで変えた内容は、保存するまで護石タブやシミュには反映されません。</p>
      ${state.files.length ? `<details><summary>保存したデータを開く（${state.files.length}）</summary><ul class="list">${state.files.map((f, i) => `<li class="item">
        <span class="grow">${esc(f.name)} <span class="ruby">${esc(f.at)} / 護石${f.data.charms.length} 防具${f.data.owned.length} アイテム${Object.keys(f.data.items || {}).length}</span></span>
        <button class="mini" data-fopen="${i}">開く</button><button class="mini danger" data-fdel="${i}">削除</button></li>`).join("")}</ul></details>` : ""}
    </div>
    <div class="chips" role="tablist">${EDIT_TABS.map(([k, l]) => `<button class="chip ${k === tab ? "on" : ""}" role="tab" aria-selected="${k === tab}" data-etab="${k}">${l}（${counts[k]}）</button>`).join("")}</div>
    ${sec[tab]()}
    ${EDIT_TEXT[tab] ? `<details class="card"><summary>テキストでまとめて編集</summary>
      <p class="muted">${EDIT_TEXT[tab].help}　この欄の内容で全部を入れ替えます（保存するまでは「変更を捨てる」で戻せます）。</p>
      <textarea id="etext" rows="12" style="width:100%">${esc(EDIT_TEXT[tab].to(draft))}</textarea>
      <div class="row"><button class="primary" id="etextset">この内容にする</button><button id="etextcopy">コピー</button></div></details>` : ""}`;
  const $ = (x) => view.querySelector(x);
  const changed = (redraw = true) => {
    dirty = true;
    if (redraw) return routes.edit();
    $("#fsave").disabled = false;
  };
  // charm rows: read the whole row back on any change
  view.querySelectorAll("tr[data-ci]").forEach((tr) => (tr.onchange = () => {
    const f = (k) => tr.querySelector(`[data-f="${k}"]`).value;
    const skills = {};
    for (const k of [0, 1]) { const t = f(`t${k}`), v = parseInt(f(`v${k}`), 10); if (t && v) skills[t] = (skills[t] || 0) + v; }
    draft.charms[+tr.dataset.ci] = { skills, slots: +f("slots") };
    changed(false);
  }));
  view.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = () => { draft.charms.splice(+b.dataset.cdel, 1); changed(); }));
  ($("#cadd") || {}).onclick = () => { draft.charms.push({ skills: {}, slots: 0 }); changed(); };
  bindTreeSort(() => routes.edit());
  ($("#etextset") || {}).onclick = () => {
    const T = EDIT_TEXT[tab], bad = [];
    const val = T.from($("#etext").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), bad);
    if (bad.length && !confirm(`読めない行が${bad.length}件あります（${bad.slice(0, 3).join("、")}${bad.length > 3 ? "…" : ""}）。その行を飛ばして入れ替えますか？`)) return;
    draft[T.key] = val; changed();
    toast("入れ替えました（まだ保存していません）");
  };
  ($("#etextcopy") || {}).onclick = async () => { try { await navigator.clipboard.writeText($("#etext").value); toast("コピーしました"); } catch { $("#etext").select(); toast("長押しでコピーしてください"); } };
  view.querySelectorAll("[data-etab]").forEach((b) => (b.onclick = () => { state.prefs.editTab = b.dataset.etab; save(); routes.edit(); }));
  ($("#ctextset") || {}).onclick = () => {
    const { charms, bad } = parseCharms($("#ctext").value, D.skills.map((t) => t.name));
    if (bad && !confirm(`読めない行が${bad}件あります。その行を飛ばして入れ替えますか？`)) return;
    // keep the 要確認 note on charms that did not change
    const old = [...draft.charms];
    for (const c of charms) {
      const i = old.findIndex((o) => o && o.slots === c.slots && JSON.stringify(Object.entries(o.skills).sort()) === JSON.stringify(Object.entries(c.skills).sort()));
      if (i >= 0) { if (old[i].chk) c.chk = old[i].chk; old[i] = null; }
    }
    draft.charms = charms; changed();
    toast(`護石を${charms.length}個にしました（まだ保存していません）`);
  };
  ($("#ctextcopy") || {}).onclick = async () => {
    try { await navigator.clipboard.writeText($("#ctext").value); toast("コピーしました"); }
    catch { $("#ctext").select(); toast("コピーできなかったので、欄を選びました。長押しでコピーしてください。"); }
  };

  view.querySelectorAll("[data-odel]").forEach((b) => (b.onclick = () => { draft.owned.splice(+b.dataset.odel, 1); changed(); }));
  ($("#oaddb") || {}).onclick = () => {
    const n = $("#oadd").value.trim();
    if (!D.armor.some((a) => a.name === n)) return toast("その名前の防具が見つかりません。候補から選んでください。");
    if (!draft.owned.includes(n)) draft.owned.push(n);
    changed();
  };
  view.querySelectorAll("[data-wlv]").forEach((s) => (s.onchange = () => { draft.ownedW[s.dataset.wlv] = +s.value; changed(false); }));
  view.querySelectorAll("[data-wdel]").forEach((b) => (b.onclick = () => { delete draft.ownedW[b.dataset.wdel]; changed(); }));
  ($("#waddb") || {}).onclick = () => {
    const w = D.weapons.find((x) => x.name === $("#wadd").value.trim());
    if (!w) return toast("その名前の武器が見つかりません。候補から選んでください。");
    draft.ownedW[`${w.id}/${w.name}`] ??= w.levels[w.levels.length - 1].lv;
    changed();
  };
  view.querySelectorAll("[data-icnt]").forEach((inp) => (inp.onchange = () => { draft.items[inp.dataset.icnt] = Math.max(0, Math.min(9999, parseInt(inp.value, 10) || 0)); changed(false); }));
  view.querySelectorAll("[data-idel]").forEach((b) => (b.onclick = () => { delete draft.items[b.dataset.idel]; changed(); }));
  ($("#iaddb") || {}).onclick = () => {
    const n = $("#iadd").value.trim();
    const id = Object.keys(D.items).find((k) => D.items[k] === n);
    if (!id) return toast("そのアイテムが見つかりません。候補から選んでください。");
    draft.items[id] ??= 1;
    changed();
  };
  // equipment mysets: unknown names are kept as typed but flagged, so a typo is visible
  view.querySelectorAll("details[data-eso]").forEach((d) => (d.ontoggle = () => { if (d.open) setOpen = +d.dataset.eso; }));
  view.querySelectorAll("[data-es]").forEach((inp) => (inp.onchange = () => {
    const [i, key] = inp.dataset.es.split("/"), st = draft.sets[+i], v = inp.value.trim();
    st.charm ||= { skills: {}, slots: 0 };
    if (key === "name") st.name = v.slice(0, 20) || "セット";
    else if (key === "weapon") { st.weapon = v; if (v && !D.weapons.some((w) => w.name === v)) toast("その名前の武器がデータにありません。候補から選んでください。"); }
    else if (key === "charm") st.charm.name = v.slice(0, 20);
    else if (key === "slots") st.charm.slots = +v;
    else { const k = +key.slice(1); st.pieces[k] = v; if (v && !D.armor.some((a) => a.name === v && a.part === k)) toast(`その名前の${PARTS[k]}防具がデータにありません。候補から選んでください。`); }
    changed(false);
  }));
  view.querySelectorAll("[data-esdel]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.esdel;
    if (!confirm(`「${draft.sets[i].name}」を消しますか？（保存するまでは「変更を捨てる」で戻せます）`)) return;
    draft.sets.splice(i, 1); setOpen = -1; changed();
  }));
  ($("#esnew") || {}).onclick = () => { draft.sets.push({ name: `セット${draft.sets.length + 1}`, weapon: "", pieces: ["", "", "", "", ""], charm: { skills: {}, slots: 0 }, decos: [], torsoUps: 0 }); setOpen = draft.sets.length - 1; changed(); };
  // item mysets
  const isAt = (v) => v.split("/").map(Number);
  view.querySelectorAll("details[data-iso]").forEach((d) => (d.ontoggle = () => { if (d.open) itemSetOpen = +d.dataset.iso; }));
  view.querySelectorAll("[data-isn]").forEach((inp) => (inp.onchange = () => { draft.itemSets[+inp.dataset.isn].name = inp.value.trim().slice(0, 20) || "セット"; changed(false); }));
  view.querySelectorAll("[data-isi]").forEach((inp) => (inp.onchange = () => { const [i, k] = isAt(inp.dataset.isi); draft.itemSets[i].items[k][0] = inp.value.trim().slice(0, 20); changed(false); }));
  view.querySelectorAll("[data-isc]").forEach((inp) => (inp.onchange = () => { const [i, k] = isAt(inp.dataset.isc); draft.itemSets[i].items[k][1] = Math.max(0, Math.min(99, parseInt(inp.value, 10) || 0)); changed(false); }));
  view.querySelectorAll("[data-isx]").forEach((b) => (b.onclick = () => { const [i, k] = isAt(b.dataset.isx); draft.itemSets[i].items.splice(k, 1); itemSetOpen = i; changed(); }));
  view.querySelectorAll("[data-isadd]").forEach((b) => (b.onclick = () => { const i = +b.dataset.isadd; draft.itemSets[i].items.push(["", 1]); itemSetOpen = i; changed(); }));
  view.querySelectorAll("[data-isdel]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.isdel;
    if (!confirm(`「${draft.itemSets[i].name}」を消しますか？（保存するまでは「変更を捨てる」で戻せます）`)) return;
    draft.itemSets.splice(i, 1); itemSetOpen = -1; changed();
  }));
  $("#isnew")?.addEventListener("click", () => { draft.itemSets.push({ name: `セット${draft.itemSets.length + 1}`, items: [["", 1]] }); itemSetOpen = draft.itemSets.length - 1; changed(); });
  // downloaded event quests
  view.querySelectorAll("[data-dl]").forEach((c) => (c.onchange = () => {
    draft.dl = draft.dl.filter((x) => x !== c.dataset.dl);
    if (c.checked) draft.dl.push(c.dataset.dl);
    changed(false);
  }));
  ($("#dlall") || {}).onclick = () => { draft.dl = dlGroups().flatMap(([, qs]) => qs.map((q) => q.id)); changed(); };
  ($("#dlnone") || {}).onclick = () => { draft.dl = []; changed(); };
  // empty item names are dropped when saving
  const tidy = () => { for (const st of draft.itemSets) st.items = st.items.filter(([n]) => n); };
  const undoable = (msg, before) => toast(msg, { label: "元に戻す", run: () => { state = before; draft = null; dirty = false; save(); refreshHave(); render(); } });
  $("#fsave").onclick = () => { tidy(); const before = writeDraft(cur); routes.edit(); undoable(cur ? `「${cur}」に上書き保存しました` : "保存しました", before); };
  $("#fsaveas").onclick = () => {
    const name = prompt("保存する名前", cur || `データ${state.files.length + 1}`)?.trim().slice(0, 40);
    if (!name) return;
    if (state.files.some((f) => f.name === name) && !confirm(`「${name}」はもうあります。上書きしますか？`)) return;
    tidy(); const before = writeDraft(name); routes.edit(); undoable(`「${name}」として保存しました`, before);
  };
  $("#fundo")?.addEventListener("click", () => { draft = null; dirty = false; routes.edit(); });
  view.querySelectorAll("[data-fopen]").forEach((b) => (b.onclick = () => {
    const f = state.files[+b.dataset.fopen];
    if (dirty && !confirm("保存していない変更を捨てて開きますか？")) return;
    draft = structuredClone({ charms: [], owned: [], ownedW: {}, items: {}, itemSets: [], dl: [], sets: state.sets, ...f.data });
    const before = writeDraft(f.name); routes.edit(); undoable(`「${f.name}」を開きました`, before);
  }));
  view.querySelectorAll("[data-fdel]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.fdel, f = state.files[i];
    if (!confirm(`保存したデータ「${f.name}」を削除しますか？`)) return;
    state.files.splice(i, 1);
    if (state.prefs.fileName === f.name) state.prefs.fileName = "";
    save(); routes.edit();
    toast("削除しました", { label: "元に戻す", run: () => { state.files.splice(i, 0, f); save(); render(); } });
  }));
};

// ---------------------------------------------------------------- 友達のデータで見る・バックアップの案内・比べる

// Viewing a friend's data: every tab runs on a copy of it; save() keeps writing the real state (prefs are
// the same object) and drops data changes. Not kept across reloads, so the app always opens on own data.
const DATA_KEYS = ["cleared", "charms", "sets", "owned", "ownedW", "items", "itemSets", "dl"];
let viewAs = null, realState = null, viewSnap = "";
const dataOf = (s) => JSON.stringify(DATA_KEYS.map((k) => s[k]));
function enterView(i) {
  const fr = state.friends[i];
  if (!fr) return;
  realState = state; viewAs = i;
  state = { ...realState, cleared: [], charms: [], sets: [], owned: [], ownedW: {}, items: {}, itemSets: [], dl: [] };
  for (const k of DATA_KEYS) if (fr[k]) state[k] = structuredClone(fr[k]);
  viewSnap = dataOf(state); refreshHave();
  toast(`${fr.name} のデータで表示しています`);
  if (location.hash === "#progress") render(); else go("progress");
}
function exitView() {
  if (viewAs === null) return;
  state = realState; realState = null; viewAs = null; refreshHave(); render();
}

// Backup reminder: 7 days after the last backup, when the data changed since then.
const BACKUP_DAYS = 7;
function dataHash() { const t = dataOf(state); let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) | 0; return String(h); }
function markBackedUp() { if (viewAs !== null) return; state.prefs.bk = { at: Date.now(), hash: dataHash() }; save(); }
function backupDue() {
  const b = state.prefs.bk;
  if (!b) { state.prefs.bk = { at: Date.now(), hash: "" }; save(); return false; }
  const hasData = state.cleared.length || state.charms.length || state.sets.length || state.owned.length;
  return !!hasData && Date.now() - b.at > BACKUP_DAYS * 864e5 && Date.now() > (b.snooze || 0) && dataHash() !== b.hash;
}
// digits only (kanji in file names can break on some phones/PCs): 2611261658_CB = 2026-11-26 16:58, own name
const stampName = (d = new Date()) => { const z = (n) => String(n).padStart(2, "0"); return `${z(d.getFullYear() % 100)}${z(d.getMonth() + 1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}${state.prefs.myName ? `_${state.prefs.myName}` : ""}`; };
function saveFile(name) {
  const f = { name, at: new Date().toLocaleString("ja-JP"), data: structuredClone(Object.fromEntries([...EDIT_KEYS, "cleared"].map((k) => [k, state[k]]))) };
  const i = state.files.findIndex((x) => x.name === name);
  if (i >= 0) state.files[i] = f; else state.files.push(f);
  state.prefs.fileName = name; markBackedUp();
}
function exportAll() {
  downloadText(`karitomo-${ymd()}.json`, JSON.stringify({ app: "karitomo", ...state }, null, 1), "application/json");
  markBackedUp();
}
function drawBar() {
  const bar = document.getElementById("bar");
  if (!bar) return;
  if (OBS) { bar.hidden = true; return; }
  if (viewAs !== null) {
    bar.hidden = false;
    bar.innerHTML = `<span class="grow">いま <b>${esc(realState.friends[viewAs]?.name || "")}</b> のデータで表示中（変更は保存しません）</span>
      <button class="mini" id="bar-mine">自分のデータにする</button><button class="mini primary" id="bar-back">自分に戻す</button>`;
    bar.querySelector("#bar-back").onclick = () => exitView();
    bar.querySelector("#bar-mine").onclick = () => { const i = viewAs; exitView(); adoptFriend(i); };
    return;
  }
  if (!backupDue()) { bar.hidden = true; bar.innerHTML = ""; return; }
  const cur = state.prefs.fileName && state.files.some((f) => f.name === state.prefs.fileName) ? state.prefs.fileName : "";
  bar.hidden = false;
  bar.innerHTML = `<span class="grow">前のバックアップから${BACKUP_DAYS}日以上たって、データが変わっています。</span>
    <button class="mini primary" id="bk-new">「${esc(stampName())}」で保存</button>${cur ? `<button class="mini" id="bk-over">「${esc(cur)}」に上書き</button>` : ""}
    <button class="mini" id="bk-file">ファイルに書き出す</button><button class="mini" id="bk-later">あとで</button>
    <span class="muted" style="width:100%">保存はこの端末のブラウザの中です。キャッシュ削除や機種変更にそなえるなら、ファイルに書き出してください。</span>`;
  bar.querySelector("#bk-new").onclick = () => { const n = stampName(); saveFile(n); drawBar(); toast(`「${n}」として保存しました（データ編集で開けます）`); };
  bar.querySelector("#bk-over")?.addEventListener("click", () => { saveFile(cur); drawBar(); toast(`「${cur}」に上書きしました`); });
  bar.querySelector("#bk-file").onclick = () => { exportAll(); drawBar(); };
  bar.querySelector("#bk-later").onclick = () => { state.prefs.bk.snooze = Date.now() + 864e5; save(); drawBar(); };
}

// デバッグモード: guild card numbers side by side (only people whose data carries a card)
const WEAPON_TYPES = ["大剣", "太刀", "片手剣", "双剣", "ハンマー", "狩猟笛", "ランス", "ガンランス", "スラッシュアックス", "チャージアックス", "操虫棍", "ライトボウガン", "ヘビィボウガン", "弓", "ニャンター"];
function guildCardCompare(sel, head, no) {
  const cs = sel.map((x) => x.d.card || null);
  if (!cs.some(Boolean)) return `<p class="muted">（デバッグモード）ギルドカードのデータがある人がいません。</p>`;
  const row = (label, f) => `<tr><td>${esc(label)}</td>${cs.map((c) => `<td>${c ? f(c) ?? no : no}</td>`).join("")}</tr>`;
  const clearKeys = [...new Set(cs.flatMap((c) => Object.keys(c?.clears || {})))];
  const mons = [...new Set(cs.flatMap((c) => (c?.monsters || []).map((m) => m[0])))];
  const quests = [...new Set(cs.flatMap((c) => (c?.arena || []).map((a) => a[0])))];
  // crowns from data/crowns.json [base, small max, silver min, gold min]: 小金 = smallest crown, 銀 / 金 = big
  const crown = (n, v, big) => { const c = D.crowns?.[n]; if (!c || v == null) return "";
    return big ? (v >= c[3] ? `<span class="crown gold" title="金冠">金</span>` : v >= c[2] ? `<span class="crown silver" title="銀冠">銀</span>` : "")
      : (v <= c[1] ? `<span class="crown gold" title="最小金冠">小</span>` : ""); };
  const size = (m) => (m[1] == null ? "" : `<div class="muted">${crown(m[0], m[1], false)}${m[1]}〜${crown(m[0], m[2], true)}${m[2]}cm${m[4] ? "？" : ""}</div>`);
  const crowns = (c, kind) => (c.monsters || []).filter((m) => kind === "small" ? crown(m[0], m[1], false) : kind === "gold" ? /gold/.test(crown(m[0], m[2], true)) : /silver/.test(crown(m[0], m[2], true))).length;
  const top = (c) => { const w = c.weapons || []; const i = w.indexOf(Math.max(...w)); return i >= 0 && w[i] ? `${WEAPON_TYPES[i]}（${w[i]}回）` : null; };
  return `<details class="card" open><summary>ギルドカード（デバッグモード）</summary>
    <p class="muted">動画から読んだ数字です。サイズの「？」は画面が重なっていて読み違いがあるかもしれないもの。</p>
    <div class="table-wrap"><table>${head}
      ${row("称号", (c) => esc(c.title || "") || null)}${row("HR", (c) => c.hr || null)}
      ${clearKeys.map((k) => row(`クリア ${k}`, (c) => (c.clears?.[k] ?? null))).join("")}
      ${row("総プレイ時間", (c) => (c.play ? esc(c.play) : null))}${row("すれちがい", (c) => c.passes ?? null)}
      ${row("勲章 達成度", (c) => (c.medals ? `${c.medals.pct}%（${c.medals.count}個）` : null))}
      ${row("いちばん使った武器", top)}
      ${D.crowns ? `${row("金冠（大）", (c) => (c.monsters ? crowns(c, "gold") : null))}${row("銀冠（大）", (c) => (c.monsters ? crowns(c, "silver") : null))}${row("最小金冠", (c) => (c.monsters ? crowns(c, "small") : null))}` : ""}</table></div>
    <details class="card"><summary>武器使用回数（総合）</summary><div class="table-wrap"><table>${head}
      ${WEAPON_TYPES.map((w, i) => row(w, (c) => (c.weapons ? c.weapons[i] : null))).join("")}</table></div></details>
    ${mons.length ? `<details class="card"><summary>モンスター狩猟記録（${mons.length}種）</summary><p class="muted">数字は狩猟数。下は最小〜最大サイズ。<span class="crown gold">金</span>金冠、<span class="crown silver">銀</span>銀冠、<span class="crown gold">小</span>最小金冠（大きさの基準はモンスターごとのデータから）。映っていたページだけです。</p><div class="table-wrap"><table>${head}
      ${mons.map((n) => row(n, (c) => { const m = (c.monsters || []).find((x) => x[0] === n); return m ? `${m[3]}${size(m)}` : null; })).join("")}</table></div></details>` : ""}
    ${quests.length ? `<details class="card"><summary>闘技大会記録（いちばん速いタイム）</summary><div class="table-wrap"><table>${head}
      ${quests.map((q) => row(q, (c) => { const a = (c.arena || []).find((x) => x[0] === q); return a?.[1]?.[0] ? esc(a[1][0]) + arenaTier(q, a[1][0]) : null; })).join("")}</table>
      <p class="muted">ランクはゲームの基準タイム（S・A・B 未満）で付けています。基準タイムのデータが無いクエストだけは、このアプリの目安です（いちばん速いひとりの記録の1.25倍まで S・1.6倍まで A・2.2倍まで B・3.2倍まで C・それより遅いと D。ゲームの評価ではありません）。</p></div></details>` : ""}
  </details>`;
}

const presetData = (text) => { const d = addArenaClears(decodeShare(text, questIds())); if (OBS) { delete d.items; delete d.itemsChk; } return d; };
// A guild-card 闘技大会 time means that quest was cleared, so it also counts in 進行チェック.
function addArenaClears(d) {
  const ids = (d.card?.arena || []).map(([n]) => D.quests.find((q) => q.vendor === "闘技大会" && q.name === n)?.id).filter(Boolean);
  if (ids.length) d.cleared = [...new Set([...(d.cleared || []), ...ids])];
  return d;
}
// Rank of a clear time against the fastest solo TA record of that quest (this app's own scale, not the game's).
// own scale, only for quests without the game's time limits
const ARENA_TIERS = [[1.25, "S"], [1.6, "A"], [2.2, "B"], [3.2, "C"], [Infinity, "D"]];
const arenaSec = (t) => { const m = /^(d+)'(d+)"(d+)$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] + +m[3] / 100 : null; };
function arenaTier(questName, time) {
  const q = D.quests.find((x) => x.vendor === "闘技大会" && x.name === questName);
  const recs = (D.arena?.[q?.id]?.solo || []).map((r) => r.sec).filter((v) => v);
  const sec = arenaSec(time);
  const lim = D.arena?.[q?.id]?.rank?.t;
  if (lim && sec != null) return arenaRankPill(lim, sec);
  if (!recs.length || sec == null) return "";
  const ratio = sec / Math.min(...recs), tier = ARENA_TIERS.find(([r]) => ratio <= r)[1];
  return ` <span class="pill tier-${tier}" title="いちばん速いTA記録の${ratio.toFixed(2)}倍">${tier}</span>`;
}

// Compare up to 4 people (own data, friends, built-in presets not loaded yet) side by side.
function comparePeople() {
  const real = viewAs !== null ? realState : state;
  const out = [{ key: "me", name: "自分", d: real }, ...real.friends.map((f) => ({ key: `f:${f.name}`, name: f.name, d: f }))];
  (D.presets || []).forEach((x) => {
    if (real.friends.some((f) => f.name === x.name)) return;
    try { x.d ??= presetData(x.text); out.push({ key: `p:${x.name}`, name: `${x.name}（最初から）`, d: x.d }); } catch { /* other app version */ }
  });
  return out;
}
function comparePage() {
  setTitle("データを比べる");
  const p = state.prefs, all = comparePeople();
  const sel = (p.cmp || ["me"]).map((k) => all.find((x) => x.key === k)).filter(Boolean).slice(0, 4);
  const cols = (f) => sel.map((x) => `<td>${f(x.d)}</td>`).join("");
  const head = `<tr><th></th>${sel.map((x) => `<th>${esc(x.name)}</th>`).join("")}</tr>`;
  const no = `<span class="rzero">―</span>`;
  const hq = D.quests.filter((q) => !/ニャンター/.test(q.badge || ""));
  const cset = sel.map((x) => new Set(x.d.cleared || []));
  const tabs = [];
  for (const q of hq) { const k = `${q.vendor} ${q.tab}`; let t = tabs.find((x) => x.k === k); if (!t) tabs.push(t = { k, qs: [] }); t.qs.push(q); }
  const diffQ = hq.filter((q) => { const n = cset.filter((c) => c.has(q.id)).length; return n && n < sel.length; });
  // charms: best points per skill tree, with that charm's slots
  const best = sel.map((x) => { const m = {}; for (const c of x.d.charms || []) for (const [t, v] of Object.entries(c.skills)) if (!m[t] || v > m[t].v || (v === m[t].v && c.slots > m[t].s)) m[t] = { v, s: c.slots }; return m; });
  const top = (t) => Math.max(...best.map((m) => m[t]?.v || 0));
  const trees = [...new Set(best.flatMap((m) => Object.keys(m)))].sort((a, b) => top(b) - top(a));
  const oset = sel.map((x) => new Set(x.d.owned || []));
  const diffA = [...new Set(sel.flatMap((x) => x.d.owned || []))].filter((n) => oset.filter((o) => o.has(n)).length < sel.length).sort();
  const mark = (on) => (on ? "✓" : no);
  view.innerHTML = `<div class="card"><p class="muted">比べる人を選んでください（4人まで）。友達は、LINEなどで届いたテキストを「友達と見せ合う」で読み込むとここに出ます。</p>
      <div class="chips">${all.map((x) => `<label class="chip"><input type="checkbox" data-cmpk="${esc(x.key)}" ${sel.includes(x) ? "checked" : ""}> ${esc(x.name)}</label>`).join("")}</div></div>
    ${sel.length ? `<h2>進行（ハンターのクエスト）</h2><div class="table-wrap"><table>${head}
      ${tabs.map((t) => `<tr><td>${esc(t.k)}</td>${sel.map((x, i) => `<td>${x.d.cleared ? `${t.qs.filter((q) => cset[i].has(q.id)).length}/${t.qs.length}` : no}</td>`).join("")}</tr>`).join("")}</table></div>
    ${sel.length > 1 ? `<details class="card" open><summary>クリアに差があるクエスト（${diffQ.length}）</summary><div class="table-wrap"><table>${head}
      ${diffQ.slice(0, 400).map((q) => `<tr><td><a href="#find/quest/${q.id}">${esc(q.name)}</a> <span class="muted">${esc(t(q.vendor))} ${esc(t(q.tab))}</span></td>${cset.map((c) => `<td>${mark(c.has(q.id))}</td>`).join("")}</tr>`).join("")}</table></div>
      ${diffQ.length > 400 ? `<p class="muted">ほか${diffQ.length - 400}件</p>` : ""}</details>` : ""}
    <h2>まとめ</h2><div class="table-wrap"><table>${head}
      <tr><td>クリアしたクエスト</td>${cols((d) => (d.cleared ? d.cleared.length : no))}</tr>
      <tr><td>護石</td>${cols((d) => (d.charms ? d.charms.length : no))}</tr>
      <tr><td>装備のマイセット</td>${cols((d) => (d.sets ? d.sets.length : no))}</tr>
      <tr><td>作成済みの防具</td>${cols((d) => (d.owned ? d.owned.length : no))}</tr>
      <tr><td>持っている武器</td>${cols((d) => (d.ownedW ? Object.keys(d.ownedW).length : no))}</tr></table></div>
    <details class="card"><summary>護石：スキルごとのいちばん高いポイント（${trees.length}スキル）</summary><p class="muted">数字はそのスキルがいちばん高い護石のポイント、◯はその護石のスロットです。</p>
      <div class="table-wrap"><table>${head}${trees.map((t) => `<tr><td>${esc(t)}</td>${best.map((m) => `<td>${m[t] ? `${m[t].v > 0 ? "+" : ""}${m[t].v} ${"◯".repeat(m[t].s)}` : no}</td>`).join("")}</tr>`).join("")}</table></div></details>
    ${sel.length > 1 ? `<details class="card"><summary>作成済みの防具の差（${diffA.length}）</summary><div class="table-wrap"><table>${head}
      ${diffA.map((n) => `<tr><td><a href="#find/armor/${encodeURIComponent(n)}">${esc(n)}</a></td>${oset.map((o) => `<td>${mark(o.has(n))}</td>`).join("")}</tr>`).join("")}</table></div></details>` : ""}
    ${state.prefs.debug ? guildCardCompare(sel, head, no) : ""}
    <details class="card"><summary>装備のマイセット</summary><div class="table-wrap"><table>${head}
      ${Array.from({ length: Math.max(0, ...sel.map((x) => x.d.sets?.length || 0)) }, (_, k) => `<tr><td>${k + 1}</td>${sel.map((x) => { const st = x.d.sets?.[k]; return `<td>${st ? `${esc(st.name)}${st.weapon ? `<div class="muted">${esc(st.weapon)}</div>` : ""}` : no}</td>`; }).join("")}</tr>`).join("")}</table></div></details>` : ""}`;
  view.querySelectorAll("[data-cmpk]").forEach((c) => (c.onchange = () => {
    const keys = sel.map((x) => x.key).filter((k) => k !== c.dataset.cmpk);
    if (c.checked) { if (keys.length >= 4) { c.checked = false; return toast("比べられるのは4人までです"); } keys.push(c.dataset.cmpk); }
    p.cmp = keys; save(); comparePage();
  }));
}

// ---------------------------------------------------------------- 使い方（Q&A・ツアー）

const QA = [
  ["はじめに", [
    ["このアプリで何ができる？", "クリアしたクエストに✓を付けると、いまの進行で作れる武器・防具・装飾品だけでスキルの組み合わせを探したり（シミュ）、素材やモンスターを調べたり（逆引き・モンスター）できます。友達とデータを見せ合うこともできます。"],
    ["まず何をすればいい？", "「進行」タブでクリアしたクエストに✓を付けてください。ランクの見出しを開いて「全部クリア済みにする」を押すと、まとめて付けられます。次に「護石」タブで持っている護石を登録すると、シミュで使えます。"],
    ["データはどこに保存される？", "この端末のブラウザの中に自動で保存されます。キャッシュを消したり機種変更したりすると消えるので、ときどき「設定」の「エクスポート」でファイルに書き出してください。7日以上バックアップしていないと、画面の上でお知らせします。"],
  ]],
  ["護石", [
    ["護石をまとめて入れたい", "「護石」タブの「ほかのスキルシミュとやりとり」に、ほかのスキルシミュのお守りの書き出し（「,0,匠,5,重撃,5」の形）を貼り付けて「読み込む」を押します。「データ編集」の護石タブでは、同じ形のテキストで全部を書き換えることもできます。"],
    ["友達や最初から入っているデータの護石を使いたい", "シミュで試すだけなら、シミュの「使う護石」でその人を選んでください（自分の護石はそのまま）。自分の護石に足したいときは、「護石」タブの「ほかの人の護石を取り込む」でその人を選んで「自分の護石に足す」を押します。"],
    ["「要確認」の印は何？", "動画がぼやけていて推定で入れた護石です。ゲームで見比べて、護石を開いて「保存」すると印が消えます。"],
  ]],
  ["友達と見せ合う", [
    ["友達にデータを送るには？", "「設定」→「友達と見せ合う」で名前と送るものを選び、「テキストを作ってコピー」を押して LINE などに貼ります。受け取った人は、同じページの「友達のデータを読み込む」に丸ごと貼り付けます。"],
    ["最初から入っているデータとは？", "動画から読み取った仲間のデータです。「友達のデータを読み込む」の下のボタンで友達一覧に入ります。名前の前の6桁は動画の日付です。"],
    ["友達のデータで全部のタブを見たい", "友達ページの「〇〇のデータで全部のタブを見る」を押すと、進行・シミュ・護石・逆引きなどがその人のデータで動きます。上の帯の「自分に戻す」で戻ります。表示中に変えたことは保存されません。"],
    ["友達のデータを自分のデータにしたい", "友達ページか上の帯の「自分のデータにする」を押します。今の自分のデータは「データ編集」の保存一覧に残ります。"],
    ["データを比べたい", "「友達と見せ合う」の「自分・友達のデータを比べる」で、4人まで並べられます。いちばん上がランクごとの進行で、クリアに差があるクエストも出ます。"],
  ]],
  ["困ったとき", [
    ["画面が古いまま・動かない", "「設定」の「キャッシュを消して読み込み直す」を押してください。データは消えません。"],
    ["クエストの出現条件を知りたい", "クエストのページの「出現条件」に、そのクエストまでの流れが最初から順に出ます。✓はクリア済みです。"],
    ["〇〇からの依頼を探したい", "「逆引き」の「〇〇からの依頼（依頼主から探す）」で、依頼主ごとにクエストを見られます。クエストの一覧にも依頼主が出ます。"],
  ]],
];
routes.help = () => {
  setTitle("使い方");
  view.innerHTML = `<div class="card"><p>はじめての方は、画面を順に案内する「使い方ツアー」がおすすめです。いつでも「やめる」で終われます。</p>
      <div class="row"><button class="primary" id="tutgo">使い方ツアーを始める</button></div></div>
    ${QA.map(([h, qs]) => `<h2>${esc(h)}</h2>${qs.map(([q, a]) => `<details class="card"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`).join("")}`;
  view.querySelector("#tutgo").onclick = () => startTour();
};

// Tour: a small card above the tabs that walks through the tabs; "やめる" ends it at any step.
const TOUR = [
  ["progress", "進行", "クリアしたクエストに✓を付けます。この進行で作れる装備が決まり、シミュや逆引きに使われます。ランクを開いて「全部クリア済みにする」でまとめて付けられます。"],
  ["sim", "シミュ", "ほしいスキルを選ぶと、作れる装備と持っている護石から組み合わせを探します。見つけたセットは「マイセット」に保存できます。"],
  ["charms", "護石", "持っている護石を登録します。ほかのスキルシミュの書き出しの貼り付けや、友達の護石の取り込みもここからできます。"],
  ["find", "逆引き", "武器・防具・素材・モンスター・クエストを、名前（ひらがなでも）や依頼主から探せます。"],
  ["mons", "モンスター", "弱点・肉質・状態異常の効きやすさなどを見られます。"],
  ["maps", "マップ", "エリア番号と、採取できる場所の図です。"],
  ["rank", "武器", "選んだモンスターに強い武器を、作れるものから順に並べます。"],
  ["share", "友達と見せ合う", "データをテキストにして LINE などで送ったり、友達のデータを読み込んで比べたりできます。"],
  ["help", "使い方", "わからないときは、右上の「？」からこのページを開けます。ツアーはこれで終わりです。"],
];
let tourStep = -1;
function startTour() { tourStep = 0; state.prefs.tourSeen = true; save(); go(TOUR[0][0]); drawTour(); }
function endTour() { tourStep = -1; state.prefs.tourSeen = true; save(); drawTour(); }
function drawTour() {
  const el = document.getElementById("tour");
  if (!el) return;
  if (OBS) { el.hidden = true; return; }
  if (tourStep < 0 && !state.prefs.tourSeen) {
    el.hidden = false;
    el.innerHTML = `<b>はじめての方へ</b><p>画面を順に案内する「使い方ツアー」を見ますか？（あとで右上の「？」からも見られます）</p>
      <div class="row"><button class="primary" id="tr-go">見る</button><button id="tr-no">いらない</button></div>`;
    el.querySelector("#tr-go").onclick = () => startTour();
    el.querySelector("#tr-no").onclick = () => endTour();
    return;
  }
  if (tourStep < 0) { el.hidden = true; el.innerHTML = ""; return; }
  const [, title, text] = TOUR[tourStep];
  el.hidden = false;
  el.innerHTML = `<b>${tourStep + 1}/${TOUR.length} ${esc(title)}</b><p>${esc(text)}</p>
    <div class="row">${tourStep ? `<button id="tr-prev">前へ</button>` : ""}${tourStep < TOUR.length - 1 ? `<button class="primary" id="tr-next">次へ</button>` : `<button class="primary" id="tr-end">終わる</button>`}${tourStep < TOUR.length - 1 ? `<button id="tr-stop">やめる</button>` : ""}</div>`;
  const step = (d) => { tourStep += d; go(TOUR[tourStep][0]); drawTour(); };
  el.querySelector("#tr-prev")?.addEventListener("click", () => step(-1));
  el.querySelector("#tr-next")?.addEventListener("click", () => step(1));
  el.querySelector("#tr-end")?.addEventListener("click", endTour);
  el.querySelector("#tr-stop")?.addEventListener("click", endTour);
}

// ---------------------------------------------------------------- 仕様メモ

// ネコ飯: dish stats (filter by what a dish raises; hunter or palico numbers) and meal skills with the numbers
// we know from the 効果重複 memo.
const MEAL_NUMS = {
  "ネコの防御術【小】": "1/8の確率でダメージ30%減", "ネコの防御術【大】": "1/4の確率でダメージ30%減（精霊の加護と重なる）",
  "ネコの火事場力": "体力が少ないとき攻撃力×1.35", "ネコの短期催眠術": "攻撃力+3（開始から10分、またはキャンプで寝るまで）",
  "ネコの調合術【小】": "調合成功率+10%", "ネコの調合術【大】": "調合成功率+20%",
};
function mealPage() {
  setTitle("ネコ飯");
  if (!D.meals) { view.innerHTML = `<p class="muted">データを読み込めませんでした。</p>`; return; }
  const p = state.prefs, who = p.mealWho === "otomo" ? "otomo" : "hunter", by = p.mealBy || "all";
  const COLS = ["体力", who === "otomo" ? "テンション" : "スタミナ", "攻撃", "防御"], RES = ["火", "水", "雷", "氷", "龍"];
  const FILTERS = [["all", "すべて"], ["hp", "体力"], ["st", who === "otomo" ? "テンション" : "スタミナ"], ["atk", "攻撃"], ["def", "防御"], ["res", "耐性"]];
  const pick = { all: () => true, hp: (v) => v[0] > 0, st: (v) => v[1] > 0, atk: (v) => v[2] > 0, def: (v) => v[3] > 0, res: (v) => v.slice(4).some((x) => x) };
  const rows = D.meals.dishes.filter((d) => pick[by](d[who]));
  const cell = (v) => `<td>${v ? `+${v}` : `<span class="rzero">-</span>`}</td>`;
  view.innerHTML = `<p class="muted">屋台の料理で上がる数値と、食事スキルの効果です。攻撃の+3/+5/+7は攻撃力UP【小】【中】【大】で、鬼人薬と重ねて効きます（仕様メモ「効果重複」）。</p>
    <h2>料理の数値</h2>
    <div class="chips">${[["hunter", "ハンター"], ["otomo", "オトモ"]].map(([v, l]) => `<button class="chip ${who === v ? "on" : ""}" data-mwho="${v}">${l}</button>`).join("")}</div>
    <div class="chips">${FILTERS.map(([v, l]) => `<button class="chip ${by === v ? "on" : ""}" data-mby="${v}">${l}が上がる</button>`).join("").replace(">すべてが上がる<", ">すべて<")}</div>
    <div class="table-wrap"><table><tr><th>料理（${rows.length}）</th>${COLS.map((c) => `<th>${c}</th>`).join("")}<th>耐性</th></tr>
      ${rows.map((d) => { const v = d[who]; const res = RES.map((e, i) => (v[4 + i] ? `<span class="el-${e}">${e}+${v[4 + i]}</span>` : "")).filter(Boolean).join(" ");
        return `<tr><td style="text-align:left">${esc(d.name)}</td>${v.slice(0, 4).map(cell).join("")}<td style="text-align:left">${res || `<span class="rzero">-</span>`}</td></tr>`; }).join("")}</table></div>
    <h2>食事スキル（${D.meals.skills.length}）</h2>
    <ul class="list">${D.meals.skills.map((k) => `<li class="item"><span class="grow"><b>${esc(k.name)}</b><div>${esc(k.desc)}</div>${MEAL_NUMS[k.name] ? `<div class="detail">${esc(MEAL_NUMS[k.name])}</div>` : ""}</span></li>`).join("")}</ul>
    <p class="muted">食事スキルの細かい数値は、確かめられたものだけ書いています。</p>`;
  view.querySelectorAll("[data-mwho]").forEach((b) => (b.onclick = () => { p.mealWho = b.dataset.mwho; save(); mealPage(); }));
  view.querySelectorAll("[data-mby]").forEach((b) => (b.onclick = () => { p.mealBy = b.dataset.mby; save(); mealPage(); }));
}
routes.spec = (topic) => {
  if (topic === "calc") { setTitle("効果重複の計算機"); return renderCalc(view, { esc, state, save }); }
  if (topic === "dmg") { setTitle("ダメージの計算機"); return renderDmgCalc(view, { esc, D, state, save }); }
  if (topic === "meal") return mealPage();
  const r = topic && renderSpec(topic, { D, esc, en: isEn(), topicsEn: TOPICS_EN });
  if (!r) {
    setTitle("仕様メモ");
    view.innerHTML = `<ul class="list">${Object.entries(TOPICS).map(([k, t]) => `<li><a href="#spec/${k}"><span class="grow">${esc(t.title)}</span>›</a></li>`).join("")}<li><a href="#spec/calc"><span class="grow">効果重複の計算機（攻撃力・ダメージ軽減）</span>›</a></li><li><a href="#spec/dmg"><span class="grow">ダメージの計算機（砲撃・固定ダメージ・爆破）</span>›</a></li><li><a href="#spec/meal"><span class="grow">ネコ飯（料理の数値と食事スキル）</span>›</a></li></ul>`;
    return;
  }
  setTitle(r.title);
  view.innerHTML = r.html;
};

// ---------------------------------------------------------------- デバッグモード

function debugSettingsHtml() {
  const c = dbg.crashes();
  return `<h2>デバッグ</h2>
    <div class="card">
      <a class="btn primary" href="#debug">Safariが落ちる・読み込み直される原因を調べる ›</a>
      ${c.length ? `<p class="hi">前回までに、途中で終わった記録が${c.length}件あります。</p>` : ""}
    </div>
    <div class="card"><b>ログ</b>
      <div class="row"><button id="logbtn" class="toggle" aria-pressed="${!!state.prefs.logOn}">ログを記録 ${state.prefs.logOn ? "ON" : "OFF"}</button>
        <button id="logcopy">ログをコピー</button><button id="logdl">ファイルに保存</button><span class="grow"></span><button id="logclr" class="danger">ログを消す</button></div>
      <p class="muted">起動・エラー・診断の結果などを、この端末の中だけに記録します（最大300行。超えたら古い半分を捨てます）。問い合わせのときにコピーして送ってください。</p></div>
    <div class="card"><b>項目ごとのバックアップ</b><p class="muted">進行チェック・護石など、選んだ項目だけを書き出したり読み込んだりできます。</p>
      <a class="btn" href="#debug/backup">項目を選んでバックアップ ›</a></div>
    <div class="card"><b>アンインストールのしかた</b>
      <ul class="muted">
        <li>このアプリは、この端末のブラウザの中だけに保存しています。パソコンやiPhoneのほかの場所には何も置いていません。</li>
        <li><b>ホーム画面に追加している場合</b>: アイコンを長押しして削除すると、アプリと保存したデータ（進行チェック・護石・マイセットなど）が全部消えます。</li>
        <li><b>Safariで開いている場合</b>: 「設定」→「Safari」→「詳細」→「Webサイトデータ」で、このサイト（chromebread.github.io）だけを削除します。ほかのサイトのデータは消さないようにしてください。</li>
        <li>アプリの中から消すなら、上の「キャッシュとデータの削除」の「全部削除」です。</li>
        <li>どの方法でも取り消せないので、先に「エクスポート」で保存しておいてください。</li>
      </ul></div>`;
}
function bindDebugSettings() {
  const $ = (s) => view.querySelector(s);
  if (!$("#logbtn")) return;
  $("#logbtn").onclick = () => { state.prefs.logOn = !state.prefs.logOn; dbg.setLogging(state.prefs.logOn); save(); if (state.prefs.logOn) dbg.log("ログの記録を開始"); routes.settings(); };
  $("#logcopy").onclick = async () => { try { await navigator.clipboard.writeText(dbg.logText() || "（ログはありません）"); toast("ログをコピーしました"); } catch { toast("コピーできませんでした。「ファイルに保存」を使ってください。"); } };
  $("#logdl").onclick = () => downloadText(`karitomo-log-${ymd()}.txt`, dbg.logText() || "（ログはありません）");
  $("#logclr").onclick = () => { if (confirm("ログを消しますか？")) { dbg.clearLog(); toast("ログを消しました"); } };
}
const ymd = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; };
function downloadText(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Asks before a risky step; "いいえ" is the focused (default) answer.
function askRisky(text) {
  return new Promise((res) => {
    const box = document.createElement("div");
    box.className = "card ask";
    box.innerHTML = `<p>${esc(text)}</p><div class="row"><button class="primary" id="askno">いいえ（やめる）</button><button id="askyes" class="danger">はい、試す</button></div>`;
    view.prepend(box);
    box.querySelector("#askno").focus();
    box.querySelector("#askno").onclick = () => { box.remove(); res(false); };
    box.querySelector("#askyes").onclick = () => { box.remove(); res(true); };
    box.scrollIntoView({ block: "start" });
  });
}

routes.debug = (sub) => {
  if (!state.prefs.debug) return go("settings");
  if (sub === "backup") return debugBackup();
  setTitle("落ちる原因を調べる");
  const c = dbg.crashes(), d = dbg.diagState();
  const ctx = { D, version: VERSION, simParams: (targets) => {
    const p = state.prefs, keep = [p.targets, p.onlyMakeable, p.hrCap, p.pinned, p.excluded];
    Object.assign(p, { targets, onlyMakeable: false, hrCap: "", pinned: {}, excluded: [] });
    try { return simParams(); } finally { [p.targets, p.onlyMakeable, p.hrCap, p.pinned, p.excluded] = keep; }
  } };
  const report = () => [`${APP_NAME} ${VERSION}`, navigator.userAgent,
    ...c.map((x) => `途中で終わった: ${x.at} ${x.ended === "open" ? "表示中" : "裏に回っているあいだ"} ${x.page}${x.step ? ` 試験「${x.step}」` : ""}`),
    ...(d.results || []).map((r) => `${r.bad ? "×" : "○"} ${r.name}: ${r.result}`)].join("\n");
  view.innerHTML = `
    <div class="card"><b>途中で終わった記録（${c.length}件）</b>
      ${c.length ? `<ul>${c.slice().reverse().map((x) => `<li>${esc(x.at)} — <b>${x.ended === "open" ? "表示中に終わった（Safariが落ちた・強制終了）" : "裏に回っているあいだに終わった（iPhoneがメモリ不足で閉じた、または自分で閉じた）"}</b><br><span class="muted">開いていた画面 ${esc(x.page)}${x.step ? ` ／ 試験「${esc(x.step)}」の最中` : ""} ／ 版 ${esc(x.version)}</span></li>`).join("")}</ul>`
        : `<p class="muted">まだありません。デバッグモードをONにしているあいだ、アプリが途中で終わると次に開いたときここに出ます。</p>`}
      ${c.length ? `<button id="crclr">記録を消す</button>` : ""}</div>
    <div class="card"><b>試験</b><p class="muted">上から順に試します。試す直前に記録するので、Safariが落ちても、開き直せばどの試験で落ちたか分かります。⚠の試験は本当に落ちることがあります（保存したデータは消えません）。</p>
      <div class="chips">${Object.entries(dbg.TESTS).map(([k, t]) => `<button class="chip" data-test="${k}">${t.risky ? "⚠ " : ""}${esc(t.label)}</button>`).join("")}</div>
      <div class="row" style="margin-top:8px"><button class="primary" id="runsafe">⚠以外を全部試す</button></div></div>
    <div class="card"><b>結果</b>
      ${(d.results || []).length ? `<ul class="list">${d.results.slice().reverse().map((r) => `<li class="item"><span class="grow"><b class="${r.bad ? "hi" : ""}">${r.bad ? "×" : "○"} ${esc(r.name)}</b><br><span class="muted">${esc(r.result)} ／ ${esc(r.at)}</span></span></li>`).join("")}</ul>` : `<p class="muted">まだ試していません。</p>`}
      <div class="row"><button id="repcopy">結果をまとめてコピー</button>${(d.results || []).length ? `<button id="diagclr">結果を消す</button>` : ""}</div></div>
    <div class="card"><b>iPhone本体の記録を見る</b>
      <p class="muted">「設定」→「プライバシーとセキュリティ」→「解析と改善」→「解析データ」に、落ちたときの記録が日付つきで残ります。</p>
      <ul class="muted"><li><b>JetsamEvent-日付</b>: メモリが足りなくなって、iPhoneがアプリやタブを閉じた記録</li>
        <li><b>com.apple.WebKit.WebContent-日付</b> や <b>Safari-日付</b>: Safariのページ表示の部分が落ちた記録</li>
        <li>落ちた時刻と、上の「途中で終わった記録」の時刻が近いものを開いて、共有ボタンで送ってもらえれば原因を調べやすくなります。</li></ul></div>
    <div class="card"><b>解決した実例: Safariのブックマークを減らしたら直った</b>
      <p class="muted">iPhone 17・iOS 26.7.1 で Safari が落ち続けていたとき、ブックマークとリーディングリストを PC の Chrome に移して、Safari 側を軽くしたら落ちなくなりました。Mac や iCloud for Windows は使わずにできます。</p>
      <ol class="muted">
        <li><b>iPhone で書き出す</b>: 「設定」→「アプリ」→「Safari」→ 下のほうの「ブラウズデータを書き出す」で書き出し、「ファイル」アプリに保存します（iOS の版によって項目名が少し違います）。</li>
        <li><b>PC に送る</b>: 「ファイル」アプリの共有から、Google ドライブ・メール・LINE の PC 版などで PC に送り、ZIP を展開します。「Safari Export 日付」（例: Safari Export 2026-11-23）の中に、<b>Bookmarks.html</b>（ブックマーク）と <b>ReadingList.html</b>（リーディングリスト）が入っています。</li>
        <li><b>Chrome に読み込む</b>: PC の Chrome で「ブックマーク マネージャ」（Ctrl+Shift+O）→ 右上の「︙」→「インポート」で、まず Bookmarks.html を選びます。続けてもう一度「インポート」で ReadingList.html を選ぶと、リーディングリストもブックマークとして入ります。</li>
        <li><b>確かめてから Safari を整理</b>: ブックマークとリーディングリストが Chrome に入ったのを確かめてから、iPhone の Safari のブックマークとリーディングリストを消します。一括削除はないので、それぞれの一覧で「…」→ 編集モードにして、左のチェックの丸を指で下へなぞるとまとめて選べます。選んだらゴミ箱マークで消します。</li></ol>
      <p class="muted">書き出しはコピーなので、iPhone 側が変わることはありません。ただし Safari で消したものは、iCloud で同期しているほかの Apple 端末からも消えます。</p></div>`;
  const $ = (s) => view.querySelector(s);
  const run = async (keys) => {
    for (const k of keys) {
      if (dbg.TESTS[k].risky && !(await askRisky(`「${dbg.TESTS[k].label}」はSafariが落ちることがあります。落ちたら、開き直してこのページに戻ると、どこで落ちたかが出ます。試しますか？`))) continue;
      toast(`試しています: ${dbg.TESTS[k].label}`);
      await dbg.runTest(k, ctx);
    }
    if (location.hash !== "#debug") go("debug"); else routes.debug();
  };
  view.querySelectorAll("[data-test]").forEach((b) => (b.onclick = () => run([b.dataset.test])));
  $("#runsafe").onclick = () => run(Object.keys(dbg.TESTS).filter((k) => !dbg.TESTS[k].risky));
  $("#crclr")?.addEventListener("click", () => { dbg.clearCrashes(); routes.debug(); });
  $("#diagclr")?.addEventListener("click", () => { dbg.clearDiag(); routes.debug(); });
  $("#repcopy").onclick = async () => { try { await navigator.clipboard.writeText(report()); toast("コピーしました"); } catch { downloadText(`karitomo-diag-${ymd()}.txt`, report()); } };
};

// Per-item backup: export chosen parts of the saved data, import only the parts in the file.
const BACKUP_KEYS = [["cleared", "進行チェック"], ["charms", "護石"], ["sets", "マイセット"], ["owned", "作成済みの防具"], ["ownedW", "持っている武器"], ["items", "アイテムの所持数"], ["files", "データ編集で保存したデータ"], ["friends", "友達のデータ"], ["prefs", "シミュの入力・表示の設定"]];
function debugBackup() {
  setTitle("項目ごとのバックアップ");
  view.innerHTML = `<div class="card"><b>書き出す</b>
      ${BACKUP_KEYS.map(([k, l]) => `<label class="check"><input type="checkbox" data-bk="${k}" checked> ${l}</label>`).join("")}
      <div class="row"><button class="primary" id="bkexp">選んだ項目を書き出す</button></div></div>
    <div class="card"><b>読み込む</b><p class="muted">ファイルに入っている項目のうち、上でチェックした項目だけを置き換えます（ほかの項目はそのまま）。読み込んだあと「元に戻す」で取り消せます。</p>
      <label class="btn">ファイルを選ぶ<input type="file" id="bkimp" accept=".json,application/json" hidden></label></div>`;
  const chosen = () => [...view.querySelectorAll("[data-bk]:checked")].map((c) => c.dataset.bk);
  view.querySelector("#bkexp").onclick = () => {
    const keys = chosen();
    if (!keys.length) return toast("項目を選んでください");
    const out = { app: "karitomo", version: 1, part: keys };
    for (const k of keys) out[k] = state[k];
    downloadText(`karitomo-${keys.length === BACKUP_KEYS.length ? "all" : keys.join("_")}-${ymd()}.json`, JSON.stringify(out, null, 1), "application/json");
    if (keys.length === BACKUP_KEYS.length) markBackedUp();
  };
  view.querySelector("#bkimp").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s.app !== "karitomo" || s.version !== 1) throw new Error("bad file");
      const obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
      const ok = { cleared: Array.isArray, charms: Array.isArray, sets: Array.isArray, owned: Array.isArray, friends: Array.isArray, files: Array.isArray, ownedW: obj, items: obj, prefs: obj };
      const keys = chosen().filter((k) => k in s && ok[k](s[k]));
      if (!keys.length) return toast("このファイルに、チェックした項目は入っていませんでした");
      const before = structuredClone(state);
      for (const k of keys) state[k] = k === "prefs" ? { ...state.prefs, ...s.prefs, debug: state.prefs.debug } : s[k];
      draft = null; dirty = false;
      save(); refreshHave();
      toast(`${keys.map((k) => BACKUP_KEYS.find((x) => x[0] === k)[1]).join("・")}を読み込みました`, { label: "元に戻す", run: () => { state = before; save(); refreshHave(); render(); } });
    } catch { toast("このファイルは読み込めません。このアプリで書き出したファイルか確かめてください。"); }
    e.target.value = "";
  };
}

// ---------------------------------------------------------------- 設定

routes.settings = () => {
  setTitle("設定");
  view.innerHTML = `
    <h2>❓ 使い方</h2>
    <div class="card"><p class="muted">はじめての方や、わからないことがあるときに。Q&amp;Aと、画面を順に案内するツアー（いつでもやめられます）があります。</p>
      <a class="btn primary" href="#help">使い方（Q&amp;A・ツアー）›</a></div>
    <h2>🤝 友達と見せ合う</h2>
    <div class="card"><p class="muted">マイセット・護石・作成済み装備・進行チェックを、LINE などに貼れるテキストにして友達と交換できます。</p>
      <a class="btn primary" href="#share">友達と見せ合う ›</a></div>
    <h2>📖 仕様メモ</h2>
    <div class="card"><a class="btn primary" href="#spec">仕様メモを読む ›</a><p class="muted">眠爆のダメージ、回避の無敵時間、固定ダメージ、ボウガンのリロードと反動、アイテムや笛の効果の重なり方など、ゲームの中では分からない細かい仕様をまとめています。</p></div>
    <h2>✏️ データ編集</h2>
    <div class="card"><p class="muted">護石・作成済みの防具・持っている武器・アイテムの所持数をまとめて直せます。名前を付けて何通りも保存できます。</p>
      <a class="btn primary" href="#edit">データ編集 ›</a></div>
    <h2>🎯 おすすめ</h2>
    <div class="card"><p class="muted">クエストと武器種を選ぶと、自分（または友達）の武器・マイセット・アイテムのマイセットから持っていくものと、次に作る武器を出します。</p>
      <a class="btn primary" href="#advice">おすすめを見る ›</a></div>
    <h2>💾 データの引っ越し・バックアップ</h2>
    <div class="card"><p class="muted">進行チェックと護石は、この端末のブラウザに自動で保存しています。ブラウザのデータを消すと消えるので、ときどきエクスポートしてください。</p>
      <div class="row"><button class="primary" id="exp">エクスポート</button><label class="btn">インポート<input type="file" id="imp" accept=".json,application/json" hidden></label></div></div>
    <h2>📱 ホーム画面に追加</h2>
    <div class="card">${isStandalone() ? `<p>ホーム画面から開いています（追加済みです）。</p>`
      : `<p class="muted">ホーム画面にアイコンを置くと、アプリのように1タップで開けます。通信が無いところでも、一度開いたページは見られます。</p>
      <div class="row"><button class="primary" id="a2hs">ホーム画面に追加する</button></div><div id="a2hsHow"></div>`}</div>
    <h2>🎨 表示</h2>
    <div class="card"><div class="muted">画面の色</div><div class="chips">${[["auto", "端末に合わせる"], ["light", "通常モード"], ["dark", "ダークモード"]].map(([v, l]) => `<button class="chip ${(state.prefs.theme || "auto") === v ? "on" : ""}" data-theme="${v}">${l}</button>`).join("")}</div>
      <p class="muted">右上の ☾ / ☀ でも切り替えられます。</p>
      ${[["", "ふだんの画面（スマホ・OBS のドック）"], ["obs", "配信に映す画面（アドレスの最後に ?obs）"]].map(([k, label]) => { const zk = k ? "obsZoom" : "zoom", bk = k ? "obsNoBg" : "noBg";
        return `<div class="muted" style="margin-top:8px">${label}</div><div class="row"><label>文字の大きさ <select data-zoom="${zk}">${ZOOMS.map((z) => `<option value="${z}" ${(state.prefs[zk] || 100) === z ? "selected" : ""}>${z}%</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" data-nobg="${bk}" ${state.prefs[bk] ? "checked" : ""}>背景を消す（カードの下が透けます）</label></div>`; }).join("")}</div>
    <h2>📺 配信（OBS）で使う</h2>
    <div class="card"><ol class="muted" style="padding-left:1.2em;margin:0">
      <li>OBS の「ドック」→「カスタムブラウザドック」に、このページのアドレス（${esc(location.origin + location.pathname)}）を入れます。ふだんどおり触れる画面です。</li>
      <li>シーンに「ブラウザ」ソースを足し、URL に同じアドレスの最後へ <b>?obs</b> を付けたものを入れます（「ローカルファイル」はオフ。幅と高さは縦長、例: 540×960）。</li>
      <li>ドックで開いたページ・スクロール・シミュの検索を、配信に映す画面が追いかけます。配信に映す画面からは保存しません。</li></ol>
      <p class="muted">最初から入っているデータのアイテム所持数は、配信に映す画面には出しません。上の「配信に映す画面」で文字の大きさと背景を別に決められます。</p></div>
    <h2>🧹 キャッシュとデータの削除</h2>
    <div class="card">
      <p class="muted"><b>キャッシュを消す</b>: 表示がおかしい・新しい版にならないときに。保存した進行や護石は消えません。</p>
      <div class="row"><button id="clrcache">キャッシュを消して読み込み直す</button></div>
      <p class="muted" style="margin-top:12px"><b>入力したデータを分けて消す</b>（消したあと「元に戻す」で取り消せます）</p>
      <div class="chips">
        <button class="chip" data-clr="sim">シミュの入力（スキル・固定・除外）</button>
        <button class="chip" data-clr="cleared">進行チェック（${state.cleared.length}件）</button>
        <button class="chip" data-clr="charms">護石（${state.charms.length}個）</button>
        <button class="chip" data-clr="sets">マイセット（${state.sets.length}）</button>
        <button class="chip" data-clr="owned">作成済み装備（${state.owned.length + Object.keys(state.ownedW).length}）</button>
        <button class="chip" data-clr="friends">友達のデータ（${state.friends.length}人）</button>
      </div>
      <p class="muted" style="margin-top:12px"><b>全部削除</b>: 保存したデータとキャッシュをすべて消して、最初の状態に戻します。取り消せないので、先にエクスポートしてください。</p>
      <div class="row"><button class="danger" id="clrall">全部削除</button></div>
    </div>
    <h2>🌐 Language</h2>
    <div class="card"><div class="chips">${[["gu", "GU（English）"], ["xx", "XX（日本語）"]].map(([v, l]) => `<button class="chip ${(state.prefs.lang || "xx") === v ? "on" : ""}" data-lang="${v}" ${v === "xx" ? 'lang="ja"' : ""}>${l}</button>`).join("")}</div>
      <p class="muted">${isEn() ? "Names follow the Switch version. Screens that are not translated yet stay in Japanese." : "XX は日本語（3DS版の名前）、GU は英語（Switch版の名前）です。切り替えると読み込み直します。"}</p></div>
    <h2>ℹ️ 情報</h2>
    <div class="card">
      <div>${APP_NAME} バージョン ${VERSION}</div>
      <div class="muted">${isEn() ? `Built ${buildDateEn()}` : `ビルド日 ${BUILD_DATE}`}</div>
      <div class="muted">データ: 防具${fmt(D.armor.length)} / 装飾品${D.decos.length} / スキル系統${D.skills.length} / モンスター${D.monsters.length} / クエスト${fmt(D.quests.length)}</div>
      <div class="row" style="margin-top:8px"><button id="dbgbtn" class="toggle" aria-pressed="${!!state.prefs.debug}">デバッグモード ${state.prefs.debug ? "ON" : "OFF"}</button></div></div>
    ${state.prefs.debug ? debugSettingsHtml() : ""}`;
  view.querySelector("#dbgbtn").onclick = () => {
    state.prefs.debug = !state.prefs.debug;
    if (state.prefs.debug) dbg.startSession(VERSION, location.hash); else { dbg.stopSession(); dbg.setLogging(false); }
    if (!state.prefs.debug) state.prefs.logOn = false;
    save(); routes.settings();
  };
  bindDebugSettings();
  const clearCaches = async () => {
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      for (const r of (await navigator.serviceWorker?.getRegistrations()) || []) await r.unregister();
      // also refresh the browser's own HTTP cache, so every tab gets the new version without pulling each one:
      // the page, every file loaded so far, and every file the service worker lists (data used by later tabs)
      const urls = new Set([location.pathname, ...performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin))]);
      try {
        const sw = await (await fetch("sw.js", { cache: "reload" })).text();
        for (const m of sw.matchAll(/"((?:js|css|data|icons)\/[^"]+|manifest\.json|index\.html)"/g)) { urls.add(new URL(m[1], location.href).href); if (m[1].startsWith("js/")) urls.add(new URL(`${m[1]}?v=${VERSION}`, location.href).href); }
      } catch { /* offline: keep what we have */ }
      await Promise.all([...urls].map((u) => fetch(u, { cache: "reload" }).catch(() => {})));
    } catch { /* caches unavailable (private mode): nothing to clear */ }
  };
  view.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => {
    if ((state.prefs.lang || "xx") === b.dataset.lang) return;
    state.prefs.lang = b.dataset.lang;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(viewAs !== null ? realState : state)); } catch { /* storage blocked */ }
    location.reload(); // every label is drawn again in the new language
  }));
  view.querySelectorAll("[data-theme]").forEach((b) => (b.onclick = () => { state.prefs.theme = b.dataset.theme; save(); applyTheme(); routes.settings(); }));
  view.querySelectorAll("[data-zoom]").forEach((el) => (el.onchange = () => { state.prefs[el.dataset.zoom] = +el.value; save(); applyView(); }));
  view.querySelectorAll("[data-nobg]").forEach((el) => (el.onchange = () => { state.prefs[el.dataset.nobg] = el.checked; save(); applyView(); }));
  view.querySelector("#a2hs")?.addEventListener("click", async () => {
    if (installPrompt) { installPrompt.prompt(); const r = await installPrompt.userChoice; installPrompt = null; if (r.outcome === "accepted") toast("ホーム画面に追加しました"); return; }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    view.querySelector("#a2hsHow").innerHTML = ios
      ? `<ol><li>Safari で開いてください（ほかのアプリの中のブラウザでは追加できません）。</li><li>画面の下（iPad は上）の共有ボタン <b>□↑</b> を押します。</li><li>「ホーム画面に追加」を選んで、「追加」を押します。</li></ol>`
      : `<ol><li>Chrome で開いてください。</li><li>右上の <b>︙</b> メニューを押します。</li><li>「ホーム画面に追加」または「アプリをインストール」を選びます。</li></ol><p class="muted">ボタンだけで追加できないときは、この手順でどうぞ。</p>`;
  });
  view.querySelector("#clrcache").onclick = async () => { await clearCaches(); location.reload(); };
  const CLEAR = {
    sim: ["シミュの入力", (s) => { s.prefs.targets = {}; s.prefs.pinned = {}; s.prefs.excluded = []; delete s.prefs.pinnedCharm; delete s.prefs.tempCharm; s.prefs.minDef = 0; s.prefs.minSlots = 0; s.prefs.hrCap = ""; }],

    cleared: ["進行チェック", (s) => { s.cleared = []; }],
    charms: ["護石", (s) => { s.charms = []; }],
    sets: ["マイセット", (s) => { s.sets = []; }],
    owned: ["作成済み装備", (s) => { s.owned = []; s.ownedW = {}; }],
    friends: ["友達のデータ", (s) => { s.friends = []; }],
  };
  view.querySelectorAll("[data-clr]").forEach((b) => (b.onclick = () => {
    const [label, wipe] = CLEAR[b.dataset.clr];
    if (!confirm(`${label}を消しますか？`)) return;
    const before = structuredClone(state);
    wipe(state); save(); refreshHave(); routes.settings();
    toast(`${label}を消しました`, { label: "元に戻す", run: () => { state = before; save(); refreshHave(); render(); } });
  }));
  view.querySelector("#clrall").onclick = async () => {
    if (!confirm("保存したデータ（進行チェック・護石・マイセット・作成済み装備・友達のデータ・シミュの入力）とキャッシュを全部消します。取り消せません。よろしいですか？")) return;
    clearTimeout(saveTimer);
    try { localStorage.removeItem(STORE_KEY); } catch { /* storage blocked: nothing saved anyway */ }
    await clearCaches();
    location.replace(location.pathname);
  };
  view.querySelector("#exp").onclick = () => exportAll();
  view.querySelector("#imp").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s.app !== "karitomo" || s.version !== 1 || !Array.isArray(s.cleared) || !Array.isArray(s.charms)) throw new Error("bad file");
      const before = state;
      const d = structuredClone(DEFAULT_STATE);
      state = { ...d, cleared: s.cleared.filter((x) => typeof x === "string"), charms: s.charms.filter((c) => c && typeof c.skills === "object"), sets: Array.isArray(s.sets) ? s.sets.filter((x) => x && Array.isArray(x.pieces) && x.pieces.length === 5) : [],
        owned: Array.isArray(s.owned) ? s.owned.filter((x) => typeof x === "string") : [], ownedW: s.ownedW && typeof s.ownedW === "object" ? s.ownedW : {},
        items: s.items && typeof s.items === "object" && !Array.isArray(s.items) ? Object.fromEntries(Object.entries(s.items).filter(([, n]) => Number.isInteger(n) && n >= 0)) : {},
        files: Array.isArray(s.files) ? s.files.filter((f) => f && typeof f.name === "string" && f.data && Array.isArray(f.data.charms) && Array.isArray(f.data.owned)) : [],
        friends: Array.isArray(s.friends) ? s.friends.filter((f) => f && typeof f.name === "string") : [], prefs: { ...d.prefs, ...s.prefs } };
      draft = null; dirty = false;
      save(); refreshHave();
      toast("読み込みました", { label: "元に戻す", run: () => { state = before; save(); refreshHave(); render(); } });
    } catch { toast("このファイルは読み込めません。このアプリでエクスポートしたファイルか確かめてください。"); }
  };
};

// ---------------------------------------------------------------- start

loadData().then(async () => {
  try { D.mapLayouts = await fetch("data/maplayouts.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.notes = await fetch("data/monnotes.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.skillDetails = await fetch(isEn() ? "data/skilldetails_en.json" : "data/skilldetails.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.carryRoutes = await fetch("data/carryroutes.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.breaks = await fetch("data/breaks.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.arena = await fetch("data/arena.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.crowns = await fetch("data/crowns.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.hazards = await fetch("data/hazards.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.randomq = new Set(await fetch("data/randomq.json").then((r) => (r.ok ? r.json() : []))); } catch { /* optional */ }
  try { D.presets = await fetch("data/presets.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.questcond = await fetch("data/questcond.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.clients = await fetch("data/clients.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.meals = await fetch("data/meals.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.nyanter = await fetch("data/nyanter.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { D.shop = await fetch("data/shop.json").then((r) => (r.ok ? r.json() : null)); refreshHave(); } catch { /* optional */ }
  try { D.arts = await fetch("data/huntarts.json").then((r) => (r.ok ? r.json() : null)); } catch { /* optional */ }
  try { const mod = await import("./rank.js?v=1.0.0"); weaponRanking = () => mod.render({ view, D, have, state, save, esc, fmt, rareTag }); } catch { /* not built yet */ }
  render();
  if (OBS) mirrorIn(); // open on the page the dock shows
}).catch((e) => { view.innerHTML = `<p>データを読み込めませんでした。通信状態を確かめて、ページを再読み込みしてください。</p><p class="muted">${esc(e)}</p>`; });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// デバッグモード: crash tracking and (optional) log start right away, so later failures are caught too
if (state.prefs.debug) {
  dbg.setLogging(state.prefs.logOn);
  dbg.startSession(VERSION, location.hash);
  addEventListener("error", (e) => dbg.log(`エラー: ${e.message} ${e.filename || ""}:${e.lineno || ""}`));
  addEventListener("unhandledrejection", (e) => dbg.log(`エラー: ${e.reason && e.reason.message || e.reason}`));
}
