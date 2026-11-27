// Run: node tests/gu.test.mjs — GU mode leaves out the Japan-only event quests and the gear only they give.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropQuests } from "../js/unlock.js";
const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const D = { monsters: load("monsters"), maps: load("maps"), quests: load("quests"), armor: load("armor"), decos: load("decos"), weapons: load("weapons") };
const jp = load("jponly"), n0 = { q: D.quests.length, a: D.armor.length, w: D.weapons.length };
assert.equal(jp.length, 15);
const r = dropQuests(D, jp);
assert.equal(D.quests.length, n0.q - 15);
for (const name of ["レッドトマホーク", "ぐでたまフライパン", "気炎の太刀"]) assert.ok(r.weapons.includes(name), name);
for (const name of ["ゴンヘッド", "烈火【笠】", "ニセたま頭スーツ"]) assert.ok(r.armor.includes(name), name);
assert.ok(D.armor.some((a) => a.name === "ハンターヘルム"), "ordinary armor stays");
assert.ok(n0.a - D.armor.length < 200 && n0.w - D.weapons.length < 20, "only the Japan-only gear goes");
console.log("gu tests passed");
