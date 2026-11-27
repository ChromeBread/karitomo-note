// What the group can make, from the quests they checked as cleared (no DOM).

const Z2H = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// Material rank of a quest, or null when it gives no rank-based drops (arena, training, DLC unknown).
export function rankOf(q) {
  const tab = Z2H(q.tab || "");
  if (q.vendor === "村") return "下位";
  if (q.vendor === "集会所") {
    if (/G★/.test(tab)) return "G級";
    const m = tab.match(/★(\d+)/);
    if (m) return +m[1] <= 3 ? "下位" : "上位";
    return null; // DL tabs: rewards still count
  }
  if (q.vendor === "特殊許可") {
    const n = parseInt(tab, 10);
    // shortcut: levels 1-10 treated as 上位 and 11+ as G級; verify against the game if wrong
    return isNaN(n) ? null : n <= 10 ? "上位" : "G級";
  }
  return null;
}

// Index every way to get each item: {itemId: [{type, ...}]}
export function buildSources(data) {
  const src = {};
  const add = (id, s) => (src[id] ||= []).push(s);
  for (const m of data.monsters)
    for (const [rank, methods] of Object.entries(m.drops))
      for (const [method, list] of Object.entries(methods))
        for (const [id, qty, pct] of list) add(id, { type: "mon", mon: m.id, rank, method, qty, pct });
  for (const mp of data.maps)
    for (const a of mp.areas)
      for (const [rank, list] of Object.entries(a.items))
        for (const [id, min, max, pct] of list) add(id, { type: "map", map: mp.name, area: a.no, rank, min, max, pct });
  for (const q of data.quests) for (const id of q.rewards || []) add(id, { type: "quest", quest: q.id });
  return src;
}

// Set of item ids obtainable after clearing `cleared` quest ids. Items with no known
// source are treated as obtainable so they never block crafting.
export function obtainable(data, sources, cleared) {
  const rankMaps = new Set(), rankMons = new Set(), quests = new Set(cleared);
  for (const q of data.quests) {
    if (!quests.has(q.id)) continue;
    const r = rankOf(q);
    if (!r) continue;
    rankMaps.add(`${q.map}|${r}`);
    for (const m of q.mons) rankMons.add(`${m}|${r}`);
  }
  const ok = new Set();
  for (const [id, list] of Object.entries(sources)) {
    if (list.some((s) =>
      (s.type === "quest" && quests.has(s.quest)) ||
      (s.type === "map" && rankMaps.has(`${s.map}|${s.rank}`)) ||
      (s.type === "mon" && rankMons.has(`${s.mon}|${s.rank}`)))) ok.add(id);
  }
  return { has: (id) => ok.has(id) || !sources[id] };
}

export const canMake = (mats, have) => !!mats && mats.length > 0 && mats.every(([id]) => have.has(id));
export const canMakeDeco = (d, have) => d.recipes.some((r) => canMake(r, have));

// 秘境 is entered only from 上位 (random start), so the 下位 tables the source data keeps for its spots cannot be
// gathered. Drops those items from the 下位 list of the area (maps.json) unless another spot there has them.
// hikyo: {map: {from, spots?, low?}} (data/hikyo.json); gather: data/gather.json. Mutates maps.
export function dropUnreachableHikyo(maps, gather, hikyo) {
  for (const [name, h] of Object.entries(hikyo || {})) {
    if (!h?.spots || h.low) continue;
    const spots = gather?.[name]?.[h.from]?.["下位"], area = maps.find((m) => m.name === name)?.areas.find((a) => a.no === h.from);
    if (!spots || !area?.items["下位"]) continue;
    const keep = new Set(spots.filter((_, i) => !h.spots.includes(i)).flatMap((sp) => sp.tables.flatMap((t) => t.items.map(([id]) => id))));
    area.items["下位"] = area.items["下位"].filter(([id]) => keep.has(id));
  }
}

// GU mode: quests that were only given out in Japan (ids) are removed, and with them the items no other
// source gives and the gear that needs those items (armor, decorations whose every recipe needs one,
// weapons whose first level is made from one and cannot be reached by upgrading). Mutates data;
// returns {items, armor, weapons, decos} that were removed (names / ids), for checks.
export function dropQuests(data, ids) {
  const gone = new Set(ids);
  const src = buildSources(data);
  const items = new Set(Object.entries(src).filter(([, list]) => list.length && list.every((s) => s.type === "quest" && gone.has(s.quest))).map(([id]) => id));
  // reward groups also name items: an item only in removed quests' reward groups counts too
  const elsewhere = new Set();
  for (const q of data.quests) if (!gone.has(q.id)) for (const [, list] of q.rgroups || []) for (const [id] of list) elsewhere.add(id);
  for (const q of data.quests) if (gone.has(q.id)) for (const [, list] of q.rgroups || []) for (const [id] of list) if (!elsewhere.has(id) && (src[id] || []).every((s) => s.type === "quest" && gone.has(s.quest))) items.add(id);
  const needs = (mats) => (mats || []).some(([id]) => items.has(id));
  const armor = data.armor.filter((a) => needs(a.mats)).map((a) => a.name);
  const decos = data.decos.filter((d) => d.recipes?.length && d.recipes.every(needs)).map((d) => d.name);
  const weapons = data.weapons.filter((w) => needs(w.levels[0]?.make) && !w.levels[0]?.up && !w.levels[0]?.from).map((w) => w.name);
  const drop = (list, names, key = "name") => list.filter((x) => !names.includes(x[key]));
  data.quests = data.quests.filter((q) => !gone.has(q.id));
  data.armor = drop(data.armor, armor);
  data.decos = drop(data.decos, decos);
  data.weapons = drop(data.weapons, weapons);
  return { items: [...items], armor, weapons, decos };
}
