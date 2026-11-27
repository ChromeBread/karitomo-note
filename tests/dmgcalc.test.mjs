// Run: node tests/dmgcalc.test.mjs
import assert from "node:assert/strict";
import { shellDamage, fixedDamage, blastHits, artMul, FIXED } from "../js/dmgcalc.js";

// blast example: initial 55, +45 per explosion (×2 in G rank), blast 29 -> 6 hits, then 15 (21 in all)
const b = blastHits({ first: 55, up: 45, max: 1090, value: 29, n: 2, rankMul: 2 });
assert.deepEqual(b.map((x) => x.hits), [6, 15]);
assert.equal(b[1].sum, 21);
// wide LV5 charged with 砲術王 + meal (×1.3): 48 -> 62 -> ×1.45 = 89 per shot, about 270 for three
assert.equal(artMul(2, true), 1.3);
assert.equal(artMul(1, true), 1.21);
assert.equal(shellDamage({ type: "拡散", lv: 5, mode: "charge", skill: 2, meal: true }).total * 3, 267);
// normal LV1 full burst of 5 at defense 0.8: [[10×1.2]×0.8] = 9 each
assert.deepEqual(shellDamage({ type: "通常", lv: 1, mode: "fb", shots: 5, def: 0.8 }).each, [9, 9, 9, 9, 9]);
// brave chain of 3 normal LV1: 10, 12, 15
assert.equal(shellDamage({ type: "通常", lv: 1, mode: "brave", shots: 3 }).total, 37);
// bombs: 大タル爆弾G with ボマー = 195; sleeping first hit ×3
const g = FIXED.findIndex((x) => x[0].startsWith("大タル爆弾G"));
assert.equal(fixedDamage(g, { bomber: true }).per, 195);
assert.equal(fixedDamage(g, { count: 2, sleep: true }).total, 150 * 3 + 150);
console.log("dmgcalc tests passed");
