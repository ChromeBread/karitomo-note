// Run: node tests/i18n.test.mjs — GU text replacement (exact, with numbers, with game names inside).
import assert from "node:assert/strict";
globalThis.document = { documentElement: { lang: "" } };
const { setLang, trText, t, nm, tf } = await import("../js/i18n.js");
setLang("gu", { "クリア済み": "Cleared", "表示中の{n}件をクリア済みにする": "Mark the {n} shown as cleared", "{s}の詳細": "Details of {s}" }, { "回復薬": "Potion" });
assert.equal(trText("  クリア済み "), "  Cleared ");
assert.equal(trText("表示中の12件をクリア済みにする"), "Mark the 12 shown as cleared");
assert.equal(trText("回復薬の詳細"), "Details of Potion");
assert.equal(trText("回復薬"), "Potion");
assert.equal(trText("Already English"), "Already English");
assert.equal(trText("未知の文"), "未知の文");
assert.equal(tf("表示中の{n}件をクリア済みにする", { n: 3 }), "Mark the 3 shown as cleared");
setLang("gu", { "エリア{n}の{s}の高い所": "high ground on the {s} side of Area {n}", "南西": "southwest", "村★{n}": "Village {n}★" }, {});
assert.equal(trText("エリア3の南西の高い所"), "high ground on the southwest side of Area 3", "order can change");
assert.equal(trText("村★６"), "Village 6★", "full-width numbers");
setLang("xx");
assert.equal(trText("クリア済み"), "クリア済み");
console.log("i18n tests passed");
