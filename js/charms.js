// Charm import/export compatible with another skill simulator's formats:
// CSV lines ",slots,tree,pts[,tree,pts]" and its JSON debug dump [{skills, slots, ...}].

// Returns { charms: [{skills, slots}], bad: number of entries that could not be read }.
export function parseCharms(text, treeNames) {
  const byKey = new Map(treeNames.map((n) => [n.normalize("NFKC"), n])); // SP延長 vs ＳＰ延長
  const out = [];
  let bad = 0;
  const add = (pairs, slots) => {
    const skills = {};
    slots = Number(slots);
    if (!Number.isInteger(slots) || slots < 0 || slots > 3) return bad++;
    for (const [t, v] of pairs) {
      const name = byKey.get(String(t).trim().normalize("NFKC"));
      const pts = Number(v);
      if (!name || !Number.isInteger(pts) || pts < -10 || pts > 20 || !pts) return bad++;
      skills[name] = (skills[name] || 0) + pts;
    }
    if (!Object.keys(skills).length && !slots) return bad++;
    out.push({ skills, slots });
  };
  const s = text.trim();
  if (s.startsWith("[")) {
    let arr;
    try { arr = JSON.parse(s); } catch { return { charms: [], bad: 1 }; }
    if (!Array.isArray(arr)) return { charms: [], bad: 1 };
    for (const c of arr) {
      if (!c || typeof c.skills !== "object" || c.skills === null) { bad++; continue; }
      add(Object.entries(c.skills), c.slots ?? 0);
    }
  } else {
    for (const line of s.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const f = line.split(",").map((x) => x.trim());
      const pairs = [];
      for (let i = 2; i + 1 < f.length; i += 2) if (f[i]) pairs.push([f[i], f[i + 1]]);
      if (f.length < 2 || (f.length - 2) % 2) { bad++; continue; }
      add(pairs, f[1] || 0);
    }
  }
  return { charms: out, bad };
}

export function charmsToCsv(charms) {
  return charms.map((c) => ["", c.slots, ...Object.entries(c.skills).flat()].join(",")).join("\n");
}

const keyOf = (c) => `${c.slots}|${Object.entries(c.skills).sort().join("|")}`;
// Charms from `incoming` not already registered; duplicates count (two identical charms stay two).
export function newCharms(existing, incoming) {
  const have = new Map();
  for (const c of existing) have.set(keyOf(c), (have.get(keyOf(c)) || 0) + 1);
  return incoming.filter((c) => {
    const k = keyOf(c), n = have.get(k) || 0;
    if (n) { have.set(k, n - 1); return false; }
    return true;
  });
}
