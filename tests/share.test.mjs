// node tests/share.test.mjs — round trip and hostile input for the friend-share text.
import assert from "node:assert/strict";
import { encodeShare, decodeShare } from "../js/share.js";

const quests = Array.from({ length: 1482 }, (_, i) => i.toString(16).padStart(5, "0"));
const state = {
  cleared: quests.filter((_, i) => i % 3 === 0),
  charms: [{ skills: { 匠: 4, 痛撃: 3 }, slots: 2 }],
  sets: [{ name: "火力", pieces: ["a", "b", "c", "d", "e"], charm: { skills: { 匠: 4 }, slots: 2 }, decos: [[0, "匠珠【２】"]], torsoUps: 0 }],
  owned: ["a", "b"], ownedW: { "x1/鉄刀": 3 },
};
const text = encodeShare(state, ["sets", "charms", "owned", "cleared"], "Aさん", quests, new Date(2026, 10, 22));
assert.equal(text.split("\n")[0], "261122_マイセット・護石・作成済み装備・進行チェック_Aさん");
assert.ok(text.length < 2000, `fits one chat message: ${text.length}`);

const d = decodeShare(`友達からのメッセージ\n${text}\n`, [...quests].reverse());
assert.equal(d.name, "Aさん");
assert.deepEqual(d.cleared.sort(), [...state.cleared].sort());
assert.deepEqual(d.sets, state.sets);
assert.deepEqual(d.charms, state.charms);
assert.deepEqual(d.owned, state.owned);
assert.deepEqual(d.ownedW, state.ownedW);

// only what was chosen is sent
assert.equal(decodeShare(encodeShare(state, ["charms"], "B", quests), quests).sets, undefined);
// different quest list: refuse instead of marking wrong quests
assert.throws(() => decodeShare(text, quests.slice(1)), /quest list differs/);
// junk and hostile values
assert.throws(() => decodeShare("こんにちは", quests));
const bad = decodeShare('KARITOMO1 {"name":"<b>x</b>","charms":[{"skills":{"匠":"9","痛撃":2},"slots":99}],"sets":[{"pieces":[1,2]}]}', quests);
assert.deepEqual(bad.charms, [{ skills: { 痛撃: 2 }, slots: 3 }]);
assert.deepEqual(bad.sets, []);
// item mysets, downloaded event quests, and a myset's weapon/style/charm name survive the round trip
const st2 = { ...state, sets: [{ ...state.sets[0], weapon: "デイズアイ", style: "ストライカー", charm: { name: "城塞の護石", skills: {}, slots: 2 } }],
  itemSets: [{ name: "狩り用1", items: [["回復薬", 10], ["心眼の刃薬", 5]] }], dl: quests.slice(5, 9) };
const d2 = decodeShare(encodeShare(st2, ["sets", "itemSets", "dl"], "C", quests), quests);
assert.deepEqual(d2.sets, st2.sets);
assert.deepEqual(d2.itemSets, st2.itemSets);
assert.deepEqual(d2.dl.sort(), st2.dl);
assert.equal(d2.cleared, undefined);
const bad2 = decodeShare('KARITOMO1 {"itemSets":[{"name":1,"items":[["回復薬",500],[3,1],["x",-2]]},"junk"]}', quests);
assert.deepEqual(bad2.itemSets, [{ name: "セット", items: [["回復薬", 99], ["x", 0]] }]);
// a "needs a check" note on a charm survives, and is cut to a sane length
const d3 = decodeShare(encodeShare({ ...state, charms: [{ skills: { 匠: 2 }, slots: 1, chk: "ぼやけていた" }] }, ["charms"], "D", quests), quests);
assert.deepEqual(d3.charms, [{ skills: { 匠: 2 }, slots: 1, chk: "ぼやけていた" }]);
assert.equal(decodeShare('KARITOMO1 {"charms":[{"skills":{},"slots":1,"chk":"' + "x".repeat(500) + '"}]}', quests).charms[0].chk.length, 60);
console.log("share tests passed");

// shipped presets (data/presets.json) must still decode with the current quest list: the cleared bitset
// shifts if quests.json changes, so rebuild the preset text when this fails.
{
  const fs = await import("node:fs");
  const qids = JSON.parse(fs.readFileSync(new URL("../data/quests.json", import.meta.url), "utf8")).map((q) => q.id);
  for (const p of JSON.parse(fs.readFileSync(new URL("../data/presets.json", import.meta.url), "utf8"))) {
    const d = decodeShare(p.text, qids);
    assert.equal(d.name, p.name);
    assert.ok(d.charms?.length || d.card || d.sets?.length, `preset ${p.name} carries some data`);
  }
}
console.log("share presets ok");

// guild card and item counts survive a round trip; junk inside them is dropped
{
  const card = { title: "ファイナルソード", hr: 12, clears: { 村下位: 302 }, weapons: [1, 16, 5, 0, 0, 0, 385, 1, 0, 1, 0, 6, 765, 11, 114], play: "660:29", passes: 38,
    medals: { pct: 56, count: 74, villages: { ココット: 86 } }, monsters: [["リオレウス", 1540.17, 2070.67, 41], ["ラオシャンロン", null, null, 4], ["リオレイア", 551.85, 780.28, 12, 1]], arena: [["ホロロホルル討伐", ["07'19\"86"]]] };
  const t = encodeShare({ ...state, items: { "5d436": 12 }, itemsChk: "動画から読んだ", card }, ["items", "card"], "C", quests);
  const d = decodeShare(t, quests);
  assert.deepEqual(d.card, card);
  assert.deepEqual(d.items, { "5d436": 12 });
  assert.equal(d.itemsChk, "動画から読んだ");
  const bad = decodeShare('KARITOMO1 {"items":{"<x>":5,"5d436":"9"},"card":{"hr":"x","monsters":[["a","b",3,"c"]]}}', quests);
  assert.deepEqual(bad.items, {});
  assert.deepEqual(bad.card.monsters, [["a", null, 3, 0]]);
  console.log("share card/items ok");
}
