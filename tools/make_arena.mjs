// 闘技大会 TA records per quest and weapon, from the record index page saved in tools/cache/ta/arena.html
// (tables of pairs of rows: quest name + weapon columns, then "time hunter" cells; "--" = no record).
// Run: node tools/make_arena.mjs -> data/arena.json {questId: {weapons:[...], solo:[{w,time,sec,who}], pair:{...}}}
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const quests = JSON.parse(readFileSync(new URL("data/quests.json", root), "utf8"));
const h = readFileSync(new URL("tools/cache/ta/arena.html", root), "utf8");
const cellText = (c) => c.replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// short weapon names used by the page -> the names the app uses
const W = { 大剣: "大剣", 太刀: "太刀", 片手剣: "片手剣", 双剣: "双剣", 鎚: "ハンマー", 笛: "狩猟笛", 槍: "ランス", 銃槍: "ガンランス", 剣斧: "スラッシュアックス", 盾斧: "チャージアックス", 操虫棍: "操虫棍", 軽弩: "ライトボウガン", 重弩: "ヘビィボウガン", 弓: "弓" };
const wname = (s) => s.split(" x ").map((x) => W[x.trim()] || x.trim()).join(" と ");
const toSec = (t) => { const m = t.match(/(\d+)'(\d+)"(\d+)/); return m ? +m[1] * 60 + +m[2] + +m[3] / 100 : null; };
const N = (s) => s.normalize("NFKC").replace(/[\s・･、。!?！？…‥.~～ー-]/g, "");

const out = {}, miss = [];
for (const table of h.split(/<table/).slice(1)) {
  const rows = table.split(/<tr[^>]*>/).slice(1).map((r) => r.split(/<t[dh][^>]*>/).slice(1).map(cellText));
  for (let i = 0; i + 1 < rows.length; i++) {
    const head = rows[i], cells = rows[i + 1];
    if (!head[0] || head[0] === "" || head.length < 3 || !cells.some((c) => /\d+'\d+"\d+|^--$/.test(c))) continue;
    const name = head[0], cols = head.slice(1);
    const recs = cols.map((w, k) => {
      const c = cells[k] || "", m = c.match(/^(\d+'\d+"\d+)\s*(.*)$/);
      return { w: wname(w), pair: / x /.test(w), time: m ? m[1] : null, sec: m ? toSec(m[1]) : null, who: m ? m[2] : "" };
    }).filter((r) => r.w);
    // the page leaves out the "イベント：" prefix of the X event quests ("リオレウス討伐(イベント)" too)
    const find = (n) => quests.filter((q) => q.vendor === "闘技大会" && N(q.name) === N(n));
    let qs = find(name);
    if (!qs.length) qs = find(`イベント：${name.replace(/\(イベント\)$/, "")}`);
    if (!qs.length) { miss.push(name); i++; continue; }
    const entry = { solo: recs.filter((r) => !r.pair).map(({ pair, ...r }) => r), pair: recs.filter((r) => r.pair).map(({ pair, ...r }) => r) };
    for (const q of qs) out[q.id] ||= entry;
    i++;
  }
}
// Records from public leaderboard JSON (3DS / Switch / the previous 3DS game), saved in tools/cache/ta/runs:
// game_<g>.json (levels, variables) and <g>_<level>_<category>.json. The fastest per weapon replaces the
// record above when it is faster; src says which version the run was on.
const RUN_GAMES = { mhxx: { src: "XX", solo: "zd3l6ovd", pair: "9kvjm68k" }, mhgenu: { src: "GU", solo: "xd17w1rd", pair: "zd375vy2" }, mhx: { src: "X", solo: "jdrq0jgk", pair: "jdz34132" } };
const EN = { Malfestio: "ホロロホルル討伐", Khezu: "フルフル討伐", Najarala: "ガララアジャラ討伐", Rathalos: "リオレウス討伐", "Kecha Wacha": "ケチャワチャ討伐", Plesioth: "ガノトトス討伐",
  Brachydios: "ブラキディオス討伐", Barioth: "ベリオロス討伐", "Yian Garuga": "イャンガルルガ討伐", Uragaan: "ウラガンキン討伐", Seregios: "セルレギオス討伐", "Great Maccao": "ドスマッカォ討伐",
  Gypceros: "ゲリョス討伐", "Bird Wyvern": "鳥竜種２頭討伐", "Bird Wyverns": "鳥竜種２頭討伐", Barroth: "ボルボロス討伐", Tetsucabra: "テツカブラ討伐", Congalala: "ババコンガ討伐",
  "Event: Slay an Astalos": "イベント：ライゼクス討伐", "XX Trials: Hunt-a-thon II": "ＸＸイベント：大連続狩猟２" };
const WEN = { "Great Sword": "大剣", "Long Sword": "太刀", "Sword and Shield": "片手剣", "Dual Blades": "双剣", Hammer: "ハンマー", "Hunting Horn": "狩猟笛", Lance: "ランス", Gunlance: "ガンランス",
  "Switch Axe": "スラッシュアックス", "Charge Blade": "チャージアックス", "Insect Glaive": "操虫棍", "Light Bowgun": "ライトボウガン", "Heavy Bowgun": "ヘビィボウガン", Bow: "弓", Prowler: "ニャンター", "Prowler / Nyanta": "ニャンター", Multiple: "いろいろ" };
const fmtT = (sec) => `${Math.floor(sec / 60)}'${String(Math.floor(sec % 60)).padStart(2, "0")}"${String(Math.round((sec % 1) * 100)).padStart(2, "0")}`;
const runDir = new URL("tools/cache/ta/runs/", root);
let added = 0;
for (const [g, cfg] of Object.entries(RUN_GAMES)) {
  let game;
  try { game = JSON.parse(readFileSync(new URL(`game_${g}.json`, runDir), "utf8")).data; } catch { continue; } // runs not fetched
  const wvar = game.variables.data.find((v) => v.name === "Weapon");
  for (const lv of game.levels.data) {
    const m = lv.name.match(/^闘技大会 : (.+)$/) || lv.name.match(/^Arena(?: DLC)?(?: - Grudge Match)?: (.+)$/);
    if (!m) continue;
    const qname = g === "mhxx" ? m[1] : EN[m[1]];
    const qs = quests.filter((q) => q.vendor === "闘技大会" && q.name === qname);
    if (!qs.length) { miss.push(lv.name); continue; }
    for (const kind of ["solo", "pair"]) {
      let lb;
      try { lb = JSON.parse(readFileSync(new URL(`${g}_${lv.id}_${cfg[kind]}.json`, runDir), "utf8")).data; } catch { continue; }
      const names = Object.fromEntries((lb.players?.data || []).map((p) => [p.id || p.name, p.names?.international || p.name]));
      for (const { run } of lb.runs) {
        const sec = run.times.primary_t, wl = wvar?.values.values[run.values[wvar.id]]?.label;
        const w0 = WEN[wl] || wl || "いろいろ";
        // a 2-player run names one weapon (the runner's); the partner's is unknown
        const w = kind === "pair" && w0 !== "いろいろ" ? `${w0} ほか` : w0;
        const who = run.players.map((p) => names[p.id || p.name] || p.name || "").join(" / ");
        for (const q of qs) {
          const e = (out[q.id] ||= { solo: [], pair: [] });
          const list = e[kind], old = list.find((r) => r.w === w);
          if (old && old.sec != null && old.sec <= sec) continue;
          const rec = { w, time: fmtT(sec), sec, who, src: cfg.src };
          if (old) Object.assign(old, rec); else list.push(rec);
          added++;
        }
      }
    }
  }
}
// rank time limits and rank rewards (tools/extra/arena_rank.json): rank = {t: [S, A, B] seconds | null, S, A, note?}
const RANK = JSON.parse(readFileSync(new URL("tools/extra/arena_rank.json", root), "utf8"));
for (const [name, r] of Object.entries(RANK)) {
  if (name.startsWith("_")) continue;
  const qs = quests.filter((q) => q.vendor === "闘技大会" && q.name === name);
  if (!qs.length) miss.push(`rank: ${name}`);
  for (const q of qs) (out[q.id] ||= { solo: [], pair: [] }).rank = { ...r, t: r.t && r.t.map((m) => m * 60) };
}
for (const e of Object.values(out)) for (const r of [...e.solo, ...e.pair]) if (r.time && !r.src) r.src = "XX";
writeFileSync(new URL("data/arena.json", root), JSON.stringify(out) + "\n");
console.log(`runs merged: ${added}; records for ${Object.keys(out).length} quests; not matched: ${miss.length}${miss.length ? "\n" + miss.join("\n") : ""}`);
