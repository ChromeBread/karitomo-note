// Drives headless Edge over the DevTools protocol: phone-size viewport, sets a saved
// state, runs the simulator and saves screenshots. Needs `py -m http.server 8765` running.
// Run: node tests/browser-check.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "E:/Claude/karitomo_test";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8765/";
mkdirSync(OUT, { recursive: true });
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--user-data-dir=${OUT}/cdp-profile`, "--remote-debugging-port=9333", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
async function connect() {
  for (let k = 0; k < 40; k++) {
    try {
      const list = await (await fetch("http://127.0.0.1:9333/json")).json();
      const page = list.find((t) => t.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value || a.description).join(" "));
  };
}
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
}
async function nav(hash, wait = 1500) { await evalJs(`location.hash = ${JSON.stringify(hash)}`); await sleep(wait); }

try {
  await connect();
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: BASE });
  await sleep(2500);
  // saved state: cleared everything up to 集会所★7, attack+15 & 見切り+1 wanted
  await evalJs(`(async () => {
    const qs = await fetch('data/quests.json').then(r => r.json());
    const cleared = qs.filter(q => q.vendor === '村' || (q.vendor === '集会所' && !/Ｇ/.test(q.tab))).map(q => q.id);
    localStorage.setItem('karitomo.v1', JSON.stringify({version:1, cleared, charms:[{skills:{攻撃:5}, slots:2}], prefs:{type:1, gender:1, weaponSlots:1, onlyMakeable:true, useCharms:true, targets:{攻撃:15, 達人:10}}}));
  })()`);
  await send("Page.navigate", { url: BASE + "?r=1#sim" });
  await sleep(2500);
  await shot("m_sim_before");
  // picker: open 剣士 group, tap 匠, pick +1, check it lands in targets
  await evalJs(`(() => { const d = [...document.querySelectorAll('#picker details')].find(x => x.textContent.startsWith('剣士')); d.open = true; d.querySelector('[data-tree="匠"]').click(); })()`);
  await sleep(300);
  await shot("m_sim_picker");
  await evalJs(`document.querySelector('[data-eff="匠"][data-p="10"]').click()`);
  await sleep(300);
  if (await evalJs(`JSON.parse(localStorage.getItem('karitomo.v1')).prefs.targets['匠']`) !== 10) errors.push("picker did not set 匠+10");
  await evalJs(`(() => { const d = [...document.querySelectorAll('#picker details')].find(x => x.textContent.startsWith('剣士')); d.querySelector('[data-tree="匠"]').click(); })()`);
  await sleep(300);
  await evalJs(`document.querySelector('[data-eff="匠"][data-p="10"]').click()`);
  await sleep(300);
  if (await evalJs(`'匠' in JSON.parse(localStorage.getItem('karitomo.v1')).prefs.targets`)) errors.push("picker did not remove 匠");
  await evalJs(`document.querySelector('#run').click()`);
  for (let k = 0; k < 60; k++) { await sleep(500); if (await evalJs(`!!document.querySelector('#stop')?.hidden`)) break; }
  const status = await evalJs(`document.querySelector('#status').textContent`);
  // 一覧 (default view): two short lines per result, so many fit on one phone screen
  const listN = await evalJs(`document.querySelectorAll('tbody.rl').length`);
  const rowH = await evalJs(`document.querySelector('tbody.rl')?.getBoundingClientRect().height || 0`);
  console.log(JSON.stringify({ listRows: listN, listRowHeight: rowH }));
  if (!(listN > 0 && rowH > 0 && rowH < 80)) errors.push(`list view: ${listN} rows, ${rowH}px each`);
  await evalJs(`document.querySelector('[data-rview=card]').click()`); await sleep(500);
  const n = await evalJs(`document.querySelectorAll('.result').length`);
  await shot("m_sim_after");
  const cardH = await evalJs(`document.querySelector('.result.compact')?.getBoundingClientRect().height || 0`);
  console.log(JSON.stringify({ resultCardHeight: cardH, perScreen: Math.floor(844 / (cardH || 1)) }));
  if (!(cardH > 0 && cardH < 230)) errors.push(`result card too tall: ${cardH}`);
  // extra-skill search, save to マイセット, pin a piece
  await evalJs(`document.querySelector('#xs').click()`);
  for (let k = 0; k < 240; k++) { await sleep(500); if (await evalJs(`!document.querySelector('#xs').disabled`)) break; }
  const extra = await evalJs(`document.querySelector('#xsst').textContent`);
  const extraN = await evalJs(`document.querySelectorAll('#xschips .chip').length`);
  if (!extraN) errors.push("extra-skill search found nothing: " + extra);
  await shot("m_sim_extra");
  await evalJs(`document.querySelector('[data-act="save"][data-n="0"]').click()`);
  await sleep(300);
  const pinName = await evalJs(`(() => { const b = document.querySelector('[data-act="pin"][data-n="0"][data-part="0"]'); const n = b.closest('tr').querySelector('a').textContent; b.click(); return n; })()`);
  await sleep(300);
  const st = await evalJs(`JSON.parse(localStorage.getItem('karitomo.v1'))`);
  if (st.sets?.length !== 1) errors.push("マイセット not saved");
  if (st.prefs.pinned?.[0] !== pinName) errors.push("pin not saved");
  await evalJs(`document.querySelector('#run').click()`);
  for (let k = 0; k < 60; k++) { await sleep(500); if (await evalJs(`!!document.querySelector('#stop')?.hidden`)) break; }
  const pinnedOk = await evalJs(`[...document.querySelectorAll('.result')].every(r => r.querySelector('.pieces a').textContent === ${JSON.stringify(pinName)})`);
  if (!pinnedOk) errors.push("pinned piece not used in all results");
  await evalJs(`document.querySelector('[data-unpin]').click()`);
  await sleep(300);
  await nav("#sim/sets/0");
  await shot("m_sim_set");
  console.log(JSON.stringify({ extra, extraN, pinName }));
  const overflow = await evalJs(`document.documentElement.scrollWidth > innerWidth`);
  // charm import from the other simulator's CSV export (one charm already registered in the seed)
  await nav("#charms");
  await evalJs(`(() => { document.querySelector('#charms details, details').open = true; document.querySelector('#ctext').value = ',0,寒冷適応,4,運気,7\\n,3,弾薬節約,3,属性耐性,-2\\n,2,攻撃,5'; document.querySelector('#cimp').click(); })()`);
  await sleep(300);
  const nCharms = await evalJs(`JSON.parse(localStorage.getItem('karitomo.v1')).charms.length`);
  if (nCharms !== 3) errors.push(`charm import: expected 3 charms, got ${nCharms}`);
  await shot("m_charms_import");
  for (const h of ["progress", "find", "sim/list", "mons", "mons/60036/bomb", "maps/古代林", "rank", "charms", "settings", "find/weapon/4608b/鬼斬破", "progress/特殊許可|1", "find/wtype/太刀", "find/rare/8", "find/decos"]) {
    await nav("#" + h);
    if (h === "mons") { await evalJs(`(() => { const w = document.querySelector(".table-wrap"); w.scrollTop = 900; w.scrollLeft = 120; })()`); await sleep(300); }
    if (h === "find") { await evalJs(`(() => { const i = document.querySelector('#q'); i.value = 'りゅうのなみだ'; i.dispatchEvent(new Event('input')); })()`); await sleep(500); }
    await shot("m_" + h.replace(/\W/g, "_"));
    if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push(`horizontal overflow on #${h}`);
  }
  // owned mark on a set, then share text round trip as a friend
  await nav("#sim/sets/0");
  await evalJs(`(() => { const c = document.querySelector('[data-own]'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
  await sleep(400);
  if (!(await evalJs(`JSON.parse(localStorage.getItem('karitomo.v1')).owned.length`))) errors.push("owned mark not saved");
  await nav("#share");
  await evalJs(`(() => { document.querySelector('#nm').value = 'テスト'; document.querySelectorAll('[data-k]').forEach(c => c.checked = true); document.querySelector('#mk').click(); })()`);
  await sleep(800);
  const shared = await evalJs(`document.querySelector('#out').value`);
  if (!/^\d{6}_.+_テスト\nKARITOMO1 /.test(shared || "")) errors.push(`share text: ${String(shared).slice(0, 80)}`);
  await evalJs(`(() => { document.querySelector('#in').value = ${JSON.stringify("")} + document.querySelector('#out').value.replace('"name":"テスト"', '"name":"Bさん"'); document.querySelector('#rd').click(); })()`);
  await sleep(500);
  const fr = await evalJs(`JSON.parse(localStorage.getItem('karitomo.v1')).friends`);
  if (fr?.length !== 1 || fr[0].name !== "Bさん" || !fr[0].sets?.length || !fr[0].cleared) errors.push(`friend import: ${JSON.stringify(fr)?.slice(0, 120)}`);
  for (const h of ["share", "share/0", "share/0/set/0", "find/quest/48e3b", "find/mix", "find/item/05b35"]) {
    await nav("#" + h);
    await shot("m_" + h.replace(/\W/g, "_"));
    if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push(`horizontal overflow on #${h}`);
  }
  await nav("#find/quest/48e3b");
  if (!(await evalJs(`document.body.textContent.includes('捕獲したとき')`))) errors.push("quest page lacks kill/capture section");
  const store = `JSON.parse(localStorage.getItem('karitomo.v1') || 'null')`;
  // 0.4.0 pages: editor save-as, compare, charm helper, spec, unlock preview, prep icons, sleep immunity, theme
  await nav("#edit");
  await evalJs(`document.querySelector('[data-etab="items"]').click()`);
  await sleep(200);
  await evalJs(`(() => { document.querySelector('#iadd').value = '回復薬'; document.querySelector('#iaddb').click(); })()`);
  await sleep(300);
  await evalJs(`(() => { window.prompt = () => 'テスト保存'; document.querySelector('#fsaveas').click(); })()`);
  await sleep(500);
  const st4 = await evalJs(store);
  if (st4.files?.[0]?.name !== "テスト保存" || !Object.keys(st4.items || {}).length) errors.push(`editor save-as: ${JSON.stringify(st4.files)?.slice(0, 100)}`);
  const laoId = await evalJs(`fetch('data/monsters.json').then(r => r.json()).then(m => m.find(x => x.name === 'ラオシャンロン').id)`);
  const volcanoQ = await evalJs(`fetch('data/quests.json').then(r => r.json()).then(q => q.find(x => x.map === '火山' && x.mons.length).id)`);
  for (const h of ["edit", "sim/compare/0,0", "charms/help", "spec/sleep", "spec/evade", `progress/${encodeURIComponent("集会所|Ｇ★１")}`, `find/quest/${volcanoQ}`, `mons/${laoId}/bomb/x`, "find/item/05b35"]) {
    await nav("#" + h);
    await shot("v4_" + h.replace(/\W/g, "_"));
    if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push(`horizontal overflow on #${h}`);
  }
  await nav(`#mons/${laoId}/bomb/x`);
  if (!(await evalJs(`document.body.textContent.includes('眠りません')`))) errors.push("sleep-immune monster still shows bomb calc");
  // sleep hits: Rathalos needs 180 for the first sleep -> 8 hits at 25
  const reusId = await evalJs(`fetch('data/monsters.json').then(r => r.json()).then(m => m.find(x => x.name === 'リオレウス').id)`);
  await nav(`#mons/${reusId}/bomb/x`);
  await evalJs(`(() => { const i = document.querySelector('#sps'); i.value = '25'; i.dispatchEvent(new Event('input')); })()`);
  const hits = await evalJs(`document.querySelector('#spsout').textContent`);
  await shot("v4_sleep_hits");
  if (!/1回目 8発（180）/.test(hits)) errors.push(`sleep hits: ${hits}`);
  await nav(`#find/quest/${volcanoQ}`);

  if (!(await evalJs(`!!document.querySelector('.prep')`))) errors.push("no prep icons on a volcano quest");
  // ammo search and bowgun ammo table
  await nav(`#find/ammo/${encodeURIComponent("睡眠弾 LV1")}`);
  await shot("v4_ammo_sleep1");
  const ammoRows = await evalJs(`document.querySelectorAll('.list li').length`);
  if (!(ammoRows > 5)) errors.push(`ammo search rows: ${ammoRows}`);
  await evalJs(`document.querySelector('.list li a').click()`);
  await sleep(800);
  await shot("v4_bowgun_page");
  if (!(await evalJs(`/リロード/.test(document.body.textContent) && /睡眠弾 LV1/.test(document.body.textContent)`))) errors.push("bowgun page lacks ammo table");
  for (const h of ["find/ammo", "spec/fixed", "spec/bowgun"]) {
    await nav("#" + h);
    await shot("v4_" + h.replace(/\W/g, "_"));
    if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push(`horizontal overflow on #${h}`);
  }
  // quest map, arena note, decoration effects, upgrade path, skill sort
  const reusQ = await evalJs(`fetch('data/quests.json').then(r => r.json()).then(q => q.find(x => x.map === '地底火山' && x.mons.length === 1 && x.mstats?.length).id)`);
  await nav(`#find/quest/${reusQ}`);
  await shot("v5_quest_map");
  if (!(await evalJs(`!!document.querySelector('#qmap svg .start')`))) errors.push("quest map lacks start area");
  const taN = await evalJs(`document.querySelectorAll('#ta a.chip').length`);
  await evalJs(`(() => { const s = document.querySelector('#tag'); s.value = 'MHGU'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const taHref = await evalJs(`document.querySelector('#ta a.chip').href`);
  if (taN !== 14 || !/MHGU/.test(decodeURIComponent(taHref)) || !/Great%20Sword|Great\+Sword|Great Sword/.test(decodeURIComponent(taHref))) errors.push(`TA links: ${taN} ${taHref}`);
  // delivery routes: egg (by hand) and a gathered item; duplicate-name note; two-colour weakness name
  await nav("#find/quest/4785d");
  await shot("v6_delivery_egg");
  const egg = await evalJs(`document.querySelector('#dv')?.textContent || ''`);
  if (!/モドリ玉では持ち帰れません/.test(egg) || !/必ず乱入/.test(await evalJs(`document.body.textContent`))) errors.push(`egg delivery / dup note: ${egg.slice(0, 80)}`);
  await nav("#find/quest/4868d");
  await shot("v6_carry_known");
  if (!/2個目: 7 → 9 → 1 → BC/.test(await evalJs(`document.querySelector('#dv')?.textContent || ''`))) errors.push("known carry route missing");
  await nav(`#sim/list/${encodeURIComponent("達人")}`);
  await shot("v6_skill_details");
  if (!/会心率\+30%/.test(await evalJs(`document.querySelector('#out').textContent`))) errors.push("skill numeric detail missing");
  await nav("#sim");
  await evalJs(`(() => { const s = document.querySelector('#psort'); s.value = 'kana'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(400);
  if (!/五十音順/.test(await evalJs(`document.querySelector('#picker').textContent`))) errors.push("sim skill sort broken");
  await evalJs(`(() => { const s = document.querySelector('#psort'); s.value = 'cat'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  await nav("#find/quest/4ad59");
  await shot("v6_carry_desert");
  if (!/卵まで: BC → 6 → 5 → 10/.test(await evalJs(`document.querySelector('#dv')?.textContent || ''`))) errors.push("desert egg go-route missing");
  // ハンター / ニャンター filter on a group with both
  await nav(`#progress/${encodeURIComponent("村|★８")}`);
  const all8 = await evalJs(`document.querySelectorAll('.list input[data-q]').length`);
  await evalJs(`document.querySelector('[data-qf="nyanter"]').click()`);
  await sleep(300);
  const hunterOnly = await evalJs(`document.querySelectorAll('.list input[data-q]').length`);
  await shot("v7_quest_filter");
  await evalJs(`document.querySelector('[data-qf="nyanter"]').click()`);
  await sleep(300);
  if (!(hunterOnly > 0 && hunterOnly < all8)) errors.push(`quest filter: ${all8} -> ${hunterOnly}`);
  // HR cap search
  await nav("#sim");
  await evalJs(`(() => { const s = document.querySelector('#hrcap'); s.value = '★７'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(400);
  await evalJs(`document.querySelector('#run').click()`);
  for (let k = 0; k < 60; k++) { await sleep(500); if (await evalJs(`!!document.querySelector('#stop')?.hidden`)) break; }
  const hrStatus = await evalJs(`document.querySelector('#status').textContent`);
  console.log(JSON.stringify({ hrStatus }));
  if (!/件|見つかりません/.test(hrStatus)) errors.push(`HR search: ${hrStatus}`);
  await evalJs(`(() => { const s = document.querySelector('#hrcap'); s.value = ''; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  // debug mode: turn on, run the safe tests, then fake a crash (session left "open" during a test) and reload
  await nav("#settings");
  await evalJs(`document.querySelector("#dbgbtn").click()`);
  await sleep(400);
  if (!(await evalJs(`!!document.querySelector("#logbtn")`))) errors.push("debug section not shown");
  await nav("#debug");
  await evalJs(`document.querySelector("#runsafe").click()`);
  for (let k = 0; k < 80; k++) { await sleep(500); if ((await evalJs(`(JSON.parse(localStorage.getItem("karitomo.diag.v1") || "{}").results || []).length`)) >= 5 && !(await evalJs(`JSON.parse(localStorage.getItem("karitomo.diag.v1") || "{}").running`))) break; }
  await sleep(800);
  await shot("v7_debug_results");
  const diagN = await evalJs(`(JSON.parse(localStorage.getItem("karitomo.diag.v1") || "{}").results || []).filter(r => !r.bad).length`);
  if (diagN < 5) errors.push(`debug safe tests: ${diagN} ok`);
  await evalJs(`(() => { localStorage.setItem("karitomo.session.v1", JSON.stringify({ state: "open", at: "test", page: "#debug", version: "x" })); const d = JSON.parse(localStorage.getItem("karitomo.diag.v1")); d.running = "fake"; localStorage.setItem("karitomo.diag.v1", JSON.stringify(d)); const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k !== "karitomo.session.v1" && k !== "karitomo.diag.v1") o.call(this, k, v); }; })()`);
  await send("Page.reload", { ignoreCache: false });
  await sleep(3000);
  await nav("#debug");
  await shot("v7_debug_crash");
  const crashTxt = await evalJs(`document.body.textContent`);
  if (!/表示中に終わった/.test(crashTxt) || !/fake/.test(crashTxt)) errors.push("fake crash not detected");
  await nav("#settings");
  await evalJs(`document.querySelector("#dbgbtn").click()`);
  await sleep(300);
  const mushQ = await evalJs(`fetch('data/quests.json').then(r => r.json()).then(q => q.find(x => /^特産キノコ/.test(x.goal)).id)`);
  await nav(`#find/quest/${mushQ}`);
  await shot("v6_delivery_mushroom");
  if (!/モドリ玉/.test(await evalJs(`document.querySelector('#dv')?.textContent || ''`)) || !(await evalJs(`document.querySelectorAll('#dv .steps li').length`))) errors.push("mushroom delivery route missing");
  await nav("#mons");
  if (!(await evalJs(`[...document.querySelectorAll('a .multi-el')].some(a => a.textContent.includes('アオアシラ') && a.querySelectorAll('[class^=el-]').length > 1)`))) errors.push("アオアシラ not two-coloured");
  await shot("v6_mons_colors");
  // scroll: a new page starts at the top even after scrolling far down a long one; back restores it
  await nav("#find/clients", 2500);
  await evalJs(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(300);
  const deep = await evalJs(`window.scrollY`);
  await nav("#settings");
  const onNew = await evalJs(`window.scrollY`);
  await evalJs(`history.back()`); await sleep(1500);
  const onBack = await evalJs(`window.scrollY`);
  console.log(JSON.stringify({ scrollDeep: deep, scrollNewPage: onNew, scrollBack: onBack }));
  if (onNew !== 0) errors.push(`new page did not start at the top: ${onNew}`);
  if (deep > 500 && Math.abs(onBack - deep) > 50) errors.push(`back did not restore the scroll: ${onBack} (was ${deep})`);
  const arenaQ = await evalJs(`fetch('data/quests.json').then(r => r.json()).then(q => q.find(x => x.vendor === '闘技大会').id)`);
  await nav(`#find/quest/${arenaQ}`);
  if (!(await evalJs(`/持ち込めません/.test(document.body.textContent) && !/持っていくと便利/.test(document.body.textContent)`))) errors.push("arena quest still suggests bring items");
  const decoId = await evalJs(`fetch('data/decos.json').then(r => r.json()).then(d => d.find(x => x.name === '鉄壁珠【２】' || x.name === '鉄壁珠【2】')?.id)`);
  await nav(`#find/item/${decoId}`);
  await shot("v5_deco_effects");
  if (!(await evalJs(`/ガード性能 の効果/.test(document.body.textContent) && /体術 の効果/.test(document.body.textContent)`))) errors.push("decoration page lacks skill effects");
  const mid = await evalJs(`fetch('data/weapons.json').then(r => r.json()).then(w => { const x = w.find(a => a.name === 'ミッドナイトグレイブ'); return x && x.id + '/' + encodeURIComponent(x.name); })`);
  await nav(`#find/weapon/${mid}`);
  await shot("v5_upgrade_path");
  if (!(await evalJs(`/強化の道のり/.test(document.body.textContent) && document.querySelectorAll('.steps li').length > 0`))) errors.push("upgrade path missing");
  if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push("horizontal overflow on upgrade path");
  await nav("#charms/new");
  await evalJs(`(() => { const s = document.querySelector('.tsort'); s.value = 'kana'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  const firstOpt = await evalJs(`document.querySelector('#t0').options[1].textContent`);
  if (!firstOpt) errors.push("skill sort select broken");
  console.log(JSON.stringify({ kanaFirstSkill: firstOpt }));
  await nav(`#find/weapon/04094/${encodeURIComponent("ディシジョン")}`);

  await shot("v4_weapon_tree");
  if (!(await evalJs(`document.querySelectorAll('.wtree li').length > 1 && !!document.querySelector('.wtree li.here')`))) errors.push("weapon tree missing");
  if (await evalJs(`document.documentElement.scrollWidth > innerWidth`)) errors.push("horizontal overflow on weapon tree");
  // minimum defense: every result must reach it
  await nav("#sim");
  await evalJs(`(() => { const i = document.querySelector('#mind'); i.value = '500'; i.dispatchEvent(new Event('change')); document.querySelector('#run').click(); })()`);
  for (let k = 0; k < 60 && !(await evalJs(`/件見つかりました|見つかりませんでした/.test(document.querySelector('#status').textContent)`)); k++) await sleep(500);
  const defs = await evalJs(`[...document.querySelectorAll('.result')].map(c => +(c.textContent.match(/防御 最大([0-9]+)/) || [])[1])`);
  await shot("v4_sim_mindef");
  if (defs.some((d) => d < 500)) errors.push(`min defense ignored: ${defs.slice(0, 5)}`);
  console.log(JSON.stringify({ minDefResults: defs.length, lowest: Math.min(...defs) }));
  await evalJs(`document.querySelector('#themebtn').click()`);

  await sleep(300);
  const th = await evalJs(`document.documentElement.dataset.theme`);
  await shot("v4_theme_" + th);
  if (!th) errors.push("theme toggle did nothing");
  // settings: partial clear + undo, cache clear, full wipe
  await nav("#settings");
  await evalJs(`window.confirm = () => true; document.querySelector('[data-clr="sim"]').click()`);
  await sleep(500);
  if (Object.keys((await evalJs(store)).prefs.targets).length) errors.push("clear sim input failed");
  if (!(await evalJs(store)).charms.length) errors.push("clear sim input also wiped charms");
  await evalJs(`document.querySelector('#toast button').click()`);
  await sleep(500);
  if (!Object.keys((await evalJs(store)).prefs.targets).length) errors.push("undo of clear sim input failed");
  await evalJs(`document.querySelector('#clrcache').click()`);
  await sleep(2500);
  if (await evalJs(`caches.keys().then(k => k.length)`) > 1) errors.push("cache clear left caches");
  if (!(await evalJs(store))) errors.push("cache clear wiped saved data");
  await nav("#settings");
  await evalJs(`window.confirm = () => true; document.querySelector('#clrall').click()`);
  await sleep(2500);
  const after = await evalJs(store);
  if (after && (after.charms.length || after.cleared.length)) errors.push("full wipe left saved data");
  console.log(JSON.stringify({ status, results: n, overflowSim: overflow, errors }, null, 1));
} finally {
  proc.kill();
}
