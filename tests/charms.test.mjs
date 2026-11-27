import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCharms, charmsToCsv, newCharms } from "../js/charms.js";

const trees = JSON.parse(readFileSync(new URL("../data/skills.json", import.meta.url))).map((t) => t.name);

const csv = `,0,寒冷適応,4,運気,7
,0,水属性攻撃,9
,3,弾薬節約,3,属性耐性,-2
,3,弾薬節約,3,属性耐性,-2
,1,存在しない,3
,0,SP延長,2`;
const a = parseCharms(csv, trees);
assert.equal(a.bad, 1);
assert.deepEqual(a.charms[0], { skills: { 寒冷適応: 4, 運気: 7 }, slots: 0 });
assert.deepEqual(a.charms[2], { skills: { 弾薬節約: 3, 属性耐性: -2 }, slots: 3 });
assert.deepEqual(a.charms[4], { skills: { ＳＰ延長: 2 }, slots: 0 });

const json = `[{"skills":{"跳躍":5,"回復量":1},"slots":2,"order":["跳躍","回復量"],"id":576856,"part":5},{"skills":{"貫通弾強化":5},"slots":0,"id":1,"part":5}]`;
const b = parseCharms(json, trees);
assert.equal(b.bad, 0);
assert.deepEqual(b.charms, [{ skills: { 跳躍: 5, 回復量: 1 }, slots: 2 }, { skills: { 貫通弾強化: 5 }, slots: 0 }]);

// round trip and duplicate handling
assert.deepEqual(parseCharms(charmsToCsv(a.charms), trees).charms, a.charms);
assert.equal(newCharms(a.charms.slice(0, 3), a.charms).length, 2); // second 弾薬節約 copy is new
assert.equal(parseCharms("[oops", trees).bad, 1);
console.log("ok: charm import/export");
