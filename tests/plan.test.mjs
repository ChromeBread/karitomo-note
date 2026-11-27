// node tests/plan.test.mjs — quest recommendation and charm potential.
import assert from "node:assert/strict";
import { questYield, recommendQuests, charmPotential, bundleQuests } from "../js/plan.js";

const mon = { id: "m1", name: "ドスX", drops: { 下位: { 剥ぎ取り: [["a", 1, 20]], 捕獲: [["a", 1, 40]], 尻尾: [["a", 1, 50]] } } };
const D = {
  monById: { m1: mon },
  questById: {
    q1: { id: "q1", vendor: "村", tab: "★1", mons: ["m1"], rgroups: [["報酬1", [["a", 2, 10]]]] },
    q2: { id: "q2", vendor: "村", tab: "★1", mons: [], rgroups: [["報酬1", [["a", 1, 100]]]] },
    q3: { id: "q3", vendor: "村", tab: "★1", mons: [], rgroups: [["報酬1", [["b", 1, 100]]]] },
  },
};
// carve 0.6 vs capture 0.8 -> capture; + tail 0.5 + reward 0.2
const y = questYield(D, D.questById.q1, "a");
assert.ok(Math.abs(y.n - 1.5) < 1e-9, y.n);
assert.equal(y.how, "ドスX 捕獲 40%");
const r = recommendQuests(D, "a", ["q1", "q2", "q3", "missing"]);
assert.deepEqual(r.map((x) => x.q.id), ["q1", "q2"]);
assert.equal(recommendQuests(D, "a", ["q1", "q2"], 1).length, 1);

const decos = [{ skills: { 匠: 1 }, slots: 1 }, { skills: { 匠: 3, 斬れ味: -1 }, slots: 2 }, { skills: { 匠: 5 }, slots: 3 }, { skills: { 痛撃: 4 }, slots: 1 }];
assert.deepEqual(charmPotential({ skills: { 匠: 4 }, slots: 3 }, "匠", decos), { own: 4, total: 9 }); // 3-slot 5 beats 2+1 (3+1)
assert.deepEqual(charmPotential({ skills: { 匠: 4 }, slots: 2 }, "匠", decos), { own: 4, total: 7 });
assert.deepEqual(charmPotential({ skills: {}, slots: 0 }, "匠", decos), { own: 0, total: 0 });
console.log("plan tests passed");

// weapon tree: A (LV1-3, renamed at LV3) -> B from A LV2 -> C from B LV1
import { weaponTree } from "../js/plan.js";
const W = [
  { id: "a", type: "大剣", name: "A1", levels: [{ lv: 1, make: [["x", 1]] }, { lv: 2 }] },
  { id: "a", type: "大剣", name: "A3", levels: [{ lv: 3 }] },
  { id: "c", type: "大剣", name: "C", levels: [{ lv: 1, from: "b", fromLv: 1 }] },
  { id: "b", type: "大剣", name: "B", levels: [{ lv: 1, from: "a", fromLv: 2 }, { lv: 2 }] },
];
const T = weaponTree(W);
assert.equal(T.root("c").id, "a");
assert.deepEqual(T.blocks.get("a").kids.map((k) => k.id), ["b"]);
assert.equal(T.nameAt(T.blocks.get("a"), 2), "A1");
assert.equal(T.nameAt(T.blocks.get("a"), 3), "A3");
assert.equal(T.blocks.get("b").fromLv, 2);
console.log("weapon tree tests passed");

// ammo index: normal table, rapid fire and built-in share one label
import { ammoIndex, ammoLabel } from "../js/plan.js";
assert.equal(ammoLabel("LV1 睡眠弾"), "睡眠弾 LV1");
assert.equal(ammoLabel("ツブテ弾"), "ツブテ弾");
const AW = [
  { id: "l", type: "ライトボウガン", name: "L", levels: [{ lv: 1, reload: "普通", recoil: "中", ammo: { 睡眠弾: [2, 0] }, special: [["LV1 睡眠弾", "2/100力", "大"]], builtin: [["ツブテ弾", "4/20"]] }] },
  { id: "h", type: "ヘビィボウガン", name: "H", levels: [{ lv: 1, ammo: { 睡眠弾: [0, 3] } }] },
  { id: "s", type: "大剣", name: "S", levels: [{ lv: 1 }] },
];
const AI = ammoIndex(AW);
assert.deepEqual([...AI.get("睡眠弾 LV1").values()].map((e) => e.levels.map((l) => l.how)), [["装填", "速射"]]);
assert.deepEqual([...AI.get("睡眠弾 LV2").keys()], ["h/H"]);
assert.ok(AI.has("ツブテ弾"));
console.log("ammo index tests passed");

// upgrade path: A LV1(make)->LV2(up) -> B (from A LV2) LV1,LV2 ; owning A LV2 skips A
import { upgradePath, questEffort } from "../js/plan.js";
const PW = [
  { id: "a", type: "大剣", name: "A1", levels: [{ lv: 1, make: [["m", 1]] }, { lv: 2, up: [["u", 2]] }, { lv: 3, up: [["z", 9]] }] },
  { id: "b", type: "大剣", name: "B", levels: [{ lv: 1, from: "a", fromLv: 2, up: [["x", 3]] }, { lv: 2, up: [["y", 1]] }] },
];
const PT = weaponTree(PW);
assert.deepEqual(upgradePath(PT, PW[1]).map((s) => `${s.name}${s.lv}${s.kind}`), ["A11生産", "A12強化", "B1派生", "B2強化"]);
assert.deepEqual(upgradePath(PT, PW[1], { a: 2 }).map((s) => `${s.name}${s.lv}`), ["B1", "B2"]);
assert.deepEqual(upgradePath(PT, PW[1], { b: 1 }).map((s) => `${s.name}${s.lv}`), ["B2"]);
assert.equal(questEffort({ mstats: [{ hp: 3000 }] }), 2);
assert.equal(questEffort({}), 1);
console.log("upgrade path tests passed");

// delivery plan: BC-1-2-3 line, item in areas 3 (90%) and 2 (40%)
import { deliveryPlan, bfsFrom } from "../js/plan.js";
const LY = { nodes: { 0: [0, 0], 1: [0, 0], 2: [0, 0], 3: [0, 0] }, edges: [[0, 1], [1, 2], [2, 3]] };
assert.deepEqual(bfsFrom(LY).path("3"), ["0", "1", "2", "3"]);
const DP = deliveryPlan({ need: 10, carry: 4, modori: 2, areas: [{ area: 3, pct: 90 }, { area: 2, pct: 40 }], layout: LY });
assert.equal(DP.area.area, 2); // nearest first
assert.deepEqual(DP.trips.map((t) => [t.bring, t.back]), [[4, "モドリ玉"], [4, "モドリ玉"], [2, "歩いて"]]);
const EG = deliveryPlan({ need: 2, carry: 99, modori: 5, egg: true, areas: [{ area: 3, pct: 100 }], layout: LY });
assert.deepEqual(EG.trips.map((t) => [t.bring, t.back, t.backPath.join("")]), [[1, "歩いて", "3210"], [1, "歩いて", "3210"]]);
assert.equal(deliveryPlan({ need: 1, carry: 1, areas: [{ area: 9, pct: 1 }], layout: LY }), null);
console.log("delivery plan tests passed");

// bundleQuests: only quests giving 2+ of the wanted kinds; most kinds first
{
  const B = { monById: {}, questById: {
    x: { id: "x", vendor: "村", tab: "★1", mons: [], rgroups: [["報酬1", [["a", 1, 100], ["b", 1, 50]]]] },
    y: { id: "y", vendor: "村", tab: "★1", mons: [], rgroups: [["報酬1", [["a", 1, 100], ["b", 1, 100], ["c", 1, 10]]]] },
    z: { id: "z", vendor: "村", tab: "★1", mons: [], rgroups: [["報酬1", [["a", 5, 100]]]] },
  } };
  const got = bundleQuests(B, ["a", "b", "c"], ["x", "y", "z"]);
  assert.deepEqual(got.map((g) => g.q.id), ["y", "x"], "z gives one kind only");
  assert.equal(got[0].kinds, 3);
  console.log("bundle quest tests passed");
}
