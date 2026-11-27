// node tests/advice.test.mjs — quest preparation advice on the real data.
import assert from "node:assert/strict";
import fs from "node:fs";
import { adviseQuest, rankItemSets, itemNeeds, armorTargets } from "../js/advice.js";

const J = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
const D = { weapons: J("weapons.json"), monsters: J("monsters.json"), quests: J("quests.json") };
D.monById = Object.fromEntries(D.monsters.map((m) => [m.id, m]));
const q = D.quests.find((x) => x.name === "ＪＵＭＰ・沸き立つマグマ");
assert.ok(q, "test quest exists");

// hot map: the set with a cooler drink wins over one with a hot drink
const hot = { ...q, map: "火山", goal: "テスト１頭の狩猟", kind: "狩猟" };
assert.deepEqual(itemNeeds(hot).map((n) => n.why), ["暑いマップ", "大型モンスター"]);
const r = rankItemSets([{ name: "寒", items: [["ホットドリンク", 5], ["回復薬", 10]] }, { name: "暑", items: [["クーラードリンク", 5], ["回復薬", 10]] }], hot);
assert.equal(r[0].set.name, "暑");
assert.equal(r[1].lacks[0].why, "暑いマップ");

// owned weapons of the chosen type only, best first; targets must beat the best owned one
const fire = D.weapons.find((w) => w.name === "デイズアイ"), ice = D.weapons.find((w) => w.name === "ハイフロストエッジ");
const who = { ownedW: { [`${fire.id}/${fire.name}`]: 4, [`${ice.id}/${ice.name}`]: 5 }, sets: [{ name: "氷", weapon: ice.name, pieces: [] }], itemSets: [], dl: [q.id], cleared: [] };
const a = adviseQuest(D, q, "片手剣", who, { [ice.id]: 6 });
assert.equal(a.owned.length, 2);
assert.ok(a.owned[0].s >= a.owned[1].s);
assert.equal(a.sets[0].set.name, "氷");
assert.ok(a.targets.every((t) => t.s > a.owned[0].s));
assert.equal(adviseQuest(D, q, "大剣", who).owned.length, 0);
// armor targets: only makeable, not made, stronger than what is made, right class
const arm = [
  { name: "A1", part: 0, type: 1, gender: 3, def: [10, 20], slots: 1, mats: [["x", 1]] },
  { name: "A2", part: 0, type: 1, gender: 3, def: [30, 40], slots: 0, mats: [["x", 1]] },
  { name: "A3", part: 0, type: 1, gender: 3, def: [50, 60], slots: 0, mats: [["y", 1]] },
  { name: "G1", part: 0, type: 2, gender: 3, def: [50, 90], slots: 0, mats: [["x", 1]] },
];
const at = armorTargets(arm, ["A1"], new Set(["x"]), false);
assert.deepEqual(at[0].list.map((a) => a.name), ["A2"]);
assert.equal(at[0].best, 20);
assert.deepEqual(armorTargets(arm, ["A2"], new Set(["x"]), false)[0].list, []);
assert.deepEqual(armorTargets(arm, [], new Set(["x"]), true)[0].list.map((a) => a.name), ["G1"]);
console.log("advice tests passed");

// recommended pouch: always 24 items + 8 ammo, counts from the pouch limits, gun ammo limited to what it loads
{
  const { recommendPouch } = await import("../js/advice.js");
  const fs = await import("node:fs");
  const J = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}.json`, import.meta.url), "utf8"));
  const DD = { items: J("items"), carry: J("carry"), monById: Object.fromEntries(J("monsters").map((m) => [m.id, m])) };
  const q = J("quests").find((x) => x.map === "火山" && x.mons.length);
  const notes = J("monnotes").mons;
  for (const t of ["太刀", "ハンマー", "ライトボウガン", "ヘビィボウガン", "弓"]) {
    const r = recommendPouch(DD, q, t, null, notes);
    assert.equal(r.items.length, 24, `${t}: 24 items`);
    assert.equal(r.ammo.length, 8, `${t}: 8 ammo slots`);
    assert.equal(new Set(r.items.map((x) => x[0])).size, 24, `${t}: no duplicates`);
  }
  const r = recommendPouch(DD, q, "太刀", null, notes);
  assert.ok(r.items.some(([n, c]) => n === "回復薬グレート" && c === 10) && r.items.some(([n, c]) => n === "秘薬" && c === 2));
  assert.ok(r.items.some(([n]) => n === "クーラードリンク"), "hot map gets cool drinks");
  const gun = { ammo: { 通常弾: [0, 9, 0], 貫通弾: [0, 0, 0], 散弾: [0, 0, 0] } };
  const g = recommendPouch(DD, q, "ヘビィボウガン", gun, notes);
  assert.equal(g.ammo[0][0], "LV2 通常弾");
  assert.ok(g.ammo.slice(1).every((a) => /撃てない/.test(a[2])), "the rest is marked as not loadable");
  console.log("pouch ok");
}
