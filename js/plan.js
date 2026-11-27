// Planning helpers (no DOM): where to farm a material, and how far a charm can push a skill.
import { rankOf } from "./unlock.js?v=1.0.0";

// shortcut: per-clear counts are rough (3 carves, 2 capture rolls, 1 roll for breaks/other
// tables; every reward group counted). Good enough to rank quests, not an exact expectation.
const ROLLS = { 剥ぎ取り: 3, 捕獲: 2 };

// Expected count of `itemId` from one clear of quest q, plus a short "how" for the best source.
export function questYield(D, q, itemId) {
  let total = 0, best = null;
  const note = (n, how) => { total += n; if (!best || n > best.n) best = { n, how }; };
  for (const [label, list] of q.rgroups || [])
    for (const [id, qty, pct] of list) if (id === itemId) note((qty * pct) / 100, `${label} ${pct}%`);
  const rank = rankOf(q);
  for (const mid of new Set(q.mons || [])) {
    const m = D.monById[mid];
    const drops = rank && m?.drops?.[rank];
    if (!drops) continue;
    const per = (meth) => (drops[meth] || []).filter(([id]) => id === itemId).reduce((s, [, qty, pct]) => s + (qty * pct) / 100, 0);
    const pct = (meth) => (drops[meth] || []).find(([id]) => id === itemId)?.[2];
    const carve = per("剥ぎ取り") * ROLLS.剥ぎ取り, cap = per("捕獲") * ROLLS.捕獲;
    // you either kill (carve) or capture, never both
    if (carve || cap) note(Math.max(carve, cap), carve >= cap ? `${m.name} 剥ぎ取り ${pct("剥ぎ取り")}%` : `${m.name} 捕獲 ${pct("捕獲")}%`);
    for (const meth of Object.keys(drops)) {
      if (meth in ROLLS) continue;
      const n = per(meth);
      if (n) note(n, `${m.name} ${meth} ${pct(meth)}%`);
    }
  }
  return { n: total, how: best?.how || "" };
}

// Rough effort of one clear: 1 + total HP of the quest's monsters / 3000 (a gathering quest = 1,
// one 3000-HP monster = 2). shortcut: HP stands in for clear time; replace if times are collected.
export const questEffort = (q) => 1 + (q.mstats || []).reduce((s, m) => s + (m.hp || 0), 0) / 3000;

// Best `limit` quests among `questIds` (the ones the player can play now) for one material.
// fast: rank by count per effort ("many items, home quickly") instead of count per clear.
export function recommendQuests(D, itemId, questIds, limit = 3, fast = false) {
  const out = [];
  for (const id of questIds) {
    const q = D.questById[id];
    if (!q) continue;
    const y = questYield(D, q, itemId);
    if (y.n > 0) out.push({ q, ...y, rate: y.n / questEffort(q) });
  }
  return out.sort((a, b) => (fast ? b.rate - a.rate : 0) || b.n - a.n).slice(0, limit);
}

// Quests that cover the most of several short materials at once: [{q, items: [{id, n, how}], kinds, rate}].
// Sorted by how many kinds one clear gives, then by items per effort. Only quests giving 2+ kinds.
export function bundleQuests(D, itemIds, questIds, limit = 3) {
  const out = [];
  for (const id of questIds) {
    const q = D.questById[id];
    if (!q) continue;
    const items = [];
    for (const it of itemIds) { const y = questYield(D, q, it); if (y.n > 0) items.push({ id: it, ...y }); }
    if (items.length >= 2) out.push({ q, items, kinds: items.length, rate: items.reduce((s, x) => s + x.n, 0) / questEffort(q) });
  }
  return out.sort((a, b) => b.kinds - a.kinds || b.rate - a.rate).slice(0, limit);
}

// Upgrade path to the last level of weapon entry `w`: [{block, name, lv, mats, kind}] from the root
// of its line (or from what the player owns: ownedLv = {blockId: level}).
export function upgradePath(T, w, ownedLv = {}) {
  const chain = [];
  for (let b = T.blocks.get(w.id), seen = new Set(); b && !seen.has(b.id); b = T.blocks.get(b.from)) { seen.add(b.id); chain.unshift(b); }
  const lastLv = w.levels[w.levels.length - 1].lv;
  const steps = [];
  chain.forEach((b, i) => {
    const until = i < chain.length - 1 ? chain[i + 1].fromLv || 1 : lastLv;
    for (const e of b.entries) for (const l of e.levels) {
      if (l.lv > until) continue;
      const first = l.lv === b.entries[0].levels[0].lv;
      const mats = first && i === 0 ? l.make || l.up : l.up || l.make;
      steps.push({ block: b.id, name: e.name, lv: l.lv, mats: mats || [], kind: first ? (i === 0 ? "生産" : "派生") : "強化" });
    }
  });
  // drop what is already owned: everything up to the deepest owned step
  let cut = -1;
  steps.forEach((s, i) => { if ((ownedLv[s.block] || 0) >= s.lv) cut = i; });
  return steps.slice(cut + 1);
}


// Most points of `tree` a charm reaches: its own points plus the best decorations for its slots.
export function charmPotential(charm, tree, decos) {
  const best = [0, 0, 0, 0]; // best[s] = most points using at most s slots
  const useful = decos.filter((d) => (d.skills[tree] || 0) > 0);
  for (let s = 1; s <= 3; s++) {
    best[s] = best[s - 1];
    for (const d of useful) if (d.slots <= s) best[s] = Math.max(best[s], best[s - d.slots] + d.skills[tree]);
  }
  const own = charm.skills[tree] || 0;
  return { own, total: own + best[Math.min(3, charm.slots || 0)] };
}

// Weapon upgrade tree. A lineage block (same id) can change names along its levels; its
// first level says which block (and level) it is upgraded from. Returns lookups for the UI.
export function weaponTree(weapons) {
  const blocks = new Map();
  for (const w of weapons) {
    let b = blocks.get(w.id);
    if (!b) blocks.set(w.id, (b = { id: w.id, type: w.type, entries: [], from: null, fromLv: null, kids: [] }));
    b.entries.push(w);
    for (const l of w.levels) if (l.from) { b.from = l.from; b.fromLv = l.fromLv || null; }
  }
  for (const b of blocks.values()) {
    b.entries.sort((x, y) => x.levels[0].lv - y.levels[0].lv);
    if (b.from && blocks.has(b.from)) blocks.get(b.from).kids.push(b);
  }
  for (const b of blocks.values()) b.kids.sort((x, y) => (x.fromLv || 0) - (y.fromLv || 0));
  // name of a block at a level (the entry whose levels include it, else the last one)
  const nameAt = (b, lv) => (b.entries.find((e) => e.levels.some((l) => l.lv === lv)) || b.entries[b.entries.length - 1]).name;
  const root = (id) => {
    let b = blocks.get(id);
    const seen = new Set();
    while (b?.from && blocks.has(b.from) && !seen.has(b.id)) { seen.add(b.id); b = blocks.get(b.from); }
    return b;
  };
  return { blocks, nameAt, root };
}

// Ammo -> bowguns that can use it. Labels look like "睡眠弾 LV1" (or "ツブテ弾" when the ammo has no level).
// how: 装填 (normal ammo table), 速射 (light rapid fire), しゃがみ (heavy crouching fire), 内蔵 (built-in).
export const ammoLabel = (raw) => { const m = raw.match(/^LV(\d)\s*(.+)$/); return m ? `${m[2]} LV${m[1]}` : raw; };
export function ammoIndex(weapons) {
  const idx = new Map();
  const add = (label, w, lv, how, value) => {
    let byW = idx.get(label);
    if (!byW) idx.set(label, (byW = new Map()));
    const key = `${w.id}/${w.name}`;
    let e = byW.get(key);
    if (!e) byW.set(key, (e = { w, levels: [] }));
    e.levels.push({ lv: lv.lv, how, value, reload: lv.reload, recoil: lv.recoil });
  };
  for (const w of weapons) {
    if (w.type !== "ライトボウガン" && w.type !== "ヘビィボウガン") continue;
    for (const lv of w.levels) {
      for (const [name, caps] of Object.entries(lv.ammo || {})) caps.forEach((c, i) => c && add(`${name} LV${i + 1}`, w, lv, "装填", String(c)));
      for (const [name, val, rec] of lv.special || []) add(ammoLabel(name), w, lv, w.type === "ライトボウガン" ? "速射" : "しゃがみ", rec ? `${val} ${rec}` : val);
      for (const [name, val] of lv.builtin || []) add(ammoLabel(name), w, lv, "内蔵", val);
    }
  }
  return idx;
}

// Shortest paths (in areas walked through) from the base camp "0" over a map diagram {nodes, edges}.
export function bfsFrom(layout, start = "0") {
  const adj = {};
  for (const [a, b] of layout.edges) { (adj[a] ||= []).push(String(b)); (adj[b] ||= []).push(String(a)); }
  const prev = { [start]: null }, queue = [start];
  while (queue.length) { const n = queue.shift(); for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; queue.push(m); } }
  const path = (to) => { if (!(to in prev)) return null; const p = []; for (let n = to; n !== null; n = prev[n]) p.unshift(n); return p; };
  return { path };
}

// Delivery plan: trips from base camp to the nearest area that has the item and back.
// carry = how many one trip can bring back (pouch limit; 1 for eggs), modori = return balls (incl.
// ones mixed on the way), egg = carried items cannot use a return ball.
// shortcut: assumes one area visit yields a full load; gather counts per point are not in the data.
export function deliveryPlan({ need, carry, modori = 0, egg = false, areas, layout }) {
  const g = bfsFrom(layout);
  const options = areas.map((a) => ({ ...a, path: g.path(String(a.area)) })).filter((a) => a.path)
    .sort((a, b) => a.path.length - b.path.length || b.pct - a.pct);
  if (!options.length) return null;
  const best = options[0];
  const per = egg ? 1 : Math.max(1, carry);
  const trips = [];
  let left = modori;
  for (let got = 0; got < need; got += per) {
    const back = !egg && left > 0 ? "モドリ玉" : "歩いて";
    if (back === "モドリ玉") left--;
    trips.push({ bring: Math.min(per, need - got), go: best.path, back, backPath: back === "歩いて" ? [...best.path].reverse() : ["0"] });
  }
  return { area: best, others: options.slice(1, 4), trips, modoriLeft: left };
}
