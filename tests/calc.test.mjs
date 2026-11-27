// node tests/calc.test.mjs — 効果重複の計算機
import assert from "node:assert/strict";
import { ATK_GROUPS, attackCalc, guardChance } from "../js/calc.js";

const idx = (id, label) => ATK_GROUPS.find((g) => g.id === id).opts.findIndex((o) => o[0].startsWith(label));

// nothing picked: the displayed attack as is
assert.deepEqual(attackCalc(200, {}).attack, 200);
// talisman + claw + great potion + seed + 攻撃力UP【大】 = +6+9 ... -> 15 + 7 + 10 + 20 = 52
assert.equal(attackCalc(200, { talon: idx("talon", "護符と爪"), potion: idx("potion", "鬼人薬グレート"), seed: idx("seed", "怪力の種"), skill: idx("skill", "【大】") }).attack, 252);
// multipliers apply to the weapon only, then additions: 200 × 1.3 + 15 = 275
assert.equal(attackCalc(200, { heroics: idx("heroics", "火事場力+2"), talon: idx("talon", "護符と爪") }).attack, 275);
// 挑戦者 beats 力の解放: only 挑戦者+2's +20 and 15% count
const ch = attackCalc(200, { chal: idx("chal", "挑戦者+2"), unleash: idx("unleash", "+2") });
assert.equal(ch.attack, 220);
assert.equal(ch.crit, 15);
// crit is capped at 100 and the expected value uses +25% per crit
assert.equal(attackCalc(100, { unleash: idx("unleash", "+2") }, 80).crit, 100);
assert.ok(Math.abs(attackCalc(100, {}, 40).expected - 110) < 1e-9);

// 加護 1/4 then meal 1/4 -> 1 - 3/4 * 3/4; the horn melody alone
assert.equal(guardChance({ kago: true, meal: 2 }), 1 - 0.75 * 0.75);
assert.equal(guardChance({ kago: true, meal: 2, horn: true }), 0.5);
assert.equal(guardChance({}), 0);
console.log("calc tests passed");
