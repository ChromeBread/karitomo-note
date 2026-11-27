// Run: node tests/sim.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { search, totals, activated, fillDecos, TORSO_UP, vcharms } from "../js/sim.js";

// --- small synthetic case: torso-up doubles torso points and torso decorations
const P = (name, skills, slots = 0) => ({ name, skills, slots, def: [1, 1] });
const deco = { name: "攻撃珠", slots: 1, skills: { 攻撃: 2 } };
const pieces = {
  0: [P("頭", { 攻撃: 1 })],
  1: [P("胴", { 攻撃: 3 }, 1)],
  2: [P("腕", { [TORSO_UP]: 1 })],
  3: [P("腰", { [TORSO_UP]: 1 })],
  4: [P("脚", {})],
};
// head 1 + torso (3 + deco 2) * 3 = 16 -> reaches 15
const r = [...search({ targets: { 攻撃: 15 }, pieces, charms: [], decos: [deco], limit: 5 })];
assert.equal(r.length, 1, "torso-up set found");
assert.equal(totals(r[0]).攻撃, 16);
assert.equal([...search({ targets: { 攻撃: 17 }, pieces, charms: [], decos: [deco] })].length, 0, "17 unreachable");

// 仮想護石: 攻撃17 is 1 point short
const vc = vcharms({ targets: { 攻撃: 17 }, pieces, charms: [], decos: [deco] }).charms;
assert.deepEqual(vc, [{ skills: { 攻撃: 1 }, slots: 0 }], "weakest virtual charm (slotted ones with the same points are worse)");
const vc2 = vcharms({ targets: { 攻撃: 17, 防御: 2 }, pieces, charms: [], decos: [deco] }).charms;
assert.deepEqual(vc2, [{ skills: { 防御: 2 }, slots: 1 }, { skills: { 攻撃: 1, 防御: 2 }, slots: 0 }], "pair charm, or one skill + a slot for the other");

// fillDecos respects negative side effects on another target
const f = fillDecos([{ size: 1, mult: 1 }], { A: 1, B: 0 }, [{ name: "x", slots: 1, skills: { A: 1, B: -1 } }], ["A", "B"]);
assert.equal(f, null, "deco that breaks B is rejected");

// --- real data smoke test
const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const armor = load("armor"), decos = load("decos"), trees = load("skills");
const blade = armor.filter((p) => p.type & 1);
const byPart = {};
for (const p of blade) (byPart[p.part] ||= []).push(p);
const t0 = Date.now();
const res = [...search({ targets: { 攻撃: 15, 達人: 10 }, pieces: byPart, charms: [], decos, weaponSlots: 1, limit: 20 })];
const ms = Date.now() - t0;
assert.ok(res.length > 0, "攻撃大+看破 found with no charm");
for (const x of res) {
  const sum = totals(x);
  assert.ok(sum.攻撃 >= 15 && sum.達人 >= 10, "targets reached");
  const names = activated(sum, trees).map((e) => e.name);
  assert.ok(names.length >= 2);
}
console.log(`ok: ${res.length} sets in ${ms} ms; first:`, res[0].pieces.map((p) => p.name).join(" / "),
  "| decos:", res[0].decos.map(([s, d]) => `${s}:${d.name}`).join(", "));

// --- pruning must not lose answers: compare with brute force on small random subsets
import { makeFiller } from "../js/sim.js";
let seed = 7;
const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
const allTrees = ["攻撃", "達人", "痛撃", "斬れ味", "聴覚保護"];
for (let round = 0; round < 30; round++) {
  const sub = {};
  for (let i = 0; i < 5; i++) sub[i] = Array.from({ length: 5 }, () => byPart[i][rnd(byPart[i].length)]);
  const tset = {};
  for (const t of allTrees) if (rnd(2)) tset[t] = 10;
  if (!Object.keys(tset).length) tset.攻撃 = 10;
  const trs = Object.keys(tset);
  const fill = makeFiller(decos, trs);
  let brute = false;
  for (const a of sub[0]) for (const b of sub[1]) for (const c of sub[2]) for (const d of sub[3]) for (const e of sub[4]) {
    if (brute) break;
    const set = [a, b, c, d, e];
    const ups = set.filter((p) => p.skills[TORSO_UP]).length;
    const def = {};
    for (const t of trs) def[t] = tset[t] - set.reduce((s, p, i) => s + (p.skills[t] || 0) * (i === 1 ? 1 + ups : 1), 0);
    const groups = set.map((p, i) => ({ size: p.slots, mult: i === 1 ? 1 + ups : 1 })).concat([{ size: 1, mult: 1 }]).filter((g) => g.size);
    if (fill(groups, def)) brute = true;
  }
  const fast = [...search({ targets: tset, pieces: sub, charms: [], decos, weaponSlots: 1, limit: 1 })].length > 0;
  assert.equal(fast, brute, `round ${round} ${JSON.stringify(tset)}: search=${fast} brute=${brute}`);
}
console.log("ok: pruning matches brute force on 30 random cases");

// --- minimum defense / armor slots: same brute-force comparison with the extra limits
let minHits = 0;
for (let round = 0; round < 30; round++) {
  const sub = {};
  for (let i = 0; i < 5; i++) sub[i] = Array.from({ length: 5 }, () => byPart[i][rnd(byPart[i].length)]);
  const tset = rnd(2) ? { 攻撃: 10 } : { 達人: 10, 攻撃: 10 };
  const trs = Object.keys(tset);
  const fill = makeFiller(decos, trs);
  const maxDef = [0, 1, 2, 3, 4].reduce((s, i) => s + Math.max(...sub[i].map((p) => p.def[1])), 0);
  const minDef = rnd(2) ? Math.floor(maxDef * (0.7 + rnd(30) / 100)) : 0;
  const minSlots = rnd(3) ? rnd(10) : 0;
  let brute = false;
  for (const a of sub[0]) for (const b of sub[1]) for (const c of sub[2]) for (const d of sub[3]) for (const e of sub[4]) {
    if (brute) break;
    const set = [a, b, c, d, e];
    if (set.reduce((s, p) => s + p.def[1], 0) < minDef || set.reduce((s, p) => s + p.slots, 0) < minSlots) continue;
    const ups = set.filter((p) => p.skills[TORSO_UP]).length;
    const def = {};
    for (const t of trs) def[t] = tset[t] - set.reduce((s, p, i) => s + (p.skills[t] || 0) * (i === 1 ? 1 + ups : 1), 0);
    const groups = set.map((p, i) => ({ size: p.slots, mult: i === 1 ? 1 + ups : 1 })).concat([{ size: 1, mult: 1 }]).filter((g) => g.size);
    if (fill(groups, def)) brute = true;
  }
  const got = [...search({ targets: tset, pieces: sub, charms: [], decos, weaponSlots: 1, limit: 1, minDef, minSlots })];
  minHits += brute;
  assert.equal(got.length > 0, brute, `min round ${round} def>=${minDef} slots>=${minSlots}: search=${got.length > 0} brute=${brute}`);
  for (const r of got) {
    assert.ok(r.pieces.reduce((s, p) => s + p.def[1], 0) >= minDef);
    assert.ok(r.pieces.reduce((s, p) => s + p.slots, 0) >= minSlots);
  }
}
assert.ok(minHits > 3 && minHits < 27, `both outcomes covered: ${minHits}/30`);
console.log(`ok: minimum defense / slots match brute force on 30 random cases (${minHits} reachable)`);

// --- element resistance minimums: brute-force comparison like above
let resHits = 0;
for (let round = 0; round < 30; round++) {
  const sub = {};
  for (let i = 0; i < 5; i++) sub[i] = Array.from({ length: 5 }, () => byPart[i][rnd(byPart[i].length)]);
  const tset = { 攻撃: 10 };
  const fill = makeFiller(decos, ["攻撃"]);
  // one or two elements get a minimum near the best reachable total
  const minRes = [null, null, null, null, null];
  for (let k = 0; k < 1 + rnd(2); k++) {
    const e = rnd(5), best = [0, 1, 2, 3, 4].reduce((s, i) => s + Math.max(...sub[i].map((p) => p.res[e])), 0);
    minRes[e] = best - rnd(6);
  }
  let brute = false;
  for (const a of sub[0]) for (const b of sub[1]) for (const c of sub[2]) for (const d of sub[3]) for (const e of sub[4]) {
    if (brute) break;
    const set = [a, b, c, d, e];
    if (minRes.some((m, el) => m !== null && set.reduce((s, p) => s + p.res[el], 0) < m)) continue;
    const ups = set.filter((p) => p.skills[TORSO_UP]).length;
    const def = { 攻撃: 10 - set.reduce((s, p, i) => s + (p.skills.攻撃 || 0) * (i === 1 ? 1 + ups : 1), 0) };
    const groups = set.map((p, i) => ({ size: p.slots, mult: i === 1 ? 1 + ups : 1 })).concat([{ size: 1, mult: 1 }]).filter((g) => g.size);
    if (fill(groups, def)) brute = true;
  }
  const got = [...search({ targets: tset, pieces: sub, charms: [], decos, weaponSlots: 1, limit: 1, minRes })];
  resHits += brute;
  assert.equal(got.length > 0, brute, `res round ${round} ${JSON.stringify(minRes)}: search=${got.length > 0} brute=${brute}`);
  for (const r of got) for (let el = 0; el < 5; el++) if (minRes[el] !== null) assert.ok(r.pieces.reduce((s, p) => s + p.res[el], 0) >= minRes[el]);
}
assert.ok(resHits > 3 && resHits < 27, `both outcomes covered: ${resHits}/30`);
console.log(`ok: resistance minimums match brute force on 30 random cases (${resHits} reachable)`);

// --- avoid (effects that must not activate) and minFree (slots left after decorations)
{
  const P2 = (name, skills, slots = 0) => ({ name, skills, slots, def: [1, 1] });
  const pcs = { 0: [P2("頭A", { 攻撃: 10, 腹減り: -10 }), P2("頭B", { 攻撃: 8 }, 1)], 1: [P2("胴", {})], 2: [P2("腕", {})], 3: [P2("腰", {})], 4: [P2("脚", {}, 2)] };
  const dc = [{ name: "攻撃珠", slots: 1, skills: { 攻撃: 2 } }];
  const all = [...search({ targets: { 攻撃: 10 }, pieces: pcs, charms: [], decos: dc })];
  assert.ok(all.some((x) => x.pieces[0].name === "頭A"), "頭A found without avoid");
  const av = [...search({ targets: { 攻撃: 10 }, pieces: pcs, charms: [], decos: dc, avoid: [{ tree: "腹減り", pts: -10 }] })];
  assert.ok(av.length && av.every((x) => (totals(x).腹減り || 0) > -10), "avoid drops sets with 腹減り倍加");
  // 頭B 8 + one deco = 10, leaving 2 of 3 slots free; minFree 3 needs 頭A (0 decos, 2 free) -> none
  assert.ok([...search({ targets: { 攻撃: 10 }, pieces: pcs, charms: [], decos: dc, minFree: 2 })].length > 0, "minFree 2 reachable");
  assert.equal([...search({ targets: { 攻撃: 10 }, pieces: pcs, charms: [], decos: dc, minFree: 3, avoid: [{ tree: "腹減り", pts: -10 }] })].length, 0, "minFree 3 + avoid impossible");
  console.log("ok: avoid and minFree");
}
