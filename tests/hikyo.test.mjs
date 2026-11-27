// Run: node tests/hikyo.test.mjs — 下位 秘境 items are kept only where 下位 can reach the 秘境.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropUnreachableHikyo } from "../js/unlock.js";
const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const maps = load("maps"), gather = load("gather"), hikyo = load("hikyo"), items = load("items");
const id = Object.keys(items).find((k) => items[k] === "カブレライト鉱石");
const low = (map, no) => maps.find((m) => m.name === map).areas.find((a) => a.no === no).items["下位"].map(([i]) => i);
assert.ok(low("古代林", 8).includes(id), "source data has it before the filter");
dropUnreachableHikyo(maps, gather, hikyo);
assert.ok(!low("古代林", 8).includes(id), "古代林 下位: 秘境 only, removed");
assert.ok(low("遺群嶺", 7).includes(id), "遺群嶺 area 7: a normal spot also has it, so it stays");
const novaId = Object.keys(items).find((k) => items[k] === "ノヴァクリスタル");
assert.ok(!low("遺群嶺", 7).includes(novaId), "遺群嶺 下位: ノヴァクリスタル was 秘境 only");
assert.ok(low("渓流", 3).includes(id), "渓流 下位 reaches the 秘境");
assert.equal(low("雪山", 9).length, 0, "雪山 area 9 is the 秘境 itself: nothing in 下位");
assert.ok(!low("原生林", 5).includes(novaId), "原生林 下位: 秘境 crystals removed");
console.log("hikyo tests passed");
