// Copy-paste text for showing gear to friends. No DOM, so tests can run it in node.
// Text: a header line people can read ("261122_マイセット・護石_Aさん") and one data line
// "KARITOMO1 {json}". Cleared quests are a bitset over the sorted quest ids so the text
// stays short enough for one chat message.

export const KINDS = { sets: "マイセット", charms: "護石", owned: "作成済み装備", cleared: "進行チェック", itemSets: "アイテムマイセット", dl: "配信クエスト", items: "アイテム所持数", card: "ギルドカード" };
const MARK = "KARITOMO1 ";

const yymmdd = (d) => `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

function packBits(all, on) {
  const bytes = new Uint8Array(Math.ceil(all.length / 8));
  all.forEach((id, i) => { if (on.has(id)) bytes[i >> 3] |= 1 << (i & 7); });
  return btoa(String.fromCharCode(...bytes));
}
function unpackBits(all, b64) {
  const bin = atob(b64);
  return all.filter((_, i) => (bin.charCodeAt(i >> 3) >> (i & 7)) & 1);
}

// state: {cleared, charms, sets, owned, ownedW, itemSets, dl}; dl = downloaded event quest ids (bitset like cleared); kinds: subset of KINDS keys; questIds: every quest id
export function encodeShare(state, kinds, name, questIds, now = new Date()) {
  const all = [...questIds].sort();
  const d = { name, date: yymmdd(now) };
  if (kinds.includes("sets")) d.sets = state.sets;
  if (kinds.includes("charms")) d.charms = state.charms;
  if (kinds.includes("owned")) { d.owned = state.owned; d.ownedW = state.ownedW; }
  if (kinds.includes("cleared")) { d.cleared = packBits(all, new Set(state.cleared)); d.nq = all.length; }
  if (kinds.includes("itemSets")) d.itemSets = state.itemSets || [];
  if (kinds.includes("dl")) { d.dl = packBits(all, new Set(state.dl || [])); d.nq = all.length; }
  if (kinds.includes("items")) { d.items = state.items || {}; if (state.itemsChk) d.itemsChk = state.itemsChk; }
  if (kinds.includes("card") && state.card) d.card = state.card;
  const label = kinds.map((k) => KINDS[k]).join("・");
  return `${d.date}_${label}_${name}\n${MARK}${JSON.stringify(d)}`;
}

const str = (x, max = 60) => (typeof x === "string" ? x.slice(0, max) : "");
const skills = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {})
  .filter(([k, v]) => typeof k === "string" && Number.isInteger(v)).slice(0, 4).map(([k, v]) => [k.slice(0, 20), v]));
// name: charm type in a myset (城塞の護石); chk: why this reading needs a check (blurry video)
const charm = (c) => ({ ...(typeof c?.name === "string" ? { name: str(c.name, 20) } : {}), skills: skills(c?.skills), slots: Math.max(0, Math.min(3, c?.slots | 0)),
  ...(typeof c?.chk === "string" && c.chk ? { chk: str(c.chk, 60) } : {}) });
const count = (n) => (Number.isInteger(n) ? Math.max(0, Math.min(99, n)) : 0);
const int = (n, max = 1e6) => (Number.isInteger(n) ? Math.max(0, Math.min(max, n)) : 0);
const num = (n) => (typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1e5, n)) : null);
// guild card: {title, hr, clears{label: n}, weapons[15], play "660:29", passes, medals{pct, count, villages{name: pct}},
//   monsters[[name, min|null, max|null, count, unsure?]], arena[[quest, [times]]]}
function guildCard(c) {
  const o = { title: str(c.title, 20), hr: int(c.hr, 999) };
  if (c.clears && typeof c.clears === "object") o.clears = Object.fromEntries(Object.entries(c.clears).slice(0, 12).map(([k, v]) => [str(k, 12), int(v)]));
  if (Array.isArray(c.weapons)) o.weapons = c.weapons.slice(0, 15).map((v) => int(v));
  if (typeof c.play === "string") o.play = str(c.play, 10);
  if (Number.isInteger(c.passes)) o.passes = int(c.passes);
  if (c.medals && typeof c.medals === "object") o.medals = { pct: int(c.medals.pct, 100), count: int(c.medals.count, 999),
    villages: Object.fromEntries(Object.entries(c.medals.villages || {}).slice(0, 8).map(([k, v]) => [str(k, 8), int(v, 100)])) };
  if (Array.isArray(c.monsters)) o.monsters = c.monsters.filter(Array.isArray).slice(0, 150).map(([n, a, b, k, u]) => [str(n, 20), num(a), num(b), int(k, 99999), ...(u ? [1] : [])]);
  if (Array.isArray(c.arena)) o.arena = c.arena.filter(Array.isArray).slice(0, 80).map(([q, ts]) => [str(q, 30), (Array.isArray(ts) ? ts : []).slice(0, 5).map((t) => str(t, 12))]);
  return o;
}

// Returns {name, date, sets?, charms?, owned?, ownedW?, cleared?}; throws on text that is not ours.
// Pasted text comes from other people, so every field is rebuilt from checked values.
export function decodeShare(text, questIds) {
  const i = String(text).indexOf(MARK);
  if (i < 0) throw new Error("no data line");
  const raw = String(text).slice(i + MARK.length).split("\n")[0];
  if (raw.length > 200000) throw new Error("too long");
  const d = JSON.parse(raw);
  if (!d || typeof d !== "object") throw new Error("bad data");
  const out = { name: str(d.name, 30) || "なまえなし", date: str(d.date, 6) };
  if (Array.isArray(d.sets)) out.sets = d.sets.filter((s) => s && Array.isArray(s.pieces) && s.pieces.length === 5).slice(0, 200).map((s) => ({
    name: str(s.name) || "セット", pieces: s.pieces.map((p) => str(p)), charm: charm(s.charm),
    decos: (Array.isArray(s.decos) ? s.decos : []).filter((x) => Array.isArray(x)).slice(0, 30).map(([src, n]) => [typeof src === "number" ? src : str(src, 10), str(n)]),
    torsoUps: s.torsoUps | 0,
    ...(typeof s.weapon === "string" ? { weapon: str(s.weapon) } : {}),
    ...(typeof s.style === "string" ? { style: str(s.style, 10) } : {}),
  }));
  // item mysets: up to 40 sets of 32 pouch rows [item name, count]
  if (Array.isArray(d.itemSets)) out.itemSets = d.itemSets.filter((s) => s && Array.isArray(s.items)).slice(0, 40).map((s) => ({
    name: str(s.name, 20) || "セット",
    items: s.items.filter((x) => Array.isArray(x) && typeof x[0] === "string" && x[0]).slice(0, 32).map(([n, c]) => [str(n, 20), count(c)]),
  }));
  if (Array.isArray(d.charms)) out.charms = d.charms.slice(0, 1500).map(charm);
  if (Array.isArray(d.owned)) out.owned = d.owned.slice(0, 2000).map((x) => str(x)).filter(Boolean);
  if (d.ownedW && typeof d.ownedW === "object") out.ownedW = Object.fromEntries(Object.entries(d.ownedW).slice(0, 3000).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => [str(k, 80), v]));
  // item counts {itemId: n}; itemsChk = why the counts may be off (read from a video)
  if (d.items && typeof d.items === "object") out.items = Object.fromEntries(Object.entries(d.items).slice(0, 3000).filter(([k, v]) => /^[0-9a-f]{3,8}$/.test(k) && Number.isInteger(v)).map(([k, v]) => [k, Math.max(0, Math.min(9999, v))]));
  if (typeof d.itemsChk === "string" && d.itemsChk) out.itemsChk = str(d.itemsChk, 80);
  if (d.card && typeof d.card === "object") out.card = guildCard(d.card);
  for (const k of ["cleared", "dl"]) {
    if (typeof d[k] !== "string") continue;
    const all = [...questIds].sort();
    if (d.nq !== all.length) throw new Error("quest list differs"); // other app version: bit positions would be wrong
    out[k] = unpackBits(all, d[k]);
  }
  return out;
}
